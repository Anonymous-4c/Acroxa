// acrx/assets/js/editor/engines/focus-engine.js
//
// ENGINE 36 — Focus Engine (headless).
// Tracks editor/widget/text focus as data: current focus, restoration stack,
// focus transitions with reasons, keyboard-navigation helpers and events.
// The DOM keeps real browser focus; this engine owns the model of it.

export const FOCUS_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "focus";

function focusError(operation, code, message) {
  const err = new Error(message);
  err.name = "FocusError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

export function createFocusEngine(options = {}) {
  const trailLimit = options.trailLimit && options.trailLimit > 0 ? Math.floor(options.trailLimit) : 20;
  let current = null; // { id, kind, at }
  const trail = [];
  const listeners = new Set();

  function notify(event, payload) {
    for (const cb of [...listeners]) {
      try { cb({ engine: ENGINE_ID, event, ...payload }); } catch (err) {
        if (typeof console !== "undefined") console.error("[focus] listener threw:", err);
      }
    }
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return FOCUS_ENGINE_VERSION; },

    focus(id, opts = {}) {
      if (typeof id !== "string" || id === "") throw focusError("focus", "INVALID_ID", "Focus target requires a non-empty string id.");
      const kind = opts.kind || "widget";
      if (!["editor", "widget", "text"].includes(kind)) throw focusError("focus", "INVALID_KIND", `Unknown focus kind "${kind}".`);
      const prev = current ? { ...current } : null;
      if (prev) {
        trail.push(prev);
        if (trail.length > trailLimit) trail.splice(0, trail.length - trailLimit);
      }
      current = { id, kind, at: new Date().toISOString(), reason: opts.reason || null };
      notify("focus:changed", { previous: prev, current: { ...current } });
      return { ...current };
    },

    blur(reason) {
      const prev = current ? { ...current } : null;
      current = null;
      notify("focus:blurred", { previous: prev, reason: reason || null });
      return prev;
    },

    current() {
      return current ? { ...current } : null;
    },

    hasFocus(id) {
      return !!current && (id === undefined || current.id === id);
    },

    // Pop the trail and re-focus the most recent different target.
    restore() {
      while (trail.length > 0) {
        const candidate = trail.pop();
        if (!current || candidate.id !== current.id) {
          const prev = current ? { ...current } : null;
          current = { ...candidate, at: new Date().toISOString(), reason: "restore" };
          notify("focus:changed", { previous: prev, current: { ...current } });
          return { ...current };
        }
      }
      return current ? { ...current } : null;
    },

    trail() {
      return trail.map((t) => ({ ...t }));
    },

    // Keyboard navigation over an ordered id list (arrow-key handling lives
    // in the keyboard engine; this resolves the next target + moves focus).
    focusNext(ids, opts = {}) {
      if (!Array.isArray(ids) || ids.length === 0) throw focusError("focusNext", "INVALID_IDS", "Provide a non-empty ordered id list.");
      const wrap = opts.wrap !== false;
      let idx = current ? ids.indexOf(current.id) : -1;
      idx = idx < 0 ? 0 : idx + 1;
      if (idx >= ids.length) idx = wrap ? 0 : ids.length - 1;
      return engine.focus(ids[idx], { kind: opts.kind || "widget", reason: "keyboard-next" });
    },

    focusPrev(ids, opts = {}) {
      if (!Array.isArray(ids) || ids.length === 0) throw focusError("focusPrev", "INVALID_IDS", "Provide a non-empty ordered id list.");
      const wrap = opts.wrap !== false;
      let idx = current ? ids.indexOf(current.id) : ids.length;
      idx = idx <= 0 ? (wrap ? ids.length - 1 : 0) : idx - 1;
      return engine.focus(ids[idx], { kind: opts.kind || "widget", reason: "keyboard-prev" });
    },

    subscribe(cb) {
      if (typeof cb !== "function") throw focusError("subscribe", "INVALID_LISTENER", "Listener must be a function.");
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    clear() {
      current = null;
      trail.length = 0;
    },

    destroy() {
      current = null;
      trail.length = 0;
      listeners.clear();
    },
  };

  return engine;
}

export default createFocusEngine;
