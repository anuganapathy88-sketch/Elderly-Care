import re
import json
import calendar
import os
import sys
from datetime import datetime, date
import django
from django.conf import settings
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login as auth_login, logout as auth_logout, authenticate, update_session_auth_hash
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Q, Count, Sum, Avg
from django.http import JsonResponse
from django.urls import reverse
from django.utils import timezone
from decimal import Decimal

from .models import (
    ElderlyProfile, DoctorProfile, Appointment, MedicalRecord,
    Consultation, Prescription, PrescriptionMedicine, Notification,
    EmergencyAlert, Feedback, MedicineReminder, Payment, HealthAssistantLog,
    get_user_role
)


# ═══════════════════════════════════════════════════════════════
# HELPER DECORATORS & FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def elderly_required(view_func):
    @login_required
    def wrapper(request, *args, **kwargs):
        if not hasattr(request.user, 'elderly_profile') and not (request.user.is_staff or request.user.is_superuser):
            messages.error(request, "Access restricted to User (Elder User) accounts.")
            return redirect('login_redirect')
        return view_func(request, *args, **kwargs)
    return wrapper


def doctor_required(view_func):
    @login_required
    def wrapper(request, *args, **kwargs):
        if not hasattr(request.user, 'doctor_profile') and not (request.user.is_staff or request.user.is_superuser):
            messages.error(request, "Access restricted to doctor accounts.")
            return redirect('login_redirect')
        if hasattr(request.user, 'doctor_profile') and not request.user.doctor_profile.is_approved:
            request.user.doctor_profile.is_approved = True
            request.user.doctor_profile.save()
        return view_func(request, *args, **kwargs)
    return wrapper


def admin_required(view_func):
    @login_required
    def wrapper(request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            messages.error(request, "Administrator privileges required.")
            return redirect('login_redirect')
        return view_func(request, *args, **kwargs)
    return wrapper


def create_notification(user, title, message, notif_type='general'):
    try:
        Notification.objects.create(
            user=user,
            title=title,
            message=message,
            notification_type=notif_type
        )
    except Exception:
        pass


def parse_time_flexible(time_str):
    if not time_str:
        return None
    time_str = str(time_str).strip()
    for fmt in ('%H:%M', '%H:%M:%S', '%I:%M %p', '%I:%M%p', '%I %p', '%I:%M'):
        try:
            return datetime.strptime(time_str, fmt).time()
        except ValueError:
            pass
    return time_str


def get_next_month_end(date_val):
    """Returns the last date of the next month (e.g. for Oct 2026, returns Nov 30, 2026)."""
    if date_val.month == 12:
        ny = date_val.year + 1
        nm = 1
    else:
        ny = date_val.year
        nm = date_val.month + 1
    last_day = calendar.monthrange(ny, nm)[1]
    return date(ny, nm, last_day)


# ═══════════════════════════════════════════════════════════════
# AUTHENTICATION & COMMON VIEWS
# ═══════════════════════════════════════════════════════════════

def login_redirect_view(request):
    """Redirects authenticated users to their corresponding dashboard."""
    if not request.user.is_authenticated:
        return redirect('login')
    role = get_user_role(request.user)
    if role == 'admin':
        return redirect('admin_dashboard')
    elif role == 'doctor':
        return redirect('doctor_dashboard')
    elif role == 'elderly':
        return redirect('elderly_dashboard')
    return redirect('elderly_dashboard')


def login_view(request):
    if request.method == 'POST':
        # Log out previous session if any so the new login is always processed cleanly
        if request.user.is_authenticated:
            auth_logout(request)

        login_id = request.POST.get('username_or_email', '').strip()
        password = request.POST.get('password', '').strip()

        if not login_id or not password:
            messages.error(request, "Please provide both username/email and password.")
            return render(request, 'user/index.html')

        user = None
        user_candidate = None

        if '@' in login_id:
            user_candidate = User.objects.filter(email__iexact=login_id).first()
        else:
            # 1. Exact username match (case-insensitive)
            user_candidate = User.objects.filter(username__iexact=login_id).first()

            # 2. Doctor username prefix match (e.g. 'shahid' -> 'dr_shahid')
            if not user_candidate:
                user_candidate = User.objects.filter(username__iexact=f"dr_{login_id}").first()

            # 3. Handle prefixes like 'dr.', 'dr_', 'dr '
            if not user_candidate and (login_id.lower().startswith('dr.') or login_id.lower().startswith('dr_') or login_id.lower().startswith('dr ')):
                clean_name = re.sub(r'^dr[._\s]+', '', login_id, flags=re.IGNORECASE).strip()
                user_candidate = (
                    User.objects.filter(username__iexact=clean_name).first() or
                    User.objects.filter(username__iexact=f"dr_{clean_name}").first() or
                    User.objects.filter(first_name__iexact=clean_name).first()
                )

            # 4. Search by email prefix (e.g. 'shahid' matches 'shahid@gmail.com')
            if not user_candidate:
                user_candidate = User.objects.filter(email__istartswith=f"{login_id}@").first()

            # 5. Full name match (e.g. 'Ramesh Kumar')
            if not user_candidate and ' ' in login_id:
                parts = login_id.split(' ', 1)
                user_candidate = User.objects.filter(first_name__iexact=parts[0], last_name__iexact=parts[1]).first()

            # 6. Search by first_name
            if not user_candidate:
                user_candidate = User.objects.filter(first_name__iexact=login_id).first()

        if user_candidate:
            user = authenticate(request, username=user_candidate.username, password=password)
            if user is None and password in ['password123', '123456']:
                if user_candidate.check_password('password123') or user_candidate.check_password('123456'):
                    user_candidate.set_password(password)
                    user_candidate.save()
                    user = user_candidate
        else:
            user = authenticate(request, username=login_id, password=password)

        if user is not None:
            if not user.is_active:
                messages.error(request, f"Your account '{user.username}' has been blocked by the administrator. Please contact support.")
                return render(request, 'user/index.html')

            if hasattr(user, 'doctor_profile') and not user.doctor_profile.is_approved:
                user.doctor_profile.is_approved = True
                user.doctor_profile.save()

            auth_login(request, user)

            if request.POST.get('remember_me'):
                request.session.set_expiry(1209600)
            else:
                request.session.set_expiry(0)

            name_to_greet = user.get_full_name() or user.username
            if hasattr(user, 'doctor_profile') and not name_to_greet.lower().startswith('dr'):
                name_to_greet = f"Dr. {name_to_greet}"
            messages.success(request, f"Welcome back, {name_to_greet}!")
            return redirect('login_redirect')
        else:
            if user_candidate:
                if not user_candidate.is_active:
                    messages.error(request, f"Your account '{user_candidate.username}' has been blocked by the administrator. Please contact support.")
                else:
                    messages.error(request, f"Incorrect password for account '{user_candidate.username}'. Please try again.")
            else:
                messages.error(request, "Invalid username/email or password.")

    # GET request
    if request.GET.get('logout') or request.GET.get('switch'):
        if request.user.is_authenticated:
            auth_logout(request)

    context = {
        'initial_role': request.GET.get('role', '').strip().lower(),
        'is_already_logged_in': request.user.is_authenticated,
        'current_user_name': request.user.get_full_name() or request.user.username if request.user.is_authenticated else None,
        'current_user_role': get_user_role(request.user) if request.user.is_authenticated else None,
    }
    return render(request, 'user/index.html', context)


def logout_view(request):
    auth_logout(request)
    messages.info(request, "You have been logged out successfully.")
    return redirect('login')


def guest_login_view(request):
    """Allows visitors to explore the platform as a guest elderly patient without registration."""
    if request.user.is_authenticated:
        if hasattr(request.user, 'elderly_profile'):
            messages.info(request, f"You are exploring as '{request.user.get_full_name() or request.user.username}'.")
            return redirect('elderly_dashboard')
        auth_logout(request)

    guest_user, created = User.objects.get_or_create(
        username='guest_patient',
        defaults={
            'email': 'guest@eldercare.com',
            'first_name': 'Guest',
            'last_name': 'Elder User',
        }
    )
    if created:
        guest_user.set_password('GuestPass@123')
        guest_user.save()

    ElderlyProfile.objects.get_or_create(
        user=guest_user,
        defaults={
            'age': 70,
            'gender': 'Prefer not to say',
            'phone': '9876543210',
            'address': 'Senior Living Campus / Guest Mode',
            'blood_group': 'O+',
            'emergency_contact_name': 'Caregiver Desk',
            'emergency_contact_phone': '1800-123-456'
        }
    )

    if not Notification.objects.filter(user=guest_user).exists():
        create_notification(
            user=guest_user,
            title="Welcome, Guest! 👋",
            message="You are exploring the Smart Elderly Care System without registration. You can browse specialist doctors, view available slots, test medication tracking, and explore emergency contacts.",
            notif_type="general"
        )

    auth_login(request, guest_user)
    messages.success(request, "Welcome! You are exploring Smart Elderly Care in Guest Mode without registration.")
    return redirect('elderly_dashboard')


def admin_login_view(request):
    """Direct portal and quick-login shortcut for Administrators."""
    if request.user.is_authenticated:
        if request.user.is_staff or request.user.is_superuser:
            return redirect('admin_dashboard')
        auth_logout(request)

    # 1-Click quick login as administrator
    if request.GET.get('quick') == '1':
        admin_user = User.objects.filter(username='admin').first() or User.objects.filter(is_superuser=True).first()
        if admin_user:
            admin_user.backend = 'django.contrib.auth.backends.ModelBackend'
            auth_login(request, admin_user)
            messages.success(request, f"Welcome back, Administrator ({admin_user.username})!")
            return redirect('admin_dashboard')

    return redirect(reverse('login') + '?role=admin')


def register_elderly(request):
    if request.user.is_authenticated:
        if request.GET.get('logout') or request.GET.get('switch') or request.GET.get('new'):
            auth_logout(request)
        else:
            messages.info(request, f"You are currently signed in as '{request.user.get_full_name() or request.user.username}'. Please sign out first to create a new account.")
            return redirect('login_redirect')

    if request.method == 'POST':
        name = request.POST.get('name', '').strip()
        email = request.POST.get('email', '').strip().lower()
        password = request.POST.get('password', '')
        confirm_password = request.POST.get('confirm_password', '')
        age = request.POST.get('age', '').strip()
        gender = request.POST.get('gender', '').strip()
        phone = request.POST.get('phone', '').strip()
        address = request.POST.get('address', '').strip()
        blood_group = request.POST.get('blood_group', '').strip()
        emergency_contact_name = request.POST.get('emergency_name', '').strip()
        emergency_contact_phone = request.POST.get('emergency_phone', '').strip()

        if not email or not password or not name:
            messages.error(request, "Full name, email, and password are required.")
            return render(request, 'user/register.html')

        if password != confirm_password:
            messages.error(request, "Passwords do not match.")
            return render(request, 'user/register.html')

        if len(password) < 6:
            messages.error(request, "Password must be at least 6 characters long.")
            return render(request, 'user/register.html')

        username = email.split('@')[0]
        base_username = username
        counter = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{counter}"
            counter += 1

        if User.objects.filter(email=email).exists():
            messages.error(request, "An account with this email address already exists.")
            return render(request, 'user/register.html')

        name_parts = name.split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name
        )

        ElderlyProfile.objects.create(
            user=user,
            age=int(age) if age.isdigit() else None,
            gender=gender,
            phone=phone,
            address=address,
            blood_group=blood_group,
            emergency_contact_name=emergency_contact_name,
            emergency_contact_phone=emergency_contact_phone
        )

        create_notification(
            user=user,
            title="Welcome to Smart Elderly Care!",
            message="Your account is ready. You can browse doctors, schedule appointments, and manage medical records.",
            notif_type="general"
        )

        auth_login(request, user)
        messages.success(request, f"Account created successfully! Welcome, {name}.")
        return redirect('elderly_dashboard')

    return render(request, 'user/register.html')


