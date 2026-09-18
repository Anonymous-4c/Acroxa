// acrx/assets/js/editor/engines/layout-engine.js
//
// ENGINE 17 — Layout Engine (headless).
// Layout relationships as structured data: containers, rows, columns, grids,
// flex, alignment, spacing, sizing, positioning, nesting rules, normalization
// and constraints. Never stores generated CSS — it emits a CSS-property map
// that the Style/Renderer engines serialize.

export const LAYOUT_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "layout";

const DISPLAYS = new Set(["stack", "row", "column", "grid", "flex"]);
const ALIGNS = new Set(["start", "center", "end", "stretch", "baseline"]);
const JUSTIFIES = new Set(["start", "center", "end", "between", "around", "evenly"]);

function layoutError(operation, code, message) {
  const err = new Error(message);
  err.name = "LayoutError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function numOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeLayout(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const display = DISPLAYS.has(src.display) ? src.display : "stack";
  const layout = {
    display,
    direction: src.direction === "horizontal" || src.direction === "vertical"
      ? src.direction
      : (display === "row" || display === "flex" ? "horizontal" : "vertical"),
    align: ALIGNS.has(src.align) ? src.align : "stretch",
    justify: JUSTIFIES.has(src.justify) ? src.justify : "start",
    gap: numOr(src.gap, 0),
    wrap: src.wrap === true,
    columns: display === "grid" ? Math.max(1, Math.floor(numOr(src.columns, 2))) : null,
    padding: normalizeSpacing(src.padding),
    margin: normalizeSpacing(src.margin),
    width: src.width || "auto",
    height: src.height || "auto",
    position: ["static", "relative"].includes(src.position) ? src.position : "static",
  };
  return layout;
}

export function normalizeSpacing(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const side of ["top", "right", "bottom", "left"]) out[side] = numOr(src[side], 0);
  return out;
}

export function validateLayout(layout) {
  const errors = [];
  if (!layout || typeof layout !== "object") {
    return { valid: false, errors: [{ code: "INVALID_LAYOUT", path: "", message: "Layout must be an object.", severity: "error" }], warnings: [] };
  }
  if (!DISPLAYS.has(layout.display)) errors.push({ code: "BAD_DISPLAY", path: "display", message: `Unknown display "${layout.display}".`, severity: "error" });
  if (layout.gap !== undefined && (typeof layout.gap !== "number" || layout.gap < 0)) {
    errors.push({ code: "BAD_GAP", path: "gap", message: "Gap must be a non-negative number.", severity: "error" });
  }
  if (layout.display === "grid" && layout.columns !== null && (!Number.isInteger(layout.columns) || layout.columns < 1)) {
    errors.push({ code: "BAD_COLUMNS", path: "columns", message: "Grid columns must be a positive integer.", severity: "error" });
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

// Structural CSS-property map (values already normalized). The renderer or
// style engine turns this into a style string — never stored on the model.
export function layoutToCSSProperties(layout) {
  const l = normalizeLayout(layout);
  const props = {};
  if (l.display === "stack") props.display = "block";
  else if (l.display === "grid") {
    props.display = "grid";
    props["grid-template-columns"] = `repeat(${l.columns}, minmax(0, 1fr))`;
  } else {
    props.display = "flex";
    props["flex-direction"] = l.direction === "horizontal" ? "row" : "column";
    if (l.wrap) props["flex-wrap"] = "wrap";
  }
  const alignMap = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "baseline" };
  const justifyMap = { start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around", evenly: "space-evenly" };
  if (props.display !== "block") {
    props["align-items"] = alignMap[l.align];
    props["justify-content"] = justifyMap[l.justify];
  }
  if (l.gap) props.gap = `${l.gap}px`;
  return props;
}

// Nesting rules: which layout kinds accept container children.
export function canContainLayout(parentLayout, childKind) {
  const parent = normalizeLayout(parentLayout);
  if (childKind !== "container" && childKind !== "content" && childKind !== "atomic") return false;
  return true && parent.display !== undefined;
}

export function createRow(columns = 2, opts = {}) {
  if (!Number.isInteger(columns) || columns < 1) throw layoutError("createRow", "INVALID_COLUMNS", "Columns must be a positive integer.");
  return {
    layout: normalizeLayout({ display: "grid", columns, gap: opts.gap !== undefined ? opts.gap : 16 }),
    columns: Array.from({ length: columns }, (_, i) => ({
      layout: normalizeLayout({ display: "stack" }),
      span: opts.spans && opts.spans[i] ? opts.spans[i] : 1,
    })),
  };
}

export function createLayoutEngine() {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return LAYOUT_ENGINE_VERSION; },
    normalize: normalizeLayout,
    normalizeSpacing,
    validate: validateLayout,
    toCSSProperties: layoutToCSSProperties,
    canContain: canContainLayout,
    createRow,
  };
}

export default createLayoutEngine;
