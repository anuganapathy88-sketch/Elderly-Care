/**
 * Smart Elderly Care Management System
 * Appointments Module JS
 */

const Appointments = (() => {
  const KEY = 'eldc_appointments';

  // ── CRUD ────────────────────────────────────────────────────
  const getAll = () => {
    const session = Storage.getCurrentSession();
    if (!session) return [];
    const all = JSON.parse(localStorage.getItem(KEY)) || [];
    return all.filter(a => a.userId === session.id).sort((a, b) => new Date(a.date + 'T' + (a.time||'00:00')) - new Date(b.date + 'T' + (b.time||'00:00')));
  };

  const save = (list) => {
    const session = Storage.getCurrentSession();
    if (!session) return;
    const all = JSON.parse(localStorage.getItem(KEY)) || [];
    const others = all.filter(a => a.userId !== session.id);
    localStorage.setItem(KEY, JSON.stringify([...others, ...list]));
  };

  const add = (data) => {
    const session = Storage.getCurrentSession();
    const list = getAll();
    const item = { id: 'appt_' + Date.now(), userId: session.id, createdAt: new Date().toISOString(), ...data };
    list.push(item);
    save(list);
    return item;
  };

  const update = (id, data) => {
    const list = getAll();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
    save(list);
    return list[idx];
  };

  const remove = (id) => save(getAll().filter(a => a.id !== id));

  const getStatus = (appt) => {
    if (appt.status === 'cancelled') return 'cancelled';
    if (appt.status === 'completed') return 'completed';
    const apptDate = new Date(appt.date + 'T' + (appt.time || '00:00'));
    const now = new Date();
    if (apptDate < now) return 'past';
    return 'upcoming';
  };

  // ── Render ──────────────────────────────────────────────────
  const STATUS_COLORS = { upcoming: 'badge-info', past: 'badge-warning', completed: 'badge-success', cancelled: 'badge-danger' };
  const STATUS_LABELS = { upcoming: 'Upcoming', past: 'Past', completed: 'Completed', cancelled: 'Cancelled' };
  const CARD_COLORS   = { upcoming: '', past: 'card-warning', completed: 'card-muted', cancelled: 'card-danger' };

  let editingId = null, deleteId = null, currentFilter = 'all';

  const renderStats = (list) => {
    const upcoming  = list.filter(a => getStatus(a) === 'upcoming').length;
    const completed = list.filter(a => getStatus(a) === 'completed').length;
    const cancelled = list.filter(a => a.status === 'cancelled').length;
    document.getElementById('as_total').textContent     = list.length;
    document.getElementById('as_upcoming').textContent  = upcoming;
    document.getElementById('as_completed').textContent = completed;
    document.getElementById('as_cancelled').textContent = cancelled;
  };

  const renderList = (filter = currentFilter, query = '') => {
    currentFilter = filter;
    let list = getAll();

    if (filter === 'upcoming')  list = list.filter(a => getStatus(a) === 'upcoming');
    if (filter === 'completed') list = list.filter(a => getStatus(a) === 'completed');
    if (filter === 'cancelled') list = list.filter(a => a.status === 'cancelled');

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(a =>
        a.doctorName.toLowerCase().includes(q) ||
        (a.hospital && a.hospital.toLowerCase().includes(q)) ||
        (a.specialization && a.specialization.toLowerCase().includes(q))
      );
    }

    renderStats(getAll());
    const container = document.getElementById('appt_list');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-calendar-check"></i></div>
          <h3>No appointments found</h3>
          <p>Schedule a doctor's appointment to get started.</p>
          <button class="btn btn-primary btn-sm mt-4" onclick="Appointments.openModal()">
            <i class="fas fa-plus"></i> Add Appointment
          </button>
        </div>`;
      return;
    }

    container.innerHTML = list.map(appt => {
      const status = getStatus(appt);
      const cardClass = CARD_COLORS[status] || '';
      const apptDate = appt.date ? new Date(appt.date).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' }) : '—';
      return `
        <div class="item-card ${cardClass}" id="appt_card_${appt.id}">
          <div class="item-icon stat-icon-blue" style="width:48px;height:48px;">
            <i class="fas fa-stethoscope"></i>
          </div>
          <div class="item-body">
            <div class="item-title">Dr. ${escHtml(appt.doctorName)}</div>
            <div class="item-subtitle">
              ${appt.specialization ? `<span><i class="fas fa-briefcase-medical"></i> ${escHtml(appt.specialization)}</span>` : ''}
              ${appt.hospital ? `<span>· <i class="fas fa-hospital"></i> ${escHtml(appt.hospital)}</span>` : ''}
            </div>
            <div class="item-meta">
              <span class="meta-tag"><i class="fas fa-calendar"></i> ${apptDate}</span>
              ${appt.time ? `<span class="time-pill"><i class="fas fa-clock"></i>${appt.time}</span>` : ''}
              <span class="badge ${STATUS_COLORS[status]}">${STATUS_LABELS[status]}</span>
            </div>
            ${appt.notes ? `<div class="text-xs text-muted mt-2"><i class="fas fa-note-sticky"></i> ${escHtml(appt.notes)}</div>` : ''}
          </div>
          <div class="item-actions">
            ${status === 'upcoming' ? `
              <button class="icon-btn" onclick="Appointments.markComplete('${appt.id}')" title="Mark Complete">
                <i class="fas fa-check"></i>
              </button>` : ''}
            <button class="icon-btn" onclick="Appointments.openModal('${appt.id}')" title="Edit">
              <i class="fas fa-pen"></i>
            </button>
            <button class="icon-btn icon-btn-danger" onclick="Appointments.confirmDelete('${appt.id}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>`;
    }).join('');
  };

  const markComplete = (id) => {
    update(id, { status: 'completed' });
    Auth.showToast('Appointment marked as completed!');
    renderList();
  };

  // ── Modal ───────────────────────────────────────────────────
  const openModal = (id = null) => {
    editingId = id;
    const modal = document.getElementById('appt_modal');
    if (!modal) return;
    document.getElementById('appt_form').reset();
    clearErrors();

    const title = document.getElementById('appt_modal_title');
    if (id) {
      const appt = getAll().find(a => a.id === id);
      if (!appt) return;
      title.textContent = 'Edit Appointment';
      document.getElementById('appt_doctor').value       = appt.doctorName || '';
      document.getElementById('appt_spec').value         = appt.specialization || '';
      document.getElementById('appt_hospital').value     = appt.hospital || '';
      document.getElementById('appt_date').value         = appt.date || '';
      document.getElementById('appt_time').value         = appt.time || '';
      document.getElementById('appt_status').value       = appt.status || 'upcoming';
      document.getElementById('appt_notes').value        = appt.notes || '';
    } else {
      title.textContent = 'Add Appointment';
    }

    modal.classList.add('open');
  };

  const closeModal = () => { document.getElementById('appt_modal')?.classList.remove('open'); editingId = null; };

  const clearErrors = () => {
    document.querySelectorAll('#appt_modal .field-error').forEach(el => { el.textContent = ''; el.classList.remove('visible'); });
  };

  const saveForm = (e) => {
    e.preventDefault();
    clearErrors();
    const doctorName = document.getElementById('appt_doctor').value.trim();
    const date       = document.getElementById('appt_date').value;
    let valid = true;
    const showErr = (id, msg) => { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.add('visible'); } valid = false; };
    if (!doctorName) showErr('appt_doctor_error', 'Doctor name is required');
    if (!date)       showErr('appt_date_error', 'Appointment date is required');
    if (!valid) return;

    const data = {
      doctorName,
      specialization: document.getElementById('appt_spec').value.trim(),
      hospital:       document.getElementById('appt_hospital').value.trim(),
      date,
      time:   document.getElementById('appt_time').value,
      status: document.getElementById('appt_status').value || 'upcoming',
      notes:  document.getElementById('appt_notes').value.trim(),
    };

    if (editingId) { update(editingId, data); Auth.showToast('Appointment updated!'); }
    else           { add(data);               Auth.showToast('Appointment added!'); }

    closeModal();
    renderList();
  };

  const confirmDelete = (id) => {
    deleteId = id;
    const appt = getAll().find(a => a.id === id);
    const el = document.getElementById('delete_appt_name');
    if (el && appt) el.textContent = 'Dr. ' + appt.doctorName;
    document.getElementById('confirm_appt_modal')?.classList.add('open');
  };

  const doDelete = () => {
    if (deleteId) { remove(deleteId); Auth.showToast('Appointment deleted', 'error'); renderList(); deleteId = null; }
    document.getElementById('confirm_appt_modal')?.classList.remove('open');
  };

  const cancelDelete = () => { deleteId = null; document.getElementById('confirm_appt_modal')?.classList.remove('open'); };

  const escHtml = (str) => String(str || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

  return { renderList, openModal, closeModal, saveForm, markComplete, confirmDelete, doDelete, cancelDelete };
})();
