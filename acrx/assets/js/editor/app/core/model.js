// acrx/assets/js/editor/app/core/model.js
//
// Blueprint block model adapter + canonical block catalog.
// The headless engines store nodes as { id, type, parentId, children, data }.
// The editor UI works with the blueprint block shape:
//
//   { id, type, content, attrs, styles, responsive, children, parent,
//     locked, hidden, customClasses, customId, customCSS, tag, ariaLabel,
//     dataAttrs, customAttributes, data }
//
// data.* carries widget settings; styles.* carries the semantic style model;
// responsive.{mobile,tablet,desktop}.{styles,attrs} carries overrides.
//
// List items and table cells are inline-model arrays
// ([{ type:"text", text, marks }]), one per item/cell, so marks work exactly
// like paragraphs (P0-02). Plain strings from older docs, imports, patterns
// and inspector writes heal through normalizeInline at every model boundary.

import { normalizeContent } from "../../engines/index.js";

export function normalizeInline(value) {
  if (typeof value === "string") {
    return value === "" ? [] : [{ type: "text", text: value, marks: [] }];
  }
  if (Array.isArray(value)) {
    const flat = [];
    for (const entry of value) {
      if (typeof entry === "string") {
        if (entry !== "") flat.push({ type: "text", text: entry, marks: [] });
      } else if (entry && entry.type === "text") {
        flat.push({ type: "text", text: String(entry.text || ""), marks: Array.isArray(entry.marks) ? entry.marks : [] });
      }
    }
    return normalizeContent(flat);
  }
  return [];
}

export function inlinePlainText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((n) => n && n.type === "text").map((n) => n.text || "").join("");
  }
  return "";
}
//
// BLOCK_CATALOG is the single source of truth for discovery (Widgets panel,
// slash menu, palette), capability-gated inspector schemas, and engine
// widget-definition registration. Common settings are COMPOSED from shared
// field groups (Phase 8: no 300-line duplication per widget).

export const SLUG_TO_TYPE = {
  paragraph: "paragraph",
  heading: "heading",
  image: "image",
  gallery: "gallery",
  video: "video",
  audio: "audio",
  button: "button",
  link: "link",
  icon: "icon",
  alert: "alert",
  "code-block": "codeblock",
  columns: "columns",
  hero: "hero",
  cta: "cta",
  faq: "faq",
  pricing: "pricing",
  table: "table",
  divider: "divider",
  embed: "embed",
  blockquote: "blockquote",
  "bullet-list": "bulletList",
  "ordered-list": "orderedList",
  spacer: "spacer",
  container: "container",
  group: "group",
  stack: "stack",
  row: "row",
  split: "split",
  card: "card",
  grid: "grid",
  tabs: "tabs",
  accordion: "accordion",
  timeline: "timeline",
  features: "features",
  section: "section",
};

export const TYPE_TO_SLUG = Object.fromEntries(
  Object.entries(SLUG_TO_TYPE).map(([slug, type]) => [type, slug])
);

// Capability flags drive the inspector, toolbar, layers and block actions.
// No panel may show a control the selected block's capabilities disallow.
function caps(overrides = {}) {
  return {
    editable: false, // contentEditable text in canvas
    container: false, // accepts child blocks
    atomic: false, // self-contained leaf, configured via settings
    dynamic: false, // renders from data at render time
    draggable: true,
    duplicable: true,
    lockable: true,
    stylable: true,
    supportsTypography: false,
    supportsColor: false,
    supportsSpacing: true,
    supportsBorder: false,
    supportsBackground: false,
    supportsLink: false,
    supportsMedia: false,
    supportsFlex: false, // show flex layout group
    supportsGrid: false, // show grid layout group
    responsive: true,
    ...overrides,
  };
}

// ─── Shared field groups (composable common settings) ────────────────────
// Each returns fresh field arrays. Widgets compose:
//   inspector: [contentSection, ...common(caps, { tags })]

export const FONT_STACKS = [
  "Outfit, sans-serif",
  "Inter, system-ui, sans-serif",
  "system-ui, sans-serif",
  "Georgia, serif",
  "ui-monospace, monospace",
];

export const SHADOW_PRESETS = {
  none: "none",
  small: "0 1px 2px rgba(0, 0, 0, 0.05)",
  medium: "0 4px 6px rgba(0, 0, 0, 0.10)",
  large: "0 10px 20px rgba(0, 0, 0, 0.15)",
};

export const TAG_OPTIONS_GENERIC = ["div", "section", "article", "aside", "header", "footer", "main", "nav", "span"];
export const TAG_OPTIONS_TEXT = ["p", "div", "span"];

export function identitySection(tags = TAG_OPTIONS_GENERIC) {
  return {
    section: "Identity",
    fields: [
      { key: "customId", label: "ID / anchor", control: "text", help: "Unique id. Used for deep links and CSS scoping." },
      { key: "customClasses", label: "CSS classes", control: "text", help: "Space-separated class names." },
      { key: "tag", label: "HTML tag", control: "select", options: tags },
      { key: "ariaLabel", label: "Accessibility label", control: "text", help: "Announced by screen readers." },
      { key: "customCSS", label: "Custom CSS", control: "css", help: "Declarations applied to this block, e.g. border: 2px dashed red" },
      { key: "dataAttrs", label: "Data attributes", control: "keyvalue", help: "key → value, rendered as data-*." },
    ],
  };
}

export function layoutSection(extra = []) {
  return {
    section: "Layout",
    fields: [
      { key: "styles.display", label: "Display", control: "select", options: ["block", "inline", "inline-block", "flex", "grid", "none"] },
      { key: "styles.position", label: "Position", control: "select", options: ["static", "relative", "absolute", "sticky"] },
      { key: "styles.width", label: "Width", control: "unit", help: "px, %, em, vw or auto" },
      { key: "styles.minWidth", label: "Min width", control: "unit" },
      { key: "styles.maxWidth", label: "Max width", control: "unit" },
      { key: "styles.height", label: "Height", control: "unit" },
      { key: "styles.minHeight", label: "Min height", control: "unit" },
      { key: "styles.maxHeight", label: "Max height", control: "unit" },
      { key: "styles.overflow", label: "Overflow", control: "select", options: ["visible", "hidden", "auto"] },
      { key: "styles.visibility", label: "Visibility", control: "select", options: ["visible", "hidden"] },
      { key: "styles.opacity", label: "Opacity", control: "number", min: 0, max: 1 },
      { key: "styles.zIndex", label: "Z-index", control: "number" },
      ...extra,
    ],
  };
}

export function flexSection() {
  return {
    section: "Flex",
    fields: [
      { key: "styles.flexDirection", label: "Direction", control: "select", options: ["row", "row-reverse", "column", "column-reverse"] },
      { key: "styles.flexWrap", label: "Wrap", control: "select", options: ["nowrap", "wrap", "wrap-reverse"] },
      { key: "styles.justifyContent", label: "Justify", control: "select", options: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] },
      { key: "styles.alignItems", label: "Align items", control: "select", options: ["stretch", "flex-start", "center", "flex-end", "baseline"] },
      { key: "styles.alignContent", label: "Align content", control: "select", options: ["stretch", "flex-start", "center", "flex-end", "space-between", "space-around"] },
      { key: "styles.gap", label: "Gap", control: "unit" },
      { key: "styles.rowGap", label: "Row gap", control: "unit" },
      { key: "styles.columnGap", label: "Column gap", control: "unit" },
      { key: "styles.flexGrow", label: "Grow (item)", control: "number", min: 0 },
      { key: "styles.flexShrink", label: "Shrink (item)", control: "number", min: 0 },
      { key: "styles.flexBasis", label: "Basis (item)", control: "unit" },
      { key: "styles.order", label: "Order (item)", control: "number" },
    ],
  };
}

