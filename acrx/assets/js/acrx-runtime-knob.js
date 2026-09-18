// acrx/assets/js/acrx-runtime-knob.js — AcroxaJS floating runtime panel (v1).
// Bottom-left dot → diagnostics panel for authed admins (admin always,
// including production). Every number comes from live endpoints or local
// runtime stats; empty states say so. Hides itself when unauthenticated.
//
// Feeds (all real): GET /acr/api/system/runtime (5s poll), GET
// /acr/api/runtime/capabilities (on open), GET /acr/api/system/logs/history
// (while open), acrx:update window events, AcroxaAdminRuntime / AcroxaApi /
// AcroxaHydration stats. No fake metrics, no simulated data.

(function RuntimeKnob() {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.AcroxaRuntimeKnob && window.AcroxaRuntimeKnob.__v === 1) return;
  if (!window.fetch || !window.EventSource) return;

  var POLL_MS = 5000;
  var LOG_POLL_MS = 3000;
  var MAX_LOG_ROWS = 200;

  var state = {
    authed: false,
    snapshot: null,
    capabilities: null,
    logs: [],
    updates: [], // last 50 acrx:update events (update trace)
    connected: false, // runtime SSE seen via admin runtime? tracked via snapshot rev changes
    lastFetchMs: null,
    errors: 0,
    open: false,
    tab: 'overview',
    logFilter: 'all',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtTime(ts) {
    try { return new Date(ts).toLocaleTimeString(); } catch (_) { return ''; }
  }

  function fmtUptime(ms) {
    if (ms == null) return '—';
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + 'h ' : '') + m + 'm ' + (s % 60) + 's';
  }

  function css() {
    return '' +
    '@media (prefers-reduced-motion: reduce){#acrx-knob-dot,#acrx-knob-dot:hover,#acrx-knob-panel.open{transition:none !important;animation:none !important;transform:none !important}}' +
    '@media (max-width: 640px){#acrx-knob-panel{left:8px !important;right:8px;width:auto !important;max-width:none !important}}' +
    '#acrx-knob{position:fixed;left:14px;bottom:14px;z-index:2147483000;font-family:"Outfit",Inter,system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '#acrx-knob-dot{position:relative;width:40px;height:40px;border-radius:9999px;background:var(--color-primary-100,#f4f4f4);border:1px solid var(--border,#e0e0e0);box-shadow:var(--shadow-lg,0 10px 20px rgba(0,0,0,.15));cursor:pointer;padding:0;display:grid;place-items:center;transition:transform .3s cubic-bezier(.34,1.56,.04,1),box-shadow .3s,border-color .3s}' +
    '#acrx-knob-dot:hover{transform:translateY(-2px);background:var(--color-primary-200,#eee);border-color:var(--accent-200,#adcbd7)}' +
    '#acrx-knob-dot:active{transform:translateY(0) scale(.96)}' +
    '#acrx-knob-dot img{width:24px;height:24px;display:block;pointer-events:none}' +
    '#acrx-knob-dot .acrx-knob-status{position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;background:var(--color-success,#16a34a);border:2px solid var(--color-primary-100,#f4f4f4)}' +
    '#acrx-knob-dot.amber .acrx-knob-status{background:var(--color-warning,#ca8a04)}' +
    '#acrx-knob-dot.red .acrx-knob-status{background:var(--color-danger,#dc2626)}' +
    '#acrx-knob-panel{position:fixed;left:14px;bottom:62px;width:400px;max-width:calc(100vw - 28px);max-height:min(580px,calc(100vh - 90px));display:none;flex-direction:column;z-index:2147483000;background:var(--bg-color,#fff);color:var(--text-color,#111);border:1px solid var(--border,#e0e0e0);border-radius:var(--radius-modal,20px);box-shadow:var(--shadow-xl,0 8px 25px rgba(0,0,0,.2));font-size:12px;overflow:hidden;backdrop-filter:blur(72px) saturate(1.2);-webkit-backdrop-filter:blur(72px) saturate(1.2)}' +
    '#acrx-knob-panel.open{display:flex;animation:acrxKnobIn .3s cubic-bezier(.34,1.56,.04,1)}' +
    '@keyframes acrxKnobIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}' +
    '#acrx-knob-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border,#e0e0e0);background:var(--bg-surface,var(--color-primary-100,#f9f9f9));font-weight:700;font-size:13px;letter-spacing:.3px}' +
    '#acrx-knob-head img.acrx-knob-logo{width:22px;height:22px;display:block}' +
    '#acrx-knob-head .dot{width:8px;height:8px;border-radius:50%;background:var(--color-success,#16a34a);flex:none}' +
    '#acrx-knob-head .dot.amber{background:var(--color-warning,#ca8a04)}#acrx-knob-head .dot.red{background:var(--color-danger,#dc2626)}' +
    '#acrx-knob-head .acrx-knob-ver{font-weight:600;font-size:10px;color:var(--text-muted,#666);border:1px solid var(--border,#e0e0e0);background:var(--color-primary-200,#eee);padding:2px 8px;border-radius:9999px;letter-spacing:.4px}' +
    '#acrx-knob-x{margin-left:auto;width:28px;height:28px;border-radius:50%;background:var(--color-primary-200,#eee);border:1px solid var(--border,#e0e0e0);color:var(--color-primary-700,#444);cursor:pointer;font-size:15px;line-height:1;display:grid;place-items:center;transition:all .2s cubic-bezier(.34,1.56,.04,1)}' +
    '#acrx-knob-x:hover{background:var(--color-primary-300,#ddd)}' +
    '#acrx-knob-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px;border-bottom:1px solid var(--border,#e0e0e0)}' +
    '#acrx-knob-tabs button{background:transparent;border:1px solid transparent;color:var(--text-muted,#666);cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;padding:5px 10px;border-radius:9999px;transition:all .2s cubic-bezier(.34,1.56,.04,1)}' +
    '#acrx-knob-tabs button:hover{background:var(--color-primary-200,#eee);color:var(--text-color,#111)}' +
    '#acrx-knob-tabs button.on{background:var(--color-primary-900,#111);color:var(--color-primary-50,#fff);border-color:var(--color-primary-900,#111)}' +
    '#acrx-knob-body{padding:10px 12px;overflow:auto;min-height:120px;scrollbar-width:thin;scrollbar-color:var(--scrollbar-thumb,#999) transparent}' +
    '#acrx-knob-body::-webkit-scrollbar{width:6px}#acrx-knob-body::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb,#ccc);border-radius:99px}' +
    '#acrx-knob-body table{width:100%;border-collapse:collapse}' +
    '#acrx-knob-body td{padding:5px 4px;border-bottom:1px solid var(--border,#e0e0e0);vertical-align:top;color:var(--text-color,#111)}' +
    '#acrx-knob-body td.k{color:var(--text-muted,#666);width:44%;font-weight:600}' +
    '#acrx-knob-body .row{padding:6px 8px;border:1px solid var(--border,#e0e0e0);background:var(--bg-surface,var(--color-primary-100,#f9f9f9));border-radius:8px;margin-bottom:6px;font-family:var(--font-mono,"Fira Code",ui-monospace,monospace);font-size:11px;word-break:break-word;color:var(--text-color,#111)}' +
    '#acrx-knob-body .t{color:var(--text-muted,#666);margin-right:6px}' +
    '#acrx-knob-body .warn{color:var(--color-warning,#ca8a04)}#acrx-knob-body .err{color:var(--color-danger,#dc2626)}#acrx-knob-body .ok{color:var(--color-success,#16a34a)}' +
    '#acrx-knob-body .empty{color:var(--text-muted,#666);padding:14px 4px;text-align:center;font-size:12px}' +
    '#acrx-knob-foot{padding:8px 14px;border-top:1px solid var(--border,#e0e0e0);background:var(--bg-surface,var(--color-primary-100,#f9f9f9));color:var(--text-muted,#666);font-size:11px}';
  }

  var els = {};

  function mount() {
    var st = document.createElement('style');
    st.textContent = css();
    document.head.appendChild(st);
    var wrap = document.createElement('div');
    wrap.id = 'acrx-knob';
    wrap.innerHTML = '<button id="acrx-knob-dot" title="AcroxaJS runtime" aria-label="AcroxaJS runtime"><img src="/acrx/assets/images/icon.svg" alt="Acroxa" draggable="false"><span class="acrx-knob-status"></span></button>' +
      '<div id="acrx-knob-panel" role="dialog" aria-label="AcroxaJS runtime">' +
      '<div id="acrx-knob-head"><img class="acrx-knob-logo" src="/acrx/assets/images/icon.svg" alt="Acroxa" draggable="false"><span>AcroxaJS runtime</span><span class="acrx-knob-ver">live</span><span class="dot"></span><button id="acrx-knob-x" aria-label="Close">×</button></div>' +
      '<div id="acrx-knob-tabs"></div>' +
      '<div id="acrx-knob-body"></div>' +
      '<div id="acrx-knob-foot"></div></div>';
    document.body.appendChild(wrap);
    els.dot = wrap.querySelector('#acrx-knob-dot');
    els.panel = wrap.querySelector('#acrx-knob-panel');
    els.headDot = wrap.querySelector('#acrx-knob-head .dot');
    els.tabs = wrap.querySelector('#acrx-knob-tabs');
    els.body = wrap.querySelector('#acrx-knob-body');
    els.foot = wrap.querySelector('#acrx-knob-foot');
    els.dot.addEventListener('click', function () { setOpen(!state.open); });
    try { els.dot.setAttribute('aria-expanded', 'false'); els.dot.setAttribute('aria-haspopup', 'dialog'); } catch (_) {}
    wrap.querySelector('#acrx-knob-x').addEventListener('click', function () { setOpen(false); });
    ['overview', 'patches', 'extensions', 'logs', 'warnings', 'errors', 'modules', 'views', 'hooks', 'targets', 'network', 'updates', 'performance', 'runtime'].forEach(function (t) {
      var b = document.createElement('button');
      b.textContent = t[0].toUpperCase() + t.slice(1);
      b.setAttribute('data-tab', t);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', t + ' panel');
      b.addEventListener('click', function () { state.tab = t; render(); });
      els.tabs.appendChild(b);
    });
    try { els.tabs.setAttribute('role', 'tablist'); els.tabs.setAttribute('aria-label', 'Runtime panels'); } catch (_) {}
    // Keyboard + screen-reader: Esc closes, focus returns to the dot,
    // status changes announced via a polite live region.
    try {
      document.addEventListener('keydown', function (e) {
        if (!state.open) return;
        if (e.key === 'Escape') { setOpen(false); try { els.dot.focus(); } catch (_) {} }
      });
      var live = document.createElement('div');
      live.id = 'acrx-knob-live';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('role', 'status');
      live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
      wrap.appendChild(live);
      els.live = live;
    } catch (_) {}
  }

  function unmount() {
    try { var n = document.getElementById('acrx-knob'); if (n) n.remove(); } catch (_) {}
  }

  var _lastFocus = null;
  function setOpen(open) {
    state.open = !!open;
    if (els.panel) els.panel.classList.toggle('open', state.open);
    try { if (els.dot) els.dot.setAttribute('aria-expanded', state.open ? 'true' : 'false'); } catch (_) {}
    if (state.open) {
      try { _lastFocus = document.activeElement; } catch (_) { _lastFocus = null; }
      refreshCapabilities(); refreshLogs(); render();
      try {
        var x = els.panel && els.panel.querySelector('#acrx-knob-x');
        if (x) x.focus({ preventScroll: true });
      } catch (_) {}
    } else if (_lastFocus && _lastFocus.focus) {
      try { _lastFocus.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  function status() {
    // green: synced · amber: stale/deferred/reconnecting · red: errors/disconnected
    try {
      if (!state.snapshot) return '';
      var stale = false;
      try {
        if (window.AcroxaAdminRuntime) {
          var s = window.AcroxaAdminRuntime.stats();
          if (s && s.stale) stale = true;
        }
      } catch (_) {}
      if (state.errors > 0) return 'red';
      if (stale) return 'amber';
      return '';
    } catch (_) { return ''; }
  }

  async function api(path) {
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    var res = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json' } });
    var ms = (window.performance && performance.now) ? Math.round(performance.now() - t0) : null;
    if (res.status === 401) { var e = new Error('unauthorized'); e.code = 401; throw e; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return { data: await res.json(), ms: ms };
  }

  async function refreshSnapshot() {
    try {
      var r = await api('/acr/api/system/runtime');
      state.snapshot = r.data;
      state.lastFetchMs = r.ms;
      state.connected = true;
      state.errors = 0;
    } catch (e) {
      if (e && e.code === 401) { unmount(); stop(); return; }
      state.errors++;
      state.connected = false;
    }
    paintDot();
    if (state.open) render();
  }

  async function refreshCapabilities() {
    try {
      var r = await api('/acr/api/runtime/capabilities');
      state.capabilities = r.data;
    } catch (_) {}
  }

  async function refreshLogs() {
    if (!state.open) return;
    try {
      var r = await api('/acr/api/system/logs/history?limit=200');
      if (r.data && r.data.success) state.logs = r.data.entries || [];
    } catch (_) {}
  }

  function paintDot() {
    var c = status();
    if (els.dot) els.dot.className = c;
    if (els.headDot) els.headDot.className = 'dot ' + c;
  }

  function kv(rows) {
    if (!rows.length) return '<div class="empty">No data.</div>';
    return '<table>' + rows.map(function (r) {
      return '<tr><td class="k">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>';
    }).join('') + '</table>';
  }

  function logRows(filter) {
    var rows = state.logs.filter(function (e) {
      if (filter === 'warnings') return e.type === 'warn';
      if (filter === 'errors') return e.type === 'error' || e.type === 'uncaughtException' || e.type === 'unhandledRejection';
      return true;
    }).slice(0, MAX_LOG_ROWS);
    if (!rows.length) return '<div class="empty">No ' + (filter === 'all' ? 'logs' : filter) + ' recorded.</div>';
    return rows.map(function (e) {
      var cls = (e.type === 'warn') ? 'warn' : ((e.type === 'error' || e.type === 'uncaughtException' || e.type === 'unhandledRejection') ? 'err' : '');
      var msg = (e.message || []).join(' ');
      if (msg.length > 500) msg = msg.slice(0, 500) + '…';
      return '<div class="row"><span class="t">' + esc(fmtTime(e.timestamp)) + '</span><span class="' + cls + '">' + esc(e.type) + '</span> ' + esc(msg) + '</div>';
    }).join('');
  }

  function render() {
    if (!state.open || !els.body) return;
    Array.prototype.forEach.call(els.tabs.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === state.tab);
    });
    var s = state.snapshot || {};
    var html = '';
    if (state.tab === 'overview') {
      var admin = null;
      try { admin = window.AcroxaAdminRuntime ? window.AcroxaAdminRuntime.stats() : null; } catch (_) {}
      html = kv([
        ['Connected', state.connected ? 'yes' : 'no'],
        ['Server rev / generation', s.revision ? String(s.revision.rev) : '—'],
        ['Client rev', admin ? String(admin.rev) : '—'],
        ['Content version', admin && admin.contentVersion != null ? String(admin.contentVersion) : '—'],
        ['Boot', s.revision ? String(s.revision.bootId || '—') : '—'],
        ['Stale', admin && admin.stale ? String(admin.stale) : 'no'],
        ['Swaps', admin ? String(admin.swaps) : '—'],
        ['Op patches', admin && admin.ops != null ? String(admin.ops) : '—'],
        ['Deferred', admin ? String(admin.deferred) : '—'],
        ['SSE connections', s.sse ? String(s.sse.connections) : '—'],
        ['Targets (server)', s.targets ? String(s.targets.targets) : '—'],
        ['Snapshots', s.snapshots ? (s.snapshots.pages + ' pages / ' + s.snapshots.versions + ' versions') : '—'],
        ['Extensions', s.extensions ? (s.extensions.enabled + '/' + s.extensions.total + ' enabled') : '—'],
        ['Conflicts', s.extensions ? String(s.extensions.conflicts) : '—'],
      ]);
    } else if (state.tab === 'patches') {
      // Patch debugger (Phase 10): op-level detail from real runtime data —
      // target/op/before/after/version/duration. No mock data, honest empties.
      var updates = state.updates || [];
      var patched = updates.filter(function (u) { return u.detail && u.detail.opList && u.detail.opList.length; });
      if (!patched.length) {
        html = '<div class="empty">No op-level patches yet — they appear when the server diffs a changed region into operations.</div>';
      } else {
        html = patched.slice(0, 12).map(function (u) {
          var d = u.detail;
          var rows = (d.opList || []).slice(0, 12).map(function (o) {
            var parts = ['<span class="t">' + esc(o.op || '?') + '</span> ' + esc(o.target || '—')];
            if (o.name) parts.push('<span class="t">' + esc(o.name) + '</span>');
            if (o.before) parts.push('<span class="t">before:</span> ' + esc(o.before));
            if (o.after) parts.push('<span class="t">after:</span> ' + esc(o.after));
            return '<div class="row">' + parts.join(' ') + (o.ok === false ? ' <span class="err">failed</span>' : '') + '</div>';
          }).join('');
          return '<div style="margin-bottom:10px">' + kv([
            ['Patch rev', String(d.rev || '—')],
            ['Operations', String(d.ops || 0)],
            ['Duration', d.ms != null ? d.ms + 'ms' : '—'],
          ]) + rows + '</div>';
        }).join('');
      }
    } else if (state.tab === 'extensions') {
      var ext = s.extensions || null;
      var list = [];
      try {
        var cap = state.capabilities || {};
        var reg = cap.registry || {};
        list = Object.keys(reg.byOwner || {}).filter(function (k) { return k.indexOf('extension:') === 0; });
      } catch (_) {}
      html = kv([
        ['Enabled', ext ? String(ext.enabled) + '/' + String(ext.total) : '—'],
        ['Conflicts', ext ? String(ext.conflicts) : '—'],
      ]);
      var conflicts = s.conflicts || [];
      if (conflicts.length) {
        html += conflicts.slice(0, 10).map(function (c) {
          return '<div class="row"><span class="warn">conflict</span> ' + esc(c.a) + ' ↔ ' + esc(c.b) +
            '<br><span class="t">' + esc(c.reason || '') + '</span></div>';
        }).join('');
      } else {
        html += '<div class="empty">No extension conflicts detected.</div>';
      }
      if (list.length) html += kv(list.map(function (k) { return [k, 'registered']; }));
    } else if (state.tab === 'logs') {
      html = logRows('all');
    } else if (state.tab === 'warnings') {
      html = logRows('warnings');
    } else if (state.tab === 'errors') {
      html = logRows('errors');
    } else if (state.tab === 'modules') {
      var reg = (s.registry && s.registry.byType) || {};
      html = kv(Object.keys(reg).sort().map(function (k) { return ['Module type: ' + k, String(reg[k])]; }));
    } else if (state.tab === 'views') {
      var owners = (s.registry && s.registry.byOwner) || {};
      html = kv(Object.keys(owners).sort().map(function (k) { return ['Owner: ' + k, String(owners[k])]; }));
    } else if (state.tab === 'hooks') {
      var byHook = (s.hooks && s.hooks.byHook) || {};
      var names = Object.keys(byHook).sort();
      html = names.length ? kv(names.map(function (k) { return [k, String(byHook[k])]; })) : '<div class="empty">No hooks registered.</div>';
    } else if (state.tab === 'targets') {
      html = kv([
        ['Server targets', s.targets ? String(s.targets.targets) : '—'],
        ['Graph resources', s.graph ? String(s.graph.resources) : '—'],
        ['Graph edges', s.graph ? String(s.graph.edges) : '—'],
      ]);
    } else if (state.tab === 'network') {
      var ac = null, hy = null;
      try { ac = window.AcroxaApi ? window.AcroxaApi.getStats() : null; } catch (_) {}
      try { hy = window.AcroxaHydration ? window.AcroxaHydration.getStats() : null; } catch (_) {}
      html = kv([
        ['Snapshot fetch', state.lastFetchMs == null ? '—' : state.lastFetchMs + ' ms'],
        ['API requests', ac ? String(ac.requests) : '—'],
        ['API cache hits', ac ? String(ac.hits) : '—'],
        ['API deduped', ac ? String(ac.deduped) : '—'],
        ['Hydrated live', hy ? String(hy.live) : '—'],
        ['Hydration errors', hy ? String(hy.errors) : '—'],
      ]);
    } else if (state.tab === 'updates') {
      if (!state.updates.length) html = '<div class="empty">No updates observed yet.</div>';
      else html = state.updates.slice().reverse().slice(0, 50).map(function (u) {
        return '<div class="row"><span class="t">' + esc(fmtTime(u.at)) + '</span>' + esc(u.status) +
          (u.rev != null ? ' rev ' + esc(String(u.rev)) : '') +
          (u.ms != null ? ' ' + esc(String(u.ms)) + 'ms' : '') +
          (u.reason ? ' <span class="warn">' + esc(u.reason) + '</span>' : '') + '</div>';
      }).join('');
    } else if (state.tab === 'performance') {
      var samples = state.updates.filter(function (u) { return u.status === 'swapped' && u.ms != null; }).slice(-20);
      var avg = samples.length ? Math.round(samples.reduce(function (a, u) { return a + u.ms; }, 0) / samples.length) : null;
      var rows = [
        ['Snapshot fetch', state.lastFetchMs == null ? '—' : state.lastFetchMs + ' ms'],
        ['Swaps measured', String(samples.length)],
        ['Avg swap', avg == null ? '—' : avg + ' ms'],
        ['Last swap', samples.length ? samples[samples.length - 1].ms + ' ms' : '—'],
      ];
      // Real server timings (performance.now aggregates, never fake).
      try {
        var stages = (s.perf && s.perf.stages) || {};
        Object.keys(stages).sort().slice(0, 8).forEach(function (k) {
          var st = stages[k] || {};
          rows.push(['srv ' + k, 'avg ' + (st.avgMs != null ? st.avgMs : '—') + 'ms · max ' + (st.maxMs != null ? st.maxMs : '—') + 'ms · n=' + (st.count != null ? st.count : 0)]);
        });
      } catch (_) {}
      html = kv(rows) + '<div class="empty">Timings measured locally with performance.now(). No data means no swaps yet.</div>';
    } else if (state.tab === 'runtime') {
      html = kv([
        ['Uptime', fmtUptime(s.uptimeMs)],
        ['Revision', s.revision ? String(s.revision.rev) : '—'],
        ['Last change', s.revision && s.revision.last ? (s.revision.last.reason + ' @ rev ' + s.revision.last.rev) : '—'],
        ['Layout', s.layout ? String(s.layout.active || '—') : '—'],
        ['Maintenance', 'see /acrx/settings'],
      ]);
    }
    els.body.innerHTML = html;
    try {
      els.foot.textContent = 'rev ' + (s.revision ? s.revision.rev : '—') + ' · updated ' + new Date().toLocaleTimeString();
    } catch (_) {}
  }

  var timers = [];

  function poll() {
    refreshSnapshot();
    timers.push(setInterval(function () {
      if (document.hidden) return;
      refreshSnapshot();
    }, POLL_MS));
    timers.push(setInterval(function () {
      if (document.hidden || !state.open) return;
      refreshLogs().then(render);
    }, LOG_POLL_MS));
  }

  function stop() {
    timers.forEach(clearInterval);
    timers = [];
    try { window.removeEventListener('acrx:update', onUpdate); } catch (_) {}
  }

  function onUpdate(e) {
    try {
      var d = (e && e.detail) || {};
      // Keep the full detail reference — the patches tab reads opList from
      // it (patch debugger, Phase 10).
      state.updates.push({ status: d.status, rev: d.rev != null ? d.rev : null, ms: d.ms != null ? d.ms : null, reason: d.reason || null, at: d.at || Date.now(), detail: d });
      if (state.updates.length > 50) state.updates.splice(0, state.updates.length - 50);
      paintDot();
      try {
        if (els.live) els.live.textContent = 'Runtime ' + d.status + (d.rev != null ? ' rev ' + d.rev : '');
      } catch (_) {}
      if (state.open && (state.tab === 'updates' || state.tab === 'patches')) render();
    } catch (_) {}
  }

  async function boot() {
    // Auth probe: unauthenticated pages (login) get 401 → stay hidden, no noise.
    try {
      var res = await fetch('/acr/api/system/runtime', { credentials: 'include', headers: { Accept: 'application/json' } });
      if (res.status === 401 || res.status === 403) return;
      if (!res.ok) return;
      state.snapshot = await res.json();
      state.authed = true;
      state.connected = true;
    } catch (_) { return; }
    mount();
    window.addEventListener('acrx:update', onUpdate);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', poll, { once: true });
    } else {
      poll();
    }
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.AcroxaRuntimeKnob = { __v: 1 };
})();
