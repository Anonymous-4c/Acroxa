// src/models/mongo/Pattern.js
// Mongoose (MongoDB) model for the Acroxa Pattern system.
//
// A Pattern is a reusable COMPOSITION of widgets (a tree), as opposed to a
// Widget which is a single functional node. Patterns are inserted into a
// document either as a snapshot (cloned, detached) or as a reference
// (synchronised global pattern).
//
// Follows the same buildModel / attachMethods / getExtensions architecture
// used by the Widget, Page and Post models.
"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

// ── Extension Registry ────────────────────────────────────────────────────────
const _extensions = [];

function getExtensions() {
  return [..._extensions];
}

function registerExtension(fn) {
  if (typeof fn !== "function") throw new Error("[Pattern] Extension must be a function.");
  _extensions.push(fn);
}

// ── Content Sub-schema ────────────────────────────────────────────────────────
// The pattern tree itself. `nodes` is the serialised Acroxa widget tree
// (an array of widget-instance nodes, each of which may contain children).
// It is data, never executable code.
const PatternContentSchema = new Schema(
  {
    // Serialised Acroxa widget tree — source of truth for insertion.
    nodes: { type: [Schema.Types.Mixed], default: [] },
    // Optional pre-rendered HTML used only for library previews.
    html: { type: String, default: "" },
    // Pattern-level settings (container defaults, spacing, etc.)
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

// ── Override Slot Sub-schema ──────────────────────────────────────────────────
// Declares which parts of a global pattern an instance is allowed to override.
const OverrideSlotSchema = new Schema(
  {
    // Stable node key inside content.nodes (widget instance `key`).
    key: { type: String, required: true },
    // Which attribute path on that node may be overridden.
    field: { type: String, required: true },
    label: { type: String, default: "" },
  },
  { _id: false }
);

// ── Main Pattern Schema ───────────────────────────────────────────────────────
const PatternSchema = new Schema(
  {
    // Identity
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, trim: true, default: "" },

    // Semantic role of the pattern (hero, cta, pricing, footer, ...).
    type: { type: String, trim: true, default: "content" },
    // Broader grouping used by the library UI.
    category: { type: String, trim: true, default: "general" },

    icon: { type: String, default: null },

    // Content tree
    content: { type: PatternContentSchema, default: () => ({}) },

    // Discovery
    previewImage: { type: String, default: null },
    tags: { type: [String], default: [] },
    keywords: { type: [String], default: [] },

    // Reuse mode:
    //   snapshot -> inserting clones the tree, no link back
    //   global   -> inserting stores a reference; edits propagate
    mode: { type: String, enum: ["snapshot", "global"], default: "snapshot" },

    // Which fields an instance of a global pattern may override.
    overrides: { type: [OverrideSlotSchema], default: [] },

    // Management
    author: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["active", "archived", "draft"], default: "active" },
    visibility: { type: String, enum: ["public", "private"], default: "public" },
    isLocked: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0, min: 0 },

    // Versioning
    version: { type: Number, default: 1, min: 1 },
    // Prior versions kept so existing documents remain interpretable.
    history: {
      type: [
        new Schema(
          {
            version: { type: Number, required: true },
            content: { type: Schema.Types.Mixed, default: null },
            savedAt: { type: Date, default: Date.now },
            savedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Plugin / Extension
    plugin: { type: String, default: "Acroxa" },
    metadata: { type: Schema.Types.Mixed, default: {} },
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
// `slug` already declares `unique: true` on the path, which creates its index.
// Re-declaring it here would trigger a duplicate-index warning.
PatternSchema.index({ type: 1 });
PatternSchema.index({ category: 1 });
PatternSchema.index({ status: 1 });
PatternSchema.index({ mode: 1 });
PatternSchema.index({ tags: 1 });
PatternSchema.index({ plugin: 1 });
PatternSchema.index({ createdAt: -1 });
PatternSchema.index(
  { name: "text", description: "text", tags: "text", keywords: "text" },
  { name: "pattern_text_search" }
);

// ── Virtuals ──────────────────────────────────────────────────────────────────
PatternSchema.virtual("isArchived").get(function () {
  return this.status === "archived";
});

PatternSchema.virtual("isGlobal").get(function () {
  return this.mode === "global";
});

PatternSchema.virtual("nodeCount").get(function () {
  const nodes = this.content && Array.isArray(this.content.nodes) ? this.content.nodes : [];
  let count = 0;
  const walk = (list) => {
    for (const node of list) {
      if (!node || typeof node !== "object") continue;
      count += 1;
      if (Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(nodes);
  return count;
});

// ── Middleware ────────────────────────────────────────────────────────────────
PatternSchema.pre("save", function (next) {
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

// ── Methods ───────────────────────────────────────────────────────────────────
function attachMethods(schema) {
  // ── Statics ──

  /**
   * Find all active patterns, newest first.
   */
  schema.statics.findActive = function (filter = {}) {
    return this.find({ ...filter, status: "active" }).sort({ "metadata.position": 1, name: 1 });
  };

  /**
   * Find all global (synchronised) patterns.
   */
  schema.statics.findGlobal = function () {
    return this.find({ mode: "global", status: "active" }).sort({ name: 1 });
  };

  /**
   * Increment the usage counter for a pattern by ID.
   */
  schema.statics.incrementUsage = function (id) {
    return this.findByIdAndUpdate(id, { $inc: { usageCount: 1 } }, { new: true });
  };

  /**
   * Search patterns by text across name, description, tags and keywords.
   */
  schema.statics.search = function (query, filter = {}) {
    const regex = new RegExp(query, "i");
    return this.find({
      $or: [{ name: regex }, { description: regex }, { tags: regex }, { keywords: regex }],
      ...filter,
    }).lean();
  };

  // ── Instance Methods ──

  schema.methods.toPublic = function () {
    return this.toJSON();
  };

  /**
   * Deep-clone this pattern as a new unsaved document.
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
    data.version = 1;
    data.history = [];
    return new this.constructor(data);
  };

  /**
   * Push the current content into history and bump the version.
   * Call BEFORE assigning new content.
   */
  schema.methods.snapshotVersion = function (userId = null, maxHistory = 20) {
    const current = this.content ? JSON.parse(JSON.stringify(this.content)) : null;
    this.history = [
      ...(this.history || []),
      { version: this.version, content: current, savedAt: new Date(), savedBy: userId },
    ].slice(-maxHistory);
    this.version = (this.version || 1) + 1;
    return this;
  };
}

// ── buildModel ────────────────────────────────────────────────────────────────
function buildModel() {
  attachMethods(PatternSchema);

  for (const ext of _extensions) {
    ext(PatternSchema, mongoose);
  }

  if (mongoose.models && mongoose.models.Pattern) {
    return mongoose.models.Pattern;
  }

  return mongoose.model("Pattern", PatternSchema);
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  buildModel,
  attachMethods,
  getExtensions,
  registerExtension,
  PatternSchema,
};
