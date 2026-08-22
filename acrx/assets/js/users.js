// public/acrx/assets/js/users.js  — v2 (old table + session stats)
'use strict';

(function UsersModule() {

  // ─── Page state (SSR-injected) ───────────────────────────────────────────────

  const _pstate = (() => {
    const el = document.getElementById('users-page-state');
    try { return el ? JSON.parse(el.textContent) : {}; } catch { return {}; }
  })();

  const sessionUser = _pstate.sessionUser || null;

  const params = {
    page:   _pstate.page  || 1,
    limit:  _pstate.limit || 20,
    total:  _pstate.total || 0,
    pages:  _pstate.pages || 1,
    search: '',
    role:   '',
    status: '',
    activeChip: null
  };

  // ─── DOM helpers ─────────────────────────────────────────────────────────────

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const dom = {
    tableBody:   () => $('#users-table-body'),
    totalCount:  () => $('#users-total-count'),
    bulkBar:     () => $('#bulk-bar'),
    bulkCount:   () => $('#bulk-count-num'),
    selectAll:   () => $('#select-all-users'),
    modal:       () => $('#u-confirm-modal'),
    modalTitle:  () => $('#u-modal-title'),
    modalMsg:    () => $('#u-modal-msg'),
    modalOk:     () => $('#u-modal-confirm'),
    toastStack:  () => $('#u-toast-stack'),
    searchInput: () => $('#users-search'),
    clearBtn:    () => $('#clear-filters'),
    perPage:     () => $('#users-per-page'),
  };

  // ─── API layer ───────────────────────────────────────────────────────────────

  const API_PREFIX = '/acr/api/users';

  async function apiFetch(path, opts = {}) {
    const res  = await fetch(API_PREFIX + path, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
  }

  const api = {
    list:   (q = {})      => apiFetch(`?${new URLSearchParams(q)}`),
    patch:  (id, data)    => apiFetch(`/${id}`,      { method: 'PATCH',  body: JSON.stringify(data) }),
    del:    (id)          => apiFetch(`/${id}`,      { method: 'DELETE' }),
    bulk:   (ids, update) => apiFetch('/bulk',       { method: 'PATCH',  body: JSON.stringify({ ids, update }) }),
    status: (id, action)  => apiFetch(`/${id}/status`, { method: 'POST', body: JSON.stringify({ action }) }),
    logout: (id)          => apiFetch(`/${id}/logout`,  { method: 'POST' }),
  };

  // ─── Toast ───────────────────────────────────────────────────────────────────

  function toast(msg, type = 'info') {
    const stack = dom.toastStack();
    if (!stack) return;
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

  // ─── Confirm modal ───────────────────────────────────────────────────────────

  let _resolveConfirm = null;

  function confirm(title, msg, danger = false) {
    dom.modalTitle().textContent = title;
    dom.modalMsg().textContent   = msg;
    dom.modalOk().className = danger
      ? 'u-modal-confirm-btn u-modal-confirm-btn--danger'
      : 'u-modal-confirm-btn';
    dom.modal()?.setAttribute('aria-hidden', 'false');
    dom.modal()?.classList.add('is-open');
    return new Promise(r => { _resolveConfirm = r; });
  }

  function closeModal() {
    dom.modal()?.setAttribute('aria-hidden', 'true');
    dom.modal()?.classList.remove('is-open');
    if (_resolveConfirm) { _resolveConfirm(false); _resolveConfirm = null; }
  }

  // ─── Render helpers ─────────────────────────────────────────────────────────

  function relativeTime(date) {
    if (!date) return '—';
    const diff  = Date.now() - new Date(date).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 2)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7)   return `${days}d ago`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function recencyClass(date) {
    if (!date) return 'recency-never';
    const h = (Date.now() - new Date(date).getTime()) / 3600000;
    if (h < 1)   return 'recency-now';
    if (h < 24)  return 'recency-today';
    if (h < 168) return 'recency-week';
    return 'recency-old';
  }

  const ROLE_ICONS = {
    admin: 'shield-halved', editor: 'pen-nib', author: 'feather',
    seo: 'magnifying-glass-chart', designer: 'paintbrush', developer: 'code', user: 'user'
  };

  function avatarHTML(user) {
    const rc = recencyClass(user.lastLogin);
    const initials = (user.fullName || user.username || '?')
      .split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
    const av = user.avatar
      ? `<div class="u-avatar ${rc}"><img src="${user.avatar}" alt="${user.username}" loading="lazy"></div>`
      : `<div class="u-avatar u-avatar--initials role-${user.role} ${rc}">${initials}</div>`;
    return `<div class="u-avatar-wrap">${av}<i class="u-pulse ${rc}"></i></div>`;
  }

  function statusHTML(user) {
    if (user.isSuspended) return `<span class="u-status suspended"><i class="u-status-dot"></i>Suspended</span>`;
    if (!user.isActive)   return `<span class="u-status inactive"><i class="u-status-dot"></i>Inactive</span>`;
    return `<span class="u-status active"><i class="u-status-dot"></i>Active</span>`;
  }

  function sessionBadgeHTML(user) {
    const sv = user.sessionVersion || 1;
    return `<span class="u-session-ver ${sv > 1 ? 'bumped' : ''}" title="Session version ${sv}${sv > 1 ? ' — force-logged out previously' : ''}">sv${sv}</span>`;
  }

  function rowHTML(user) {
    const uid        = user.id || user._id;
    const stateClass = user.isSuspended ? 'is-suspended' : !user.isActive ? 'is-inactive' : '';
    const actionT    = user.isSuspended ? 'Activate' : 'Suspend';
    const actionIc   = user.isSuspended ? 'fa-circle-check' : 'fa-ban';
    const actionType = user.isSuspended ? 'activate' : 'suspend';
    const relLogin   = relativeTime(user.lastLogin);
    const absLogin   = user.lastLogin
      ? new Date(user.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Never logged in';
    const roleIcon   = ROLE_ICONS[user.role] || 'user';
    const rc         = recencyClass(user.lastLogin);

    const isSelf = sessionUser && (uid === sessionUser.userId || uid === sessionUser.userId?.toString());
    const selfClass = isSelf ? ' u-row--self' : '';

    return `<label class="u-row ${stateClass}${selfClass}" data-id="${uid}"${isSelf ? ' data-self="true"' : ''}>
  <input type="checkbox" class="u-row-select" data-id="${uid}" value="${uid}"${isSelf ? ' disabled' : ''}>
  <div class="u-row-inner">
    <div class="u-sel-strip"></div>
    <div class="u-col u-col-avatar">${avatarHTML(user)}</div>
    <div class="u-col u-col-identity">
      <div class="u-identity-main">
        <span class="u-username">${user.username}</span>
        ${isSelf ? '<span class="u-self-badge">You</span>' : ''}
        ${sessionBadgeHTML(user)}
      </div>
      <span class="u-fullname${!user.fullName ? ' u-fullname--empty' : ''}">${user.fullName || '—'}</span>
      <span class="u-email-compact">${user.email}</span>
    </div>
    <div class="u-col u-col-email"><span class="u-email">${user.email}</span></div>
    <div class="u-col u-col-role">
      <span class="u-role-badge role-${user.role}">
        <i class="fa-solid fa-${roleIcon}"></i> ${user.role}
      </span>
    </div>
    <div class="u-col u-col-status">${statusHTML(user)}</div>
    <div class="u-col u-col-login">
      <span class="u-last-login ${rc}" title="${absLogin}">${relLogin}</span>
    </div>
    <div class="u-col u-col-actions">
      <div class="u-row-actions">
        <button class="u-action-btn" title="View"   data-action="view"   data-id="${uid}"><i class="fa-regular fa-eye"></i></button>
        <button class="u-action-btn" title="Edit"   data-action="edit"   data-id="${uid}"><i class="fa-regular fa-pen-to-square"></i></button>
        <button class="u-action-btn${isSelf ? ' u-action-btn--disabled' : ''}" title="${actionT}" data-action="${actionType}" data-id="${uid}"${isSelf ? ' disabled' : ''}><i class="fa-regular ${actionIc}"></i></button>
        <button class="u-action-btn${isSelf ? ' u-action-btn--disabled' : ''}" title="Force Logout" data-action="logout" data-id="${uid}"${isSelf ? ' disabled' : ''}><i class="fa-regular fa-right-from-bracket"></i></button>
        <button class="u-action-btn u-action-btn--danger${isSelf ? ' u-action-btn--disabled' : ''}" title="Delete" data-action="delete" data-id="${uid}"${isSelf ? ' disabled' : ''}><i class="fa-regular fa-trash"></i></button>
      </div>
    </div>
  </div>
</label>`;
  }

  function emptyHTML() {
    return `<div class="u-empty-state">
      <div class="u-empty-icon"><i class="fa-duotone fa-users-slash"></i></div>
      <p class="u-empty-title">No users found</p>
      <p class="u-empty-sub">Try adjusting your filters or search query.</p>
    </div>`;
  }

  // ─── Widget hydration ───────────────────────────────────────────────────────

  function hydrateWidgets(users, meta) {
    const total      = meta.total || 0;
    const active     = users.filter(u => !u.isSuspended && u.isActive).length;
    const suspended  = users.filter(u => u.isSuspended).length;
    const weekAgo    = Date.now() - 7 * 86400000;
    const newU       = users.filter(u => new Date(u.createdAt || 0) > weekAgo).length;
    const recentLogin= users.filter(u => u.lastLogin && (Date.now() - new Date(u.lastLogin)) < 86400000).length;

    const cards = $$('.metric-card');
    const vals  = [total, active, suspended, newU];
    cards.forEach((card, i) => {
      const v = card.querySelector('.metric-value');
      if (v && vals[i] !== undefined) v.textContent = vals[i];
    });

    const actNum = $('#u-act-num');
    const actPct = $('#u-act-pct');
    if (actNum) actNum.textContent = recentLogin;
    if (actPct) actPct.textContent = total ? `${Math.round((recentLogin / total) * 100)}% engagement rate` : '';

    const ring = document.querySelector('.u-act-ring');
    if (ring && total) ring.style.setProperty('--pct', Math.max(4, Math.round((recentLogin / total) * 100)));
  }

  // ─── Selection manager ───────────────────────────────────────────────────────

  const selection = {
    get ids() {
      return $$('.u-row-select:checked').map(cb => cb.value);
    },
    count() { return this.ids.length; },
    clear() {
      $$('.u-row-select, .u-select-all').forEach(cb => {
        cb.checked = false;
        cb.indeterminate = false;
      });
    },
    syncSelectAll() {
      const all  = $$('.u-row-select');
      const sel  = dom.selectAll();
      if (!sel || !all.length) return;
      const n = $$('.u-row-select:checked').length;
      sel.checked       = n === all.length && all.length > 0;
      sel.indeterminate = n > 0 && n < all.length;
    },
    updateBulkBar() {
      const count   = this.count();
      const bar     = dom.bulkBar();
      const counter = dom.bulkCount();
      if (!bar) return;
      bar.setAttribute('aria-hidden', count === 0 ? 'true' : 'false');
      bar.classList.toggle('is-visible', count > 0);
      if (counter) counter.textContent = count;
      this.syncSelectAll();
    }
  };

  // ─── Pagination ──────────────────────────────────────────────────────────────

  function updatePaginators() {
    $$('.page-info').forEach(el => {
      el.textContent = `${params.page} / ${params.pages}`;
    });
    $$('.prev').forEach(btn => { btn.disabled = params.page <= 1; });
    $$('.next').forEach(btn => { btn.disabled = params.page >= params.pages; });
    const tc = dom.totalCount();
    if (tc) tc.textContent = `${params.total} users`;
  }

  // ─── Load + render ───────────────────────────────────────────────────────────

  let _searchDebounce = null;

  async function loadUsers(reset = false) {
    if (reset) params.page = 1;

    const body = dom.tableBody();
    if (body) body.innerHTML = `<div class="u-loading"><i class="fa-duotone fa-spinner-third fa-spin"></i> Loading…</div>`;

    try {
      const query = {
        page:  params.page,
        limit: params.limit,
        ...(params.search && { search: params.search }),
        ...(params.role   && { role:   params.role }),
      };

      if (params.status === 'suspended') { query.isSuspended = true; }
      else if (params.status === 'inactive')  { query.isActive = false; }
      else if (params.status === 'active')    { query.isActive = true; query.isSuspended = false; }
      else if (params.status === 'recent')    { query.isActive = true; query.isSuspended = false; }

      const res = await api.list(query);

      params.total = res.meta.total;
      params.pages = res.meta.pages;

      let rows = res.data;

      if (params.status === 'recent') {
        const ago24h = Date.now() - 86400000;
        rows = rows.filter(u => u.lastLogin && new Date(u.lastLogin) > ago24h);
      }

      if (body) {
        body.innerHTML = rows.length ? rows.map(rowHTML).join('') : emptyHTML();
      }

      selection.clear();
      selection.updateBulkBar();
      updatePaginators();
      hydrateWidgets(res.data, res.meta);

    } catch (err) {
      if (body) body.innerHTML = `<div class="u-error"><i class="fa-regular fa-circle-exclamation"></i> ${err.message}</div>`;
      toast(err.message, 'error');
    }
  }

  // ─── Chip management ─────────────────────────────────────────────────────────

  function setChip(chipEl) {
    $$('.u-chip').forEach(c => c.classList.remove('is-active'));

    if (!chipEl) {
      params.activeChip = null;
      return;
    }

    const filter = chipEl.dataset.chipFilter;
    const value  = chipEl.dataset.chipValue;

    if (params.activeChip === chipEl.id) {
      params.activeChip = null;
      if (filter === 'role')   params.role   = '';
      if (filter === 'status') params.status = '';
      return;
    }

    params.activeChip = chipEl.id;
    chipEl.classList.add('is-active');

    if (filter === 'role')   params.role   = value;
    if (filter === 'status') params.status = value;

    if (filter === 'role') {
      const lbl = document.getElementById('filter-role')?.querySelector('.dropdown-toggle');
      if (lbl) lbl.childNodes[0].textContent = value ? (value.charAt(0).toUpperCase() + value.slice(1) + ' ') : 'Role ';
    }
    if (filter === 'status') {
      const lbl = document.getElementById('filter-status')?.querySelector('.dropdown-toggle');
      if (lbl) lbl.childNodes[0].textContent = value ? (value.charAt(0).toUpperCase() + value.slice(1) + ' ') : 'Status ';
    }
  }

  // ─── Bulk actions ────────────────────────────────────────────────────────────

  async function execBulk(action) {
    const ids = selection.ids;
    if (!ids.length) return;

    const labels = { activate: 'Activate', suspend: 'Suspend', delete: 'Delete', 'force-logout': 'Force Logout' };
    const isDanger = action === 'delete';
    const ok = await confirm(
      `${labels[action]} ${ids.length} User${ids.length !== 1 ? 's' : ''}`,
      `${action === 'delete' ? 'Permanently delete' : labels[action]} ${ids.length} selected user${ids.length !== 1 ? 's' : ''}?`,
      isDanger
    );
    if (!ok) return;

    try {
      if (action === 'force-logout') {
        await Promise.all(ids.map(id => api.logout(id)));
        toast(`Force-logged out ${ids.length} user${ids.length !== 1 ? 's' : ''}.`, 'success');
      } else if (action === 'delete') {
        await api.bulk(ids, { isActive: false });
        toast(`Deleted ${ids.length} user${ids.length !== 1 ? 's' : ''}.`, 'success');
      } else {
        const update = action === 'suspend'
          ? { isSuspended: true }
          : { isSuspended: false, isActive: true };
        await api.bulk(ids, update);
        toast(`${ids.length} user${ids.length !== 1 ? 's' : ''} ${action === 'suspend' ? 'suspended' : 'activated'}.`, 'success');
      }
      loadUsers(false);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ─── Row actions ─────────────────────────────────────────────────────────────

  async function execRowAction(action, id) {
    if (sessionUser && id === sessionUser.userId) {
      toast('You cannot perform this action on your own account.', 'error');
      return;
    }
    try {
      switch (action) {
        case 'view':
          window.location.href = `/acrx/users/${id}`;
          break;
        case 'edit':
          window.location.href = `/acrx/users/${id}/edit`;
          break;
        case 'suspend': {
          const ok = await confirm('Suspend User', 'Suspend this user? They will be logged out of all sessions.');
          if (!ok) return;
          await api.status(id, 'suspend');
          toast('User suspended.', 'success');
          loadUsers(false);
          break;
        }
        case 'activate': {
          await api.status(id, 'activate');
          toast('User activated.', 'success');
          loadUsers(false);
          break;
        }
        case 'logout': {
          const ok = await confirm('Force Logout', 'Log this user out of all active sessions?');
          if (!ok) return;
          await api.logout(id);
          toast('User sessions terminated.', 'success');
          break;
        }
        case 'delete': {
          const ok = await confirm('Delete User', 'Permanently delete this user? This cannot be undone.', true);
          if (!ok) return;
          await api.del(id);
          toast('User deleted.', 'success');
          loadUsers(false);
          break;
        }
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ─── Filter helpers ──────────────────────────────────────────────────────────

  function updateClearBtn() {
    const btn = dom.clearBtn();
    if (!btn) return;
    btn.style.display = (params.search || params.role || params.status) ? '' : 'none';
  }

  function clearAllFilters() {
    params.search = '';
    params.role   = '';
    params.status = '';
    params.activeChip = null;
    const se = dom.searchInput();
    if (se) se.value = '';
    $$('.u-chip').forEach(c => c.classList.remove('is-active'));
    dom.clearBtn() && (dom.clearBtn().style.display = 'none');
    loadUsers(true);
  }

  // ─── Event wiring ────────────────────────────────────────────────────────────

  function wireEvents() {
    const body = document.body;

    body.addEventListener('change', e => {
      const t = e.target;
      if (t.classList.contains('u-select-all')) {
        const checked = t.checked;
        $$('.u-row-select').forEach(cb => { cb.checked = checked; });
        selection.updateBulkBar();
        return;
      }
      if (t.classList.contains('u-row-select')) {
        selection.updateBulkBar();
        return;
      }
      if (t.id === 'users-per-page') {
        params.limit = parseInt(t.value, 10);
        loadUsers(true);
        return;
      }
    });

    body.addEventListener('click', e => {

      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.preventDefault();
        e.stopPropagation();
        execRowAction(actionBtn.dataset.action, actionBtn.dataset.id);
        return;
      }

      const bulkBtn = e.target.closest('[data-bulk-action]');
      if (bulkBtn) { execBulk(bulkBtn.dataset.bulkAction); return; }

      if (e.target.closest('#bulk-dismiss')) {
        selection.clear();
        selection.updateBulkBar();
        return;
      }

      const chip = e.target.closest('.u-chip');
      if (chip) {
        setChip(chip);
        updateClearBtn();
        loadUsers(true);
        return;
      }

      if (e.target.closest('.prev')) {
        if (params.page > 1) { params.page--; loadUsers(); }
        return;
      }
      if (e.target.closest('.next')) {
        if (params.page < params.pages) { params.page++; loadUsers(); }
        return;
      }

      const hBtn = e.target.closest('[data-click]');
      if (hBtn) {
        const a = hBtn.dataset.click;
        if (a === 'refresh-users')    { loadUsers(true); return; }
        if (a === 'open-create-user') { window.location.href = '/acrx/users/new'; return; }
      }

      if (e.target.closest('#clear-filters')) { clearAllFilters(); return; }

      if (e.target.closest('#u-modal-close') || e.target.closest('#u-modal-cancel')) {
        closeModal(); return;
      }
      if (e.target.id === 'u-modal-confirm') {
        if (_resolveConfirm) { _resolveConfirm(true); _resolveConfirm = null; }
        dom.modal()?.classList.remove('is-open');
        dom.modal()?.setAttribute('aria-hidden', 'true');
        return;
      }
      if (e.target.id === 'u-confirm-modal') { closeModal(); return; }

      const roleItem = e.target.closest('#filter-role .dropdown-item');
      if (roleItem) {
        params.role = roleItem.dataset.value || '';
        $$('.u-chip[data-chip-filter="role"]').forEach(c => c.classList.remove('is-active'));
        params.activeChip = null;
        updateClearBtn();
        loadUsers(true);
        return;
      }

      const statusItem = e.target.closest('#filter-status .dropdown-item');
      if (statusItem) {
        params.status = statusItem.dataset.value || '';
        $$('.u-chip[data-chip-filter="status"]').forEach(c => c.classList.remove('is-active'));
        params.activeChip = null;
        updateClearBtn();
        loadUsers(true);
        return;
      }
    });

    const searchEl = dom.searchInput();
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(() => {
          params.search = searchEl.value.trim();
          updateClearBtn();
          loadUsers(true);
        }, 320);
      });

      document.addEventListener('keydown', e => {
        if (e.key === '/' && document.activeElement !== searchEl) {
          e.preventDefault();
          searchEl.focus();
          searchEl.select();
        }
        if (e.key === 'Escape') {
          if (document.activeElement === searchEl) { searchEl.blur(); return; }
          closeModal();
        }
      });
    }
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  function init() {
    wireEvents();
    loadUsers(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
