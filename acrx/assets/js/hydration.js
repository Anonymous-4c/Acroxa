// acrx/assets/js/hydration.js — Acroxa frontend hydration runtime (admin).
// Connects server-rendered DOM (data-acrx-id / data-acrx-hydrate) to the live
// runtime WITHOUT re-running everything: locate runtime-owned DOM, bind once,
// restore state, attach handlers, run lifecycle hooks, dispose on replace.
//
// Lifecycle (spec §12): SERVER RENDER → HTML+metadata → HYDRATION → LIVE DOM →
// STATE CHANGE → TARGETED UPDATE → RE-HYDRATE ONLY AFFECTED SUBTREE.
// Guarantees: idempotent (never double-init), disposable, focus-preserving.
//
// Strategies per node (data-acrx-hydrate):
//   immediate (default when attr present w/o value) | idle | visible | interaction | none
// Static content without the attr is never touched (visitor-friendly too).

(function HydrationModule() {
  'use strict';

  // Staged debug: window.acrxDbg('STAGE', ...) — no-op unless ?acrx_debug=1.
  function dbg() { try { if (window.acrxDbg) window.acrxDbg.apply(null, arguments); } catch (_) {} }

  const live = new Map(); // id -> { el, component, hydrate, stateKey, owner, disposers:Set, initedAt }
  const seen = new WeakSet(); // hydrated elements (double-init guard)
  const components = new Map(); // component name -> { init(el, ctx) -> dispose|void }
  const stats = { hydrated: 0, skipped: 0, disposed: 0, errors: 0 };
  let observer = null;
  // Deferred-init registry: id -> cancel(). Every _defer* path registers
  // here so disposeSubtree can abort timers/observers/listeners for nodes
  // removed before their strategy fires (no leaks, no init-after-remove).
  // Also a double-schedule guard: hydrateNode is a no-op while pending.
  const pending = new Map();

  function _meta(el) {
    return {
      id: el.getAttribute('data-acrx-id'),
      hydrate: el.getAttribute('data-acrx-hydrate') || 'immediate',
      stateKey: el.getAttribute('data-acrx-state'),
      owner: el.getAttribute('data-acrx-owner'),
      component: el.getAttribute('data-acrx-component'),
    };
  }

  function _markHydrated(el) {
    el.setAttribute('data-acrx-hydrated', '1');
    seen.add(el);
  }

  function _isHydrated(el) {
    return seen.has(el) || el.getAttribute('data-acrx-hydrated') === '1';
  }

  var MAX_LIVE = 2000;

  function _pruneLive() {
    if (live.size <= MAX_LIVE) return;
    var entries = Array.from(live.entries()).sort(function (a, b) { return a[1].initedAt - b[1].initedAt; });
    var drop = entries.slice(0, live.size - MAX_LIVE);
    for (var i = 0; i < drop.length; i++) {
      var rec = drop[i][1];
      try {
        for (const d of rec.disposers) { try { d(); } catch (_) {} }
      } catch (_) {}
      live.delete(drop[i][0]);
      stats.disposed++;
    }
  }

  /**
   * Register a component initializer. init(el, ctx) may return a disposer
   * (function | { dispose(), update? } | Array of removers).
   * define(name, init, { version }) — same version re-define is a no-op;
   * a newer version replaces the old (module hot update without reload).
   * Returns unregister fn.
   */
  function define(component, init, opts) {
    if (!component || typeof init !== 'function') throw new Error('[AcroxaHydration] define requires (name, init)');
    var version = (opts && opts.version) || (init && init.version) || null;
    var prev = components.get(component);
    if (prev && prev.version && version && prev.version === version) return () => { components.delete(component); };
    components.set(component, { init: init, version: version });
    return () => { components.delete(component); };
  }

  // Per-module update: call the component's update() when provided,
  // otherwise dispose + re-init in place (state-preserving: server HTML kept
  // on failure). Returns true when the instance is live afterwards.
  function updateNode(el) {
    if (!el || el.nodeType !== 1 || !el.hasAttribute('data-acrx-id')) return false;
    var id = el.getAttribute('data-acrx-id');
    var rec = live.get(id);
    if (!rec) return !!hydrateNode(el);
    try {
      if (typeof rec.update === 'function') {
        rec.update({ el: el, id: id });
        dbg('HYDRATE-UPDATE', id, 'component-update');
        return true;
      }
    } catch (e) {
      stats.errors++;
      console.error('[AcroxaHydration] update failed #' + id + ':', e);
      dbg('HYDRATE-ERROR', id, 'update threw, DOM kept');
      return true; // keep live DOM — never destroy on update failure
    }
    dbg('HYDRATE-UPDATE', id, 'dispose+reinit fallback');
    // Fallback: clean re-init (dispose old bindings, bind fresh).
    try {
      for (const d of rec.disposers) { try { d(); } catch (_) {} }
    } catch (_) {}
    try { el.removeAttribute('data-acrx-hydrated'); } catch (_) {}
    try { seen.delete(el); } catch (_) {}
    live.delete(id);
    return !!hydrateNode(el);
  }

  function _runInit(el, meta) {
    if (_isHydrated(el)) { stats.skipped++; dbg('HYDRATE-SKIP', meta.id, 'already-hydrated'); return false; }
    pending.delete(meta.id); // settled: drop any stale cancel for this id
    const def = meta.component ? components.get(meta.component) : null;
    const disposers = new Set();
    let updateFn = null;
    try {
      // Generic contract: tabs/accordion natively handled; component inits own the rest.
      if (def) {
        const r = def.init(el, { id: meta.id, stateKey: meta.stateKey, owner: meta.owner });
        if (typeof r === 'function') disposers.add(r);
        else if (r && (typeof r.dispose === 'function' || typeof r.update === 'function')) {
          if (typeof r.dispose === 'function') disposers.add(() => r.dispose());
          if (typeof r.update === 'function') updateFn = r.update;
        }
        else if (Array.isArray(r)) r.forEach((d) => { if (typeof d === 'function') disposers.add(d); });
      }
      _markHydrated(el);
      live.set(meta.id, { el, ...meta, disposers, update: updateFn, initedAt: Date.now() });
      _pruneLive();
      stats.hydrated++;
      dbg('HYDRATE-OK', meta.id, 'component=' + (meta.component || 'generic'), 'strategy=' + meta.hydrate);
      try { if (window.AcroxaHooks) window.AcroxaHooks.run('boundary:mount', { id: meta.id, component: meta.component, el: el }); } catch (_) {}
      return true;
    } catch (e) {
      stats.errors++;
      console.error(`[AcroxaHydration] init failed #${meta.id} (${meta.component || 'generic'}):`, e);
      // Never destroy server HTML on hydration failure (spec §55.13).
      return false;
    }
  }

  function _deferIdle(el, meta) {
    if (pending.has(meta.id)) { stats.skipped++; return; }
    let timer = null;
    let idle = false;
    const cancel = () => {
      if (timer == null) return;
      try {
        if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(timer);
        else clearTimeout(timer);
      } catch (_) {}
      timer = null;
      pending.delete(meta.id);
    };
    const run = () => { timer = null; pending.delete(meta.id); _runInit(el, meta); };
    if (typeof requestIdleCallback === 'function') {
      try { timer = requestIdleCallback(run, { timeout: 300 }); idle = true; }
      catch (_) { idle = false; timer = setTimeout(run, 32); }
    } else timer = setTimeout(run, 32);
    pending.set(meta.id, cancel);
  }

  function _deferVisible(el, meta) {
    if (pending.has(meta.id)) { stats.skipped++; return; }
    if (typeof IntersectionObserver !== 'function') { _deferIdle(el, meta); return; }
    if (!observer) {
      observer = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            try { observer.unobserve(en.target); } catch (_) {}
            let pid = null;
            try { pid = _meta(en.target).id; } catch (_) {}
            if (pid) pending.delete(pid);
            const m = _meta(en.target);
            _runInit(en.target, m);
          }
        }
      }, { rootMargin: '256px' });
    }
    pending.set(meta.id, () => {
      try { observer.unobserve(el); } catch (_) {}
      pending.delete(meta.id);
    });
    observer.observe(el);
  }

  function _deferInteraction(el, meta) {
    if (pending.has(meta.id)) { stats.skipped++; return; }
    let settled = false;
    let cleanup = () => {};
    const fire = () => {
      if (settled) return;
      settled = true;
      pending.delete(meta.id);
      try { cleanup(); } catch (_) {}
      _runInit(el, meta);
    };
    if (typeof AbortController !== 'undefined') {
      const ac = new AbortController();
      const sig = ac.signal;
      el.addEventListener('pointerdown', fire, { once: true, passive: true, signal: sig });
      el.addEventListener('focusin', fire, { once: true, signal: sig });
      el.addEventListener('click', fire, { once: true, signal: sig });
      cleanup = () => { try { ac.abort(); } catch (_) {} };
    } else {
      el.addEventListener('pointerdown', fire, { once: true, passive: true });
      el.addEventListener('focusin', fire, { once: true });
      el.addEventListener('click', fire, { once: true });
      cleanup = () => {
        try {
          el.removeEventListener('pointerdown', fire);
          el.removeEventListener('focusin', fire);
          el.removeEventListener('click', fire);
        } catch (_) {}
      };
    }
    pending.set(meta.id, () => {
      if (!settled) { settled = true; try { cleanup(); } catch (_) {} }
      pending.delete(meta.id);
    });
  }

  function hydrateNode(el) {
    if (!el || el.nodeType !== 1 || !el.hasAttribute('data-acrx-id')) return false;
    if (_isHydrated(el)) { stats.skipped++; return false; }
    const meta = _meta(el);
    if (meta.hydrate === 'none') { stats.skipped++; dbg('HYDRATE-SKIP', meta.id, 'strategy=none'); return false; }
    if (pending.has(meta.id)) { stats.skipped++; dbg('HYDRATE-SKIP', meta.id, 'already-pending'); return false; } // already scheduled — don't double-queue
    if (meta.hydrate === 'idle') { dbg('HYDRATE-DEFER', meta.id, 'idle'); _deferIdle(el, meta); return true; }
    if (meta.hydrate === 'visible') { dbg('HYDRATE-DEFER', meta.id, 'visible'); _deferVisible(el, meta); return true; }
    if (meta.hydrate === 'interaction') { dbg('HYDRATE-DEFER', meta.id, 'interaction'); _deferInteraction(el, meta); return true; }
    return _runInit(el, meta);
  }

  function _walk(root, cb) {
    if (!root) return;
    if (root.nodeType === 1 && root.hasAttribute('data-acrx-id')) cb(root);
    if (root.querySelectorAll) {
      root.querySelectorAll('[data-acrx-id]').forEach((n) => {
        if (n !== root) cb(n);
      });
    }
  }

  /** Hydrate one subtree (used after targeted DOM patch). Idempotent. */
  function hydrateSubtree(root) {
    if (!root) return 0;
    let n = 0;
    _walk(root, (el) => { if (hydrateNode(el)) n++; });
    return n;
  }

  /** Update one subtree in place (DOM changed, module impl same). Idempotent. */
  function updateSubtree(root) {
    if (!root) return 0;
    let n = 0;
    _walk(root, (el) => { if (updateNode(el)) n++; });
    return n;
  }

  /** Dispose one subtree: run disposers, drop registry, clear markers on removal. */
  function disposeSubtree(root) {
    if (!root) return 0;
    dbg('HYDRATE-DISPOSE-START', (root.getAttribute && root.getAttribute('data-acrx-id')) || root.tagName);
    let n = 0;
    const ids = [];
    _walk(root, (el) => {
      const id = el.getAttribute('data-acrx-id');
      if (id) ids.push(id);
    });
    for (const id of ids) {
      // Abort deferred init first: node is gone, its timer/observer/
      // listeners must not fire _runInit after removal.
      const cancel = pending.get(id);
      if (cancel) { try { cancel(); } catch (_) {} pending.delete(id); }
      const rec = live.get(id);
      if (!rec) continue;
      for (const d of rec.disposers) {
        try { d(); } catch (e) { console.error(`[AcroxaHydration] dispose failed #${id}:`, e); }
      }
      live.delete(id);
      // Clear hydration markers so a re-inserted node can hydrate fresh
      // instead of being stuck in the WeakSet/attribute guard forever.
      try { rec.el.removeAttribute('data-acrx-hydrated'); } catch (_) {}
      try { seen.delete(rec.el); } catch (_) {}
      n++;
      stats.disposed++;
      try { if (window.AcroxaHooks) window.AcroxaHooks.run('boundary:unmount', { id }); } catch (_) {}
    }
    if (observer && root.nodeType === 1) {
      try {
        if (root.hasAttribute('data-acrx-id')) observer.unobserve(root);
        root.querySelectorAll('[data-acrx-id]').forEach((el) => { try { observer.unobserve(el); } catch (_) {} });
      } catch (_) {}
    }
    if (n) dbg('HYDRATE-DISPOSE-OK', n + ' instance(s)');
    return n;
  }

  /** Initial boot: hydrate douce — immediate nodes now, deferred per strategy. */
  function boot(scope) {
    const root = scope || document;
    return hydrateSubtree(root);
  }

  function getStats() {
    return { ...stats, live: live.size, pending: pending.size, components: components.size };
  }

  function isLive(id) { return live.has(id); }

  // Module lifecycle aliases (mount/update/unmount/dispose vocabulary).
  function mount(el) { return hydrateNode(el); }
  function unmount(root) { return disposeSubtree(root); }
  function update(idOrEl) {
    if (typeof idOrEl === 'string') {
      var rec = live.get(idOrEl);
      if (!rec) return false;
      return updateNode(rec.el);
    }
    return updateNode(idOrEl);
  }
  function dispose(root) { return disposeSubtree(root); }

  const api = { define, hydrateNode, hydrateSubtree, updateSubtree, updateNode, disposeSubtree, boot, getStats, isLive, mount, update, unmount, dispose };
  if (typeof window !== 'undefined') {
    window.AcroxaHydration = api;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => boot(document), { once: true });
    } else {
      // Script at end of body: boot now (idempotent — re-boot is a no-op).
      try { boot(document); } catch (e) { console.error('[AcroxaHydration] boot failed:', e); }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
