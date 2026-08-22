// src/core/configManager.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ensureSecret } = require("./secrets");

const CONFIG_DIR = path.join(__dirname, "../../config");
const CONFIG_FILE = path.join(CONFIG_DIR, ".acroxa-core");
const SECRET = ensureSecret("CONFIG_SECRET", 32);
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function encrypt(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", crypto.createHash("sha256").update(SECRET).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const hmac = crypto.createHmac("sha256", SECRET).update(encrypted).digest();
  return Buffer.concat([iv, hmac, encrypted]).toString("base64");
}

function decrypt(token) {
  try {
    const buffer = Buffer.from(token, "base64");
    const iv = buffer.slice(0, 16);
    const hmac = buffer.slice(16, 48);
    const encrypted = buffer.slice(48);

    const expectedHmac = crypto.createHmac("sha256", SECRET).update(encrypted).digest();
    if (!crypto.timingSafeEqual(hmac, expectedHmac)) {
      throw new Error("Config tampered");
    }

    const decipher = crypto.createDecipheriv("aes-256-cbc", crypto.createHash("sha256").update(SECRET).digest(), iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString());
  } catch (err) {
    throw new Error("Invalid or corrupted config: " + err.message);
  }
}

function saveConfig(data) {
  const token = encrypt({ ...data, _generated: new Date().toISOString(), _version: "2.0" });
  fs.writeFileSync(CONFIG_FILE, token, "utf8");
  console.log("Configuration sealed & protected");
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error("Config missing. Run setup wizard.");
  }
  const token = fs.readFileSync(CONFIG_FILE, "utf8");
  return decrypt(token);
}

function configExists() {
  return fs.existsSync(CONFIG_FILE);
}

function deleteConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
    console.log("Config deleted. Setup required.");
  }
}

module.exports = {
  saveConfig,
  loadConfig,
  configExists,
  deleteConfig,
  CONFIG_FILE
};