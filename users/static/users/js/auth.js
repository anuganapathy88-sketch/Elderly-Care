/**
 * Smart Elderly Care Management System
 * Authentication Module
 */

const Auth = (() => {
  // ── Validation Helpers ────────────────────────────────────
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePhone = (phone) => /^[6-9]\d{9}$/.test(phone.replace(/\s+/g, ''));
  const validatePassword = (pw) => pw.length >= 6;

  const showError = (fieldId, msg) => {
    const el = document.getElementById(fieldId + '_error');
    if (el) { el.textContent = msg; el.classList.add('visible'); }
  };

  const clearErrors = () => {
    document.querySelectorAll('.field-error').forEach((el) => {
      el.textContent = '';
      el.classList.remove('visible');
    });
  };

  const showToast = (msg, type = 'success') => {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${msg}`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  };

  // ── Register ──────────────────────────────────────────────
  const register = (e) => {
    e.preventDefault();
    clearErrors();

    const name = document.getElementById('reg_name').value.trim();
    const email = document.getElementById('reg_email').value.trim();
    const phone = document.getElementById('reg_phone').value.trim();
    const password = document.getElementById('reg_password').value;
    const confirmPw = document.getElementById('reg_confirm_password').value;
    const age = document.getElementById('reg_age').value;
    const gender = document.getElementById('reg_gender').value;

    let valid = true;

    if (!name || name.length < 2) { showError('reg_name', 'Please enter a valid full name'); valid = false; }
    if (!validateEmail(email)) { showError('reg_email', 'Please enter a valid email address'); valid = false; }
    if (!validatePhone(phone)) { showError('reg_phone', 'Enter a valid 10-digit mobile number'); valid = false; }
    if (!validatePassword(password)) { showError('reg_password', 'Password must be at least 6 characters'); valid = false; }
    if (password !== confirmPw) { showError('reg_confirm_password', 'Passwords do not match'); valid = false; }
    if (!age || age < 1 || age > 120) { showError('reg_age', 'Please enter a valid age'); valid = false; }
    if (!gender) { showError('reg_gender', 'Please select a gender'); valid = false; }

    if (!valid) return;

    if (Storage.getUserByEmail(email)) {
      showError('reg_email', 'An account with this email already exists');
      return;
    }

    const user = {
      id: 'usr_' + Date.now(),
      name, email, phone, password, age, gender,
      role: 'patient',
      createdAt: new Date().toISOString(),
    };

    Storage.createUser(user);
    Storage.setSession(user);
    
    showToast('Registration successful! Welcome to ElderCare.');
    setTimeout(() => window.location.href = 'dashboard.html', 1500);
  };

  // ── Login ─────────────────────────────────────────────────
  const login = (e) => {
    e.preventDefault();
    clearErrors();

    const email = document.getElementById('login_email').value.trim();
    const password = document.getElementById('login_password').value;

    let valid = true;
    if (!validateEmail(email)) { showError('login_email', 'Enter a valid email address'); valid = false; }
    if (!password) { showError('login_password', 'Password is required'); valid = false; }
    if (!valid) return;

    // Check Admin
    if (email === 'admin@eldercare.com') {
      if (password !== 'admin123') {
        showToast('Invalid admin credentials', 'error');
        return;
      }
      Storage.setSession({ id: 'admin_1', name: 'System Admin', email: 'admin@eldercare.com', role: 'admin' });
      showToast('Welcome Admin!');
      setTimeout(() => window.location.href = 'admin-dashboard.html', 1200);
      return;
    }

    // Check Doctors first
    const docs = Storage.getDoctors();
    const doctor = docs.find(d => d.email.toLowerCase() === email.toLowerCase());
    
    if (doctor) {
      if (doctor.status === 'pending') {
        showToast('Your registration is pending admin approval.', 'error');
        return;
      }
      if (doctor.status === 'inactive') {
        showToast('Your account has been deactivated.', 'error');
        return;
      }
      if (password !== 'password123') { // Hardcoded for prototype
        showToast('Invalid email or password', 'error');
        return;
      }
      const docSession = { ...doctor, role: 'doctor' };
      Storage.setSession(docSession);
      showToast('Welcome Dr. ' + doctor.name.replace('Dr. ', '') + '!');
      setTimeout(() => window.location.href = 'doctor-dashboard.html', 1200);
      return;
    }

    // Check Patients
    const user = Storage.getUserByEmail(email);
    if (!user || user.password !== password) {
      showToast('Invalid email or password', 'error');
      return;
    }

    if (user.isActive === false) {
      showToast('Your account has been suspended by the Admin.', 'error');
      return;
    }

    user.role = 'patient'; // ensure legacy accounts have the role
    Storage.setSession(user);
    showToast('Welcome back, ' + user.name.split(' ')[0] + '!');
    setTimeout(() => window.location.href = 'dashboard.html', 1200);
  };

  // ── Logout ────────────────────────────────────────────────
  const logout = () => {
    Storage.clearSession();
    window.location.href = 'index.html';
  };

  // ── Change Password ───────────────────────────────────────
  const changePassword = (e) => {
    e.preventDefault();
    clearErrors();

    const current = document.getElementById('cp_current').value;
    const newPw = document.getElementById('cp_new').value;
    const confirmPw = document.getElementById('cp_confirm').value;

    const session = Storage.getCurrentSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const user = Storage.getUserByEmail(session.email);
    let valid = true;

    if (!current) { showError('cp_current', 'Current password is required'); valid = false; }
    else if (user.password !== current) { showError('cp_current', 'Current password is incorrect'); valid = false; }
    if (!validatePassword(newPw)) { showError('cp_new', 'New password must be at least 6 characters'); valid = false; }
    if (newPw !== confirmPw) { showError('cp_confirm', 'Passwords do not match'); valid = false; }
    if (newPw === current) { showError('cp_new', 'New password must be different from current password'); valid = false; }

    if (!valid) return;

    Storage.updateUser(user.id, { password: newPw });
    showToast('Password changed successfully!');
    setTimeout(() => window.location.href = 'profile.html', 1500);
  };

  // ── Toggle Password Visibility ───────────────────────────
  const togglePassword = (inputId, iconEl) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      iconEl.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
      input.type = 'password';
      iconEl.classList.replace('fa-eye-slash', 'fa-eye');
    }
  };

  return { register, login, logout, changePassword, togglePassword, showToast };
})();
