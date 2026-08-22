const mongoose = require("mongoose");

const getSchema = () => {
  return new mongoose.Schema(
    {
      layoutId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      // ── CORE RUNTIME CONFIG (ONLY SOURCE OF TRUTH) ────────────────
      config: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },

      // ── UI STATE CACHE (OPTIONAL PERFORMANCE LAYER) ───────────────
      uiState: {
        activeBreakpoint: {
          type: String,
          enum: ["mobile", "tablet", "desktop"],
          default: "desktop",
        },
        collapsedSections: {
          type: [String],
          default: [],
        },
      },
    },
    { timestamps: true }
  );
};

const attachMethods = (LayoutConfig) => {
  // ── GET OR CREATE ───────────────────────────────────────────────
  LayoutConfig.getByLayout = async function (layoutId) {
    let entry = await this.findOne({ layoutId });
    if (!entry) {
      entry = await this.create({
        layoutId,
        config: {},
      });
    }
    return entry;
  };

  // ── DEEP MERGE UPDATE ───────────────────────────────────────────
  LayoutConfig.updateConfig = async function (layoutId, update) {
    const entry = await this.getByLayout(layoutId);

    entry.config = deepMerge(entry.config || {}, update);

    return entry.save();
  };

  // ── RESET LAYOUT ────────────────────────────────────────────────
  LayoutConfig.reset = async function (layoutId) {
    return this.findOneAndUpdate(
      { layoutId },
      { config: {}, uiState: {} },
      { new: true }
    );
  };

  return LayoutConfig;
};

// ── SAFE DEEP MERGE (IMPORTANT FOR CMS) ───────────────────────────
function deepMerge(target, source) {
  if (typeof target !== "object" || target === null) return source;
  if (typeof source !== "object" || source === null) return source;

  const output = Array.isArray(target) ? [...target] : { ...target };

  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      source[key] !== null
    ) {
      output[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  }

  return output;
}

const buildModel = () => {
  const schema = getSchema();
  const LayoutConfig = mongoose.model("LayoutConfig", schema);
  return attachMethods(LayoutConfig);
};

module.exports = { buildModel };