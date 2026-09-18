// src/models/sql.js - Safe Auto Load for Sequelize
const fs = require("fs");
const path = require("path");
const { Sequelize } = require("sequelize");

const modelsDir = path.join(__dirname, "sql");
const models = {};

// IMPORTANT: We create sequelize ONLY when this file is actually used (SQL mode)
let sequelize = null;

const initializeSequelize = () => {
  if (sequelize) return sequelize;

  const dbType = (process.env.DB_TYPE || "sqlite").toLowerCase();
  const dialect = dbType === "mysql" ? "mysql" 
                 : dbType === "postgres" ? "postgres" 
                 : "sqlite";

  sequelize = new Sequelize(
    process.env.DB_NAME || "acroxa_cms",
    process.env.DB_USER || "",
    process.env.DB_PASS || "",
    {
      host: process.env.DB_HOST || "127.0.0.1",
      dialect: dialect,                    // ← Explicitly supplied
      storage: dialect === "sqlite" ? path.join(__dirname, "../../data/acroxa_cms.sqlite") : undefined,
      logging: false,
      define: { underscored: true },
    }
  );

  return sequelize;
};

// Auto load models
fs.readdirSync(modelsDir)
  .filter(file => file.endsWith(".js") && file !== "index.js" && !file.startsWith("."))
  .forEach(file => {
    const modelName = path.basename(file, ".js");
    try {
      const { buildModel } = require(path.join(modelsDir, file));
      if (typeof buildModel === "function") {
        const seq = initializeSequelize();
        models[modelName] = buildModel(seq);
        require("../core/logStream").quiet("info", `[SQL] Model loaded → ${modelName}`);
      }
    } catch (err) {
      require("../core/logStream").quiet("warn", `[SQL] Failed to load model ${modelName}:`, err.message);
    }
  });

// Run associations
Object.values(models).forEach(model => {
  if (typeof model.associate === "function") {
    model.associate(models);
  }
});

module.exports = models;