// src/layouts/nova-nexus/meta.config.js
//
// DYNAMIC LAYER — enhances meta.json without mutating it.
// This file is OPTIONAL. If absent, the engine runs JSON-only mode.
//
// Rules:
//   - Never define `default` values here for fields that exist in meta.json
//     (the JSON layer owns stored defaults).
//   - Use this file for: UI hints, validators, computed fields, extra options.

module.exports = {

  // ── UI OVERRIDES ──────────────────────────────────────────────────────────
  // Override display metadata for specific fields.
  // Keys are dot-notation paths matching meta.json config structure.
  ui: {
    "colors.primary": {
      label:   "Primary / Neon Accent",
      hint:    "Main neon glow color used on borders and highlights.",
      input:   "color",
      section: "colors",
    },
    "colors.secondary": {
      label:   "Secondary / Purple",
      hint:    "Used for secondary elements and gradients.",
      input:   "color",
      section: "colors",
    },
    "colors.accent": {
      label:   "Accent / Pink",
      hint:    "Highlight color for tags, badges, and CTAs.",
      input:   "color",
      section: "colors",
    },
    "colors.background": {
      label:   "Page Background",
      hint:    "Deep dark background. Works best as a very dark color.",
      input:   "color",
      section: "colors",
    },
    "typography.headingFont": {
      label:   "Heading Font",
      hint:    "CSS font-family value. Use Google Fonts search to select.",
      input:   "font",
      section: "typography",
    },
    "typography.bodyFont": {
      label:   "Body / Paragraph Font",
      hint:    "CSS font-family value for body text.",
      input:   "font",
      section: "typography",
    },
    "typography.baseFontSize": {
      label:   "Base Font Size",
      hint:    "Root font size in pixels. Affects all rem-based spacing.",
      input:   "range",
      unit:    "px",
      section: "typography",
    },
    "animations.duration": {
      label: "Animation Speed",
      hint:  "Duration of scroll-reveal animations in milliseconds.",
      input: "range",
      unit:  "ms",
    },
    "homepage.postsPerRow": {
      label:   "Posts Per Row",
      hint:    "Number of post cards per row on the homepage grid.",
      input:   "select",
      options: ["1", "2", "3", "4"],
    },
    "layout.sidebar.width": {
      label:   "Sidebar Width",
      hint:    "CSS width value, e.g. 300px or 25%.",
      input:   "text",
      pattern: /^\d+(px|%|rem|em|vw)$/,
    },
  },

  // ── COMPUTED FIELDS ────────────────────────────────────────────────────────
  // Functions that derive a value at render time from the resolved config.
  // Available in templates via params.computed.fieldName().
  computed: {
    isSidebarVisible(config) {
      return config?.layout?.sidebar?.enabled === true;
    },
    animationDurationCSS(config) {
      const ms = config?.animations?.duration || 600;
      return `${ms}ms`;
    },
    cssGlowShadow(config) {
      const color = config?.colors?.primary || "#00f0ff";
      return `0 0 20px ${color}40, 0 0 40px ${color}20`;
    },
    fontFamilyCSS(config) {
      return config?.typography?.bodyFont || "'Inter', sans-serif";
    },
    headingFontCSS(config) {
      return config?.typography?.headingFont || "'Oxanium', sans-serif";
    },
  },

  // ── VALIDATORS ────────────────────────────────────────────────────────────
  // Called before saving a config value. Return true to allow, false/string to reject.
  validators: {
    "colors.primary"(v) {
      return /^#[0-9a-f]{3,8}$/i.test(v) || "Must be a valid hex color";
    },
    "colors.secondary"(v) {
      return /^#[0-9a-f]{3,8}$/i.test(v) || "Must be a valid hex color";
    },
    "colors.accent"(v) {
      return /^#[0-9a-f]{3,8}$/i.test(v) || "Must be a valid hex color";
    },
    "colors.background"(v) {
      return /^#[0-9a-f]{3,8}$/i.test(v) || "Must be a valid hex color";
    },
    "typography.baseFontSize"(v) {
      return (v >= 12 && v <= 24) || "Font size must be between 12 and 24";
    },
    "layout.sidebar.width"(v) {
      return /^\d+(px|%|rem|em|vw)$/.test(v) || "Must be a valid CSS width (e.g. 300px, 25%)";
    },
  },

  // ── EXTRA SCHEMA FIELDS ────────────────────────────────────────────────────
  // Additional fields not in meta.json but surfaced by this config.
  // These extend the schema without overwriting meta.json.
  schema: {
    layout: {
      headerSticky: {
        type:    "boolean",
        default: false,
        label:   "Sticky Header",
        hint:    "Fix header to top of screen on scroll.",
      },
      headerBlur: {
        type:    "boolean",
        default: true,
        label:   "Header Blur",
        hint:    "Apply glassmorphism blur to header background.",
      },
    },
    advanced: {
      customCSS: {
        type:    "textarea",
        default: "",
        label:   "Custom CSS",
        hint:    "Additional CSS injected into every page of this layout.",
        rows:    8,
      },
    },
  },
};