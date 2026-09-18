// acrx/assets/js/editor/engines/widget-renderer-registry.js
//
// ENGINE 15 — Widget Renderer Registry (headless).
// Registration separate from the renderer runtime: register/unregister,
// resolve by widget type (+mode), contract validation, metadata, versioning
// and a fallback renderer. Holds references only — never renders.

export const RENDERER_REGISTRY_VERSION = "1.0.0";
export const ENGINE_ID = "widget-renderer-registry";

function regError(operation, code, message) {
  const err = new Error(message);
  err.name = "RendererRegistryError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

export function createWidgetRendererRegistry() {
  const renderers = new Map(); // `${type}:${mode}` -> entry; mode '*' = any
  let fallback = null;
  const listeners = new Map();

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try { cb({ engine: ENGINE_ID, event, ...payload }); } catch (err) {
        if (typeof console !== "undefined") console.error(`[renderer-registry] listener for "${event}" threw:`, err);
      }
    }
  }

  const key = (type, mode) => `${type}:${mode || "*"}`;

  const registry = {
    get engine() { return ENGINE_ID; },
    get version() { return RENDERER_REGISTRY_VERSION; },

    register(type, render, opts = {}) {
      if (typeof type !== "string" || type === "") throw regError("register", "INVALID_TYPE", "Renderer type must be a non-empty string.");
      if (typeof render !== "function") throw regError("register", "INVALID_RENDERER", `Renderer for "${type}" must be a function returning an HTML string.`);
      const mode = opts.mode || "*";
      const entry = {
        type, mode,
        version: opts.version || "1.0.0",
        label: opts.label || type,
        description: opts.description || "",
        render,
      };
      const existed = renderers.has(key(type, mode));
      renderers.set(key(type, mode), entry);
      emit("renderer:registered", { type, mode, version: entry.version, updated: existed });
      return { type, mode, version: entry.version };
    },

    unregister(type, mode) {
      const removed = renderers.delete(key(type, mode));
      if (removed) emit("renderer:unregistered", { type, mode: mode || "*" });
      return removed;
    },

    has(type, mode) {
      return renderers.has(key(type, mode)) || (!mode && renderers.has(key(type, "*")));
    },

    resolve(type, mode) {
      if (mode && renderers.has(key(type, mode))) return renderers.get(key(type, mode));
      if (renderers.has(key(type, "*"))) return renderers.get(key(type, "*"));
      return fallback;
    },

    setFallback(render, meta = {}) {
      if (render !== null && typeof render !== "function") {
        throw regError("setFallback", "INVALID_RENDERER", "Fallback renderer must be a function or null.");
      }
      fallback = render
        ? { type: "*", mode: "*", version: meta.version || "1.0.0", label: meta.label || "fallback", description: meta.description || "", render }
        : null;
    },

    getFallback() {
      return fallback;
    },

    list() {
      return [...renderers.values()]
        .map((e) => ({ type: e.type, mode: e.mode, version: e.version, label: e.label, description: e.description }))
        .sort((a, b) => (a.type < b.type ? -1 : 1));
    },

    on(event, cb) {
      if (typeof cb !== "function") throw regError("on", "INVALID_LISTENER", "Listener must be a function.");
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => registry.off(event, cb);
    },

    off(event, cb) {
      const set = listeners.get(event);
      if (!set) return;
      if (cb) { set.delete(cb); if (set.size === 0) listeners.delete(event); }
      else listeners.delete(event);
    },

    clear() {
      renderers.clear();
      fallback = null;
    },

    destroy() {
      renderers.clear();
      fallback = null;
      listeners.clear();
    },
  };

  return registry;
}

export default createWidgetRendererRegistry;
