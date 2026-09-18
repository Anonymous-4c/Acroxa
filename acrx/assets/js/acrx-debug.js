// acrx/assets/js/acrx-debug.js — shared staged-debug for AcroxaJS browser files.
// Load FIRST (before hydration/dom-patch/targeted/admin-runtime/knob).
// Every runtime file logs via window.acrxDbg('<STAGE>', ...details), which is
// a no-op unless debugging is on. Enable: ?acrx_debug=1 (persisted to
// localStorage), window.__ACRX_DEBUG__ = true, or AcroxaDebug.enable().
// Disable: ?acrx_debug=0 or AcroxaDebug.disable().
// Filter: AcroxaDebug.only('SSE', 'PATCH') — substring match on stage.

(function AcroxaDebugBoot() {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.AcroxaDebug && window.AcroxaDebug.__v === 1) return;

  var on = false;
  var only = [];
  try {
    if (window.__ACRX_DEBUG__ === true) on = true;
    var q = null;
    try { q = new URLSearchParams(window.location.search || ''); } catch (_) { q = null; }
    if (q && q.get('acrx_debug') === '1') {
      on = true;
      try { window.localStorage.setItem('acrx_debug', '1'); } catch (_) {}
    } else if (q && q.get('acrx_debug') === '0') {
      on = false;
      try { window.localStorage.setItem('acrx_debug', '0'); } catch (_) {}
    } else {
      try { on = window.localStorage.getItem('acrx_debug') === '1'; } catch (_) {}
    }
  } catch (_) {}

  function enabled(stage) {
    if (!on) return false;
    if (!only.length) return true;
    var s = String(stage || '').toUpperCase();
    for (var i = 0; i < only.length; i++) {
      if (s.indexOf(only[i]) !== -1) return true;
    }
    return false;
  }

  function colorFor(stage) {
    var s = String(stage || '').toUpperCase();
    if (/FAIL|ERROR|VERIFY-FAIL|ROLLBACK|RELOAD/.test(s)) return 'color:#dc2626;font-weight:bold';
    if (/DROP|SKIP|STALE|DEFER|GUARD/.test(s)) return 'color:#b45309;font-weight:bold';
    if (/PATCH|SWAP|APPLY|COMMIT|HYDRATE/.test(s)) return 'color:#15803d;font-weight:bold';
    return 'color:#0284c7;font-weight:bold';
  }

  function dbg(stage) {
    try {
      if (!enabled(stage)) return;
      var args = ['%c[Acroxa:' + stage + ']', colorFor(stage)];
      for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
      (console.log || console.info).apply(console, args);
    } catch (_) {}
  }

  window.AcroxaDebug = {
    __v: 1,
    on: function (stage) { return enabled(stage === undefined ? '' : stage); },
    enabled: function () { return on; },
    enable: function () { on = true; try { window.localStorage.setItem('acrx_debug', '1'); } catch (_) {} },
    disable: function () { on = false; try { window.localStorage.setItem('acrx_debug', '0'); } catch (_) {} },
    only: function () {
      only = [];
      for (var i = 0; i < arguments.length; i++) {
        if (arguments[i]) only.push(String(arguments[i]).toUpperCase());
      }
    },
  };
  window.acrxDbg = dbg;
})();
