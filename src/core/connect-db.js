// src/core/connect-db.js
// FINAL VERSION — CLEAN, POWERFUL, ETERNAL

const mongoose = require("mongoose");
const { Sequelize } = require("sequelize");
const path = require("path");
const { loadConfig } = require("./configManager");
let sequelize = null;
let mongoConnected = false;
let models = null; // ← will hold { User, Post, Page, Category }
// 🔥 GLOBAL PERSISTENCE (survives hot reload)
global.__acroxa_db__ = global.__acroxa_db__ || {
  mongoConnected: false,
  sequelize: null,
  models: null,
  mongoUri: null
};

let state = global.__acroxa_db__;

async function _seedRegistry(models) {
  try {
    if (models.Engine?.seedDefaults) await models.Engine.seedDefaults();
    if (models.Route?.seedDefaults) await models.Route.seedDefaults();
  } catch (err) {
    console.warn("Registry seed skipped:", err.message);
  }
}

async function connectDB(config = null) {
  // ✅ If models already exist → reuse
  if (state.models) {
    console.log("⚡ Reusing existing DB models");
    return state.models;
  }
  if (config == null) {
    config = loadConfig();
  }
  console.log("DB config:", JSON.stringify(config, null, 2));

  // Support both flat keys (setup wizard) and nested config.database
  const dbConfig = config.database || {};
  const dbType = (config.db_type || dbConfig.type || "mongodb").toLowerCase();
  const dbName = config.db_name || dbConfig.name || "mongoDB";
  const dbUser = config.db_user || dbConfig.user || "";
  const dbPass = config.db_pass || dbConfig.pass || "";
  const dbHost = config.db_host || dbConfig.host || "127.0.0.1";
  const dbPort = config.db_port || dbConfig.port || "";
  const dbUrl  = dbConfig.url || null;

  console.log(`Connecting to ${dbType.toUpperCase()}...`);

  try {
    if (dbType === "mongodb") {
      const uri =
        dbUrl ||
        `mongodb://${dbUser && dbPass ? `${dbUser}:${dbPass}@` : ""}${dbHost}:${dbPort || 27017}/${dbName}?authSource=admin`;

      // ✅ Prevent duplicate connection attempts
      if (mongoose.connection.readyState === 1) {
        console.log("⚡ Mongo already connected (readyState=1)");
        state.mongoConnected = true;
      } else if (state.mongoUri && state.mongoUri !== uri) {
        throw new Error("Different Mongo URI detected during hot reload");
      } else {
        await mongoose.connect(uri, {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        });

        state.mongoConnected = true;
        state.mongoUri = uri;

        console.log(`✅ MongoDB connected → ${dbName}`);
      }

      // ✅ Load models ONCE
      if (!state.models) {
        state.models = require("../models/index.js").mongo;
        console.log("📦 MongoDB models loaded");
        await _seedRegistry(state.models);
      }

    } else {
      // === SQL (same persistence idea)
      if (state.sequelize) {
        console.log("⚡ Reusing Sequelize instance");
      } else {
        const dialect =
          dbType === "mysql"
            ? "mysql"
            : dbType === "postgres"
            ? "postgres"
            : "sqlite";

        const storage =
          dialect === "sqlite"
            ? path.join(__dirname, "../../data", `${dbName}.sqlite`)
            : undefined;

        state.sequelize = new Sequelize(dbName, dbUser, dbPass, {
          host: dbHost,
          port: dbPort || (dialect === "postgres" ? 5432 : 3306),
          dialect,
          storage,
          logging: false,
          define: { underscored: true },
        });

        await state.sequelize.authenticate();
        console.log(`✅ ${dialect.toUpperCase()} connected`);

        state.models = require("../models/index.js").sql;

        await state.sequelize.sync({ alter: false });
        console.log("📦 SQL models ready");
        await _seedRegistry(state.models);
      }
    }

    console.log(`Database ready → ${dbType.toUpperCase()}\n`);
    return state.models;

  } catch (err) {
    console.error(`❌ Connection failed (${dbType}):`, err.message);
    process.exit(1);
  }
}

// Optional: if someone still wants raw connection
function getConnection() {

  // MongoDB
  if (
    state.mongoConnected ||
    mongoose.connection.readyState === 1
  ) {
    return mongoose;
  }

  // Sequelize
  if (state.sequelize) {
    return state.sequelize;
  }

  throw new Error("Not connected yet");
}

function getDbType() {

  // MongoDB
  if (
    state.mongoConnected ||
    mongoose.connection.readyState === 1
  ) {
    return "mongodb";
  }

  // Sequelize
  if (state.sequelize) {
    return state.sequelize.getDialect();
  }

  return null;
}

async function disconnectDB() {
  try {

    // MongoDB
    if (
      state.mongoConnected ||
      mongoose.connection.readyState === 1
    ) {
      await mongoose.disconnect();
    }

    // Sequelize
    if (state.sequelize) {
      await state.sequelize.close();
    }

    // Reset persistent state
    state.models = null;
    state.mongoConnected = false;
    state.sequelize = null;
    state.mongoUri = null;

    console.log("Disconnected from database");

  } catch (err) {
    console.error("Disconnect error:", err.message);
  }
}
module.exports = {
  connectDB,
  getConnection,
  getDbType,
  disconnectDB
};