/**
 * Smart Elderly Care Management System
 * Admin Portal - UI Setup (Mobile sidebar toggle & UI helpers)
 */

const AdminApp = (() => {
  const init = () => {
    // Sidebar Toggle
    const toggleBtn = document.getElementById('sidebar_toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar_overlay');

    if (toggleBtn && sidebar && overlay) {
      const toggle = () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
      };
      toggleBtn.addEventListener('click', toggle);
      overlay.addEventListener('click', toggle);
    }
  };

  return { init };
})();

// Ensure universal Pop-up Notification System is active
if (!window.showPopup && !document.querySelector('script[src*="popup.js"]')) {
  const pScript = document.createElement('script');
  pScript.src = '/static/js/popup.js';
  pScript.async = false;
  document.head.appendChild(pScript);
}

document.addEventListener('DOMContentLoaded', AdminApp.init);