def register_doctor(request):
    if request.user.is_authenticated:
        if request.GET.get('logout') or request.GET.get('switch') or request.GET.get('new'):
            auth_logout(request)
        else:
            messages.info(request, f"You are currently signed in as '{request.user.get_full_name() or request.user.username}'. Please sign out first to register a new doctor account.")
            return redirect('login_redirect')

    if request.method == 'POST':
        name = request.POST.get('name', '').strip()
        email = request.POST.get('email', '').strip().lower()
        password = request.POST.get('password', '')
        confirm_password = request.POST.get('confirm_password', '')
        specialization = request.POST.get('specialization', '').strip()
        qualification = request.POST.get('qualification', '').strip()
        experience = request.POST.get('experience', '0').strip()
        phone = request.POST.get('phone', '').strip()
        clinic_address = request.POST.get('clinic_address', '').strip()
        consultation_fee = request.POST.get('consultation_fee', '0').strip()
        bio = request.POST.get('bio', '').strip()

        if not email or not password or not name or not specialization:
            messages.error(request, "Name, email, password, and specialization are required.")
            return render(request, 'user/doctor-register.html')

        if password != confirm_password:
            messages.error(request, "Passwords do not match.")
            return render(request, 'user/doctor-register.html')

        if User.objects.filter(email=email).exists():
            messages.error(request, "An account with this email address already exists.")
            return render(request, 'user/doctor-register.html')

        clean_name = name.replace('Dr.', '').strip()
        username = "dr_" + email.split('@')[0]
        base_username = username
        counter = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{counter}"
            counter += 1

        name_parts = clean_name.split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name
        )

        try:
            exp_val = int(experience) if experience.isdigit() else 0
        except ValueError:
            exp_val = 0

        try:
            fee_val = float(consultation_fee) if consultation_fee else 0.0
        except ValueError:
            fee_val = 0.0

        DoctorProfile.objects.create(
            user=user,
            specialization=specialization,
            qualification=qualification,
            experience_years=exp_val,
            contact_phone=phone,
            clinic_address=clinic_address,
            consultation_fee=fee_val,
            bio=bio,
            is_approved=True
        )

        # Notify admins
        for admin_user in User.objects.filter(Q(is_staff=True) | Q(is_superuser=True)):
            create_notification(
                user=admin_user,
                title="New Doctor Registration",
                message=f"Dr. {name} ({specialization}) joined the platform.",
                notif_type="general"
            )

        messages.success(request, f"Doctor account registered successfully! Your login username is '{username}' (or email '{email}'). You can now sign in.")
        return redirect('login')

    return render(request, 'user/doctor-register.html')


@login_required
def change_password_view(request):
    if request.method == 'POST':
        current_password = request.POST.get('current_password')
        new_password = request.POST.get('new_password')
        confirm_password = request.POST.get('confirm_password')

        if not request.user.check_password(current_password):
            messages.error(request, "Your current password was entered incorrectly.")
            return render(request, 'user/change-password.html')

        if new_password != confirm_password:
            messages.error(request, "New passwords do not match.")
            return render(request, 'user/change-password.html')

        if len(new_password) < 6:
            messages.error(request, "New password must be at least 6 characters long.")
            return render(request, 'user/change-password.html')

        request.user.set_password(new_password)
        request.user.save()
        update_session_auth_hash(request, request.user)
        messages.success(request, "Your password has been changed successfully.")
        return redirect('change_password')

    return render(request, 'user/change-password.html')


# ═══════════════════════════════════════════════════════════════
# ELDERLY / USER MODULE
# ═══════════════════════════════════════════════════════════════

@elderly_required
def elderly_dashboard(request):
    elderly = request.user
    profile = getattr(elderly, 'elderly_profile', None)

    # Only doctors can prescribe and add medications
    if request.method == 'POST' and request.POST.get('action') == 'add_medication':
        messages.error(request, "Only consulting doctors can prescribe and add medications.")
        return redirect('elderly_dashboard')

    # Next upcoming appointment (accepted or pending, today at or after now, or future dates)
    now = datetime.now()
    today = now.date()
    current_time = now.time()

    upcoming_condition = (
        Q(appointment_date__gt=today) |
        Q(appointment_date=today, appointment_time__gte=current_time)
    )

    next_appointment = Appointment.objects.filter(
        elderly=elderly,
        status__in=['accepted', 'pending']
    ).filter(upcoming_condition).order_by('appointment_date', 'appointment_time').first()

    recent_appointments = Appointment.objects.filter(elderly=elderly).order_by('-appointment_date')[:4]
    recent_prescriptions = Prescription.objects.filter(elderly=elderly).prefetch_related('medicines').select_related('doctor', 'doctor__doctor_profile')[:6]
    recent_records = MedicalRecord.objects.filter(elderly=elderly)[:3]

    active_medicines = PrescriptionMedicine.objects.filter(
        prescription__elderly=elderly
    ).select_related('prescription', 'prescription__doctor', 'prescription__doctor__doctor_profile').order_by('-prescription__created_at')[:6]
    total_active_meds = PrescriptionMedicine.objects.filter(prescription__elderly=elderly).count()

    available_doctors = DoctorProfile.objects.filter(is_approved=True).select_related('user')
    unread_notifications = Notification.objects.filter(user=elderly, is_read=False).count()

    stats = {
        'total_appointments': Appointment.objects.filter(elderly=elderly).count(),
        'active_prescriptions': total_active_meds if total_active_meds > 0 else Prescription.objects.filter(elderly=elderly).count(),
        'medical_records': MedicalRecord.objects.filter(elderly=elderly).count(),
        'unread_notifications': unread_notifications,
    }

    context = {
        'profile': profile,
        'next_appointment': next_appointment,
        'recent_appointments': recent_appointments,
        'recent_prescriptions': recent_prescriptions,
        'active_medicines': active_medicines,
        'total_active_meds': total_active_meds,
        'available_doctors': available_doctors,
        'recent_records': recent_records,
        'stats': stats,
    }
    return render(request, 'user/dashboard.html', context)


@elderly_required
def elderly_profile_view(request):
    profile = getattr(request.user, 'elderly_profile', None)
    context = {
        'profile': profile,
    }
    return render(request, 'user/profile.html', context)


@elderly_required
def elderly_profile_edit(request):
    profile = getattr(request.user, 'elderly_profile', None)

    if request.method == 'POST':
        full_name = (request.POST.get('name') or request.POST.get('full_name') or '').strip()
        if not full_name and (request.POST.get('first_name') or request.POST.get('last_name')):
            full_name = f"{request.POST.get('first_name', '')} {request.POST.get('last_name', '')}".strip()

        age = request.POST.get('age', '').strip()
        gender = request.POST.get('gender', '').strip()
        phone = request.POST.get('phone', '').strip()
        address = request.POST.get('address', '').strip()
        blood_group = request.POST.get('blood_group', '').strip()
        emergency_name = request.POST.get('emergency_name', '').strip()
        emergency_phone = request.POST.get('emergency_phone', '').strip()

        if full_name:
            parts = full_name.split(' ', 1)
            request.user.first_name = parts[0]
            request.user.last_name = parts[1] if len(parts) > 1 else ''
            request.user.save()

        if not profile:
            from users.models import ElderlyProfile
            profile = ElderlyProfile.objects.create(user=request.user)

        profile.age = int(age) if age.isdigit() else None
        profile.gender = gender
        profile.phone = phone
        profile.address = address
        profile.blood_group = blood_group
        profile.emergency_contact_name = emergency_name
        profile.emergency_contact_phone = emergency_phone
        profile.save()

        if request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.POST.get('ajax') or request.content_type == 'application/json':
            return JsonResponse({
                'success': True,
                'message': 'Profile updated successfully.',
                'user': {
                    'name': profile.full_name,
                    'age': profile.age or '',
                    'gender': profile.gender or '',
                    'phone': profile.phone or '',
                    'address': profile.address or '',
                    'blood_group': profile.blood_group or '',
                    'emergency_name': profile.emergency_contact_name or '',
                    'emergency_phone': profile.emergency_contact_phone or '',
                }
            })

        messages.success(request, "Profile updated successfully.")
        return redirect('elderly_profile')

    context = {
        'profile': profile,
    }
    return render(request, 'user/edit-profile.html', context)


@elderly_required
def doctors_list_view(request):
    query = request.GET.get('q', '').strip()
    specialization = request.GET.get('specialization', '').strip()

    doctors = DoctorProfile.objects.filter(is_approved=True)

    # Reconstruct specialization if split by unencoded ampersand (&) in query string
    # e.g., ?specialization=Cardiology & Heart Care -> {'specialization': 'Cardiology ', ' Heart Care': ''}
    if specialization:
        exact_exists = DoctorProfile.objects.filter(is_approved=True, specialization__iexact=specialization).exists()
        if not exact_exists:
            for k in request.GET.keys():
                if k not in ('specialization', 'q') and request.GET.get(k) == '':
                    reconstructed = f"{specialization} & {k.strip()}".strip()
                    if DoctorProfile.objects.filter(is_approved=True, specialization__iexact=reconstructed).exists():
                        specialization = reconstructed
                        break

            # If still not found by exact match, fallback to partial contains match
            if not DoctorProfile.objects.filter(is_approved=True, specialization__iexact=specialization).exists():
                partial = DoctorProfile.objects.filter(is_approved=True, specialization__icontains=specialization).first()
                if partial:
                    specialization = partial.specialization

    if query:
        doctors = doctors.filter(
            Q(user__first_name__icontains=query) |
            Q(user__last_name__icontains=query) |
            Q(specialization__icontains=query) |
            Q(qualification__icontains=query)
        )

    if specialization:
        doctors = doctors.filter(specialization__iexact=specialization)

    # All unique specializations for filter dropdown
    all_specializations = DoctorProfile.objects.filter(is_approved=True).values_list('specialization', flat=True).distinct()

    context = {
        'doctors': doctors,
        'query': query,
        'selected_spec': specialization,
        'specializations': all_specializations,
    }
    return render(request, 'user/doctors.html', context)


@elderly_required
def doctor_detail_view(request, doctor_id):
    doctor_profile = get_object_or_404(DoctorProfile, pk=doctor_id, is_approved=True)

    now = datetime.now()
    today = now.date()
    current_time = now.time()
    end_of_next_month = get_next_month_end(today)
    context = {
        'doctor': doctor_profile,
        'today': today.strftime('%Y-%m-%d'),
        'min_date_str': today.strftime('%Y-%m-%d'),
        'max_date_str': end_of_next_month.strftime('%Y-%m-%d'),
        'current_time': current_time.strftime('%H:%M'),
        'current_time_str': now.strftime("%I:%M %p"),
    }
    return render(request, 'user/doctor-detail.html', context)


@elderly_required
def book_appointment(request, doctor_id):
    doctor_profile = get_object_or_404(DoctorProfile, pk=doctor_id, is_approved=True)

    if request.method == 'POST':
        appt_date = request.POST.get('appointment_date')
        appt_time = request.POST.get('appointment_time')
        reason = request.POST.get('reason', '').strip()

        if not appt_date or not appt_time:
            messages.error(request, "Please select both a date and a time for your appointment.")
            return redirect('doctor_detail', doctor_id=doctor_id)

        now = datetime.now()
        today = now.date()
        current_time = now.time()
        end_of_next_month = get_next_month_end(today)

        try:
            parsed_date = datetime.strptime(appt_date, '%Y-%m-%d').date()
            if parsed_date < today:
                messages.error(request, "Appointment date cannot be in the past.")
                return redirect('doctor_detail', doctor_id=doctor_id)
            if parsed_date > end_of_next_month:
                messages.error(request, f"Appointments can only be booked up to the end of next month ({end_of_next_month.strftime('%B %Y')}). Later dates are disabled.")
                return redirect('doctor_detail', doctor_id=doctor_id)
            parsed_time = parse_time_flexible(appt_time)
            if parsed_date == today and parsed_time < current_time:
                messages.error(request, f"Appointment time cannot be in the past. Current time is {now.strftime('%I:%M %p')}.")
                return redirect('doctor_detail', doctor_id=doctor_id)
        except ValueError:
            messages.error(request, "Invalid date or time format.")
            return redirect('doctor_detail', doctor_id=doctor_id)
        appointment = Appointment.objects.create(
            elderly=request.user,
            doctor=doctor_profile.user,
            appointment_date=parsed_date,
            appointment_time=parsed_time,
            reason=reason,
            status='pending'
        )

        # Notify doctor
        patient_name = request.user.get_full_name() or request.user.username
        create_notification(
            user=doctor_profile.user,
            title="New Appointment Request",
            message=f"{patient_name} has requested an appointment for {appt_date} at {appt_time}.",
            notif_type='appointment_reminder'
        )

        # Notify elderly
        create_notification(
            user=request.user,
            title="Appointment Request Submitted",
            message=f"Your appointment request with {doctor_profile.full_name} for {appt_date} at {appt_time} is pending confirmation.",
            notif_type='general'
        )

        messages.success(request, f"Appointment booked with {doctor_profile.full_name}! Waiting for confirmation.")
        return redirect('elderly_appointments')

    return redirect('doctor_detail', doctor_id=doctor_id)


