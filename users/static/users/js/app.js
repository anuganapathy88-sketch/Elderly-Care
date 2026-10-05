/**
 * Smart Elderly Care Management System
 * App Initialization (Mobile sidebar toggle & UI helpers)
 */

const App = (() => {
  // Mobile sidebar toggle
  const initMobileToggle = () => {
    const toggleBtn = document.getElementById('sidebar_toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar_overlay');

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('visible');
      });
    }
    if (overlay) {
      overlay.addEventListener('click', () => {
        if (sidebar) sidebar.classList.remove('open');
        overlay.classList.remove('visible');
      });
    }
  };

  const init = () => {
    initMobileToggle();
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

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
