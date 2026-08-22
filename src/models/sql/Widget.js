// src/models/Widget.sequelize.js
// Sequelize (SQL) model for the Alpha Widget system.
// Follows the same buildModel / attachMethods / getExtensions architecture
// used by the Page and Post Sequelize models.
"use strict";
const { DataTypes, Op } = require("sequelize");
// ── Extension Registry ────────────────────────────────────────────────────────
const _extensions = [];
function getExtensions() {
  return [..._extensions];
}
function registerExtension(fn) {
  if (typeof fn !== "function") throw new Error("[Widget] Extension must be a function.");
  _extensions.push(fn);
}
// ── Schema Definition ─────────────────────────────────────────────────────────
const WIDGET_ATTRIBUTES = {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  // Identity
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { notEmpty: true },
  },
  slug: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: { notEmpty: true },
  },
  type: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: "custom",
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "",
  },
  icon: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: null,
  },
  version: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: "1.0.0",
  },
  // Content (JSON column — stores Alpha document JSON, rendered HTML, and settings)
  content: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: { json: null, html: "", settings: {} },
    comment: "Alpha document JSON (source of truth), derived HTML, and widget settings",
  },
  // Content type / rendering mode
  contentType: {
    type: DataTypes.ENUM("json", "html", "json-rendered"),
    allowNull: false,
    defaultValue: "json",
    comment: "How widget content is interpreted for rendering (json = use content.json, html = raw/preview HTML, json-rendered = pre-processed)",
  },
  // Presentation
  styles: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
  },
  responsive: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: { mobile: {}, tablet: {}, desktop: {} },
  },
  customCSS: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "",
  },
  customJS: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "",
    comment: "Custom JS string — NOT executed directly; reserved for future sandboxed evaluation",
  },
  customAttributes: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
  },
  // Visibility
  visibility: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: { mobile: true, tablet: true, desktop: true, loggedIn: null, loggedOut: null },
  },
  // Conditions — structured rule tree, NOT executable JS.
  // Evaluated by Alpha's rendering engine.
  conditions: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    comment: "Structured conditional rendering rule tree. Not executable. Evaluated by Alpha renderer.",
  },
  // Discovery / Management
  previewImage: {
    type: DataTypes.STRING(512),
    allowNull: true,
    defaultValue: null,
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  },
  authorId: {
    type: DataTypes.UUID,
    allowNull: true,
    defaultValue: null,
  },
  status: {
    type: DataTypes.ENUM("active", "archived", "draft"),
    allowNull: false,
    defaultValue: "active",
  },
  isGlobal: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  isLocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  isDynamic: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  isStatic: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  usageCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  // Plugin / Extension
  plugin: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: "Acroxa",
  },
  // Metadata (arbitrary key-value bag, includes position)
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
  },
  // Schema versioning
  schemaVersion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
};
// ── attachMethods ─────────────────────────────────────────────────────────────
function attachMethods(Widget) {
  // ── Class (static) methods ──
  /**
   * Find all active widgets sorted by name (position sort via metadata JSON
   * requires dialect-specific handling e.g. JSON_EXTRACT / ->> ; using name for portability).
   */
  Widget.findActive = function (where = {}) {
    return this.findAll({
      where: { ...where, status: "active" },
      order: [["name", "ASC"]],
    });
  };
  /**
   * Find all global widgets.
   */
  Widget.findGlobal = function () {
    return this.findAll({
      where: { isGlobal: true, status: "active" },
      order: [["name", "ASC"]],
    });
  };
  /**
   * Increment usage counter atomically.
   */
  Widget.incrementUsage = function (id) {
    return this.increment("usageCount", { where: { id } });
  };
  /**
   * Text search across name, description (SQL LIKE).
   * Tags search omitted for cross-DB compatibility (would require JSON_CONTAINS / LIKE on cast).
   */
  Widget.search = function (query, where = {}) {
    const like = `%${query}%`;
    return this.findAll({
      where: {
        ...where,
        [Op.or]: [
          { name: { [Op.like]: like } },
          { description: { [Op.like]: like } },
        ],
      },
    });
  };
  // ── Instance methods ──
  /**
   * Return a plain JSON-safe representation.
   */
  Widget.prototype.toPublic = function () {
    const data = this.toJSON();
    delete data.createdAt;
    delete data.updatedAt;
    return data;
  };
  /**
   * Deep-clone this widget as a new unsaved instance (use .save() to persist).
   */
  Widget.prototype.duplicate = function () {
    const data = this.toJSON();
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    data.name = `${data.name} (Copy)`;
    data.slug = `${data.slug}-copy-${Date.now()}`;
    data.status = "draft";
    data.usageCount = 0;
    return this.constructor.build(data);
  };
  /**
   * Check structural visibility for a given context.
   * Deep condition evaluation is delegated to Alpha's rendering engine.
   */
  Widget.prototype.isVisibleFor = function (context = {}) {
    const v = this.visibility || {};
    if (context.device === "mobile" && v.mobile === false) return false;
    if (context.device === "tablet" && v.tablet === false) return false;
    if (context.device === "desktop" && v.desktop === false) return false;
    if (context.loggedIn !== undefined && v.loggedIn === false && context.loggedIn) return false;
    if (context.loggedOut !== undefined && v.loggedOut === false && !context.loggedIn) return false;
    return true;
  };
  /**
   * Virtual-like getters for status (mirrors Mongoose virtuals)
   */
  Widget.prototype.isArchived = function () {
    return this.status === "archived";
  };
  Widget.prototype.isDraft = function () {
    return this.status === "draft";
  };
}
// ── buildModel ────────────────────────────────────────────────────────────────
function buildModel(sequelize) {
  const Widget = sequelize.define("Widget", WIDGET_ATTRIBUTES, {
    tableName: "widgets",
    timestamps: true,
    // JSON transform on .toJSON()
    toJSON() {
      const values = Object.assign({}, this.get());
      // Ensure content sub-fields default gracefully
      values.content = values.content || { json: null, html: "", settings: {} };
      return values;
    },
  });
  // Attach helper methods
  attachMethods(Widget);
  // Apply plugin extensions
  for (const ext of _extensions) {
    ext(Widget, sequelize, DataTypes);
  }
  return Widget;
}
// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  buildModel,
  attachMethods,
  getExtensions,
  registerExtension,
  WIDGET_ATTRIBUTES,
};
