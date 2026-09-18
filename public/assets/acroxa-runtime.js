// public/assets/acroxa-runtime.js — AcroxaJS visitor runtime (slim).
// SSE invalidation + ping/sync + targeted fragment patch. No admin code,
// no editor, no command palette. Static pages without data-acrx-id are
// never touched. Full reload is never automatic (explicit full-reload
// strategy only marks stale and logs — user navigation decides).

(function AcroxaRuntime() {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.AcroxaRuntime && window.AcroxaRuntime.__v === 2) return;

  // Staged debug — standalone (no acrx-debug.js dependency): on via
  // ?acrx_debug=1 (persisted), localStorage acrx_debug=1, or
  // window.__ACRX_DEBUG__ = true. window.AcroxaDebug.enable() works too
  // when the shared helper is present.
  function _dbgOn(stage) {
    try {
      if (window.AcroxaDebug && typeof window.AcroxaDebug.on === 'function') return window.AcroxaDebug.on(stage);
    } catch (_) {}
    try {
      if (window.__ACRX_DEBUG__ === true) return true;
      return window.localStorage.getItem('acrx_debug') === '1';
    } catch (_) { return false; }
  }
  function _dbgColor(stage) {
    var s = String(stage || '').toUpperCase();
    if (/FAIL|ERROR|RELOAD/.test(s)) return 'color:#dc2626;font-weight:bold';
    if (/DROP|SKIP|STALE/.test(s)) return 'color:#b45309;font-weight:bold';
    if (/PATCH|APPLY|RESYNC/.test(s)) return 'color:#15803d;font-weight:bold';
    return 'color:#0284c7;font-weight:bold';
  }
  function dbg(stage) {
    try {
      if (!_dbgOn(stage)) return;
      var args = ['%c[Acroxa:' + stage + ']', _dbgColor(stage)];
      for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
      (console.log || console.info).apply(console, args);
    } catch (_) {}
  }
  try {
    var _q = new URLSearchParams(window.location.search || '');
    if (_q.get('acrx_debug') === '1') { try { window.localStorage.setItem('acrx_debug', '1'); } catch (_) {} }
    else if (_q.get('acrx_debug') === '0') { try { window.localStorage.setItem('acrx_debug', '0'); } catch (_) {} }
  } catch (_) {}

  var lastRev = 0;
  var bootId = null;
  var es = null;
  var backoff = 1000;
  var maxBackoff = 30000;
  var inflight = new Map(); // target -> AbortController
  var committed = new Map(); // target -> generation (newest applied wins)
  var pendingGen = new Map(); // target -> newest queued generation
  var pollTimer = null;
  var stats = { invalidations: 0, patched: 0, skipped: 0, errors: 0, rolledBack: 0, staleDropped: 0 };

  // Transaction gate (mirrors src/AcroxaJS/dom/transaction.js decide):
  // patch = safe, drop = stale/invalid (keep DOM), reload = boot mismatch
  // (mark stale, never location.reload here).
  function decide(inv) {
    if (!inv || typeof inv.v !== 'number') return { action: 'drop', reason: 'invalid message' };
    if (inv.bootId && bootId && inv.bootId !== bootId) return { action: 'reload', reason: 'bootId mismatch' };
    if (inv.v <= lastRev) return { action: 'drop', reason: 'stale v' + inv.v + ' <= ' + lastRev };
    if (inv.type === 'full-reload' || inv.strategy === 'full-reload') return { action: 'reload', reason: inv.reason || 'full-reload requested' };
    return { action: 'patch', reason: inv.reason || 'ok' };
  }

  function log() {
    if (window.__ACRX_DEBUG__) try { console.log.apply(console, ['[Acroxa:TRANSPORT]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function pageTargets() {
    try {
      return [].map.call(document.querySelectorAll('[data-acrx-id]'), function (n) { return n.getAttribute('data-acrx-id'); });
    } catch (_) { return []; }
  }

  function refreshCss(rev) {
    // Stylesheet-refresh: bump layout CSS links, no DOM churn, no state loss.
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    var n = 0;
    links.forEach(function (l) {
      var href = l.getAttribute('href') || '';
      if (/^\/layouts\//.test(href) || /layout-css-vars/.test(l.id || '')) return; // vars are inline
      if (/^\/layouts\//.test(href) || href.indexOf('/acrx/assets/css/') === 0 || href.indexOf('/assets/') === 0) {
        var clean = href.split('?')[0];
        l.setAttribute('href', clean + '?v=' + rev);
        n++;
      }
    });
    return n;
  }

  function captureFocus() {
    var a = document.activeElement;
    if (!a || a === document.body) return null;
    return { id: a.getAttribute && a.getAttribute('data-acrx-id'), elId: a.id || null, start: null, end: null };
  }

  function restoreFocus(cap) {
    if (!cap) return;
    try {
      var t = (cap.id && document.querySelector('[data-acrx-id="' + CSS.escape(cap.id) + '"]')) || (cap.elId && document.getElementById(cap.elId));
      if (t && document.activeElement !== t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) t.focus({ preventScroll: true });
    } catch (_) {}
  }

  function reinitTabs(scope) {
    // Mirror of hydration-snippet initTabs (idempotent). Keeps patched tabs live.
    try {
      (scope || document).querySelectorAll('.wdg-tabs:not([data-acrx-tabs])').forEach(function (box) {
        box.setAttribute('data-acrx-tabs', '1');
        box.setAttribute('role', 'tablist');
      });
    } catch (_) {}
  }

  async function postJson(url, body, signal) {
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    dbg('RR-REQ', 'POST ' + url);
    var res = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {}), signal: signal,
    });
    var ms = (window.performance && performance.now) ? Math.round(performance.now() - t0) : null;
    if (!res.ok) { dbg('RR-FAIL', 'POST ' + url, 'status=' + res.status, ms != null ? ms + 'ms' : ''); throw new Error('HTTP ' + res.status); }
    dbg('RR-OK', 'POST ' + url, 'status=' + res.status, ms != null ? ms + 'ms' : '');
    return res.json();
  }

  async function fetchFragment(target, rev) {
    if (inflight.has(target)) { stats.skipped++; return null; }
    var ctrl = null;
    try { ctrl = new AbortController(); inflight.set(target, ctrl); } catch (_) {}
    try {
      // Prefer versioned RR; fall back to legacy fragment on 404 (old server).
      var data = null;
      try {
        data = await postJson('/acr/api/runtime/rr', { target: target }, ctrl ? ctrl.signal : undefined);
      } catch (e1) {
        data = await postJson('/acr/api/runtime/fragment', { type: 'target', target: target }, ctrl ? ctrl.signal : undefined);
      }
      if (!data || !data.success || !data.html) { stats.errors++; return null; }
      // Revision + generation ordering: never render older over newer.
      if (data.rev && data.rev < lastRev) { stats.skipped++; return null; }
      var gen = (data.generation != null ? data.generation : data.rev) || 0;
      var done = committed.get(target) || 0;
      if (gen && done && gen < done) { dbg('STALE-DROP', target, 'gen=' + gen + ' < committed=' + done); stats.staleDropped++; return null; }
      // Newer queued while fetching supersedes this payload.
      var queued = pendingGen.get(target) || 0;
      if (queued && gen && queued > gen) { dbg('STALE-DROP', target, 'gen=' + gen + ' superseded by queued=' + queued); stats.staleDropped++; return null; }
      dbg('FETCH-OK', target, 'gen=' + gen, 'bytes=' + (data.html && data.html.length));
      return data;
    } catch (e) {
      if (e && e.name !== 'AbortError') stats.errors++;
      return null;
    } finally {
      inflight.delete(target);
    }
  }

  function snapshotHtml(node) {
    try { return node.outerHTML; } catch (_) { return null; }
  }

  function rollback(node, snapshot) {
    try {
      if (!node || !node.parentNode || !snapshot) return false;
      var tpl = document.createElement('template');
      tpl.innerHTML = String(snapshot).trim();
      var prev = tpl.content.firstElementChild;
      if (!prev) return false;
      node.parentNode.replaceChild(prev, node);
      reinitTabs(prev.parentNode || document);
      stats.rolledBack++;
      return true;
    } catch (_) { stats.errors++; return false; }
  }

  function captureDetailsMedia(root) {
    var out = { details: [], media: [] };
    try {
      root.querySelectorAll('details[data-acrx-id]').forEach(function (n) {
        out.details.push({ id: n.getAttribute('data-acrx-id'), open: !!n.open });
      });
      root.querySelectorAll('video[data-acrx-id],audio[data-acrx-id]').forEach(function (n) {
        try { out.media.push({ id: n.getAttribute('data-acrx-id'), t: n.currentTime || 0, paused: !!n.paused }); } catch (_) {}
      });
    } catch (_) {}
    return out;
  }

  function restoreDetailsMedia(root, cap) {
    try {
      (cap.details || []).forEach(function (d) {
        var n = root.querySelector('[data-acrx-id="' + CSS.escape(d.id) + '"]');
        if (n && 'open' in n) n.open = !!d.open;
      });
      (cap.media || []).forEach(function (m) {
        var n = root.querySelector('[data-acrx-id="' + CSS.escape(m.id) + '"]');
        if (!n || typeof n.currentTime !== 'number') return;
        try { if (Math.abs(n.currentTime - m.t) > 0.5) n.currentTime = m.t; } catch (_) {}
      });
    } catch (_) {}
  }

  function patchTarget(target, payload) {
    var html = typeof payload === 'string' ? payload : (payload && payload.html);
    var generation = (payload && (payload.generation != null ? payload.generation : payload.rev)) || 0;
    var node = null;
    try { node = document.querySelector('[data-acrx-id="' + CSS.escape(target) + '"]'); } catch (_) { return false; }
    if (!node || !node.parentNode) return false;
    // Generation guard: stale payloads never overwrite newer DOM.
    try {
      var cur = parseInt(node.getAttribute('data-acrx-generation') || node.getAttribute('data-acrx-rev') || '0', 10);
      if (generation && cur && generation < cur) { dbg('STALE-DROP', target, 'dom-generation=' + cur + ' > incoming=' + generation); stats.staleDropped++; return false; }
    } catch (_) {}
    dbg('PATCH-START', target, 'generation=' + generation);
    // Never clobber a focused subtree silently: skip if user is typing inside.
    try {
      if (node.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
        node.setAttribute('data-acrx-stale', '1');
        stats.skipped++;
        return false;
      }
    } catch (_) {}
    var cap = captureFocus();
    var dm = captureDetailsMedia(node);
    var scroll = null;
    try { if (node.scrollTop || node.scrollLeft) scroll = { top: node.scrollTop, left: node.scrollLeft }; } catch (_) {}
    var snap = snapshotHtml(node);
    // Prefer the shared reconciler when admin assets are present (same page
    // in customizer previews); otherwise targeted replace with verification.
    try {
      if (window.AcroxaDomPatch && typeof window.AcroxaDomPatch.patchWithGeneration === 'function') {
        var r = window.AcroxaDomPatch.patchWithGeneration(node, html, { generation: generation });
        dbg('PATCH-' + ((r && r.action) || '?').toUpperCase(), target, (r && (r.strategy || r.reason)) || '');
        if (r && r.action === 'patch') {
          committed.set(target, generation || lastRev);
          stats.patched++;
          return true;
        }
        if (r && r.action === 'drop') { stats.skipped++; return false; }
        // reload verdict → mark stale, never auto-reload.
        document.documentElement.setAttribute('data-acrx-stale', (r && r.reason) || 'verify');
        return false;
      }
    } catch (_) {}
    try {
      var tpl = document.createElement('template');
      tpl.innerHTML = String(html).trim();
      var next = tpl.content.firstElementChild;
      if (!next) return false;
      if (generation) { try { next.setAttribute('data-acrx-generation', String(generation)); } catch (_) {} }
      node.parentNode.replaceChild(next, node);
      // Verify: expected boundary must exist after patch.
      var ok = false;
      try { ok = !!document.querySelector('[data-acrx-id="' + CSS.escape(target) + '"]'); } catch (_) { ok = true; }
      if (!ok) {
        rollback(next, snap);
        next = document.querySelector('[data-acrx-id="' + CSS.escape(target) + '"]');
        if (!next) return false;
      }
      try { if (scroll && next) { next.scrollTop = scroll.top; next.scrollLeft = scroll.left; } } catch (_) {}
      try { if (next) restoreDetailsMedia(next.parentNode || document, dm); } catch (_) {}
      reinitTabs(next.parentNode || document);
      restoreFocus(cap);
      committed.set(target, generation || lastRev);
      stats.patched++;
      dbg('PATCH-OK', target, 'generation=' + (generation || lastRev));
      return true;
    } catch (_) {
      try { rollback(node.isConnected ? node : null, snap); } catch (_) {}
      stats.errors++;
      return false;
    }
  }

  async function onInvalidation(inv) {
    var verdict = decide(inv);
    dbg('SSE-EVENT', 'v=' + (inv && inv.v), 'strategy=' + ((inv && inv.strategy) || 'n/a'), 'verdict=' + verdict.action, verdict.reason || '');
    if (verdict.action === 'drop') { stats.skipped++; return; }
    if (verdict.action === 'reload') {
      // Server restarted or explicit full-reload — resync / mark stale,
      // never location.reload() automatically.
      if (inv && inv.bootId && bootId && inv.bootId !== bootId) {
        log('boot changed, resync');
        sync();
        return;
      }
      log('full-reload required:', (inv && inv.reason) || verdict.reason);
      document.documentElement.setAttribute('data-acrx-stale', (inv && inv.reason) || verdict.reason || 'full-reload');
      if (inv && typeof inv.v === 'number') lastRev = Math.max(lastRev, inv.v);
      return;
    }
    lastRev = inv.v;
    if (inv.bootId) bootId = inv.bootId;
    stats.invalidations++;

    var strategy = inv.strategy || '';
    if (strategy === 'stylesheet-refresh' || inv.scope === 'stylesheet') {
      refreshCss(inv.v);
      return;
    }
    if (strategy === 'full-reload') {
      // Explicit, observable, limited: mark stale, never location.reload().
      log('full-reload required:', inv.reason);
      document.documentElement.setAttribute('data-acrx-stale', inv.reason || 'full-reload');
      return;
    }
    var mine = (inv.targets || []).filter(function (t) {
      try { return !!document.querySelector('[data-acrx-id="' + CSS.escape(t) + '"]'); } catch (_) { return false; }
    }).slice(0, 5);
    for (var i = 0; i < mine.length; i++) {
      try { pendingGen.set(mine[i], inv.v); } catch (_) {}
      var payload = await fetchFragment(mine[i], inv.v);
      if (payload) patchTarget(mine[i], payload);
    }
  }

  // A new server generation restarts revision numbering: old per-target
  // generations are incomparable, so the whole generation space resets
  // (maps cleared, DOM stamps stripped) before re-patching current state.
  function resetGenerationSpace() {
    try { committed.clear(); } catch (_) {}
    try { pendingGen.clear(); } catch (_) {}
    try {
      document.querySelectorAll('[data-acrx-generation]').forEach(function (n) {
        try { n.removeAttribute('data-acrx-generation'); } catch (_) {}
      });
      document.querySelectorAll('[data-acrx-rev]').forEach(function (n) {
        try { n.removeAttribute('data-acrx-rev'); } catch (_) {}
      });
    } catch (_) {}
  }

  // Pull current server state for every on-page target (bounded) and patch.
  // Used when invalidation history cannot cover the gap (restart, overflow):
  // re-fetching current state beats replaying missed deltas, and never
  // requires a page reload. Returns patched count.
  async function resyncTargets() {
    var ids = pageTargets().slice(0, 5);
    var patched = 0;
    for (var i = 0; i < ids.length; i++) {
      try { pendingGen.set(ids[i], lastRev); } catch (_) {}
      var payload = await fetchFragment(ids[i], lastRev);
      if (payload && patchTarget(ids[i], payload)) patched++;
    }
    return patched;
  }

  async function ping() {
    try {
      var res = await fetch('/acr/api/runtime/ping', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      var data = await res.json();
      if (data && typeof data.rev === 'number') {
        // New server generation: never just adopt its cursor (that would
        // silently skip everything it rendered) — resync content instead.
        if (data.bootId && bootId && data.bootId !== bootId) { sync(); return; }
        if (data.rev < lastRev) return; // older ping, ignore
        lastRev = data.rev;
        if (data.bootId) bootId = data.bootId;
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
        // Server restarted under this tab: adopt the new generation and
        // pull fresh content immediately. No reload, no refresh demand —
        // patch what exists; stay silent when there is nothing actionable.
        dbg('RESYNC', 'boot-change', (bootId || '?') + ' -> ' + data.bootId);
        bootId = data.bootId;
        lastRev = data.rev || 0;
        resetGenerationSpace();
        try { document.documentElement.removeAttribute('data-acrx-stale'); } catch (_) {}
        var nBoot = await resyncTargets();
        dbg('RESYNC-OK', 'repatched ' + nBoot + ' target(s)');
        return;
      }
      if (data.bootId) bootId = data.bootId;
      var missed = data.missed || [];
      if (data.needsFull) {
        dbg('RESYNC', 'history-overflow, re-pulling current state');
        lastRev = data.rev || 0;
        resetGenerationSpace();
        var nFull = await resyncTargets();
        dbg('RESYNC-OK', 'repatched ' + nFull + ' target(s)');
        return;
      }
      for (var i = 0; i < missed.length; i++) {
        await onInvalidation(Object.assign({ strategy: null }, missed[i]));
      }
      lastRev = Math.max(lastRev, data.rev || 0);
    } catch (_) {}
  }

  function startPollFallback() {
    // Transport fallback: no EventSource (or repeated SSE failure) →
    // poll sync прояві. Polling is resync, not streaming: 15s cadence.
    if (pollTimer) return;
    try {
      pollTimer = setInterval(function () {
        if (!document.hidden) sync();
      }, 15000);
    } catch (_) {}
  }

  function connect() {
    if (typeof EventSource === 'undefined') { dbg('SSE-CONN', 'no EventSource, poll fallback'); startPollFallback(); sync(); return; }
    if (es) { try { es.close(); } catch (_) {} es = null; }
    try {
      es = new EventSource('/acr/api/runtime/sse');
      dbg('SSE-CONN', 'connecting /acr/api/runtime/sse');
      es.addEventListener('runtime.invalidated', function (e) {
        backoff = 1000;
        try { onInvalidation(JSON.parse(e.data)); } catch (_) {}
      });
      es.addEventListener('connected', function (e) {
        backoff = 1000;
        try { dbg('SSE-CONN', 'connected', (e && e.data) || ''); } catch (_) {}
      });
      es.onerror = function () {
        try { es.close(); } catch (_) {} es = null;
        // Exponential backoff + visibility awareness (no server hammering).
        if (document.hidden) {
          document.addEventListener('visibilitychange', function h() {
            if (!document.hidden) { document.removeEventListener('visibilitychange', h); sync().then(connect); }
          });
          return;
        }
        setTimeout(function () {
          backoff = Math.min(backoff * 2, maxBackoff);
          sync().then(connect);
        }, backoff);
      };
    } catch (_) {}
  }

  function safeStaleMessage(reason) {
    var r = String(reason || '');
    if (/stylesheet|css/i.test(r)) return 'Styles updated — refreshing appearance.';
    if (/extension/i.test(r)) return 'A site feature was updated.';
    if (/resync|overflow|boot/i.test(r)) return 'Syncing the latest content.';
    return 'New content is available.';
  }

  function showStaleBanner(reason) {
    try {
      if (document.getElementById('acrx-stale-banner')) return;
      var bar = document.createElement('div');
      bar.id = 'acrx-stale-banner';
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      bar.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;max-width:min(360px,calc(100vw - 24px));background:#111;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:10px 12px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;';
      var msg = document.createElement('span');
      msg.textContent = safeStaleMessage(reason);
      var btn = document.createElement('button');
      btn.textContent = 'Refresh';
      btn.setAttribute('aria-label', 'Refresh to load the latest content');
      btn.style.cssText = 'background:#fff;color:#111;border:0;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;';
      btn.addEventListener('click', function () { try { window.location.reload(); } catch (_) {} });
      var x = document.createElement('button');
      x.textContent = '×';
      x.setAttribute('aria-label', 'Dismiss');
      x.style.cssText = 'background:transparent;color:#fff;border:0;font-size:16px;cursor:pointer;padding:4px 6px;';
      x.addEventListener('click', function () { try { bar.remove(); } catch (_) {} });
      bar.appendChild(msg);
      bar.appendChild(btn);
      bar.appendChild(x);
      document.body.appendChild(bar);
    } catch (_) {}
  }

  var _observeStale = null;
  try {
    _observeStale = new MutationObserver(function () {
      try {
        var r = document.documentElement.getAttribute('data-acrx-stale');
        if (r) showStaleBanner(r);
      } catch (_) {}
    });
    _observeStale.observe(document.documentElement, { attributes: true, attributeFilter: ['data-acrx-stale'] });
  } catch (_) {}

  function diagnose() {
    // Visitor-safe summary: counts + stale state only. Never paths/stacks.
    return {
      rev: lastRev, connected: !!es || !!pollTimer,
      stale: document.documentElement.getAttribute('data-acrx-stale') || null,
      stats: { invalidations: stats.invalidations, patched: stats.patched, skipped: stats.skipped, errors: stats.errors },
    };
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { ping().then(sync); }
  });
  window.addEventListener('online', function () { sync().then(connect); });
  window.addEventListener('beforeunload', function () { try { es && es.close(); } catch (_) {} try { if (pollTimer) clearInterval(pollTimer); } catch (_) {} });

  dbg('BOOT', 'visitor runtime v2, targets on page: ' + pageTargets().length);
  ping().then(function () { connect(); });

  window.AcroxaRuntime = {
    __v: 2,
    ping: ping,
    sync: sync,
    diagnose: diagnose,
    stats: function () { return Object.assign({ rev: lastRev, bootId: bootId }, stats); },
  };
})();
