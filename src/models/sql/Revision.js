const { DataTypes } = require("sequelize");
const { ContentSchema } = require("./shared/contentSchema");

// Revision — immutable snapshot of a document's content at a point in time.
// Created automatically on each Post/Page save (afterSave hook).
// The editor reads these to power the revision history / compare / restore UI.

const buildModel = (sequelize) => {
  const Revision = sequelize.define(
    "Revision",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      // polymorphic parent — the document this revision belongs to
      documentId: { type: DataTypes.INTEGER, allowNull: false },
      documentType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "post" }, // post | page | landing
      // the content snapshot
      content: { ...ContentSchema },
      // metadata
      title: { type: DataTypes.STRING, allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: true },
      revisionNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      summary: { type: DataTypes.STRING(255), allowNull: true }, // optional human label
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: "revisions",
      timestamps: true,
      indexes: [{ fields: ["documentId", "documentType"] }, { fields: ["documentId", "revisionNumber"] }],
    }
  );

  Revision.associate = (models) => {
    Revision.belongsTo(models.User, { as: "authorData", foreignKey: "createdBy" });
  };

  return Revision;
};

module.exports = { buildModel };
