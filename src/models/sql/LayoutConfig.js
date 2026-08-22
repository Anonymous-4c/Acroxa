const { DataTypes } = require("sequelize");

const deepMerge = (target, source) => {
  if (typeof target !== "object" || target === null) return source;
  if (typeof source !== "object" || source === null) return source;

  const output = Array.isArray(target)
    ? [...target]
    : { ...target };

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
};

const buildModel = (sequelize) => {
  const LayoutConfig = sequelize.define("LayoutConfig", {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    layoutId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    config: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {}
    },

    uiState: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        activeBreakpoint: "desktop",
        collapsedSections: []
      }
    }
  }, {
    tableName: "layout_configs",
    timestamps: true
  });

  // ── GET OR CREATE ───────────────────────────

  LayoutConfig.getByLayout = async (layoutId) => {
    const [entry] = await LayoutConfig.findOrCreate({
      where: { layoutId },
      defaults: {
        layoutId,
        config: {},
        uiState: {
          activeBreakpoint: "desktop",
          collapsedSections: []
        }
      }
    });

    return entry;
  };

  // ── UPDATE CONFIG ───────────────────────────

  LayoutConfig.updateConfig = async (layoutId, update) => {
    const entry = await LayoutConfig.getByLayout(layoutId);

    entry.config = deepMerge(
      entry.config || {},
      update || {}
    );

    await entry.save();

    return entry;
  };

  // ── RESET ───────────────────────────────────

  LayoutConfig.reset = async (layoutId) => {
    const entry = await LayoutConfig.getByLayout(layoutId);

    entry.config = {};

    entry.uiState = {
      activeBreakpoint: "desktop",
      collapsedSections: []
    };

    await entry.save();

    return entry;
  };

  // ── OPTIONAL ALIAS ──────────────────────────

  LayoutConfig.resetLayout = LayoutConfig.reset;

  // ── ASSOCIATIONS ────────────────────────────

  LayoutConfig.associate = (models) => {
    // Future relations here
  };

  return LayoutConfig;
};

module.exports = { buildModel };