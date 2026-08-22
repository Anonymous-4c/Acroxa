const mongoose = require("mongoose");
const { Schema } = mongoose;

// -----------------------------------------------------------------------------
// Condition Rule Tree
// -----------------------------------------------------------------------------

const ConditionNodeSchema = new Schema(
  {
    operator: {
      type: String,
      enum: ["and", "or"],
      default: null,
    },

    rules: {
      type: [Schema.Types.Mixed],
      default: undefined,
    },

    target: {
      type: String,
      default: null,
    },

    field: {
      type: String,
      default: null,
    },

    op: {
      type: String,
      default: null,
    },

    value: {
      type: Schema.Types.Mixed,
      default: null,
    },

    negate: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

// -----------------------------------------------------------------------------
// Content Schema
// -----------------------------------------------------------------------------

const ContentSchema = new Schema(
  {
    // Alpha document JSON (source of truth)
    json: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // Pre-rendered HTML
    html: {
      type: String,
      default: "",
    },

    // Plain extracted text
    raw: {
      type: String,
      default: "",
    },

    // Conditional rendering rule tree
    conditionalJS: {
      type: ConditionNodeSchema,
      default: null,
    },
  },
  {
    _id: false,
  }
);

module.exports = {
  ConditionNodeSchema,
  ContentSchema,
};