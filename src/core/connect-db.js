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

const _quiet = (type, ...args) => { try { require("./logStream").quiet(type, ...args); } catch (_) {} };

async function _seedRegistry(models) {
  try {
    if (models.Engine?.seedDefaults) await models.Engine.seedDefaults();
    if (models.Route?.seedDefaults) await models.Route.seedDefaults();
  } catch (err) {
    _quiet("warn", "Registry seed skipped:", err.message);
  }
}

async function connectDB(config = null) {
  // ✅ If models already exist → reuse
  if (state.models) {
    _quiet("info", "⚡ Reusing existing DB models");
    return state.models;
  }
  if (config == null) {
    config = loadConfig();
  }
  // Never dump the full config: it carries DB credentials. One redacted line is enough.

  // Support both flat keys (setup wizard) and nested config.database
  const dbConfig = config.database || {};
  const dbType = (config.db_type || dbConfig.type || "mongodb").toLowerCase();
  const dbName = config.db_name || dbConfig.name || "mongoDB";
  const dbUser = config.db_user || dbConfig.user || "";
  const dbPass = config.db_pass || dbConfig.pass || "";
  const dbHost = config.db_host || dbConfig.host || "127.0.0.1";
  const dbPort = config.db_port || dbConfig.port || "";
  const dbUrl  = dbConfig.url || null;

  _quiet("info", `Connecting to ${dbType.toUpperCase()} ${dbName}@${dbHost}...`);

  try {
    if (dbType === "mongodb") {
      const uri =
        dbUrl ||
        `mongodb://${dbUser && dbPass ? `${dbUser}:${dbPass}@` : ""}${dbHost}:${dbPort || 27017}/${dbName}?authSource=admin`;

      // ✅ Prevent duplicate connection attempts
      if (mongoose.connection.readyState === 1) {
        _quiet("info", "⚡ Mongo already connected (readyState=1)");
        state.mongoConnected = true;
      } else if (state.mongoUri && state.mongoUri !== uri) {
        throw new Error("Different Mongo URI detected during hot reload");
      } else {
        // Transient stalls (slow first handshake under load) must not kill
        // the whole server: retry a few times before giving up.
        let lastErr = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            await mongoose.connect(uri, {
              serverSelectionTimeoutMS: 8000,
              socketTimeoutMS: 45000,
            });
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            console.error(`Mongo connect attempt ${attempt}/4 failed: ${err.message}`);
            try { await mongoose.disconnect(); } catch { /* reset for retry */ }
            if (attempt < 4) await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
        }
        if (lastErr) throw lastErr;

        state.mongoConnected = true;
        state.mongoUri = uri;

        _quiet("success", `✅ MongoDB connected → ${dbName}`);
      }

      // ✅ Load models ONCE
      if (!state.models) {
        state.models = require("../models/index.js").mongo;
        _quiet("info", "📦 MongoDB models loaded");
        await _seedRegistry(state.models);
      }

    } else {
      // === SQL (same persistence idea)
      if (state.sequelize) {
        _quiet("info", "⚡ Reusing Sequelize instance");
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
        _quiet("success", `✅ ${dialect.toUpperCase()} connected`);

        state.models = require("../models/index.js").sql;

        await state.sequelize.sync({ alter: false });
        _quiet("info", "📦 SQL models ready");
        await _seedRegistry(state.models);
      }
    }

    _quiet("success", `Database ready → ${dbType.toUpperCase()}`);
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

    _quiet("info", "Disconnected from database");

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