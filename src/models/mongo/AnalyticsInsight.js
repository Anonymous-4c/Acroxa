const mongoose = require("mongoose");
const { Schema } = mongoose;

// AnalyticsInsight — computed insight/anomaly records. Insights are derived
// rule-based from real event data; only snapshots and dismissals persist
// here so dismissed state survives recomputation.

const getSchema = () => {
  const schema = new Schema(
    {
      key:         { type: String, required: true, unique: true },
      kind:        { type: String, required: true, default: "insight" },
      insightType: { type: String, default: "trend" },
      severity:    { type: String, default: "low" },
      insight:     { type: String, default: "" },
      suggestion:  { type: String, default: "" },
      possibleReason: { type: String, default: "" },
      affectedScope:  { type: String, default: "" },
      confidence:  { type: Number, default: null },
      rangeFrom:   { type: String, default: "" },
      rangeTo:     { type: String, default: "" },
      dismissed:   { type: Boolean, default: false },
    },
    { timestamps: true }
  );

  schema.index({ kind: 1, dismissed: 1 });

  schema.set("toJSON", {
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });

  return schema;
};

const buildModel = () => {
  const schema = getSchema();
  return mongoose.models.AnalyticsInsight || mongoose.model("AnalyticsInsight", schema);
};

module.exports = { buildModel };
