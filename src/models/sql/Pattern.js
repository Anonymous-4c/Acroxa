// src/models/sql/Pattern.js
// Sequelize (SQL) model for the Acroxa Pattern system.
//
// A Pattern is a reusable COMPOSITION of widgets (a tree), as opposed to a
// Widget which is a single functional node.
//
// Follows the same buildModel / attachMethods / getExtensions architecture
// used by the Widget, Page and Post Sequelize models.
"use strict";

const { DataTypes, Op } = require("sequelize");

// ── Extension Registry ────────────────────────────────────────────────────────
const _extensions = [];

function getExtensions() {
  return [..._extensions];
}

function registerExtension(fn) {
  if (typeof fn !== "function") throw new Error("[Pattern] Extension must be a function.");
  _extensions.push(fn);
}

// ── Schema Definition ─────────────────────────────────────────────────────────
const PATTERN_ATTRIBUTES = {
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
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "",
  },

  // Semantic role (hero, cta, pricing, footer, ...)
  type: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: "content",
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: "general",
  },
  icon: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: null,
  },

  // Content — serialised Acroxa widget tree. Data only, never executable.
  content: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: { nodes: [], html: "", settings: {} },
    comment: "Serialised Acroxa widget tree (nodes), preview HTML and pattern settings",
  },

  // Discovery
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
  keywords: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  },

  // Reuse mode: snapshot = clone on insert, global = reference on insert
  mode: {
    type: DataTypes.ENUM("snapshot", "global"),
    allowNull: false,
    defaultValue: "snapshot",
  },

  // Declared override slots for global patterns
  overrides: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  },

  // Management
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
  visibility: {
    type: DataTypes.ENUM("public", "private"),
    allowNull: false,
    defaultValue: "public",
  },
  isLocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  usageCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  // Versioning
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  history: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: "Prior content versions so existing documents remain interpretable",
  },

  // Plugin / Extension
  plugin: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: "Acroxa",
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
  },
  schemaVersion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
};

// ── attachMethods ─────────────────────────────────────────────────────────────
function attachMethods(Pattern) {
  // ── Class (static) methods ──

  Pattern.findActive = function (where = {}) {
    return this.findAll({
      where: { ...where, status: "active" },
      order: [["name", "ASC"]],
    });
  };

  Pattern.findGlobal = function () {
    return this.findAll({
      where: { mode: "global", status: "active" },
      order: [["name", "ASC"]],
    });
  };

  Pattern.incrementUsage = function (id) {
    return this.increment("usageCount", { where: { id } });
  };

  /**
   * Text search across name and description (SQL LIKE).
   * JSON tag search omitted for cross-dialect portability.
   */
  Pattern.search = function (query, where = {}) {
    const like = `%${query}%`;
    return this.findAll({
      where: {
        ...where,
        [Op.or]: [{ name: { [Op.like]: like } }, { description: { [Op.like]: like } }],
      },
    });
  };

  // ── Instance methods ──

  Pattern.prototype.toPublic = function () {
    const data = this.toJSON();
    delete data.createdAt;
    delete data.updatedAt;
    return data;
  };

  Pattern.prototype.duplicate = function () {
    const data = this.toJSON();
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    data.name = `${data.name} (Copy)`;
    data.slug = `${data.slug}-copy-${Date.now()}`;
    data.status = "draft";
    data.usageCount = 0;
    data.version = 1;
    data.history = [];
    return this.constructor.build(data);
  };

  /**
   * Push the current content into history and bump the version.
   * Call BEFORE assigning new content.
   */
  Pattern.prototype.snapshotVersion = function (userId = null, maxHistory = 20) {
    const current = this.content ? JSON.parse(JSON.stringify(this.content)) : null;
    const history = Array.isArray(this.history) ? this.history : [];
    this.history = [
      ...history,
      {
        version: this.version,
        content: current,
        savedAt: new Date().toISOString(),
        savedBy: userId,
      },
    ].slice(-maxHistory);
    this.version = (this.version || 1) + 1;
    return this;
  };

  Pattern.prototype.isArchived = function () {
    return this.status === "archived";
  };

  Pattern.prototype.isGlobal = function () {
    return this.mode === "global";
  };
}

// ── buildModel ────────────────────────────────────────────────────────────────
function buildModel(sequelize) {
  const Pattern = sequelize.define("Pattern", PATTERN_ATTRIBUTES, {
    tableName: "patterns",
    timestamps: true,
    toJSON() {
      const values = Object.assign({}, this.get());
      values.content = values.content || { nodes: [], html: "", settings: {} };
      return values;
    },
  });

  attachMethods(Pattern);

  for (const ext of _extensions) {
    ext(Pattern, sequelize, DataTypes);
  }

  return Pattern;
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  buildModel,
  attachMethods,
  getExtensions,
  registerExtension,
  PATTERN_ATTRIBUTES,
};