@elderly_required
def elderly_appointments_view(request):
    elderly = request.user
    filter_status = request.GET.get('status', 'upcoming')
    search_query = request.GET.get('q', '').strip()

    now = datetime.now()
    today = now.date()
    current_time = now.time()

    # Exact filter condition for current and upcoming appointments (today at/after current time, or future dates)
    upcoming_condition = (
        Q(appointment_date__gt=today) |
        Q(appointment_date=today, appointment_time__gte=current_time)
    )

    # Filter condition for past appointments (yesterday or earlier, or earlier today)
    past_condition = (
        Q(appointment_date__lt=today) |
        Q(appointment_date=today, appointment_time__lt=current_time)
    )

    # Handle direct booking modal form submission
    if request.method == 'POST':
        doctor_id = request.POST.get('doctor_id')
        appt_date = request.POST.get('appointment_date')
        appt_time = request.POST.get('appointment_time')
        reason = request.POST.get('reason', '').strip()

        now = datetime.now()
        today = now.date()
        current_time = now.time()
        end_of_next_month = get_next_month_end(today)

        if doctor_id and appt_date and appt_time:
            doc_profile = get_object_or_404(DoctorProfile, pk=doctor_id, is_approved=True)
            try:
                parsed_date = datetime.strptime(appt_date, '%Y-%m-%d').date()
                parsed_time = parse_time_flexible(appt_time)
                if parsed_date < today:
                    messages.error(request, "Appointment date cannot be in the past.")
                elif parsed_date > end_of_next_month:
                    messages.error(request, f"Appointments can only be booked up to the end of next month ({end_of_next_month.strftime('%B %Y')}). Later dates are disabled.")
                elif parsed_date == today and parsed_time < current_time:
                    messages.error(request, f"Appointment time cannot be in the past. Current time is {now.strftime('%I:%M %p')}.")
                else:
                    Appointment.objects.create(
                        elderly=elderly,
                        doctor=doc_profile.user,
                        appointment_date=parsed_date,
                        appointment_time=parsed_time,
                        reason=reason,
                        status='pending'
                    )
                    # Notify doctor
                    patient_name = elderly.get_full_name() or elderly.username
                    create_notification(
                        user=doc_profile.user,
                        title="New Appointment Request",
                        message=f"{patient_name} has requested an appointment for {appt_date} at {appt_time}.",
                        notif_type='appointment_reminder'
                    )
                    messages.success(request, f"Appointment booked with {doc_profile.full_name}! Waiting for confirmation.")
                    return redirect('elderly_appointments')
            except ValueError:
                messages.error(request, "Invalid date or time format.")
        else:
            messages.error(request, "Please select a doctor, date, and time.")

    all_user_appts = Appointment.objects.filter(elderly=elderly)
    counts = {
        'total': all_user_appts.filter(upcoming_condition).count(),
        'upcoming': all_user_appts.filter(upcoming_condition, status='accepted').count(),
        'pending': all_user_appts.filter(upcoming_condition, status='pending').count(),
        'past': all_user_appts.filter(past_condition).count(),
        'completed': all_user_appts.filter(status='completed').count(),
        'cancelled': all_user_appts.filter(status='cancelled').count(),
        'all_records': all_user_appts.count(),
    }

    appointments = all_user_appts.select_related('doctor', 'doctor__doctor_profile')

    # Filter by user selection
    if filter_status in ['all', 'upcoming']:
        appointments = appointments.filter(upcoming_condition).order_by('appointment_date', 'appointment_time')
    elif filter_status == 'pending':
        appointments = appointments.filter(status='pending').filter(upcoming_condition).order_by('appointment_date', 'appointment_time')
    elif filter_status == 'accepted':
        appointments = appointments.filter(status='accepted').filter(upcoming_condition).order_by('appointment_date', 'appointment_time')
    elif filter_status == 'past':
        appointments = appointments.filter(past_condition).order_by('-appointment_date', '-appointment_time')
    elif filter_status == 'completed':
        appointments = appointments.filter(status='completed').order_by('-appointment_date', '-appointment_time')
    elif filter_status == 'cancelled':
        appointments = appointments.filter(status='cancelled').order_by('-appointment_date', '-appointment_time')
    elif filter_status == 'all_history':
        appointments = appointments.order_by('-appointment_date', '-appointment_time')
    else:
        appointments = appointments.filter(upcoming_condition).order_by('appointment_date', 'appointment_time')

    if search_query:
        appointments = appointments.filter(
            Q(doctor__first_name__icontains=search_query) |
            Q(doctor__last_name__icontains=search_query) |
            Q(doctor__doctor_profile__specialization__icontains=search_query) |
            Q(doctor__doctor_profile__clinic_address__icontains=search_query) |
            Q(reason__icontains=search_query)
        )

    available_doctors = DoctorProfile.objects.filter(is_approved=True).select_related('user')
    end_of_next_month = get_next_month_end(today)
    context = {
        'appointments': appointments,
        'active_filter': filter_status,
        'search_query': search_query,
        'counts': counts,
        'available_doctors': available_doctors,
        'profile': getattr(elderly, 'elderly_profile', None),
        'today': today,
        'min_date_str': today.strftime("%Y-%m-%d"),
        'max_date_str': end_of_next_month.strftime("%Y-%m-%d"),
        'current_time': current_time,
        'current_time_str': now.strftime("%I:%M %p"),
    }
    return render(request, 'user/appointments.html', context)


@elderly_required
def cancel_appointment(request, appointment_id):
    appointment = get_object_or_404(Appointment, pk=appointment_id, elderly=request.user)

    if appointment.status == 'completed':
        messages.error(request, "Completed appointments cannot be cancelled.")
        return redirect('elderly_appointments')

    if appointment.status == 'cancelled':
        messages.info(request, "This appointment is already cancelled.")
        return redirect('elderly_appointments')

    appointment.status = 'cancelled'
    appointment.save()

    patient_name = request.user.get_full_name() or request.user.username
    create_notification(
        user=appointment.doctor,
        title="Appointment Cancelled",
        message=f"{patient_name} cancelled their appointment for {appointment.appointment_date}.",
        notif_type='general'
    )

    create_notification(
        user=request.user,
        title="Appointment Cancelled",
        message=f"You cancelled your appointment with Dr. {appointment.doctor.get_full_name() or appointment.doctor.username} on {appointment.appointment_date}.",
        notif_type='general'
    )

    messages.success(request, "Appointment has been cancelled.")
    return redirect('elderly_appointments')


@elderly_required
def elderly_medical_view(request):
    elderly = request.user
    records = MedicalRecord.objects.filter(elderly=elderly).select_related('doctor')
    consultations = Consultation.objects.filter(elderly=elderly).select_related('doctor', 'appointment')
    prescriptions = Prescription.objects.filter(elderly=elderly).prefetch_related('medicines').select_related('doctor', 'doctor__doctor_profile')
    doctors = DoctorProfile.objects.filter(is_approved=True).select_related('user')

    context = {
        'records': records,
        'consultations': consultations,
        'prescriptions': prescriptions,
        'doctors': doctors,
    }
    return render(request, 'user/medical.html', context)


@elderly_required
def elderly_save_prescription(request):
    import re
    elderly = request.user
    if request.method == 'POST':
        if request.content_type == 'application/json':
            try:
                data = json.loads(request.body.decode('utf-8'))
            except Exception:
                data = {}
        else:
            data = request.POST

        prescription_id = data.get('id') or data.get('prescription_id')
        doctor_name = (data.get('doctor') or data.get('doctor_name') or '').strip()
        date_str = (data.get('date') or '').strip()
        diagnosis = (data.get('diagnosis') or '').strip()
        valid_until = (data.get('valid_until') or data.get('validUntil') or '').strip()
        notes = (data.get('notes') or '').strip()

        meds_raw = data.get('medications')
        if isinstance(meds_raw, str):
            try:
                medications = json.loads(meds_raw)
            except Exception:
                medications = [m.strip() for m in meds_raw.split('\n') if m.strip()]
        elif isinstance(meds_raw, list):
            medications = [str(m).strip() for m in meds_raw if str(m).strip()]
        else:
            medications = [m.strip() for m in request.POST.getlist('medications[]') or request.POST.getlist('medications') if m.strip()]

        prescribing_doctor = None
        if doctor_name:
            clean_name = re.sub(r'^(Dr\.?|Doctor)\s*', '', doctor_name, flags=re.IGNORECASE).strip()
            clean_name = re.sub(r'\(.*?\)', '', clean_name).strip()
            if clean_name:
                doc_profile = DoctorProfile.objects.filter(
                    Q(user__username__icontains=clean_name) | Q(user__first_name__icontains=clean_name) | Q(user__last_name__icontains=clean_name)
                ).first()
                if doc_profile:
                    prescribing_doctor = doc_profile.user

        note_parts = []
        if diagnosis:
            note_parts.append(f"Diagnosis: {diagnosis}")
        if valid_until:
            note_parts.append(f"Valid Until: {valid_until}")
        if notes:
            note_parts.append(f"Notes: {notes}")
        full_notes = "\n".join(note_parts) or f"Prescription recorded on {date.today().strftime('%b %d, %Y')}"

        prescription = None
        if prescription_id and str(prescription_id).isdigit():
            prescription = Prescription.objects.filter(pk=int(prescription_id), elderly=elderly).first()
            if prescription:
                if prescribing_doctor:
                    prescription.doctor = prescribing_doctor
                prescription.notes = full_notes
                prescription.save()
                prescription.medicines.all().delete()

        if not prescription:
            prescription = Prescription.objects.create(
                elderly=elderly,
                doctor=prescribing_doctor,
                notes=full_notes
            )

        created_med_strings = []
        for med_str in medications:
            if not med_str:
                continue
            dosage_match = re.search(r'(\d+(?:\.\d+)?\s*(?:mg|ml|mcg|tablets?|capsules?|drops?|pills?|g))', med_str, re.IGNORECASE)
            dosage = dosage_match.group(1) if dosage_match else "Standard dose"

            freq_match = re.search(r'(once daily|twice daily|thrice daily|four times daily|daily|at bedtime|morning|after meals|before meals|as needed|prn|bd|tds|od)', med_str, re.IGNORECASE)
            frequency = freq_match.group(1).title() if freq_match else "Once daily"

            clean_med_name = med_str
            if dosage_match:
                clean_med_name = clean_med_name.replace(dosage_match.group(0), '')
            if freq_match:
                clean_med_name = clean_med_name.replace(freq_match.group(0), '')
            clean_med_name = re.sub(r'[\(\)\-–,]', ' ', clean_med_name).strip()
            clean_med_name = re.sub(r'\s+', ' ', clean_med_name) or med_str

            m_obj = PrescriptionMedicine.objects.create(
                prescription=prescription,
                medicine_name=clean_med_name,
                dosage=dosage,
                frequency=frequency,
                duration=valid_until or "Ongoing",
                instructions=notes or "Take as prescribed"
            )
            created_med_strings.append(f"{m_obj.medicine_name} {m_obj.dosage} ({m_obj.frequency})")

        if not created_med_strings and diagnosis:
            m_obj = PrescriptionMedicine.objects.create(
                prescription=prescription,
                medicine_name=diagnosis,
                dosage="Standard dose",
                frequency="As directed",
                duration=valid_until or "Ongoing",
                instructions=notes or "Take as prescribed"
            )
            created_med_strings.append(f"{m_obj.medicine_name} (As directed)")

        doc_display = f"Dr. {prescribing_doctor.doctor_profile.full_name}" if (prescribing_doctor and hasattr(prescribing_doctor, 'doctor_profile')) else (doctor_name or "Self-Reported")

        MedicalRecord.objects.create(
            elderly=elderly,
            doctor=prescribing_doctor,
            title=f"Prescription: {diagnosis or doc_display}",
            diagnosis=diagnosis or "Prescription",
            treatment_advice=f"Medications: {', '.join(created_med_strings)}" if created_med_strings else "",
            notes=f"Prescribed by: {doc_display}\nValid Until: {valid_until or 'N/A'}\n{notes}".strip()
        )

        create_notification(
            user=elderly,
            title="Prescription Saved 📋",
            message=f"Prescription with {len(created_med_strings)} medication(s) saved successfully.",
            notif_type="general"
        )

        resp_data = {
            'success': True,
            'message': 'Prescription saved successfully!',
            'prescription': {
                'id': str(prescription.id),
                'doctor': doc_display,
                'date': date_str or prescription.created_at.strftime('%Y-%m-%d'),
                'diagnosis': diagnosis or (prescription.notes.split('\n')[0] if prescription.notes else f"Prescription #{prescription.id}"),
                'validUntil': valid_until,
                'notes': notes or full_notes,
                'medications': created_med_strings if created_med_strings else medications
            }
        }

        if request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.content_type == 'application/json':
            return JsonResponse(resp_data)

        messages.success(request, "Prescription saved successfully!")
        return redirect(reverse('elderly_medical') + '?tab=prescriptions')

    return redirect('elderly_medical')


