// src/core/layoutHelpers.js
// Manages active layout state + deep schema utilities for the meta system.

const fs   = require("fs");
const path = require("path");

const ACTIVE_FILE = path.join(__dirname, "../../.active-layout.json");

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL STATE
// ─────────────────────────────────────────────────────────────────────────────

let state = {
  activeLayout: null,
  meta:         {},
  lastUpdated:  Date.now(),
  changeId:     0,
};

// ─────────────────────────────────────────────────────────────────────────────
// READ / SAVE ACTIVE FILE
// ─────────────────────────────────────────────────────────────────────────────

function readActiveFile() {
  try {
    if (!fs.existsSync(ACTIVE_FILE)) return null;
    const raw = fs.readFileSync(ACTIVE_FILE, "utf8");
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw);
    const id   = typeof parsed === "string" ? parsed : parsed?.id || parsed?.activeLayout || null;
    const meta = parsed?.meta || {};
    state.activeLayout = id;
    state.meta         = meta;
    return { id, meta };
  } catch {
    return null;
  }
}

function saveActiveLayout() {
  try {
    fs.writeFileSync(
      ACTIVE_FILE,
      JSON.stringify({ id: state.activeLayout, meta: state.meta || {}, updatedAt: Date.now() }, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("[LayoutHelper] Failed saving active layout:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SET / GET ACTIVE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

function setActiveLayout(layoutId, meta = {}) {
  if (!layoutId || typeof layoutId !== "string") {
    throw new Error("setActiveLayout requires a valid layout ID");
  }
  state.activeLayout = layoutId;
  state.meta         = meta || {};
  state.lastUpdated  = Date.now();
  state.changeId++;
  saveActiveLayout();
  console.log(`[LayoutHelper] Active layout set → ${layoutId}`);
  return layoutId;
}

function getActiveLayout()     { return readActiveFile()?.id   || state.activeLayout || null; }
function getActiveLayoutMeta() { return readActiveFile()?.meta || state.meta         || {}; }
function reloadActiveLayout()  { return readActiveFile(); }
function getState()            { return state; }

// ─────────────────────────────────────────────────────────────────────────────
// DEEP OBJECT UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a value at a dot-notation path.
 * getDeep({ a: { b: 1 } }, "a.b") → 1
 */
function getDeep(obj, pathStr) {
  if (!obj || !pathStr) return undefined;
  return pathStr.split(".").reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

/**
 * Set a value at a dot-notation path, creating intermediate objects.
 * Mutates a shallow clone — does NOT mutate the original.
 */
function setDeep(obj, pathStr, value) {
  const out  = mergeDeep({}, obj);
  const keys = pathStr.split(".");
  let   cur  = out;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return out;
}

/**
 * Deep merge two plain objects. Arrays from source replace target arrays.
 */
function mergeDeep(target, source) {
  if (typeof target !== "object" || target === null) return source;
  if (typeof source !== "object" || source === null) return source;
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const k of Object.keys(source)) {
    if (
      typeof source[k] === "object" &&
      !Array.isArray(source[k]) &&
      source[k] !== null &&
      typeof target[k] === "object" &&
      !Array.isArray(target[k]) &&
      target[k] !== null
    ) {
      out[k] = mergeDeep(target[k], source[k]);
    } else {
      out[k] = source[k];
    }
  }
  return out;
}

/**
 * Flatten a nested object to dot-notation keys.
 * { a: { b: 1 } } → { "a.b": 1 }
 */
function flattenObject(obj, prefix = "", result = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flattenObject(v, key, result);
    } else {
      result[key] = v;
    }
  }
  return result;
}

/**
 * Infer a field type string from a JS value.
 */
function inferFieldType(value) {
  if (value === null || value === undefined) return "text";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number")  return "number";
  if (typeof value === "string") {
    if (/^#[0-9a-f]{3,8}$/i.test(value))       return "color";
    if (/^rgba?\(/.test(value))                 return "color";
    if (value.includes("\n"))                   return "textarea";
    return "text";
  }
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "text";
}

/**
 * Auto-generate a schema field descriptor from an unknown value.
 * Used when a user or plugin adds a field not in the original meta.json schema.
 */
function generateSchemaFromValue(value, key = "") {
  const type = inferFieldType(value);

  const base = {
    type,
    default: value,
    label:   humanizeKey(key),
  };

  if (type === "number") {
    // Guess sensible range from value
    const abs = Math.abs(value);
    if (abs <= 1)        { base.min = 0;   base.max = 1;    base.step = 0.01; base.type = "range"; }
    else if (abs <= 100) { base.min = 0;   base.max = 100;  base.step = 1;    base.type = "range"; }
    else if (abs <= 2000){ base.min = 0;   base.max = 2000; base.step = 100;  base.type = "range"; }
  }

  if (type === "boolean") {
    base.type = "boolean";
  }

  if (type === "object") {
    // Recurse and generate sub-schema
    base.type   = "group";
    base.fields = {};
    for (const [k, v] of Object.entries(value || {})) {
      base.fields[k] = generateSchemaFromValue(v, k);
    }
  }

  if (type === "array") {
    base.type = "array";
  }

  return base;
}

/**
 * Convert a camelCase or snake_case key to a human-readable label.
 */
function humanizeKey(key = "") {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Walk a meta.config schema object and extract leaf `default` values.
 * Used by LayoutEngine._extractMetaDefaults().
 */
function extractMetaDefaults(schema) {
  const result = {};
  for (const key of Object.keys(schema || {})) {
    const val = schema[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      if ("default" in val || "type" in val) {
        result[key] = val.default ?? null;
      } else {
        result[key] = extractMetaDefaults(val);
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL LOAD
// ─────────────────────────────────────────────────────────────────────────────

readActiveFile();

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

const LayoutHelpers = {
  // State management
  setActiveLayout,
  getActiveLayout,
  getActiveLayoutMeta,
  reloadActiveLayout,
  getState,
  state,

  // Deep utilities
  getDeep,
  setDeep,
  mergeDeep,
  flattenObject,
  inferFieldType,
  generateSchemaFromValue,
  extractMetaDefaults,
  humanizeKey,
};

global.Layout = LayoutHelpers;

module.exports = LayoutHelpers;