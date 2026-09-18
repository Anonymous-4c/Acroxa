const mongoose = require("mongoose");
const { Schema } = mongoose;

// AnalyticsEvent — one row per visitor event (page views, sessions markers,
// clicks, scroll milestones, engagement, custom widget events).
// Identity chain: visitor 1—N sessions 1—N page views 1—N events.
// Privacy: anonymous ids only; raw IPs are never stored (ipHash only).

const getSchema = () => {
  const schema = new Schema(
    {
      eventId:   { type: String, required: true },
      eventType: { type: String, required: true, default: "custom" },
      visitorId: { type: String, required: true },
      sessionId: { type: String, required: true },
      pageViewId:{ type: String, default: null },

      url:      { type: String, default: "" },
      path:     { type: String, default: "" },
      referrer: { type: String, default: "" },
      channel:  { type: String, default: "direct" },

      postId:   { type: String, default: null },
      postSlug: { type: String, default: null },

      device:   { type: String, default: "" },
      browser:  { type: String, default: "" },
      os:       { type: String, default: "" },
      viewportW:{ type: Number, default: null },
      viewportH:{ type: Number, default: null },
      x:        { type: Number, default: null },
      y:        { type: Number, default: null },

      value:    { type: Number, default: null },
      metadata: { type: Schema.Types.Mixed, default: {} },

      deviceSignature: { type: String, default: "" },
      docW:    { type: Number, default: null },
      docH:    { type: Number, default: null },

      consent:  { type: Boolean, default: true },
      ipHash:   { type: String, default: "" },
    },
    { timestamps: true }
  );

  schema.index({ eventId: 1 }, { unique: true, sparse: true });
  schema.index({ path: 1, createdAt: -1 });
  schema.index({ eventType: 1, createdAt: -1 });
  schema.index({ sessionId: 1, createdAt: 1 });
  schema.index({ visitorId: 1, createdAt: -1 });
  schema.index({ createdAt: -1 });

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
  return mongoose.models.AnalyticsEvent || mongoose.model("AnalyticsEvent", schema);
};

module.exports = { buildModel };
