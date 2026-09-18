const { DataTypes } = require("sequelize");

// AnalyticsInsight — SQL mirror of the mongo model (see mongo/AnalyticsInsight).

const buildModel = (sequelize) => {
  const AnalyticsInsight = sequelize.define(
    "AnalyticsInsight",
    {
      id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      key:       { type: DataTypes.STRING(256), allowNull: false, unique: true },
      kind:      { type: DataTypes.STRING(24), allowNull: false, defaultValue: "insight" },
      insightType:{ type: DataTypes.STRING(48), allowNull: false, defaultValue: "trend" },
      severity:  { type: DataTypes.STRING(16), allowNull: false, defaultValue: "low" },
      insight:   { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
      suggestion:{ type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
      possibleReason:{ type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
      affectedScope: { type: DataTypes.STRING(256), allowNull: false, defaultValue: "" },
      confidence:{ type: DataTypes.FLOAT, allowNull: true },
      rangeFrom: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "" },
      rangeTo:   { type: DataTypes.STRING(16), allowNull: false, defaultValue: "" },
      dismissed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: "analytics_insights",
      timestamps: true,
      indexes: [{ fields: ["kind", "dismissed"] }],
    }
  );

  return AnalyticsInsight;
};

module.exports = { buildModel };
