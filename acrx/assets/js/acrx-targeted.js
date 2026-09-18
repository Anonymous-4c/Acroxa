// acrx/assets/js/acrx-targeted.js — AcroxaJS targeted live-update client (v1).
// Four-step dynamic update without navigation or full reload:
//
//   1. plan()    — ask POST /acr/api/runtime/target-plan whether this change
//                  wants a DOM rerender or an eject+inject of JS files.
//   2. resolve() — ask GET  /acr/api/runtime/target for the targeted element
//                  (selector + metadata + fresh HTML).
//   3. deps()    — ask GET  /acr/api/runtime/target-deps for the target's
//                  dependencies and required JS/CSS files.
//   4. apply()   — re-render: eject stale <script>s, inject cache-busted
//                  copies, patch the element, rehydrate the subtree.
//
// Every step emits CustomEvent('acrx:update', ...) so the diagnostics panel
// registers the change. DOM work honors window.AcroxaUpdateGuard.canPatch().
// Script reinjection expects reload-safe scripts (IIFE modules or `var`
// namespaces — re-execution must not throw redeclaration errors).

(function TargetedModule() {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.AcroxaTargeted && window.AcroxaTargeted.__v === 1) return;

  // Staged debug: window.acrxDbg('STAGE', ...) — no-op unless ?acrx_debug=1.
  function dbg() { try { if (window.acrxDbg) window.acrxDbg.apply(null, arguments); } catch (_) {} }

  var LOAD_TIMEOUT_MS = 10000;

  function emit(status, detail) {
    try {
      window.dispatchEvent(new CustomEvent('acrx:update', { detail: Object.assign({ status: status, at: Date.now() }, detail || {}) }));
    } catch (_) {}
  }

  function log() {
    if (window.__ACRX_DEBUG__) try { console.log.apply(console, ['[Acroxa:TARGETED]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function cleanUrl(url) {
    return String(url || '').split('?')[0].split('#')[0];
  }

  function shortName(url) {
    return String(url || '').split('/').pop();
  }

  function withRev(url, rev) {
    var clean = cleanUrl(url);
    return clean + '?v=' + encodeURIComponent(rev != null ? String(rev) : String(Date.now()));
  }

  // Every request is staged: REQ-START -> REQ-OK (ms + status) | REQ-FAIL.
  async function getJson(url) {
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    dbg('REQ-START', 'GET ' + url);
    var res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    var ms = (window.performance && performance.now) ? Math.round(performance.now() - t0) : null;
    if (!res.ok) {
      dbg('REQ-FAIL', 'GET ' + url, 'status=' + res.status, ms != null ? ms + 'ms' : '');
      var err = new Error('HTTP ' + res.status + ' for ' + url);
      err.code = res.status;
      throw err;
    }
    dbg('REQ-OK', 'GET ' + url, 'status=' + res.status, ms != null ? ms + 'ms' : '');
    return res.json();
  }

  async function postJson(url, body) {
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    dbg('REQ-START', 'POST ' + url);
    var res = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    var ms = (window.performance && performance.now) ? Math.round(performance.now() - t0) : null;
    if (!res.ok) {
      dbg('REQ-FAIL', 'POST ' + url, 'status=' + res.status, ms != null ? ms + 'ms' : '');
      var err = new Error('HTTP ' + res.status + ' for ' + url);
      err.code = res.status;
      throw err;
    }
    dbg('REQ-OK', 'POST ' + url, 'status=' + res.status, ms != null ? ms + 'ms' : '');
    return res.json();
  }

  function guard() {
    try {
      if (window.AcroxaUpdateGuard && typeof window.AcroxaUpdateGuard.canPatch === 'function') {
        return window.AcroxaUpdateGuard.canPatch() || { ok: false, reason: 'guard' };
      }
    } catch (_) {}
    return { ok: true };
  }

  // ── API 1: decide rerender vs eject+inject ──────────────────────────────
  // Prefers versioned RC (/rc); falls back to legacy target-plan on 404.
  async function plan(opts) {
    opts = opts || {};
    var body = { target: opts.target || null, changedFile: opts.changedFile || opts.file || null };
    var data = null;
    try {
      data = await postJson('/acr/api/runtime/rc', body);
      // Normalize RC shape to the plan shape callers expect.
      if (data && data.success === true && !data.strategy && data.action) {
        var map = { NOOP: 'noop', PATCH: 'rerender', REPLACE: 'fragment-replace', REHYDRATE: 'rehydrate', MODULE_UPDATE: 'eject-inject', MODULE_RELOAD: 'fragment-replace', STYLE_UPDATE: 'stylesheet-refresh', VIEW_UPDATE: 'fragment-replace', EXTENSION_UPDATE: 'fragment-replace', FULL_REFRESH: 'full-reload' };
        data.strategy = map[data.action] || 'fragment-replace';
        data.reason = (data.why || []).join('; ') || data.reason;
      }
    } catch (e) {
      data = await postJson('/acr/api/runtime/target-plan', body);
    }
    if (!data || data.success !== true) throw new Error((data && data.message) || 'plan failed');
    dbg('PLAN', 'strategy=' + data.strategy, 'target=' + (data.target || 'n/a'), 'reason=' + (data.reason || ''));
    emit('targeted-plan', { strategy: data.strategy, target: data.target || null });
    return data;
  }

  // ── API 2: get the targeted element (selector + meta + fresh HTML) ─────
  async function resolve(target) {
    if (!target) throw new Error('target required');
    var data = null;
    try {
      data = await postJson('/acr/api/runtime/rr', { target: target });
      if (data && data.success === true && !data.meta && data.boundary) {
        data.target = data.boundary;
      }
    } catch (e) {
      data = await getJson('/acr/api/runtime/target?target=' + encodeURIComponent(target));
    }
    if (!data || data.success !== true) throw new Error((data && data.message) || 'resolve failed');
    dbg('RESOLVE', target, 'selector=' + (data.selector || 'n/a'), 'rev=' + (data.rev != null ? data.rev : 'n/a'));
    return data;
  }

  // ── API 3: dependencies + required JS/CSS files for a target ───────────
  async function deps(target) {
    if (!target) throw new Error('target required');
    var data = await getJson('/acr/api/runtime/target-deps?target=' + encodeURIComponent(target));
    if (!data || data.success !== true) throw new Error((data && data.message) || 'deps failed');
    dbg('DEPS', target, 'js=' + ((data.js || []).length), 'css=' + ((data.css || []).length));
    return data;
  }

  // ── Stylesheet refresh (no DOM churn) ───────────────────────────────────
  function refreshStyles(cssUrls, rev) {
    var touched = 0;
    (cssUrls || []).forEach(function (url) {
      var clean = cleanUrl(url);
      if (!clean) return;
      try {
        var links = document.querySelectorAll('link[rel="stylesheet"]');
        Array.prototype.forEach.call(links, function (l) {
          var href = l.getAttribute('href') || '';
          if (href.split('?')[0] === clean || href.indexOf(clean) !== -1) {
            l.setAttribute('href', withRev(clean, rev));
            touched++;
          }
        });
        // Required but not present yet: inject it.
        if (!document.querySelector('link[rel="stylesheet"][href^="' + clean + '"]')) {
          var nl = document.createElement('link');
          nl.rel = 'stylesheet';
          nl.href = withRev(clean, rev);
          document.head.appendChild(nl);
          touched++;
        }
      } catch (_) {}
    });
    if (touched) emit('targeted-styles', { count: touched, rev: rev });
    return touched;
  }

  function findScripts(url) {
    var clean = cleanUrl(url);
    var out = [];
    try {
      Array.prototype.forEach.call(document.scripts || [], function (s) {
        if (s && s.src && s.src.split('?')[0] === clean) out.push(s);
      });
    } catch (_) {}
    return out;
  }

  function loadScript(url, rev, refNode) {
    return new Promise(function (resolvePromise) {
      var done = function (ok, err) {
        try {
          if (window.AcroxaAdminRuntime && typeof window.AcroxaAdminRuntime.noteScript === 'function') {
            window.AcroxaAdminRuntime.noteScript(cleanUrl(url));
          }
        } catch (_) {}
        resolvePromise({ url: url, ok: !!ok, error: err ? String((err && err.message) || err) : null });
      };
      try {
        var s = document.createElement('script');
        s.src = withRev(url, rev);
        // Preserve execution semantics of the ejected script (classic,
        // ordered). async=false keeps insertion-order execution.
        try {
          if (refNode) {
            if (refNode.type) s.type = refNode.type;
            if (refNode.defer) s.defer = true;
            // Never copy `async` from page scripts for reinjected runtime
            // files: ordered execution is required for Mini.* dependents.
            s.async = false;
          } else {
            s.async = false;
          }
        } catch (_) {}
        var settled = false;
        var finish = function (ok, err) { if (!settled) { settled = true; done(ok, err); } };
        s.onload = function () { finish(true); };
        s.onerror = function (e) { finish(false, e); };
        setTimeout(function () { finish(false, new Error('load timeout ' + url)); }, LOAD_TIMEOUT_MS);
        // Insert where the ejected script lived (order-preserving); else head.
        try {
          if (refNode && refNode.parentNode) refNode.parentNode.insertBefore(s, refNode.nextSibling);
          else (document.head || document.documentElement).appendChild(s);
        } catch (_) {
          (document.head || document.documentElement).appendChild(s);
        }
      } catch (e) { done(false, e); }
    });
  }

  // ── Eject stale <script>s, inject cache-busted copies, in order ─────────
  // Returns { reinjected: [{ url, ok, error }] }. A failed file resolves
  // (never rejects) so one bad script cannot block the remaining updates.
  async function ejectInject(jsUrls, opts) {
    opts = opts || {};
    var rev = opts.rev != null ? opts.rev : Date.now();
    var results = [];
    var list = (jsUrls || []).filter(Boolean);
    for (var i = 0; i < list.length; i++) {
      var url = list[i];
      var clean = cleanUrl(url);
      var olds = findScripts(clean);
      var ref = olds[0] || null;
      // Eject: remove every stale copy first so the fresh one is canonical.
      olds.forEach(function (s) {
        try {
          if (window.AcroxaAdminRuntime && typeof window.AcroxaAdminRuntime.forgetScript === 'function') {
            window.AcroxaAdminRuntime.forgetScript(clean);
          }
        } catch (_) {}
        try { s.remove(); } catch (_) {}
      });
      emit('targeted-eject', { url: clean, removed: olds.length });
      dbg('EJECT', clean, 'removed=' + olds.length);
      log('ejected', clean, 'x' + olds.length);
      var r = await loadScript(clean, rev, ref);
      dbg(r.ok ? 'INJECT-OK' : 'INJECT-FAIL', clean, 'rev=' + rev, r.error || '');
      results.push(r);
      emit(r.ok ? 'targeted-inject' : 'targeted-inject-error', { url: clean, rev: rev, error: r.error });
      log(r.ok ? 'injected' : 'inject FAILED', shortName(clean), r.error || '');
    }
    // Fresh module state, fresh bindings: dispose stale hydration roots and
    // rehydrate from the live DOM (idempotent — no double-init).
    try {
      if (window.AcroxaHydration) {
        if (typeof window.AcroxaHydration.disposeSubtree === 'function') {
          try { window.AcroxaHydration.disposeSubtree(document); } catch (_) {}
        }
        if (typeof window.AcroxaHydration.hydrateSubtree === 'function') {
          var n = window.AcroxaHydration.hydrateSubtree(document);
          emit('targeted-rehydrate', { count: n });
        }
      }
    } catch (_) {}
    return { reinjected: results };
  }

  function patchElement(selector, html, generation) {
    var el = null;
    try { el = document.querySelector(selector); } catch (_) {}
    if (!el) return { patched: false, reason: 'element-missing' };
    try {
      if (window.AcroxaDomPatch && typeof window.AcroxaDomPatch.patchWithGeneration === 'function') {
        var out = window.AcroxaDomPatch.patchWithGeneration(el, html, { generation: generation || 0 });
        if (out && out.action === 'patch') return { patched: true, strategy: out.strategy || 'patched', changed: out.changed || 0 };
        if (out && out.action === 'drop') return { patched: false, reason: out.reason || 'dropped' };
        return { patched: false, reason: (out && out.reason) || 'verify-failed', reload: out && out.action === 'reload' };
      }
      if (window.AcroxaDomPatch && typeof window.AcroxaDomPatch.patchNode === 'function') {
        var out2 = window.AcroxaDomPatch.patchNode(el, html);
        return { patched: true, strategy: (out2 && out2.strategy) || 'patched', changed: (out2 && out2.changed) || 0 };
      }
    } catch (e) {
      log('dom-patch failed, replacing:', e && e.message);
    }
    try {
      var tpl = document.createElement('template');
      tpl.innerHTML = String(html).trim();
      var next = tpl.content.firstElementChild;
      if (!next) return { patched: false, reason: 'bad-html' };
      el.replaceWith(next);
      try {
        if (window.AcroxaHydration && typeof window.AcroxaHydration.hydrateSubtree === 'function') {
          window.AcroxaHydration.hydrateSubtree(next.parentNode || document);
        }
      } catch (_) {}
      return { patched: true, strategy: 'replaced', changed: 1 };
    } catch (e) {
      return { patched: false, reason: String((e && e.message) || e) };
    }
  }

  // ── API 4 (element half): re-render one target in place ─────────────────
  async function rerender(target) {
    if (!target) throw new Error('target required');
    var g = guard();
    if (!g.ok) {
      emit('targeted-deferred', { target: target, reason: g.reason });
      return { target: target, deferred: true, reason: g.reason };
    }
    // Validate via RT first (stale/critical rejected before any DOM work),
    // then render via RR with legacy fragment fallback.
    try {
      var verdict = await postJson('/acr/api/runtime/rt', { op: 'patch', target: target });
      if (verdict && verdict.success === true && verdict.op === 'full-refresh') {
        try {
          if (window.AcroxaAdminRuntime && typeof window.AcroxaAdminRuntime.markStale === 'function') {
            window.AcroxaAdminRuntime.markStale(verdict.reason || 'full-refresh');
          }
        } catch (_) {}
        emit('targeted-stale', { reason: verdict.reason || 'full-refresh', rev: verdict.rev });
        return { target: target, stale: true, reason: verdict.reason };
      }
    } catch (_) {}
    var data = null;
    try {
      data = await postJson('/acr/api/runtime/rr', { target: target });
      if (data && data.success === true && data.boundary && !data.target) data.target = data.boundary;
    } catch (e) {
      data = await postJson('/acr/api/runtime/fragment', { type: 'target', target: target });
    }
    if (!data || data.success !== true) throw new Error((data && data.message) || 'fragment failed');
    // Target may declare required files: make sure they exist first so the
    // fresh markup binds against live behavior (inject-only, never eject
    // what the plan did not ask for — ejectInject already ran when needed).
    try {
      if (data.assets && data.assets.css && data.assets.css.length) refreshStyles(data.assets.css, data.rev);
    } catch (_) {}
    var patched = patchElement(data.selector || ('[data-acrx-id="' + target + '"]'), data.html, data.generation || data.rev);
    dbg(patched.patched ? 'RERENDER-OK' : 'RERENDER-SKIP', target, patched.strategy || patched.reason || '');
    emit('targeted-swapped', { target: target, rev: data.rev, strategy: patched.strategy || null, cached: !!data.cached });
    log('rerendered', target, patched.strategy || patched.reason);
    return { target: target, rev: data.rev, patched: patched, assets: data.assets || { js: [], css: [] } };
  }

  // ── Full 4-step flow: plan → resolve → deps → eject/inject → rerender ───
  async function update(opts) {
    opts = opts || {};
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    var target = opts.target || null;
    var changedFile = opts.changedFile || opts.file || null;
    var p = await plan({ target: target, changedFile: changedFile });
    var out = { strategy: p.strategy, target: target, changedFile: changedFile, rev: p.rev };

    if (p.strategy === 'noop') {
      emit('targeted-noop', { target: target });
      return out;
    }
    if (p.strategy === 'stylesheet-refresh') {
      out.refreshed = refreshStyles((p.assets && p.assets.css) || [], p.rev);
      return out;
    }
    if (p.strategy === 'full-reload') {
      // Never auto-reload: surface staleness and let the user decide.
      try {
        if (window.AcroxaAdminRuntime && typeof window.AcroxaAdminRuntime.markStale === 'function') {
          window.AcroxaAdminRuntime.markStale(p.reason || 'full-reload');
        }
      } catch (_) {}
      emit('targeted-stale', { reason: p.reason || 'full-reload', rev: p.rev });
      return out;
    }
    if (p.strategy === 'eject-inject') {
      var g = guard();
      if (!g.ok) {
        emit('targeted-deferred', { target: target, changedFile: changedFile, reason: g.reason });
        out.deferred = true;
        out.reason = g.reason;
        return out;
      }
      var js = (p.assets && p.assets.js) || [];
      // Enrich with the target's declared deps when we have a target.
      if (target) {
        try {
          var d = await deps(target);
          out.dependencies = d.deps || [];
          (d.js || []).forEach(function (u) { if (js.indexOf(u) === -1) js.push(u); });
          if (d.css && d.css.length) refreshStyles(d.css, p.rev);
        } catch (e) { log('deps lookup failed:', e && e.message); }
      }
      out.ejected = await ejectInject(js, { rev: p.rev });
      out.scriptsOk = out.ejected.reinjected.every(function (r) { return r.ok; });
      if (target) {
        try { out.rerender = await rerender(target); }
        catch (e) { out.rerenderError = String((e && e.message) || e); }
      }
      var ms = (window.performance && performance.now) ? Math.round(performance.now() - t0) : null;
      emit('targeted-applied', { strategy: p.strategy, target: target, rev: p.rev, ms: ms, scriptsOk: out.scriptsOk });
      out.ms = ms;
      return out;
    }
    // rerender / fragment-replace with a concrete element: patch it.
    if (target && (p.strategy === 'rerender' || p.strategy === 'fragment-replace' || p.strategy === 'subtree-reconcile' || p.strategy === 'rehydrate')) {
      try { out.rerender = await rerender(target); }
      catch (e) {
        // Element unknown here (admin pages register no per-element targets
        // yet) — signal the caller to fall back to a content swap.
        out.rerenderError = String((e && e.message) || e);
        out.fallback = 'content-swap';
      }
      return out;
    }
    out.fallback = 'content-swap';
    return out;
  }

  var api = {
    __v: 1, plan: plan, resolve: resolve, deps: deps,
    rerender: rerender, ejectInject: ejectInject,
    refreshStyles: refreshStyles, update: update,
  };
  window.AcroxaTargeted = api;
})();
