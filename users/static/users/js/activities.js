/**
 * Smart Elderly Care Management System
 * Activities Module JS
 */

const Activities = (() => {
  const KEY = 'eldc_activities';

  const getAll = () => {
    const session = Storage.getCurrentSession();
    if (!session) return [];
    const all = JSON.parse(localStorage.getItem(KEY)) || [];
    return all.filter(a => a.userId === session.id);
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
    const item = { id: 'act_' + Date.now(), userId: session.id, createdAt: new Date().toISOString(), completedDates: [], ...data };
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

  const toggleDone = (id) => {
    const list = getAll();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) return;
    const today = new Date().toDateString();
    const done = list[idx].completedDates || [];
    list[idx].completedDates = done.includes(today) ? done.filter(d => d !== today) : [...done, today];
    save(list);
    return list[idx];
  };

  const isDoneToday = (act) => (act.completedDates || []).includes(new Date().toDateString());

  // ── Config ──────────────────────────────────────────────────
  const TYPE_CONFIG = {
    physical: { label: 'Physical',  icon: 'fa-person-running',   color: 'stat-icon-green',  card: '' },
    mental:   { label: 'Mental',    icon: 'fa-brain',             color: 'stat-icon-purple', card: 'card-purple' },
    social:   { label: 'Social',    icon: 'fa-people-group',      color: 'stat-icon-blue',   card: 'card-info' },
    medical:  { label: 'Medical',   icon: 'fa-heart-pulse',       color: 'stat-icon-red',    card: 'card-danger' },
    hobby:    { label: 'Hobby',     icon: 'fa-palette',           color: 'stat-icon-amber',  card: 'card-warning' },
    other:    { label: 'Other',     icon: 'fa-star',              color: '',                 card: '' },
  };

  const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', custom: 'Custom' };

  let editingId = null, deleteId = null, currentFilter = 'all';

  const renderStats = (list) => {
    const active  = list.filter(a => a.status === 'active').length;
    const doneT   = list.filter(a => isDoneToday(a) && a.status === 'active').length;
    const pending = active - doneT;
    const streak  = calcStreak(list);
    document.getElementById('act_total').textContent   = list.length;
    document.getElementById('act_done').textContent    = doneT;
    document.getElementById('act_pending').textContent = pending;
    document.getElementById('act_streak').textContent  = streak + ' days';
  };

  const calcStreak = (list) => {
    const activeDailies = list.filter(a => a.status === 'active' && a.frequency === 'daily');
    if (!activeDailies.length) return 0;
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toDateString();
      const allDone = activeDailies.every(a => (a.completedDates || []).includes(ds));
      if (allDone) streak++;
      else if (i > 0) break;
    }
    return streak;
  };

  const renderList = (filter = currentFilter, query = '') => {
    currentFilter = filter;
    let list = getAll();

    if (filter === 'active')   list = list.filter(a => a.status === 'active');
    if (filter === 'done')     list = list.filter(a => isDoneToday(a) && a.status === 'active');
    if (filter === 'pending')  list = list.filter(a => !isDoneToday(a) && a.status === 'active');

    const types = ['physical','mental','social','medical','hobby','other'];
    types.forEach(t => { if (filter === t) list = list.filter(a => a.type === t); });

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || (a.notes && a.notes.toLowerCase().includes(q)));
    }

    renderStats(getAll());
    const container = document.getElementById('act_list');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-person-walking"></i></div>
          <h3>No activities found</h3>
          <p>Add daily activities like walking, yoga, reading, or social visits.</p>
          <button class="btn btn-primary btn-sm mt-4" onclick="Activities.openModal()">
            <i class="fas fa-plus"></i> Add Activity
          </button>
        </div>`;
      return;
    }

    container.innerHTML = list.map(act => {
      const cfg  = TYPE_CONFIG[act.type] || TYPE_CONFIG.other;
      const done = isDoneToday(act);
      const active = act.status === 'active';
      return `
        <div class="item-card ${cfg.card} ${!active ? 'card-muted' : ''}" id="act_card_${act.id}" style="opacity:${active ? 1 : 0.6}">
          <div class="item-icon ${cfg.color}" style="width:48px;height:48px;">
            <i class="fas ${cfg.icon}"></i>
          </div>
          <div class="item-body">
            <div class="item-title">${escHtml(act.name)}</div>
            <div class="item-subtitle">
              <span><i class="fas fa-tag"></i> ${cfg.label}</span>
              ${act.frequency ? `<span>· ${FREQ_LABELS[act.frequency] || act.frequency}</span>` : ''}
              ${act.duration  ? `<span>· <i class="fas fa-hourglass-half"></i> ${act.duration} min</span>` : ''}
            </div>
            <div class="item-meta">
              ${act.time ? `<span class="time-pill"><i class="fas fa-clock"></i>${act.time}</span>` : ''}
              ${!active ? `<span class="badge badge-warning">Inactive</span>` : ''}
              ${done && active ? `<span class="badge badge-success"><i class="fas fa-check"></i> Done today</span>` : ''}
              ${!done && active ? `<span class="badge badge-info"><i class="fas fa-clock"></i> Pending</span>` : ''}
            </div>
            ${act.notes ? `<div class="text-xs text-muted mt-2"><i class="fas fa-note-sticky"></i> ${escHtml(act.notes)}</div>` : ''}
          </div>
          <div class="item-actions">
            ${active ? `
              <button class="icon-btn" onclick="Activities.markDone('${act.id}')" title="${done ? 'Mark as not done' : 'Mark as done'}">
                <i class="fas fa-${done ? 'rotate-left' : 'check'}"></i>
              </button>` : ''}
            <button class="icon-btn" onclick="Activities.openModal('${act.id}')" title="Edit">
              <i class="fas fa-pen"></i>
            </button>
            <button class="icon-btn icon-btn-danger" onclick="Activities.confirmDelete('${act.id}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>`;
    }).join('');
  };

  const markDone = (id) => {
    const act = getAll().find(a => a.id === id);
    toggleDone(id);
    if (act) {
      const updated = getAll().find(a => a.id === id);
      Auth.showToast(isDoneToday(updated) ? `✅ ${act.name} marked as done!` : `↩️ ${act.name} marked as not done`);
    }
    renderList();
  };

  // ── Modal ───────────────────────────────────────────────────
  const openModal = (id = null) => {
    editingId = id;
    const modal = document.getElementById('act_modal');
    if (!modal) return;
    document.getElementById('act_form').reset();
    clearErrors();
    const title = document.getElementById('act_modal_title');

    if (id) {
      const act = getAll().find(a => a.id === id);
      if (!act) return;
      title.textContent = 'Edit Activity';
      document.getElementById('act_name').value      = act.name || '';
      document.getElementById('act_type').value      = act.type || 'physical';
      document.getElementById('act_freq').value      = act.frequency || 'daily';
      document.getElementById('act_time').value      = act.time || '';
      document.getElementById('act_duration').value  = act.duration || '';
      document.getElementById('act_notes').value     = act.notes || '';
      document.getElementById('act_status').checked  = act.status === 'active';
    } else {
      title.textContent = 'Add Activity';
      document.getElementById('act_status').checked = true;
    }

    modal.classList.add('open');
  };

  const closeModal = () => { document.getElementById('act_modal')?.classList.remove('open'); editingId = null; };
  const clearErrors = () => { document.querySelectorAll('#act_modal .field-error').forEach(el => { el.textContent = ''; el.classList.remove('visible'); }); };

  const saveForm = (e) => {
    e.preventDefault();
    clearErrors();
    const name = document.getElementById('act_name').value.trim();
    const type = document.getElementById('act_type').value;
    let valid = true;
    const showErr = (id, msg) => { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.add('visible'); } valid = false; };
    if (!name) showErr('act_name_error', 'Activity name is required');
    if (!type) showErr('act_type_error', 'Please select a type');
    if (!valid) return;

    const data = {
      name,
      type,
      frequency: document.getElementById('act_freq').value || 'daily',
      time:      document.getElementById('act_time').value,
      duration:  document.getElementById('act_duration').value,
      notes:     document.getElementById('act_notes').value.trim(),
      status:    document.getElementById('act_status').checked ? 'active' : 'inactive',
    };

    if (editingId) { update(editingId, data); Auth.showToast('Activity updated!'); }
    else           { add(data);               Auth.showToast('Activity added!'); }

    closeModal();
    renderList();
  };

  const confirmDelete = (id) => {
    deleteId = id;
    const act = getAll().find(a => a.id === id);
    const el = document.getElementById('delete_act_name');
    if (el && act) el.textContent = act.name;
    document.getElementById('confirm_act_modal')?.classList.add('open');
  };

  const doDelete = () => {
    if (deleteId) { remove(deleteId); Auth.showToast('Activity deleted', 'error'); renderList(); deleteId = null; }
    document.getElementById('confirm_act_modal')?.classList.remove('open');
  };

  const cancelDelete = () => { deleteId = null; document.getElementById('confirm_act_modal')?.classList.remove('open'); };

  const escHtml = (str) => String(str || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

  return { renderList, openModal, closeModal, saveForm, markDone, confirmDelete, doDelete, cancelDelete };
})();
