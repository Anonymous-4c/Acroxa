// acrx/assets/js/editor/engines/widget-definition-engine.js
//
// ENGINE 03 — Widget Definition Engine (headless).
// Describes WHAT a widget is: semantic metadata, capabilities, structural
// contracts and defaults. Blocks answer "what node exists here"; definitions
// answer "what kind of widget is this and what can it do". The definition
// itself is validated by the Schema Engine (foundation composition).

import { createSchemaRegistry } from "./schema-engine.js";

export const WIDGET_DEFINITION_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "widget-definition";

const DEF_SCHEMA = {
  type: "object",
  fields: {
    type: { type: "string", required: true, minLength: 1 },
    category: { type: "string", default: "general" },
    label: { type: "string", required: true },
    icon: { type: "string", default: "" },
    description: { type: "string", default: "" },
    version: { type: "integer", minimum: 1, default: 1 },
    kind: { type: "string", enum: ["container", "content", "atomic"], default: "content" },
    capabilities: {
      type: "object",
      additionalProperties: true,
      default: {},
      fields: {
        editable: { type: "boolean", default: false },
        draggable: { type: "boolean", default: true },
        resizable: { type: "boolean", default: false },
        nestable: { type: "boolean", default: false },
        deletable: { type: "boolean", default: true },
        duplicable: { type: "boolean", default: true },
      },
    },
    allowedParents: { type: "array", items: "string", default: [] },
    allowedChildren: { type: "array", items: "string", default: [] },
    defaults: { type: "object", additionalProperties: true, default: {} },
    settingsSchema: { type: "object", additionalProperties: true, nullable: true, default: null },
    renderer: { type: "string", default: "" },
  },
};

function defError(operation, code, message) {
  const err = new Error(message);
  err.name = "WidgetDefinitionError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

export function createWidgetDefinitionEngine(options = {}) {
  const schemas = options.schemaRegistry || createSchemaRegistry();
  const defs = new Map(); // type -> Map(version -> def)
  const listeners = new Map();

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try { cb({ engine: ENGINE_ID, event, ...payload }); } catch (err) {
        if (typeof console !== "undefined") console.error(`[widget-definition] listener for "${event}" threw:`, err);
      }
    }
  }

  function latest(type) {
    const byV = defs.get(type);
    if (!byV) return null;
    return Math.max(...byV.keys());
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return WIDGET_DEFINITION_ENGINE_VERSION; },

    register(raw) {
      if (!raw || typeof raw !== "object") throw defError("register", "INVALID_DEFINITION", "Definition must be an object.");
      const schemaName = "widget-def";
      if (!schemas.has(schemaName)) schemas.register({ name: schemaName, version: 1, ...DEF_SCHEMA });
      const withDefaults = schemas.applyDefaults(schemaName, JSON.parse(JSON.stringify(raw)));
      const check = schemas.validate(schemaName, withDefaults);
      if (!check.valid) {
        throw defError("register", "INVALID_DEFINITION", `Invalid widget definition: ${check.errors[0].message} (${check.errors[0].path}).`);
      }
      const def = Object.freeze(JSON.parse(JSON.stringify(withDefaults)));
      let byV = defs.get(def.type);
      if (!byV) { byV = new Map(); defs.set(def.type, byV); }
      byV.set(def.version, def);
      emit("definition:registered", { type: def.type, version: def.version });
      return JSON.parse(JSON.stringify(def));
    },

    has(type, version) {
      const byV = defs.get(type);
      if (!byV) return false;
      if (version === undefined || version === null) return byV.size > 0;
      return byV.has(version);
    },

    get(type, version) {
      const byV = defs.get(type);
      if (!byV) return null;
      const v = version === undefined || version === null ? latest(type) : version;
      const def = byV.get(v);
      return def ? JSON.parse(JSON.stringify(def)) : null;
    },

    versions(type) {
      const byV = defs.get(type);
      return byV ? [...byV.keys()].sort((a, b) => a - b) : [];
    },

    list() {
      const out = [];
      for (const [type, byV] of defs) {
        for (const version of [...byV.keys()].sort((a, b) => a - b)) {
          const d = byV.get(version);
          out.push({ type, version, category: d.category, label: d.label, icon: d.icon, description: d.description });
        }
      }
      return out.sort((a, b) => (a.type < b.type ? -1 : 1));
    },

    categories() {
      const set = new Set();
      for (const byV of defs.values()) for (const d of byV.values()) set.add(d.category);
      return [...set].sort();
    },

    byCategory(category) {
      return engine.list().filter((d) => {
        const full = engine.get(d.type, d.version);
        return full && full.category === category;
      });
    },

    unregister(type, version) {
      const byV = defs.get(type);
      if (!byV) return false;
      let removed;
      if (version === undefined || version === null) removed = defs.delete(type);
      else {
        removed = byV.delete(version);
        if (byV.size === 0) defs.delete(type);
      }
      if (removed) emit("definition:unregistered", { type, version: version ?? null });
      return removed;
    },

    capabilitiesOf(type) {
      const def = engine.get(type);
      if (!def) throw defError("capabilitiesOf", "UNKNOWN_WIDGET", `Unknown widget type "${type}".`);
      return { ...def.capabilities };
    },

    can(type, capability) {
      const caps = engine.capabilitiesOf(type);
      return caps[capability] === true;
    },

    defaultsOf(type) {
      const def = engine.get(type);
      if (!def) throw defError("defaultsOf", "UNKNOWN_WIDGET", `Unknown widget type "${type}".`);
      return JSON.parse(JSON.stringify(def.defaults));
    },

    settingsSchemaOf(type) {
      const def = engine.get(type);
      if (!def) throw defError("settingsSchemaOf", "UNKNOWN_WIDGET", `Unknown widget type "${type}".`);
      return def.settingsSchema ? JSON.parse(JSON.stringify(def.settingsSchema)) : null;
    },

    rendererOf(type) {
      const def = engine.get(type);
      if (!def) throw defError("rendererOf", "UNKNOWN_WIDGET", `Unknown widget type "${type}".`);
      return def.renderer || null;
    },

    on(event, cb) {
      if (typeof cb !== "function") throw defError("on", "INVALID_LISTENER", "Listener must be a function.");
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => engine.off(event, cb);
    },

    off(event, cb) {
      const set = listeners.get(event);
      if (!set) return;
      if (cb) { set.delete(cb); if (set.size === 0) listeners.delete(event); }
      else listeners.delete(event);
    },

    clear() {
      defs.clear();
    },

    destroy() {
      defs.clear();
      listeners.clear();
    },
  };

  return engine;
}

export default createWidgetDefinitionEngine;
