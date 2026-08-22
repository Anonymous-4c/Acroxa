// src/models/mongo/Tag.js
const mongoose = require("mongoose");

const getExtensions = () => (global.acrx?.registered?.schemas || [])
  .filter(s => s.target === "tag")
  .map(s => s.structure)
  .reduce((a, c) => ({ ...a, ...c }), {});

const applySharedLogic = (doc) => {
  if (!doc.slug && doc.name) {
    doc.slug = doc.name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-");
  }
};

const getSchema = () => {
  const schema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    color: { type: String, default: "#00f0ff" },
    textColor: { type: String, default: "#ffffff" },
    icon: String,
    seoTitle: String,
    seoDescription: String,
    ...getExtensions()
  }, { timestamps: true, strictPopulate: false });

  schema.pre("save", function(next) {
    applySharedLogic(this);
    next();
  });

  schema.set("toJSON", {
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  });

  return schema;
};

const attachMethods = (Tag) => {
  // Add any static or instance methods later if needed
  return Tag;
};

const buildModel = () => {
  const schema = getSchema();
  let Tag = mongoose.model("Tag", schema);
  return attachMethods(Tag);
};

module.exports = { buildModel };