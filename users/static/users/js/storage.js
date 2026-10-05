/**
 * Smart Elderly Care Management System
 * Storage Helper - LocalStorage CRUD utilities
 */

const Storage = (() => {
  const KEYS = {
    USERS: 'eldc_users',
    CURRENT_USER: 'eldc_current_user',
    SESSION: 'eldc_session',
    DOCTORS: 'eldc_doctors',
    APPOINTMENTS: 'eldc_appointments',
    MEDICAL_HISTORY: 'eldc_medical_history',
    PRESCRIPTIONS: 'eldc_prescriptions',
    CONSULT_NOTES: 'eldc_consult_notes',
    NOTIFICATIONS: 'eldc_notifications',
  };

  // ── Users ──────────────────────────────────────────────
  const getUsers = () => JSON.parse(localStorage.getItem(KEYS.USERS)) || [];

  const saveUsers = (users) =>
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));

  const getUserByEmail = (email) =>
    getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());

  const getUserById = (id) => getUsers().find((u) => u.id === id);

  const createUser = (userData) => {
    const users = getUsers();
    const newUser = {
      id: 'usr_' + Date.now(),
      createdAt: new Date().toISOString(),
      ...userData,
    };
    users.push(newUser);
    saveUsers(users);
    return newUser;
  };

  const updateUser = (id, updates) => {
    const users = getUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() };
    saveUsers(users);
    // Refresh current session if updating logged-in user
    if (getCurrentSession()?.id === id) {
      setSession(users[idx]);
    }
    return users[idx];
  };

  // ── Session ──────────────────────────────────────────────
  const setSession = (user) => {
    // Store without password
    const { password, ...safeUser } = user;
    sessionStorage.setItem(KEYS.SESSION, JSON.stringify(safeUser));
    localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(safeUser));
  };

  const getCurrentSession = () => {
    try {
      const s = sessionStorage.getItem(KEYS.SESSION) || localStorage.getItem(KEYS.CURRENT_USER);
      if (s) return JSON.parse(s);
    } catch(e) {}
    if (typeof window !== 'undefined' && window.__CURRENT_USER) {
      return window.__CURRENT_USER;
    }
    return { id: 'usr_default', name: 'User', role: 'elderly' };
  };

  const clearSession = () => {
    sessionStorage.removeItem(KEYS.SESSION);
    localStorage.removeItem(KEYS.CURRENT_USER);
  };

  const isLoggedIn = () => !!(sessionStorage.getItem(KEYS.SESSION) || localStorage.getItem(KEYS.CURRENT_USER) || (typeof window !== 'undefined' && window.__CURRENT_USER));

  // ── Generic user-scoped CRUD ────────────────────────────────
  const _getList = (key) => {
    const session = getCurrentSession();
    const all = JSON.parse(localStorage.getItem(key)) || [];
    if (!session || !session.id) return all;
    return all.filter(i => !i.userId || String(i.userId) === String(session.id) || String(i.userId) === 'usr_default');
  };

  const _saveList = (key, list) => {
    const session = getCurrentSession();
    const sessionId = (session && session.id) ? String(session.id) : 'usr_default';
    const all = JSON.parse(localStorage.getItem(key)) || [];
    const others = all.filter(i => i.userId && String(i.userId) !== sessionId && String(i.userId) !== 'usr_default');
    localStorage.setItem(key, JSON.stringify([...others, ...list]));
  };

  const _add = (key, prefix, data) => {
    const session = getCurrentSession();
    const list = _getList(key);
    const userId = (session && session.id) ? session.id : (data && data.userId ? data.userId : 'usr_default');
    const item = { id: (data && data.id) ? data.id : (prefix + '_' + Date.now()), userId: userId, createdAt: (data && data.createdAt) ? data.createdAt : new Date().toISOString(), ...data };
    list.push(item);
    _saveList(key, list);
    return item;
  };

  const _update = (key, id, data) => {
    const list = _getList(key);
    const idx = list.findIndex(i => String(i.id) === String(id));
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
    _saveList(key, list);
    return list[idx];
  };

  const _remove = (key, id) => _saveList(key, _getList(key).filter(i => String(i.id) !== String(id)));

  // ── Doctors (global, not user-scoped) ──────────────────────
  const getDoctors = () => JSON.parse(localStorage.getItem(KEYS.DOCTORS)) || [];
  const saveDoctors = (list) => localStorage.setItem(KEYS.DOCTORS, JSON.stringify(list));
  const getDoctorById = (id) => getDoctors().find(d => d.id === id);

  // ── Medical History ─────────────────────────────────────────
  const getMedicalHistory  = () => _getList(KEYS.MEDICAL_HISTORY);
  const addMedicalHistory  = (data) => _add(KEYS.MEDICAL_HISTORY, 'mh', data);
  const updateMedicalHistory = (id, data) => _update(KEYS.MEDICAL_HISTORY, id, data);
  const removeMedicalHistory = (id) => _remove(KEYS.MEDICAL_HISTORY, id);

  // ── Prescriptions ───────────────────────────────────────────
  const getPrescriptions   = () => _getList(KEYS.PRESCRIPTIONS);
  const addPrescription    = (data) => _add(KEYS.PRESCRIPTIONS, 'rx', data);
  const updatePrescription = (id, data) => _update(KEYS.PRESCRIPTIONS, id, data);
  const removePrescription = (id) => _remove(KEYS.PRESCRIPTIONS, id);

  // ── Consultation Notes ──────────────────────────────────────
  const getConsultNotes    = () => _getList(KEYS.CONSULT_NOTES);
  const addConsultNote     = (data) => _add(KEYS.CONSULT_NOTES, 'cn', data);
  const updateConsultNote  = (id, data) => _update(KEYS.CONSULT_NOTES, id, data);
  const removeConsultNote  = (id) => _remove(KEYS.CONSULT_NOTES, id);

  // ── Notifications ───────────────────────────────────────────
  const getNotifications     = () => _getList(KEYS.NOTIFICATIONS).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const addNotification      = (data) => _add(KEYS.NOTIFICATIONS, 'notif', data);
  const markNotifRead        = (id) => _update(KEYS.NOTIFICATIONS, id, { read: true });
  const markAllNotifsRead    = () => {
    const list = _getList(KEYS.NOTIFICATIONS).map(n => ({ ...n, read: true }));
    _saveList(KEYS.NOTIFICATIONS, list);
  };
  const getUnreadCount       = () => _getList(KEYS.NOTIFICATIONS).filter(n => !n.read).length;
  const removeNotification   = (id) => _remove(KEYS.NOTIFICATIONS, id);

  // ── Doctor Portal Specifics ─────────────────────────────────
  const getDoctorAppointments = () => {
    const session = getCurrentSession();
    if (!session || session.role !== 'doctor') return [];
    const all = JSON.parse(localStorage.getItem(KEYS.APPOINTMENTS)) || [];
    return all.filter(a => a.doctorId === session.id).sort((a, b) => new Date(a.date + 'T' + (a.time||'00:00')) - new Date(b.date + 'T' + (b.time||'00:00')));
  };

  const updateDoctorAppointment = (id, data) => {
    const all = JSON.parse(localStorage.getItem(KEYS.APPOINTMENTS)) || [];
    const idx = all.findIndex(a => a.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...data, updatedAt: new Date().toISOString() };
      localStorage.setItem(KEYS.APPOINTMENTS, JSON.stringify(all));
      return all[idx];
    }
    return null;
  };

  const getDoctorPatients = () => {
    const appts = getDoctorAppointments();
    const patientIds = [...new Set(appts.map(a => a.userId))];
    const allUsers = getUsers();
    return patientIds.map(pid => allUsers.find(u => u.id === pid)).filter(Boolean);
  };

  const getPatientMedicalHistory = (patientId) => {
    const all = JSON.parse(localStorage.getItem(KEYS.MEDICAL_HISTORY)) || [];
    return all.filter(i => i.userId === patientId);
  };

  const getPatientPrescriptions = (patientId) => {
    const all = JSON.parse(localStorage.getItem(KEYS.PRESCRIPTIONS)) || [];
    return all.filter(i => i.userId === patientId);
  };

  const addPatientConsultNote = (patientId, data) => {
    const all = JSON.parse(localStorage.getItem(KEYS.CONSULT_NOTES)) || [];
    const item = { id: 'cn_' + Date.now(), userId: patientId, createdAt: new Date().toISOString(), ...data };
    all.push(item);
    localStorage.setItem(KEYS.CONSULT_NOTES, JSON.stringify(all));
    return item;
  };

  const addPatientPrescription = (patientId, data) => {
    const all = JSON.parse(localStorage.getItem(KEYS.PRESCRIPTIONS)) || [];
    const item = { id: 'rx_' + Date.now(), userId: patientId, createdAt: new Date().toISOString(), ...data };
    all.push(item);
    localStorage.setItem(KEYS.PRESCRIPTIONS, JSON.stringify(all));
    return item;
  };

  const addPatientNotification = (patientId, data) => {
    const all = JSON.parse(localStorage.getItem(KEYS.NOTIFICATIONS)) || [];
    const item = { id: 'notif_' + Date.now(), userId: patientId, createdAt: new Date().toISOString(), ...data };
    all.push(item);
    localStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify(all));
    return item;
  };

  // ── Admin Portal Specifics ──────────────────────────────────
  const getAllAppointments = () => JSON.parse(localStorage.getItem(KEYS.APPOINTMENTS)) || [];
  
  const getAllMedicalHistory = () => JSON.parse(localStorage.getItem(KEYS.MEDICAL_HISTORY)) || [];
  
  const getAllPrescriptions = () => JSON.parse(localStorage.getItem(KEYS.PRESCRIPTIONS)) || [];

  const updateUserStatus = (id, isActive) => {
    const list = getUsers();
    const idx = list.findIndex(u => u.id === id);
    if (idx !== -1) {
      list[idx].isActive = isActive;
      localStorage.setItem(KEYS.USERS, JSON.stringify(list));
      return list[idx];
    }
    return null;
  };

  const updateDoctorStatus = (id, status) => {
    const list = getDoctors();
    const idx = list.findIndex(d => d.id === id);
    if (idx !== -1) {
      list[idx].status = status; // 'pending', 'active', 'inactive'
      localStorage.setItem(KEYS.DOCTORS, JSON.stringify(list));
      return list[idx];
    }
    return null;
  };

  const deleteUser = (id) => {
    const list = getUsers().filter(u => u.id !== id);
    localStorage.setItem(KEYS.USERS, JSON.stringify(list));
  };

  return {
    // User
    getUsers, getUserByEmail, getUserById, createUser, updateUser,
    // Session
    setSession, getCurrentSession, clearSession, isLoggedIn,
    // Doctors
    getDoctors, saveDoctors, getDoctorById,
    // Medical
    getMedicalHistory, addMedicalHistory, updateMedicalHistory, removeMedicalHistory,
    getPrescriptions, addPrescription, updatePrescription, removePrescription,
    getConsultNotes, addConsultNote, updateConsultNote, removeConsultNote,
    // Notifications
    getNotifications, addNotification, markNotifRead, markAllNotifsRead,
    getUnreadCount, removeNotification,
    // Doctor Portal
    getDoctorAppointments, updateDoctorAppointment, getDoctorPatients,
    getPatientMedicalHistory, getPatientPrescriptions,
    addPatientConsultNote, addPatientPrescription, addPatientNotification,
    // Admin Portal
    getAllAppointments, getAllMedicalHistory, getAllPrescriptions,
    updateUserStatus, updateDoctorStatus, deleteUser,
  };
})();

