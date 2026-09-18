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

  // Staged debug: window.acrxDbg('STAGE', ...) — no-op unless ?acrx_debug=1.
  function dbg() { try { if (window.acrxDbg) window.acrxDbg.apply(null, arguments); } catch (_) {} }

  // Boot is deferred to DOMContentLoaded (scripts load in <head>, before the
  // body parses). Querying #acrx-content at parse time always misses, which
  // used to early-return and silently disable the whole admin runtime.
  var container = null;

  var lastRev = 0;
  var bootId = null;
  // AcroxaJS Phase 6: committed content-region version (server snapshot).
  // Read at boot from #acrx-content[data-acrx-content-version] (stamped on
  // full renders); updated from every fragment response. Version-gates
  // op-level patches; mismatch falls back to the proven full-swap resync.
  var contentVersion = null;
  var es = null;
  var backoff = 1000;
  var maxBackoff = 30000;
  var swapping = false;
  var staleReason = null;
  var loadedScripts = new Set();
  var stats = { invalidations: 0, swaps: 0, targeted: 0, skipped: 0, deferred: 0, errors: 0 };
  // Dedupe: one file change fans out to BOTH a legacy page.updated event and
  // a runtime.invalidated broadcast — handle the targeted update once.
  var recentTargeted = new Map(); // key -> timestamp ms

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
    dbg('STALE-MARK', staleReason);
    emit('deferred', { reason: staleReason });
    log('deferred:', staleReason);
  }

  function clearStale() {
    staleReason = null;
    try { container.removeAttribute('data-acrx-stale'); } catch (_) {}
  }

  // ── Asset bookkeeping (shared with AcroxaTargeted eject+inject) ─────────
  function forgetScript(src) {
    try { loadedScripts.delete(String(src || '').split('?')[0]); } catch (_) {}
  }

  function noteScript(src) {
    try { if (src) loadedScripts.add(String(src).split('?')[0]); } catch (_) {}
  }

  function isFrontendFile(id) {
    if (!id || typeof id !== 'string') return false;
    var n = id.replace(/\\/g, '/').toLowerCase();
    if (n.indexOf('acrx/assets/js') !== -1) return true;
    return n.indexOf('public/assets') !== -1 && n.slice(-3) === '.js';
  }

  function recentlyHandled(key) {
    var now = Date.now();
    try {
      for (const [k, t] of recentTargeted) {
        if (now - t > 10000) recentTargeted.delete(k);
      }
      if (recentTargeted.has(key)) return true;
      recentTargeted.set(key, now);
    } catch (_) {}
    return false;
  }

  // Targeted delegation: frontend JS changes eject+inject the stale <script>
  // (executing the new code) instead of swapping content under stale code —
  // the swap path can never apply JS changes (ensureJs skips loaded files).
  // Returns true when the invalidation is fully handled (no swap needed).
  async function targetedFrontendUpdate(inv, file) {
    if (!window.AcroxaTargeted || typeof window.AcroxaTargeted.update !== 'function') return false;
    var clean = String(file || '').replace(/\\/g, '/');
    if (recentlyHandled('frontend:' + clean)) { stats.skipped++; return true; }
    try {
      var res = await window.AcroxaTargeted.update({ changedFile: file });
      if (res && res.deferred) return true; // guard held it; stale-marked already
      if (res && res.fallback !== 'content-swap' && !res.rerenderError) {
        if (inv && inv.v) lastRev = Math.max(lastRev, inv.v);
        stats.targeted++;
        emit('swapped', { rev: lastRev, targeted: true, strategy: res.strategy });
        log('targeted applied:', res.strategy);
        return true;
      }
    } catch (e) { log('targeted update failed, swapping:', e && e.message); }
    return false;
  }

  // ── Fragment fetch (same auth chain as the page; 401 → login redirect) ──
  async function fetchFragment(signal) {
    var url = window.location.pathname + (window.location.search ? window.location.search + '&' : '?') + '_frag=content';
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    dbg('FRAG-REQ', url);
    var res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json', 'X-ACRX-Fragment': 'content' }, signal: signal || undefined });
    var ms = (window.performance && performance.now) ? Math.round(performance.now() - t0) : null;
    if (res.status === 401) {
      window.location.href = '/acroxa/login?acrx=' + encodeURIComponent(window.location.pathname + window.location.search);
      throw new Error('unauthorized');
    }
    if (!res.ok) { dbg('FRAG-FAIL', 'status=' + res.status, ms != null ? ms + 'ms' : ''); throw new Error('fragment ' + res.status); }
    var data = await res.json();
    if (!data || data.success !== true || typeof data.html !== 'string') { dbg('FRAG-FAIL', 'bad payload', ms != null ? ms + 'ms' : ''); throw new Error('bad fragment'); }
    dbg('FRAG-OK', 'rev=' + (data.rev != null ? data.rev : 'n/a'), 'bytes=' + data.html.length, ms != null ? ms + 'ms' : '');
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
  // Ordered + lossless: the rev is claimed only AFTER the fetch resolves,
  // so a slow older fetch can never clobber a newer swap (P0 stale-overwrite).
  var swapSeq = 0;
  var pendingWant = 0;
  var pendingRetry = false;
  async function swap(expectedRev) {
    if (swapping) {
      if (expectedRev && expectedRev > pendingWant) pendingWant = expectedRev;
      else if (!expectedRev) pendingRetry = true;
      stats.skipped++;
      return false;
    }
    var g = guard();
    if (!g.ok) { dbg('GUARD-BLOCK', g.reason); markStale(g.reason); return false; }
    dbg('GUARD-OK', 'swapping rev=' + (expectedRev || 'latest'));
    swapping = true;
    var mySeq = ++swapSeq;
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    var ctrl = null;
    try { ctrl = new AbortController(); } catch (_) {}
    try {
      var frag = await fetchFragment(ctrl ? ctrl.signal : null);
      if (mySeq !== swapSeq) { dbg('SWAP-SKIP', 'superseded by newer swap'); stats.skipped++; return false; }
      if (expectedRev && frag.rev && frag.rev < expectedRev) { dbg('SWAP-SKIP', 'fragment rev ' + frag.rev + ' < wanted ' + expectedRev); stats.skipped++; return false; }
      if (frag.rev && frag.rev < lastRev) { dbg('SWAP-SKIP', 'fragment rev ' + frag.rev + ' < committed ' + lastRev); stats.skipped++; return false; }

      // ── AcroxaJS Phase 6: op-level patch (patch protocol) ──
      // When the server sends ops AND fromVersion matches this client's
      // committed content version, apply the op list (attr/text/structure)
      // instead of swapping the whole region. Mutate-first ops preserve
      // focus/input/scroll. Version mismatch → fall through to the full
      // swap below (which IS the resync: the server rendered fresh html).
      if (
        frag.ops && Array.isArray(frag.ops) && frag.ops.length &&
        typeof frag.contentVersion === 'number' &&
        typeof frag.fromVersion === 'number' &&
        frag.fromVersion === contentVersion &&
        window.AcroxaDomPatch && typeof window.AcroxaDomPatch.applyOps === 'function'
      ) {
        dbg('OPS-PATCH', frag.ops.length + ' ops', 'v' + frag.fromVersion + '→v' + frag.contentVersion);
        var r = window.AcroxaDomPatch.applyOps(frag.ops, { generation: frag.rev || 0 });
        if (r.failed === 0) {
          contentVersion = frag.contentVersion;
          if (frag.rev) lastRev = Math.max(lastRev, frag.rev);
          clearStale();
          stats.swaps++;
          stats.ops = (stats.ops || 0) + r.applied;
          var msOps = (window.performance && performance.now) ? Math.round(performance.now() - t0) : null;
        dbg('OPS-OK', r.applied + ' applied', msOps != null ? msOps + 'ms' : '');
        emit('swapped', {
          rev: lastRev,
          ops: r.applied,
          ms: msOps,
          // Patch-debugger detail (bounded): per-op target/op/before/after.
          opList: r.results.slice(0, 40).map(function (x) {
            return {
              op: x.op && x.op.op,
              target: x.op && x.op.target,
              name: x.op && x.op.name,
              before: x.before || '',
              after: x.op ? String(x.op.value || x.op.html || '').slice(0, 120) : '',
              ok: x.ok,
            };
          }),
        });
          log('op-patched', r.applied + ' op(s)');
          return true;
        }
        dbg('OPS-FAIL', r.failed + ' failed — falling back to full swap (resync)');
      }

      dbg('SWAP-APPLY', 'replacing #acrx-content, bytes=' + (frag.html && frag.html.length));

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
      // AcroxaJS Phase 6: adopt the server's committed content version —
      // the full swap IS the resync (server rendered fresh html).
      if (typeof frag.contentVersion === 'number') contentVersion = frag.contentVersion;
      clearStale();
      stats.swaps++;
      var ms = (window.performance && performance.now) ? Math.round(performance.now() - t0) : null;
      dbg('SWAP-OK', 'rev=' + lastRev, ms != null ? ms + 'ms' : '');
      emit('swapped', { rev: lastRev, ms: ms });
      log('swapped rev', lastRev);
      return true;
    } catch (e) {
      if (e && e.name !== 'AbortError') {
        stats.errors++;
        // AcroxaJS Phase 7: a broken source (render 5xx) must surface as a
        // useful error state, not silent stale data. The stale banner shows
        // the reason; the page auto-recovers on the next save (invalidate →
        // swap). Client knows its own path — no source paths shipped.
        if (e.message && e.message.indexOf('fragment 5') === 0) {
          markStale('render failed — fix the source; this page recovers on the next save');
        }
        emit('error', { message: String((e && e.message) || e) });
      }
      return false;
    } finally {
      swapping = false;
      var next = pendingWant;
      var retry = pendingRetry;
      pendingWant = 0;
      pendingRetry = false;
      if ((next && next > lastRev) || retry) {
        try { swap(next || 0); } catch (_) {}
      }
    }
  }

  // ── Invalidation handling ──
  // NOTE: lastRev is claimed only after swap() succeeds (see swap());
  // claiming it here would let a slow fetch for v18 overwrite v19.
  async function onInvalidation(inv) {
    stats.invalidations++;
    dbg('SSE-EVENT', 'runtime.invalidated', 'v=' + (inv && inv.v), 'strategy=' + ((inv && inv.strategy) || 'n/a'));
    emit('invalidation', { v: inv && inv.v });
    if (!inv || typeof inv.v !== 'number') return;
    if (inv.bootId && bootId && inv.bootId !== bootId) { sync(); return; }
    if (inv.v <= lastRev) { stats.skipped++; return; }
    var want = inv.v;
    if (inv.bootId) bootId = inv.bootId;

    var strategy = inv.strategy || '';
    if (strategy === 'stylesheet-refresh' || inv.scope === 'stylesheet') {
      try {
        Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"][href^="/acrx/assets/css/"]'), function (l) {
          var href = l.getAttribute('href').split('?')[0];
          l.setAttribute('href', href + '?v=' + inv.v);
        });
      } catch (_) {}
      if (inv.v) lastRev = Math.max(lastRev, inv.v);
      emit('swapped', { rev: lastRev, stylesheet: true });
      return;
    }
    if (strategy === 'full-reload') {
      if (inv.v) lastRev = Math.max(lastRev, inv.v);
      markStale(inv.reason || 'full-reload');
      return;
    }
    // Targeted live update: a changed frontend JS file ejects+injects the
    // stale <script> (executing the new code) instead of swapping content
    // under stale code. Handled before the page-relevance skip — global
    // scripts affect every page.
    var invFile = (inv && (inv.id || inv.file)) || null;
    var isFrontend = (inv && inv.type === 'frontend') ||
      strategy === 'rehydrate' || strategy === 'eject-inject' ||
      isFrontendFile(invFile);
    if (isFrontend && invFile) {
      if (await targetedFrontendUpdate(inv, invFile)) return;
      // Fell through: targeted path needs a content swap after all.
    }
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
      if (!relevant) {
        if (inv.v) lastRev = Math.max(lastRev, inv.v);
        stats.skipped++;
        dbg('RELEVANCE-SKIP', 'page-unaffected by v' + inv.v, window.location.pathname);
        emit('skipped', { v: inv.v, reason: 'page-unaffected' });
        return;
      }
      dbg('RELEVANCE-OK', 'page affected, swapping to v' + want);
    }
    await swap(want);
  }

  function parseEventData(e) {
    try { return e && e.data ? JSON.parse(e.data) : {}; } catch (_) { return {}; }
  }

  async function onLegacy(event, data) {
    // Old channels carry the changed file when the server knows it — route
    // frontend files through the targeted eject+inject path so JS changes
    // actually take effect. Unknown payloads keep the safe swap default.
    // Queued via pendingRetry so concurrent legacy swaps serialize
    // instead of racing (loser retries, never half-applied).
    stats.invalidations++;
    dbg('SSE-EVENT', event, 'file=' + ((data && (data.file || data.id)) || 'n/a'));
    emit('invalidation', { legacy: event });
    data = data || {};
    var file = data.file || data.id || null;
    if ((data.kind === 'frontend' || isFrontendFile(file)) && file) {
      if (await targetedFrontendUpdate(null, file)) return;
    }
    swap(0);
  }

  async function ping() {
    try {
      var res = await fetch('/acr/api/runtime/ping', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      var data = await res.json();
      if (data && data.bootId && bootId && data.bootId !== bootId) {
        // New server generation: never just adopt its cursor (that would
        // silently skip everything it rendered) — resync content instead.
        sync();
        return;
      }
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
      // Server restarted under this tab: adopt the new generation, then pull
      // the fresh content region immediately (the guard decides safety).
      // Stale-mark ONLY when the guard blocks or the swap fails — a restart
      // must look like a realtime update, never demand a manual refresh.
      if (data.bootId && bootId && data.bootId !== bootId && lastRev !== 0) {
        bootId = data.bootId;
        lastRev = data.rev || 0;
        emit('resync', { reason: 'boot-change', rev: lastRev });
        var okBoot = await swap();
        if (!okBoot && !staleReason) markStale('resync-boot');
        return;
      }
      if (data.bootId) bootId = data.bootId;
      if (data.needsFull) {
        lastRev = data.rev || 0;
        emit('resync', { reason: 'history-overflow', rev: lastRev });
        var okFull = await swap();
        if (!okFull && !staleReason) markStale('resync-overflow');
        return;
      }
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
      es.addEventListener('page.updated', function (e) { backoff = 1000; onLegacy('page.updated', parseEventData(e)); });
      es.addEventListener('layout.updated', function (e) { backoff = 1000; onLegacy('layout.updated', parseEventData(e)); });
      es.addEventListener('connected', function (e) {
        backoff = 1000;
        // Lifecycle trace so the Updates panel tells the full story:
        // "connected, nothing changed" must be distinguishable from silence.
        try { emit('connected', parseEventData(e)); } catch (_) { emit('connected', {}); }
      });
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

  function boot() {
    container = document.getElementById('acrx-content');
    if (!container) return; // empty layout / login — nothing swappable here.
    try {
      Array.prototype.forEach.call(document.scripts || [], function (s) {
        if (s && s.src) loadedScripts.add(s.src.split('?')[0]);
      });
    } catch (_) {}
    // AcroxaJS Phase 6: read the committed content version stamped on the
    // region at full-render time so the FIRST post-load update can be an
    // op-level patch, not always a full swap.
    try {
      var cv = container.getAttribute('data-acrx-content-version');
      var n = cv != null ? parseInt(cv, 10) : NaN;
      if (Number.isFinite(n)) contentVersion = n;
    } catch (_) {}
    dbg('BOOT', 'admin runtime v1, region=' + container.tagName, 'path=' + window.location.pathname, 'contentVersion=' + contentVersion);
    ping().then(function () { connect(); });

    window.AcroxaAdminRuntime = {
      __v: 1,
      swap: swap,
      sync: sync,
      ping: ping,
      markStale: markStale,
      clearStale: clearStale,
      noteScript: noteScript,
      forgetScript: forgetScript,
      stats: function () { return Object.assign({ rev: lastRev, bootId: bootId, stale: staleReason, contentVersion: contentVersion }, stats); },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
