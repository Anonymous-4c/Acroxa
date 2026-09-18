const { DataTypes } = require("sequelize");

// AnalyticsEvent — SQL mirror of the mongo model (see mongo/AnalyticsEvent).
// Identity chain: visitor 1—N sessions 1—N page views 1—N events.
// Privacy: anonymous ids only; raw IPs are never stored (ipHash only).

const buildModel = (sequelize) => {
  const AnalyticsEvent = sequelize.define(
    "AnalyticsEvent",
    {
      id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      eventId:   { type: DataTypes.STRING(64), allowNull: false },
      eventType: { type: DataTypes.STRING(48), allowNull: false, defaultValue: "custom" },
      visitorId: { type: DataTypes.STRING(64), allowNull: false },
      sessionId: { type: DataTypes.STRING(64), allowNull: false },
      pageViewId:{ type: DataTypes.STRING(64), allowNull: true },

      url:      { type: DataTypes.STRING(2048), allowNull: false, defaultValue: "" },
      path:     { type: DataTypes.STRING(512), allowNull: false, defaultValue: "" },
      referrer: { type: DataTypes.STRING(2048), allowNull: false, defaultValue: "" },
      channel:  { type: DataTypes.STRING(24), allowNull: false, defaultValue: "direct" },

      postId:   { type: DataTypes.STRING(64), allowNull: true },
      postSlug: { type: DataTypes.STRING(256), allowNull: true },

      device:   { type: DataTypes.STRING(24), allowNull: false, defaultValue: "" },
      browser:  { type: DataTypes.STRING(48), allowNull: false, defaultValue: "" },
      os:       { type: DataTypes.STRING(48), allowNull: false, defaultValue: "" },
      viewportW:{ type: DataTypes.INTEGER, allowNull: true },
      viewportH:{ type: DataTypes.INTEGER, allowNull: true },
      x:        { type: DataTypes.INTEGER, allowNull: true },
      y:        { type: DataTypes.INTEGER, allowNull: true },

      value:    { type: DataTypes.FLOAT, allowNull: true },
      metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },

      deviceSignature: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "" },
      docW:     { type: DataTypes.INTEGER, allowNull: true },
      docH:     { type: DataTypes.INTEGER, allowNull: true },

      consent:  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      ipHash:   { type: DataTypes.STRING(128), allowNull: false, defaultValue: "" },
    },
    {
      tableName: "analytics_events",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["eventId"] },
        { fields: ["path", "createdAt"] },
        { fields: ["eventType", "createdAt"] },
        { fields: ["sessionId", "createdAt"] },
        { fields: ["visitorId", "createdAt"] },
        { fields: ["createdAt"] },
      ],
    }
  );

  return AnalyticsEvent;
};

module.exports = { buildModel };
