/**
 * Smart Elderly Care Management System
 * Medications Module JS
 */

const Medications = (() => {
  const KEY = 'eldc_medications';

  // ── CRUD Helpers ───────────────────────────────────────────
  const getAll = () => {
    const session = Storage.getCurrentSession();
    if (!session) return [];
    const all = JSON.parse(localStorage.getItem(KEY)) || [];
    return all.filter(m => m.userId === session.id);
  };

  const save = (list) => {
    const session = Storage.getCurrentSession();
    if (!session) return;
    const all = JSON.parse(localStorage.getItem(KEY)) || [];
    const others = all.filter(m => m.userId !== session.id);
    localStorage.setItem(KEY, JSON.stringify([...others, ...list]));
  };

  const add = (data) => {
    const session = Storage.getCurrentSession();
    const list = getAll();
    const item = {
      id: 'med_' + Date.now(),
      userId: session.id,
      createdAt: new Date().toISOString(),
      takenDates: [],
      ...data,
    };
    list.push(item);
    save(list);
    return item;
  };

  const update = (id, data) => {
    const list = getAll();
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
    save(list);
    return list[idx];
  };

  const remove = (id) => {
    const list = getAll().filter(m => m.id !== id);
    save(list);
  };

  const toggleTaken = (id) => {
    const list = getAll();
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) return;
    const today = new Date().toDateString();
    const taken = list[idx].takenDates || [];
    if (taken.includes(today)) {
      list[idx].takenDates = taken.filter(d => d !== today);
    } else {
      list[idx].takenDates = [...taken, today];
    }
    save(list);
    return list[idx];
  };

  const isTakenToday = (med) => {
    const today = new Date().toDateString();
    return (med.takenDates || []).includes(today);
  };

  // ── Render ──────────────────────────────────────────────────
  const FREQ_LABELS = {
    once: 'Once daily',
    twice: 'Twice daily',
    thrice: 'Three times daily',
    weekly: 'Weekly',
    custom: 'Custom',
  };

  const FREQ_COLORS = {
    once: 'card-info',
    twice: 'card-warning',
    thrice: 'card-danger',
    weekly: 'card-purple',
    custom: '',
  };

  let editingId = null;
  let deleteId = null;
  let currentFilter = 'all';

  const renderStats = (list) => {
    const total   = list.length;
    const active  = list.filter(m => m.status === 'active').length;
    const takenT  = list.filter(m => isTakenToday(m) && m.status === 'active').length;
    const pending = active - takenT;

    document.getElementById('ms_total').textContent  = total;
    document.getElementById('ms_active').textContent = active;
    document.getElementById('ms_taken').textContent  = takenT;
    document.getElementById('ms_pending').textContent = pending;
  };

  const renderList = (filter = currentFilter, query = '') => {
    currentFilter = filter;
    let list = getAll();

    // Filter
    if (filter === 'active')   list = list.filter(m => m.status === 'active');
    if (filter === 'inactive') list = list.filter(m => m.status !== 'active');
    if (filter === 'today')    list = list.filter(m => m.status === 'active' && !isTakenToday(m));

    // Search
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.dosage && m.dosage.toLowerCase().includes(q)) ||
        (m.notes && m.notes.toLowerCase().includes(q))
      );
    }

    renderStats(getAll());

    const container = document.getElementById('med_list');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-pills"></i></div>
          <h3>No medications found</h3>
          <p>${filter === 'today' ? 'All medications have been taken today. Great job! 🎉' : 'Add a medication using the button above.'}</p>
          <button class="btn btn-primary btn-sm mt-4" onclick="Medications.openModal()">
            <i class="fas fa-plus"></i> Add Medication
          </button>
        </div>`;
      return;
    }

    container.innerHTML = list.map(med => {
      const taken = isTakenToday(med);
      const active = med.status === 'active';
      const colorClass = FREQ_COLORS[med.frequency] || '';
      return `
        <div class="item-card ${colorClass} ${!active ? 'card-muted' : ''}" id="med_card_${med.id}" style="opacity:${active ? 1 : 0.6}">
          <div class="item-icon stat-icon-${med.frequency === 'thrice' ? 'red' : med.frequency === 'twice' ? 'amber' : 'green'}" style="width:48px;height:48px;">
            <i class="fas fa-pills"></i>
          </div>
          <div class="item-body">
            <div class="item-title">${escHtml(med.name)}</div>
            <div class="item-subtitle">
              <span><i class="fas fa-capsules"></i> ${escHtml(med.dosage || '—')}</span>
              <span>·</span>
              <span>${FREQ_LABELS[med.frequency] || med.frequency}</span>
            </div>
            <div class="item-meta">
              ${med.times && med.times.length ? med.times.map(t => `<span class="time-pill"><i class="fas fa-clock"></i>${t}</span>`).join('') : ''}
              ${med.startDate ? `<span class="meta-tag"><i class="fas fa-calendar"></i> From ${formatDate(med.startDate)}</span>` : ''}
              ${med.endDate   ? `<span class="meta-tag"><i class="fas fa-calendar-xmark"></i> Until ${formatDate(med.endDate)}</span>` : ''}
              ${!active ? `<span class="badge badge-warning">Inactive</span>` : ''}
              ${taken && active ? `<span class="badge badge-success"><i class="fas fa-check"></i> Taken today</span>` : ''}
            </div>
            ${med.notes ? `<div class="text-xs text-muted mt-2"><i class="fas fa-note-sticky"></i> ${escHtml(med.notes)}</div>` : ''}
          </div>
          <div class="item-actions">
            ${active ? `
              <button class="icon-btn" onclick="Medications.markTaken('${med.id}')" title="${taken ? 'Mark as not taken' : 'Mark as taken'}">
                <i class="fas fa-${taken ? 'rotate-left' : 'check'}"></i>
              </button>` : ''}
            <button class="icon-btn" onclick="Medications.openModal('${med.id}')" title="Edit">
              <i class="fas fa-pen"></i>
            </button>
            <button class="icon-btn icon-btn-danger" onclick="Medications.confirmDelete('${med.id}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>`;
    }).join('');
  };

  // ── Mark Taken ──────────────────────────────────────────────
  const markTaken = (id) => {
    toggleTaken(id);
    renderList();
    const med = getAll().find(m => m.id === id);
    if (med) {
      const taken = isTakenToday(med);
      Auth.showToast(taken ? `✅ ${med.name} marked as taken!` : `↩️ ${med.name} marked as not taken`);
    }
  };

  // ── Modal ───────────────────────────────────────────────────
  const openModal = (id = null) => {
    editingId = id;
    const modal = document.getElementById('med_modal');
    const title = document.getElementById('med_modal_title');
    if (!modal) return;

    // Clear form
    document.getElementById('med_form').reset();
    document.getElementById('times_container').innerHTML = '';
    clearModalErrors();

    if (id) {
      const med = getAll().find(m => m.id === id);
      if (!med) return;
      title.textContent = 'Edit Medication';
      document.getElementById('med_name').value       = med.name || '';
      document.getElementById('med_dosage').value     = med.dosage || '';
      document.getElementById('med_frequency').value  = med.frequency || 'once';
      document.getElementById('med_start').value      = med.startDate || '';
      document.getElementById('med_end').value        = med.endDate || '';
      document.getElementById('med_notes').value      = med.notes || '';
      document.getElementById('med_status').checked   = med.status === 'active';
      if (med.times && med.times.length) {
        med.times.forEach(t => addTimeField(t));
      }
    } else {
      title.textContent = 'Add Medication';
      document.getElementById('med_status').checked = true;
      addTimeField('08:00');
    }

    modal.classList.add('open');
  };

  const closeModal = () => {
    document.getElementById('med_modal')?.classList.remove('open');
    editingId = null;
  };

  const clearModalErrors = () => {
    document.querySelectorAll('#med_modal .field-error').forEach(el => {
      el.textContent = ''; el.classList.remove('visible');
    });
  };

  let timeCount = 0;
  const addTimeField = (value = '') => {
    const container = document.getElementById('times_container');
    const id = 'time_' + (++timeCount);
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2';
    div.id = 'time_row_' + id;
    div.innerHTML = `
      <div class="input-wrapper" style="flex:1">
        <i class="fas fa-clock input-icon"></i>
        <input type="time" id="${id}" class="form-input time-input" value="${value}" />
      </div>
      <button type="button" class="icon-btn icon-btn-danger" onclick="this.parentElement.remove()" title="Remove time">
        <i class="fas fa-times"></i>
      </button>`;
    container.appendChild(div);
  };

  // ── Save Form ───────────────────────────────────────────────
  const saveForm = (e) => {
    e.preventDefault();
    clearModalErrors();

    const name = document.getElementById('med_name').value.trim();
    const dosage = document.getElementById('med_dosage').value.trim();
    const frequency = document.getElementById('med_frequency').value;

    let valid = true;
    const showErr = (id, msg) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = msg; el.classList.add('visible'); }
      valid = false;
    };

    if (!name) showErr('med_name_error', 'Medication name is required');
    if (!frequency) showErr('med_freq_error', 'Please select frequency');
    if (!valid) return;

    const times = [...document.querySelectorAll('.time-input')].map(i => i.value).filter(Boolean);

    const data = {
      name,
      dosage,
      frequency,
      times,
      startDate: document.getElementById('med_start').value || '',
      endDate:   document.getElementById('med_end').value   || '',
      notes:     document.getElementById('med_notes').value.trim(),
      status:    document.getElementById('med_status').checked ? 'active' : 'inactive',
    };

    if (editingId) {
      update(editingId, data);
      Auth.showToast('Medication updated successfully!');
    } else {
      add(data);
      Auth.showToast('Medication added successfully!');
    }

    closeModal();
    renderList();
  };

  // ── Delete ──────────────────────────────────────────────────
  const confirmDelete = (id) => {
    deleteId = id;
    const med = getAll().find(m => m.id === id);
    const nameEl = document.getElementById('delete_med_name');
    if (nameEl && med) nameEl.textContent = med.name;
    document.getElementById('confirm_modal')?.classList.add('open');
  };

  const doDelete = () => {
    if (deleteId) {
      remove(deleteId);
      Auth.showToast('Medication deleted', 'error');
      renderList();
      deleteId = null;
    }
    document.getElementById('confirm_modal')?.classList.remove('open');
  };

  const cancelDelete = () => {
    deleteId = null;
    document.getElementById('confirm_modal')?.classList.remove('open');
  };

  // ── Utilities ───────────────────────────────────────────────
  const escHtml = (str) => String(str || '').replace(/[<>&"]/g, c =>
    ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return { renderList, openModal, closeModal, saveForm, addTimeField, markTaken, confirmDelete, doDelete, cancelDelete };
})();
