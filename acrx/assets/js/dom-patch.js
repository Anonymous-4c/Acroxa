// acrx/assets/js/dom-patch.js — lightweight targeted DOM patching (spec §20).
// No vDOM. Strategy: stable data-acrx-id → diff attrs + keyed children;
// otherwise targeted subtree replace. Correctness first, then minimal churn.
// Integrates with hydration: dispose old bindings before replace, re-hydrate
// only the affected subtree after. Preserves focus / selection / input values.

(function DomPatchModule() {
  'use strict';

  // Staged debug: window.acrxDbg('STAGE', ...) — no-op unless ?acrx_debug=1.
  function dbg() { try { if (window.acrxDbg) window.acrxDbg.apply(null, arguments); } catch (_) {} }

  function _isElem(n) { return n && n.nodeType === 1; }

  function _attrsOf(node) {
    const out = {};
    if (!_isElem(node)) return out;
    for (const a of node.attributes) out[a.name] = a.value;
    return out;
  }

  function diffAttrs(target, next) {
    if (!_isElem(target) || !_isElem(next)) return 0;
    const a = _attrsOf(target);
    const b = _attrsOf(next);
    let changed = 0;
    for (const k of Object.keys(b)) {
      // Never clobber hydration bookkeeping or live input state via attrs.
      if (k === 'data-acrx-hydrated') continue;
      if (k === 'value' && 'value' in target && target.value === b[k]) continue;
      if (a[k] !== b[k]) {
        try { target.setAttribute(k, b[k]); changed++; } catch (_) {}
      }
    }
    for (const k of Object.keys(a)) {
      if (!(k in b) && k !== 'data-acrx-id' && k !== 'data-acrx-hydrated') {
        try { target.removeAttribute(k); changed++; } catch (_) {}
      }
    }
    return changed;
  }

  function _captureState(root) {
    const active = document.activeElement;
    const out = {
      activeId: null, selStart: null, selEnd: null, values: new Map(),
      scroll: null, details: new Map(), media: new Map(),
    };
    if (active && root.contains(active)) {
      out.activeId = active.getAttribute && active.getAttribute('data-acrx-id');
      if (!out.activeId) out.activeId = active.id || null;
      try {
        if (typeof active.selectionStart === 'number') {
          out.selStart = active.selectionStart;
          out.selEnd = active.selectionEnd;
        }
      } catch (_) {}
    }
    try {
      root.querySelectorAll('input,textarea,select').forEach((n) => {
        const k = n.getAttribute('data-acrx-id') || n.name || n.id;
        if (k) out.values.set(k, n.type === 'checkbox' || n.type === 'radio' ? n.checked : n.value);
      });
    } catch (_) {}
    // Scroll position of the patched root when it scrolls.
    try {
      if (root && (root.scrollTop || root.scrollLeft)) out.scroll = { top: root.scrollTop, left: root.scrollLeft };
    } catch (_) {}
    // Open/closed UI state + media playback survive targeted patches.
    try {
      root.querySelectorAll('details[data-acrx-id]').forEach((n) => {
        out.details.set(n.getAttribute('data-acrx-id'), !!n.open);
      });
      root.querySelectorAll('video[data-acrx-id],audio[data-acrx-id]').forEach((n) => {
        try { out.media.set(n.getAttribute('data-acrx-id'), { t: n.currentTime || 0, paused: !!n.paused }); } catch (_) {}
      });
    } catch (_) {}
    return out;
  }

  function _restoreState(root, st) {
    try {
      st.values.forEach((v, k) => {
        const n = root.querySelector(`[data-acrx-id="${CSS.escape(k)}"]`) || root.querySelector(`[name="${CSS.escape(k)}"]`) || document.getElementById(k);
        if (!n) return;
        if (n.type === 'checkbox' || n.type === 'radio') n.checked = !!v;
        else if (n.value !== v && document.activeElement !== n) n.value = v;
      });
      if (st.activeId) {
        const t = root.querySelector(`[data-acrx-id="${CSS.escape(st.activeId)}"]`) || document.getElementById(st.activeId);
        if (t && document.activeElement !== t) {
          t.focus({ preventScroll: true });
          try {
            if (st.selStart != null && typeof t.setSelectionRange === 'function') t.setSelectionRange(st.selStart, st.selEnd);
          } catch (_) {}
        }
      }
      if (st.scroll) {
        try { root.scrollTop = st.scroll.top; root.scrollLeft = st.scroll.left; } catch (_) {}
      }
      st.details.forEach((open, k) => {
        try {
          const n = root.querySelector(`[data-acrx-id="${CSS.escape(k)}"]`);
          if (n && 'open' in n) n.open = !!open;
        } catch (_) {}
      });
      st.media.forEach((m, k) => {
        try {
          const n = root.querySelector(`[data-acrx-id="${CSS.escape(k)}"]`);
          if (n && typeof n.currentTime === 'number' && Math.abs(n.currentTime - m.t) > 0.5) n.currentTime = m.t;
          if (n && !m.paused && n.paused && typeof n.play === 'function') { try { var p = n.play(); if (p && p.catch) p.catch(function () {}); } catch (_) {} }
        } catch (_) {}
      });
    } catch (_) {}
  }

  function _disposeSubtree(root) {
    try {
      if (window.AcroxaHydration && typeof window.AcroxaHydration.disposeSubtree === 'function') {
        window.AcroxaHydration.disposeSubtree(root);
      }
    } catch (_) {}
  }

  function _rehydrateSubtree(root) {
    try {
      if (window.AcroxaHydration && typeof window.AcroxaHydration.hydrateSubtree === 'function') {
        window.AcroxaHydration.hydrateSubtree(root);
      }
    } catch (_) {}
  }

  // Cloned nodes copy data-acrx-hydrated="1" via cloneNode(true), which would
  // make hydration skip them while the live registry still points at detached
  // nodes (P0 dead-UI). Strip the marker so the fresh subtree rehydrates.
  function _freshClone(node) {
    const c = node.cloneNode(true);
    try {
      if (c.nodeType === 1) {
        if (c.hasAttribute && c.hasAttribute('data-acrx-hydrated')) c.removeAttribute('data-acrx-hydrated');
        var nested = c.querySelectorAll ? c.querySelectorAll('[data-acrx-hydrated]') : [];
        for (var i = 0; i < nested.length; i++) nested[i].removeAttribute('data-acrx-hydrated');
      }
    } catch (_) {}
    return c;
  }

  function _toNode(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html).trim();
    return tpl.content.firstElementChild;
  }

  function reconcileChildren(target, next) {
    // Keyed by data-acrx-id; unkeyed nodes match by index+tag.
    const tKids = [...target.childNodes];
    const nKids = [...next.childNodes];
    const tByKey = new Map();
    tKids.forEach((n) => {
      if (_isElem(n) && n.hasAttribute('data-acrx-id')) tByKey.set(n.getAttribute('data-acrx-id'), n);
    });
    let touched = 0;
    const used = new Set();
    const frag = document.createDocumentFragment();
    for (const n of nKids) {
      if (_isElem(n) && n.hasAttribute('data-acrx-id') && tByKey.has(n.getAttribute('data-acrx-id'))) {
        const cur = tByKey.get(n.getAttribute('data-acrx-id'));
        used.add(cur);
        patchNode(cur, n);
        frag.appendChild(cur);
        touched++;
      } else if (n.nodeType === 3) {
        // Text: reuse the positional live text node when possible so
        // `unchanged node === same node` holds for text too; only update
        // textContent when it actually differs (preserves selection/focus).
        var reused = null;
        for (var ti = 0; ti < tKids.length; ti++) {
          var tk = tKids[ti];
          if (tk.nodeType === 3 && !used.has(tk)) { reused = tk; break; }
        }
        if (reused) {
          used.add(reused);
          if (reused.textContent !== n.textContent) reused.textContent = n.textContent;
          frag.appendChild(reused);
        } else {
          frag.appendChild(document.createTextNode(n.textContent));
        }
        touched++;
      } else if (_isElem(n)) {
        frag.appendChild(_freshClone(n));
        touched++;
      } else {
        frag.appendChild(n.cloneNode(true));
        touched++;
      }
    }
    // Dispose removed keyed subtrees (listener/observer cleanup).
    for (const t of tKids) {
      if (_isElem(t) && t.hasAttribute('data-acrx-id') && !used.has(t)) _disposeSubtree(t);
      else if (_isElem(t) && !frag.contains(t)) _disposeSubtree(t);
    }
    const st = _captureState(target);
    target.replaceChildren(frag);
    _restoreState(target, st);
    _rehydrateSubtree(target);
    return touched;
  }

  /**
   * Patch target element toward next element/HTML. Returns { strategy, changed }.
   * Strategies: "keyed-diff" | "replaced" | "text" | "noop".
   */
  function patchNode(target, nextHtmlOrNode) {
    if (!target || !target.parentNode) return { strategy: 'noop', changed: 0 };
    try {
      if (window.AcroxaHooks) {
        var pre = window.AcroxaHooks.run('dom:before-patch', { target: target });
        if (pre && pre.cancelled) return { strategy: 'noop', changed: 0, cancelled: true };
      }
    } catch (_) {}
    var out = _patchNode(target, nextHtmlOrNode);
    try {
      if (window.AcroxaHooks) window.AcroxaHooks.run('dom:after-patch', { target: target, strategy: out.strategy, changed: out.changed });
    } catch (_) {}
    return out;
  }

  function _patchNode(target, nextHtmlOrNode) {
    if (!target || !target.parentNode) return { strategy: 'noop', changed: 0 };
    const next = typeof nextHtmlOrNode === 'string' ? _toNode(nextHtmlOrNode) : nextHtmlOrNode;
    if (!next) return { strategy: 'noop', changed: 0 };
    const tId = _isElem(target) && target.getAttribute('data-acrx-id');
    const nId = _isElem(next) && next.getAttribute('data-acrx-id');
    if (_isElem(target) && _isElem(next) && target.tagName === next.tagName && tId && nId && tId === nId) {
      const changed = diffAttrs(target, next);
      const kids = reconcileChildren(target, next);
      return { strategy: 'keyed-diff', changed: changed + kids };
    }
    if (_isElem(target) && _isElem(next) && target.tagName === next.tagName && !tId && !nId) {
      // Same static tag without identity: cheap in-place update.
      if (target.innerHTML !== next.innerHTML) {
        const st = _captureState(target);
        diffAttrs(target, next);
        target.innerHTML = next.innerHTML;
        _restoreState(target, st);
        _rehydrateSubtree(target);
        return { strategy: 'keyed-diff', changed: 1 };
      }
      const changed = diffAttrs(target, next);
      return { strategy: changed ? 'keyed-diff' : 'noop', changed };
    }
    // Fallback: replace exactly this subtree, preserve sibling state.
    const parent = target.parentNode;
    const st = _captureState(parent);
    _disposeSubtree(target);
    const clone = _freshClone(next);
    parent.replaceChild(clone, target);
    _rehydrateSubtree(clone.parentNode || clone);
    _restoreState(parent, st);
    return { strategy: 'replaced', changed: 1 };
  }

  function _committedGeneration(el) {
    try {
      const g = el && el.getAttribute && el.getAttribute('data-acrx-generation');
      const n = g != null ? parseInt(g, 10) : NaN;
      return Number.isFinite(n) ? n : 0;
    } catch (_) { return 0; }
  }

  function _snapshotHtml(el) {
    try { return el.outerHTML; } catch (_) { return null; }
  }

  function _restoreHtml(el, snapshot) {
    try {
      if (!el || !el.parentNode || !snapshot) return false;
      var tpl = document.createElement('template');
      tpl.innerHTML = String(snapshot).trim();
      var next = tpl.content.firstElementChild;
      if (!next) return false;
      _disposeSubtree(el);
      el.parentNode.replaceChild(next, el);
      _rehydrateSubtree(next.parentNode || next);
      return true;
    } catch (_) { return false; }
  }

  function _verifyPatch(el, expectedId) {
    try {
      if (!el || !el.isConnected) return { ok: false, reason: 'target disconnected' };
      if (expectedId) {
        var found = (el.getAttribute && el.getAttribute('data-acrx-id') === expectedId)
          || (el.querySelector && el.querySelector('[data-acrx-id="' + CSS.escape(expectedId) + '"]'));
        if (!found && document.querySelector('[data-acrx-id="' + CSS.escape(expectedId) + '"]') == null) {
          return { ok: false, reason: 'expected boundary missing after patch' };
        }
      }
      return { ok: true };
    } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
  }

  /**
   * Generation-guarded patch with verification + rollback.
   * patchWithGeneration(el, html, { generation }) —
   * stale generations are dropped (never applied), failures roll back to
   * the pre-patch snapshot, unverifiable critical failures report reload.
   */
  function patchWithGeneration(target, html, opts) {
    opts = opts || {};
    var el = typeof target === 'string' ? null : target;
    try {
      if (typeof target === 'string') el = document.querySelector(target);
    } catch (_) { return { action: 'drop', reason: 'unresolvable target' }; }
    if (!el || !el.parentNode) return { action: 'drop', reason: 'target missing' };
    var incoming = Number.isInteger(opts.generation) ? opts.generation : 0;
    var committed = _committedGeneration(el);
    if (incoming && committed && incoming < committed) {
      dbg('GENERATION-DROP', expectedId, 'incoming=' + incoming, 'committed=' + committed);
      return { action: 'drop', reason: 'stale generation ' + incoming + ' < committed ' + committed };
    }
    dbg('PATCH-START', expectedId, 'generation=' + incoming);
    var expectedId = (el.getAttribute && el.getAttribute('data-acrx-id')) || null;
    var snapshot = _snapshotHtml(el);
    var parent = el.parentNode;
    var refNext = el.nextSibling;
    function rollbackDetached() {
      // el was replaced by an unverifiable node: remove the occupant at the
      // recorded slot and restore the pre-patch snapshot in its place.
      try {
        if (!parent || !parent.isConnected || !snapshot) return false;
        var tpl = document.createElement('template');
        tpl.innerHTML = String(snapshot).trim();
        var prev = tpl.content.firstElementChild;
        if (!prev) return false;
        var occupant = null;
        if (refNext && refNext.parentNode === parent) occupant = refNext.previousSibling;
        else occupant = parent.lastChild;
        if (occupant) { try { _disposeSubtree(occupant); } catch (_) {} try { parent.removeChild(occupant); } catch (_) {} }
        if (refNext && refNext.parentNode === parent) parent.insertBefore(_freshClone(prev), refNext);
        else parent.appendChild(_freshClone(prev));
        _rehydrateSubtree(parent);
        return true;
      } catch (_) { return false; }
    }
    var out;
    try {
      out = patchNode(el, html);
      dbg('PATCH-APPLIED', expectedId, 'strategy=' + (out && out.strategy), 'changed=' + (out && out.changed));
    } catch (e) {
      var rolledBack = el.isConnected ? _restoreHtml(el, snapshot) : rollbackDetached();
      dbg('PATCH-ERROR', expectedId, String((e && e.message) || e), 'rolledBack=' + !!rolledBack);
      return { action: rolledBack ? 'drop' : 'reload', reason: 'patch threw: ' + String((e && e.message) || e), rolledBack: rolledBack };
    }
    // Stamp the committed generation so older updates are dropped later.
    try {
      var live = expectedId ? (document.querySelector('[data-acrx-id="' + CSS.escape(expectedId) + '"]') || el) : el;
      if (live && live.setAttribute && incoming) {
        live.setAttribute('data-acrx-generation', String(incoming));
        live.setAttribute('data-acrx-rev', String(incoming));
      }
    } catch (_) {}
    var verify = _verifyPatch(el.isConnected ? el : document.documentElement, expectedId);
    if (!verify.ok) {
      var ok = el.isConnected ? _restoreHtml(el, snapshot) : rollbackDetached();
      dbg('VERIFY-FAIL', expectedId, verify.reason, 'rolledBack=' + !!ok);
      return { action: ok ? 'drop' : 'reload', reason: 'verification failed: ' + verify.reason, rolledBack: ok, strategy: out.strategy };
    }
    dbg('PATCH-OK', expectedId, 'generation=' + incoming);
    return { action: 'patch', strategy: out.strategy, changed: out.changed, generation: incoming };
  }

  // rAF-coalesced queue: rapid updates to the same target collapse so the
  // newest generation supersedes stale ones (no update A/B/C pile-up).
  var _queue = new Map(); // key -> { el|selector, html, generation }
  var _scheduled = false;
  function _flushQueue() {
    _scheduled = false;
    var items = Array.from(_queue.entries());
    _queue.clear();
    dbg('QUEUE-FLUSH', items.length + ' coalesced patch(es)');
    for (var i = 0; i < items.length; i++) {
      var kv = items[i];
      try { patchWithGeneration(kv[1].target, kv[1].html, { generation: kv[1].generation }); } catch (_) {}
    }
  }
  function queuePatch(target, html, opts) {
    opts = opts || {};
    var key = typeof target === 'string' ? target : ((target && target.getAttribute && target.getAttribute('data-acrx-id')) || 'anon');
    var prev = _queue.get(key);
    if (prev && Number.isInteger(prev.generation) && Number.isInteger(opts.generation) && opts.generation < prev.generation) {
      dbg('QUEUE-SKIP', key, 'stale generation=' + opts.generation + ' < queued=' + prev.generation);
      return { queued: false, reason: 'stale — newer patch already queued' };
    }
    if (prev) dbg('QUEUE-COALESCE', key, 'superseded generation=' + prev.generation + ' by ' + (opts.generation || 0));
    _queue.set(key, { target: target, html: html, generation: opts.generation || 0 });
    if (!_scheduled) {
      _scheduled = true;
      try {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(_flushQueue);
        else setTimeout(_flushQueue, 0);
      } catch (_) { setTimeout(_flushQueue, 0); }
    }
    return { queued: true };
  }

  // ─── Server op-list application (AcroxaJS Phase 6 patch protocol) ────────
  // Applies the formal patch envelope ops (setHtml/setAttr/removeAttr/
  // replaceSubtree/insert/remove/move) against the live DOM. Mutate-first:
  // attr/text ops never destroy the element, so focus/selection/input
  // values survive. replaceSubtree delegates to the proven
  // patchWithGeneration path (verify + rollback). Targets resolve by
  // data-acrx-id, then data-acrx-key (el() keyed nodes), then element id.
  function _resolveTarget(id) {
    if (!id || typeof id !== 'string') return null;
    try {
      return document.querySelector('[data-acrx-id="' + CSS.escape(id) + '"]')
        || document.querySelector('[data-acrx-key="' + CSS.escape(id) + '"]')
        || document.getElementById(id);
    } catch (_) { return null; }
  }

  function _setOneAttr(target, name, value) {
    try {
      if (name === 'data-acrx-hydrated') return false;
      if (name === 'value' && 'value' in target && target.value === value) return false;
      if (target.getAttribute(name) === value) return false;
      target.setAttribute(name, value);
      return true;
    } catch (_) { return false; }
  }

  function _removeOneAttr(target, name) {
    try {
      if (name === 'data-acrx-id' || name === 'data-acrx-hydrated') return false;
      if (!target.hasAttribute(name)) return false;
      target.removeAttribute(name);
      return true;
    } catch (_) { return false; }
  }

  function applyOps(ops, opts) {
    opts = opts || {};
    var applied = 0, failed = 0;
    var results = [];
    if (!Array.isArray(ops)) return { applied: 0, failed: 0, results: [] };
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      try {
        if (!op || typeof op !== 'object') { failed++; results.push({ ok: false, reason: 'op must be an object' }); continue; }
        if (op.op === 'setHtml') {
          var el = _resolveTarget(op.target);
          if (!el) { failed++; results.push({ op: op, ok: false, reason: 'target missing' }); continue; }
          var st = _captureState(el);
          var beforeHtml = '';
          try { beforeHtml = String(el.innerHTML || '').slice(0, 200); } catch (_) {}
          // Dispose old keyed children (listener cleanup) before innerHTML
          // replacement orphans them.
          try {
            var keyed = el.querySelectorAll('[data-acrx-id]');
            for (var k = 0; k < keyed.length; k++) _disposeSubtree(keyed[k]);
          } catch (_) {}
          el.innerHTML = String(op.value == null ? '' : op.value);
          _restoreState(el, st);
          _rehydrateSubtree(el);
          applied++; results.push({ op: op, ok: true, before: beforeHtml });
        } else if (op.op === 'setAttr') {
          var elA = _resolveTarget(op.target);
          if (!elA) { failed++; results.push({ op: op, ok: false, reason: 'target missing' }); continue; }
          var beforeAttr = '';
          try { beforeAttr = String(elA.getAttribute(op.name) || '').slice(0, 200); } catch (_) {}
          applied += _setOneAttr(elA, op.name, op.value) ? 1 : 0;
          results.push({ op: op, ok: true, before: beforeAttr });
        } else if (op.op === 'removeAttr') {
          var elR = _resolveTarget(op.target);
          if (!elR) { failed++; results.push({ op: op, ok: false, reason: 'target missing' }); continue; }
          var beforeRA = '';
          try { beforeRA = String(elR.getAttribute(op.name) || '').slice(0, 200); } catch (_) {}
          applied += _removeOneAttr(elR, op.name) ? 1 : 0;
          results.push({ op: op, ok: true, before: beforeRA });
        } else if (op.op === 'replaceSubtree') {
          var elS = _resolveTarget(op.target);
          if (!elS) { failed++; results.push({ op: op, ok: false, reason: 'target missing' }); continue; }
          var beforeSub = '';
          try { beforeSub = String(elS.outerHTML || '').slice(0, 200); } catch (_) {}
          var r = patchWithGeneration(elS, op.html, { generation: opts.generation || 0 });
          if (r.action === 'patch' || r.action === 'drop') { applied++; results.push({ op: op, ok: true, strategy: r.strategy, before: beforeSub }); }
          else { failed++; results.push({ op: op, ok: false, reason: r.reason, reload: r.action === 'reload' }); }
        } else if (op.op === 'insert') {
          var parent = _resolveTarget(op.parent);
          if (!parent) { failed++; results.push({ op: op, ok: false, reason: 'parent missing' }); continue; }
          var node = _toNode(op.html);
          if (!node) { failed++; results.push({ op: op, ok: false, reason: 'invalid html' }); continue; }
          var before = op.before ? _resolveTarget(op.before) : null;
          parent.insertBefore(node, before || null);
          _rehydrateSubtree(node);
          applied++; results.push({ op: op, ok: true });
        } else if (op.op === 'remove') {
          var elD = _resolveTarget(op.target);
          if (!elD || !elD.parentNode) { failed++; results.push({ op: op, ok: false, reason: 'target missing' }); continue; }
          var beforeRm = '';
          try { beforeRm = String(elD.outerHTML || '').slice(0, 200); } catch (_) {}
          _disposeSubtree(elD);
          elD.parentNode.removeChild(elD);
          applied++; results.push({ op: op, ok: true, before: beforeRm });
        } else if (op.op === 'move') {
          var elM = _resolveTarget(op.target);
          if (!elM || !elM.parentNode) { failed++; results.push({ op: op, ok: false, reason: 'target missing' }); continue; }
          var parentM = op.parent ? _resolveTarget(op.parent) : elM.parentNode;
          var beforeM = op.before ? _resolveTarget(op.before) : null;
          (parentM || elM.parentNode).insertBefore(elM, beforeM || null);
          applied++; results.push({ op: op, ok: true });
        } else {
          failed++; results.push({ op: op, ok: false, reason: 'unknown op' });
        }
      } catch (e) {
        failed++;
        results.push({ op: op, ok: false, reason: String((e && e.message) || e) });
      }
    }
    dbg('OPS-APPLIED', applied + ' ok, ' + failed + ' failed');
    return { applied: applied, failed: failed, results: results };
  }

  const api = { patchNode, patchWithGeneration, queuePatch, applyOps, diffAttrs, reconcileChildren };
  if (typeof window !== 'undefined') window.AcroxaDomPatch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
