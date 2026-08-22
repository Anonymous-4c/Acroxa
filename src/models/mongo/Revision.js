const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ContentSchema } = require("./shared/contentSchema");

// Revision — immutable snapshot of a document's content at a point in time.
// Created automatically on each Post/Page save (post-save hook).

const getSchema = () => {
  const schema = new Schema(
    {
      documentId: { type: Schema.Types.ObjectId, required: true },
      documentType: { type: String, required: true, default: "post" },
      content: { type: ContentSchema },
      title: { type: String, default: "" },
      status: { type: String, default: "draft" },
      revisionNumber: { type: Number, required: true, default: 1 },
      summary: { type: String, default: "" },
      createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
  );

  schema.index({ documentId: 1, documentType: 1 });
  schema.index({ documentId: 1, revisionNumber: 1 });

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
  return mongoose.model("Revision", schema);
};

module.exports = { buildModel };
