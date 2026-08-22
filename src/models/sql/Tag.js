const { DataTypes } = require("sequelize");

const getExtensions = () => (global.acrx?.registered?.schemas || [])
  .filter(s => s.target === "tag")
  .map(s => s.structure)
  .reduce((a, c) => ({ ...a, ...c }), {});

const applySharedLogic = (instance) => {
  if ((!instance.slug || instance.changed("name")) && instance.name) {
    instance.slug = instance.name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-");
  }
};

const buildModel = (sequelize) => {
  const Tag = sequelize.define("Tag", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    description: DataTypes.TEXT,
    color: { type: DataTypes.STRING, defaultValue: "#00f0ff" },
    textColor: { type: DataTypes.STRING, defaultValue: "#ffffff" },
    icon: DataTypes.STRING,
    seoTitle: DataTypes.STRING,
    seoDescription: DataTypes.TEXT,
    ...getExtensions()
  }, {
    tableName: "tags",
    timestamps: true,
    hooks: {
      beforeValidate: applySharedLogic
    }
  });

  Tag.associate = (models) => {
    Tag.belongsToMany(models.Post, {
      through: "PostTags",
      foreignKey: "tagId",
      otherKey: "postId"
    });
    Tag.belongsToMany(models.Page, {
      through: "PageTags",
      foreignKey: "tagId",
      otherKey: "pageId"
    });
  };

  return Tag;
};

module.exports = { buildModel };