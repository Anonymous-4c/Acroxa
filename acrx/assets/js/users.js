// public/acrx/assets/js/users.js — SSE-first realtime users page
'use strict';

(function UsersModule() {

  // ─── Page state (SSR-injected) ────────────────────────────────────────────────
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

  // ─── DOM helpers ──────────────────────────────────────────────────────────────
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
    liveList:    () => $('#live-list'),
    liveCount:   () => $('#live-count'),
    topPages:    () => $('#top-pages'),
  };

  // ─── API layer ────────────────────────────────────────────────────────────────
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
    list:       (q = {})      => apiFetch(`?${new URLSearchParams(q)}`),
    patch:      (id, data)    => apiFetch(`/${id}`,      { method: 'PATCH',  body: JSON.stringify(data) }),
    del:        (id)          => apiFetch(`/${id}`,      { method: 'DELETE' }),
    bulk:       (ids, update) => apiFetch('/bulk',       { method: 'PATCH',  body: JSON.stringify({ ids, update }) }),
    status:     (id, action)  => apiFetch(`/${id}/status`, { method: 'POST', body: JSON.stringify({ action }) }),
    logout:     (id)          => apiFetch(`/${id}/logout`,  { method: 'POST' }),
  };

  // ─── SSE Realtime ────────────────────────────────────────────────────────────
  let evtSource = null;
  const _liveUsers = new Map(); // userId -> full activity data from SSE

  function connectSSE() {
    try {
      evtSource = new EventSource('/acr/api/activity-stream');
      evtSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'activity') {
            handleLiveActivity(data);
          }
        } catch (_) {}
      };
      evtSource.onerror = () => {
        evtSource.close();
        setTimeout(connectSSE, 5000);
      };
    } catch (_) {}
  }

  function handleLiveActivity(data) {
    const uid = data.userId;

    // Store FULL activity payload in live map
    if (data.activePage) {
      _liveUsers.set(uid, {
        userId: uid,
        username: data.username,
        avatar: data.avatar || '',
        role: data.role || 'user',
        activePage: data.activePage,
        lastSeen: data.lastSeen,
        ip: data.ip,
        isActive: data.isActive !== false,
        todayVisits: data.todayVisits || 0,
        actionsToday: data.actionsToday || 0,
        pagesViewedToday: data.pagesViewedToday || 0,
        totalTimeOnline: data.totalTimeOnline || 0,
        totalVisits: data.totalVisits || 0,
        pagesVisited: data.pagesVisited || [],
      });
    } else {
      // Offline event — remove from live map
      _liveUsers.delete(uid);
    }

    // Update live panel
    renderLivePanel();

    // Update the activity cell in the table row if visible
    const row = $(`.u-row[data-id="${uid}"]`);
    if (row) {
      const act = _liveUsers.get(uid);
      if (act) {
        updateRowActivity(row, act);
      }
    }

    // Update bento stats from live data
    updateBentoFromLive();
  }

  function updateRowActivity(row, act) {
    const indicator = row.querySelector('.u-active-indicator');
    const pageEl = row.querySelector('.u-active-page');
    const seenEl = row.querySelector('.u-last-seen-time');
    const ipEl = row.querySelector('.u-ip-addr');

    const isOnline = act.isActive && act.lastSeen && (Date.now() - new Date(act.lastSeen).getTime()) < 5 * 60 * 1000;
    if (indicator) {
      indicator.classList.toggle('is-online', isOnline);
      indicator.textContent = isOnline ? '●' : '○';
      indicator.title = isOnline ? `Active on ${act.activePage}` : `Last seen: ${act.lastSeen}`;
    }
    if (pageEl) { pageEl.textContent = act.activePage || '—'; pageEl.title = act.activePage || ''; }
    if (seenEl) { seenEl.textContent = act.lastSeen ? relativeTime(act.lastSeen) : '—'; }
    if (ipEl) { ipEl.textContent = act.ip || '—'; ipEl.title = act.ip || ''; }
  }

  function updateBentoFromLive() {
    const onlineNow = _liveUsers.size;
    const onlineEl = $('#bento-online');
    if (onlineEl) onlineEl.textContent = String(onlineNow);

    const liveCount = dom.liveCount();
    if (liveCount) liveCount.textContent = String(onlineNow);

    // Update rings from live data
    const todayVisits = Array.from(_liveUsers.values()).reduce((sum, u) => sum + (u.todayVisits || 0), 0);
    const actionsToday = Array.from(_liveUsers.values()).reduce((sum, u) => sum + (u.actionsToday || 0), 0);
    const pagesToday = Array.from(_liveUsers.values()).reduce((sum, u) => sum + (u.pagesViewedToday || 0), 0);

    const ringOnlineVal = $('#ring-online .u-ring-val');
    const ringTodayVal = $('#ring-today .u-ring-val');
    const ringActionsVal = $('#ring-actions .u-ring-val');

    if (ringOnlineVal) ringOnlineVal.textContent = String(onlineNow);
    if (ringTodayVal) ringTodayVal.textContent = String(todayVisits);
    if (ringActionsVal) ringActionsVal.textContent = String(actionsToday);

    // Update ring progress (need to recalc dashoffset)
    updateRingProgress('ring-online', onlineNow, Math.max(_liveUsers.size, 1));
    updateRingProgress('ring-today', todayVisits, Math.max(todayVisits, 10));
    updateRingProgress('ring-actions', actionsToday, Math.max(actionsToday, 10));
  }

  function updateRingProgress(id, value, max) {
    const valEl = $(`#${id} .u-ring-val`);
    const progEl = $(`#${id} .u-ring-progress`);
    if (!valEl || !progEl) return;
    valEl.textContent = String(value);
    const circ = parseFloat(progEl.getAttribute('data-circumference')) || 2 * Math.PI * 37;
    const pct = Math.min(value / Math.max(max, 1), 1);
    const offset = circ * (1 - pct);
    progEl.setAttribute('stroke-dashoffset', String(offset));
    progEl.setAttribute('data-target', String(offset));
  }

  function renderLivePanel() {
    const list = dom.liveList();
    if (!list) return;

    const users = [..._liveUsers.values()]
      .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

    if (!users.length) {
      list.innerHTML = '<div class="u-live-empty">No users online</div>';
      return;
    }

    list.innerHTML = users.map(u => {
      const initials = (u.username || '?').slice(0, 2).toUpperCase();
      const isSelf = sessionUser && u.userId === sessionUser.userId;
      return `<div class="u-live-user ${isSelf ? 'u-live-user--self' : ''}" data-id="${u.userId}">
        <div class="u-live-avatar ${u.avatar ? '' : 'u-live-avatar--initials role-' + u.role}">${u.avatar ? '<img src="' + u.avatar + '" alt="">' : initials}</div>
        <div class="u-live-info">
          <span class="u-live-name">${u.username}${isSelf ? ' <span class="u-self-badge">You</span>' : ''}</span>
          <span class="u-live-page" title="${u.activePage}">${u.activePage}</span>
        </div>
        <span class="u-live-dot is-online"></span>
      </div>`;
    }).join('');
  }

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
    dom.modalOk().className = danger ? 'u-modal-confirm-btn u-modal-confirm-btn--danger' : 'u-modal-confirm-btn';
    dom.modal()?.setAttribute('aria-hidden', 'false');
    dom.modal()?.classList.add('is-open');
    return new Promise(r => { _resolveConfirm = r; });
  }

  function closeModal() {
    dom.modal()?.setAttribute('aria-hidden', 'true');
    dom.modal()?.classList.remove('is-open');
    if (_resolveConfirm) { _resolveConfirm(false); _resolveConfirm = null; }
  }

  // ─── Render helpers ──────────────────────────────────────────────────────────
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

  function formatDuration(ms) {
    if (!ms) return '0m';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
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
    const initials = (user.fullName || user.username || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
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
    return `<span class="u-session-ver ${sv > 1 ? 'bumped' : ''}" title="Session version ${sv}${sv > 1 ? ' — previously force-logged out' : ''}">sv${sv}</span>`;
  }

  function rowHTML(user, act) {
    const uid = user.id || user._id;
    const relLogin = relativeTime(user.lastLogin);
    const absLogin = user.lastLogin
      ? new Date(user.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Never logged in';
    const roleIcon = ROLE_ICONS[user.role] || 'user';
    const stateClass = user.isSuspended ? 'is-suspended' : !user.isActive ? 'is-inactive' : '';
    const isSelf = sessionUser && (uid === sessionUser.userId || uid === sessionUser.userId?.toString());
    const selfClass = isSelf ? ' u-row--self' : '';

    const activePage  = act?.activePage || '—';
    const isActiveNow = act?.isActive && act?.lastSeen && (Date.now() - new Date(act.lastSeen).getTime()) < 5 * 60 * 1000;
    const lastSeenRel = act?.lastSeen ? relativeTime(act.lastSeen) : '—';
    const lastSeenAbs = act?.lastSeen ? new Date(act.lastSeen).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const activityIp  = act?.ip || '—';

    // Attach activity data as data attributes for SSE merging
    return `<label class="u-row ${stateClass}${selfClass}" data-id="${uid}"${isSelf ? ' data-self="true"' : ''} data-activity='${JSON.stringify(act || {})}'>
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
      <span class="u-role-badge role-${user.role}"><i class="fa-solid fa-${roleIcon}"></i> ${user.role}</span>
    </div>
    <div class="u-col u-col-status">${statusHTML(user)}</div>
    <div class="u-col u-col-login">
      <span class="u-last-login ${recencyClass(user.lastLogin)}" title="${absLogin}">${relLogin || '—'}</span>
    </div>
    <div class="u-col u-col-activity">
      <div class="u-activity-cell">
        <span class="u-active-indicator ${isActiveNow ? 'is-online' : ''}" title="${isActiveNow ? 'Active on ' + activePage : 'Last seen: ' + lastSeenAbs}">${isActiveNow ? '●' : '○'}</span>
        <span class="u-active-page" title="${activePage}">${activePage}</span>
        <span class="u-last-seen-time" title="${lastSeenAbs}">${lastSeenRel}</span>
      </div>
    </div>
    <div class="u-col u-col-ip"><span class="u-ip-addr" title="${activityIp}">${activityIp}</span></div>
    <div class="u-col u-col-actions">
      <div class="u-row-actions">
        <button class="u-action-btn" title="View" data-action="view" data-id="${uid}"><i class="fa-regular fa-eye"></i></button>
        <button class="u-action-btn" title="Edit" data-action="edit" data-id="${uid}"><i class="fa-regular fa-pen-to-square"></i></button>
        <button class="u-action-btn${isSelf ? ' u-action-btn--disabled' : ''}" title="${user.isSuspended ? 'Activate' : 'Suspend'}" data-action="${user.isSuspended ? 'activate' : 'suspend'}" data-id="${uid}"${isSelf ? ' disabled' : ''}><i class="fa-regular ${user.isSuspended ? 'fa-circle-check' : 'fa-ban'}"></i></button>
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

  // ─── Widget hydration ────────────────────────────────────────────────────────

  function hydrateWidgets(users, meta, stats) {
    const total      = meta.total || 0;
    const active     = users.filter(u => !u.isSuspended && u.isActive).length;
    const suspended  = users.filter(u => u.isSuspended).length;
    const onlineNow  = stats?.onlineNow || 0;
    const activeToday = stats?.activeToday || 0;
    const totalActions = stats?.totalActions || 0;

    const elTotal = $('#bento-total');
    if (elTotal) elTotal.textContent = String(total);
    const elActive = $('#bento-active');
    if (elActive) elActive.textContent = String(active);
    const elSuspended = $('#bento-suspended');
    if (elSuspended) elSuspended.textContent = String(suspended);
    const elOnline = $('#bento-online');
    if (elOnline) elOnline.textContent = String(onlineNow);

    // Rings
    const ringOnlineVal = $('#ring-online .u-ring-val');
    const ringTodayVal = $('#ring-today .u-ring-val');
    const ringActionsVal = $('#ring-actions .u-ring-val');
    if (ringOnlineVal) ringOnlineVal.textContent = String(onlineNow);
    if (ringTodayVal) ringTodayVal.textContent = String(activeToday);
    if (ringActionsVal) ringActionsVal.textContent = String(totalActions);

    updateRingProgress('ring-online', onlineNow, Math.max(total, 1));
    updateRingProgress('ring-today', activeToday, Math.max(total, 1));
    updateRingProgress('ring-actions', totalActions, Math.max(totalActions, 10));

    // Live panel + top pages
    renderLivePanel();
    renderTopPages(stats?.topPages || []);
  }

  function renderTopPages(topPages) {
    const list = dom.topPages();
    if (!list) return;
    if (!topPages.length) {
      list.innerHTML = '<div class="u-live-empty">No data</div>';
      return;
    }
    list.innerHTML = topPages.map(p => `
      <div class="u-top-page">
        <span class="u-top-page-name" title="${p._id}">${p._id}</span>
        <span class="u-top-page-count">${p.count}</span>
      </div>
    `).join('');
  }

  // ─── Selection ───────────────────────────────────────────────────────────────
  const selection = {
    ids: new Set(),
    all: false,
    toggle(id) { if (this.ids.has(id)) this.ids.delete(id); else this.ids.add(id); this.updateBulkBar(); },
    selectAll(pageIds) { if (this.all) { this.ids.clear(); this.all = false; } else { pageIds.forEach(id => this.ids.add(id)); this.all = true; } this.updateBulkBar(); },
    clear() { this.ids.clear(); this.all = false; this.updateBulkBar(); },
    updateBulkBar() {
      const bar = dom.bulkBar(); if (!bar) return;
      const cnt = this.ids.size;
      const num = dom.bulkCount(); if (num) num.textContent = String(cnt);
      bar.setAttribute('aria-hidden', cnt === 0);
      const selAll = dom.selectAll(); if (selAll) selAll.checked = this.all && cnt > 0;
      $$('.u-row-select').forEach(cb => { cb.checked = this.ids.has(cb.value); });
    }
  };

  // ─── Pagination ──────────────────────────────────────────────────────────────

  function updatePaginators() {
    $$('.page-info').forEach(el => { el.textContent = `${params.page} / ${params.pages}`; });
    $$('.prev').forEach(btn => { btn.disabled = params.page <= 1; });
    $$('.next').forEach(btn => { btn.disabled = params.page >= params.pages; });
    const tc = dom.totalCount();
    if (tc) tc.textContent = `${params.total} users`;
  }

  // ─── Load + render ──────────────────────────────────────────────────────────

  let _searchDebounce = null;

  async function loadUsers(reset = false) {
    if (reset) params.page = 1;

    const body = dom.tableBody();
    if (body) body.innerHTML = `<div class="u-loading"><i class="fa-duotone fa-spinner-third fa-spin"></i> Loading…</div>`;

    try {
      const query = {
        page: params.page, limit: params.limit,
        ...(params.search && { search: params.search }),
        ...(params.role && { role: params.role }),
      };

      if (params.status === 'suspended') { query.isSuspended = true; }
      else if (params.status === 'inactive') { query.isActive = false; }
      else if (params.status === 'active') { query.isActive = true; query.isSuspended = false; }
      else if (params.status === 'recent') { query.isActive = true; query.isSuspended = false; }

      const [res, statsRes] = await Promise.all([
        api.list(query),
        apiFetch('/activity-stats').catch(() => ({ data: {} }))
      ]);

      params.total = res.meta.total;
      params.pages = res.meta.pages;

      let rows = res.data;
      if (params.status === 'recent') {
        const ago24h = Date.now() - 86400000;
        rows = rows.filter(u => u.lastLogin && new Date(u.lastLogin) > ago24h);
      }

      // SSR only provides initial activity; SSE will update it
      let activityMap = {};
      try {
        const userIds = rows.map(u => u.id || u._id);
        if (userIds.length) {
          const actRes = await apiFetch(`/activity?ids=${userIds.join(',')}`);
          if (actRes.data) {
            actRes.data.forEach(a => {
              const uid = a.userId?._id || a.userId;
              activityMap[uid] = a;
            });
          }
        }
      } catch (_) {}

      if (body) {
        body.innerHTML = rows.length ? rows.map(u => rowHTML(u, activityMap[u.id || u._id])).join('') : emptyHTML();
      }

      selection.clear();
      selection.updateBulkBar();
      updatePaginators();
      hydrateWidgets(res.data, res.meta, statsRes?.data);

    } catch (err) {
      if (body) body.innerHTML = `<div class="u-error"><i class="fa-regular fa-circle-exclamation"></i> ${err.message}</div>`;
      toast(err.message, 'error');
    }
  }

  // ─── Filter helpers ──────────────────────────────────────────────────────────

  function setChip(chipEl) {
    $$('.u-chip').forEach(c => c.classList.remove('is-active'));
    if (!chipEl) { params.activeChip = null; return; }
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
  }

  // ─── Bulk actions ────────────────────────────────────────────────────────────

  async function execBulk(action) {
    const ids = selection.ids;
    if (!ids.length) return;
    const labels = { activate: 'Activate', suspend: 'Suspend', delete: 'Delete', 'force-logout': 'Force Logout' };
    const ok = await confirm(`${labels[action]} ${ids.length} User${ids.length !== 1 ? 's' : ''}`, `${action === 'delete' ? 'Permanently delete' : labels[action]} ${ids.length} selected?`, action === 'delete');
    if (!ok) return;
    try {
      if (action === 'force-logout') {
        await Promise.all(ids.map(id => api.logout(id)));
        toast(`Force-logged out ${ids.length} user${ids.length !== 1 ? 's' : ''}.`, 'success');
      } else if (action === 'delete') {
        await api.bulk(ids, { isActive: false });
        toast(`Deleted ${ids.length} user${ids.length !== 1 ? 's' : ''}.`, 'success');
      } else {
        const update = action === 'suspend' ? { isSuspended: true } : { isSuspended: false, isActive: true };
        await api.bulk(ids, update);
        toast(`${ids.length} user${ids.length !== 1 ? 's' : ''} ${action === 'suspend' ? 'suspended' : 'activated'}.`, 'success');
      }
      loadUsers(false);
    } catch (err) { toast(err.message, 'error'); }
  }

  // ─── Row actions ─────────────────────────────────────────────────────────────

  async function execRowAction(action, id) {
    if (sessionUser && id === sessionUser.userId) {
      toast('You cannot perform this action on your own account.', 'error');
      return;
    }
    try {
      switch (action) {
        case 'view':   window.location.href = `/acrx/users/${id}`; break;
        case 'edit':   window.location.href = `/acrx/users/${id}/edit`; break;
        case 'suspend': {
          const ok = await confirm('Suspend User', 'Suspend this user?');
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
          const ok = await confirm('Force Logout', 'Log this user out of all sessions?');
          if (!ok) return;
          await api.logout(id);
          toast('User sessions terminated.', 'success');
          break;
        }
        case 'delete': {
          const ok = await confirm('Delete User', 'Permanently delete this user?', true);
          if (!ok) return;
          await api.del(id);
          toast('User deleted.', 'success');
          loadUsers(false);
          break;
        }
      }
    } catch (err) { toast(err.message, 'error'); }
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
        $$('.u-row-select').forEach(cb => { cb.checked = t.checked; });
        selection.updateBulkBar();
        return;
      }
      if (t.classList.contains('u-row-select')) { selection.updateBulkBar(); return; }
      if (t.id === 'users-per-page') { params.limit = parseInt(t.value, 10); loadUsers(true); return; }
    });

    body.addEventListener('click', e => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) { e.preventDefault(); e.stopPropagation(); execRowAction(actionBtn.dataset.action, actionBtn.dataset.id); return; }

      const bulkBtn = e.target.closest('[data-bulk-action]');
      if (bulkBtn) { execBulk(bulkBtn.dataset.bulkAction); return; }

      if (e.target.closest('#bulk-dismiss')) { selection.clear(); selection.updateBulkBar(); return; }

      const chip = e.target.closest('.u-chip');
      if (chip) { setChip(chip); updateClearBtn(); loadUsers(true); return; }

      if (e.target.closest('.prev')) { if (params.page > 1) { params.page--; loadUsers(); } return; }
      if (e.target.closest('.next')) { if (params.page < params.pages) { params.page++; loadUsers(); } return; }

      const hBtn = e.target.closest('[data-click]');
      if (hBtn) {
        const a = hBtn.dataset.click;
        if (a === 'refresh-users')    { loadUsers(true); return; }
        if (a === 'open-create-user') { window.location.href = '/acrx/users/create'; return; }
      }

      if (e.target.closest('#clear-filters')) { clearAllFilters(); return; }

      if (e.target.closest('#u-modal-close') || e.target.closest('#u-modal-cancel')) { closeModal(); return; }
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
        if (e.key === '/' && document.activeElement !== searchEl) { e.preventDefault(); searchEl.focus(); searchEl.select(); }
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
    connectSSE();
    loadUsers(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();