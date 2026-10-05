/**
 * Smart Elderly Care Management System
 * Medical Records Module — History, Prescriptions, Consultation Notes
 */

const Medical = (() => {
  const escHtml = (str) => String(str || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—';

  let activeTab = 'history';
  let editingId = null;
  let deleteTarget = null; // { type, id }

  // ── Tab Switching ───────────────────────────────────────────
  const switchTab = (tab) => {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab_' + tab));
    renderActiveTab();
  };

  const renderActiveTab = () => {
    if (activeTab === 'history')       renderHistory();
    else if (activeTab === 'prescriptions') renderPrescriptions();
    else if (activeTab === 'notes')    renderNotes();
  };

  // ══════════════════════════════════════════════════════════
  //  MEDICAL HISTORY CONFIG & TYPES
  // ══════════════════════════════════════════════════════════
  const SEVERITY_CONFIG = {
    mild:     { color: 'badge-success', label: 'Mild' },
    moderate: { color: 'badge-warning', label: 'Moderate' },
    severe:   { color: 'badge-danger',  label: 'Severe' }
  };

  const TYPE_CONFIG_H = {
    condition:       { icon: 'fa-heart-crack',              color: 'stat-icon-red',    label: 'Chronic Condition' },
    lab_test:        { icon: 'fa-flask-vial',               color: 'stat-icon-green',  label: 'Lab & Blood Test' },
    imaging:         { icon: 'fa-x-ray',                    color: 'stat-icon-purple', label: 'Diagnostic Imaging' },
    vitals:          { icon: 'fa-wave-square',              color: 'stat-icon-blue',   label: 'Vital Signs & Monitoring' },
    surgery:         { icon: 'fa-scalpel',                  color: 'stat-icon-amber',  label: 'Surgery' },
    allergy:         { icon: 'fa-triangle-exclamation',     color: 'stat-icon-amber',  label: 'Allergy' },
    vaccination:     { icon: 'fa-syringe',                  color: 'stat-icon-green',  label: 'Vaccination' },
    therapy:         { icon: 'fa-person-walking-with-cane', color: 'stat-icon-green',  label: 'Physical Therapy & Rehab' },
    cognitive:       { icon: 'fa-brain',                    color: 'stat-icon-purple', label: 'Cognitive & Memory' },
    vision:          { icon: 'fa-eye',                      color: 'stat-icon-blue',   label: 'Vision & Eye Exam' },
    dental:          { icon: 'fa-tooth',                    color: 'stat-icon-blue',   label: 'Dental & Oral Care' },
    hearing:         { icon: 'fa-ear-listen',               color: 'stat-icon-amber',  label: 'Hearing & Audiology' },
    device:          { icon: 'fa-wheelchair',               color: 'stat-icon-purple', label: 'Medical Device & Equipment' },
    nutrition:       { icon: 'fa-apple-whole',              color: 'stat-icon-green',  label: 'Nutrition & Diet Plan' },
    psychological:   { icon: 'fa-spa',                      color: 'stat-icon-purple', label: 'Mental Wellness' },
    hospitalization: { icon: 'fa-bed-pulse',                color: 'stat-icon-blue',   label: 'Hospitalization' },
    emergency:       { icon: 'fa-truck-medical',            color: 'stat-icon-red',    label: 'Emergency Incident' },
    other:           { icon: 'fa-file-medical',             color: '',                 label: 'General / Other' }
  };

  const getTypeLabel = (type) => {
    return (TYPE_CONFIG_H[type] && TYPE_CONFIG_H[type].label)
      ? TYPE_CONFIG_H[type].label
      : capitalize(type ? type.replace(/_/g, ' ') : 'Other');
  };

  let historyTypeFilter = 'all';

  const filterByType = (type) => {
    historyTypeFilter = type;
    document.querySelectorAll('#history_type_filters .filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    const query = document.getElementById('medical_search')?.value || '';
    renderHistory(query);
  };

  // Seed sample records if empty so user immediately sees diverse types
  const ensureSampleRecords = () => {
    const list = Storage.getMedicalHistory();
    if (list && list.length > 0) return;

    const sampleData = [
      {
        title: 'Complete Blood Count (CBC) & HbA1c Panel',
        type: 'lab_test',
        severity: 'moderate',
        diagnosedDate: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0],
        doctor: 'Dr. Arvind Swaminathan',
        notes: 'Fasting glucose: 118 mg/dL, HbA1c: 6.4%. Kidney and liver panels within normal reference limits.',
        ongoing: false
      },
      {
        title: 'Echocardiogram & Cardiac Doppler Scan',
        type: 'imaging',
        severity: 'mild',
        diagnosedDate: new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0],
        doctor: 'Dr. Priya Patel',
        notes: 'Left ventricular ejection fraction: 58% (Normal). Mild aortic valve sclerosis noted, hemodynamically stable.',
        ongoing: false
      },
      {
        title: 'Daily Blood Pressure & Pulse Log',
        type: 'vitals',
        severity: 'mild',
        diagnosedDate: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
        doctor: 'Dr. Rajesh Sharma',
        notes: 'Morning average: 126/82 mmHg, Resting pulse: 72 bpm. Good response to low-sodium diet and Telmisartan.',
        ongoing: true
      },
      {
        title: 'Knee Mobility & Joint Rehabilitation Therapy',
        type: 'therapy',
        severity: 'mild',
        diagnosedDate: new Date(Date.now() - 20 * 86400000).toISOString().split('T')[0],
        doctor: 'Dr. Rohan Deshmukh',
        notes: 'Quadriceps strengthening, low-impact gait retraining, and balance exercises 3 times weekly.',
        ongoing: true
      },
      {
        title: 'Stage 1 Essential Hypertension',
        type: 'condition',
        severity: 'moderate',
        diagnosedDate: new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0],
        doctor: 'Dr. Rajesh Sharma',
        notes: 'Regular monitoring required every 3 months. Lifestyle modifications and daily brisk walking recommended.',
        ongoing: true
      },
      {
        title: 'Annual Influenza & Pneumococcal Vaccine',
        type: 'vaccination',
        severity: '',
        diagnosedDate: new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0],
        doctor: 'Dr. Rajesh Sharma',
        notes: 'Quadrivalent seasonal influenza vaccine administered in left deltoid. Zero adverse side-effects.',
        ongoing: false
      },
      {
        title: 'Bilateral Cataract Evaluation & Refraction',
        type: 'vision',
        severity: 'mild',
        diagnosedDate: new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0],
        doctor: 'Dr. Vikram Malhotra',
        notes: 'Early nuclear sclerosis in both eyes. Corrected visual acuity 6/9. Next review in 6 months.',
        ongoing: true
      },
      {
        title: 'Mini-Mental State Examination (MMSE Screen)',
        type: 'cognitive',
        severity: 'mild',
        diagnosedDate: new Date(Date.now() - 120 * 86400000).toISOString().split('T')[0],
        doctor: 'Dr. Sunita Kulkarni',
        notes: 'Score: 28/30 (Normal age-appropriate cognitive health). Recommended daily memory puzzles and social activities.',
        ongoing: false
      }
    ];

    sampleData.forEach(item => Storage.addMedicalHistory(item));
  };

  const renderHistory = (query = '') => {
    ensureSampleRecords();
    let list = Storage.getMedicalHistory().sort((a,b) => new Date(b.diagnosedDate || b.createdAt) - new Date(a.diagnosedDate || a.createdAt));

    // Filter by selected Type if not 'all'
    if (historyTypeFilter && historyTypeFilter !== 'all') {
      list = list.filter(h => h.type === historyTypeFilter);
    }

    // Filter by search query
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(h =>
        h.title.toLowerCase().includes(q) ||
        (h.doctor && h.doctor.toLowerCase().includes(q)) ||
        (h.type && h.type.toLowerCase().includes(q)) ||
        (h.notes && h.notes.toLowerCase().includes(q))
      );
    }

    const container = document.getElementById('history_list');
    if (!container) return;

    if (!list.length) {
      const typeLabel = historyTypeFilter !== 'all' ? ` for "${getTypeLabel(historyTypeFilter)}"` : '';
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-file-medical-alt"></i></div>
          <h3>No medical records found${typeLabel}</h3>
          <p>Add new records using the button below or select a different filter.</p>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">
            ${historyTypeFilter !== 'all' ? `<button class="btn btn-outline btn-sm" onclick="Medical.filterByType('all')">Show All Types</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="Medical.openHistoryModal()"><i class="fas fa-plus"></i> Add Record</button>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = list.map(h => {
      const tc = TYPE_CONFIG_H[h.type] || TYPE_CONFIG_H.other;
      const sc = SEVERITY_CONFIG[h.severity] || null;
      return `
        <div class="item-card">
          <div class="item-icon ${tc.color}" style="width:48px;height:48px;font-size:1.15rem;display:flex;align-items:center;justify-content:center;border-radius:12px;"><i class="fas ${tc.icon}"></i></div>
          <div class="item-body">
            <div class="item-title" style="font-weight:700;font-size:1.05rem;">${escHtml(h.title)}</div>
            <div class="item-subtitle" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:4px;">
              <span class="badge" style="background:rgba(255,255,255,0.06);color:var(--primary);font-weight:600;padding:2px 8px;border-radius:12px;">
                <i class="fas ${tc.icon}" style="margin-right:4px;"></i> ${escHtml(getTypeLabel(h.type))}
              </span>
              ${h.diagnosedDate ? `<span><i class="fas fa-calendar" style="color:var(--text-muted);margin-right:4px;"></i> ${fmtDate(h.diagnosedDate)}</span>` : ''}
              ${h.doctor ? `<span><i class="fas fa-user-doctor" style="color:var(--text-muted);margin-right:4px;"></i> ${escHtml(h.doctor)}</span>` : ''}
            </div>
            <div class="item-meta" style="margin-top:8px;">
              ${sc ? `<span class="badge ${sc.color}">${sc.label}</span>` : ''}
              ${h.ongoing ? `<span class="badge badge-warning"><i class="fas fa-clock"></i> Active / Ongoing</span>` : `<span class="badge badge-success"><i class="fas fa-check"></i> Completed / Resolved</span>`}
            </div>
            ${h.notes ? `<div class="text-xs text-muted mt-2" style="background:rgba(255,255,255,0.02);padding:8px 12px;border-radius:8px;border-left:3px solid var(--primary);">${escHtml(h.notes)}</div>` : ''}
          </div>
          <div class="item-actions">
            <button class="icon-btn" title="Edit Record" onclick="Medical.openHistoryModal('${h.id}')"><i class="fas fa-pen"></i></button>
            <button class="icon-btn icon-btn-danger" title="Delete Record" onclick="Medical.confirmDelete('history','${h.id}','${escHtml(h.title)}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
    }).join('');
  };

  const openHistoryModal = (id = null) => {
    editingId = id;
    document.getElementById('history_form')?.reset();
    clearErrors('history_modal');
    const title = document.getElementById('history_modal_title');
    if (id) {
      const h = Storage.getMedicalHistory().find(x => x.id === id);
      if (!h) return;
      title.textContent = 'Edit Medical Record';
      setValue('h_title', h.title); setValue('h_type', h.type); setValue('h_severity', h.severity || '');
      setValue('h_date', h.diagnosedDate); setValue('h_doctor', h.doctor); setValue('h_notes', h.notes);
      document.getElementById('h_ongoing').checked = !!h.ongoing;
    } else {
      title.textContent = 'Add Medical Record';
      if (historyTypeFilter && historyTypeFilter !== 'all') {
        setValue('h_type', historyTypeFilter);
      }
    }
    document.getElementById('history_modal')?.classList.add('open');
  };

  const saveHistory = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    clearErrors('history_modal');
    const title = document.getElementById('h_title')?.value.trim();
    if (!title) { showErr('h_title_error', 'Condition or record title is required'); return; }
    const data = {
      title,
      type: getValue('h_type') || 'other',
      severity: getValue('h_severity'),
      diagnosedDate: getValue('h_date'),
      doctor: getValue('h_doctor'),
      notes: getValue('h_notes'),
      ongoing: document.getElementById('h_ongoing')?.checked
    };

    try {
      const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
        (document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '');
      const resp = await fetch('/users/elderly/medical/save-record/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(data)
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.success && result.record) {
          if (editingId) {
            Storage.updateMedicalHistory(editingId, result.record);
          } else {
            Storage.addMedicalHistory(result.record);
          }
          if (typeof Auth !== 'undefined' && Auth.showToast) Auth.showToast(result.message || 'Medical record saved!');
          closeModal('history_modal');
          renderHistory();
          return;
        }
      }
    } catch(err) {
      console.warn('Backend save record failed, saving locally', err);
    }

    if (editingId) {
      Storage.updateMedicalHistory(editingId, data);
      if (typeof Auth !== 'undefined' && Auth.showToast) Auth.showToast('Medical record updated!');
    } else {
      Storage.addMedicalHistory(data);
      if (typeof Auth !== 'undefined' && Auth.showToast) Auth.showToast('New medical record added!');
    }
    closeModal('history_modal');
    renderHistory();
  };

  // ══════════════════════════════════════════════════════════
  //  PRESCRIPTIONS
  // ══════════════════════════════════════════════════════════
  const renderPrescriptions = (query = '') => {
    let list = Storage.getPrescriptions().sort((a,b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
    if (query) { const q = query.toLowerCase(); list = list.filter(p => p.doctor?.toLowerCase().includes(q) || p.diagnosis?.toLowerCase().includes(q) || p.medications?.some(m => m.toLowerCase().includes(q))); }

    const container = document.getElementById('rx_list');
    if (!container) return;
    if (!list.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-prescription"></i></div><h3>No prescriptions added</h3><p>Add prescriptions received from your doctors.</p><button class="btn btn-primary btn-sm mt-4" onclick="Medical.openRxModal()"><i class="fas fa-plus"></i> Add Prescription</button></div>`;
      return;
    }
    container.innerHTML = list.map(rx => `
      <div class="item-card">
        <div class="item-icon stat-icon-green" style="width:46px;height:46px;font-size:1rem;"><i class="fas fa-prescription-bottle-medical"></i></div>
        <div class="item-body">
          <div class="item-title">${escHtml(rx.diagnosis || 'General Prescription')}</div>
          <div class="item-subtitle">
            ${rx.doctor ? `<span><i class="fas fa-user-doctor"></i> ${escHtml(rx.doctor)}</span>` : ''}
            ${rx.date   ? `<span>· <i class="fas fa-calendar"></i> ${fmtDate(rx.date)}</span>` : ''}
          </div>
          ${rx.medications?.length ? `<div class="item-meta">${rx.medications.map(m => `<span class="meta-tag"><i class="fas fa-pills"></i> ${escHtml(m)}</span>`).join('')}</div>` : ''}
          ${rx.validUntil ? `<div class="text-xs text-muted mt-2"><i class="fas fa-calendar-xmark"></i> Valid until ${fmtDate(rx.validUntil)}</div>` : ''}
          ${rx.notes ? `<div class="text-xs text-muted mt-1">${escHtml(rx.notes)}</div>` : ''}
        </div>
        <div class="item-actions">
          <button class="icon-btn" onclick="Medical.openRxModal('${rx.id}')"><i class="fas fa-pen"></i></button>
          <button class="icon-btn icon-btn-danger" onclick="Medical.confirmDelete('prescription','${rx.id}','Prescription')"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('');
  };

  const openRxModal = (id = null) => {
    editingId = id;
    document.getElementById('rx_form')?.reset();
    document.getElementById('rx_meds_container').innerHTML = '';
    clearErrors('rx_modal');
    const title = document.getElementById('rx_modal_title');
    if (id) {
      const rx = Storage.getPrescriptions().find(x => String(x.id) === String(id));
      if (!rx) return;
      title.textContent = 'Edit Prescription';
      setValue('rx_doctor', rx.doctor); setValue('rx_date', rx.date); setValue('rx_diagnosis', rx.diagnosis);
      setValue('rx_valid', rx.validUntil); setValue('rx_notes', rx.notes);
      if (rx.medications && rx.medications.length) {
        rx.medications.forEach(m => addMedRow(m));
      } else {
        addMedRow();
      }
    } else {
      title.textContent = 'Add Prescription';
      setValue('rx_date', new Date().toISOString().split('T')[0]);
      addMedRow();
    }
    document.getElementById('rx_modal')?.classList.add('open');
  };

  let medRowCount = 0;
  const addMedRow = (value = '') => {
    const c = document.getElementById('rx_meds_container');
    if (!c) return;
    const id = 'rxmed_' + (++medRowCount);
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2';
    div.innerHTML = `
      <div class="input-wrapper" style="flex:1;">
        <i class="fas fa-pills input-icon"></i>
        <input type="text" id="${id}" class="form-input rx-med-input" placeholder="e.g. Metformin 500mg twice daily" value="${escHtml(value)}" />
      </div>
      <button type="button" class="icon-btn icon-btn-danger" onclick="this.parentElement.remove()" title="Remove Medication"><i class="fas fa-times"></i></button>`;
    c.appendChild(div);
  };

  const saveRx = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    clearErrors('rx_modal');

    const medications = [...document.querySelectorAll('.rx-med-input')].map(i => i.value.trim()).filter(Boolean);
    const doctor = getValue('rx_doctor').trim();
    const date = getValue('rx_date').trim() || new Date().toISOString().split('T')[0];
    const diagnosis = getValue('rx_diagnosis').trim();
    const validUntil = getValue('rx_valid').trim();
    const notes = getValue('rx_notes').trim();

    if (!doctor && !diagnosis && medications.length === 0) {
      if (typeof Auth !== 'undefined' && Auth.showToast) {
        Auth.showToast('Please provide a doctor, diagnosis, or at least one medication.', 'error');
      } else {
        alert('Please provide a doctor, diagnosis, or at least one medication.');
      }
      return;
    }

    const payload = {
      id: editingId,
      doctor,
      date,
      diagnosis: diagnosis || (medications.length ? medications[0] : 'Prescription'),
      validUntil,
      notes,
      medications
    };

    const submitBtn = document.querySelector('#rx_form button[type="submit"]');
    const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    try {
      const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
        (document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '');

      const response = await fetch('/users/elderly/prescriptions/save/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.prescription) {
          if (editingId) {
            Storage.updatePrescription(editingId, result.prescription);
          } else {
            Storage.addPrescription(result.prescription);
          }
          if (typeof Auth !== 'undefined' && Auth.showToast) {
            Auth.showToast(result.message || 'Prescription saved successfully!');
          }
          closeModal('rx_modal');
          renderPrescriptions();
          return;
        }
      }
    } catch (err) {
      console.warn('Backend prescription save request failed, fallback to local storage', err);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origBtnHtml;
      }
    }

    // Fallback if offline/error
    if (editingId) {
      Storage.updatePrescription(editingId, payload);
      if (typeof Auth !== 'undefined' && Auth.showToast) Auth.showToast('Prescription updated!');
    } else {
      Storage.addPrescription(payload);
      if (typeof Auth !== 'undefined' && Auth.showToast) Auth.showToast('Prescription added!');
    }
    closeModal('rx_modal');
    renderPrescriptions();
  };

  // ══════════════════════════════════════════════════════════
  //  CONSULTATION NOTES
  // ══════════════════════════════════════════════════════════
  const renderNotes = (query = '') => {
    let list = Storage.getConsultNotes().sort((a,b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
    if (query) { const q = query.toLowerCase(); list = list.filter(n => n.doctor?.toLowerCase().includes(q) || n.summary?.toLowerCase().includes(q)); }

    const container = document.getElementById('notes_list');
    if (!container) return;
    if (!list.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-notes-medical"></i></div><h3>No consultation notes</h3><p>Add notes from doctor visits and consultations.</p><button class="btn btn-primary btn-sm mt-4" onclick="Medical.openNoteModal()"><i class="fas fa-plus"></i> Add Note</button></div>`;
      return;
    }
    container.innerHTML = list.map(n => `
      <div class="item-card card-info">
        <div class="item-icon stat-icon-blue" style="width:46px;height:46px;font-size:1rem;"><i class="fas fa-notes-medical"></i></div>
        <div class="item-body">
          <div class="item-title">${escHtml(n.summary || 'Consultation Note')}</div>
          <div class="item-subtitle">
            ${n.doctor ? `<span><i class="fas fa-user-doctor"></i> ${escHtml(n.doctor)}</span>` : ''}
            ${n.date   ? `<span>· <i class="fas fa-calendar"></i> ${fmtDate(n.date)}</span>` : ''}
            ${n.hospital ? `<span>· <i class="fas fa-hospital"></i> ${escHtml(n.hospital)}</span>` : ''}
          </div>
          ${n.findings ? `<div class="text-xs" style="color:var(--text-secondary);margin-top:8px;"><strong>Findings:</strong> ${escHtml(n.findings)}</div>` : ''}
          ${n.advice   ? `<div class="text-xs" style="color:var(--text-secondary);margin-top:4px;"><strong>Advice:</strong> ${escHtml(n.advice)}</div>` : ''}
          ${n.followUp ? `<div class="text-xs text-muted mt-1"><i class="fas fa-calendar-plus"></i> Follow-up: ${fmtDate(n.followUp)}</div>` : ''}
        </div>
        <div class="item-actions">
          <button class="icon-btn" onclick="Medical.openNoteModal('${n.id}')"><i class="fas fa-pen"></i></button>
          <button class="icon-btn icon-btn-danger" onclick="Medical.confirmDelete('note','${n.id}','Consultation Note')"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('');
  };

  const openNoteModal = (id = null) => {
    editingId = id;
    document.getElementById('note_form')?.reset();
    clearErrors('note_modal');
    const title = document.getElementById('note_modal_title');
    if (id) {
      const n = Storage.getConsultNotes().find(x => x.id === id);
      if (!n) return;
      title.textContent = 'Edit Note';
      setValue('note_summary', n.summary); setValue('note_doctor', n.doctor); setValue('note_date', n.date);
      setValue('note_hospital', n.hospital); setValue('note_findings', n.findings);
      setValue('note_advice', n.advice); setValue('note_followup', n.followUp);
    } else { title.textContent = 'Add Consultation Note'; }
    document.getElementById('note_modal')?.classList.add('open');
  };

  const saveNote = (e) => {
    e.preventDefault();
    clearErrors('note_modal');
    const summary = document.getElementById('note_summary')?.value.trim();
    if (!summary) { showErr('note_summary_error', 'Summary is required'); return; }
    const data = { summary, doctor: getValue('note_doctor'), date: getValue('note_date'), hospital: getValue('note_hospital'), findings: getValue('note_findings'), advice: getValue('note_advice'), followUp: getValue('note_followup') };
    if (editingId) { Storage.updateConsultNote(editingId, data); Auth.showToast('Note updated!'); }
    else { Storage.addConsultNote(data); Auth.showToast('Note added!'); }
    closeModal('note_modal'); renderNotes();
  };

  // ── Delete ──────────────────────────────────────────────────
  const confirmDelete = (type, id, name) => {
    deleteTarget = { type, id };
    const el = document.getElementById('delete_med_name');
    if (el) el.textContent = name;
    document.getElementById('confirm_med_modal')?.classList.add('open');
  };

  const doDelete = () => {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    if (type === 'history')      Storage.removeMedicalHistory(id);
    if (type === 'prescription') {
      Storage.removePrescription(id);
      if (!isNaN(id)) {
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
          (document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '');
        fetch(`/users/elderly/prescription/${id}/delete/`, {
          method: 'POST',
          headers: {
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
          }
        }).catch(err => console.warn('Could not delete on server:', err));
      }
    }
    if (type === 'note')         Storage.removeConsultNote(id);
    if (typeof Auth !== 'undefined' && Auth.showToast) Auth.showToast('Record deleted', 'error');
    document.getElementById('confirm_med_modal')?.classList.remove('open');
    deleteTarget = null;
    renderActiveTab();
  };

  const cancelDelete = () => { deleteTarget = null; document.getElementById('confirm_med_modal')?.classList.remove('open'); };

  // ── Utilities ────────────────────────────────────────────────
  const closeModal = (id) => { document.getElementById(id)?.classList.remove('open'); editingId = null; };
  const getValue = (id) => document.getElementById(id)?.value || '';
  const setValue = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const showErr  = (id, msg) => { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.add('visible'); } };
  const clearErrors = (modalId) => { document.querySelectorAll(`#${modalId} .field-error`).forEach(el => { el.textContent = ''; el.classList.remove('visible'); }); };
  const capitalize = (s) => String(s).charAt(0).toUpperCase() + s.slice(1);

  return {
    switchTab, renderActiveTab, filterByType, getTypeLabel,
    // History
    openHistoryModal, saveHistory, closeHistoryModal: () => closeModal('history_modal'),
    // Prescriptions
    openRxModal, saveRx, addMedRow, closeRxModal: () => closeModal('rx_modal'),
    // Notes
    openNoteModal, saveNote, closeNoteModal: () => closeModal('note_modal'),
    // Delete
    confirmDelete, doDelete, cancelDelete,
  };
})();
