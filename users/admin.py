from django.contrib import admin
from .models import (
    ElderlyProfile, DoctorProfile, Appointment, MedicalRecord,
    Consultation, Prescription, PrescriptionMedicine, Notification
)


@admin.register(ElderlyProfile)
class ElderlyProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'age', 'gender', 'phone', 'blood_group', 'emergency_contact_phone', 'created_at')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'phone', 'blood_group')
    list_filter = ('gender', 'blood_group')


@admin.register(DoctorProfile)
class DoctorProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'specialization', 'qualification', 'experience_years', 'contact_phone', 'is_approved', 'created_at')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'specialization')
    list_filter = ('is_approved', 'specialization')
    actions = ['approve_doctors', 'reject_doctors']

    def approve_doctors(self, request, queryset):
        queryset.update(is_approved=True)
    approve_doctors.short_description = "Approve selected doctors"

    def reject_doctors(self, request, queryset):
        queryset.update(is_approved=False)
    reject_doctors.short_description = "Reject selected doctors"


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'elderly', 'doctor', 'appointment_date', 'appointment_time', 'status', 'created_at')
    search_fields = ('elderly__username', 'doctor__username', 'reason')
    list_filter = ('status', 'appointment_date')


@admin.register(MedicalRecord)
class MedicalRecordAdmin(admin.ModelAdmin):
    list_display = ('id', 'elderly', 'doctor', 'title', 'record_date', 'follow_up_date')
    search_fields = ('elderly__username', 'title', 'diagnosis')
    list_filter = ('record_date',)


@admin.register(Consultation)
class ConsultationAdmin(admin.ModelAdmin):
    list_display = ('id', 'elderly', 'doctor', 'diagnosis', 'follow_up_date', 'consultation_date')
    search_fields = ('elderly__username', 'doctor__username', 'diagnosis')


class PrescriptionMedicineInline(admin.TabularInline):
    model = PrescriptionMedicine
    extra = 1


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ('id', 'elderly', 'doctor', 'created_at')
    search_fields = ('elderly__username', 'doctor__username')
    inlines = [PrescriptionMedicineInline]


@admin.register(PrescriptionMedicine)
class PrescriptionMedicineAdmin(admin.ModelAdmin):
    list_display = ('id', 'prescription', 'medicine_name', 'dosage', 'frequency', 'duration')
    search_fields = ('medicine_name', 'prescription__elderly__username')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'title', 'notification_type', 'is_read', 'created_at')
    search_fields = ('user__username', 'title', 'message')
    list_filter = ('notification_type', 'is_read')
