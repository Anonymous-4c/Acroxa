const mongoose = require("mongoose");

const getSchema = () => {
  return new mongoose.Schema(
    {
      name: { type: String, required: true },

      mode: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "light",
      },

      // ── CORE COLOR PALETTE ─────────────────────────────────────────
      palette: {
        primary:   { type: String, default: "#4f46e5" },
        secondary: { type: String, default: "#22c55e" },
        accent:    { type: String, default: "#f59e0b" },
        danger:    { type: String, default: "#ef4444" },
        warning:   { type: String, default: "#f97316" },
        info:      { type: String, default: "#3b82f6" },
      },

      // ── SURFACE COLORS ─────────────────────────────────────────────
      surfaces: {
        background: { type: String, default: "#ffffff" },
        card:       { type: String, default: "#f9fafb" },
        sidebar:    { type: String, default: "#111827" },
        navbar:     { type: String, default: "#ffffff" },
        modal:      { type: String, default: "#ffffff" },
      },

      // ── TYPOGRAPHY COLORS ──────────────────────────────────────────
      typography: {
        textPrimary:   { type: String, default: "#111827" },
        textSecondary: { type: String, default: "#6b7280" },
        textMuted:     { type: String, default: "#9ca3af" },
        link:          { type: String, default: "#2563eb" },
      },

      // ── EFFECTS / UI TOKENS ────────────────────────────────────────
      effects: {
        borderRadius: { type: String, default: "10px" },
        borderColor:  { type: String, default: "#e5e7eb" },
        shadow:       { type: String, default: "0 10px 30px rgba(0,0,0,0.08)" },
      },

      // ── ADVANCED RAW OVERRIDES ─────────────────────────────────────
      raw: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    { timestamps: true }
  );
};

const attachMethods = (Theme) => {
  Theme.getActive = async function () {
    let theme = await this.findOne();
    if (!theme) theme = await this.create({});
    return theme;
  };

  Theme.updateTheme = async function (update) {
    const theme = await this.findOne();
    if (!theme) return this.create(update);

    // safe merge per section
    if (update.palette) {
      theme.palette = { ...theme.palette.toObject(), ...update.palette };
    }

    if (update.surfaces) {
      theme.surfaces = { ...theme.surfaces.toObject(), ...update.surfaces };
    }

    if (update.typography) {
      theme.typography = { ...theme.typography.toObject(), ...update.typography };
    }

    if (update.effects) {
      theme.effects = { ...theme.effects.toObject(), ...update.effects };
    }

    if (update.raw) {
      theme.raw = { ...theme.raw, ...update.raw };
    }

    return theme.save();
  };

  return Theme;
};

const buildModel = () => {
  const schema = getSchema();
  const Theme = mongoose.model("Theme", schema);
  return attachMethods(Theme);
};

module.exports = { buildModel };