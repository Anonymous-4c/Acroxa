// acrx/assets/js/acrx-admin-runtime.js — AcroxaJS admin runtime (v1).
// Live content-region updates for /acrx/* full-layout pages WITHOUT navigation.
// Contract: #acrx-content[data-acrx-region] anchor (layout.js) + ?_frag=content
// JSON from renderPageWrapper. Never auto-reloads; marks stale when unsafe.
//
// Guards: an installed window.AcroxaUpdateGuard.canPatch() wins (Phase 3).
// Default guard defers while the editor canvas is focused/dirty.
// Emits CustomEvent('acrx:update', {status, ...}) for the diagnostics panel.

(function AdminRuntime() {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.AcroxaAdminRuntime && window.AcroxaAdminRuntime.__v === 1) return;

  var container = document.getElementById('acrx-content');
  if (!container) return; // empty layout / login — nothing swappable here.

  var lastRev = 0;
  var bootId = null;
  var es = null;
  var backoff = 1000;
  var maxBackoff = 30000;
  var swapping = false;
  var staleReason = null;
  var loadedScripts = new Set();
  var stats = { invalidations: 0, swaps: 0, skipped: 0, deferred: 0, errors: 0 };

  try {
    Array.prototype.forEach.call(document.scripts || [], function (s) {
      if (s && s.src) loadedScripts.add(s.src.split('?')[0]);
    });
  } catch (_) {}

  function emit(status, detail) {
    try {
      window.dispatchEvent(new CustomEvent('acrx:update', { detail: Object.assign({ status: status, at: Date.now() }, detail || {}) }));
    } catch (_) {}
  }

  function log() {
    if (window.__ACRX_DEBUG__) try { console.log.apply(console, ['[Acroxa:ADMIN]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  // ── Guard (default; Phase 3 installs a stronger window.AcroxaUpdateGuard) ──
  function defaultGuard() {
    try {
      var ed = window.AcroxaEditor;
      if (ed && ed.booted) {
        if (ed.editor && ed.editor.isDirty) return { ok: false, reason: 'editor-dirty' };
        var canvas = document.getElementById('editor-canvas');
        if (canvas && canvas.contains(document.activeElement)) return { ok: false, reason: 'editor-focused' };
      }
      var ae = document.activeElement;
      if (ae && container.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && ae.value !== ae.defaultValue) {
        return { ok: false, reason: 'form-dirty' };
      }
    } catch (_) {}
    return { ok: true };
  }

  function guard() {
    try {
      if (window.AcroxaUpdateGuard && typeof window.AcroxaUpdateGuard.canPatch === 'function') {
        return window.AcroxaUpdateGuard.canPatch() || { ok: false, reason: 'guard' };
      }
    } catch (_) {}
    return defaultGuard();
  }

  function markStale(reason) {
    staleReason = reason || 'deferred';
    try { container.setAttribute('data-acrx-stale', staleReason); } catch (_) {}
    stats.deferred++;
    emit('deferred', { reason: staleReason });
    log('deferred:', staleReason);
  }

  function clearStale() {
    staleReason = null;
    try { container.removeAttribute('data-acrx-stale'); } catch (_) {}
  }

  // ── Fragment fetch (same auth chain as the page; 401 → login redirect) ──
  async function fetchFragment(signal) {
    var url = window.location.pathname + (window.location.search ? window.location.search + '&' : '?') + '_frag=content';
    var res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json', 'X-ACRX-Fragment': 'content' }, signal: signal || undefined });
    if (res.status === 401) {
      window.location.href = '/acroxa/login?acrx=' + encodeURIComponent(window.location.pathname + window.location.search);
      throw new Error('unauthorized');
    }
    if (!res.ok) throw new Error('fragment ' + res.status);
    var data = await res.json();
    if (!data || data.success !== true || typeof data.html !== 'string') throw new Error('bad fragment');
    return data;
  }

  // ── Asset ensure (inject once, never duplicate) ──
  function ensureCss(list) {
    (list || []).forEach(function (c) {
      var href = typeof c === 'string' ? c : (c && c.href);
      if (!href) return;
      var clean = href.split('?')[0];
      try {
        var exists = Array.prototype.some.call(document.styleSheets || [], function (ss) {
          return ss.href && ss.href.split('?')[0] === clean;
        });
        if (exists) return;
        if (document.querySelector('link[rel="stylesheet"][href^="' + clean + '"]')) return;
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        document.head.appendChild(l);
      } catch (_) {}
    });
  }

  function ensureJs(list) {
    var jobs = [];
    (list || []).forEach(function (j) {
      var src = typeof j === 'string' ? j : (j && j.src);
      if (!src) return;
      var clean = src.split('?')[0];
      if (loadedScripts.has(clean)) return;
      loadedScripts.add(clean);
      jobs.push(new Promise(function (resolve) {
        try {
          var s = document.createElement('script');
          s.src = src;
          if (j && typeof j === 'object') {
            if (j.type) s.type = j.type;
            if (j.defer) s.defer = true;
            if (j.async) s.async = true;
          }
          var done = function () { resolve(); };
          s.onload = done;
          s.onerror = function () { stats.errors++; resolve(); };
          setTimeout(done, 10000);
          document.head.appendChild(s);
        } catch (_) { resolve(); }
      }));
    });
    return Promise.all(jobs);
  }

  function refreshSidebarActive() {
    try {
      var scope = document.getElementById('acrx_h') || document;
      var here = window.location.pathname;
      Array.prototype.forEach.call(scope.querySelectorAll('.acroxa-item.active, .acroxa-sub-item.active, .acroxa-extra-item.active'), function (n) {
        n.classList.remove('active');
      });
      Array.prototype.forEach.call(scope.querySelectorAll('.acroxa-item[data-link], a.acroxa-item[href], a.acroxa-sub-item[href], a.acroxa-extra-item[href]'), function (n) {
        var target = n.getAttribute('data-link') || n.getAttribute('href') || '';
        try {
          var p = new URL(target, window.location.origin).pathname;
          if (p === here) {
            n.classList.add('active');
            var parent = n.closest && n.closest('.acroxa-has-sub');
            if (parent) parent.classList.add('active');
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  // ── Swap (footer node preserved; focus + hydration handled) ──
  async function swap() {
    if (swapping) return false;
    var g = guard();
    if (!g.ok) { markStale(g.reason); return false; }
    swapping = true;
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    var ctrl = null;
    try { ctrl = new AbortController(); } catch (_) {}
    try {
      var frag = await fetchFragment(ctrl ? ctrl.signal : null);
      if (frag.rev && frag.rev < lastRev) { stats.skipped++; return false; }

      var footer = container.querySelector('[data-acrx-region="footer"]');
      if (footer) footer.remove();
      try {
        if (window.AcroxaHydration && window.AcroxaHydration.disposeSubtree) window.AcroxaHydration.disposeSubtree(container);
      } catch (_) {}

      var cap = null;
      try {
        var ae = document.activeElement;
        if (ae && container.contains(ae)) {
          cap = { id: ae.id || null, key: (ae.getAttribute && ae.getAttribute('data-acrx-id')) || null };
        }
      } catch (_) {}

      container.innerHTML = frag.html;
      if (footer) container.appendChild(footer);

      try {
        if (window.AcroxaHydration && window.AcroxaHydration.hydrateSubtree) window.AcroxaHydration.hydrateSubtree(container);
      } catch (_) {}

      if (frag.title) { try { document.title = frag.title; } catch (_) {} }
      ensureCss(frag.css);
      await ensureJs(frag.js);
      refreshSidebarActive();

      try {
        if (cap && (cap.id || cap.key)) {
          var t = (cap.key && container.querySelector('[data-acrx-id="' + CSS.escape(cap.key) + '"]')) || (cap.id && document.getElementById(cap.id));
          if (t && document.activeElement !== t && /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(t.tagName)) t.focus({ preventScroll: true });
        }
      } catch (_) {}

      if (frag.rev) lastRev = Math.max(lastRev, frag.rev);
      clearStale();
      stats.swaps++;
      var ms = (window.performance && performance.now) ? Math.round(performance.now() - t0) : null;
      emit('swapped', { rev: lastRev, ms: ms });
      log('swapped rev', lastRev);
      return true;
    } catch (e) {
      if (e && e.name !== 'AbortError') { stats.errors++; emit('error', { message: String((e && e.message) || e) }); }
      return false;
    } finally {
      swapping = false;
    }
  }

  // ── Invalidation handling ──
  async function onInvalidation(inv) {
    stats.invalidations++;
    emit('invalidation', { v: inv && inv.v });
    if (!inv || typeof inv.v !== 'number') return;
    if (inv.bootId && bootId && inv.bootId !== bootId) { sync(); return; }
    if (inv.v <= lastRev) { stats.skipped++; return; }
    lastRev = inv.v;
    if (inv.bootId) bootId = inv.bootId;

    var strategy = inv.strategy || '';
    if (strategy === 'stylesheet-refresh' || inv.scope === 'stylesheet') {
      try {
        Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"][href^="/acrx/assets/css/"]'), function (l) {
          var href = l.getAttribute('href').split('?')[0];
          l.setAttribute('href', href + '?v=' + inv.v);
        });
      } catch (_) {}
      return;
    }
    if (strategy === 'full-reload') { markStale(inv.reason || 'full-reload'); return; }
    // Target-aware skip: when the invalidation names affected pages, only the
    // pages it names re-swap. Unknown-scope targets (or none) keep the safe
    // default: swap this page. Dynamic routes (/acrx/users/:id) match by pattern.
    var targets = (inv && inv.targets) || [];
    if (targets.length) {
      var here = window.location.pathname;
      var relevant = false;
      for (var ti = 0; ti < targets.length; ti++) {
        var t = targets[ti];
        if (typeof t !== 'string') continue;
        if (t.indexOf('page:') !== 0) { relevant = true; break; }
        var p = t.slice(5);
        if (p === here) { relevant = true; break; }
        if (p.indexOf(':') !== -1) {
          try {
            var rx = '^' + p.split('/').map(function (s) {
              return s.charAt(0) === ':' ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }).join('/') + '$';
            if (new RegExp(rx).test(here)) { relevant = true; break; }
          } catch (_) {}
        }
      }
      if (!relevant) { stats.skipped++; emit('skipped', { v: inv.v, reason: 'page-unaffected' }); return; }
    }
    await swap();
  }

  function onLegacy(event, data) {
    // Old channels carry no rev — treat as a swap hint for this page.
    stats.invalidations++;
    emit('invalidation', { legacy: event });
    swap();
  }

  async function ping() {
    try {
      var res = await fetch('/acr/api/runtime/ping', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      var data = await res.json();
      if (data && typeof data.rev === 'number' && data.rev > lastRev) {
        lastRev = data.rev;
        if (data.bootId) bootId = data.bootId;
      } else if (data && data.bootId && !bootId) {
        bootId = data.bootId;
      }
    } catch (_) {}
  }

  async function sync() {
    try {
      var res = await fetch('/acr/api/runtime/sync?since=' + lastRev, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      var data = await res.json();
      if (!data || !data.success) return;
      if (data.bootId && bootId && data.bootId !== bootId && lastRev !== 0) {
        markStale('resync-boot');
        lastRev = data.rev;
        bootId = data.bootId;
        return;
      }
      if (data.bootId) bootId = data.bootId;
      if (data.needsFull) { markStale('resync-overflow'); lastRev = data.rev; return; }
      var missed = data.missed || [];
      if (missed.length) { await swap(); }
      lastRev = Math.max(lastRev, data.rev || 0);
    } catch (_) {}
  }

  function connect() {
    if (typeof EventSource === 'undefined') return;
    if (es) { try { es.close(); } catch (_) {} es = null; }
    try {
      es = new EventSource('/acr/api/runtime/sse');
      es.addEventListener('runtime.invalidated', function (e) {
        backoff = 1000;
        try { onInvalidation(JSON.parse(e.data)); } catch (_) {}
      });
      es.addEventListener('page.updated', function () { backoff = 1000; onLegacy('page.updated'); });
      es.addEventListener('layout.updated', function () { backoff = 1000; onLegacy('layout.updated'); });
      es.addEventListener('connected', function () { backoff = 1000; });
      es.addEventListener('ping', function () { backoff = 1000; });
      es.onerror = function () {
        try { es.close(); } catch (_) {} es = null;
        if (document.hidden) {
          var h = function () {
            if (!document.hidden) { document.removeEventListener('visibilitychange', h); sync().then(connect); }
          };
          document.addEventListener('visibilitychange', h);
          return;
        }
        setTimeout(function () {
          backoff = Math.min(backoff * 2, maxBackoff);
          sync().then(connect);
        }, backoff);
      };
    } catch (_) {}
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      ping().then(function () {
        if (staleReason) swap();
        else sync();
      });
    }
  });
  window.addEventListener('online', function () { sync().then(connect); });
  window.addEventListener('beforeunload', function () { try { es && es.close(); } catch (_) {} });

  ping().then(function () { connect(); });

  window.AcroxaAdminRuntime = {
    __v: 1,
    swap: swap,
    sync: sync,
    ping: ping,
    stats: function () { return Object.assign({ rev: lastRev, bootId: bootId, stale: staleReason }, stats); },
  };
})();
