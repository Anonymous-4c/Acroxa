// acrx/assets/js/editor/engines/widget-settings-engine.js
//
// ENGINE 04 — Widget Settings Engine (headless).
// Data-driven persistent settings: schema definition, validation, read/update,
// reset, defaults, normalization, dependencies (visibleIf), groups and
// constraints. Produces the metadata the future inspector UI renders —
// it never renders controls itself.

import { createSchemaRegistry } from "./schema-engine.js";

export const WIDGET_SETTINGS_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "widget-settings";

// UI-hint keys carried alongside schema-engine field keywords. They are
// stripped before structural validation and re-attached for inspector output.
const HINT_KEYS = new Set(["group", "control", "order", "visibleIf", "hint", "collapsed"]);

function settingsError(operation, code, message) {
  const err = new Error(message);
  err.name = "WidgetSettingsError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

function splitHints(fields) {
  const clean = {};
  const hints = {};
  for (const key of Object.keys(fields || {})) {
    const field = { ...(fields[key] && typeof fields[key] === "object" ? fields[key] : { type: "string" }) };
    const hint = {};
    for (const hk of HINT_KEYS) {
      if (field[hk] !== undefined) { hint[hk] = field[hk]; delete field[hk]; }
    }
    clean[key] = field;
    hints[key] = hint;
  }
  return { clean, hints };
}

function getPathValue(obj, path) {
  if (!path) return undefined;
  return String(path).split(".").reduce((acc, seg) => (acc && typeof acc === "object" ? acc[seg] : undefined), obj);
}

function conditionMet(condition, values) {
  if (!condition) return true;
  if (Array.isArray(condition)) return condition.every((c) => conditionMet(c, values));
  if (typeof condition === "function") {
    try { return !!condition(values); } catch { return false; }
  }
  if (typeof condition === "object") {
    const actual = getPathValue(values, condition.field);
    if ("equals" in condition) return actual === condition.equals;
    if ("notEquals" in condition) return actual !== condition.notEquals;
    if ("in" in condition) return Array.isArray(condition.in) && condition.in.includes(actual);
    if ("truthy" in condition) return !!actual === !!condition.truthy;
  }
  return true;
}

export function createWidgetSettingsEngine(options = {}) {
  const schemas = options.schemaRegistry || createSchemaRegistry();
  // Duck-typed widget definitions (for settingsSchema lookup).
  const definitions = options.definitions || null;

  function schemaNameFor(type) {
    return `settings.${type}`;
  }

  function ensureSchema(type, settingsSchema) {
    let schema = settingsSchema || null;
    if (!schema && definitions) {
      try {
        schema = definitions.settingsSchemaOf ? definitions.settingsSchemaOf(type) : definitions.get(type)?.settingsSchema || null;
      } catch { schema = null; }
    }
    if (!schema) throw settingsError("schema", "NO_SETTINGS_SCHEMA", `No settings schema for widget type "${type}".`);
    const { clean, hints } = splitHints(schema.fields || {});
    const name = schemaNameFor(type);
    schemas.register({ name, version: 1, type: "object", fields: clean, additionalProperties: false });
    return { name, hints, raw: schema };
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return WIDGET_SETTINGS_ENGINE_VERSION; },

    defineSettingsSchema(type, settingsSchema) {
      if (!settingsSchema || typeof settingsSchema !== "object") {
        throw settingsError("defineSettingsSchema", "INVALID_SCHEMA", "Settings schema must be an object.");
      }
      return ensureSchema(type, settingsSchema);
    },

    validateSettings(type, values, settingsSchema) {
      const { name } = ensureSchema(type, settingsSchema);
      const res = schemas.validate(name, values || {});
      return { valid: res.valid, errors: res.errors, warnings: res.warnings };
    },

    getSettings(type, values, settingsSchema) {
      const { name } = ensureSchema(type, settingsSchema);
      const merged = schemas.applyDefaults(name, values ? JSON.parse(JSON.stringify(values)) : {});
      return merged || {};
    },

    updateSettings(type, current, patch, settingsSchema) {
      if (!patch || typeof patch !== "object") {
        throw settingsError("updateSettings", "INVALID_PATCH", "Settings patch must be an object.");
      }
      const next = { ...engine.getSettings(type, current, settingsSchema), ...JSON.parse(JSON.stringify(patch)) };
      const check = engine.validateSettings(type, next, settingsSchema);
      if (!check.valid) {
        throw settingsError("updateSettings", "INVALID_SETTINGS", `Invalid settings: ${check.errors[0].message} (${check.errors[0].path}).`);
      }
      return next;
    },

    resetSettings(type, settingsSchema) {
      const { name } = ensureSchema(type, settingsSchema);
      return schemas.applyDefaults(name, {}) || {};
    },

    normalizeSettings(type, values, settingsSchema) {
      // Fill defaults, drop unknown keys, validate; returns canonical values.
      const { name } = ensureSchema(type, settingsSchema);
      const filled = schemas.applyDefaults(name, values ? JSON.parse(JSON.stringify(values)) : {}) || {};
      const res = schemas.validate(name, filled, { stripUnknown: true });
      if (!res.valid) {
        throw settingsError("normalizeSettings", "INVALID_SETTINGS", `Invalid settings: ${res.errors[0].message} (${res.errors[0].path}).`);
      }
      return res.value;
    },

    visibleFields(type, values, settingsSchema) {
      const { hints } = ensureSchema(type, settingsSchema);
      const vals = values || {};
      return Object.keys(hints).filter((key) => conditionMet(hints[key].visibleIf, vals));
    },

    settingsGroups(type, settingsSchema) {
      const { hints } = ensureSchema(type, settingsSchema);
      const groups = {};
      for (const key of Object.keys(hints)) {
        const g = hints[key].group || "general";
        if (!groups[g]) groups[g] = [];
        groups[g].push(key);
      }
      const orders = {};
      for (const key of Object.keys(hints)) orders[key] = hints[key].order !== undefined ? hints[key].order : 0;
      for (const g of Object.keys(groups)) groups[g].sort((a, b) => orders[a] - orders[b]);
      return groups;
    },

    // Inspector-ready metadata: [{ name, ...fieldDef, ...hints, visible }].
    describeSettings(type, values, settingsSchema) {
      const { name, hints } = ensureSchema(type, settingsSchema);
      const def = schemas.get(name);
      const vals = values || {};
      const visible = new Set(engine.visibleFields(type, vals, settingsSchema));
      return Object.keys(def.fields || {}).map((key) => ({
        name: key,
        ...JSON.parse(JSON.stringify(def.fields[key])),
        group: hints[key]?.group || "general",
        control: hints[key]?.control || null,
        hint: hints[key]?.hint || "",
        order: hints[key]?.order !== undefined ? hints[key].order : 0,
        visible: visible.has(key),
        value: vals[key],
      }));
    },
  };

  return engine;
}

export default createWidgetSettingsEngine;
