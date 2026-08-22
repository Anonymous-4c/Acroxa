// src/models/sql/Category.js
const { DataTypes } = require("sequelize");

const getExtensions = () => (global.acrx?.registered?.schemas || [])
  .filter(s => s.target === "category")
  .map(s => s.structure)
  .reduce((a, c) => ({ ...a, ...c }), {});

const generateSlug = (name) => name ? name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") : "";

const buildModel = (sequelize) => {
  const Category = sequelize.define("Category", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    description: DataTypes.TEXT,
    color: { type: DataTypes.STRING, defaultValue: "#888888" },
    icon: DataTypes.STRING,
    parentId: { type: DataTypes.INTEGER },
    deletable: { type: DataTypes.BOOLEAN, defaultValue: true },
    metaTitle: DataTypes.STRING,
    metaDescription: DataTypes.TEXT,
    keywords: DataTypes.JSON,
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    ...getExtensions()
  }, {
    tableName: "categories",
    timestamps: true,
    hooks: {
      beforeValidate: (c) => {
        if (!c.slug && c.name) c.slug = generateSlug(c.name);
      }
    }
  });

  Category.findActive = () => Category.findAll({
    where: { isActive: true },
    order: [["order", "ASC"]]
  });

  Category.associate = (m) => {
    Category.hasMany(m.Category, { as: "children", foreignKey: "parentId" });
    Category.belongsTo(m.Category, { as: "parent", foreignKey: "parentId" });
  };

  return Category;
};

module.exports = { buildModel };