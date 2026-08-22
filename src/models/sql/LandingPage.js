// src/models/sql/LandingPage.js

const { DataTypes } = require("sequelize");

const buildModel = (sequelize) => {
  const LandingPage = sequelize.define(
    "LandingPage",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      title: { type: DataTypes.STRING, allowNull: false },
      slug:  { type: DataTypes.STRING, allowNull: false, unique: true },

      status: {
        type: DataTypes.ENUM("draft", "published", "scheduled", "archived", "trashed"),
        defaultValue: "draft",
      },

      // ── CONTENT BLOCKS ────────────────────────────────────────────────────
      // Array of { type, label, data, visible, order, cssClass, customCSS }
      sections: {
        type: DataTypes.JSON,
        defaultValue: [],
        comment: "Ordered array of section block objects",
      },

      // Which layout template to use (falls back: landing → page → 404)
      template: { type: DataTypes.STRING, defaultValue: "landing" },

      // Layout config overrides merged on top of active layout config
      layoutOverrides: { type: DataTypes.JSON, defaultValue: {} },

      // ── A/B TESTING ───────────────────────────────────────────────────────
      abTesting: {
        type: DataTypes.JSON,
        defaultValue: {
          enabled: false,
          variants: [],
          splitMethod: "cookie",
          cookieTTL: 30,
        },
        comment: "A/B test config with variants array",
      },

      // ── CONVERSION GOALS ──────────────────────────────────────────────────
      conversionGoal: { type: DataTypes.STRING, defaultValue: "" },
      goals: {
        type: DataTypes.JSON,
        defaultValue: [],
        comment: "Array of ConversionGoal objects",
      },

      // ── TRACKING ──────────────────────────────────────────────────────────
      trackingPixels: {
        type: DataTypes.JSON,
        defaultValue: [],
        comment: "Array of TrackingPixel objects",
      },

      // ── SEO ───────────────────────────────────────────────────────────────
      metaTitle:       { type: DataTypes.STRING, defaultValue: "" },
      metaDescription: { type: DataTypes.TEXT,   defaultValue: "" },
      focusKeyword:    { type: DataTypes.STRING, defaultValue: "" },
      keywords:        { type: DataTypes.JSON,   defaultValue: [] },
      canonicalUrl:    { type: DataTypes.STRING, defaultValue: "" },
      ogTitle:         { type: DataTypes.STRING, defaultValue: "" },
      ogDescription:   { type: DataTypes.TEXT,   defaultValue: "" },
      ogImage:         { type: DataTypes.STRING, defaultValue: "" },
      noIndex:  { type: DataTypes.BOOLEAN, defaultValue: false },
      noFollow: { type: DataTypes.BOOLEAN, defaultValue: false },

      // ── PUBLISHING ────────────────────────────────────────────────────────
      publishDate: { type: DataTypes.DATE, defaultValue: null },
      publishAt:   { type: DataTypes.DATE, defaultValue: null },

      // ── AUTHORING ─────────────────────────────────────────────────────────
      authorId: { type: DataTypes.INTEGER, allowNull: false },

      // ── CUSTOM CODE ───────────────────────────────────────────────────────
      customCSS: { type: DataTypes.TEXT, defaultValue: "" },
      customJS:  { type: DataTypes.TEXT, defaultValue: "" },

      // ── ANALYTICS CACHE ───────────────────────────────────────────────────
      statsViews:       { type: DataTypes.INTEGER, defaultValue: 0 },
      statsConversions: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    {
      tableName: "landing_pages",
      timestamps: true,
      hooks: {
        beforeValidate(instance) {
          if (!instance.slug && instance.title) {
            instance.slug = instance.title
              .toLowerCase()
              .trim()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9-]/g, "");
          }
        },
      },
    }
  );

  // ── Associations ───────────────────────────────────────────────────────────
  LandingPage.associate = (models) => {
    LandingPage.belongsTo(models.User, {
      as: "authorData",
      foreignKey: "authorId",
    });
  };

  // ── Static helpers ─────────────────────────────────────────────────────────
  LandingPage.findBySlug = (slug) =>
    LandingPage.findOne({ where: { slug, status: "published" } });

  return LandingPage;
};

module.exports = { buildModel };