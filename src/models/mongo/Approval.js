// src/models/mongo/Approval.js
// PURE FUNCTIONS ONLY — NO DIRECT MODEL EXPORT

const mongoose = require("mongoose");

const getSchema = () => {
  const schema = new mongoose.Schema({
    type: {
      type: String,
      enum: ["delete", "rename"],
      required: true
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },

    // Action details
    fileName: { 
      type: String, 
      required: true 
    },
    oldName: { 
      type: String 
    },                    // only for rename
    newName: { 
      type: String 
    },                    // only for rename

    reason: { 
      type: String, 
      default: "" 
    },

    // Important: API endpoint that frontend will call after approval
    actionApi: {
      type: String,
      required: true
      // Example: "/acr/api/media/delete-file" or "/acr/api/media/rename-file"
    },

    // Admin review fields
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    reviewedAt: { 
      type: Date 
    },
    reviewNote: { 
      type: String, 
      default: "" 
    },

  }, { 
    timestamps: true 
  });

  // Indexes for better performance
  schema.index({ status: 1, createdAt: -1 });
  schema.index({ requestedBy: 1, status: 1 });

  // Clean JSON output
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

const attachMethods = (Approval) => {
  // Find all pending approvals with populated users
  Approval.findPending = async function () {
    return this.find({ status: "pending" })
      .populate("requestedBy", "username email fullName role")
      .populate("reviewedBy", "username fullName")
      .sort({ createdAt: -1 });
  };

  // Find single approval with populated data
  Approval.findByIdAndPopulate = async function (id) {
    return this.findById(id)
      .populate("requestedBy", "username email fullName role")
      .populate("reviewedBy", "username fullName");
  };

  // Mark as reviewed (approve or reject)
  Approval.prototype.markAsReviewed = async function (adminId, action, note = "") {
    this.status = action === "approve" ? "approved" : "rejected";
    this.reviewedBy = adminId;
    this.reviewedAt = new Date();
    if (note) this.reviewNote = note;
    return this.save();
  };

  return Approval;
};

const buildModel = () => {
  const schema = getSchema();
  let Approval = mongoose.model("Approval", schema);
  return attachMethods(Approval);
};

module.exports = { buildModel };