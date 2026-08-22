// src/models/sql/Approval.js

const { DataTypes } = require("sequelize");

const buildModel = (sequelize) => {
  const Approval = sequelize.define("Approval", {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    type: {
      type: DataTypes.ENUM("delete", "rename"),
      allowNull: false
    },
    requestedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Users", key: "id" }
    },
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      defaultValue: "pending"
    },

    fileName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    oldName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    newName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    reason: {
      type: DataTypes.TEXT,
      defaultValue: ""
    },

    actionApi: {
      type: DataTypes.STRING,
      allowNull: false
    },

    reviewedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" }
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    reviewNote: {
      type: DataTypes.TEXT,
      defaultValue: ""
    }
  }, {
    tableName: "approvals",
    timestamps: true
  });

  // Static methods
  Approval.findPending = async function () {
    return this.findAll({
      where: { status: "pending" },
      include: [
        { 
          model: sequelize.models.User, 
          as: "requestedByUser", 
          attributes: ["id", "username", "email", "fullName", "role"] 
        }
      ],
      order: [["createdAt", "DESC"]]
    });
  };

  // Instance method
  Approval.prototype.markAsReviewed = async function (adminId, action, note = "") {
    this.status = action === "approve" ? "approved" : "rejected";
    this.reviewedBy = adminId;
    this.reviewedAt = new Date();
    if (note) this.reviewNote = note;
    return this.save();
  };

  return Approval;
};

module.exports = { buildModel };