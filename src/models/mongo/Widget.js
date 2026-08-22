// src/models/Widget.mongoose.js
// Mongoose (MongoDB) model for the Alpha Widget system.
// Follows the same buildModel / attachMethods / getExtensions architecture
// used by the Page and Post models.
"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;
// ── Extension Registry ────────────────────────────────────────────────────────
const _extensions = [];
function getExtensions() {
  return [..._extensions];
}
function registerExtension(fn) {
  if (typeof fn !== "function") throw new Error("[Widget] Extension must be a function.");
  _extensions.push(fn);
}
// ── Condition Rule Schema ─────────────────────────────────────────────────────
// Recursive tree: a node is either a group (operator + rules[])
// or a leaf (target + field + op + value + negate).
// NOT executable JS — evaluated by Alpha's rendering engine.
const ConditionLeafSchema = new Schema(
  {
    target: { type: String, required: true }, // device | theme | auth | role | ...
    field: { type: String, default: null },
    op: { type: String, required: true }, // eq | neq | gt | in | ...
    value: { type: Schema.Types.Mixed, default: null },
    negate: { type: Boolean, default: false },
  },
  { _id: false }
);
// Mongoose doesn't support self-referencing schemas cleanly with new Schema()
// so the group-level Mixed fallback handles nested groups at the DB layer;
// structural validation is done in the controller (validateConditionTree).
const ConditionNodeSchema = new Schema(
  {
    operator: { type: String, enum: ["and", "or"], default: null },
    rules: { type: [Schema.Types.Mixed], default: undefined },
    // Leaf fields (present when operator is null)
    target: { type: String, default: null },
    field: { type: String, default: null },
    op: { type: String, default: null },
    value: { type: Schema.Types.Mixed, default: null },
    negate: { type: Boolean, default: false },
  },
  { _id: false }
);
// ── Responsive Sub-schema ─────────────────────────────────────────────────────
const ResponsiveSchema = new Schema(
  {
    mobile: { type: Schema.Types.Mixed, default: {} },
    tablet: { type: Schema.Types.Mixed, default: {} },
    desktop: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);
// ── Visibility Sub-schema ─────────────────────────────────────────────────────
const VisibilitySchema = new Schema(
  {
    mobile: { type: Boolean, default: true },
    tablet: { type: Boolean, default: true },
    desktop: { type: Boolean, default: true },
    loggedIn: { type: Boolean, default: null }, // null = show always
    loggedOut: { type: Boolean, default: null },
  },
  { _id: false }
);
// ── Content Sub-schema ────────────────────────────────────────────────────────
const WidgetContentSchema = new Schema(
  {
    // Widget-level document (Alpha JSON document — source of truth)
    json: { type: Schema.Types.Mixed, default: null }, // Real Renderable JSON (used for rendering mean for rendering while editing in the editor)
    html: { type: String, default: "" }, // Preview HTML (used in the editor when user clicks Preview Widget, not for rendering)
    // Per-widget settings (layout, alignment, padding, etc.)
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);
// ── Main Widget Schema ────────────────────────────────────────────────────────
const WidgetSchema = new Schema(
  {
    // Identity
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    type: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "custom" },
    description: { type: String, trim: true, default: "" },
    icon: { type: String, default: null },
    version: { type: String, default: "1.0.0" },
    // Content
    content: { type: WidgetContentSchema, default: () => ({}) },
    // Content type / rendering mode
    contentType: {
      type: String,
      enum: ["json", "html", "json-rendered"],
      default: "json",
    },
    // Presentation
    styles: { type: Schema.Types.Mixed, default: {} },
    responsive: { type: ResponsiveSchema, default: () => ({}) },
    customCSS: { type: String, default: "" },
    customJS: { type: String, default: "" },
    customAttributes: { type: Schema.Types.Mixed, default: {} },
    // Visibility + Conditions
    visibility: { type: VisibilitySchema, default: () => ({}) },
    conditions: { type: ConditionNodeSchema, default: null },
    // Discovery / Management
    previewImage: { type: String, default: null },
    tags: { type: [String], default: [] },
    author: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["active", "archived", "draft"], default: "active" },
    isGlobal: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0, min: 0 },
    isDynamic: { type: Boolean, default: false },
    isStatic: { type: Boolean, default: true },
    // Plugin / Extension
    plugin: { type: String, default: "Acroxa" },
    // Metadata (arbitrary key-value, includes position)
    metadata: { type: Schema.Types.Mixed, default: {} },
    // Schema versioning for future migrations
    schemaVersion: { type: Number, default: 1 },
  },
  {
    timestamps: true,
    versionKey: "__v",
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);
// ── Indexes ───────────────────────────────────────────────────────────────────
WidgetSchema.index({ slug: 1 }, { unique: true });
WidgetSchema.index({ type: 1 });
WidgetSchema.index({ category: 1 });
WidgetSchema.index({ status: 1 });
WidgetSchema.index({ isGlobal: 1 });
WidgetSchema.index({ isDynamic: 1 });
WidgetSchema.index({ isStatic: 1 });
WidgetSchema.index({ tags: 1 });
WidgetSchema.index({ plugin: 1 });
WidgetSchema.index({ createdAt: -1 });
WidgetSchema.index(
  { name: "text", description: "text", tags: "text" },
  { name: "widget_text_search" }
);
// ── Virtuals ──────────────────────────────────────────────────────────────────
WidgetSchema.virtual("isArchived").get(function () {
  return this.status === "archived";
});
WidgetSchema.virtual("isDraft").get(function () {
  return this.status === "draft";
});
// ── Middleware ────────────────────────────────────────────────────────────────
WidgetSchema.pre("save", function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  next();
});
// ── Static Methods ────────────────────────────────────────────────────────────
function attachMethods(schema) {
  // ── Statics ──
  /**
   * Find all active widgets, sorted by position then name.
   */
  schema.statics.findActive = function (filter = {}) {
    return this.find({ ...filter, status: "active" }).sort({ "metadata.position": 1, name: 1 });
  };
  /**
   * Find all global widgets (usable across any page/post).
   */
  schema.statics.findGlobal = function () {
    return this.find({ isGlobal: true, status: "active" }).sort({ name: 1 });
  };
  /**
   * Increment the usage counter for a widget by ID.
   */
  schema.statics.incrementUsage = function (id) {
    return this.findByIdAndUpdate(id, { $inc: { usageCount: 1 } }, { new: true });
  };
  /**
   * Search widgets by text across name, description and tags.
   */
  schema.statics.search = function (query, filter = {}) {
    const regex = new RegExp(query, "i");
    return this.find({
      $or: [{ name: regex }, { description: regex }, { tags: regex }],
      ...filter,
    }).lean();
  };
  // ── Instance Methods ──
  /**
   * Return a clean JSON-safe representation (respects toJSON transform).
   */
  schema.methods.toPublic = function () {
    return this.toJSON();
  };
  /**
   * Deep-clone this widget as a new unsaved document.
   */
  schema.methods.duplicate = function () {
    const data = this.toObject();
    delete data._id;
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    data.name = `${data.name} (Copy)`;
    data.slug = `${data.slug}-copy-${Date.now()}`;
    data.status = "draft";
    data.usageCount = 0;
    return new this.constructor(data);
  };
  /**
   * Check whether this widget should be visible under given context.
   * Actual condition evaluation is left to Alpha's rendering engine —
   * this is a fast structural guard only.
   */
  schema.methods.isVisibleFor = function (context = {}) {
    const v = this.visibility || {};
    if (context.device === "mobile" && v.mobile === false) return false;
    if (context.device === "tablet" && v.tablet === false) return false;
    if (context.device === "desktop" && v.desktop === false) return false;
    if (context.loggedIn !== undefined && v.loggedIn === false && context.loggedIn) return false;
    if (context.loggedOut !== undefined && v.loggedOut === false && !context.loggedIn) return false;
    return true;
  };
}
// ── buildModel ────────────────────────────────────────────────────────────────
function buildModel() {
  // Attach core methods
  attachMethods(WidgetSchema);
  // Apply all registered plugin extensions
  for (const ext of _extensions) {
    ext(WidgetSchema, mongoose);
  }
  // Avoid re-registering the model on hot reload
  if (mongoose.models && mongoose.models.Widget) {
    return mongoose.models.Widget;
  }
  return mongoose.model("Widget", WidgetSchema);
}
// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  buildModel,
  attachMethods,
  getExtensions,
  registerExtension,
  WidgetSchema,
};
