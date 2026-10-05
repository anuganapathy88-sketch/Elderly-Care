from datetime import date, time, timedelta
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from users.models import (
    ElderlyProfile, DoctorProfile, Appointment, MedicalRecord,
    Consultation, Prescription, PrescriptionMedicine, Notification
)


class Command(BaseCommand):
    help = "Seed database with demo admin, doctors, elderly patients, appointments, and prescriptions."

    def handle(self, *args, **options):
        self.stdout.write("Starting database seed...")

        # 1. Admin
        admin_user, created = User.objects.get_or_create(username='admin')
        admin_user.email = 'admin@eldercare.com'
        admin_user.first_name = 'System'
        admin_user.last_name = 'Admin'
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.set_password('admin123')
        admin_user.save()
        self.stdout.write(f"Admin: admin / admin123 ({'created' if created else 'updated'})")

        # 2. Doctors (Specialists)
        doctors_data = [
            {
                'username': 'dr_sharma',
                'email': 'dr.sharma@eldercare.com',
                'first_name': 'Rajesh',
                'last_name': 'Sharma',
                'specialization': 'Geriatric Medicine',
                'qualification': 'MBBS, MD (Geriatrics), Fellowship in Elderly Care',
                'experience_years': 16,
                'contact_phone': '9876500001',
                'clinic_address': 'Apollo Geriatric Clinic, Suite 402, Metro City',
                'consultation_fee': 600.00,
                'bio': 'Specialist in chronic disease management, dementia care, and preventative medicine for elderly patients.',
                'is_approved': True,
            },
            {
                'username': 'dr_priya',
                'email': 'dr.priya@eldercare.com',
                'first_name': 'Priya',
                'last_name': 'Patel',
                'specialization': 'Cardiology & Heart Care',
                'qualification': 'MBBS, MD, DM (Cardiology)',
                'experience_years': 12,
                'contact_phone': '9876500002',
                'clinic_address': 'Care Heart & Vascular Center, Block B, City Center',
                'consultation_fee': 750.00,
                'bio': 'Cardiologist with a special focus on hypertension, heart failure, and lifestyle modification in senior citizens.',
                'is_approved': True,
            },
            {
                'username': 'dr_anil',
                'email': 'dr.anil@eldercare.com',
                'first_name': 'Anil',
                'last_name': 'Verma',
                'specialization': 'Orthopedics & Joint Care',
                'qualification': 'MBBS, MS (Orthopedics), Fellowship in Joint Replacement',
                'experience_years': 14,
                'contact_phone': '9876500003',
                'clinic_address': 'Orthocare & Arthritis Center, 12 Park Avenue',
                'consultation_fee': 650.00,
                'bio': 'Orthopedic surgeon focusing on arthritis management, joint health, and fall prevention in elderly patients.',
                'is_approved': True,
            },
            {
                'username': 'dr_sunita',
                'email': 'dr.sunita@eldercare.com',
                'first_name': 'Sunita',
                'last_name': 'Kulkarni',
                'specialization': 'Neurology & Memory Care',
                'qualification': 'MBBS, MD (Medicine), DM (Neurology)',
                'experience_years': 15,
                'contact_phone': '9876500004',
                'clinic_address': 'Mind & Memory Neuro Clinic, Sector 18, Metro City',
                'consultation_fee': 800.00,
                'bio': 'Specialist in cognitive health, Alzheimer\'s, Parkinson\'s disease, and memory support for elderly individuals.',
                'is_approved': True,
            },
            {
                'username': 'dr_arvind',
                'email': 'dr.arvind@eldercare.com',
                'first_name': 'Arvind',
                'last_name': 'Swaminathan',
                'specialization': 'Diabetology & Endocrinology',
                'qualification': 'MBBS, MD, Fellowship in Geriatric Diabetology',
                'experience_years': 18,
                'contact_phone': '9876500005',
                'clinic_address': 'Apex Diabetes & Endocrine Center, Civil Lines',
                'consultation_fee': 700.00,
                'bio': 'Focused on long-term glycemic control, diabetic neuropathy prevention, and thyroid management in elderly patients.',
                'is_approved': True,
            },
            {
                'username': 'dr_meenakshi',
                'email': 'dr.meenakshi@eldercare.com',
                'first_name': 'Meenakshi',
                'last_name': 'Sundaram',
                'specialization': 'Pulmonology & Respiratory Care',
                'qualification': 'MBBS, MD (Pulmonary Medicine), FCCN',
                'experience_years': 13,
                'contact_phone': '9876500006',
                'clinic_address': 'Breathe Easy Chest Care Clinic, Ring Road',
                'consultation_fee': 750.00,
                'bio': 'Specializes in chronic bronchitis, COPD, asthma, and sleep-related breathing disorders in senior citizens.',
                'is_approved': True,
            },
            {
                'username': 'dr_vikram',
                'email': 'dr.vikram@eldercare.com',
                'first_name': 'Vikram',
                'last_name': 'Malhotra',
                'specialization': 'Ophthalmology & Cataract Care',
                'qualification': 'MBBS, MS (Ophthalmology), DNB',
                'experience_years': 16,
                'contact_phone': '9876500007',
                'clinic_address': 'Vision Eye & Cataract Center, MG Road',
                'consultation_fee': 600.00,
                'bio': 'Senior ophthalmic surgeon specializing in micro-incision cataract surgery, glaucoma, and macular degeneration.',
                'is_approved': True,
            },
            {
                'username': 'dr_ananya',
                'email': 'dr.ananya@eldercare.com',
                'first_name': 'Ananya',
                'last_name': 'Sen',
                'specialization': 'Geriatric Psychiatry',
                'qualification': 'MBBS, MD (Psychiatry), DPM',
                'experience_years': 11,
                'contact_phone': '9876500008',
                'clinic_address': 'Harmony Mind Care & Counseling Center, Defense Colony',
                'consultation_fee': 700.00,
                'bio': 'Compassionate mental health specialist focusing on late-life depression, anxiety, insomnia, and caregiver support.',
                'is_approved': True,
            },
            {
                'username': 'dr_rohan',
                'email': 'dr.rohan@eldercare.com',
                'first_name': 'Rohan',
                'last_name': 'Deshmukh',
                'specialization': 'Physiotherapy & Rehabilitation',
                'qualification': 'BPT, MPT (Neuro-Physiotherapy), MIAP',
                'experience_years': 10,
                'contact_phone': '9876500009',
                'clinic_address': 'Revive Geriatric Rehab & Mobility Studio, Vasant Kunj',
                'consultation_fee': 500.00,
                'bio': 'Rehabilitation expert dedicated to mobility restoration, balance training, fall prevention, and post-stroke recovery.',
                'is_approved': True,
            },
            {
                'username': 'dr_kavita',
                'email': 'dr.kavita@eldercare.com',
                'first_name': 'Kavita',
                'last_name': 'Nair',
                'specialization': 'Nephrology & Kidney Care',
                'qualification': 'MBBS, MD, DM (Nephrology)',
                'experience_years': 14,
                'contact_phone': '9876500010',
                'clinic_address': 'NephroCare Kidney Institute, South Extension',
                'consultation_fee': 800.00,
                'bio': 'Specialist in diabetic nephropathy, age-related renal function decline, and electrolyte balance in elderly patients.',
                'is_approved': True,
            },
            {
                'username': 'dr_sameer',
                'email': 'dr.sameer@eldercare.com',
                'first_name': 'Sameer',
                'last_name': 'Joshi',
                'specialization': 'Dermatology & Skin Care',
                'qualification': 'MBBS, MD (Dermatology)',
                'experience_years': 8,
                'contact_phone': '9876500011',
                'clinic_address': 'Derma Care Skin Clinic, Mall Road',
                'consultation_fee': 550.00,
                'bio': 'Dermatologist managing dry skin, senile purpura, skin infections, and wound care in elderly patients.',
                'is_approved': False,
            },
        ]

        doc_objs = {}
        for d in doctors_data:
            u, _ = User.objects.get_or_create(username=d['username'])
            u.email = d['email']
            u.first_name = d['first_name']
            u.last_name = d['last_name']
            u.set_password('doctor123')
            u.save()

            prof, _ = DoctorProfile.objects.get_or_create(user=u)
            prof.specialization = d['specialization']
            prof.qualification = d['qualification']
            prof.experience_years = d['experience_years']
            prof.contact_phone = d['contact_phone']
            prof.clinic_address = d['clinic_address']
            prof.consultation_fee = d['consultation_fee']
            prof.bio = d['bio']
            prof.is_approved = d['is_approved']
            prof.save()
            doc_objs[d['username']] = u

        doc1_user = doc_objs['dr_sharma']
        doc2_user = doc_objs['dr_priya']
        self.stdout.write(f"Seeded {len(doctors_data)} specialized doctors.")

        # 5. Elderly Patient 1
        eld1_user, _ = User.objects.get_or_create(username='ramesh_kumar')
        eld1_user.email = 'ramesh@eldercare.com'
        eld1_user.first_name = 'Ramesh'
        eld1_user.last_name = 'Kumar'
        eld1_user.set_password('patient123')
        eld1_user.save()

        eld1_prof, _ = ElderlyProfile.objects.get_or_create(user=eld1_user)
        eld1_prof.age = 72
        eld1_prof.gender = 'Male'
        eld1_prof.phone = '9876543210'
        eld1_prof.address = '42 Sunshine Heights, Green Park, Delhi'
        eld1_prof.blood_group = 'B+'
        eld1_prof.emergency_contact_name = 'Rohit Kumar (Son)'
        eld1_prof.emergency_contact_phone = '9876543211'
        eld1_prof.save()

        # 6. Appointments
        today = date.today()

        # Completed Appointment with Dr. Sharma
        appt_completed, _ = Appointment.objects.get_or_create(
            elderly=eld1_user,
            doctor=doc1_user,
            appointment_date=today - timedelta(days=5),
            defaults={
                'appointment_time': time(10, 30),
                'reason': 'Routine blood pressure review and joint pain consultation',
                'status': 'completed',
                'notes': 'Patient completed consultation with Dr. Sharma'
            }
        )

        # Upcoming Accepted Appointment with Dr. Sharma
        Appointment.objects.get_or_create(
            elderly=eld1_user,
            doctor=doc1_user,
            appointment_date=today + timedelta(days=7),
            defaults={
                'appointment_time': time(11, 0),
                'reason': 'Follow-up blood pressure check and prescription refill review',
                'status': 'accepted',
                'notes': 'Confirmed with doctor'
            }
        )

        # Pending Appointment Request with Dr. Priya
        Appointment.objects.get_or_create(
            elderly=eld1_user,
            doctor=doc2_user,
            appointment_date=today + timedelta(days=3),
            defaults={
                'appointment_time': time(14, 0),
                'reason': 'Consultation regarding occasional dizziness and heart palpitations',
                'status': 'pending',
                'notes': 'Waiting for doctor confirmation'
            }
        )

        # 7. Consultation & Prescription for Completed Appointment
        consultation, _ = Consultation.objects.get_or_create(
            appointment=appt_completed,
            defaults={
                'doctor': doc1_user,
                'elderly': eld1_user,
                'diagnosis': 'Stage 1 Hypertension & Mild Knee Osteoarthritis',
                'symptoms': 'BP 138/88 mmHg, mild morning stiffness in both knees, occasional fatigue.',
                'treatment_advice': 'Maintain low-sodium diet, 20-minute gentle morning walk, avoid heavy lifting.',
                'follow_up_date': today + timedelta(days=25)
            }
        )

        MedicalRecord.objects.get_or_create(
            elderly=eld1_user,
            doctor=doc1_user,
            title='Checkup: Stage 1 Hypertension & Osteoarthritis',
            defaults={
                'diagnosis': 'Stage 1 Hypertension & Mild Knee Osteoarthritis',
                'symptoms': 'BP 138/88 mmHg, morning stiffness',
                'treatment_advice': 'Maintain low-sodium diet, regular light exercise.',
                'follow_up_date': today + timedelta(days=25)
            }
        )

        prescription, _ = Prescription.objects.get_or_create(
            consultation=consultation,
            defaults={
                'appointment': appt_completed,
                'doctor': doc1_user,
                'elderly': eld1_user,
                'notes': 'Take medications with meals. Measure BP weekly and log readings.'
            }
        )

        # Medicines
        PrescriptionMedicine.objects.get_or_create(
            prescription=prescription,
            medicine_name='Amlodipine 5mg',
            defaults={
                'dosage': '1 tablet',
                'frequency': 'Once daily (morning)',
                'duration': '30 days',
                'instructions': 'Take after breakfast with water'
            }
        )

        PrescriptionMedicine.objects.get_or_create(
            prescription=prescription,
            medicine_name='Glucosamine + Chondroitin',
            defaults={
                'dosage': '1 capsule',
                'frequency': 'Twice daily',
                'duration': '60 days',
                'instructions': 'Take with meals to support joint mobility'
            }
        )

        PrescriptionMedicine.objects.get_or_create(
            prescription=prescription,
            medicine_name='Paracetamol 650mg',
            defaults={
                'dosage': '1 tablet',
                'frequency': 'As needed for joint pain (Max 3/day)',
                'duration': '10 days',
                'instructions': 'Do not take on an empty stomach'
            }
        )

        # 8. Notifications
        Notification.objects.get_or_create(
            user=eld1_user,
            title='Appointment Confirmed! 🩺',
            defaults={
                'message': f'Your appointment with Dr. Rajesh Sharma on {today + timedelta(days=7)} at 11:00 AM has been confirmed.',
                'notification_type': 'appointment_confirmed',
                'is_read': False
            }
        )

        Notification.objects.get_or_create(
            user=eld1_user,
            title='Prescription Issued',
            defaults={
                'message': 'Dr. Rajesh Sharma has issued your prescription for Hypertension and Joint health.',
                'notification_type': 'consultation_done',
                'is_read': True
            }
        )

        Notification.objects.get_or_create(
            user=doc2_user,
            title='New Appointment Request',
            defaults={
                'message': f'Ramesh Kumar has requested an appointment for {today + timedelta(days=3)} at 2:00 PM.',
                'notification_type': 'appointment_reminder',
                'is_read': False
            }
        )

        self.stdout.write(self.style.SUCCESS("Database seeded successfully!"))
        self.stdout.write("Credentials:")
        self.stdout.write("  Admin:   admin / admin123")
        self.stdout.write("  Doctor:  dr.sharma@eldercare.com / doctor123 (Approved)")
        self.stdout.write("  Doctor:  dr.priya@eldercare.com / doctor123 (Approved)")
        self.stdout.write("  Doctor:  dr.anil@eldercare.com / doctor123 (Pending Admin Approval)")
        self.stdout.write("  Elderly: ramesh@eldercare.com / patient123")
