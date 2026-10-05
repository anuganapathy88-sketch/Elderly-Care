/**
 * Smart Elderly Care Management System
 * Profile Module — View & Edit
 */

const Profile = (() => {
  const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  const getInitials = (name) =>
    name ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  const renderAvatar = (user, containerEl) => {
    if (user.photo) {
      containerEl.innerHTML = `<img src="${user.photo}" alt="${user.name}" />`;
    } else {
      containerEl.innerHTML = `<span class="avatar-initials">${getInitials(user.name)}</span>`;
    }
  };

  // ── Populate View Profile ────────────────────────────────
  const loadProfile = () => {
    const session = Storage.getCurrentSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const user = Storage.getUserById(session.id) || session;

    // Avatar
    const avatarEl = document.getElementById('profile_avatar');
    if (avatarEl) renderAvatar(user, avatarEl);

    // Text fields
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || '—';
    };

    set('pv_name', user.name);
    set('pv_email', user.email);
    set('pv_phone', user.phone);
    set('pv_age', user.age ? user.age + ' years' : '');
    set('pv_gender', user.gender);
    set('pv_blood', user.bloodGroup);
    set('pv_address', user.address);
    set('pv_ec_name', user.emergencyContactName);
    set('pv_ec_phone', user.emergencyContactPhone);

    // Header greeting
    const greet = document.getElementById('profile_greeting');
    if (greet) greet.textContent = 'Hello, ' + (user.name?.split(' ')[0] || 'User') + '!';
  };

  // ── Populate Edit Profile Form ────────────────────────────
  const loadEditForm = () => {
    const session = Storage.getCurrentSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const user = Storage.getUserById(session.id) || session;

    const val = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };

    val('edit_name', user.name);
    val('edit_email', user.email);
    val('edit_phone', user.phone);
    val('edit_age', user.age);
    val('edit_address', user.address);
    val('edit_ec_name', user.emergencyContactName);
    val('edit_ec_phone', user.emergencyContactPhone);

    // Gender select
    const genderEl = document.getElementById('edit_gender');
    if (genderEl) genderEl.value = user.gender || '';

    // Blood group select
    const bloodEl = document.getElementById('edit_blood');
    if (bloodEl) bloodEl.value = user.bloodGroup || '';

    // Avatar preview
    const avatarPreview = document.getElementById('avatar_preview');
    if (avatarPreview) renderAvatar(user, avatarPreview);
  };

  // ── Save Profile ──────────────────────────────────────────
  const saveProfile = (e) => {
    e.preventDefault();

    const session = Storage.getCurrentSession();
    if (!session) { window.location.href = 'index.html'; return; }

    // Basic validation
    const name = document.getElementById('edit_name').value.trim();
    const phone = document.getElementById('edit_phone').value.trim();
    const age = document.getElementById('edit_age').value;

    let valid = true;
    const showErr = (id, msg) => {
      const el = document.getElementById(id + '_error');
      if (el) { el.textContent = msg; el.classList.add('visible'); }
      valid = false;
    };
    const clearErrs = () => document.querySelectorAll('.field-error').forEach(el => {
      el.textContent = ''; el.classList.remove('visible');
    });

    clearErrs();
    if (!name || name.length < 2) showErr('edit_name', 'Name must be at least 2 characters');
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\s+/g, ''))) showErr('edit_phone', 'Enter a valid 10-digit mobile number');
    if (!age || age < 1 || age > 120) showErr('edit_age', 'Enter a valid age');

    if (!valid) return;

    const updates = {
      name,
      phone,
      age: parseInt(age),
      gender: document.getElementById('edit_gender').value,
      bloodGroup: document.getElementById('edit_blood').value,
      address: document.getElementById('edit_address').value.trim(),
      emergencyContactName: document.getElementById('edit_ec_name').value.trim(),
      emergencyContactPhone: document.getElementById('edit_ec_phone').value.trim(),
    };

    // Photo
    const photoData = document.getElementById('avatar_preview')?.querySelector('img')?.src;
    if (photoData && photoData.startsWith('data:')) updates.photo = photoData;

    Storage.updateUser(session.id, updates);
    Auth.showToast('Profile updated successfully!');
    setTimeout(() => window.location.href = 'profile.html', 1300);
  };

  // ── Photo Upload Handler ──────────────────────────────────
  const handlePhotoUpload = (inputEl) => {
    const file = inputEl.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { Auth.showToast('Please select an image file', 'error'); return; }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const preview = document.getElementById('avatar_preview');
      if (preview) preview.innerHTML = `<img src="${ev.target.result}" alt="Profile Photo" />`;
    };
    reader.readAsDataURL(file);
  };

  return { loadProfile, loadEditForm, saveProfile, handlePhotoUpload };
})();
