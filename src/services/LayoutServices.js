const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");

const LAYOUTS_DIR = path.join(__dirname, "../layouts");

// =====================================================
// 🧠 DB ACCESS (YOUR SYSTEM)
// =====================================================

const getModels = async () => {
  const { connectDB } = require("../core/connect-db");
  return await connectDB();
};

async function getLayoutConfigModel() {
  const models = await getModels();
  return models.LayoutConfig;
}

// =====================================================
// 🧠 CORE HELPERS
// =====================================================

const basePath = (id) => path.join(LAYOUTS_DIR, id);
const metaPath = (id) => path.join(basePath(id), "meta.json");

function readMeta(id) {
  const mp = metaPath(id);
  if (!fs.existsSync(mp)) throw new Error("meta.json not found");
  return JSON.parse(fs.readFileSync(mp, "utf-8"));
}

function extractLayoutId(tempDir) {
  const idFile = path.join(tempDir, "id.txt");
  if (!fs.existsSync(idFile)) throw new Error("id.txt missing");

  const raw = fs.readFileSync(idFile, "utf-8");
  const match = raw.match(/id\s*:\s*(.+)/);

  if (!match) throw new Error("Invalid id.txt format");
  return match[1].trim();
}

async function extractZip(zipPath, outDir) {
  await fs.createReadStream(zipPath)
    .pipe(unzipper.Extract({ path: outDir }))
    .promise();
}

// =====================================================
// 📦 INSTALL / UPDATE (UNIFIED)
// =====================================================

async function installLayout(zipPath, { mode = "auto" } = {}) {
  const tempDir = path.join(__dirname, "../../tmp", `layout_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  await extractZip(zipPath, tempDir);

  const id = extractLayoutId(tempDir);
  const target = basePath(id);
  const exists = fs.existsSync(target);

  const newMetaPath = path.join(tempDir, "meta.json");
  if (!fs.existsSync(newMetaPath)) {
    throw new Error("meta.json missing in uploaded layout");
  }

  const newMeta = JSON.parse(fs.readFileSync(newMetaPath, "utf-8"));

  let action = "installed";

  if (exists) {
    const oldMeta = readMeta(id);

    if (mode === "install") {
      throw new Error("Layout already exists");
    }

    // same version → conflict
    if (mode === "auto" && oldMeta.version === newMeta.version) {
      return {
        status: "conflict",
        message: "Same version already installed",
        id,
        version: oldMeta.version,
      };
    }

    // UPDATE
    fs.rmSync(target, { recursive: true, force: true });
    action = "updated";
  }

  fs.cpSync(tempDir, target, { recursive: true });

  // Ensure config after install/update
  await ensureConfig(id, newMeta, { isUpdate: exists });

  return {
    status: "success",
    action,
    id,
    version: newMeta.version,
  };
}

// =====================================================
// ⚙️ CONFIG SYSTEM
// =====================================================

async function ensureConfig(layoutId, meta, { isUpdate = false } = {}) {
  const LayoutConfig = await getLayoutConfigModel();

  let entry = await LayoutConfig.getByLayout(layoutId);

  // FIRST TIME GENERATION
  if (!entry.config || Object.keys(entry.config).length === 0) {
    entry.config = extractDefaults(meta.config || {});
    await entry.save();
    return entry;
  }

  // UPDATE SYNC
  if (isUpdate) {
    const synced = syncConfigWithSchema(entry.config, meta.config || {});
    entry.config = synced;
    await entry.save();
  }

  return entry;
}

// =====================================================
// 🧬 SCHEMA → DEFAULTS
// =====================================================

function extractDefaults(schema) {
  const result = {};

  for (const key in schema) {
    const value = schema[key];

    if (isFieldObject(value)) {
      result[key] = value.default ?? null;
    } else if (isPlainObject(value)) {
      result[key] = extractDefaults(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// =====================================================
// 🔄 SCHEMA SYNC (FOR UPDATES)
// =====================================================

function syncConfigWithSchema(dbConfig, schema) {
  const output = { ...dbConfig };

  for (const key in schema) {
    const schemaVal = schema[key];

    // NEW FIELD
    if (!(key in dbConfig)) {
      output[key] = isFieldObject(schemaVal)
        ? schemaVal.default ?? null
        : isPlainObject(schemaVal)
        ? extractDefaults(schemaVal)
        : schemaVal;
    }
    // NESTED MERGE
    else if (isPlainObject(schemaVal)) {
      output[key] = syncConfigWithSchema(dbConfig[key] || {}, schemaVal);
    }
  }

  return output;
}

// =====================================================
// 🔍 VALIDATORS
// =====================================================

function isPlainObject(obj) {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj);
}

function isFieldObject(obj) {
  return (
    isPlainObject(obj) &&
    ("type" in obj || "default" in obj)
  );
}

// =====================================================
// 🔁 ENSURE READY (GLOBAL SAFE ENTRY)
// =====================================================

async function ensureLayoutReady(layoutId) {
  const meta = readMeta(layoutId);
  await ensureConfig(layoutId, meta);
  return meta;
}

// =====================================================
// 📤 EXPORTS
// =====================================================

module.exports = {
  installLayout,
  ensureLayoutReady,
  ensureConfig,
  extractDefaults,
  syncConfigWithSchema,
};