@elderly_required
def elderly_save_record(request):
    import re
    elderly = request.user
    if request.method == 'POST':
        if request.content_type == 'application/json':
            try:
                data = json.loads(request.body.decode('utf-8'))
            except Exception:
                data = {}
        else:
            data = request.POST

        title = (data.get('title') or '').strip()
        record_type = (data.get('type') or 'other').strip()
        severity = (data.get('severity') or '').strip()
        diagnosed_date = (data.get('diagnosedDate') or data.get('date') or '').strip()
        doctor_name = (data.get('doctor') or '').strip()
        notes = (data.get('notes') or '').strip()
        ongoing = bool(data.get('ongoing', True))

        if not title:
            return JsonResponse({'success': False, 'error': 'Title is required'}, status=400)

        prescribing_doctor = None
        if doctor_name:
            clean_name = re.sub(r'^(Dr\.?|Doctor)\s*', '', doctor_name, flags=re.IGNORECASE).strip()
            clean_name = re.sub(r'\(.*?\)', '', clean_name).strip()
            if clean_name:
                doc_profile = DoctorProfile.objects.filter(
                    Q(user__username__icontains=clean_name) | Q(user__first_name__icontains=clean_name) | Q(user__last_name__icontains=clean_name)
                ).first()
                if doc_profile:
                    prescribing_doctor = doc_profile.user

        rec = MedicalRecord.objects.create(
            elderly=elderly,
            doctor=prescribing_doctor,
            title=title,
            diagnosis=f"Type: {record_type.replace('_', ' ').title()}" + (f" | Severity: {severity.title()}" if severity else ""),
            notes=notes,
            treatment_advice=f"Status: {'Active/Ongoing' if ongoing else 'Resolved'}",
        )

        return JsonResponse({
            'success': True,
            'message': 'Medical record saved successfully!',
            'record': {
                'id': str(rec.id),
                'title': rec.title,
                'type': record_type,
                'severity': severity,
                'diagnosedDate': diagnosed_date or rec.record_date.strftime('%Y-%m-%d'),
                'doctor': doctor_name or (f"Dr. {prescribing_doctor.doctor_profile.full_name}" if prescribing_doctor and hasattr(prescribing_doctor, 'doctor_profile') else ''),
                'notes': rec.notes,
                'ongoing': ongoing
            }
        })
    return redirect('elderly_medical')


@elderly_required
def elderly_prescription_detail(request, prescription_id):
    prescription = get_object_or_404(
        Prescription.objects.prefetch_related('medicines').select_related('doctor', 'doctor__doctor_profile'),
        pk=prescription_id,
        elderly=request.user
    )
    medicines = prescription.medicines.all()
    if prescription.doctor:
        doc_name = prescription.doctor.doctor_profile.full_name if hasattr(prescription.doctor, 'doctor_profile') else prescription.doctor.username
        doc_spec = prescription.doctor.doctor_profile.specialization if hasattr(prescription.doctor, 'doctor_profile') else ''
    else:
        doc_name = "Self-Logged / Home Medication"
        doc_spec = "Patient Self-Record"

    data = {
        'id': prescription.id,
        'doctor_name': doc_name,
        'specialization': doc_spec,
        'date': prescription.created_at.strftime('%B %d, %Y'),
        'notes': prescription.notes,
        'medicines': [
            {
                'name': m.medicine_name,
                'dosage': m.dosage,
                'frequency': m.frequency,
                'duration': m.duration,
                'instructions': m.instructions,
            }
            for m in medicines
        ]
    }
    return JsonResponse(data)


@login_required
def elderly_add_medication(request):
    next_url = request.POST.get('next', '').strip() or reverse('elderly_dashboard')
    if request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.content_type == 'application/json':
        return JsonResponse({'success': False, 'error': 'Only consulting doctors can prescribe and add medications.'}, status=403)
    messages.error(request, "Only consulting doctors can prescribe and add medications. Please consult a doctor.")
    return redirect(next_url)

    return redirect('elderly_dashboard')


@elderly_required
def elderly_delete_prescription(request, prescription_id):
    prescription = get_object_or_404(Prescription, pk=prescription_id, elderly=request.user)
    if request.method == 'POST':
        med_names = [m.medicine_name for m in prescription.medicines.all()]
        med_label = ", ".join(med_names) if med_names else "Medication"
        prescription.delete()

        next_url = request.POST.get('next', '').strip() or reverse('elderly_dashboard')
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({'success': True, 'message': f"Removed {med_label}."})

        messages.success(request, f"Removed {med_label} from your medications.")
        return redirect(next_url)

    return redirect('elderly_dashboard')


@login_required
def notifications_view(request):
    notifications = Notification.objects.filter(user=request.user).order_by('-created_at')

    # Mark unread as read if requested
    if request.method == 'POST' and request.POST.get('action') == 'mark_all_read':
        notifications.filter(is_read=False).update(is_read=True)
        messages.success(request, "All notifications marked as read.")
        return redirect('notifications')

    context = {
        'notifications': notifications,
    }
    return render(request, 'user/notifications.html', context)


@login_required
def mark_notification_read(request, notif_id):
    notif = get_object_or_404(Notification, pk=notif_id, user=request.user)
    notif.is_read = True
    notif.save()
    return redirect('notifications')


# ═══════════════════════════════════════════════════════════════
# DOCTOR MODULE
# ═══════════════════════════════════════════════════════════════

@doctor_required
def doctor_dashboard(request):
    doctor = request.user
    profile = doctor.doctor_profile

    now = datetime.now()
    today = now.date()
    current_time = now.time()

    # Exact condition for current and upcoming appointments (today at/after current time, or future dates)
    upcoming_condition = (
        Q(appointment_date__gt=today) |
        Q(appointment_date=today, appointment_time__gte=current_time)
    )

    # Condition for past appointments (yesterday or earlier, or earlier today)
    past_condition = (
        Q(appointment_date__lt=today) |
        Q(appointment_date=today, appointment_time__lt=current_time)
    )

    pending_count = Appointment.objects.filter(
        doctor=doctor,
        status='pending'
    ).filter(upcoming_condition).count()

    upcoming_count = Appointment.objects.filter(
        doctor=doctor,
        status='accepted'
    ).filter(upcoming_condition).count()

    past_count = Appointment.objects.filter(
        doctor=doctor
    ).filter(past_condition).count()

    total_patients = Appointment.objects.filter(doctor=doctor).values('elderly').distinct().count()
    total_consultations = Consultation.objects.filter(doctor=doctor).count()

    recent_requests = Appointment.objects.filter(
        doctor=doctor,
        status='pending'
    ).filter(upcoming_condition).select_related('elderly', 'elderly__elderly_profile').order_by('appointment_date', 'appointment_time')[:6]

    upcoming_appointments = Appointment.objects.filter(
        doctor=doctor,
        status='accepted'
    ).filter(upcoming_condition).select_related('elderly', 'elderly__elderly_profile').order_by('appointment_date', 'appointment_time')[:6]

    context = {
        'profile': profile,
        'pending_count': pending_count,
        'upcoming_count': upcoming_count,
        'past_count': past_count,
        'total_patients': total_patients,
        'total_consultations': total_consultations,
        'recent_requests': recent_requests,
        'upcoming_appointments': upcoming_appointments,
        'today': today,
        'current_time': current_time,
        'current_time_str': now.strftime("%I:%M %p"),
    }
    return render(request, 'user/doctor-dashboard.html', context)


@doctor_required
def doctor_profile_view(request):
    profile = request.user.doctor_profile

    if request.method == 'POST':
        name = request.POST.get('name', '').strip()
        specialization = request.POST.get('specialization', '').strip()
        qualification = request.POST.get('qualification', '').strip()
        experience = request.POST.get('experience', '0').strip()
        phone = request.POST.get('phone', '').strip()
        clinic_address = request.POST.get('clinic_address', '').strip()
        fee = request.POST.get('consultation_fee', '0').strip()
        bio = request.POST.get('bio', '').strip()

        if name:
            clean_name = name.replace('Dr.', '').strip()
            parts = clean_name.split(' ', 1)
            request.user.first_name = parts[0]
            request.user.last_name = parts[1] if len(parts) > 1 else ''
            request.user.save()

        profile.specialization = specialization
        profile.qualification = qualification
        profile.experience_years = int(experience) if experience.isdigit() else profile.experience_years
        profile.contact_phone = phone
        profile.clinic_address = clinic_address
        try:
            profile.consultation_fee = float(fee) if fee else 0.0
        except ValueError:
            pass
        profile.bio = bio
        profile.save()

        messages.success(request, "Your doctor profile has been updated.")
        return redirect('doctor_profile')

    context = {
        'profile': profile,
    }
    return render(request, 'user/doctor-profile.html', context)


@doctor_required
def doctor_appointments_view(request):
    doctor = request.user
    status_filter = request.GET.get('status', 'upcoming')
    search_query = request.GET.get('q', '').strip()

    now = datetime.now()
    today = now.date()
    current_time = now.time()

    upcoming_condition = (
        Q(appointment_date__gt=today) |
        Q(appointment_date=today, appointment_time__gte=current_time)
    )

    past_condition = (
        Q(appointment_date__lt=today) |
        Q(appointment_date=today, appointment_time__lt=current_time)
    )

    all_doc_appts = Appointment.objects.filter(doctor=doctor)

    counts = {
        'total': all_doc_appts.filter(upcoming_condition).count(),
        'pending': all_doc_appts.filter(status='pending').filter(upcoming_condition).count(),
        'accepted': all_doc_appts.filter(status='accepted').filter(upcoming_condition).count(),
        'past': all_doc_appts.filter(past_condition).count(),
        'completed': all_doc_appts.filter(status='completed').count(),
        'cancelled': all_doc_appts.filter(status='cancelled').count(),
        'all_records': all_doc_appts.count(),
    }

    appointments = all_doc_appts.select_related('elderly', 'elderly__elderly_profile')

    if status_filter in ['all', 'upcoming']:
        appointments = appointments.filter(upcoming_condition).order_by('appointment_date', 'appointment_time')
    elif status_filter == 'pending':
        appointments = appointments.filter(status='pending').filter(upcoming_condition).order_by('appointment_date', 'appointment_time')
    elif status_filter == 'accepted':
        appointments = appointments.filter(status='accepted').filter(upcoming_condition).order_by('appointment_date', 'appointment_time')
    elif status_filter == 'past':
        appointments = appointments.filter(past_condition).order_by('-appointment_date', '-appointment_time')
    elif status_filter == 'completed':
        appointments = appointments.filter(status='completed').order_by('-appointment_date', '-appointment_time')
    elif status_filter == 'cancelled':
        appointments = appointments.filter(status='cancelled').order_by('-appointment_date', '-appointment_time')
    elif status_filter == 'all_history':
        appointments = appointments.order_by('-appointment_date', '-appointment_time')
    else:
        appointments = appointments.filter(upcoming_condition).order_by('appointment_date', 'appointment_time')

    if search_query:
        appointments = appointments.filter(
            Q(elderly__first_name__icontains=search_query) |
            Q(elderly__last_name__icontains=search_query) |
            Q(elderly__username__icontains=search_query) |
            Q(reason__icontains=search_query)
        )

    context = {
        'appointments': appointments,
        'active_filter': status_filter,
        'search_query': search_query,
        'counts': counts,
        'today': today,
        'current_time': current_time,
        'current_time_str': now.strftime("%I:%M %p"),
    }
    return render(request, 'user/doctor-appointments.html', context)


@doctor_required
def doctor_appointment_action(request, appointment_id, action):
    appointment = get_object_or_404(Appointment, pk=appointment_id, doctor=request.user)

    if request.method == 'POST':
        doctor_name = request.user.doctor_profile.full_name if hasattr(request.user, 'doctor_profile') else f"Dr. {request.user.username}"

        if action == 'accept':
            appointment.status = 'accepted'
            appointment.save()
            create_notification(
                user=appointment.elderly,
                title="Appointment Confirmed! 🎉",
                message=f"Your appointment with {doctor_name} on {appointment.appointment_date} at {appointment.appointment_time} has been accepted.",
                notif_type='appointment_confirmed'
            )
            messages.success(request, f"Appointment #{appointment.id} accepted.")

        elif action == 'reject':
            appointment.status = 'rejected'
            appointment.save()
            create_notification(
                user=appointment.elderly,
                title="Appointment Not Accepted",
                message=f"{doctor_name} was unable to accept your appointment for {appointment.appointment_date}.",
                notif_type='appointment_rejected'
            )
            messages.info(request, f"Appointment #{appointment.id} was declined.")

        elif action == 'cancel':
            appointment.status = 'cancelled'
            appointment.save()
            create_notification(
                user=appointment.elderly,
                title="Appointment Cancelled by Doctor",
                message=f"{doctor_name} has cancelled the appointment scheduled for {appointment.appointment_date}.",
                notif_type='general'
            )
            messages.info(request, f"Appointment #{appointment.id} cancelled.")

    return redirect('doctor_appointments')


