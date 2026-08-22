// src/utils/cryptoUtil.js
// Basic AES-256-GCM encrypt/decrypt helper for secrets (git tokens, cloud keys, etc).
//
// Requires an encryption key in the environment:
//   BACKUP_ENCRYPTION_KEY = 64-char hex string (32 bytes)
// If not set, one is auto-generated and persisted to .env on first use.
//
// Encrypted values are stored as a single string: "v1:<ivHex>:<authTagHex>:<cipherHex>"
// so they're easy to drop straight into a Mongoose/Sequelize String field.

const crypto = require("crypto");
const { ensureSecret } = require("../core/secrets");

const ALGO       = "aes-256-gcm";
const IV_LENGTH  = 12; // 96-bit nonce recommended for GCM
const VERSION    = "v1";

let _cachedKey = null;

function _getKey() {
  if (_cachedKey) return _cachedKey;

  const raw = ensureSecret("BACKUP_ENCRYPTION_KEY", 32);
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("[cryptoUtil] BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }

  _cachedKey = key;
  return key;
}

/**
 * Encrypt a plaintext string. Returns null if input is falsy/empty
 * (so callers can safely no-op on empty secret fields).
 */
function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === "") return null;

  const key = _getKey();
  const iv  = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag   = cipher.getAuthTag();

  return [VERSION, iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypt a string produced by encrypt(). Returns null on empty input.
 * Throws if the value is malformed or the key/tag don't match (tampering or wrong key).
 */
function decrypt(payload) {
  if (payload === undefined || payload === null || payload === "") return null;

  const parts = String(payload).split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("[cryptoUtil] Malformed or unsupported encrypted payload");
  }

  const [, ivHex, authTagHex, dataHex] = parts;
  const key     = _getKey();
  const iv      = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const data    = Buffer.from(dataHex, "hex");

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Returns true if a string looks like one of our encrypted payloads.
 * Useful to avoid double-encrypting an already-encrypted value.
 */
function isEncrypted(value) {
  if (typeof value !== "string") return false;
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === VERSION;
}

/**
 * Mask a secret for safe display/logging — never send real secrets back to the client.
 * Returns something like "••••••1a2b" (last 4 chars of the *decrypted* value if given raw,
 * or just a fixed mask if you don't want to decrypt at all).
 */
function maskSecret(plainOrNull, visibleChars = 4) {
  if (!plainOrNull) return "";
  const str = String(plainOrNull);
  if (str.length <= visibleChars) return "•".repeat(str.length);
  return "•".repeat(Math.max(str.length - visibleChars, 8)) + str.slice(-visibleChars);
}

module.exports = { encrypt, decrypt, isEncrypted, maskSecret };
