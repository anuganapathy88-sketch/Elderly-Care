/**
 * Smart Elderly Care Management System
 * Notifications Module
 */

const Notifications = (() => {
  const TYPE_CONFIG = {
    appointment_confirmed: { icon: 'fa-calendar-check', color: 'var(--success)', bg: 'rgba(16,185,129,0.1)', label: 'Appointment Confirmed' },
    appointment_reminder:  { icon: 'fa-bell', color: 'var(--info)', bg: 'rgba(59,130,246,0.1)', label: 'Reminder' },
    appointment_cancelled: { icon: 'fa-calendar-xmark', color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)', label: 'Cancelled' },
    medication_reminder:   { icon: 'fa-pills', color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)', label: 'Medication' },
    general:               { icon: 'fa-bell', color: 'var(--primary)', bg: 'rgba(16,185,129,0.1)', label: 'General' },
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24)  return `${hrs}h ago`;
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  const renderList = () => {
    const list = Storage.getNotifications();
    const container = document.getElementById('notif_list');
    if (!container) return;

    // Update badge
    updateBadge();

    // Unread count
    const unread = list.filter(n => !n.read).length;
    const countEl = document.getElementById('notif_unread_count');
    if (countEl) countEl.textContent = unread > 0 ? `${unread} unread` : 'All caught up!';

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-bell-slash"></i></div>
          <h3>No notifications</h3>
          <p>You're all caught up! Notifications will appear here when you book appointments or set reminders.</p>
        </div>`;
      return;
    }

    container.innerHTML = list.map(n => {
      const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.general;
      return `
        <div class="notif-item ${n.read ? 'read' : 'unread'}" id="notif_${n.id}" onclick="Notifications.markRead('${n.id}')">
          <div class="notif-icon-wrap" style="background:${cfg.bg}">
            <i class="fas ${cfg.icon}" style="color:${cfg.color};font-size:1.1rem;"></i>
            ${!n.read ? `<span class="notif-unread-dot"></span>` : ''}
          </div>
          <div class="notif-body">
            <div class="notif-title">${escHtml(n.title)}</div>
            <div class="notif-message">${escHtml(n.message)}</div>
            <div class="notif-time"><i class="fas fa-clock"></i> ${timeAgo(n.createdAt)}</div>
          </div>
          <button class="icon-btn icon-btn-danger notif-delete-btn" onclick="event.stopPropagation(); Notifications.remove('${n.id}')" title="Remove">
            <i class="fas fa-times"></i>
          </button>
        </div>`;
    }).join('');
  };

  const markRead = (id) => {
    Storage.markNotifRead(id);
    const el = document.getElementById('notif_' + id);
    if (el) el.classList.replace('unread', 'read');
    const dot = el?.querySelector('.notif-unread-dot');
    if (dot) dot.remove();
    updateBadge();
    const unread = Storage.getUnreadCount();
    const countEl = document.getElementById('notif_unread_count');
    if (countEl) countEl.textContent = unread > 0 ? `${unread} unread` : 'All caught up!';
  };

  const markAllRead = () => {
    Storage.markAllNotifsRead();
    renderList();
  };

  const remove = (id) => {
    Storage.removeNotification(id);
    renderList();
  };

  const updateBadge = () => {
    const count = Storage.getUnreadCount();
    const dot = document.querySelector('.notif-dot');
    const badge = document.getElementById('notif_count_badge');
    if (dot) dot.style.display = count > 0 ? 'block' : 'none';
    if (badge) { badge.textContent = count > 0 ? (count > 99 ? '99+' : count) : ''; badge.style.display = count > 0 ? 'flex' : 'none'; }
  };

  // Seed a welcome notification for first-time users
  const seedWelcomeNotif = () => {
    const session = Storage.getCurrentSession();
    if (!session) return;
    const key = 'eldc_welcome_notif_' + session.id;
    if (localStorage.getItem(key)) return;
    Storage.addNotification({
      type: 'general',
      title: 'Welcome to Smart Elderly Care! 👋',
      message: `Hello ${session.name?.split(' ')[0] || 'there'}! Your account is set up. Start by adding medications, booking appointments, or updating your profile.`,
      icon: 'fa-heart-pulse',
      color: 'success',
      read: false,
    });
    localStorage.setItem(key, '1');
  };

  const escHtml = (str) => String(str || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

  return { renderList, markRead, markAllRead, remove, updateBadge, seedWelcomeNotif };
})();