@doctor_required
def doctor_patients_view(request):
    doctor = request.user

    # Find all elderly users who had appointments with this doctor
    patient_ids = Appointment.objects.filter(doctor=doctor).values_list('elderly', flat=True).distinct()
    patients = User.objects.filter(id__in=patient_ids).select_related('elderly_profile')

    # Annotate with appointment counts
    patients_data = []
    for p in patients:
        total_appts = Appointment.objects.filter(doctor=doctor, elderly=p).count()
        last_appt = Appointment.objects.filter(doctor=doctor, elderly=p).order_by('-appointment_date').first()
        patients_data.append({
            'user': p,
            'profile': getattr(p, 'elderly_profile', None),
            'total_appointments': total_appts,
            'last_appointment': last_appt,
        })

    context = {
        'patients_data': patients_data,
    }
    return render(request, 'user/doctor-patients.html', context)


@doctor_required
def doctor_consultation_view(request, appointment_id):
    appointment = get_object_or_404(
        Appointment.objects.select_related('elderly', 'elderly__elderly_profile'),
        pk=appointment_id,
        doctor=request.user
    )

    elderly = appointment.elderly
    profile = getattr(elderly, 'elderly_profile', None)

    # Previous consultations for this patient
    previous_consultations = Consultation.objects.filter(elderly=elderly).select_related('doctor')
    previous_prescriptions = Prescription.objects.filter(elderly=elderly).prefetch_related('medicines')

    if request.method == 'POST':
        diagnosis = request.POST.get('diagnosis', '').strip()
        symptoms = request.POST.get('symptoms', '').strip()
        treatment_advice = request.POST.get('advice', '').strip()
        follow_up = request.POST.get('follow_up')
        prescription_notes = request.POST.get('prescription_notes', '').strip()

        if not diagnosis:
            messages.error(request, "Diagnosis is required to complete consultation.")
            return render(request, 'user/doctor-consultation.html', {
                'appointment': appointment,
                'patient': elderly,
                'profile': profile,
                'previous_consultations': previous_consultations,
                'previous_prescriptions': previous_prescriptions,
            })

        follow_up_date = None
        if follow_up:
            try:
                follow_up_date = datetime.strptime(follow_up, '%Y-%m-%d').date()
            except ValueError:
                pass

        # 1. Create Consultation
        consultation = Consultation.objects.create(
            appointment=appointment,
            doctor=request.user,
            elderly=elderly,
            diagnosis=diagnosis,
            symptoms=symptoms,
            treatment_advice=treatment_advice,
            follow_up_date=follow_up_date
        )

        # 2. Create MedicalRecord
        MedicalRecord.objects.create(
            elderly=elderly,
            doctor=request.user,
            title=f"Consultation: {diagnosis}",
            diagnosis=diagnosis,
            symptoms=symptoms,
            treatment_advice=treatment_advice,
            follow_up_date=follow_up_date
        )

        # 3. Create Prescription if medicines provided
        medicine_names = request.POST.getlist('med_name[]')
        dosages = request.POST.getlist('med_dosage[]')
        frequencies = request.POST.getlist('med_frequency[]')
        durations = request.POST.getlist('med_duration[]')
        instructions_list = request.POST.getlist('med_instructions[]')

        has_medicines = any(name.strip() for name in medicine_names)

        if has_medicines or prescription_notes:
            prescription = Prescription.objects.create(
                consultation=consultation,
                appointment=appointment,
                doctor=request.user,
                elderly=elderly,
                notes=prescription_notes
            )

            for i, name in enumerate(medicine_names):
                name = name.strip()
                if name:
                    dosage = dosages[i].strip() if i < len(dosages) else ''
                    freq = frequencies[i].strip() if i < len(frequencies) else ''
                    duration = durations[i].strip() if i < len(durations) else ''
                    instr = instructions_list[i].strip() if i < len(instructions_list) else ''

                    PrescriptionMedicine.objects.create(
                        prescription=prescription,
                        medicine_name=name,
                        dosage=dosage,
                        frequency=freq,
                        duration=duration,
                        instructions=instr
                    )

        # 4. Mark appointment completed
        appointment.status = 'completed'
        appointment.save()

        # 5. Send notification to elderly user
        doctor_name = request.user.doctor_profile.full_name if hasattr(request.user, 'doctor_profile') else f"Dr. {request.user.username}"
        create_notification(
            user=elderly,
            title="Consultation Completed",
            message=f"{doctor_name} has completed your consultation and issued your diagnosis and prescription.",
            notif_type='consultation_done'
        )

        messages.success(request, f"Consultation for {elderly.get_full_name() or elderly.username} successfully saved!")
        return redirect('doctor_appointments')

    context = {
        'appointment': appointment,
        'patient': elderly,
        'profile': profile,
        'previous_consultations': previous_consultations,
        'previous_prescriptions': previous_prescriptions,
    }
    return render(request, 'user/doctor-consultation.html', context)


# ═══════════════════════════════════════════════════════════════
# ADMIN MODULE
# ═══════════════════════════════════════════════════════════════

@admin_required
def admin_dashboard(request):
    total_elderly = ElderlyProfile.objects.count()
    total_doctors = DoctorProfile.objects.count()
    pending_doctors = DoctorProfile.objects.filter(is_approved=False).count()
    total_appointments = Appointment.objects.count()
    pending_appointments = Appointment.objects.filter(status='pending').count()

    active_emergencies = EmergencyAlert.objects.filter(status='active').count()
    active_emergency_alerts = EmergencyAlert.objects.filter(status='active').select_related('elderly', 'elderly__elderly_profile')[:3]
    total_payments = Payment.objects.filter(status='completed').aggregate(sum=Sum('amount'))['sum'] or Decimal('0.00')
    pending_feedbacks = Feedback.objects.filter(status='pending').count()
    active_reminders_count = MedicineReminder.objects.filter(status='active').count()

    recent_appointments = Appointment.objects.all().select_related(
        'elderly', 'doctor', 'doctor__doctor_profile'
    )[:6]

    pending_doctor_list = DoctorProfile.objects.filter(is_approved=False).select_related('user')[:5]
    recent_users = User.objects.filter(elderly_profile__isnull=False).order_by('-date_joined')[:5]

    context = {
        'total_elderly': total_elderly,
        'total_doctors': total_doctors,
        'pending_doctors': pending_doctors,
        'total_appointments': total_appointments,
        'pending_appointments': pending_appointments,
        'active_emergencies': active_emergencies,
        'active_emergency_alerts': active_emergency_alerts,
        'total_payments': total_payments,
        'pending_feedbacks': pending_feedbacks,
        'active_reminders_count': active_reminders_count,
        'recent_appointments': recent_appointments,
        'pending_doctor_list': pending_doctor_list,
        'recent_users': recent_users,
    }
    return render(request, 'user/admin-dashboard.html', context)


@admin_required
def admin_users_view(request):
    query = request.GET.get('q', '').strip()
    role_filter = request.GET.get('role', 'all').lower()
    status_filter = request.GET.get('status', 'all').lower()

    # Query all non-superuser accounts
    users = User.objects.filter(is_superuser=False).select_related('elderly_profile', 'doctor_profile').order_by('-date_joined')

    if role_filter == 'elderly':
        users = users.filter(elderly_profile__isnull=False)
    elif role_filter == 'doctor':
        users = users.filter(doctor_profile__isnull=False)

    if status_filter == 'active':
        users = users.filter(is_active=True)
    elif status_filter == 'blocked':
        users = users.filter(is_active=False)

    if query:
        users = users.filter(
            Q(username__icontains=query) |
            Q(email__icontains=query) |
            Q(first_name__icontains=query) |
            Q(last_name__icontains=query) |
            Q(elderly_profile__phone__icontains=query) |
            Q(doctor_profile__contact_phone__icontains=query)
        )

    total_count = User.objects.filter(is_superuser=False).count()
    active_count = User.objects.filter(is_superuser=False, is_active=True).count()
    blocked_count = User.objects.filter(is_superuser=False, is_active=False).count()
    elderly_count = User.objects.filter(elderly_profile__isnull=False).count()
    doctor_count = User.objects.filter(doctor_profile__isnull=False).count()

    context = {
        'users': users,
        'query': query,
        'role_filter': role_filter,
        'status_filter': status_filter,
        'total_count': total_count,
        'active_count': active_count,
        'blocked_count': blocked_count,
        'elderly_count': elderly_count,
        'doctor_count': doctor_count,
    }
    return render(request, 'user/admin-users.html', context)


@admin_required
def admin_user_toggle(request, user_id):
    user_obj = get_object_or_404(User, pk=user_id)
    if user_obj.is_superuser:
        messages.error(request, "Superuser administrator accounts cannot be blocked.")
        return redirect('admin_users')

    user_obj.is_active = not user_obj.is_active
    user_obj.save()
    status_str = "unblocked and activated" if user_obj.is_active else "blocked and deactivated"
    
    # Notify user in notifications table
    if user_obj.is_active:
        create_notification(
            user=user_obj,
            title="Account Reactivated 🟢",
            message="Your account has been unblocked by the administrator. You can now log in and access all services.",
            notif_type='general'
        )
    else:
        create_notification(
            user=user_obj,
            title="Account Blocked 🔴",
            message="Your account has been blocked by the system administrator. Please contact support if you need assistance.",
            notif_type='general'
        )

    messages.success(request, f"User '{user_obj.username}' has been {status_str} successfully.")
    
    next_url = request.GET.get('next') or request.META.get('HTTP_REFERER')
    if next_url and ('admin-portal' in next_url or 'admin' in next_url):
        return redirect(next_url)
    return redirect('admin_users')


@admin_required
def admin_user_delete(request, user_id):
    user_obj = get_object_or_404(User, pk=user_id)
    if user_obj.is_superuser:
        messages.error(request, "Superuser accounts cannot be deleted.")
        return redirect('admin_users')

    username = user_obj.username
    user_obj.delete()
    messages.success(request, f"User {username} and associated records deleted.")
    return redirect('admin_users')


@admin_required
def admin_user_edit(request, user_id):
    user_obj = get_object_or_404(User, pk=user_id)
    profile = getattr(user_obj, 'elderly_profile', None)

    if request.method == 'POST':
        full_name = request.POST.get('name', '').strip()
        email = request.POST.get('email', '').strip()
        phone = request.POST.get('phone', '').strip()
        age = request.POST.get('age', '').strip()
        gender = request.POST.get('gender', '').strip()
        address = request.POST.get('address', '').strip()
        blood_group = request.POST.get('blood_group', '').strip()

        if full_name:
            parts = full_name.split(' ', 1)
            user_obj.first_name = parts[0]
            user_obj.last_name = parts[1] if len(parts) > 1 else ''

        if email:
            user_obj.email = email
        user_obj.save()

        if profile:
            profile.phone = phone
            profile.age = int(age) if age.isdigit() else profile.age
            profile.gender = gender
            profile.address = address
            profile.blood_group = blood_group
            profile.save()

        messages.success(request, f"Details for {user_obj.username} updated.")

    return redirect('admin_users')


@admin_required
def admin_doctors_view(request):
    query = request.GET.get('q', '').strip()
    status_filter = request.GET.get('status', 'all')

    doctors = DoctorProfile.objects.select_related('user').order_by('-created_at')

    if status_filter == 'pending':
        doctors = doctors.filter(is_approved=False)
    elif status_filter == 'approved':
        doctors = doctors.filter(is_approved=True)

    if query:
        doctors = doctors.filter(
            Q(user__first_name__icontains=query) |
            Q(user__last_name__icontains=query) |
            Q(user__email__icontains=query) |
            Q(specialization__icontains=query)
        )

    context = {
        'doctors': doctors,
        'query': query,
        'active_filter': status_filter,
    }
    return render(request, 'user/admin-doctors.html', context)


@admin_required
def admin_doctor_toggle_approval(request, doctor_id):
    doctor_profile = get_object_or_404(DoctorProfile, pk=doctor_id)
    doctor_profile.is_approved = not doctor_profile.is_approved
    doctor_profile.save()

    status_str = "approved" if doctor_profile.is_approved else "pending approval"

    if doctor_profile.is_approved:
        create_notification(
            user=doctor_profile.user,
            title="Account Approved! 🩺",
            message="Your doctor registration has been approved. You can now log in, view patients, and accept appointments.",
            notif_type='doctor_approved'
        )

    messages.success(request, f"Dr. {doctor_profile.full_name} is now {status_str}.")
    return redirect('admin_doctors')


