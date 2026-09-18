// acrx/assets/js/acrx-hooks.js — AcroxaJS client hook bus (v1).
// Ordered, scoped, disposable lifecycle hooks for the browser runtime.
// Mirrors the server hookBus contract (priority + error isolation) adapted
// for DOM/lifecycle hooks, which communicate through a MUTABLE context
// object rather than filter return values (except `false` = cancel).
//
//   var dispose = AcroxaHooks.on("boundary:mount", function (ctx) { ... });
//   AcroxaHooks.run("dom:before-patch", { target: el });       // sync
//   await AcroxaHooks.runAsync("update:before", { rev: 12 });  // ordered await
//
// Semantics:
// - priority: lower runs first (default 10; core internals use 0).
// - cancellable hooks (navigation:before, dom:before-patch,
//   boundary:before-update, update:before): a listener returning exactly
//   false stops the chain with { cancelled: true }.
// - async listeners inside sync run() are skipped with a warning (use
//   runAsync). Failures are isolated: recorded + logged, chain continues.
// - every on() returns a disposer; clear(scope) removes a whole owner.
// - no fake data: stats/list/failed reflect only real registrations.

(function HooksModule() {
  'use strict';

  var seq = 0;
  var hooks = {}; // name -> Array<{id, cb, priority, scope, once}>
  var stats = { fired: 0, failed: 0 };
  var failed = []; // last 20 { hook, scope, message, at }
  var warnedAsync = {};

  var CANCELLABLE = {
    'navigation:before': true,
    'dom:before-patch': true,
    'boundary:before-update': true,
    'update:before': true
  };

  function normalize(name) {
    if (typeof name !== 'string' || name.indexOf(':') === -1 || !name.trim()) {
      throw new Error('[AcroxaHooks] hook name must be "domain:action", got "' + name + '"');
    }
    return name.trim();
  }

  function sort(name) {
    var arr = hooks[name];
    if (arr) arr.sort(function (a, b) { return (a.priority - b.priority) || (a.id - b.id); });
  }

  function on(name, cb, opts) {
    var n = normalize(name);
    if (typeof cb !== 'function') throw new Error('[AcroxaHooks] callback must be a function');
    var o = opts || {};
    var rec = {
      id: seq++,
      cb: cb,
      priority: (typeof o.priority === 'number' && isFinite(o.priority)) ? o.priority : 10,
      scope: o.scope || 'core',
      once: !!o.once
    };
    if (!hooks[n]) hooks[n] = [];
    hooks[n].push(rec);
    sort(n);
    var disposed = false;
    return function dispose() {
      if (disposed) return;
      disposed = true;
      off(n, cb);
    };
  }

  function once(name, cb, opts) {
    var o = {};
    for (var k in (opts || {})) o[k] = opts[k];
    o.once = true;
    return on(name, cb, o);
  }

  function off(name, cb) {
    var removed = 0;
    var names = name ? [normalize(name)] : Object.keys(hooks);
    for (var i = 0; i < names.length; i++) {
      var arr = hooks[names[i]];
      if (!arr) continue;
      for (var j = arr.length - 1; j >= 0; j--) {
        if (!cb || arr[j].cb === cb) { arr.splice(j, 1); removed++; }
      }
      if (!arr.length) delete hooks[names[i]];
    }
    return removed;
  }

  /** Remove every registration owned by `scope`. Returns count. */
  function clear(scope) {
    if (!scope) return 0;
    var removed = 0;
    Object.keys(hooks).forEach(function (name) {
      var arr = hooks[name];
      for (var j = arr.length - 1; j >= 0; j--) {
        if (arr[j].scope === scope) { arr.splice(j, 1); removed++; }
      }
      if (!arr.length) delete hooks[name];
    });
    return removed;
  }

  function makeCtx(name, data) {
    var ctx = { hook: name, at: Date.now(), cancelled: false };
    if (data && typeof data === 'object') {
      for (var k in data) {
        if (k !== 'hook' && k !== 'cancelled' && Object.prototype.hasOwnProperty.call(data, k)) ctx[k] = data[k];
      }
    }
    return ctx;
  }

  function fail(name, rec, err) {
    stats.failed++;
    failed.push({ hook: name, scope: rec.scope, message: String((err && err.message) || err), at: Date.now() });
    if (failed.length > 20) failed.splice(0, failed.length - 20);
    try { console.error('[AcroxaHooks] listener failed ' + name + ' [' + rec.scope + ']:', err); } catch (_) {}
  }

  function isPromise(v) { return v && typeof v.then === 'function'; }

  /** Sync fold over listeners in priority order. Returns the context. */
  function run(name, data) {
    var n = normalize(name);
    var ctx = makeCtx(n, data);
    var arr = (hooks[n] || []).slice();
    stats.fired++;
    for (var i = 0; i < arr.length; i++) {
      var rec = arr[i];
      if (rec.cb && rec.cb.constructor && rec.cb.constructor.name === "AsyncFunction") {
        if (!warnedAsync[n]) {
          warnedAsync[n] = true;
          try { console.warn('[AcroxaHooks] async listener skipped in sync run() for "' + n + '" — use runAsync()'); } catch (_) {}
        }
        continue;
      }
      var r;
      try {
        r = rec.cb(ctx);
      } catch (err) { fail(n, rec, err); continue; }
      if (isPromise(r)) {
        if (!warnedAsync[n]) {
          warnedAsync[n] = true;
          try { console.warn('[AcroxaHooks] async listener skipped in sync run() for "' + n + '" — use runAsync()'); } catch (_) {}
        }
        continue;
      }
      if (r === false && CANCELLABLE[n]) { ctx.cancelled = true; break; }
      if (rec.once) off(n, rec.cb);
    }
    return ctx;
  }

  /** Async fold: awaits each listener in order, isolates failures. */
  async function runAsync(name, data) {
    var n = normalize(name);
    var ctx = makeCtx(n, data);
    var arr = (hooks[n] || []).slice();
    stats.fired++;
    for (var i = 0; i < arr.length; i++) {
      var rec = arr[i];
      try {
        var r = await rec.cb(ctx);
        if (r === false && CANCELLABLE[n]) { ctx.cancelled = true; break; }
      } catch (err) { fail(n, rec, err); continue; }
      if (rec.once) off(n, rec.cb);
    }
    return ctx;
  }

  function list(name) {
    if (name) {
      return (hooks[normalize(name)] || []).map(function (r) {
        return { hook: name, scope: r.scope, priority: r.priority, once: r.once };
      });
    }
    var out = {};
    Object.keys(hooks).forEach(function (n) { out[n] = hooks[n].length; });
    return out;
  }

  function getStats() {
    return { fired: stats.fired, failed: stats.failed, hooks: Object.keys(hooks).length, failedHooks: failed.slice() };
  }

  // Well-known client lifecycle hooks (mirrors server KNOWN_HOOKS vocabulary
  // where names overlap; client-only phases marked as such).
  var KNOWN = {
    'runtime:init': 'client-only', 'runtime:ready': 'client-only', 'runtime:destroy': 'client-only',
    'view:hydrate': 'client-only', 'view:before-update': 'client-only', 'view:after-update': 'client-only',
    'boundary:mount': 'client-only', 'boundary:before-update': 'client-only',
    'boundary:after-update': 'client-only', 'boundary:unmount': 'client-only',
    'dom:before-patch': 'client-only', 'dom:after-patch': 'client-only',
    'navigation:before': 'client-only', 'navigation:start': 'client-only',
    'navigation:after': 'client-only', 'navigation:error': 'client-only',
    'data:request': 'client-only', 'data:response': 'client-only', 'data:error': 'client-only',
    'update:detected': 'client-only', 'update:started': 'client-only',
    'update:completed': 'client-only', 'update:failed': 'client-only'
  };

  var api = { on: on, once: once, off: off, clear: clear, run: run, runAsync: runAsync, list: list, stats: getStats, KNOWN_HOOKS: KNOWN, CANCELLABLE: CANCELLABLE };
  if (typeof window !== 'undefined') window.AcroxaHooks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
