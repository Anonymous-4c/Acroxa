// src/core/secrets.js
// Auto-generates and persists required secrets on first run.
// Checks process.env first, then the .env file directly.
// Only generates a new value if neither has the key.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "../../.env");

/**
 * Parse a .env file into a { KEY: VALUE } object.
 * Handles KEY = value, KEY=value, and inline comments.
 */
function parseEnvFile(content) {
  const result = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip inline comments (only if value doesn't contain spaces that are intentional)
    // Don't strip if value is quoted
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIdx = value.indexOf(" #");
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    }
    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Ensure a secret exists. Checks in order:
 *   1. process.env (already loaded)
 *   2. .env file on disk (read directly)
 *   3. Generate new, persist to .env
 *
 * @param {string} key - Environment variable name
 * @param {number} byteLength - Random byte length (produces 2x hex chars)
 * @returns {string} The secret value
 */
function ensureSecret(key, byteLength = 32) {
  // 1. Check process.env (fast path — dotenv already loaded it)
  let value = process.env[key];
  if (value && value.trim().length > 0) {
    return value.trim();
  }

  // 2. Check .env file directly (dotenv may not have loaded yet at require-time)
  try {
    if (fs.existsSync(ENV_FILE)) {
      const envContent = fs.readFileSync(ENV_FILE, "utf8");
      const parsed = parseEnvFile(envContent);
      if (parsed[key] && parsed[key].trim().length > 0) {
        value = parsed[key].trim();
        process.env[key] = value;
        return value;
      }
    }
  } catch (_) {}

  // 3. Generate a new secure random hex string
  value = crypto.randomBytes(byteLength).toString("hex");
  process.env[key] = value;

  // Persist to .env file so it survives restarts
  try {
    let envContent = "";
    if (fs.existsSync(ENV_FILE)) {
      envContent = fs.readFileSync(ENV_FILE, "utf8");
    }

    // Check if the key already exists (with or without spaces around =)
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keyPattern = new RegExp(`^${escapedKey}\\s*=\\s*.*$`, "m");
    if (keyPattern.test(envContent)) {
      // Replace existing entry
      envContent = envContent.replace(keyPattern, `${key} = ${value}`);
    } else {
      // Append new entry
      const separator = envContent.endsWith("\n") ? "" : "\n";
      envContent = `${envContent}${separator}${key} = ${value}\n`;
    }

    fs.writeFileSync(ENV_FILE, envContent, "utf8");
    console.log(`[Secrets] Auto-generated ${key} and saved to .env`);
  } catch (err) {
    console.warn(`[Secrets] Warning: Could not persist ${key} to .env: ${err.message}`);
    console.warn(`[Secrets] Set ${key}=${value} in your .env file manually.`);
  }

  return value;
}

module.exports = { ensureSecret };
