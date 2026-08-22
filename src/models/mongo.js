// src/models/mongo.js

const fs = require("fs");
const path = require("path");

const modelsDir = path.join(__dirname, "mongo");
const models = {};

// Auto load models
fs.readdirSync(modelsDir)
  .filter(file =>
    file.endsWith(".js") &&
    file !== "index.js" &&
    !file.startsWith(".")
  )
  .forEach(file => {
    const modelName = path.basename(file, ".js");

    try {
      const { buildModel } = require(path.join(modelsDir, file));

      if (typeof buildModel === "function") {
        models[modelName] = buildModel();
        console.log(`[Mongo] Model loaded → ${modelName}`);
      }
    } catch (err) {
      console.error(
        `[Mongo] Failed to load model ${modelName}:`,
        err.message
      );
    }
  });

// Run associations if you ever add them
Object.values(models).forEach(model => {
  if (typeof model.associate === "function") {
    model.associate(models);
  }
});

module.exports = models;