export function gridSection() {
  return {
    section: "Grid",
    fields: [
      { key: "styles.gridTemplateColumns", label: "Columns", control: "text", help: "e.g. 1fr 1fr 1fr" },
      { key: "styles.gridTemplateRows", label: "Rows", control: "text", help: "e.g. auto auto" },
      { key: "styles.columnGap", label: "Column gap", control: "unit" },
      { key: "styles.rowGap", label: "Row gap", control: "unit" },
      { key: "styles.gridAutoFlow", label: "Auto flow", control: "select", options: ["row", "column", "dense", "row dense", "column dense"] },
      { key: "styles.gridAutoColumns", label: "Auto columns", control: "text" },
      { key: "styles.gridAutoRows", label: "Auto rows", control: "text" },
      { key: "styles.justifyItems", label: "Justify items", control: "select", options: ["stretch", "start", "center", "end"] },
      { key: "styles.alignItems", label: "Align items", control: "select", options: ["stretch", "start", "center", "end"] },
    ],
  };
}

export function spacingSection() {
  return {
    section: "Spacing",
    fields: [
      { key: "margin", label: "Margin", control: "spacing", mode: "margin" },
      { key: "padding", label: "Padding", control: "spacing", mode: "padding" },
    ],
  };
}

export function typographySection() {
  return {
    section: "Typography",
    fields: [
      { key: "styles.fontFamily", label: "Font", control: "select", options: FONT_STACKS },
      { key: "styles.fontSize", label: "Size", control: "unit", help: "px, em, rem, %" },
      { key: "styles.fontWeight", label: "Weight", control: "select", options: ["normal", "500", "600", "700", "800"] },
      { key: "styles.lineHeight", label: "Line height", control: "unit", help: "number or length" },
      { key: "styles.letterSpacing", label: "Letter spacing", control: "unit" },
      { key: "styles.textColor", label: "Color", control: "color" },
      { key: "styles.textAlign", label: "Align", control: "segmented", options: ["left", "center", "right", "justify"] },
      { key: "styles.textTransform", label: "Transform", control: "select", options: ["none", "uppercase", "lowercase", "capitalize"] },
      { key: "styles.textDecoration", label: "Decoration", control: "select", options: ["none", "underline", "line-through"] },
      { key: "styles.fontStyle", label: "Style", control: "select", options: ["normal", "italic"] },
    ],
  };
}

