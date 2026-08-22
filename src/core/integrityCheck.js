// src/core/integrityCheck.js
// ─────────────────────────────────────────────────────────────────────────────
// Startup Integrity Check — V2 Auth Engine
//
// Runs once at boot. Iterates every user and ensures the three V2 fields
// (controlKey, sessionVersion, passkeys) are present.
//
// Rules:
//   - Idempotent: safe to run on every restart
//   - Never overwrites existing values
//   - Works on both MongoDB and SQL (Sequelize) adapters
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");

/**
 * @param {object} models  - The connected models object { User, ... }
 * @param {string} dbType  - "mongodb" | "sql"
 */
async function runIntegrityCheck(models, dbType) {
  const User = models.User;

  console.log("[IntegrityCheck] Starting V2 auth field migration...");

  let users = [];

  try {
    if (dbType === "mongodb") {
      // Fetch all users including the controlKey field (excluded from toJSON but fine here)
      users = await User.find({}).lean();
    } else {
      // Sequelize: raw fetch
      users = await User.findAll({ raw: false });
    }
  } catch (err) {
    console.error("[IntegrityCheck] Failed to fetch users:", err.message);
    return;
  }

  let migrated = 0;
  let skipped = 0;

  for (const rawUser of users) {
    let dirty = false;

    // ── For MongoDB we get a plain object from .lean() ──────
    // ── For Sequelize we get model instances ────────────────
    const isMongoRaw = dbType === "mongodb";

    const hasControlKey = isMongoRaw ? !!rawUser.controlKey : !!rawUser.get("controlKey");
    const hasSessionVer = isMongoRaw
      ? rawUser.sessionVersion != null
      : rawUser.get("sessionVersion") != null;
    const hasPasskeys = isMongoRaw
      ? Array.isArray(rawUser.passkeys)
      : Array.isArray(rawUser.get("passkeys"));

    // Skip users that already have all three fields
    if (hasControlKey && hasSessionVer && hasPasskeys) {
      skipped++;
      continue;
    }

    // Build the patch
    const patch = {};

    if (!hasControlKey) {
      patch.controlKey = crypto.randomBytes(32).toString("hex");
    }
    if (!hasSessionVer) {
      patch.sessionVersion = 1;
    }
    if (!hasPasskeys) {
      patch.passkeys = isMongoRaw ? [] : JSON.stringify([]);
    }

    try {
      if (isMongoRaw) {
        // Use updateOne so we bypass toJSON / hooks that strip controlKey
        await User.updateOne(
          { _id: rawUser._id },
          { $set: patch }
        );
      } else {
        // Sequelize instance
        await rawUser.update(patch);
      }

      dirty = true;
    } catch (err) {
      console.warn(
        `[IntegrityCheck] Failed to patch user ${rawUser.username || rawUser.id}:`,
        err.message
      );
    }

    if (dirty) migrated++;
  }

  console.log(
    `[IntegrityCheck] Complete. Migrated: ${migrated}, Already up-to-date: ${skipped}, Total: ${users.length}`
  );
}

module.exports = { runIntegrityCheck };
