// acrx/assets/js/editor/engines/widget-state-engine.js
//
// ENGINE 05 — Widget State Engine (headless).
// Transient runtime state, strictly separated from persistent settings:
// interaction flags (selected/focused/hovered/open/loading/...), arbitrary
// runtime keys, subscriptions, reset and JSON-safe serialization.

export const WIDGET_STATE_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "widget-state";

function stateError(operation, code, message) {
  const err = new Error(message);
  err.name = "WidgetStateError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

function isJsonSafe(value) {
  if (value === undefined || typeof value === "function") return false;
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "boolean" || t === "number") return Number.isFinite(value) || t !== "number" ? true : false;
  if (Array.isArray(value)) return value.every(isJsonSafe);
  if (t === "object") return Object.keys(value).every((k) => isJsonSafe(value[k]));
  return false;
}

export function createWidgetStateEngine() {
  const states = new Map(); // widgetId -> object
  const subs = new Map(); // widgetId|'*' -> Set<cb>

  function notify(widgetId, patch, next) {
    for (const key of [widgetId, "*"]) {
      const set = subs.get(key);
      if (!set) continue;
      const ctx = { engine: ENGINE_ID, event: "state:changed", widgetId, patch: { ...patch }, state: { ...next } };
      for (const cb of [...set]) {
        try { cb(ctx); } catch (err) {
          if (typeof console !== "undefined") console.error(`[widget-state] listener threw:`, err);
        }
      }
    }
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return WIDGET_STATE_ENGINE_VERSION; },

    set(widgetId, patch) {
      if (!widgetId) throw stateError("set", "INVALID_ID", "Widget id is required.");
      if (!patch || typeof patch !== "object") throw stateError("set", "INVALID_PATCH", "State patch must be an object.");
      const next = { ...(states.get(widgetId) || {}), ...JSON.parse(JSON.stringify(patch)) };
      states.set(widgetId, next);
      notify(widgetId, patch, next);
      return { ...next };
    },

    get(widgetId) {
      return { ...(states.get(widgetId) || {}) };
    },

    getKey(widgetId, key, fallback) {
      const s = states.get(widgetId) || {};
      return s[key] === undefined ? fallback : s[key];
    },

    setFlag(widgetId, flag, on = true) {
      return engine.set(widgetId, { [flag]: !!on });
    },

    // Conventional interaction flags.
    setSelected(widgetId, on = true) { return engine.setFlag(widgetId, "selected", on); },
    setFocused(widgetId, on = true) { return engine.setFlag(widgetId, "focused", on); },
    setHovered(widgetId, on = true) { return engine.setFlag(widgetId, "hovered", on); },
    setOpen(widgetId, on = true) { return engine.setFlag(widgetId, "open", on); },
    setLoading(widgetId, on = true) { return engine.setFlag(widgetId, "loading", on); },

    isSelected(widgetId) { return engine.getKey(widgetId, "selected", false) === true; },
    isFocused(widgetId) { return engine.getKey(widgetId, "focused", false) === true; },

    reset(widgetId) {
      const had = states.delete(widgetId);
      if (had) notify(widgetId, {}, {});
      return had;
    },

    clear() {
      states.clear();
    },

    ids() {
      return [...states.keys()];
    },

    subscribe(widgetIdOrStar, cb) {
      const key = widgetIdOrStar || "*";
      if (typeof cb !== "function") throw stateError("subscribe", "INVALID_LISTENER", "Listener must be a function.");
      if (!subs.has(key)) subs.set(key, new Set());
      subs.get(key).add(cb);
      return () => engine.unsubscribe(key, cb);
    },

    unsubscribe(key, cb) {
      const set = subs.get(key);
      if (!set) return;
      if (cb) { set.delete(cb); if (set.size === 0) subs.delete(key); }
      else subs.delete(key);
    },

    // Only JSON-safe entries survive; functions/symbols are dropped by design
    // (transient callbacks must never leak into persisted state).
    serialize() {
      const out = {};
      for (const [wid, state] of states) {
        const clean = {};
        for (const key of Object.keys(state)) {
          if (isJsonSafe(state[key])) clean[key] = JSON.parse(JSON.stringify(state[key]));
        }
        out[wid] = clean;
      }
      return out;
    },

    destroy() {
      states.clear();
      subs.clear();
    },
  };

  return engine;
}

export default createWidgetStateEngine;