export function backgroundSection() {
  return {
    section: "Background",
    fields: [
      { key: "styles.backgroundColor", label: "Color", control: "color" },
      { key: "styles.backgroundGradient", label: "Gradient", control: "text", help: "e.g. linear-gradient(135deg, #fff, #eee)" },
      { key: "styles.backgroundImage", label: "Image", control: "media", media: "image" },
      { key: "styles.backgroundPosition", label: "Position", control: "select", options: ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"] },
      { key: "styles.backgroundSize", label: "Size", control: "select", options: ["cover", "contain", "auto"] },
      { key: "styles.backgroundRepeat", label: "Repeat", control: "select", options: ["no-repeat", "repeat", "repeat-x", "repeat-y"] },
      { key: "styles.backgroundAttachment", label: "Attachment", control: "select", options: ["scroll", "fixed"] },
    ],
  };
}

export function borderSection() {
  return {
    section: "Border",
    fields: [
      { key: "styles.borderWidth", label: "Width", control: "number", min: 0, max: 12 },
      { key: "styles.borderStyle", label: "Style", control: "select", options: ["solid", "dashed", "dotted", "double", "none"] },
      { key: "styles.borderColor", label: "Color", control: "color" },
      { key: "styles.borderRadius", label: "Radius", control: "unit" },
    ],
  };
}

export function effectsSection() {
  return {
    section: "Effects",
    fields: [
      { key: "styles.boxShadow", label: "Shadow", control: "select", options: ["none", "small", "medium", "large"] },
      { key: "styles.boxShadowCustom", label: "Custom shadow", control: "text", help: "e.g. 0 2px 8px rgba(0,0,0,.15)" },
      { key: "styles.transform", label: "Transform", control: "text", help: "e.g. rotate(2deg) scale(1.02)" },
      { key: "styles.transition", label: "Transition", control: "text", help: "e.g. all .2s ease" },
      { key: "styles.filter", label: "Filter", control: "text", help: "e.g. grayscale(50%)" },
    ],
  };
}

export function advancedSection() {
  return {
    section: "Advanced",
    fields: [
      { key: "locked", label: "Lock block", control: "toggle", help: "Prevent move and delete." },
      { key: "hidden", label: "Hide block", control: "toggle", help: "Hide on all devices." },
    ],
  };
}

// Compose common sections from capabilities (Phase 8: shared, not duplicated).
export function commonSections(c, opts = {}) {
  const out = [identitySection(opts.tags)];
  const alignExtra = opts.align === false ? [] : [
    { key: "attrs.align", label: "Alignment", control: "segmented", options: ["left", "center", "right", "justify"] },
  ];
  out.push(layoutSection(alignExtra));
  if (c.supportsSpacing !== false) out.push(spacingSection());
  if (c.supportsFlex) out.push(flexSection());
  if (c.supportsGrid) out.push(gridSection());
  if (c.supportsTypography) out.push(typographySection());
  else if (c.supportsColor) {
    out.push({ section: "Appearance", fields: [{ key: "styles.textColor", label: "Text color", control: "color" }] });
  }
  if (c.supportsBackground) out.push(backgroundSection());
  if (c.supportsBorder) out.push(borderSection());
  if (c.stylable !== false) out.push(effectsSection());
  out.push(advancedSection());
  return out;
}

function contentSection(fields) {
  return { section: "Content", fields };
}

// Responsive-aware attribute keys (device tabs write responsive.*.attrs).
export const RESPONSIVE_ATTR_KEYS = new Set(["attrs.align", "columns", "gap", "widths"]);

// ─── Widget catalog ────────────────────────────────────────────────────────

let uidCounter = 0;
function uid(prefix) {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${uidCounter}`;
}

export const BLOCK_CATALOG = [
  {
    slug: "paragraph", type: "paragraph", label: "Paragraph", icon: "paragraph",
    description: "Plain text paragraph.", category: "Fundamental",
    capabilities: caps({ editable: true, supportsTypography: true, supportsColor: true, supportsBorder: true }),
    defaults: () => ({ text: "" }),
    inspector: () => [
      contentSection([]),
      ...commonSections(caps({ editable: true, supportsTypography: true, supportsColor: true, supportsBorder: true }), { align: true }),
    ],
  },
  {
    slug: "heading", type: "heading", label: "Heading", icon: "heading",
    description: "Section heading, levels 1–6.", category: "Fundamental",
    capabilities: caps({ editable: true, supportsTypography: true, supportsColor: true, supportsBorder: true }),
    defaults: () => ({ level: 2, text: "" }),
    inspector: () => [
      contentSection([
        { key: "level", label: "Level", control: "segmented", options: ["1", "2", "3", "4", "5", "6"] },
        { key: "customId", label: "HTML anchor", control: "text", help: "Deep-link target, e.g. pricing." },
      ]),
      ...commonSections(caps({ editable: true, supportsTypography: true, supportsColor: true, supportsBorder: true }), { align: true }),
    ],
  },
  {
    slug: "button", type: "button", label: "Button", icon: "rectangle-wide",
    description: "Call-to-action link button.", category: "Fundamental",
    capabilities: caps({ atomic: true, supportsLink: true, supportsTypography: true, supportsColor: true, supportsBorder: true, supportsBackground: true }),
    defaults: () => ({ text: "Button", href: "", linkType: "url", target: "_self", rel: "", variant: "primary", size: "medium", width: "auto", icon: "", iconPosition: "left", ariaLabel: "" }),
    inspector: () => [
      contentSection([
        { key: "text", label: "Label", control: "text" },
        { key: "href", label: "URL", control: "text", help: "https://…, /path, #anchor or email@example.com" },
        { key: "linkType", label: "Link type", control: "select", options: ["url", "internal", "email", "anchor"] },
        { key: "target", label: "Open in", control: "segmented", options: [{ value: "_self", label: "Same tab" }, { value: "_blank", label: "New tab" }] },
        { key: "rel", label: "Rel", control: "select", options: [{ value: "", label: "None" }, "nofollow", "noopener", "sponsored"] },
        { key: "ariaLabel", label: "ARIA label", control: "text" },
        { key: "variant", label: "Style", control: "segmented", options: ["primary", "secondary", "ghost"] },
        { key: "size", label: "Size", control: "segmented", options: ["small", "medium", "large"] },
        { key: "width", label: "Width", control: "segmented", options: ["auto", "full"] },
        { key: "icon", label: "Icon", control: "icon", help: "Font Awesome name, e.g. arrow-right" },
        { key: "iconPosition", label: "Icon position", control: "segmented", options: ["left", "right"] },
        { key: "attrs.align", label: "Alignment", control: "segmented", options: ["left", "center", "right"] },
      ]),
      ...commonSections(caps({ atomic: true, supportsTypography: true, supportsColor: true, supportsBorder: true, supportsBackground: true }), { align: false }),
    ],
  },
  {
    slug: "link", type: "link", label: "Link", icon: "link",
    description: "Inline text link.", category: "Fundamental",
    capabilities: caps({ editable: true, supportsTypography: true, supportsColor: true, supportsLink: true }),
    defaults: () => ({ text: "Link", href: "", target: "_self", rel: "" }),
    inspector: () => [
      contentSection([
        { key: "href", label: "URL", control: "text" },
        { key: "target", label: "Open in", control: "segmented", options: [{ value: "_self", label: "Same tab" }, { value: "_blank", label: "New tab" }] },
        { key: "rel", label: "Rel", control: "select", options: ["", "nofollow", "noopener", "sponsored"] },
      ]),
      ...commonSections(caps({ editable: true, supportsTypography: true, supportsColor: true }), { align: true }),
    ],
  },
  {
    slug: "icon", type: "icon", label: "Icon", icon: "star",
    description: "Vector icon.", category: "Fundamental",
    capabilities: caps({ atomic: true, supportsColor: true }),
    defaults: () => ({ icon: "star", size: "24px" }),
    inspector: () => [
      contentSection([
        { key: "icon", label: "Icon", control: "icon", help: "Font Awesome name, e.g. star" },
        { key: "size", label: "Size", control: "unit" },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true }), { align: true }),
    ],
  },
  {
    slug: "image", type: "image", label: "Image", icon: "image",
    description: "Single image with caption.", category: "Fundamental",
    capabilities: caps({ atomic: true, supportsMedia: true, supportsLink: true, supportsBorder: true, supportsBackground: false }),
    defaults: () => ({ src: "", alt: "", title: "", caption: "", href: "", target: "_self", width: "", ratio: "", objectFit: "cover", objectPosition: "center", lazy: true }),
    inspector: () => [
      contentSection([
        { key: "src", label: "Image", control: "media", media: "image" },
        { key: "alt", label: "Alt text", control: "text" },
        { key: "title", label: "Title", control: "text" },
        { key: "caption", label: "Caption", control: "text" },
        { key: "href", label: "Link URL", control: "text" },
        { key: "target", label: "Open in", control: "segmented", options: [{ value: "_self", label: "Same tab" }, { value: "_blank", label: "New tab" }] },
        { key: "width", label: "Width", control: "unit", help: "e.g. 100%, 640px" },
        { key: "ratio", label: "Aspect ratio", control: "select", options: ["", "1/1", "4/3", "16/9", "3/2"] },
        { key: "objectFit", label: "Object fit", control: "select", options: ["cover", "contain", "fill", "none"] },
        { key: "objectPosition", label: "Object position", control: "select", options: ["center", "top", "bottom", "left", "right"] },
        { key: "lazy", label: "Lazy load", control: "toggle" },
      ]),
      ...commonSections(caps({ atomic: true, supportsBorder: true }), { align: true }),
    ],
  },
  {
    slug: "divider", type: "divider", label: "Divider", icon: "minus",
    description: "Horizontal separator.", category: "Fundamental",
    capabilities: caps({ atomic: true, supportsColor: true, responsive: false, stylable: true, supportsSpacing: true }),
    defaults: () => ({ style: "solid", thickness: 1, width: "100%", align: "center" }),
    inspector: () => [
      contentSection([
        { key: "style", label: "Style", control: "segmented", options: ["solid", "dashed", "dotted"] },
        { key: "thickness", label: "Thickness", control: "number", min: 1, max: 12 },
        { key: "width", label: "Width", control: "unit", help: "e.g. 100%, 200px" },
        { key: "align", label: "Alignment", control: "segmented", options: ["left", "center", "right"] },
        { key: "color", label: "Color", control: "color" },
      ]),
      ...commonSections(caps({ atomic: true, supportsSpacing: true }), { align: false }),
    ],
  },
  {
    slug: "container", type: "container", label: "Container", icon: "box",
    description: "Group blocks. Block, flex or grid layout.", category: "Structural",
    capabilities: caps({ container: true, supportsBackground: true, supportsBorder: true, supportsFlex: true, supportsGrid: true }),
    defaults: () => ({ layout: { display: "block", direction: "column", wrap: false, justify: "flex-start", align: "stretch", gap: 16 } }),
    inspector: () => [
      contentSection([
        { key: "layout.display", label: "Layout mode", control: "segmented", options: ["block", "flex", "grid"] },
        { key: "layout.direction", label: "Direction", control: "segmented", options: ["row", "column"] },
        { key: "layout.wrap", label: "Wrap", control: "toggle" },
        { key: "layout.justify", label: "Justify", control: "select", options: ["flex-start", "center", "flex-end", "space-between", "space-around"] },
        { key: "layout.align", label: "Align", control: "select", options: ["stretch", "flex-start", "center", "flex-end"] },
        { key: "layout.gap", label: "Gap", control: "number", min: 0, max: 120 },
        { key: "layout.columns", label: "Grid columns", control: "text", help: "e.g. 1fr 1fr 1fr" },
      ]),
      ...commonSections(caps({ container: true, supportsBackground: true, supportsBorder: true, supportsFlex: true, supportsGrid: true }), { align: false }),
    ],
  },
  {
    slug: "grid", type: "grid", label: "Grid", icon: "grid-2",
    description: "Grid container for cards and blocks.", category: "Structural",
    capabilities: caps({ container: true, supportsBackground: true, supportsBorder: true, supportsGrid: true }),
    defaults: () => ({ columns: "1fr 1fr 1fr", gap: 16, rowGap: 16 }),
    insertChildren: () => [{ type: "container", data: {} }, { type: "container", data: {} }, { type: "container", data: {} }],
    inspector: () => [
      contentSection([
        { key: "columns", label: "Columns", control: "text", help: "e.g. 1fr 1fr 1fr" },
        { key: "gap", label: "Gap", control: "number", min: 0, max: 120 },
        { key: "rowGap", label: "Row gap", control: "number", min: 0, max: 120 },
      ]),
      ...commonSections(caps({ container: true, supportsBackground: true, supportsBorder: true, supportsGrid: true }), { align: false }),
    ],
  },
  {
    slug: "columns", type: "columns", label: "Columns", icon: "columns-3",
    description: "Multi-column row. Drop blocks inside.", category: "Structural",
    capabilities: caps({ container: true, lockable: true, supportsBackground: true, supportsBorder: true }),
    defaults: () => ({ columns: 2, gap: 16, widths: "", stackOnMobile: true }),
    insertChildren: () => [{ type: "column", data: {} }, { type: "column", data: {} }],
    inspector: () => [
      contentSection([
        { key: "columns", label: "Columns", control: "number", min: 1, max: 4 },
        { key: "widths", label: "Widths", control: "text", help: "e.g. 1fr 2fr (empty = equal)" },
        { key: "gap", label: "Gap", control: "number", min: 0, max: 80 },
        { key: "stackOnMobile", label: "Stack on mobile", control: "toggle" },
      ]),
      ...commonSections(caps({ container: true, supportsBackground: true, supportsBorder: true }), { align: false }),
    ],
  },
  {
    slug: "spacer", type: "spacer", label: "Spacer", icon: "arrows-up-down",
    description: "Vertical whitespace.", category: "Structural",
    capabilities: caps({ atomic: true, stylable: false, supportsSpacing: false, responsive: false, lockable: true }),
    defaults: () => ({ height: 24 }),
    inspector: () => [
      contentSection([
        { key: "height", label: "Height", control: "number", min: 0, max: 400 },
      ]),
      ...commonSections(caps({ atomic: true, stylable: false, supportsSpacing: false }), { align: false }),
    ],
  },
  {
    slug: "group", type: "group", label: "Group", icon: "object-group",
    description: "Transparent wrapper that keeps blocks together.", category: "Structural",
    capabilities: caps({ container: true, supportsBackground: true, supportsBorder: true, supportsFlex: true }),
    defaults: () => ({ layout: { display: "block", direction: "column", gap: 12 } }),
    inspector: () => [
      contentSection([
        { key: "layout.display", label: "Layout mode", control: "segmented", options: ["block", "flex"] },
        { key: "layout.direction", label: "Direction", control: "segmented", options: ["column", "row"] },
        { key: "layout.gap", label: "Gap", control: "number", min: 0, max: 120 },
        { key: "layout.align", label: "Align", control: "select", options: ["stretch", "flex-start", "center", "flex-end"] },
      ]),
      ...commonSections(caps({ container: true, supportsBackground: true, supportsBorder: true, supportsFlex: true }), { align: false }),
    ],
  },
  {
    slug: "stack", type: "stack", label: "Stack", icon: "layer-group",
    description: "Vertical or horizontal stack with even gaps.", category: "Structural",
    capabilities: caps({ container: true, supportsBackground: true, supportsBorder: true, supportsFlex: true }),
    defaults: () => ({ layout: { display: "flex", direction: "column", gap: 16, align: "stretch", justify: "flex-start" } }),
    inspector: () => [
      contentSection([
        { key: "layout.direction", label: "Direction", control: "segmented", options: ["column", "row"] },
        { key: "layout.gap", label: "Gap", control: "number", min: 0, max: 120 },
        { key: "layout.align", label: "Align", control: "select", options: ["stretch", "flex-start", "center", "flex-end"] },
        { key: "layout.justify", label: "Distribute", control: "select", options: ["flex-start", "center", "flex-end", "space-between", "space-around"] },
      ]),
      ...commonSections(caps({ container: true, supportsBackground: true, supportsBorder: true, supportsFlex: true }), { align: false }),
    ],
  },
  {
    slug: "row", type: "row", label: "Row", icon: "minus",
    description: "Fast horizontal composition.", category: "Structural",
    capabilities: caps({ container: true, supportsFlex: true }),
    defaults: () => ({ layout: { display: "flex", direction: "row", wrap: true, gap: 12, align: "center", justify: "flex-start" } }),
    inspector: () => [
      contentSection([
        { key: "layout.gap", label: "Gap", control: "number", min: 0, max: 120 },
        { key: "layout.align", label: "Align", control: "select", options: ["stretch", "flex-start", "center", "flex-end", "baseline"] },
        { key: "layout.justify", label: "Distribute", control: "select", options: ["flex-start", "center", "flex-end", "space-between", "space-around"] },
        { key: "layout.wrap", label: "Wrap", control: "toggle" },
      ]),
      ...commonSections(caps({ container: true, supportsFlex: true }), { align: false }),
    ],
  },
  {
    slug: "split", type: "split", label: "Split", icon: "columns-2",
    description: "Two-pane layout with ratio and stacking.", category: "Structural",
    capabilities: caps({ container: true, supportsBackground: true, supportsBorder: true }),
    defaults: () => ({ ratio: "50/50", gap: 24, align: "center", stack: true }),
    insertChildren: () => [{ type: "group", data: {} }, { type: "group", data: {} }],
    inspector: () => [
      contentSection([
        { key: "ratio", label: "Ratio", control: "segmented", options: ["50/50", "60/40", "40/60", "33/67", "67/33"] },
        { key: "gap", label: "Gap", control: "number", min: 0, max: 120 },
        { key: "align", label: "Vertical align", control: "select", options: ["stretch", "flex-start", "center", "flex-end"] },
        { key: "stack", label: "Stack on mobile", control: "toggle" },
      ]),
      ...commonSections(caps({ container: true, supportsBackground: true, supportsBorder: true }), { align: false }),
    ],
  },
  {
    slug: "gallery", type: "gallery", label: "Gallery", icon: "images",
    description: "Grid of images.", category: "Media",
    capabilities: caps({ atomic: true, supportsMedia: true, supportsBorder: true }),
    defaults: () => ({ images: [], columns: 3, gap: 12, ratio: "1/1", fit: "cover", lightbox: false }),
    inspector: () => [
      contentSection([
        { key: "images", label: "Images", control: "media-list", media: "image" },
        { key: "columns", label: "Columns", control: "number", min: 1, max: 6 },
        { key: "gap", label: "Gap", control: "number", min: 0, max: 60 },
        { key: "ratio", label: "Aspect ratio", control: "select", options: ["1/1", "4/3", "16/9", "3/2", "auto"] },
        { key: "fit", label: "Image fit", control: "select", options: ["cover", "contain"] },
        { key: "lightbox", label: "Lightbox on click", control: "toggle" },
      ]),
      ...commonSections(caps({ atomic: true, supportsBorder: true }), { align: false }),
    ],
  },
  {
    slug: "video", type: "video", label: "Video", icon: "video",
    description: "Embedded video file or URL.", category: "Media",
    capabilities: caps({ atomic: true, supportsMedia: true }),
    defaults: () => ({ src: "", poster: "", autoplay: false, controls: true, muted: false, loop: false, ratio: "16/9" }),
    inspector: () => [
      contentSection([
        { key: "src", label: "Video", control: "media", media: "video" },
        { key: "poster", label: "Poster", control: "media", media: "image" },
        { key: "ratio", label: "Aspect ratio", control: "select", options: ["16/9", "4/3", "1/1", "auto"] },
        { key: "autoplay", label: "Autoplay", control: "toggle" },
        { key: "muted", label: "Muted", control: "toggle" },
        { key: "loop", label: "Loop", control: "toggle" },
        { key: "controls", label: "Controls", control: "toggle" },
      ]),
      ...commonSections(caps({ atomic: true }), { align: true }),
    ],
  },
  {
    slug: "audio", type: "audio", label: "Audio", icon: "music",
    description: "Audio player.", category: "Media",
    capabilities: caps({ atomic: true, supportsMedia: true }),
    defaults: () => ({ src: "", title: "" }),
    inspector: () => [
      contentSection([
        { key: "src", label: "Audio", control: "media", media: "audio" },
        { key: "title", label: "Title", control: "text" },
      ]),
      ...commonSections(caps({ atomic: true }), { align: false }),
    ],
  },
  {
    slug: "embed", type: "embed", label: "Embed", icon: "arrow-up-right-from-square",
    description: "External embed by URL.", category: "Media",
    capabilities: caps({ atomic: true }),
    defaults: () => ({ src: "", ratio: "16/9" }),
    inspector: () => [
      contentSection([
        { key: "src", label: "URL", control: "text", help: "https:// URLs only." },
        { key: "ratio", label: "Aspect ratio", control: "select", options: ["16/9", "4/3", "1/1", "auto"] },
      ]),
      ...commonSections(caps({ atomic: true }), { align: false }),
    ],
  },
  {
    slug: "blockquote", type: "blockquote", label: "Quote", icon: "quote-left",
    description: "Quoted passage with author.", category: "Content",
    capabilities: caps({ editable: true, supportsTypography: true, supportsColor: true, supportsBorder: true, supportsBackground: true }),
    defaults: () => ({ text: "", cite: "", author: "" }),
    inspector: () => [
      contentSection([
        { key: "cite", label: "Citation", control: "text" },
        { key: "author", label: "Author", control: "text" },
      ]),
      ...commonSections(caps({ editable: true, supportsTypography: true, supportsColor: true, supportsBorder: true, supportsBackground: true }), { align: true }),
    ],
  },
  {
    slug: "code-block", type: "codeblock", label: "Code", icon: "code",
    description: "Code with highlighting, line numbers and copy.", category: "Content",
    capabilities: caps({ editable: true, supportsColor: true, supportsBackground: true, supportsBorder: true }),
    defaults: () => ({ text: "", language: "js", lineNumbers: true, title: "", wrap: false }),
    inspector: () => [
      contentSection([
        { key: "language", label: "Language", control: "select", options: ["txt", "js", "css", "html", "php", "json", "bash", "sql", "python"] },
        { key: "title", label: "Title", control: "text", help: "Shown in the code header." },
        { key: "lineNumbers", label: "Line numbers", control: "toggle" },
        { key: "wrap", label: "Wrap lines", control: "toggle" },
      ]),
      ...commonSections(caps({ editable: true, supportsColor: true, supportsBackground: true, supportsBorder: true }), { align: false }),
    ],
  },
  {
    slug: "bullet-list", type: "bulletList", label: "Bullet list", icon: "list-ul",
    description: "Unordered list of items.", category: "Content",
    capabilities: caps({ editable: true, supportsTypography: true, supportsColor: true }),
    defaults: () => ({ items: ["First item"] }),
    inspector: () => [
      contentSection([
        { key: "items", label: "Items", control: "list-items", help: "Edit item text directly in the canvas." },
      ]),
      ...commonSections(caps({ editable: true, supportsTypography: true, supportsColor: true }), { align: true }),
    ],
  },
  {
    slug: "ordered-list", type: "orderedList", label: "Numbered list", icon: "list-ol",
    description: "Ordered list of items.", category: "Content",
    capabilities: caps({ editable: true, supportsTypography: true, supportsColor: true }),
    defaults: () => ({ items: ["First item"] }),
    inspector: () => [
      contentSection([
        { key: "items", label: "Items", control: "list-items", help: "Edit item text directly in the canvas." },
      ]),
      ...commonSections(caps({ editable: true, supportsTypography: true, supportsColor: true }), { align: true }),
    ],
  },
  {
    slug: "alert", type: "alert", label: "Alert", icon: "triangle-exclamation",
    description: "Notice box with editable message.", category: "Content",
    capabilities: caps({ editable: true, supportsColor: true, supportsBorder: true, supportsBackground: true }),
    defaults: () => ({ text: "", title: "", tone: "info", dismissible: false }),
    inspector: () => [
      contentSection([
        { key: "title", label: "Title", control: "text" },
        { key: "tone", label: "Tone", control: "segmented", options: ["info", "success", "warning", "danger"] },
        { key: "dismissible", label: "Dismissible", control: "toggle" },
      ]),
      ...commonSections(caps({ editable: true, supportsColor: true, supportsBorder: true, supportsBackground: true }), { align: false }),
    ],
  },
  {
    slug: "card", type: "card", label: "Card", icon: "id-card",
    description: "Image + title + text + action card.", category: "Content",
    capabilities: caps({ atomic: true, supportsMedia: true, supportsLink: true, supportsColor: true, supportsBorder: true, supportsBackground: true, supportsTypography: true }),
    defaults: () => ({ image: "", title: "Card title", description: "", badge: "", buttonText: "", buttonUrl: "", direction: "vertical", align: "left" }),
    inspector: () => [
      contentSection([
        { key: "image", label: "Image", control: "media", media: "image" },
        { key: "badge", label: "Badge", control: "text" },
        { key: "title", label: "Title", control: "text" },
        { key: "description", label: "Description", control: "textarea" },
        { key: "buttonText", label: "Button label", control: "text" },
        { key: "buttonUrl", label: "Button URL", control: "text" },
        { key: "direction", label: "Layout", control: "segmented", options: ["vertical", "horizontal"] },
        { key: "align", label: "Text align", control: "segmented", options: ["left", "center", "right"] },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true, supportsBorder: true, supportsBackground: true, supportsTypography: true }), { align: false }),
    ],
  },
  {
    slug: "table", type: "table", label: "Table", icon: "table",
    description: "Structured data grid.", category: "Content",
    capabilities: caps({ atomic: true, editable: true, supportsBorder: true }),
    defaults: () => ({ rows: [["Header", "Header"], ["Cell", "Cell"]], hasHeader: true }),
    inspector: () => [
      contentSection([
        { key: "hasHeader", label: "Header row", control: "toggle" },
        { key: "rows", label: "Rows", control: "table-editor" },
      ]),
      ...commonSections(caps({ atomic: true, editable: true, supportsBorder: true }), { align: true }),
    ],
  },
  {
    slug: "hero", type: "hero", label: "Hero", icon: "star",
    description: "Large banner with title and actions.", category: "Marketing",
    capabilities: caps({ atomic: true, supportsColor: true, supportsBackground: true, supportsBorder: true, supportsLink: true, supportsTypography: true }),
    defaults: () => ({ eyebrow: "", title: "Hero title", subtitle: "", buttonText: "Get started", buttonUrl: "", secondaryText: "", secondaryUrl: "", backgroundImage: "", align: "center", maxWidth: "720px" }),
    inspector: () => [
      contentSection([
        { key: "eyebrow", label: "Eyebrow", control: "text" },
        { key: "title", label: "Title", control: "text" },
        { key: "subtitle", label: "Subtitle", control: "textarea" },
        { key: "buttonText", label: "Primary label", control: "text" },
        { key: "buttonUrl", label: "Primary URL", control: "text" },
        { key: "secondaryText", label: "Secondary label", control: "text" },
        { key: "secondaryUrl", label: "Secondary URL", control: "text" },
        { key: "backgroundImage", label: "Background", control: "media", media: "image" },
        { key: "align", label: "Alignment", control: "segmented", options: ["left", "center", "right"] },
        { key: "maxWidth", label: "Content width", control: "unit" },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true, supportsBackground: true, supportsBorder: true, supportsTypography: true }), { align: false }),
    ],
  },
  {
    slug: "cta", type: "cta", label: "CTA", icon: "bullhorn",
    description: "Call-to-action banner.", category: "Marketing",
    capabilities: caps({ atomic: true, supportsColor: true, supportsBackground: true, supportsBorder: true, supportsLink: true, supportsTypography: true }),
    defaults: () => ({ title: "Ready to start?", description: "", buttonText: "Get started", buttonUrl: "", secondaryText: "", secondaryUrl: "", align: "center" }),
    inspector: () => [
      contentSection([
        { key: "title", label: "Title", control: "text" },
        { key: "description", label: "Description", control: "textarea" },
        { key: "buttonText", label: "Primary label", control: "text" },
        { key: "buttonUrl", label: "Primary URL", control: "text" },
        { key: "secondaryText", label: "Secondary label", control: "text" },
        { key: "secondaryUrl", label: "Secondary URL", control: "text" },
        { key: "align", label: "Alignment", control: "segmented", options: ["left", "center", "right"] },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true, supportsBackground: true, supportsBorder: true, supportsTypography: true }), { align: false }),
    ],
  },
  {
    slug: "faq", type: "faq", label: "FAQ", icon: "circle-question",
    description: "Expandable question list.", category: "Advanced",
    capabilities: caps({ atomic: true, supportsColor: true, supportsBorder: true, supportsBackground: true }),
    defaults: () => ({ items: [{ id: "faq_a", q: "Question?", a: "Answer." }] }),
    inspector: () => [
      contentSection([
        { key: "items", label: "Items", control: "faq-items" },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true, supportsBorder: true, supportsBackground: true }), { align: false }),
    ],
  },
  {
    slug: "pricing", type: "pricing", label: "Pricing", icon: "tag",
    description: "Pricing plan cards.", category: "Marketing",
    capabilities: caps({ atomic: true, supportsColor: true, supportsBorder: true, supportsBackground: true }),
    defaults: () => ({ plans: [{ id: "plan_a", name: "Starter", price: "$9", period: "/mo", description: "", features: ["Feature one"], ctaText: "Choose", ctaUrl: "", highlight: false }] }),
    inspector: () => [
      contentSection([
        { key: "plans", label: "Plans", control: "pricing-plans" },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true, supportsBorder: true, supportsBackground: true }), { align: false }),
    ],
  },
  {
    slug: "embed", type: "embed", label: "Embed", icon: "arrow-up-right-from-square",
    description: "External embed by URL.", category: "Media",
    capabilities: caps({ atomic: true }),
    defaults: () => ({ src: "", ratio: "16/9" }),
    inspector: () => [
      contentSection([
        { key: "src", label: "URL", control: "text", help: "https:// URLs only." },
        { key: "ratio", label: "Aspect ratio", control: "select", options: ["16/9", "4/3", "1/1", "auto"] },
      ]),
      ...commonSections(caps({ atomic: true }), { align: false }),
    ],
  },
  {
    slug: "testimonial", type: "testimonial", label: "Testimonial", icon: "quote-right",
    description: "Customer quote with author and rating.", category: "Marketing",
    capabilities: caps({ editable: true, supportsColor: true, supportsBorder: true, supportsBackground: true, supportsTypography: true }),
    defaults: () => ({ text: "", author: "", role: "", avatar: "", rating: 5 }),
    inspector: () => [
      contentSection([
        { key: "author", label: "Author", control: "text" },
        { key: "role", label: "Role / company", control: "text" },
        { key: "avatar", label: "Avatar", control: "media", media: "image" },
        { key: "rating", label: "Rating", control: "select", options: ["5", "4", "3", "2", "1"] },
      ]),
      ...commonSections(caps({ editable: true, supportsColor: true, supportsBorder: true, supportsBackground: true, supportsTypography: true }), { align: true }),
    ],
  },
  {
    slug: "stats", type: "stats", label: "Stats", icon: "chart-simple",
    description: "Row of key numbers.", category: "Marketing",
    capabilities: caps({ atomic: true, supportsColor: true, supportsTypography: true }),
    defaults: () => ({ stats: [{ id: "stat_a", value: "99%", label: "Uptime" }], columns: 3 }),
    inspector: () => [
      contentSection([
        { key: "stats", label: "Stats", control: "stats-items" },
        { key: "columns", label: "Columns", control: "number", min: 1, max: 6 },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true, supportsTypography: true }), { align: false }),
    ],
  },
  {
    slug: "tabs", type: "tabs", label: "Tabs", icon: "folder",
    description: "Tabbed content panels.", category: "Content",
    capabilities: caps({ atomic: true, supportsColor: true, supportsBorder: true, supportsBackground: true }),
    defaults: () => ({ tabs: [{ id: "tab_a", label: "Tab one", content: "First panel content." }, { id: "tab_b", label: "Tab two", content: "Second panel content." }], active: 0 }),
    inspector: () => [
      contentSection([
        { key: "tabs", label: "Tabs", control: "tabs-items" },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true, supportsBorder: true, supportsBackground: true }), { align: false }),
    ],
  },
  {
    slug: "accordion", type: "accordion", label: "Accordion", icon: "list",
    description: "Collapsible sections, one or many open.", category: "Content",
    capabilities: caps({ atomic: true, supportsColor: true, supportsBorder: true, supportsBackground: true }),
    defaults: () => ({ items: [{ id: "acc_a", q: "First section", a: "Section content." }] }),
    inspector: () => [
      contentSection([
        { key: "items", label: "Sections", control: "faq-items" },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true, supportsBorder: true, supportsBackground: true }), { align: false }),
    ],
  },
  {
    slug: "timeline", type: "timeline", label: "Timeline", icon: "timeline",
    description: "Vertical event timeline.", category: "Content",
    capabilities: caps({ atomic: true, supportsColor: true, supportsTypography: true }),
    defaults: () => ({ events: [{ id: "ev_a", date: "2026", title: "Milestone", text: "What happened." }] }),
    inspector: () => [
      contentSection([
        { key: "events", label: "Events", control: "timeline-items" },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true, supportsTypography: true }), { align: false }),
    ],
  },
  {
    slug: "features", type: "features", label: "Features", icon: "shapes",
    description: "Icon + title + text feature grid.", category: "Marketing",
    capabilities: caps({ atomic: true, supportsColor: true, supportsTypography: true }),
    defaults: () => ({ features: [{ id: "feat_a", icon: "star", title: "Feature", text: "Why it matters." }] }),
    inspector: () => [
      contentSection([
        { key: "features", label: "Features", control: "feature-items" },
      ]),
      ...commonSections(caps({ atomic: true, supportsColor: true, supportsTypography: true }), { align: false }),
    ],
  },
  {
    slug: "section", type: "section", label: "Section", icon: "square",
    description: "Semantic page section container.", category: "Structural",
    capabilities: caps({ container: true, supportsBackground: true, supportsBorder: true, supportsFlex: true }),
    defaults: () => ({ tag: "section", layout: { display: "block", direction: "column", gap: 16 } }),
    inspector: () => [
      contentSection([
        { key: "layout.display", label: "Layout mode", control: "segmented", options: ["block", "flex"] },
        { key: "layout.direction", label: "Direction", control: "segmented", options: ["column", "row"] },
        { key: "layout.gap", label: "Gap", control: "number", min: 0, max: 120 },
      ]),
      ...commonSections(caps({ container: true, supportsBackground: true, supportsBorder: true, supportsFlex: true }), { align: false }),
    ],
  },
  // Internal structural type (columns children). Not listed in the inserter.
  {
    slug: "__column", type: "column", label: "Column", icon: "square",
    description: "Column container.", category: "Structural", hidden: true,
    capabilities: caps({ container: true, supportsBackground: true, supportsBorder: true, supportsFlex: true }),
    defaults: () => ({}),
    inspector: () => [
      ...commonSections(caps({ container: true, supportsBackground: true, supportsBorder: true, supportsFlex: true }), { align: false }),
    ],
  },
  // Fallback for foreign/unresolvable nodes (imported patterns, legacy data).
  // Preserves the original payload; canvas shows an informative block with
  // retry/inspect/remove affordances (never blank space, never fake content).
  {
    slug: "__unresolved", type: "unresolved", label: "Unresolved block", icon: "triangle-exclamation",
    description: "Placeholder for content this editor cannot render.", category: "Structural", hidden: true,
    capabilities: caps({ atomic: true, stylable: false, supportsSpacing: false, responsive: false }),
    defaults: () => ({ originalType: "unknown", payload: null }),
    inspector: () => [
      contentSection([
        { key: "originalType", label: "Original type", control: "text" },
      ]),
      ...commonSections(caps({ atomic: true, stylable: false, supportsSpacing: false }), { align: false }),
    ],
  },
];

export const CATALOG_BY_TYPE = Object.fromEntries(BLOCK_CATALOG.map((d) => [d.type, d]));
export const CATALOG_BY_SLUG = Object.fromEntries(BLOCK_CATALOG.map((d) => [d.slug, d]));
export const INSERTER_CATALOG = BLOCK_CATALOG.filter((d) => !d.hidden);
export const CATEGORIES = [...new Set(INSERTER_CATALOG.map((d) => d.category))];

export const TEXT_TYPES = new Set(
  BLOCK_CATALOG.filter((d) => d.capabilities.editable).map((d) => d.type)
);
export const CONTAINER_TYPES = new Set(
  BLOCK_CATALOG.filter((d) => d.capabilities.container).map((d) => d.type)
);

// Inspector schema for a block: widget Content + composed common sections.
// Sections are data (functions evaluated per render), never hardcoded UI.
// Spec order is enforced here: Identity first, Content second, the rest in
// catalog order — every widget, automatically.
const SECTION_ORDER = { Identity: 0, Content: 1 };
export function inspectorSections(block) {
  const def = CATALOG_BY_TYPE[block.type];
  if (!def) return [];
  const raw = typeof def.inspector === "function" ? def.inspector() : def.inspector || [];
  return [...raw].sort((a, b) => (SECTION_ORDER[a.section] ?? 2) - (SECTION_ORDER[b.section] ?? 2));
}

// ─── Shared style resolution (canvas + export use the same function) ─────
// Merges base styles with the active breakpoint overrides, then maps the
// semantic model to real CSS properties. Numbers become px; unit strings
// pass through; empty values are dropped.

const LENGTH_PROPS = new Set([
  "width", "minWidth", "maxWidth", "height", "minHeight", "maxHeight",
  "marginTop", "marginRight", "marginBottom", "marginLeft",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontSize", "lineHeight", "letterSpacing", "borderRadius",
  "gap", "rowGap", "columnGap", "flexBasis",
  "gridAutoColumns", "gridAutoRows",
]);

const CSS_PROP = {
  display: "display", position: "position", width: "width", minWidth: "min-width",
  maxWidth: "max-width", height: "height", minHeight: "min-height", maxHeight: "max-height",
  overflow: "overflow", visibility: "visibility", opacity: "opacity", zIndex: "z-index",
  marginTop: "margin-top", marginRight: "margin-right", marginBottom: "margin-bottom", marginLeft: "margin-left",
  paddingTop: "padding-top", paddingRight: "padding-right", paddingBottom: "padding-bottom", paddingLeft: "padding-left",
  fontFamily: "font-family", fontSize: "font-size", fontWeight: "font-weight",
  lineHeight: "line-height", letterSpacing: "letter-spacing", textColor: "color",
  textAlign: "text-align", textTransform: "text-transform", textDecoration: "text-decoration", fontStyle: "font-style",
  backgroundColor: "background-color", backgroundImage: "background-image",
  backgroundPosition: "background-position", backgroundSize: "background-size",
  backgroundRepeat: "background-repeat", backgroundAttachment: "background-attachment",
  borderWidth: "border-width", borderStyle: "border-style", borderColor: "border-color", borderRadius: "border-radius",
  boxShadow: "box-shadow", transform: "transform", transition: "transition", filter: "filter",
  flexDirection: "flex-direction", flexWrap: "flex-wrap", justifyContent: "justify-content",
  alignItems: "align-items", alignContent: "align-content", gap: "gap",
  rowGap: "row-gap", columnGap: "column-gap", flexGrow: "flex-grow", flexShrink: "flex-shrink",
  flexBasis: "flex-basis", order: "order", gridTemplateColumns: "grid-template-columns",
  gridTemplateRows: "grid-template-rows", gridAutoFlow: "grid-auto-flow",
  gridAutoColumns: "grid-auto-columns", gridAutoRows: "grid-auto-rows", justifyItems: "justify-items",
};

function lengthValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return null;
}

export function resolveStyles(block, device = "desktop") {
  const responsive = (block.responsive && block.responsive[device]) || {};
  const merged = { ...(block.styles || {}), ...(responsive.styles || {}) };
  const out = {};
  for (const [key, prop] of Object.entries(CSS_PROP)) {
    let value = merged[key];
    if (value === undefined || value === null || value === "") continue;
    if (key === "boxShadow" && SHADOW_PRESETS[value]) value = SHADOW_PRESETS[value];
    if (key === "boxShadowCustom") continue; // handled below
    if (LENGTH_PROPS.has(key)) {
      const normalized = lengthValue(value);
      if (normalized === null) continue;
      value = normalized;
    }
    if (key === "opacity") {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      value = Math.max(0, Math.min(1, n));
    }
    if (key === "backgroundImage" && typeof value === "string" && !/^url\(|^linear-gradient|^radial-gradient/.test(value)) {
      value = `url("${value}")`;
    }
    out[prop] = value;
  }
  // Gradient + custom shadow compose with (not against) background/shadow.
  if (merged.backgroundGradient) out["background-image"] = merged.backgroundGradient;
  if (merged.boxShadowCustom) out["box-shadow"] = merged.boxShadowCustom;
  if (merged.borderWidth !== undefined && Number(merged.borderWidth) > 0 && !out["border-style"]) {
    out["border-style"] = "solid";
  }
  if (merged.borderWidth !== undefined && Number(merged.borderWidth) > 0 && !out["border-color"]) {
    out["border-color"] = "currentColor";
  }
  return out;
}

// Responsive-aware widget attribute (align/columns/gap/widths…).
export function resolveAttr(block, device, key, fallback) {
  const responsive = (block.responsive && block.responsive[device]) || {};
  if (responsive.attrs && responsive.attrs[key] !== undefined) return responsive.attrs[key];
  if (key.startsWith("attrs.")) {
    const value = block.attrs ? block.attrs[key.slice(6)] : undefined;
    return value !== undefined ? value : fallback;
  }
  const data = block.data || {};
  if (data[key] !== undefined) return data[key];
  return fallback;
}

export function cssString(props) {
  return Object.keys(props).sort().map((k) => `${k}:${props[k]}`).join(";");
}

export function blockCSS(block, device = "desktop") {
  return cssString(resolveStyles(block, device));
}

// Scoped custom CSS for one block. Declarations-mode: the author's rules are
// wrapped in the block's own selector so they cannot leak to other widgets.
export function blockCustomCSS(block) {
  const css = (block.customCSS || block.data?.customCSS || "").trim();
  if (!css) return "";
  const selector = block.customId ? `#${block.customId}` : `[data-block-id="${block.id}"]`;
  const safe = css.replace(/<\/style/gi, "<\\/style");
  if (/\{/.test(safe)) {
    // Advanced mode: full rules supplied by the author, kept verbatim.
    return `<style data-block-css="${block.id}">${safe}</style>`;
  }
  return `<style data-block-css="${block.id}">${selector}{${safe}}</style>`;
}

// ─── Blueprint shape translation ───────────────────────────────────────────

export function createBlockData(type) {
  const def = CATALOG_BY_TYPE[type];
  if (!def) throw new Error(`Unknown block type: ${type}`);
  const flat = typeof def.defaults === "function" ? def.defaults() : {};
  return splitData(flat);
}

// Reserved engine-data keys. Catalog defaults are flat (text, level, src...);
// reserved keys keep blueprint top-level meaning, everything else is settings.
const RESERVED_DATA_KEYS = new Set([
  "content", "attrs", "styles", "responsive", "settings",
  "locked", "hidden", "customClasses", "customId", "customCSS", "tag",
  "ariaLabel", "dataAttrs", "customAttributes",
]);

function splitData(flat) {
  const data = {
    content: [], attrs: {}, styles: {},
    responsive: { mobile: {}, tablet: {}, desktop: {} },
    settings: {}, locked: false, hidden: false,
    customClasses: "", customId: "", customCSS: "", tag: "",
    ariaLabel: "", dataAttrs: {}, customAttributes: {},
  };
  for (const [key, value] of Object.entries(flat || {})) {
    if (RESERVED_DATA_KEYS.has(key)) data[key] = value;
    else data.settings[key] = value;
  }
  return data;
}

export function createBlockDataFlat(type) {
  const def = CATALOG_BY_TYPE[type];
  if (!def) throw new Error(`Unknown block type: ${type}`);
  return typeof def.defaults === "function" ? def.defaults() : {};
}

// Heal list/table text surfaces to the inline model at every boundary, so
// legacy strings, importer output and inspector writes all converge.
function normalizeSettingsInline(type, settings) {
  if (!settings || typeof settings !== "object") return;
  if ((type === "bulletList" || type === "orderedList") && Array.isArray(settings.items)) {
    settings.items = settings.items.map((item) =>
      item && typeof item === "object" && !Array.isArray(item) ? item : normalizeInline(item));
  }
  if (type === "table" && Array.isArray(settings.rows)) {
    settings.rows = settings.rows.map((row) =>
      (Array.isArray(row) ? row : [row]).map((cell) => normalizeInline(cell)));
  }
}

export function toEngineNode(block) {
  const data = splitData({
    content: block.content || [],
    attrs: block.attrs || {},
    styles: block.styles || {},
    responsive: block.responsive || { mobile: {}, tablet: {}, desktop: {} },
    locked: !!block.locked,
    hidden: !!block.hidden,
    customClasses: block.customClasses || "",
    customId: block.customId || "",
    customCSS: block.customCSS || "",
    tag: block.tag || "",
    ariaLabel: block.ariaLabel || "",
    dataAttrs: block.dataAttrs || {},
    customAttributes: block.customAttributes || {},
    ...(block.data || {}),
  });
  normalizeSettingsInline(block.type, data.settings);
  return {
    id: block.id,
    type: block.type,
    parentId: block.parent === undefined ? null : block.parent,
    children: [...(block.children || [])],
    data,
  };
}

export function fromEngineNode(node) {
  const data = node.data || {};
  const settings = { ...(data.settings || {}) };
  normalizeSettingsInline(node.type, settings);
  const block = {
    id: node.id,
    type: node.type,
    content: data.content || [],
    attrs: data.attrs || {},
    styles: data.styles || {},
    responsive: data.responsive || { mobile: {}, tablet: {}, desktop: {} },
    children: [...(node.children || [])],
    parent: node.parentId,
    locked: !!data.locked,
    hidden: !!data.hidden,
    customClasses: data.customClasses || "",
    customId: data.customId || "",
    customCSS: data.customCSS || "",
    tag: data.tag || "",
    ariaLabel: data.ariaLabel || "",
    dataAttrs: data.dataAttrs || {},
    customAttributes: data.customAttributes || {},
    data: settings,
  };
  return block;
}

// Blueprint document JSON: { version, blocks: {id: block}, blockOrder, rootId }.
// `blocks` is a flat id→block map of the whole tree; `blockOrder` is the
// ordered list of TOP-LEVEL blocks only (root's children). The renderer nests
// children via each block's `children`, so a flat order here would render every
// nested block twice (once nested, once top-level) — the classic duplication
// bug. topLevelOrder stays the single source of truth for the canvas sequence.
export function snapshotToBlueprint(snapshot) {
  const blocks = {};
  const index = new Map();
  for (const n of snapshot.nodes || []) {
    if (!index.has(n.id)) index.set(n.id, n);
  }
  const walk = (id) => {
    const node = index.get(id);
    if (!node || blocks[id]) return;
    blocks[id] = fromEngineNode(node);
    for (const cid of node.children || []) walk(cid);
  };
  walk(snapshot.rootId);
  const root = index.get(snapshot.rootId);
  const order = root ? [...(root.children || [])] : [];
  return { version: snapshot.schemaVersion || 1, blocks, blockOrder: order, rootId: snapshot.rootId };
}

export function blueprintToNodes(bp) {
  if (!bp || typeof bp !== "object" || !bp.blocks) return null;
  return Object.values(bp.blocks).map(toEngineNode);
}

// ─── Reading helpers ───────────────────────────────────────────────────────

export function inlineToText(content) {
  if (!Array.isArray(content)) return "";
  return content.filter((n) => n && n.type === "text").map((n) => n.text || "").join("");
}

export function blockText(block) {
  if (!block) return "";
  const direct = inlineToText(block.content);
  if (direct.trim()) return direct.trim();
  const d = block.data || {};
  for (const key of ["text", "title", "caption", "cite"]) {
    if (typeof d[key] === "string" && d[key].trim()) return d[key].trim();
  }
  if (Array.isArray(d.items)) {
    return d.items
      .map((item) => (typeof item === "string" ? item : inlinePlainText(item)))
      .filter(Boolean).join(", ");
  }
  return "";
}

export function blockLabel(block) {
  const def = CATALOG_BY_TYPE[block.type];
  const base = def ? def.label : block.type;
  const snippet = blockText(block);
  return { base, snippet: snippet.length > 42 ? snippet.slice(0, 41) + "…" : snippet };
}

export function settingValue(block, key, fallback) {
  const data = block.data || {};
  if (key in data) return data[key];
  if (key.startsWith("attrs.")) return block.attrs?.[key.slice(6)] ?? fallback;
  if (key.startsWith("styles.")) return block.styles?.[key.slice(7)] ?? fallback;
  if (key.startsWith("layout.")) return data.layout?.[key.slice(7)] ?? fallback;
  if (key in block) return block[key];
  return fallback;
}

const TOP_LEVEL_KEYS = new Set([
  "locked", "hidden", "customClasses", "customId", "customCSS",
  "tag", "ariaLabel", "dataAttrs",
]);

export function withSetting(block, key, value) {
  const next = JSON.parse(JSON.stringify(block));
  if (key.startsWith("attrs.")) {
    next.attrs = { ...(next.attrs || {}), [key.slice(6)]: value };
  } else if (key.startsWith("styles.")) {
    next.styles = { ...(next.styles || {}), [key.slice(7)]: value };
  } else if (key.startsWith("layout.")) {
    next.data = { ...(next.data || {}) };
    next.data.layout = { ...(next.data.layout || {}), [key.slice(7)]: value };
  } else if (TOP_LEVEL_KEYS.has(key)) {
    next[key] = value;
  } else if (key in next && typeof next[key] !== "object") {
    next[key] = value;
  } else {
    next.data = { ...(next.data || {}), [key]: value };
  }
  return next;
}
