/**
 * Smart Elderly Care Management System
 * Doctors Module — Doctor directory, detail view, booking
 */

const Doctors = (() => {

  // ── Seed Sample Doctors ─────────────────────────────────────
  const seedDoctors = () => {
    if (Storage.getDoctors().length > 0) return;
    const doctors = [
      { id: 'doc_1', name: 'Dr. Priya Sharma', specialization: 'Cardiologist', hospital: 'Apollo Hospital', location: 'Chennai', experience: 15, rating: 4.9, reviews: 312, fee: 800, phone: '9876543210', email: 'priya.sharma@apollo.com', available: ['Mon','Wed','Fri'], timings: '10:00 AM – 4:00 PM', about: 'Specialist in cardiovascular diseases with expertise in echocardiography and interventional cardiology.', tags: ['Heart', 'BP', 'Cholesterol'], image: '' },
      { id: 'doc_2', name: 'Dr. Ramesh Nair', specialization: 'Orthopedist', hospital: 'Fortis Hospital', location: 'Bangalore', experience: 20, rating: 4.8, reviews: 256, fee: 700, phone: '9876543211', email: 'ramesh.nair@fortis.com', available: ['Tue','Thu','Sat'], timings: '9:00 AM – 2:00 PM', about: 'Expert in joint replacements, fractures, and spine surgery with over 2000 successful procedures.', tags: ['Joints', 'Spine', 'Fractures'], image: '' },
      { id: 'doc_3', name: 'Dr. Anitha Reddy', specialization: 'Neurologist', hospital: 'Manipal Hospital', location: 'Hyderabad', experience: 12, rating: 4.7, reviews: 198, fee: 900, phone: '9876543212', email: 'anitha.reddy@manipal.com', available: ['Mon','Tue','Wed','Thu','Fri'], timings: '11:00 AM – 5:00 PM', about: 'Neurological specialist treating stroke, epilepsy, Parkinson\'s, Alzheimer\'s and dementia.', tags: ['Brain', 'Memory', 'Parkinson\'s'], image: '' },
      { id: 'doc_4', name: 'Dr. Suresh Kumar', specialization: 'Diabetologist', hospital: 'AIIMS', location: 'Delhi', experience: 18, rating: 4.9, reviews: 445, fee: 600, phone: '9876543213', email: 'suresh.kumar@aiims.edu', available: ['Mon','Wed','Fri','Sat'], timings: '8:00 AM – 1:00 PM', about: 'Leading expert in diabetes management, insulin therapy, and metabolic disorders.', tags: ['Diabetes', 'Thyroid', 'Obesity'], image: '' },
      { id: 'doc_5', name: 'Dr. Meena Iyer', specialization: 'Geriatrician', hospital: 'NIMHANS', location: 'Bangalore', experience: 22, rating: 4.9, reviews: 387, fee: 1000, phone: '9876543214', email: 'meena.iyer@nimhans.ac.in', available: ['Tue','Thu','Sat'], timings: '10:00 AM – 3:00 PM', about: 'Specializes in elderly care, age-related diseases, cognitive decline, and comprehensive geriatric assessments.', tags: ['Elderly Care', 'Dementia', 'Frailty'], image: '' },
      { id: 'doc_6', name: 'Dr. Vijay Patel', specialization: 'Pulmonologist', hospital: 'Wockhardt Hospital', location: 'Mumbai', experience: 14, rating: 4.6, reviews: 201, fee: 750, phone: '9876543215', email: 'vijay.patel@wockhardt.com', available: ['Mon','Wed','Thu','Fri'], timings: '9:30 AM – 4:30 PM', about: 'Expert in respiratory diseases, COPD, asthma, and sleep disorders.', tags: ['Lungs', 'COPD', 'Asthma'], image: '' },
      { id: 'doc_7', name: 'Dr. Lakshmi Nair', specialization: 'Ophthalmologist', hospital: 'Sankara Nethralaya', location: 'Chennai', experience: 10, rating: 4.8, reviews: 322, fee: 650, phone: '9876543216', email: 'lakshmi.nair@sankara.net', available: ['Mon','Tue','Thu','Fri'], timings: '10:00 AM – 5:00 PM', about: 'Specialist in cataract surgery, glaucoma treatment, and diabetic eye disease management.', tags: ['Eyes', 'Cataract', 'Glaucoma'], image: '' },
      { id: 'doc_8', name: 'Dr. Arun Menon', specialization: 'General Physician', hospital: 'Columbia Asia', location: 'Kochi', experience: 8, rating: 4.5, reviews: 189, fee: 400, phone: '9876543217', email: 'arun.menon@columbia.com', available: ['Mon','Tue','Wed','Thu','Fri','Sat'], timings: '8:00 AM – 8:00 PM', about: 'General medicine practitioner providing comprehensive primary care and preventive medicine.', tags: ['General', 'Fever', 'Preventive Care'], image: '' },
    ];
    Storage.saveDoctors(doctors);
  };

  // ── Specializations list ────────────────────────────────────
  const getSpecializations = () => {
    const docs = Storage.getDoctors();
    return [...new Set(docs.map(d => d.specialization))].sort();
  };

  // ── Render Stars ────────────────────────────────────────────
  const renderStars = (rating) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    let stars = '';
    for (let i = 0; i < full; i++) stars += '<i class="fas fa-star" style="color:#f59e0b;font-size:0.75rem;"></i>';
    if (half) stars += '<i class="fas fa-star-half-stroke" style="color:#f59e0b;font-size:0.75rem;"></i>';
    return stars;
  };

  // ── Render Doctor Cards ─────────────────────────────────────
  const renderList = (filter = 'all', query = '') => {
    let docs = Storage.getDoctors();

    if (filter !== 'all') docs = docs.filter(d => d.specialization === filter);
    if (query) {
      const q = query.toLowerCase();
      docs = docs.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.specialization.toLowerCase().includes(q) ||
        d.hospital.toLowerCase().includes(q) ||
        d.location.toLowerCase().includes(q) ||
        (d.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    const container = document.getElementById('doctors_list');
    if (!container) return;

    if (!docs.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-user-doctor"></i></div>
          <h3>No doctors found</h3>
          <p>Try adjusting your search or filter.</p>
        </div>`;
      return;
    }

    const SPEC_ICONS = {
      'Cardiologist': 'fa-heart-pulse', 'Orthopedist': 'fa-bone', 'Neurologist': 'fa-brain',
      'Diabetologist': 'fa-syringe', 'Geriatrician': 'fa-person-cane', 'Pulmonologist': 'fa-lungs',
      'Ophthalmologist': 'fa-eye', 'General Physician': 'fa-stethoscope',
    };
    const SPEC_COLORS = {
      'Cardiologist': 'stat-icon-red', 'Orthopedist': 'stat-icon-amber', 'Neurologist': 'stat-icon-purple',
      'Diabetologist': 'stat-icon-blue', 'Geriatrician': 'stat-icon-green', 'Pulmonologist': 'stat-icon-blue',
      'Ophthalmologist': 'stat-icon-amber', 'General Physician': 'stat-icon-green',
    };

    container.innerHTML = docs.map(doc => `
      <div class="doctor-card" onclick="window.location.href='doctor-detail.html?id=${doc.id}'" style="cursor:pointer;">
        <div class="doctor-card-header">
          <div class="item-icon ${SPEC_COLORS[doc.specialization] || ''}" style="width:56px;height:56px;font-size:1.3rem;">
            <i class="fas ${SPEC_ICONS[doc.specialization] || 'fa-user-doctor'}"></i>
          </div>
          <div style="flex:1;min-width:0;">
            <div class="doctor-name">${escHtml(doc.name)}</div>
            <div class="doctor-spec">${escHtml(doc.specialization)}</div>
            <div class="doctor-hospital"><i class="fas fa-hospital"></i> ${escHtml(doc.hospital)}, ${escHtml(doc.location)}</div>
          </div>
        </div>
        <div class="doctor-meta">
          <div class="doctor-rating">
            ${renderStars(doc.rating)}
            <span>${doc.rating} (${doc.reviews})</span>
          </div>
          <span class="meta-tag"><i class="fas fa-briefcase"></i> ${doc.experience} yrs exp</span>
          <span class="meta-tag" style="color:var(--primary);border-color:rgba(16,185,129,0.2);">
            <i class="fas fa-indian-rupee-sign"></i> ₹${doc.fee}
          </span>
        </div>
        <div class="doctor-tags">
          ${(doc.tags || []).map(t => `<span class="meta-tag">${t}</span>`).join('')}
        </div>
        <div class="doctor-card-footer">
          <span class="meta-tag" style="color:var(--success);border-color:rgba(16,185,129,0.2);">
            <i class="fas fa-circle" style="font-size:0.4rem;"></i> Available
          </span>
          <a href="doctor-detail.html?id=${doc.id}" class="btn btn-primary btn-sm" onclick="event.stopPropagation()">
            <i class="fas fa-calendar-plus"></i> Book
          </a>
        </div>
      </div>`).join('');
  };

  // ── Doctor Detail Page ──────────────────────────────────────
  const loadDetail = () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) { window.location.href = 'doctors.html'; return; }

    const doc = Storage.getDoctorById(id);
    if (!doc) { window.location.href = 'doctors.html'; return; }

    const SPEC_ICONS = {
      'Cardiologist': 'fa-heart-pulse', 'Orthopedist': 'fa-bone', 'Neurologist': 'fa-brain',
      'Diabetologist': 'fa-syringe', 'Geriatrician': 'fa-person-cane', 'Pulmonologist': 'fa-lungs',
      'Ophthalmologist': 'fa-eye', 'General Physician': 'fa-stethoscope',
    };
    const SPEC_COLORS = {
      'Cardiologist': 'stat-icon-red', 'Orthopedist': 'stat-icon-amber', 'Neurologist': 'stat-icon-purple',
      'Diabetologist': 'stat-icon-blue', 'Geriatrician': 'stat-icon-green', 'Pulmonologist': 'stat-icon-blue',
      'Ophthalmologist': 'stat-icon-amber', 'General Physician': 'stat-icon-green',
    };

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val || '—'; };
    set('dd_name',    escHtml(doc.name));
    set('dd_spec',    escHtml(doc.specialization));
    set('dd_hosp',    `<i class="fas fa-hospital"></i> ${escHtml(doc.hospital)}, ${escHtml(doc.location)}`);
    set('dd_exp',     `<i class="fas fa-briefcase"></i> ${doc.experience} years experience`);
    set('dd_fee',     `<i class="fas fa-indian-rupee-sign"></i> ₹${doc.fee} per consultation`);
    set('dd_phone',   `<a href="tel:${doc.phone}" style="color:var(--primary)">${doc.phone}</a>`);
    set('dd_email',   `<a href="mailto:${doc.email}" style="color:var(--primary)">${escHtml(doc.email)}</a>`);
    set('dd_timings', doc.timings || '—');
    set('dd_rating',  `${renderStars(doc.rating)} <span style="margin-left:4px;">${doc.rating} (${doc.reviews} reviews)</span>`);
    set('dd_about',   escHtml(doc.about));
    set('dd_available', (doc.available || []).map(d => `<span class="meta-tag" style="color:var(--primary);">${d}</span>`).join(''));
    set('dd_tags', (doc.tags || []).map(t => `<span class="badge badge-info">${t}</span>`).join(' '));

    const iconEl = document.getElementById('dd_icon');
    if (iconEl) {
      iconEl.className = `item-icon ${SPEC_COLORS[doc.specialization] || ''} dd-icon`;
      iconEl.innerHTML = `<i class="fas ${SPEC_ICONS[doc.specialization] || 'fa-user-doctor'}"></i>`;
    }

    document.title = `${doc.name} — Smart Elderly Care`;

    const bookBtn = document.getElementById('dd_book_btn');
    if (bookBtn) bookBtn.onclick = () => openBookingModal(doc);
  };

  // ── Booking Modal ───────────────────────────────────────────
  const openBookingModal = (doc) => {
    const modal = document.getElementById('booking_modal');
    if (!modal) return;
    document.getElementById('bk_doctor_name').textContent = doc.name;
    document.getElementById('bk_doctor_spec').textContent = doc.specialization;
    document.getElementById('bk_doctor_hosp').textContent = doc.hospital + ', ' + doc.location;

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('bk_date').min = today;
    document.getElementById('bk_date').value = '';
    document.getElementById('bk_time').value = '';
    document.getElementById('bk_reason').value = '';
    document.querySelectorAll('#booking_modal .field-error').forEach(el => { el.textContent = ''; el.classList.remove('visible'); });

    modal._docData = doc;
    modal.classList.add('open');
  };

  const closeBookingModal = () => {
    document.getElementById('booking_modal')?.classList.remove('open');
  };

  const confirmBooking = () => {
    const modal = document.getElementById('booking_modal');
    const doc = modal?._docData;
    if (!doc) return;

    const date   = document.getElementById('bk_date').value;
    const time   = document.getElementById('bk_time').value;
    const reason = document.getElementById('bk_reason').value.trim();

    const showErr = (id, msg) => { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.add('visible'); } };
    document.querySelectorAll('#booking_modal .field-error').forEach(el => { el.textContent = ''; el.classList.remove('visible'); });

    let valid = true;
    if (!date) { showErr('bk_date_error', 'Please select a date'); valid = false; }
    if (!time) { showErr('bk_time_error', 'Please select a time slot'); valid = false; }
    if (!valid) return;

    // Save appointment
    const apptKey = 'eldc_appointments';
    const session = Storage.getCurrentSession();
    const all = JSON.parse(localStorage.getItem(apptKey)) || [];
    const appt = {
      id: 'appt_' + Date.now(),
      userId: session.id,
      doctorId: doc.id,
      doctorName: doc.name.replace('Dr. ', ''),
      specialization: doc.specialization,
      hospital: doc.hospital + ', ' + doc.location,
      date, time,
      notes: reason,
      status: 'upcoming',
      fee: doc.fee,
      createdAt: new Date().toISOString(),
    };
    all.push(appt);
    localStorage.setItem(apptKey, JSON.stringify(all));

    // Notification
    const apptDate = new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    Storage.addNotification({
      type: 'appointment_confirmed',
      title: 'Appointment Confirmed! ✅',
      message: `Your appointment with ${doc.name} (${doc.specialization}) is confirmed for ${apptDate} at ${time}.`,
      icon: 'fa-calendar-check',
      color: 'success',
      relatedId: appt.id,
      read: false,
    });

    // Reminder notification (upcoming)
    Storage.addNotification({
      type: 'appointment_reminder',
      title: 'Upcoming Appointment 🔔',
      message: `Reminder: ${doc.name} on ${apptDate} at ${time}. Hospital: ${doc.hospital}.`,
      icon: 'fa-bell',
      color: 'info',
      relatedId: appt.id,
      read: false,
    });

    closeBookingModal();
    updateNotifBadge();
    Auth.showToast(`✅ Appointment booked with ${doc.name}!`);
    setTimeout(() => window.location.href = 'appointments.html', 1500);
  };

  // ── Update notification badge in topbar ─────────────────────
  const updateNotifBadge = () => {
    const count = Storage.getUnreadCount();
    const dot = document.querySelector('.notif-dot');
    const badge = document.getElementById('notif_count_badge');
    if (dot) dot.style.display = count > 0 ? 'block' : 'none';
    if (badge) badge.textContent = count > 0 ? count : '';
  };

  const escHtml = (str) => String(str || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

  return { seedDoctors, renderList, loadDetail, getSpecializations, openBookingModal, closeBookingModal, confirmBooking, updateNotifBadge };
})();
