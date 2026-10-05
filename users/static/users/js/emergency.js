/**
 * Smart Elderly Care Management System
 * Emergency Contacts Module JS
 */

const Emergency = (() => {
  const KEY = 'eldc_emergency_contacts';

  const getAll = () => {
    const session = Storage.getCurrentSession();
    if (!session) return [];
    const all = JSON.parse(localStorage.getItem(KEY)) || [];
    return all.filter(c => c.userId === session.id).sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  };

  const save = (list) => {
    const session = Storage.getCurrentSession();
    if (!session) return;
    const all = JSON.parse(localStorage.getItem(KEY)) || [];
    const others = all.filter(c => c.userId !== session.id);
    localStorage.setItem(KEY, JSON.stringify([...others, ...list]));
  };

  const add = (data) => {
    const session = Storage.getCurrentSession();
    const list = getAll();
    const item = { id: 'ec_' + Date.now(), userId: session.id, createdAt: new Date().toISOString(), ...data };
    // Only one primary
    if (data.isPrimary) list.forEach(c => { c.isPrimary = false; });
    list.push(item);
    save(list);
    return item;
  };

  const update = (id, data) => {
    const list = getAll();
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) return null;
    if (data.isPrimary) list.forEach((c, i) => { if (i !== idx) c.isPrimary = false; });
    list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
    save(list);
    return list[idx];
  };

  const remove = (id) => save(getAll().filter(c => c.id !== id));

  // ── Relationship Icons ───────────────────────────────────────
  const REL_CONFIG = {
    son:       { icon: 'fa-person', color: 'stat-icon-blue' },
    daughter:  { icon: 'fa-person-dress', color: 'stat-icon-purple' },
    spouse:    { icon: 'fa-heart', color: 'stat-icon-red' },
    sibling:   { icon: 'fa-people-roof', color: 'stat-icon-amber' },
    doctor:    { icon: 'fa-user-doctor', color: 'stat-icon-green' },
    neighbour: { icon: 'fa-house-user', color: 'stat-icon-blue' },
    friend:    { icon: 'fa-user-group', color: 'stat-icon-purple' },
    caregiver: { icon: 'fa-hand-holding-heart', color: 'stat-icon-green' },
    other:     { icon: 'fa-user', color: '' },
  };

  let editingId = null, deleteId = null;

  const renderStats = (list) => {
    document.getElementById('ec_total').textContent   = list.length;
    document.getElementById('ec_primary').textContent = list.filter(c => c.isPrimary).length;
    document.getElementById('ec_doctors').textContent = list.filter(c => c.relationship === 'doctor').length;
    document.getElementById('ec_family').textContent  = list.filter(c => ['son','daughter','spouse','sibling'].includes(c.relationship)).length;
  };

  const renderList = (query = '') => {
    let list = getAll();
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.relationship && c.relationship.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
      );
    }

    renderStats(getAll());
    const container = document.getElementById('ec_list');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-phone-volume"></i></div>
          <h3>No emergency contacts added</h3>
          <p>Add important contacts like family members, caregivers, or doctors who should be reached in an emergency.</p>
          <button class="btn btn-primary btn-sm mt-4" onclick="Emergency.openModal()">
            <i class="fas fa-plus"></i> Add Contact
          </button>
        </div>`;
      return;
    }

    container.innerHTML = list.map(contact => {
      const cfg = REL_CONFIG[contact.relationship] || REL_CONFIG.other;
      return `
        <div class="item-card ${contact.isPrimary ? '' : ''}" id="ec_card_${contact.id}"
             style="${contact.isPrimary ? 'border-color:rgba(239,68,68,0.3);background:linear-gradient(135deg,rgba(239,68,68,0.05),var(--bg-card))' : ''}">
          <div class="item-icon ${cfg.color}" style="width:52px;height:52px;">
            <i class="fas ${cfg.icon}"></i>
          </div>
          <div class="item-body">
            <div class="item-title" style="display:flex;align-items:center;gap:8px;">
              ${escHtml(contact.name)}
              ${contact.isPrimary ? `<span class="badge badge-danger"><i class="fas fa-star"></i> Primary</span>` : ''}
            </div>
            <div class="item-subtitle">
              <span><i class="fas fa-people-arrows"></i> ${capitalize(contact.relationship || 'Other')}</span>
            </div>
            <div class="item-meta" style="margin-top:10px;">
              ${contact.phone ? `
                <a href="tel:${contact.phone}" class="meta-tag" style="color:var(--primary);border-color:rgba(16,185,129,0.2);text-decoration:none;">
                  <i class="fas fa-phone"></i> ${contact.phone}
                </a>` : ''}
              ${contact.phone2 ? `
                <a href="tel:${contact.phone2}" class="meta-tag" style="text-decoration:none;">
                  <i class="fas fa-phone"></i> ${contact.phone2}
                </a>` : ''}
              ${contact.email ? `
                <a href="mailto:${contact.email}" class="meta-tag" style="text-decoration:none;">
                  <i class="fas fa-envelope"></i> ${escHtml(contact.email)}
                </a>` : ''}
            </div>
            ${contact.notes ? `<div class="text-xs text-muted mt-2"><i class="fas fa-note-sticky"></i> ${escHtml(contact.notes)}</div>` : ''}
          </div>
          <div class="item-actions">
            <a href="tel:${contact.phone || ''}" class="icon-btn" title="Call" style="color:var(--primary);">
              <i class="fas fa-phone"></i>
            </a>
            <button class="icon-btn" onclick="Emergency.openModal('${contact.id}')" title="Edit">
              <i class="fas fa-pen"></i>
            </button>
            <button class="icon-btn icon-btn-danger" onclick="Emergency.confirmDelete('${contact.id}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>`;
    }).join('');
  };

  // ── Modal ───────────────────────────────────────────────────
  const openModal = (id = null) => {
    editingId = id;
    const modal = document.getElementById('ec_modal');
    if (!modal) return;
    document.getElementById('ec_form').reset();
    clearErrors();
    const title = document.getElementById('ec_modal_title');

    if (id) {
      const c = getAll().find(c => c.id === id);
      if (!c) return;
      title.textContent = 'Edit Contact';
      document.getElementById('ec_name').value         = c.name || '';
      document.getElementById('ec_relationship').value = c.relationship || '';
      document.getElementById('ec_phone').value        = c.phone || '';
      document.getElementById('ec_phone2').value       = c.phone2 || '';
      document.getElementById('ec_email').value        = c.email || '';
      document.getElementById('ec_notes').value        = c.notes || '';
      document.getElementById('ec_primary').checked    = !!c.isPrimary;
    } else {
      title.textContent = 'Add Emergency Contact';
    }

    modal.classList.add('open');
  };

  const closeModal = () => { document.getElementById('ec_modal')?.classList.remove('open'); editingId = null; };
  const clearErrors = () => { document.querySelectorAll('#ec_modal .field-error').forEach(el => { el.textContent = ''; el.classList.remove('visible'); }); };

  const saveForm = (e) => {
    e.preventDefault();
    clearErrors();
    const name = document.getElementById('ec_name').value.trim();
    const phone = document.getElementById('ec_phone').value.trim();
    let valid = true;
    const showErr = (id, msg) => { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.add('visible'); } valid = false; };
    if (!name) showErr('ec_name_error', 'Contact name is required');
    if (!phone) showErr('ec_phone_error', 'Primary phone number is required');
    if (!valid) return;

    const data = {
      name,
      relationship: document.getElementById('ec_relationship').value,
      phone,
      phone2:    document.getElementById('ec_phone2').value.trim(),
      email:     document.getElementById('ec_email').value.trim(),
      notes:     document.getElementById('ec_notes').value.trim(),
      isPrimary: document.getElementById('ec_primary').checked,
    };

    if (editingId) { update(editingId, data); Auth.showToast('Contact updated!'); }
    else           { add(data);               Auth.showToast('Contact added!'); }

    closeModal();
    renderList();
  };

  const confirmDelete = (id) => {
    deleteId = id;
    const c = getAll().find(c => c.id === id);
    const el = document.getElementById('delete_ec_name');
    if (el && c) el.textContent = c.name;
    document.getElementById('confirm_ec_modal')?.classList.add('open');
  };

  const doDelete = () => {
    if (deleteId) { remove(deleteId); Auth.showToast('Contact deleted', 'error'); renderList(); deleteId = null; }
    document.getElementById('confirm_ec_modal')?.classList.remove('open');
  };

  const cancelDelete = () => { deleteId = null; document.getElementById('confirm_ec_modal')?.classList.remove('open'); };

  const escHtml = (str) => String(str || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  return { renderList, openModal, closeModal, saveForm, confirmDelete, doDelete, cancelDelete };
})();
