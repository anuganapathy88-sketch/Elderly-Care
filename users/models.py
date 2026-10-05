from django.db import models
from django.contrib.auth.models import User


class ElderlyProfile(models.Model):
    GENDER_CHOICES = [
        ('Male', 'Male'),
        ('Female', 'Female'),
        ('Other', 'Other'),
        ('Prefer not to say', 'Prefer not to say'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='elderly_profile')
    age = models.PositiveIntegerField(null=True, blank=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    blood_group = models.CharField(max_length=10, blank=True)
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} (Elderly)"

    @property
    def full_name(self):
        return self.user.get_full_name() or self.user.username


class DoctorProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='doctor_profile')
    specialization = models.CharField(max_length=120)
    qualification = models.CharField(max_length=150, blank=True)
    experience_years = models.PositiveIntegerField(default=0)
    contact_phone = models.CharField(max_length=20, blank=True)
    clinic_address = models.TextField(blank=True)
    consultation_fee = models.DecimalField(max_digits=8, decimal_places=2, default=0.00)
    bio = models.TextField(blank=True)
    is_approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        status = "Approved" if self.is_approved else "Pending Approval"
        return f"Dr. {self.user.get_full_name() or self.user.username} - {self.specialization} ({status})"

    @property
    def full_name(self):
        name = self.user.get_full_name() or self.user.username
        if not name.startswith("Dr."):
            return f"Dr. {name}"
        return name


class Appointment(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    elderly = models.ForeignKey(User, on_delete=models.CASCADE, related_name='elderly_appointments')
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='doctor_appointments')
    appointment_date = models.DateField()
    appointment_time = models.TimeField()
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-appointment_date', '-appointment_time']

    def __str__(self):
        return f"Appt #{self.id}: {self.elderly.username} with {self.doctor.username} on {self.appointment_date} ({self.status})"


class MedicalRecord(models.Model):
    elderly = models.ForeignKey(User, on_delete=models.CASCADE, related_name='medical_records')
    doctor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_records')
    record_date = models.DateField(auto_now_add=True)
    title = models.CharField(max_length=200, default='Medical Checkup')
    diagnosis = models.TextField(blank=True)
    symptoms = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    treatment_advice = models.TextField(blank=True)
    follow_up_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Record: {self.elderly.username} - {self.title} ({self.record_date})"


class Consultation(models.Model):
    appointment = models.OneToOneField(Appointment, on_delete=models.SET_NULL, null=True, blank=True, related_name='consultation')
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='doctor_consultations')
    elderly = models.ForeignKey(User, on_delete=models.CASCADE, related_name='elderly_consultations')
    diagnosis = models.TextField()
    symptoms = models.TextField(blank=True)
    treatment_advice = models.TextField(blank=True)
    follow_up_date = models.DateField(null=True, blank=True)
    consultation_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-consultation_date']

    def __str__(self):
        return f"Consultation #{self.id} for {self.elderly.username} by Dr. {self.doctor.username}"


class Prescription(models.Model):
    consultation = models.OneToOneField(Consultation, on_delete=models.SET_NULL, null=True, blank=True, related_name='prescription')
    appointment = models.ForeignKey(Appointment, on_delete=models.SET_NULL, null=True, blank=True, related_name='prescriptions')
    doctor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='doctor_prescriptions')
    elderly = models.ForeignKey(User, on_delete=models.CASCADE, related_name='elderly_prescriptions')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Prescription #{self.id} for {self.elderly.username}"


class PrescriptionMedicine(models.Model):
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name='medicines')
    medicine_name = models.CharField(max_length=150)
    dosage = models.CharField(max_length=100)
    frequency = models.CharField(max_length=100)
    duration = models.CharField(max_length=100)
    instructions = models.TextField(blank=True)

    def __str__(self):
        return f"{self.medicine_name} - {self.dosage} ({self.frequency})"


class Notification(models.Model):
    TYPE_CHOICES = [
        ('appointment_confirmed', 'Appointment Confirmed'),
        ('appointment_reminder', 'Appointment Reminder'),
        ('appointment_rejected', 'Appointment Rejected'),
        ('consultation_done', 'Consultation Completed'),
        ('doctor_approved', 'Doctor Approved'),
        ('general', 'General Notification'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=200)
    message = models.TextField()
    notification_type = models.CharField(max_length=50, choices=TYPE_CHOICES, default='general')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Notification for {self.user.username}: {self.title}"


# Role resolution helper
def get_user_role(user):
    if not user or not user.is_authenticated:
        return 'anonymous'
    if user.is_superuser or user.is_staff:
        return 'admin'
    if hasattr(user, 'doctor_profile'):
        return 'doctor'
    if hasattr(user, 'elderly_profile'):
        return 'elderly'
    return 'user'