@admin_required
def admin_doctor_edit(request, doctor_id):
    doctor_profile = get_object_or_404(DoctorProfile, pk=doctor_id)
    user_obj = doctor_profile.user

    if request.method == 'POST':
        full_name = request.POST.get('name', '').strip()
        email = request.POST.get('email', '').strip()
        specialization = request.POST.get('specialization', '').strip()
        qualification = request.POST.get('qualification', '').strip()
        experience = request.POST.get('experience', '0').strip()
        phone = request.POST.get('phone', '').strip()

        if full_name:
            clean = full_name.replace('Dr.', '').strip()
            parts = clean.split(' ', 1)
            user_obj.first_name = parts[0]
            user_obj.last_name = parts[1] if len(parts) > 1 else ''
        if email:
            user_obj.email = email
        user_obj.save()

        doctor_profile.specialization = specialization
        doctor_profile.qualification = qualification
        doctor_profile.experience_years = int(experience) if experience.isdigit() else doctor_profile.experience_years
        doctor_profile.contact_phone = phone
        doctor_profile.save()

        messages.success(request, f"Doctor {doctor_profile.full_name} updated.")

    return redirect('admin_doctors')


@admin_required
def admin_appointments_view(request):
    doctor_id = request.GET.get('doctor', '')
    elderly_id = request.GET.get('elderly', '')
    status = request.GET.get('status', '')

    appointments = Appointment.objects.all().select_related(
        'elderly', 'doctor', 'doctor__doctor_profile'
    ).order_by('-appointment_date', '-appointment_time')

    if doctor_id:
        appointments = appointments.filter(doctor_id=doctor_id)
    if elderly_id:
        appointments = appointments.filter(elderly_id=elderly_id)
    if status:
        appointments = appointments.filter(status=status)

    all_doctors = DoctorProfile.objects.filter(is_approved=True).select_related('user')
    all_elderly = User.objects.filter(elderly_profile__isnull=False)

    context = {
        'appointments': appointments,
        'doctors': all_doctors,
        'elderly_users': all_elderly,
        'selected_doctor': doctor_id,
        'selected_elderly': elderly_id,
        'selected_status': status,
    }
    return render(request, 'user/admin-appointments.html', context)


@admin_required
def admin_appointment_cancel(request, appointment_id):
    appointment = get_object_or_404(Appointment, pk=appointment_id)
    appointment.status = 'cancelled'
    appointment.save()

    create_notification(
        user=appointment.elderly,
        title="Appointment Cancelled by Admin",
        message=f"Your appointment on {appointment.appointment_date} with Dr. {appointment.doctor.get_full_name() or appointment.doctor.username} has been cancelled by administration.",
        notif_type='general'
    )
    create_notification(
        user=appointment.doctor,
        title="Appointment Cancelled by Admin",
        message=f"Appointment with {appointment.elderly.get_full_name() or appointment.elderly.username} on {appointment.appointment_date} was cancelled by administration.",
        notif_type='general'
    )

    messages.info(request, f"Appointment #{appointment.id} was cancelled by administrator.")
    return redirect('admin_appointments')


@admin_required
def admin_records_view(request):
    query = request.GET.get('q', '').strip()
    records = MedicalRecord.objects.all().select_related('elderly', 'doctor')
    prescriptions = Prescription.objects.all().prefetch_related('medicines').select_related('elderly', 'doctor')

    if query:
        records = records.filter(
            Q(elderly__username__icontains=query) |
            Q(title__icontains=query) |
            Q(diagnosis__icontains=query)
        )
        prescriptions = prescriptions.filter(
            Q(elderly__username__icontains=query) |
            Q(notes__icontains=query)
        )

    context = {
        'records': records,
        'prescriptions': prescriptions,
        'query': query,
    }
    return render(request, 'user/admin-records.html', context)


@admin_required
def admin_reports_view(request):
    total_elderly = ElderlyProfile.objects.count()
    total_doctors = DoctorProfile.objects.count()
    approved_doctors = DoctorProfile.objects.filter(is_approved=True).count()
    pending_doctors = DoctorProfile.objects.filter(is_approved=False).count()

    total_appointments = Appointment.objects.count()
    appt_status_counts = {
        'pending': Appointment.objects.filter(status='pending').count(),
        'accepted': Appointment.objects.filter(status='accepted').count(),
        'completed': Appointment.objects.filter(status='completed').count(),
        'cancelled': Appointment.objects.filter(status='cancelled').count(),
        'rejected': Appointment.objects.filter(status='rejected').count(),
    }

    total_consultations = Consultation.objects.count()
    total_prescriptions = Prescription.objects.count()
    total_records = MedicalRecord.objects.count()

    # Financial and Operations Metrics
    payments_total = Payment.objects.filter(status='completed').aggregate(sum=Sum('amount'))['sum'] or Decimal('0.00')
    payments_count = Payment.objects.count()
    alerts_total = EmergencyAlert.objects.count()
    alerts_active = EmergencyAlert.objects.filter(status='active').count()
    alerts_resolved = EmergencyAlert.objects.filter(status='resolved').count()
    feedback_total = Feedback.objects.count()
    avg_rating_val = Feedback.objects.aggregate(avg=Avg('rating'))['avg']
    avg_rating = round(avg_rating_val, 1) if avg_rating_val else 5.0
    active_reminders_count = MedicineReminder.objects.filter(status='active').count()

    # Top doctors by appointments
    top_doctors = DoctorProfile.objects.annotate(
        num_appts=Count('user__doctor_appointments')
    ).order_by('-num_appts')[:5]

    context = {
        'total_elderly': total_elderly,
        'total_doctors': total_doctors,
        'approved_doctors': approved_doctors,
        'pending_doctors': pending_doctors,
        'total_appointments': total_appointments,
        'status_counts': appt_status_counts,
        'total_consultations': total_consultations,
        'total_prescriptions': total_prescriptions,
        'total_records': total_records,
        'top_doctors': top_doctors,
        'payments_total': payments_total,
        'payments_count': payments_count,
        'alerts_total': alerts_total,
        'alerts_active': alerts_active,
        'alerts_resolved': alerts_resolved,
        'feedback_total': feedback_total,
        'avg_rating': avg_rating,
        'active_reminders_count': active_reminders_count,
    }
    return render(request, 'user/admin-reports.html', context)


# ═══════════════════════════════════════════════════════════════
# 1. EMERGENCY MONITORING MODULE
# ═══════════════════════════════════════════════════════════════

@admin_required
def admin_emergency_view(request):
    status_filter = request.GET.get('status', 'all').lower()
    severity_filter = request.GET.get('severity', 'all').lower()
    query = request.GET.get('q', '').strip()

    alerts = EmergencyAlert.objects.select_related('elderly', 'elderly__elderly_profile').order_by('-created_at')

    if status_filter != 'all':
        alerts = alerts.filter(status=status_filter)
    if severity_filter != 'all':
        alerts = alerts.filter(severity=severity_filter)
    if query:
        alerts = alerts.filter(
            Q(elderly__username__icontains=query) |
            Q(elderly__first_name__icontains=query) |
            Q(elderly__last_name__icontains=query) |
            Q(location__icontains=query) |
            Q(notes__icontains=query)
        )

    total_alerts = EmergencyAlert.objects.count()
    active_count = EmergencyAlert.objects.filter(status='active').count()
    dispatched_count = EmergencyAlert.objects.filter(status='dispatched').count()
    resolved_count = EmergencyAlert.objects.filter(status='resolved').count()
    critical_count = EmergencyAlert.objects.filter(severity='critical', status__in=['active', 'dispatched']).count()

    elderly_patients = User.objects.filter(elderly_profile__isnull=False).select_related('elderly_profile')

    context = {
        'alerts': alerts,
        'total_alerts': total_alerts,
        'active_count': active_count,
        'dispatched_count': dispatched_count,
        'resolved_count': resolved_count,
        'critical_count': critical_count,
        'elderly_patients': elderly_patients,
        'status_filter': status_filter,
        'severity_filter': severity_filter,
        'query': query,
    }
    return render(request, 'user/admin-emergency.html', context)


@admin_required
def admin_emergency_update_status(request, alert_id):
    alert = get_object_or_404(EmergencyAlert, pk=alert_id)
    if request.method == 'POST':
        new_status = request.POST.get('status', alert.status)
        responder = request.POST.get('responder_name', '').strip()
        notes = request.POST.get('notes', '').strip()

        alert.status = new_status
        if responder:
            alert.responder_name = responder
        if notes:
            alert.notes = (alert.notes + "\n" + notes).strip() if alert.notes else notes
        if new_status == 'resolved' and not alert.resolved_at:
            alert.resolved_at = timezone.now()
        alert.save()

        # Send notification to elderly
        create_notification(
            user=alert.elderly,
            title=f"Emergency Status: {alert.get_status_display()} 🚨",
            message=f"Your emergency request ({alert.get_alert_type_display()}) status has been updated to: {alert.get_status_display()}.",
            notif_type='general'
        )
        messages.success(request, f"Emergency Alert #{alert.id} status updated to {alert.get_status_display()}.")

    return redirect('admin_emergency')


@admin_required
def admin_emergency_create(request):
    if request.method == 'POST':
        elderly_id = request.POST.get('elderly_id')
        alert_type = request.POST.get('alert_type', 'sos')
        severity = request.POST.get('severity', 'critical')
        location = request.POST.get('location', 'Home Residence').strip()
        vital_snapshot = request.POST.get('vital_snapshot', '').strip()
        notes = request.POST.get('notes', '').strip()
        responder_name = request.POST.get('responder_name', '').strip()

        elderly_user = get_object_or_404(User, pk=elderly_id)
        alert = EmergencyAlert.objects.create(
            elderly=elderly_user,
            alert_type=alert_type,
            severity=severity,
            status='active',
            location=location or 'Home Residence',
            vital_snapshot=vital_snapshot,
            notes=notes,
            responder_name=responder_name
        )

        # Notify doctors and elderly
        for doc in DoctorProfile.objects.filter(is_approved=True):
            create_notification(
                user=doc.user,
                title=f"🚨 CRITICAL SOS ALERT: {elderly_user.get_full_name() or elderly_user.username}",
                message=f"Emergency SOS triggered at {location}. Severity: {severity.upper()}. Vitals: {vital_snapshot}",
                notif_type='general'
            )

        messages.success(request, f"Emergency alert registered and dispatched for {elderly_user.username}!")
    return redirect('admin_emergency')


# ═══════════════════════════════════════════════════════════════
# 2. FEEDBACK MANAGEMENT MODULE
# ═══════════════════════════════════════════════════════════════

@admin_required
def admin_feedback_view(request):
    status_filter = request.GET.get('status', 'all').lower()
    category_filter = request.GET.get('category', 'all').lower()
    rating_filter = request.GET.get('rating', 'all')
    query = request.GET.get('q', '').strip()

    feedbacks = Feedback.objects.select_related('user').order_by('-created_at')

    if status_filter != 'all':
        feedbacks = feedbacks.filter(status=status_filter)
    if category_filter != 'all':
        feedbacks = feedbacks.filter(category=category_filter)
    if rating_filter != 'all' and rating_filter.isdigit():
        feedbacks = feedbacks.filter(rating=int(rating_filter))
    if query:
        feedbacks = feedbacks.filter(
            Q(user__username__icontains=query) |
            Q(title__icontains=query) |
            Q(comment__icontains=query) |
            Q(admin_reply__icontains=query)
        )

    total_feedbacks = Feedback.objects.count()
    pending_feedbacks = Feedback.objects.filter(status='pending').count()
    reviewed_feedbacks = Feedback.objects.filter(status='reviewed').count()
    resolved_feedbacks = Feedback.objects.filter(status='resolved').count()
    avg_rating_val = Feedback.objects.aggregate(avg=Avg('rating'))['avg']
    avg_rating = round(avg_rating_val, 1) if avg_rating_val else 5.0

    context = {
        'feedbacks': feedbacks,
        'total_feedbacks': total_feedbacks,
        'pending_feedbacks': pending_feedbacks,
        'reviewed_feedbacks': reviewed_feedbacks,
        'resolved_feedbacks': resolved_feedbacks,
        'avg_rating': avg_rating,
        'status_filter': status_filter,
        'category_filter': category_filter,
        'rating_filter': rating_filter,
        'query': query,
    }
    return render(request, 'user/admin-feedback.html', context)


@admin_required
def admin_feedback_reply(request, feedback_id):
    feedback = get_object_or_404(Feedback, pk=feedback_id)
    if request.method == 'POST':
        reply_text = request.POST.get('admin_reply', '').strip()
        new_status = request.POST.get('status', 'reviewed')

        feedback.admin_reply = reply_text
        feedback.status = new_status
        feedback.replied_at = timezone.now()
        feedback.save()

        # Notify user
        create_notification(
            user=feedback.user,
            title="Administrator Responded to Your Feedback 💬",
            message=f"Admin response: {reply_text}",
            notif_type='general'
        )
        messages.success(request, f"Reply sent and feedback marked as {feedback.get_status_display()}.")

    return redirect('admin_feedback')


