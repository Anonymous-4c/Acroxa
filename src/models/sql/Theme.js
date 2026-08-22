const { DataTypes } = require("sequelize");

const buildModel = (sequelize) => {
  const Theme = sequelize.define(
    "Theme",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      name: { type: DataTypes.STRING, allowNull: false },

      mode: {
        type: DataTypes.ENUM("light", "dark", "system"),
        defaultValue: "light",
      },

      // ── CORE PALETTE (PRIMARY SYSTEM) ───────────────────────────────
      palette: {
        type: DataTypes.JSON,
        defaultValue: {
          primary: "#4f46e5",
          secondary: "#22c55e",
          accent: "#f59e0b",
          danger: "#ef4444",
          warning: "#f97316",
          info: "#3b82f6",
        },
      },

      // ── SURFACE COLORS (UI BACKGROUNDS) ─────────────────────────────
      surfaces: {
        type: DataTypes.JSON,
        defaultValue: {
          background: "#ffffff",
          card: "#f9fafb",
          sidebar: "#111827",
          navbar: "#ffffff",
          modal: "#ffffff",
        },
      },

      // ── TEXT COLORS ────────────────────────────────────────────────
      typography: {
        type: DataTypes.JSON,
        defaultValue: {
          textPrimary: "#111827",
          textSecondary: "#6b7280",
          textMuted: "#9ca3af",
          link: "#2563eb",
        },
      },

      // ── BORDER + EFFECTS ───────────────────────────────────────────
      effects: {
        type: DataTypes.JSON,
        defaultValue: {
          borderRadius: "10px",
          borderColor: "#e5e7eb",
          shadow: "0 10px 30px rgba(0,0,0,0.08)",
        },
      },

      // ── RAW OVERRIDES (ADVANCED USERS) ─────────────────────────────
      raw: {
        type: DataTypes.JSON,
        defaultValue: {},
      },
    },
    {
      tableName: "themes",
      timestamps: true,
    }
  );

  // ── STATIC HELPERS ───────────────────────────────────────────────

  Theme.getActiveTheme = async function () {
    let theme = await this.findOne();
    if (!theme) theme = await this.create({});
    return theme;
  };

  Theme.updateTheme = async function (data) {
    let theme = await this.findOne();
    if (!theme) return this.create(data);

    theme.palette = { ...theme.palette, ...(data.palette || {}) };
    theme.surfaces = { ...theme.surfaces, ...(data.surfaces || {}) };
    theme.typography = { ...theme.typography, ...(data.typography || {}) };
    theme.effects = { ...theme.effects, ...(data.effects || {}) };

    return theme.save();
  };

  return Theme;
};

module.exports = { buildModel };