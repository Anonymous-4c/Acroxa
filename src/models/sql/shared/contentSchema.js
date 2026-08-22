// src/models/shared/contentSchema.js

const { DataTypes } = require("sequelize");

const ContentSchema = {
  type: DataTypes.JSON,

  allowNull: true,

  defaultValue: {
    json: null,
    html: "",
    raw: "",
    conditionalJS: null,
  },

  comment: [
    "Alpha document JSON (source of truth).",
    "html: rendered HTML derived from json.",
    "raw: plain extracted text derived from json.",
    "conditionalJS: structured conditional rule tree (NOT executable JS).",
  ].join(" "),
};

module.exports = {
  ContentSchema,
};