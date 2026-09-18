// acrx/assets/js/editor/engines/style-engine.js
//
// ENGINE 18 — Style Engine (headless).
// Semantic style data is the source of truth; CSS output is derived.
// Typography, colors, backgrounds, borders, shadows, spacing, sizing,
// effects, value normalization, inheritance (merge), responsive-agnostic core
// (per-breakpoint values live in the Responsive Engine) and serialization.

export const STYLE_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "style";

function styleError(operation, code, message) {
  const err = new Error(message);
  err.name = "StyleError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_FULL = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;

export function normalizeColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  const short = HEX_SHORT.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (HEX_FULL.test(v)) return v;
  if (/^(rgb|hsl)a?\(/.test(v)) return v.replace(/\s+/g, " ").trim();
  if (v === "transparent" || v === "inherit" || v === "initial") return v;
  return null;
}

export function normalizeLength(value) {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "auto" || v === "inherit" || v === "initial" || v === "100%") return v;
  const m = /^(-?\d+(?:\.\d+)?)(px|em|rem|%|vw|vh|pt)?$/.exec(v);
  if (!m) return null;
  return `${m[1]}${m[2] || "px"}`;
}

const STYLE_FIELDS = new Set([
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "textAlign", "textColor",
  "backgroundColor", "backgroundImage", "borderWidth", "borderStyle", "borderColor",
  "borderRadius", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "width", "height", "opacity", "boxShadow",
]);

export function normalizeStyle(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of Object.keys(src)) {
    if (!STYLE_FIELDS.has(key)) continue; // unknown style keys are dropped, never stored
    const value = src[key];
    if (value === undefined || value === null || value === "") continue;
    if (key === "textColor" || key === "backgroundColor" || key === "borderColor") {
      const c = normalizeColor(value);
      if (c) out[key] = c;
    } else if (key === "opacity") {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = Math.max(0, Math.min(1, n));
    } else if (key === "fontWeight") {
      out[key] = value;
    } else if (/^(margin|padding|border|width|height|fontSize|lineHeight|Radius)/.test(key) || key === "borderRadius") {
      const l = normalizeLength(value);
      if (l) out[key] = l;
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

// Inheritance: child wins; empty child values fall back to the parent.
export function mergeStyles(parent = {}, child = {}) {
  const p = normalizeStyle(parent);
  const c = normalizeStyle(child);
  return { ...p, ...c };
}

const CSS_PROP = {
  fontFamily: "font-family", fontSize: "font-size", fontWeight: "font-weight",
  lineHeight: "line-height", textAlign: "text-align", textColor: "color",
  backgroundColor: "background-color", backgroundImage: "background-image",
  borderWidth: "border-width", borderStyle: "border-style", borderColor: "border-color",
  borderRadius: "border-radius", marginTop: "margin-top", marginRight: "margin-right",
  marginBottom: "margin-bottom", marginLeft: "margin-left", paddingTop: "padding-top",
  paddingRight: "padding-right", paddingBottom: "padding-bottom", paddingLeft: "padding-left",
  width: "width", height: "height", opacity: "opacity", boxShadow: "box-shadow",
};

export function styleToCSS(style) {
  const normalized = normalizeStyle(style);
  const parts = [];
  for (const key of Object.keys(CSS_PROP)) {
    if (normalized[key] !== undefined) parts.push(`${CSS_PROP[key]}:${normalized[key]}`);
  }
  return parts.join(";");
}

export function styleToCSSProperties(style) {
  const normalized = normalizeStyle(style);
  const props = {};
  for (const key of Object.keys(CSS_PROP)) {
    if (normalized[key] !== undefined) props[CSS_PROP[key]] = String(normalized[key]);
  }
  return props;
}

export function validateStyle(style) {
  const errors = [];
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    return { valid: false, errors: [{ code: "INVALID_STYLE", path: "", message: "Style must be an object.", severity: "error" }], warnings: [] };
  }
  for (const key of Object.keys(style)) {
    if (!STYLE_FIELDS.has(key)) {
      errors.push({ code: "UNKNOWN_STYLE_PROP", path: key, message: `Unknown style property "${key}".`, severity: "error" });
    }
  }
  const normalized = normalizeStyle(style);
  for (const key of ["textColor", "backgroundColor", "borderColor"]) {
    if (style[key] !== undefined && style[key] !== "" && normalized[key] === undefined) {
      errors.push({ code: "BAD_COLOR", path: key, message: `Invalid color value "${style[key]}".`, severity: "error" });
    }
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function createStyleEngine() {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return STYLE_ENGINE_VERSION; },
    normalize: normalizeStyle,
    normalizeColor,
    normalizeLength,
    merge: mergeStyles,
    toCSS: styleToCSS,
    toCSSProperties: styleToCSSProperties,
    validate: validateStyle,
  };
}

export default createStyleEngine;
