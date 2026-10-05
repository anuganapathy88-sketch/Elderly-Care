/**
 * Smart Elderly Care Management System
 * Universal Pop-up Message & Notification System
 * Automatically alerts users when editing, saving, or updating data.
 */

(function () {
  'use strict';

  // ── Audio Feedback (Synthesized via Web Audio API) ─────────────
  function playPopupChime(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;

      if (type === 'error') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.28);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.28);
      } else {
        // Melodic ascending two-tone success chime: C5 (523Hz) -> E5 (659Hz)
        [523.25, 659.25].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          const startTime = now + i * 0.09;
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.12, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.32);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.32);
        });
      }
    } catch (e) {
      // Audio autoplay policy or device without audio
    }
  }

  // ── Container Setup ───────────────────────────────────────────
  function getContainer() {
    let container = document.getElementById('popup_container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'popup_container';
      container.className = 'popup-container';
      document.body.appendChild(container);
    }
    return container;
  }

  // ── Popup Generator ───────────────────────────────────────────
  function showPopup(options, typeFallback, titleFallback) {
    if (!options) return;

    if (typeof options === 'string') {
      options = { message: options, type: typeFallback || 'success', title: titleFallback };
    }

    const message = options.message || '';
    let type = (options.type || 'success').toLowerCase();
    if (type.includes('err') || type.includes('danger')) type = 'error';
    else if (type.includes('warn')) type = 'warning';
    else if (type.includes('info')) type = 'info';
    else type = 'success';

    // Deduplication check: ignore identical message if fired within last 1200ms
    const msgKey = `${type}:${message.trim()}`;
    const nowTime = Date.now();
    window._recentPopups = window._recentPopups || {};
    if (window._recentPopups[msgKey] && (nowTime - window._recentPopups[msgKey] < 1200)) {
      return null;
    }
    window._recentPopups[msgKey] = nowTime;

    let defaultTitle = 'Saved Successfully ✨';
    let iconClass = 'fa-circle-check';

    if (type === 'error') {
      defaultTitle = 'Action Failed ⚠️';
      iconClass = 'fa-triangle-exclamation';
    } else if (type === 'warning') {
      defaultTitle = 'Attention ⚠️';
      iconClass = 'fa-bell';
    } else if (type === 'info') {
      defaultTitle = 'Notice ℹ️';
      iconClass = 'fa-circle-info';
    }

    // Contextual title deduction from message text
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('update') || lowerMsg.includes('edited') || lowerMsg.includes('modified')) {
      if (type === 'success') defaultTitle = 'Changes Saved Successfully ✨';
    } else if (lowerMsg.includes('appoint') && lowerMsg.includes('book')) {
      if (type === 'success') defaultTitle = 'Appointment Booked! 📅';
    } else if (lowerMsg.includes('medic') || lowerMsg.includes('prescri')) {
      if (type === 'success') defaultTitle = 'Medication Saved! 💊';
    } else if (lowerMsg.includes('record')) {
      if (type === 'success') defaultTitle = 'Medical Record Saved! 📋';
    } else if (lowerMsg.includes('contact')) {
      if (type === 'success') defaultTitle = 'Emergency Contact Saved! 📞';
    } else if (lowerMsg.includes('password')) {
      if (type === 'success') defaultTitle = 'Password Updated! 🔒';
    } else if (lowerMsg.includes('welcom') || lowerMsg.includes('login') || lowerMsg.includes('signed in')) {
      if (type === 'success') defaultTitle = 'Welcome Back! 👋';
    }

    const title = options.title || defaultTitle;
    const duration = options.duration || 4500;

    const container = getContainer();

    // Limit maximum stacked popups to 4
    if (container.children.length >= 4) {
      dismissPopup(container.firstElementChild);
    }

    const card = document.createElement('div');
    card.className = `popup-card popup-${type}`;

    card.innerHTML = `
      <div class="popup-icon-wrap">
        <i class="fas ${iconClass}"></i>
      </div>
      <div class="popup-content">
        <div class="popup-title">${title}</div>
        <div class="popup-text">${message}</div>
      </div>
      <button type="button" class="popup-close" title="Dismiss" aria-label="Dismiss">
        <i class="fas fa-times"></i>
      </button>
      <div class="popup-progress">
        <div class="popup-progress-bar" style="animation: popupProgress ${duration}ms linear forwards;"></div>
      </div>
    `;

    container.appendChild(card);

    // Audio chime
    if (!options.silent) {
      playPopupChime(type);
    }

    // Trigger smooth entrance animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.classList.add('popup-visible');
      });
    });

    let dismissTimer = setTimeout(() => {
      dismissPopup(card);
    }, duration);

    // Pause timer on hover
    card.addEventListener('mouseenter', () => {
      clearTimeout(dismissTimer);
      const bar = card.querySelector('.popup-progress-bar');
      if (bar) bar.style.animationPlayState = 'paused';
    });

    card.addEventListener('mouseleave', () => {
      const bar = card.querySelector('.popup-progress-bar');
      if (bar) bar.style.animationPlayState = 'running';
      dismissTimer = setTimeout(() => {
        dismissPopup(card);
      }, 1800);
    });

    // Dismiss on click close button
    const closeBtn = card.querySelector('.popup-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(dismissTimer);
        dismissPopup(card);
      });
    }

    return card;
  }

  function dismissPopup(card) {
    if (!card || card._isDismissing) return;
    card._isDismissing = true;
    card.classList.remove('popup-visible');
    card.classList.add('popup-hiding');
    setTimeout(() => {
      card.remove();
    }, 320);
  }

  // ── Auto-Scan Server-Rendered Django Messages ───────────────────
  function scanServerMessages() {
    // 1. Check if structured json data container exists
    const dataEl = document.getElementById('django_messages_data');
    if (dataEl && dataEl.dataset.messages) {
      try {
        const list = JSON.parse(dataEl.dataset.messages);
        list.forEach((item, idx) => {
          setTimeout(() => {
            showPopup({ message: item.text, type: item.tags || 'success' });
          }, idx * 250);
        });
      } catch (err) {}
    }

    // 2. Scan for static rendered message blocks (e.g. .toast or .alert)
    document.querySelectorAll('.toast, .alert, [class*="alert-"], [class*="toast-"]').forEach((el) => {
      // Don't process our own popup elements
      if (el.closest('#popup_container') || el.classList.contains('popup-card')) return;

      const text = el.innerText || el.textContent;
      if (text && text.trim()) {
        const cls = el.className.toLowerCase();
        let type = 'success';
        if (cls.includes('error') || cls.includes('danger')) type = 'error';
        else if (cls.includes('warn')) type = 'warning';
        else if (cls.includes('info')) type = 'info';

        // Trigger floating popup
        showPopup({ message: text.trim(), type: type });

        // Hide static inline box to prevent clumsy duplicated display
        el.style.display = 'none';
      }
    });
  }

  // ── Form Save Interceptor (Instant Save Feedback) ──────────────
  function initFormSaveFeedback() {
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (!form || form.tagName !== 'FORM') return;

      // Find submit button in this form
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      if (!submitBtn) return;

      const btnText = (submitBtn.innerText || submitBtn.value || '').trim();
      const isSaveAction =
        /save|update|create|book|confirm|submit|add|apply/i.test(btnText) ||
        form.classList.contains('save-form') ||
        form.id.includes('save') ||
        form.id.includes('edit');

      if (isSaveAction) {
        // Show saving state on button
        if (!submitBtn.dataset.originalHtml) {
          submitBtn.dataset.originalHtml = submitBtn.innerHTML;
        }
        submitBtn.style.pointerEvents = 'none';
        submitBtn.style.opacity = '0.75';
        submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i> Saving...`;

        // Safety fallback: re-enable after 6 seconds in case navigation is cancelled
        setTimeout(() => {
          if (submitBtn && submitBtn.dataset.originalHtml) {
            submitBtn.style.pointerEvents = 'auto';
            submitBtn.style.opacity = '1';
            submitBtn.innerHTML = submitBtn.dataset.originalHtml;
          }
        }, 6000);
      }
    }, true);
  }

  // ── Global API Exports ──────────────────────────────────────────
  window.showPopup = showPopup;
  window.showToast = (msg, type = 'success', title) => showPopup({ message: msg, type: type, title: title });
  window.showSuccess = (msg, title) => showPopup({ message: msg, type: 'success', title: title });
  window.showError = (msg, title) => showPopup({ message: msg, type: 'error', title: title });
  window.showInfo = (msg, title) => showPopup({ message: msg, type: 'info', title: title });
  window.showWarning = (msg, title) => showPopup({ message: msg, type: 'warning', title: title });

  // Seamless backward compatibility for Auth.showToast
  window.Auth = window.Auth || {};
  window.Auth.showToast = (msg, type = 'success') => {
    showPopup({ message: msg, type: type });
  };

  // ── Initialize on DOM Ready ─────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      scanServerMessages();
      initFormSaveFeedback();
    });
  } else {
    scanServerMessages();
    initFormSaveFeedback();
  }
})();
