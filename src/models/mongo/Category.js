// src/models/mongo/Category.js
const mongoose = require("mongoose");

const getExtensions = () => (global.acrx?.registered?.schemas || [])
  .filter(s => s.target === "category")
  .map(s => s.structure)
  .reduce((a, c) => ({ ...a, ...c }), {});

const generateSlug = (name) => name ? name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") : "";

const getSchema = () => {
  const schema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: String,
    color: { type: String, default: "#888888" },
    icon: String,
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    deletable: { type: Boolean, default: true },
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    ...getExtensions()
  }, { timestamps: true, strictPopulate: false });

  schema.pre("save", function(next) {
    if (!this.slug && this.name) this.slug = generateSlug(this.name);
    next();
  });

  schema.set("toJSON", { transform: (d, r) => { r.id = r._id.toString(); delete r._id; delete r.__v; return r; }});

  return schema;
};

const attachMethods = (Category) => {
  Category.findActive = () => Category.find({ isActive: true }).sort({ order: 1 });
  return Category;
};

const buildModel = () => {
  const schema = getSchema();
  let Category = mongoose.model("Category", schema);
  return attachMethods(Category);
};

module.exports = { buildModel };