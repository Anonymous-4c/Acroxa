// public/acrx/assets/js/viewUser.js — User profile preview (SSE-first)
'use strict';

(function ViewUserModule() {

  const _pstate = (() => {
    const el = document.getElementById('viewuser-state');
    try { return el ? JSON.parse(el.textContent) : {}; } catch { return {}; }
  })();

  const userId = _pstate.userId;
  const sessionUser = _pstate.sessionUser;
  const API_PREFIX = '/acr/api/users';

  async function apiFetch(path, opts = {}) {
    const res = await fetch(API_PREFIX + path, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
  }

  function toast(msg, type = 'info') {
    let stack = document.getElementById('u-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'u-toast-stack';
      stack.className = 'u-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const t = document.createElement('div');
    t.className = `u-toast u-toast--${type}`;
    t.innerHTML = `<i class="fa-regular fa-${type === 'success' ? 'circle-check' : type === 'error' ? 'circle-xmark' : 'circle-info'}"></i> ${msg}`;
    stack.prepend(t);
    requestAnimationFrame(() => t.classList.add('u-toast--visible'));
    setTimeout(() => {
      t.classList.remove('u-toast--visible');
      t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, 3800);
  }

  let _resolveConfirm = null;

  function confirm(title, msg, danger = false) {
    let overlay = document.getElementById('u-confirm-modal');
    if (!overlay) return Promise.resolve(false);
    document.getElementById('u-modal-title').textContent = title;
    document.getElementById('u-modal-msg').textContent = msg;
    const okBtn = document.getElementById('u-modal-confirm');
    okBtn.className = danger ? 'u-modal-confirm-btn u-modal-confirm-btn--danger' : 'u-modal-confirm-btn';
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-open');
    return new Promise(r => { _resolveConfirm = r; });
  }

  function closeModal() {
    const overlay = document.getElementById('u-confirm-modal');
    if (overlay) {
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('is-open');
    }
    if (_resolveConfirm) { _resolveConfirm(false); _resolveConfirm = null; }
  }

  // ── SSE live updates ──
  let evtSource = null;

  function connectSSE() {
    if (evtSource) { evtSource.close(); }
    evtSource = new EventSource('/acr/api/activity-stream');
    evtSource.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'activity' && data.userId === userId) {
          updateLiveStatus(data);
        }
      } catch {}
    };
    evtSource.onerror = () => {
      evtSource.close();
      setTimeout(connectSSE, 5000);
    };
  }

  function updateLiveStatus(data) {
    const dot = document.querySelector('[data-field="online-dot"]');
    const pill = document.querySelector('[data-field="status-pill"]');
    const statusEl = document.querySelector('[data-field="live-status"]');
    const pageEl = document.querySelector('[data-field="live-page"]');
    const seenEl = document.querySelector('[data-field="live-seen"]');
    const ipEl = document.querySelector('[data-field="live-ip"]');

    // Update rings if present
    const ringVisits = document.querySelector('#ring-visits .pf-ring-value');
    const ringPages = document.querySelector('#ring-pages .pf-ring-value');
    const ringActions = document.querySelector('#ring-actions .pf-ring-value');
    const ringTime = document.querySelector('#ring-time .pf-ring-value');

    if (data.activePage) {
      // Online
      if (dot) dot.className = 'pf-online-dot is-online';
      if (pill) { pill.className = 'pf-status-pill pf-status--online'; pill.innerHTML = '<i class="pf-status-dot"></i> Online'; }
      if (statusEl) { statusEl.textContent = 'Online'; statusEl.className = 'pf-stat-value pf-val--online'; }
      if (pageEl) pageEl.textContent = data.activePage;
      if (seenEl) seenEl.textContent = 'just now';
      if (ipEl && data.ip) ipEl.textContent = data.ip;

      // Update rings with new values
      if (ringVisits && data.todayVisits !== undefined) {
        ringVisits.textContent = String(data.todayVisits);
        updateRingProgress('ring-visits', data.todayVisits, Math.max(data.todayVisits, 10));
      }
      if (ringPages && data.pagesViewedToday !== undefined) {
        ringPages.textContent = String(data.pagesViewedToday);
        updateRingProgress('ring-pages', data.pagesViewedToday, Math.max(data.pagesViewedToday, 10));
      }
      if (ringActions && data.actionsToday !== undefined) {
        ringActions.textContent = String(data.actionsToday);
        updateRingProgress('ring-actions', data.actionsToday, Math.max(data.actionsToday, 10));
      }
      if (ringTime && data.totalTimeOnline !== undefined) {
        const mins = Math.round(data.totalTimeOnline / 60000);
        ringTime.textContent = String(mins);
        updateRingProgress('ring-time', mins, Math.max(mins, 480));
      }
    } else {
      // Offline
      if (dot) dot.className = 'pf-online-dot';
      if (pill) { pill.className = 'pf-status-pill pf-status--offline'; pill.innerHTML = '<i class="pf-status-dot"></i> Offline'; }
      if (statusEl) { statusEl.textContent = 'Offline'; statusEl.className = 'pf-stat-value'; }
    }
  }

  function updateRingProgress(id, value, max) {
    const progEl = document.querySelector(`#${id} .pf-ring-progress`);
    if (!progEl) return;
    const circ = parseFloat(progEl.getAttribute('data-circumference')) || 2 * Math.PI * 46.5;
    const pct = Math.min(value / Math.max(max, 1), 1);
    const offset = circ * (1 - pct);
    progEl.setAttribute('stroke-dashoffset', String(offset));
  }

  function formatDuration(ms) {
    if (!ms) return '0m';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  function relativeTime(date) {
    if (!date) return 'Never';
    const diff = Date.now() - new Date(date).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 2)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7)   return `${days}d ago`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function format(date) {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ── Actions ──
  function wireEvents() {
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('[data-click]');
      if (!btn) {
        if (e.target.closest('#u-modal-close') || e.target.closest('#u-modal-cancel')) { closeModal(); return; }
        if (e.target.id === 'u-modal-confirm') {
          if (_resolveConfirm) { _resolveConfirm(true); _resolveConfirm = null; }
          const overlay = document.getElementById('u-confirm-modal');
          if (overlay) { overlay.classList.remove('is-open'); overlay.setAttribute('aria-hidden', 'true'); }
          return;
        }
        if (e.target.id === 'u-confirm-modal') { closeModal(); return; }
        return;
      }

      const action = btn.dataset.click;

      if (action === 'go-back') {
        window.location.href = '/acrx/users';
        return;
      }

      if (action === 'edit-user') {
        window.location.href = `/acrx/users/${userId}/edit`;
        return;
      }

      if (action === 'toggle-status') {
        const suspended = document.querySelector('.pf-status-pill')?.textContent?.includes('Suspended') || false;
        const label = suspended ? 'Activate' : 'Suspend';
        confirm(`${label} User`, `${label} this user?`).then(ok => {
          if (!ok) return;
          apiFetch(`/${userId}/status`, {
            method: 'POST',
            body: JSON.stringify({ action: suspended ? 'activate' : 'suspend' })
          }).then(() => {
            toast(`User ${suspended ? 'activated' : 'suspended'}.`, 'success');
            setTimeout(() => location.reload(), 800);
          }).catch(err => toast(err.message, 'error'));
        });
        return;
      }

      if (action === 'force-logout') {
        confirm('Force Logout', 'Log this user out of all active sessions?').then(ok => {
          if (!ok) return;
          apiFetch(`/${userId}/logout`, { method: 'POST' })
            .then(() => toast('User sessions terminated.', 'success'))
            .catch(err => toast(err.message, 'error'));
        });
        return;
      }
    });

    document.addEventListener('click', e => {
      if (e.target.id === 'u-confirm-modal') closeModal();
    });
  }

  function init() {
    wireEvents();
    connectSSE();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();