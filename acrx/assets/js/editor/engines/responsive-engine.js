// acrx/assets/js/editor/engines/responsive-engine.js
//
// ENGINE 19 — Responsive Engine (headless).
// Breakpoint-aware values: { base, mobile?, tablet?, desktop? } with fallback
// inheritance (exact -> smaller breakpoint -> base), viewport resolution,
// validation, normalization and serialization. Style/layout-agnostic: works
// for any value type (styles, attrs, settings).

export const RESPONSIVE_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "responsive";

export const BREAKPOINTS = Object.freeze([
  { name: "mobile", min: 0, max: 767 },
  { name: "tablet", min: 768, max: 1023 },
  { name: "desktop", min: 1024, max: Number.POSITIVE_INFINITY },
]);

const BREAKPOINT_NAMES = BREAKPOINTS.map((b) => b.name);

function respError(operation, code, message) {
  const err = new Error(message);
  err.name = "ResponsiveError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

export function breakpointForWidth(width) {
  const w = Number(width);
  if (!Number.isFinite(w) || w < 0) throw respError("breakpointForWidth", "INVALID_WIDTH", "Viewport width must be a non-negative number.");
  for (const bp of BREAKPOINTS) {
    if (w >= bp.min && w <= bp.max) return bp.name;
  }
  return "desktop";
}

// Fallback chain: exact breakpoint -> smaller breakpoints in order -> base.
const FALLBACK_ORDER = { mobile: ["mobile"], tablet: ["tablet", "mobile"], desktop: ["desktop", "tablet", "mobile"] };

export function resolveValue(responsive, breakpoint) {
  if (!BREAKPOINT_NAMES.includes(breakpoint)) {
    throw respError("resolveValue", "INVALID_BREAKPOINT", `Unknown breakpoint "${breakpoint}".`);
  }
  if (responsive === null || responsive === undefined) return undefined;
  if (typeof responsive !== "object" || Array.isArray(responsive)) return responsive; // plain (non-responsive) value
  for (const name of FALLBACK_ORDER[breakpoint]) {
    if (responsive[name] !== undefined) return responsive[name];
  }
  return responsive.base;
}

export function isResponsiveValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return ["base", ...BREAKPOINT_NAMES].some((k) => value[k] !== undefined);
}

export function setOverride(responsive, breakpoint, value) {
  if (!BREAKPOINT_NAMES.includes(breakpoint)) {
    throw respError("setOverride", "INVALID_BREAKPOINT", `Unknown breakpoint "${breakpoint}".`);
  }
  const next = responsive && typeof responsive === "object" && !Array.isArray(responsive)
    ? JSON.parse(JSON.stringify(responsive))
    : { base: responsive };
  if (value === undefined) delete next[breakpoint];
  else next[breakpoint] = JSON.parse(JSON.stringify(value));
  return next;
}

export function normalizeResponsive(value) {
  if (!isResponsiveValue(value)) return { base: value === undefined ? null : JSON.parse(JSON.stringify(value)) };
  const out = {};
  for (const k of ["base", ...BREAKPOINT_NAMES]) {
    if (value[k] !== undefined) out[k] = JSON.parse(JSON.stringify(value[k]));
  }
  if (out.base === undefined) out.base = null;
  return out;
}

export function validateResponsive(value) {
  const errors = [];
  if (!isResponsiveValue(value)) return { valid: true, errors, warnings: [] };
  for (const key of Object.keys(value)) {
    if (!["base", ...BREAKPOINT_NAMES].includes(key)) {
      errors.push({ code: "UNKNOWN_BREAKPOINT", path: key, message: `Unknown breakpoint key "${key}".`, severity: "error" });
    }
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

// Resolve every responsive leaf inside a plain object for one breakpoint.
export function resolveTree(tree, breakpoint) {
  if (Array.isArray(tree)) return tree.map((item) => resolveTree(item, breakpoint));
  if (tree && typeof tree === "object") {
    if (isResponsiveValue(tree)) return resolveValue(tree, breakpoint);
    const out = {};
    for (const key of Object.keys(tree)) out[key] = resolveTree(tree[key], breakpoint);
    return out;
  }
  return tree;
}

export function createResponsiveEngine(breakpoints) {
  const bps = Array.isArray(breakpoints) && breakpoints.length > 0 ? breakpoints : BREAKPOINTS;
  return {
    get engine() { return ENGINE_ID; },
    get version() { return RESPONSIVE_ENGINE_VERSION; },
    get breakpoints() { return JSON.parse(JSON.stringify(bps)); },
    forWidth: breakpointForWidth,
    resolve: resolveValue,
    isResponsive: isResponsiveValue,
    setOverride,
    normalize: normalizeResponsive,
    validate: validateResponsive,
    resolveTree,
  };
}

export default createResponsiveEngine;
