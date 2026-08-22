// src/layouts/zenith/meta.config.js
//
// DYNAMIC LAYER — enhances meta.json without mutating it.
// This file is OPTIONAL. If absent, the engine runs JSON-only mode.

module.exports = {

  ui: {
    "colors.primary": {
      label:   "Primary Color",
      hint:    "Main brand color used in headers and accents.",
      input:   "color",
      section: "colors",
    },
    "colors.secondary": {
      label:   "Secondary Color",
      hint:    "Used for secondary elements and gradients.",
      input:   "color",
      section: "colors",
    },
    "colors.accent": {
      label:   "Accent Color",
      hint:    "Highlight color for interactive elements.",
      input:   "color",
      section: "colors",
    },
    "colors.background": {
      label:   "Page Background",
      hint:    "Main page background color (light theme).",
      input:   "color",
      section: "colors",
    },
    "colors.foreground": {
      label:   "Text Color",
      hint:    "Main text / foreground color.",
      input:   "color",
      section: "colors",
    },
    "typography.headingFont": {
      label:   "Heading Font",
      hint:    "CSS font-family value for headings.",
      input:   "text",
      section: "typography",
    },
    "typography.bodyFont": {
      label:   "Body Font",
      hint:    "CSS font-family value for body text.",
      input:   "text",
      section: "typography",
    },
  },

  validators: {
    "colors.primary": (val) => /^#[0-9a-f]{6}$/i.test(val) ? null : "Invalid color format",
    "colors.secondary": (val) => /^#[0-9a-f]{6}$/i.test(val) ? null : "Invalid color format",
    "colors.accent": (val) => /^#[0-9a-f]{6}$/i.test(val) ? null : "Invalid color format",
  },

  computed: {
    // Computed fields can derive values from config
  },

};