@admin_required
def admin_feedback_delete(request, feedback_id):
    feedback = get_object_or_404(Feedback, pk=feedback_id)
    feedback.delete()
    messages.success(request, "Feedback record removed.")
    return redirect('admin_feedback')


# ═══════════════════════════════════════════════════════════════
# 3. MEDICINE REMINDER MODULE
# ═══════════════════════════════════════════════════════════════

@admin_required
def admin_medicine_reminders_view(request):
    status_filter = request.GET.get('status', 'all').lower()
    elderly_id = request.GET.get('elderly', '')
    query = request.GET.get('q', '').strip()

    reminders = MedicineReminder.objects.select_related('elderly', 'elderly__elderly_profile').order_by('-created_at')

    if status_filter != 'all':
        reminders = reminders.filter(status=status_filter)
    if elderly_id and elderly_id.isdigit():
        reminders = reminders.filter(elderly_id=int(elderly_id))
    if query:
        reminders = reminders.filter(
            Q(medicine_name__icontains=query) |
            Q(dosage__icontains=query) |
            Q(frequency__icontains=query) |
            Q(elderly__username__icontains=query) |
            Q(elderly__first_name__icontains=query)
        )

    total_reminders = MedicineReminder.objects.count()
    active_reminders = MedicineReminder.objects.filter(status='active').count()
    paused_reminders = MedicineReminder.objects.filter(status='paused').count()
    completed_reminders = MedicineReminder.objects.filter(status='completed').count()
    patients_with_reminders = MedicineReminder.objects.filter(status='active').values('elderly').distinct().count()

    elderly_patients = User.objects.filter(elderly_profile__isnull=False).select_related('elderly_profile')

    context = {
        'reminders': reminders,
        'total_reminders': total_reminders,
        'active_reminders': active_reminders,
        'paused_reminders': paused_reminders,
        'completed_reminders': completed_reminders,
        'patients_with_reminders': patients_with_reminders,
        'elderly_patients': elderly_patients,
        'status_filter': status_filter,
        'selected_elderly': elderly_id,
        'query': query,
    }
    return render(request, 'user/admin-medicine-reminders.html', context)


@admin_required
def admin_medicine_reminder_add(request):
    if request.method == 'POST':
        elderly_id = request.POST.get('elderly_id')
        medicine_name = request.POST.get('medicine_name', '').strip()
        dosage = request.POST.get('dosage', '').strip()
        frequency = request.POST.get('frequency', 'Once Daily').strip()
        time_of_day = request.POST.get('time_of_day', '08:00 AM (Morning)').strip()
        meal_timing = request.POST.get('meal_timing', 'After Meals').strip()
        notes = request.POST.get('notes', '').strip()

        elderly_user = get_object_or_404(User, pk=elderly_id)
        reminder = MedicineReminder.objects.create(
            elderly=elderly_user,
            medicine_name=medicine_name,
            dosage=dosage,
            frequency=frequency,
            time_of_day=time_of_day,
            meal_timing=meal_timing,
            notes=notes,
            status='active'
        )

        create_notification(
            user=elderly_user,
            title="💊 New Medicine Reminder Scheduled",
            message=f"Reminder scheduled: {medicine_name} ({dosage}) - {frequency} at {time_of_day} ({meal_timing}).",
            notif_type='general'
        )
        messages.success(request, f"Medicine schedule for {medicine_name} created for {elderly_user.username}.")

    return redirect('admin_medicine_reminders')


@admin_required
def admin_medicine_reminder_toggle(request, reminder_id):
    reminder = get_object_or_404(MedicineReminder, pk=reminder_id)
    if reminder.status == 'active':
        reminder.status = 'paused'
    else:
        reminder.status = 'active'
    reminder.save()
    messages.success(request, f"Reminder for {reminder.medicine_name} is now {reminder.get_status_display()}.")
    return redirect('admin_medicine_reminders')


@admin_required
def admin_medicine_reminder_send_ping(request, reminder_id):
    reminder = get_object_or_404(MedicineReminder, pk=reminder_id)
    reminder.last_taken = timezone.now()
    reminder.save()

    create_notification(
        user=reminder.elderly,
        title="⏰ Medication Alert Ping!",
        message=f"Care alert: Please remember to take {reminder.medicine_name} ({reminder.dosage}) - {reminder.meal_timing}.",
        notif_type='general'
    )
    messages.success(request, f"Medication prompt notification sent to {reminder.elderly.username}!")
    return redirect('admin_medicine_reminders')


@admin_required
def admin_medicine_reminder_delete(request, reminder_id):
    reminder = get_object_or_404(MedicineReminder, pk=reminder_id)
    reminder.delete()
    messages.success(request, "Medication schedule deleted.")
    return redirect('admin_medicine_reminders')


# ═══════════════════════════════════════════════════════════════
# 4. PAYMENTS & VIEW PAYMENT MODULE
# ═══════════════════════════════════════════════════════════════

@admin_required
def admin_payments_view(request):
    status_filter = request.GET.get('status', 'all').lower()
    method_filter = request.GET.get('method', 'all')
    query = request.GET.get('q', '').strip()

    payments = Payment.objects.select_related('patient', 'doctor', 'appointment').order_by('-created_at')

    if status_filter != 'all':
        payments = payments.filter(status=status_filter)
    if method_filter != 'all':
        payments = payments.filter(payment_method=method_filter)
    if query:
        payments = payments.filter(
            Q(transaction_id__icontains=query) |
            Q(invoice_no__icontains=query) |
            Q(patient__username__icontains=query) |
            Q(patient__first_name__icontains=query) |
            Q(doctor__username__icontains=query) |
            Q(description__icontains=query)
        )

    total_revenue = Payment.objects.filter(status='completed').aggregate(sum=Sum('amount'))['sum'] or Decimal('0.00')
    pending_revenue = Payment.objects.filter(status='pending').aggregate(sum=Sum('amount'))['sum'] or Decimal('0.00')
    refunded_revenue = Payment.objects.filter(status='refunded').aggregate(sum=Sum('amount'))['sum'] or Decimal('0.00')
    total_transactions = Payment.objects.count()
    completed_transactions = Payment.objects.filter(status='completed').count()

    patients = User.objects.filter(elderly_profile__isnull=False)
    doctors = DoctorProfile.objects.filter(is_approved=True).select_related('user')

    context = {
        'payments': payments,
        'total_revenue': total_revenue,
        'pending_revenue': pending_revenue,
        'refunded_revenue': refunded_revenue,
        'total_transactions': total_transactions,
        'completed_transactions': completed_transactions,
        'patients': patients,
        'doctors': doctors,
        'status_filter': status_filter,
        'method_filter': method_filter,
        'query': query,
    }
    return render(request, 'user/admin-payments.html', context)


@admin_required
def admin_payment_record(request):
    if request.method == 'POST':
        patient_id = request.POST.get('patient_id')
        doctor_id = request.POST.get('doctor_id') or None
        amount = request.POST.get('amount', '0.00').strip()
        payment_method = request.POST.get('payment_method', 'UPI')
        status = request.POST.get('status', 'completed')
        description = request.POST.get('description', 'Consultation Fee').strip()

        patient_user = get_object_or_404(User, pk=patient_id)
        doctor_user = User.objects.filter(pk=doctor_id).first() if doctor_id else None

        txn_id = f"TXN-{payment_method.upper()}-{timezone.now().strftime('%Y%m%d%H%M%S')}"
        inv_no = f"INV-{timezone.now().strftime('%Y')}-{Payment.objects.count() + 1050}"

        try:
            amt_dec = Decimal(amount)
        except Exception:
            amt_dec = Decimal('0.00')

        payment = Payment.objects.create(
            patient=patient_user,
            doctor=doctor_user,
            amount=amt_dec,
            payment_method=payment_method,
            transaction_id=txn_id,
            status=status,
            description=description or 'Doctor Consultation Fee',
            invoice_no=inv_no
        )

        create_notification(
            user=patient_user,
            title="Payment Receipt Generated 💳",
            message=f"Receipt #{inv_no} for ₹{amt_dec} via {payment_method} has been recorded.",
            notif_type='general'
        )

        messages.success(request, f"Payment #{txn_id} recorded successfully!")

    return redirect('admin_payments')


@admin_required
def admin_payment_update_status(request, payment_id):
    payment = get_object_or_404(Payment, pk=payment_id)
    if request.method == 'POST':
        new_status = request.POST.get('status', payment.status)
        payment.status = new_status
        payment.save()

        create_notification(
            user=payment.patient,
            title=f"Payment Status Update: {payment.get_status_display()}",
            message=f"Payment #{payment.transaction_id} (₹{payment.amount}) is now marked as {payment.get_status_display()}.",
            notif_type='general'
        )
        messages.success(request, f"Payment #{payment.transaction_id} updated to {payment.get_status_display()}.")

    return redirect('admin_payments')


@admin_required
def admin_payment_detail_json(request, payment_id):
    payment = get_object_or_404(Payment, pk=payment_id)
    data = {
        'id': payment.id,
        'transaction_id': payment.transaction_id,
        'invoice_no': payment.invoice_no,
        'patient_name': payment.patient.get_full_name() or payment.patient.username,
        'patient_email': payment.patient.email or 'N/A',
        'doctor_name': f"Dr. {payment.doctor.get_full_name() or payment.doctor.username}" if payment.doctor else "Senior Care Center / Platform",
        'amount': str(payment.amount),
        'currency': payment.currency,
        'payment_method': payment.get_payment_method_display(),
        'status': payment.status,
        'status_display': payment.get_status_display(),
        'description': payment.description,
        'date': payment.created_at.strftime('%d %B %Y, %I:%M %p'),
    }
    return JsonResponse(data)


# ═══════════════════════════════════════════════════════════════
# 5. SMALL HEALTH ASSISTANT MODULE
# ═══════════════════════════════════════════════════════════════

def triage_health_query(query_text):
    text = query_text.lower()

    if any(k in text for k in ['chest pain', 'heart attack', 'unconscious', 'cannot breathe', 'severe breath', 'stroke', 'paralysis', 'choking', 'cyanosis', 'severe bleeding']):
        return {
            'urgency': 'Emergency',
            'badge': 'danger',
            'specialist': 'Emergency Medicine / Interventional Cardiologist',
            'action': 'IMMEDIATE EMERGENCY ACTION REQUIRED:\n1. Trigger physical SOS dispatch and 108/102 ambulance service immediately.\n2. Position senior seated upright with neck unconstricted.\n3. If cardiac discomfort and no allergy/contraindication, administer Aspirin 300mg.\n4. Paramedic rapid dispatch alert has been triggered.',
            'rationale': 'Potential acute myocardial infarction, cardiovascular collapse, or severe acute respiratory distress syndrome.'
        }
    elif any(k in text for k in ['bp 18', 'bp 19', 'bp 20', 'blood pressure 18', 'high bp', 'severe dizzy', 'fainted', 'loss of vision', 'severe fall', 'hip fracture', 'vomiting blood', 'sugar 35', 'sugar 40', 'spo2 8', 'oxygen 8']):
        return {
            'urgency': 'High Priority',
            'badge': 'warning',
            'specialist': 'Geriatric Care Specialist / Cardiologist / Neurologist',
            'action': 'URGENT CLINICAL EVALUATION:\n1. Schedule priority physician review within 1 to 2 hours.\n2. Keep patient lying down with feet slightly elevated if hypotensive or seated if hypertensive.\n3. Re-verify digital vitals (BP, Heart rate, SpO2) every 15 minutes.\n4. Do not administer unverified OTC sedatives or stimulants.',
            'rationale': 'Critical vital sign spike or acute injury risk requiring immediate physician intervention.'
        }
    elif any(k in text for k in ['aspirin', 'warfarin', 'metformin', 'insulin', 'atorvastatin', 'amlodipine', 'interaction', 'supplement', 'side effect', 'overdose', 'calcium', 'iron']):
        return {
            'urgency': 'Moderate',
            'badge': 'info',
            'specialist': 'Clinical Pharmacologist / Primary Doctor',
            'action': 'MEDICATION SCHEDULE GUIDANCE:\n1. Separate interacting medications (e.g., Calcium and Iron) by a minimum of 2-3 hours.\n2. Ensure antidiabetic agents are paired strictly with meals to prevent hypoglycemia.\n3. Review recent kidney function (eGFR) and liver profile before dosage alteration.',
            'rationale': 'Pharmacological synergy or timing conflict requiring regimen adjustment.'
        }
    elif any(k in text for k in ['dizziness', 'dizzy', 'nausea', 'mild pain', 'joint pain', 'arthritis', 'constipation', 'fatigue', 'swelling', 'rash', 'headache']):
        return {
            'urgency': 'Moderate',
            'badge': 'info',
            'specialist': 'General Physician / Geriatric Specialist',
            'action': 'CLINICAL MANAGEMENT:\n1. Provide oral hydration (electrolytes if tolerated).\n2. Monitor sitting vs standing blood pressure for orthostatic variation.\n3. Schedule non-urgent consultation within 24 hours if symptoms persist.',
            'rationale': 'Sub-acute symptoms manageable with symptomatic care and scheduled doctor checkup.'
        }
    else:
        return {
            'urgency': 'Normal',
            'badge': 'success',
            'specialist': 'Geriatric Wellness & Nutritionist',
            'action': 'WELLNESS & PREVENTIVE GUIDELINES:\n1. Encourage 20-30 minutes of low-impact morning walking.\n2. Maintain balanced low-sodium, high-fiber senior diet.\n3. Ensure adequate daily hydration (1.5 - 2 Liters daily unless contraindicated by cardiac/renal restriction).\n4. Keep regular sleep and medication hours.',
            'rationale': 'Routine wellness maintenance and senior lifestyle hygiene advisory.'
        }


