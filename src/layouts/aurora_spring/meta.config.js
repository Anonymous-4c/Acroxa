// src/layouts/aurora_spring/meta.config.js

module.exports = {
  ui: {
    // ── Layout (root) ───────────────────────────────────────────────────
    "layout.containerWidth": {
      label: "Container width",
      hint: "Max width of page content.",
      input: "select",
      options: ["small", "medium", "large"],
      section: "layout"
    },
    "layout.headerStyle": {
      label: "Header style",
      hint: "Choose header presentation.",
      input: "select",
      options: ["standard", "minimal", "centered"],
      section: "layout"
    },
    "layout.spacingDensity": {
      label: "Spacing density",
      hint: "Control the vertical rhythm of sections.",
      input: "select",
      options: ["compact", "normal", "spacious"],
      section: "layout"
    },
    "layout.cardStyle": {
      label: "Card style",
      hint: "Controls card depth/elevation feel.",
      input: "select",
      options: ["flat", "soft"],
      section: "layout"
    },

    // ── Layout (sidebar group) ─────────────────────────────────────────
    "layout.sidebar.enabled": {
      label: "Enable Sidebar",
      input: "boolean",
      section: "layout"
    },
    "layout.sidebar.position": {
      label: "Sidebar position",
      input: "select",
      options: ["left", "right"],
      section: "layout"
    },
    "layout.sidebar.width": {
      label: "Sidebar width",
      hint: "CSS width (e.g. 320px).",
      input: "text",
      section: "layout"
    },
    "layout.sidebar.show_on_homepage": {
      label: "Show sidebar on homepage",
      input: "boolean",
      section: "layout"
    },
    "layout.sidebar.show_on_pages": {
      label: "Show sidebar on pages & blog",
      input: "boolean",
      section: "layout"
    },
    "layout.sidebar.show_on_posts": {
      label: "Show sidebar on posts",
      input: "boolean",
      section: "layout"
    },

    // ── Colors ─────────────────────────────────────────────────────────
    "colors.primary": {
      label: "Primary accent",
      hint: "Buttons, links, and highlights across the layout.",
      input: "color",
      section: "colors"
    },
    "colors.secondary": {
      label: "Secondary",
      hint: "Secondary accent used for supportive UI elements.",
      input: "color",
      section: "colors"
    },
    "colors.accent": {
      label: "Accent highlight",
      hint: "Extra accent for badges and special highlights.",
      input: "color",
      section: "colors"
    },
    "colors.textLight": {
      label: "Text (Light Mode)",
      hint: "Primary reading color for light mode backgrounds.",
      input: "color",
      section: "colors"
    },
    "colors.textDark": {
      label: "Text (Dark Mode)",
      hint: "Primary reading color for dark mode backgrounds.",
      input: "color",
      section: "colors"
    },
    "colors.bgLight": {
      label: "Background (Light Mode)",
      hint: "Neutral light canvas behind content sections.",
      input: "color",
      section: "colors"
    },
    "colors.bgDark": {
      label: "Background (Dark Mode)",
      hint: "Neutral dark canvas behind content sections.",
      input: "color",
      section: "colors"
    },

    // ── Typography ─────────────────────────────────────────────────────
    "typography.headingFont": {
      label: "Heading font",
      hint: "CSS font-family value for headings.",
      input: "font",
      section: "typography"
    },
    "typography.bodyFont": {
      label: "Body font",
      hint: "CSS font-family value for body text.",
      input: "font",
      section: "typography"
    },
    "typography.scale": {
      label: "Typography scale",
      hint: "Adjusts base size and vertical rhythm.",
      input: "select",
      options: ["compact", "normal", "spacious"],
      section: "typography"
    },
    "typography.baseFontSize": {
      label: "Base font size",
      hint: "Base size in pixels (affects spacing rhythm).",
      input: "range",
      min: 14,
      max: 20,
      step: 1,
      unit: "px",
      section: "typography"
    },

    // ── Homepage ───────────────────────────────────────────────────────
    "homepage.heroEyebrow": {
      label: "Hero eyebrow",
      input: "text",
      section: "homepage"
    },
    "homepage.heroTitle": {
      label: "Hero title",
      input: "text",
      section: "homepage"
    },
    "homepage.heroSubtitle": {
      label: "Hero subtitle",
      input: "textarea",
      rows: 4,
      section: "homepage"
    },
    "homepage.heroMediaUrl": {
      label: "Hero image URL",
      input: "text",
      section: "homepage"
    },
    "homepage.ctaPrimaryText": {
      label: "Primary CTA text",
      input: "text",
      section: "homepage"
    },
    "homepage.ctaPrimaryUrl": {
      label: "Primary CTA URL",
      input: "text",
      section: "homepage"
    },
    "homepage.ctaSecondaryText": {
      label: "Secondary CTA text",
      input: "text",
      section: "homepage"
    },
    "homepage.ctaSecondaryUrl": {
      label: "Secondary CTA URL",
      input: "text",
      section: "homepage"
    },

    "homepage.showFeatures": {
      label: "Show features section",
      input: "boolean",
      section: "homepage"
    },
    "homepage.showSplit": {
      label: "Show split section",
      input: "boolean",
      section: "homepage"
    },
    "homepage.showLogos": {
      label: "Show logos bar",
      input: "boolean",
      section: "homepage"
    },
    "homepage.showTestimonials": {
      label: "Show testimonials",
      input: "boolean",
      section: "homepage"
    },
    "homepage.showCtaBanner": {
      label: "Show CTA banner",
      input: "boolean",
      section: "homepage"
    },
    "homepage.showBlogPreview": {
      label: "Show blog preview",
      input: "boolean",
      section: "homepage"
    },
    "homepage.blogPreviewCount": {
      label: "Blog preview count",
      input: "select",
      options: ["2", "3", "4", "6"],
      section: "homepage"
    },
    "homepage.showPricing": {
      label: "Show pricing section",
      hint: "Optional homepage pricing preview.",
      input: "boolean",
      section: "homepage"
    }
  },

  computed: {
    isSidebarVisible(config) {
      return config?.layout?.sidebar?.enabled !== false;
    },
    containerClass(config) {
      return config?.layout?.containerWidth || "medium";
    }
  },

  validators: {
    "colors.primary"(v) {
      return /^#[0-9a-f]{3,8}$/i.test(v) || "Must be a valid hex color";
    },
    "layout.sidebar.width"(v) {
      return /^\d+(px|%|rem|em|vw)$/.test(v) || "Use a valid CSS width (e.g. 320px)";
    }
  }
};
