// src/models/mongo/LandingPage.js

const mongoose = require("mongoose");

// ── SECTION BLOCK SCHEMA ─────────────────────────────────────────────────────
// Each block has a type and a free-form data object.
// The layout's landing template decides how each type renders.
const SectionBlockSchema = new mongoose.Schema(
  {
    // e.g. "hero", "features", "cta", "testimonials", "pricing",
    //      "faq", "gallery", "stats", "team", "embed", "custom"
    type: { type: String, required: true },

    // Human label for the block editor UI
    label: { type: String, default: "" },

    // Block-specific data — fully open, layout template decides shape
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Visibility controls
    visible:  { type: Boolean, default: true },
    // Order/position within the landing page (0-based)
    order:    { type: Number, default: 0 },

    // Per-block custom CSS class overrides
    cssClass: { type: String, default: "" },

    // Per-block custom CSS (injected scoped to this block)
    customCSS: { type: String, default: "" },
  },
  { _id: true } // Each block gets its own _id for targeted updates
);

// ── A/B VARIANT SCHEMA ───────────────────────────────────────────────────────
const ABVariantSchema = new mongoose.Schema(
  {
    // e.g. "control", "variant-a", "variant-b"
    key:     { type: String, required: true },
    label:   { type: String, default: "" },
    // Percentage of traffic to route here (0–100). Sum across variants should = 100.
    weight:  { type: Number, default: 50, min: 0, max: 100 },
    // Each variant can override the full sections array
    sections: { type: [SectionBlockSchema], default: [] },
    // Variant-specific metadata overrides (title, description, etc.)
    metaOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
    active:  { type: Boolean, default: true },
  },
  { _id: true }
);

// ── CONVERSION GOAL SCHEMA ───────────────────────────────────────────────────
const ConversionGoalSchema = new mongoose.Schema(
  {
    // e.g. "click", "form_submit", "scroll_depth", "time_on_page", "custom_event"
    type:       { type: String, required: true },
    label:      { type: String, default: "" },
    // For click goals: CSS selector to watch
    selector:   { type: String, default: "" },
    // For scroll goals: percentage depth (0–100)
    scrollDepth:{ type: Number, default: 50 },
    // For time goals: seconds on page
    timeSeconds:{ type: Number, default: 30 },
    // For custom events: event name
    eventName:  { type: String, default: "" },
    // Whether to count once per session or multiple
    countOnce:  { type: Boolean, default: true },
  },
  { _id: true }
);

// ── TRACKING PIXEL SCHEMA ────────────────────────────────────────────────────
const TrackingPixelSchema = new mongoose.Schema(
  {
    // e.g. "facebook", "google_ads", "tiktok", "custom"
    provider: { type: String, required: true },
    pixelId:  { type: String, default: "" },
    // Raw script/noscript HTML for custom pixels
    code:     { type: String, default: "" },
    // Where to inject: "head" | "body_start" | "body_end"
    location: { type: String, enum: ["head", "body_start", "body_end"], default: "head" },
    enabled:  { type: Boolean, default: true },
  },
  { _id: true }
);

// ── MAIN LANDING PAGE SCHEMA ─────────────────────────────────────────────────
const getSchema = () => {
  const schema = new mongoose.Schema(
    {
      title: { type: String, required: true, trim: true },

      // URL slug — resolves as /:landingPagePrefix/:slug by default
      // OR as / if designated as homepage
      slug: { type: String, required: true, unique: true, trim: true },

      status: {
        type: String,
        enum: ["draft", "published", "scheduled", "archived", "trashed"],
        default: "draft",
      },

      // ── CONTENT BLOCKS ──────────────────────────────────────────────────
      // The primary sections array (used when A/B testing is off, or as "control")
      sections: { type: [SectionBlockSchema], default: [] },

      // ── LAYOUT CONTEXT ──────────────────────────────────────────────────
      // Which layout template to use. Falls back: "landing" → "page" → 404
      template: { type: String, default: "landing" },

      // Layout config overrides (merged on top of active layout config for this page)
      layoutOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },

      // ── A/B TESTING ─────────────────────────────────────────────────────
      abTesting: {
        enabled:  { type: Boolean, default: false },
        variants: { type: [ABVariantSchema], default: [] },
        // "cookie" | "query" | "random"
        splitMethod: { type: String, enum: ["cookie", "query", "random"], default: "cookie" },
        // Cookie TTL in days when splitMethod === "cookie"
        cookieTTL:   { type: Number, default: 30 },
      },

      // ── CONVERSION GOALS ────────────────────────────────────────────────
      conversionGoal: { type: String, default: "" }, // Human label for primary goal
      goals: { type: [ConversionGoalSchema], default: [] },

      // ── TRACKING ────────────────────────────────────────────────────────
      trackingPixels: { type: [TrackingPixelSchema], default: [] },

      // ── SEO ─────────────────────────────────────────────────────────────
      metaTitle:       { type: String, default: "" },
      metaDescription: { type: String, default: "" },
      focusKeyword:    { type: String, default: "" },
      keywords:        { type: [String], default: [] },
      canonicalUrl:    { type: String, default: "" },
      ogTitle:         { type: String, default: "" },
      ogDescription:   { type: String, default: "" },
      ogImage:         { type: String, default: "" },
      noIndex:         { type: Boolean, default: false },
      noFollow:        { type: Boolean, default: false },

      // ── PUBLISHING ──────────────────────────────────────────────────────
      publishDate: { type: Date, default: null },
      publishAt:   { type: Date, default: null },

      // ── AUTHORING ───────────────────────────────────────────────────────
      author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

      // ── CUSTOM CODE ─────────────────────────────────────────────────────
      customCSS: { type: String, default: "" },
      customJS:  { type: String, default: "" },

      // ── ANALYTICS CACHE (populated by analytics system) ─────────────────
      stats: {
        views:       { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
        // Conversion rate is derived, not stored
      },
    },
    { timestamps: true, strictPopulate: false }
  );

  // Auto-generate slug from title on save
  schema.pre("save", function (next) {
    if (!this.slug && this.title) {
      this.slug = this.title
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
    }
    next();
  });

  schema.set("toJSON", {
    transform: (doc, ret) => {
      ret.id = ret._id ? ret._id.toString() : undefined;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });

  // Virtual: computed conversion rate
  schema.virtual("conversionRate").get(function () {
    if (!this.stats?.views) return 0;
    return ((this.stats.conversions / this.stats.views) * 100).toFixed(2);
  });

  return schema;
};

const attachMethods = (LandingPage) => {
  LandingPage.findPublished = () =>
    LandingPage.find({ status: "published" }).sort({ publishDate: -1 });

  LandingPage.findBySlug = (slug) =>
    LandingPage.findOne({ slug, status: "published" });

  return LandingPage;
};

const buildModel = () => {
  const schema      = getSchema();
  const LandingPage = mongoose.model("LandingPage", schema);
  return attachMethods(LandingPage);
};

module.exports = { buildModel };