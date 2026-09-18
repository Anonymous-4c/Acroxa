// acrx/assets/js/acrx-update-guard.js — AcroxaJS shared live-update guard (v1).
// Decides whether an incoming live update may apply RIGHT NOW. Subsystems
// hold named locks while unsafe (unsaved edits, in-flight saves). Consumers
// (admin runtime swap, customizer preview refresh) call canPatch() and defer
// + stale-mark when denied. Loaded before acrx-admin-runtime.js.

(function UpdateGuard() {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.AcroxaUpdateGuard && window.AcroxaUpdateGuard.__v === 1) return;

  var locks = new Map(); // name -> reason (insertion-ordered for stable reporting)

  function lock(name, reason) {
    if (!name) return false;
    locks.set(String(name), String(reason || 'busy'));
    return true;
  }

  function unlock(name) {
    if (!name) return false;
    return locks.delete(String(name));
  }

  function locked() {
    var out = [];
    locks.forEach(function (reason, name) { out.push({ name: name, reason: reason }); });
    return out;
  }

  // Built-in editor check via the editor's PUBLIC surface only
  // (window.AcroxaEditor {booted, editor.isDirty}, #editor-canvas focus).
  // Never reaches into controller closures.
  function editorBlock() {
    try {
      var ed = window.AcroxaEditor;
      if (!ed || !ed.booted) return null;
      if (ed.editor && ed.editor.isDirty) return 'editor-dirty';
      var canvas = document.getElementById('editor-canvas');
      if (canvas && canvas.contains(document.activeElement)) return 'editor-focused';
    } catch (_) {}
    return null;
  }

  function canPatch() {
    if (locks.size) {
      var first = locks.entries().next().value;
      return { ok: false, reason: 'locked:' + first[0] + ':' + first[1] };
    }
    var eb = editorBlock();
    if (eb) return { ok: false, reason: eb };
    return { ok: true };
  }

  window.AcroxaUpdateGuard = {
    __v: 1,
    lock: lock,
    unlock: unlock,
    locked: locked,
    canPatch: canPatch,
  };
})();
