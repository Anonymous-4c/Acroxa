// public/acrx/assets/js/viewUser.js — User detail page client
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

  function wireEvents() {
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('[data-click]');
      if (!btn) {
        // Modal close
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
        const isSuspended = document.querySelector('.vu-status-pill--suspended');
        const label = isSuspended ? 'Activate' : 'Suspend';
        confirm(`${label} User`, `${label} this user?`).then(ok => {
          if (!ok) return;
          apiFetch(`/${userId}/status`, {
            method: 'POST',
            body: JSON.stringify({ action: isSuspended ? 'activate' : 'suspend' })
          }).then(() => {
            toast(`User ${isSuspended ? 'activated' : 'suspended'}.`, 'success');
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

    // Modal close on overlay click
    document.addEventListener('click', e => {
      if (e.target.id === 'u-confirm-modal') closeModal();
    });
  }

  function init() {
    wireEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