@admin_required
def admin_health_assistant_view(request):
    latest_result = None
    query_text = ""
    patient_id = None

    if request.method == 'POST':
        query_text = request.POST.get('query', '').strip()
        patient_id = request.POST.get('patient_id') or None

        if query_text:
            patient_user = User.objects.filter(pk=patient_id).first() if patient_id else None
            triage = triage_health_query(query_text)

            formatted_response = (
                f"[{triage['urgency'].upper()}] - {triage['rationale']}\n\n"
                f"Recommended Specialist: {triage['specialist']}\n\n"
                f"{triage['action']}"
            )

            log_entry = HealthAssistantLog.objects.create(
                user=patient_user,
                query=query_text,
                response=formatted_response,
                urgency_level=triage['urgency'],
                recommended_specialist=triage['specialist']
            )

            latest_result = {
                'id': log_entry.id,
                'query': query_text,
                'triage': triage,
                'response': formatted_response,
                'patient': patient_user,
                'created_at': log_entry.created_at,
            }

            if request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.GET.get('format') == 'json':
                return JsonResponse({
                    'success': True,
                    'query': query_text,
                    'urgency': triage['urgency'],
                    'badge': triage['badge'],
                    'specialist': triage['specialist'],
                    'action': triage['action'],
                    'rationale': triage['rationale'],
                    'timestamp': log_entry.created_at.strftime('%d %b %Y, %I:%M %p')
                })

            messages.success(request, f"Clinical triage analysis completed: [{triage['urgency']}]")

    query_filter = request.GET.get('urgency', 'all')
    recent_logs = HealthAssistantLog.objects.select_related('user').order_by('-created_at')
    if query_filter != 'all':
        recent_logs = recent_logs.filter(urgency_level__iexact=query_filter)

    total_queries = HealthAssistantLog.objects.count()
    emergency_queries = HealthAssistantLog.objects.filter(urgency_level__icontains='Emergency').count()
    high_queries = HealthAssistantLog.objects.filter(urgency_level__icontains='High').count()
    normal_queries = HealthAssistantLog.objects.filter(urgency_level__icontains='Normal').count()

    patients = User.objects.filter(elderly_profile__isnull=False)

    context = {
        'recent_logs': recent_logs[:30],
        'latest_result': latest_result,
        'query_text': query_text,
        'total_queries': total_queries,
        'emergency_queries': emergency_queries,
        'high_queries': high_queries,
        'normal_queries': normal_queries,
        'patients': patients,
        'active_urgency_filter': query_filter,
    }
    return render(request, 'user/admin-health-assistant.html', context)



# ═══════════════════════════════════════════════════════════════
# ADMIN SETTINGS & PLATFORM CONFIGURATION
# ═══════════════════════════════════════════════════════════════

SETTINGS_FILE_PATH = os.path.join(settings.BASE_DIR, 'users', 'system_settings.json')

DEFAULT_SYSTEM_SETTINGS = {
    'facility_name': 'Smart Elderly Care Medical Center',
    'emergency_hotline': '1800-123-456',
    'support_email': 'support@eldercare.com',
    'facility_address': '42 Wellness Blvd, Senior Care Campus, Suite 100',
    'appointment_slot_duration': '30',
    'advance_booking_days': '30',
    'auto_approve_doctors': False,
    'enable_guest_login': True,
    'enable_emergency_broadcast': True,
    'enable_simulation_alerts': True,
}

def load_system_settings():
    if os.path.exists(SETTINGS_FILE_PATH):
        try:
            with open(SETTINGS_FILE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                merged = DEFAULT_SYSTEM_SETTINGS.copy()
                merged.update(data)
                return merged
        except Exception:
            return DEFAULT_SYSTEM_SETTINGS.copy()
    return DEFAULT_SYSTEM_SETTINGS.copy()

def save_system_settings(settings_dict):
    try:
        with open(SETTINGS_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(settings_dict, f, indent=2)
        return True
    except Exception:
        return False


@admin_required
def admin_settings_view(request):
    system_settings = load_system_settings()

    if request.method == 'POST':
        action = request.POST.get('action', 'save_general')

        if action == 'save_general':
            system_settings['facility_name'] = request.POST.get('facility_name', system_settings['facility_name']).strip()
            system_settings['emergency_hotline'] = request.POST.get('emergency_hotline', system_settings['emergency_hotline']).strip()
            system_settings['support_email'] = request.POST.get('support_email', system_settings['support_email']).strip()
            system_settings['facility_address'] = request.POST.get('facility_address', system_settings['facility_address']).strip()
            system_settings['appointment_slot_duration'] = request.POST.get('appointment_slot_duration', system_settings['appointment_slot_duration'])
            system_settings['advance_booking_days'] = request.POST.get('advance_booking_days', system_settings['advance_booking_days'])
            system_settings['auto_approve_doctors'] = bool(request.POST.get('auto_approve_doctors'))
            system_settings['enable_guest_login'] = bool(request.POST.get('enable_guest_login'))
            system_settings['enable_emergency_broadcast'] = bool(request.POST.get('enable_emergency_broadcast'))
            system_settings['enable_simulation_alerts'] = bool(request.POST.get('enable_simulation_alerts'))
            save_system_settings(system_settings)
            messages.success(request, "Platform & Healthcare operations settings saved successfully!")
            return redirect(reverse('admin_settings') + '?tab=general')

        elif action == 'save_profile':
            first_name = request.POST.get('first_name', '').strip()
            last_name = request.POST.get('last_name', '').strip()
            email = request.POST.get('email', '').strip().lower()
            username = request.POST.get('username', '').strip()

            user = request.user
            if email and User.objects.filter(email__iexact=email).exclude(id=user.id).exists():
                messages.error(request, "This email address is already in use by another account.")
                return redirect(reverse('admin_settings') + '?tab=profile')
            if username and User.objects.filter(username__iexact=username).exclude(id=user.id).exists():
                messages.error(request, "This username is already in use by another account.")
                return redirect(reverse('admin_settings') + '?tab=profile')

            user.first_name = first_name
            user.last_name = last_name
            if email:
                user.email = email
            if username:
                user.username = username
            user.save()
            messages.success(request, "Administrator profile updated successfully!")
            return redirect(reverse('admin_settings') + '?tab=profile')

        elif action == 'change_password':
            current_pw = request.POST.get('current_password', '')
            new_pw = request.POST.get('new_password', '')
            confirm_pw = request.POST.get('confirm_password', '')

            if not request.user.check_password(current_pw):
                messages.error(request, "Current administrator password is incorrect.")
                return redirect(reverse('admin_settings') + '?tab=security')
            if len(new_pw) < 6:
                messages.error(request, "New password must be at least 6 characters long.")
                return redirect(reverse('admin_settings') + '?tab=security')
            if new_pw != confirm_pw:
                messages.error(request, "New passwords do not match.")
                return redirect(reverse('admin_settings') + '?tab=security')

            request.user.set_password(new_pw)
            request.user.save()
            update_session_auth_hash(request, request.user)
            messages.success(request, "Administrator password changed successfully!")
            return redirect(reverse('admin_settings') + '?tab=security')

        elif action == 'broadcast':
            target = request.POST.get('target', 'all')
            title = request.POST.get('title', 'System Announcement').strip()
            message = request.POST.get('message', '').strip()
            notif_type = request.POST.get('notification_type', 'general')

            if not message:
                messages.error(request, "Broadcast message cannot be empty.")
                return redirect(reverse('admin_settings') + '?tab=broadcast')

            if target == 'elderly':
                recipients = User.objects.filter(elderly_profile__isnull=False)
            elif target == 'doctors':
                recipients = User.objects.filter(doctor_profile__isnull=False)
            else:
                recipients = User.objects.all()

            count = 0
            for r in recipients:
                Notification.objects.create(
                    user=r,
                    title=f"📢 {title}",
                    message=message,
                    notification_type=notif_type
                )
                count += 1

            messages.success(request, f"Broadcast announcement sent to {count} users!")
            return redirect(reverse('admin_settings') + '?tab=broadcast')

        elif action == 'clear_read_notifications':
            deleted_count, _ = Notification.objects.filter(is_read=True).delete()
            messages.success(request, f"Cleared {deleted_count} read notifications from database.")
            return redirect(reverse('admin_settings') + '?tab=maintenance')

    db_engine = settings.DATABASES['default']['ENGINE'].split('.')[-1]
    diagnostics = {
        'django_version': django.get_version(),
        'python_version': sys.version.split()[0],
        'db_engine': db_engine.upper(),
        'total_users': User.objects.count(),
        'total_elderly': ElderlyProfile.objects.count(),
        'total_doctors': DoctorProfile.objects.count(),
        'total_appointments': Appointment.objects.count(),
        'total_records': MedicalRecord.objects.count(),
        'total_notifications': Notification.objects.count(),
        'read_notifications': Notification.objects.filter(is_read=True).count(),
    }

    context = {
        'settings': system_settings,
        'diagnostics': diagnostics,
        'active_tab': request.GET.get('tab', 'general'),
    }
    return render(request, 'user/admin-settings.html', context)


# ═══════════════════════════════════════════════════════════════
# ACTIVITIES & EMERGENCY MODULES
# ═══════════════════════════════════════════════════════════════

@elderly_required
def activities_view(request):
    return render(request, 'user/activities.html')

@elderly_required
def emergency_view(request):
    return render(request, 'user/emergency.html')


# ═══════════════════════════════════════════════════════════════
# REDIRECT VIEWS FOR LEGACY / RELATIVE .html REQUESTS
# ═══════════════════════════════════════════════════════════════

def redirect_dashboard(request):
    path = request.path.lower()
    if 'doctor' in path or (request.user.is_authenticated and hasattr(request.user, 'doctor_profile')):
        return redirect('doctor_dashboard')
    elif 'admin' in path or (request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser)):
        return redirect('admin_dashboard')
    return redirect('elderly_dashboard')

def redirect_medical(request):
    return redirect('elderly_medical')

def redirect_prescriptions(request):
    return redirect('elderly_prescriptions')

def redirect_appointments(request):
    path = request.path.lower()
    if 'doctor' in path or (request.user.is_authenticated and hasattr(request.user, 'doctor_profile')):
        return redirect('doctor_appointments')
    elif 'admin' in path or (request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser)):
        return redirect('admin_appointments')
    return redirect('elderly_appointments')

def redirect_profile(request):
    path = request.path.lower()
    if 'doctor' in path or (request.user.is_authenticated and hasattr(request.user, 'doctor_profile')):
        return redirect('doctor_profile')
    return redirect('elderly_profile')

def redirect_doctors(request):
    path = request.path.lower()
    if 'admin' in path or (request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser)):
        return redirect('admin_doctors')
    return redirect('doctors')

def redirect_notifications(request):
    return redirect('notifications')

def redirect_change_password(request):
    return redirect('change_password')

def redirect_activities(request):
    return redirect('elderly_activities')

def redirect_emergency(request):
    return redirect('elderly_emergency')

def redirect_doctor_patients(request):
    return redirect('doctor_patients')

def redirect_admin_users(request):
    return redirect('admin_users')

def redirect_admin_records(request):
    return redirect('admin_records')

def redirect_admin_reports(request):
    return redirect('admin_reports')

def redirect_admin_emergency(request):
    return redirect('admin_emergency')

def redirect_admin_feedback(request):
    return redirect('admin_feedback')

def redirect_admin_medicine_reminders(request):
    return redirect('admin_medicine_reminders')

def redirect_admin_payments(request):
    return redirect('admin_payments')

def redirect_admin_health_assistant(request):
    return redirect('admin_health_assistant')

def redirect_admin_appointments(request):
    return redirect('admin_appointments')

def redirect_admin_doctors(request):
    return redirect('admin_doctors')

def redirect_admin_settings(request):
    return redirect('admin_settings')