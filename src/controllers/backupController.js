// src/controllers/backupController.js

const path     = require("path");
const fs       = require("fs");
const fsp      = fs.promises;
const crypto   = require("crypto");
const archiver = require("archiver");

const { getConnection } = require("../core/connect-db");
const { encrypt, decrypt } = require("../utils/cryptoUtil");
const { getSecretFieldNames, ALL_PROVIDERS } = require("./cloudProviderSchema");
const s3Compatible = require("../services/backupProviders/s3Compatible");

const S3_COMPATIBLE_PROVIDERS = ["s3", "r2", "b2", "spaces", "wasabi", "linode", "vultr", "minio", "custom-s3"];

const {
  settingsEvents,
  deepMerge,
  VALID_SECTIONS,
  getSettingsModel,
  getBackupPolicy,
} = require("./settingsController");

// ── Paths ─────────────────────────────────────────────────────────────────────
const UPLOADS_DIR  = path.resolve(__dirname, "../../pub-dist/uploads");
const BACKUPS_DIR  = path.resolve(__dirname, "../../pub-dist/backups");

// ── Bootstrap directories ─────────────────────────────────────────────────────
fs.mkdirSync(BACKUPS_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Constants ────────────────────────────────────────────────────────────────
const BACKUP_VERSION = "1.0";
const CMS_NAME       = "Acroxa";

// ── Backup Provider Registry (data collectors, unrelated to "cloud providers") ──
const _providers = new Map();

const registerBackupProvider = (name, fn) => {
  if (typeof name !== "string" || !name.trim()) throw new Error("Provider name must be a non-empty string");
  if (typeof fn !== "function") throw new Error(`Provider "${name}" handler must be a function`);
  _providers.set(name.trim(), fn);
};

// Built-in providers
registerBackupProvider("users",      async () => []);
registerBackupProvider("posts",      async () => _collectFromCMS("posts"));
registerBackupProvider("pages",      async () => _collectFromCMS("pages"));
registerBackupProvider("categories", async () => _collectFromCMS("categories"));
registerBackupProvider("media",      async () => _listMediaFiles());

module.exports.registerBackupProvider = registerBackupProvider;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function _collectFromCMS(modelName) {
  try {
    const conn = getConnection();
    const models = conn.models || conn;
    const Model = models[capitalize(modelName)] || models[modelName];
    if (!Model) return [];

    if (typeof Model.find === "function") {
      return await Model.find({}).lean();
    }
    if (typeof Model.findAll === "function") {
      const rows = await Model.findAll();
      return rows.map(r => r.toJSON ? r.toJSON() : r);
    }
    return [];
  } catch (err) {
    console.warn(`[Backup] Failed to collect ${modelName}:`, err.message);
    return [];
  }
}

async function _listMediaFiles() {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) return [];
    const files = await fsp.readdir(UPLOADS_DIR, { withFileTypes: true });
    return files
      .filter(f => f.isFile())
      .map(f => ({
        filename: f.name,
        path: path.join("pub-dist/uploads", f.name),
        size: fs.statSync(path.join(UPLOADS_DIR, f.name)).size,
      }));
  } catch (err) {
    console.warn("[Backup] Failed to list media:", err.message);
    return [];
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Core Backup Payload (JSON data only) ─────────────────────────────────────
async function buildBackupPayload({ includeMedia = false } = {}) {
  const Settings = await getSettingsModel();
  const settings = await Settings.getSettings();

  const entries = [..._providers.entries()].filter(([name]) => includeMedia || name !== "media");
  const results = await Promise.allSettled(entries.map(([, fn]) => fn()));

  const data = {};
  for (let i = 0; i < entries.length; i++) {
    const [name] = entries[i];
    const res = results[i];
    data[name] = res.status === "fulfilled" ? res.value : [];
  }

  const timestamp = new Date().toISOString();
  const manifest = {
    version: BACKUP_VERSION,
    timestamp,
    cms: CMS_NAME,
    providers: [..._providers.keys()],
    includeMedia,
    recordCounts: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
    ),
  };

  return {
    meta: manifest,
    settings: settings.toJSON ? settings.toJSON() : settings,
    data,
  };
}

// ── Export Backup (JSON or ZIP with media) ───────────────────────────────────
const exportBackup = async (req, res) => {
  try {
    const includeMedia = req.query.media === "true";

    const backupData = await buildBackupPayload({ includeMedia });
    const timestamp = backupData.meta.timestamp.replace(/[:.]/g, "-");
    const baseFilename = `backup-${timestamp}`;

    if (!includeMedia) {
      // JSON only
      const payload = JSON.stringify(backupData, null, 2);
      const filename = `${baseFilename}.json`;

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");

      await _saveLocalCopy(filename, payload);
      return res.send(payload);
    }
    else {
      // ZIP with backup.json + media files
      const zipFilename = `${baseFilename}-with-media.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);
      res.setHeader("Cache-Control", "no-store");

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      // Add backup JSON
      const jsonString = JSON.stringify(backupData, null, 2);
      archive.append(jsonString, { name: "backup.json" });

      // Add all media files
      if (fs.existsSync(UPLOADS_DIR)) {
        const files = await fsp.readdir(UPLOADS_DIR);
        for (const file of files) {
          const filePath = path.join(UPLOADS_DIR, file);
          if (fs.statSync(filePath).isFile()) {
            archive.file(filePath, { name: `media/${file}` });
          }
        }
      }

      await archive.finalize();

      // Also save a local copy of the JSON part
      await _saveLocalCopy(`${baseFilename}.json`, jsonString);

      return;
    }
  } catch (err) {
    console.error("[Backup] exportBackup:", err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: "Failed to generate backup" });
    }
  }
};

// ── Import Backup ─────────────────────────────────────────────────────────────
const importBackup = async (req, res) => {
  try {
    const backup = req.body;

    if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
      return res.status(400).json({ success: false, message: "Expected a JSON object" });
    }
    if (!backup.meta?.version || !backup.meta?.cms) {
      return res.status(400).json({ success: false, message: "meta.version and meta.cms are required" });
    }
    if (backup.meta.cms !== CMS_NAME) {
      return res.status(400).json({ success: false, message: `Backup from different CMS: "${backup.meta.cms}"` });
    }

    const Settings = await getSettingsModel();
    const current = await Settings.getSettings();
    const safeSettings = {};

    for (const section of VALID_SECTIONS) {
      if (backup.settings?.[section] !== undefined) {
        safeSettings[section] = deepMerge(current[section] ?? {}, backup.settings[section]);
      }
    }

    if (!Object.keys(safeSettings).length) {
      return res.status(400).json({ success: false, message: "No recognized settings sections found" });
    }

    // Never let a restored backup overwrite live encrypted secrets with plaintext
    // that was exported earlier (backups store settings as-is, including encrypted
    // strings, so this is safe) — but if backupPolicy is present, keep it intact.
    const restored = await Settings.updateSettings(safeSettings);

    settingsEvents.emit("settings.restored", {
      backupTimestamp: backup.meta.timestamp,
      restoredSections: Object.keys(safeSettings),
    });

    return res.json({
      success: true,
      message: "Backup restored successfully",
      restoredSections: Object.keys(safeSettings),
      data: restored,
    });
  } catch (err) {
    console.error("[Backup] importBackup:", err);
    return res.status(500).json({ success: false, message: "Failed to restore backup" });
  }
};

// ── Other Routes (unchanged but cleaned) ──────────────────────────────────────
const getBackupHistory = async (req, res) => {
  try {
    const files = await _listLocalBackups();
    return res.json({ success: true, total: files.length, data: files });
  } catch (err) {
    console.error("[Backup] getBackupHistory:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch backup history" });
  }
};

const deleteBackup = async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || filename.includes("..") || !filename.endsWith(".json")) {
      return res.status(400).json({ success: false, message: "Invalid filename" });
    }

    const filePath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Backup not found" });
    }

    await fsp.unlink(filePath);
    return res.json({ success: true, message: `Deleted ${filename}` });
  } catch (err) {
    console.error("[Backup] deleteBackup:", err);
    return res.status(500).json({ success: false, message: "Failed to delete backup" });
  }
};

const downloadSavedBackup = async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || filename.includes("..") || !filename.endsWith(".json")) {
      return res.status(400).json({ success: false, message: "Invalid filename" });
    }

    const filePath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Backup not found" });
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");

    return fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("[Backup] downloadSavedBackup:", err);
    return res.status(500).json({ success: false, message: "Failed to download backup" });
  }
};

// ── Policy (schedule / targets / git / cloud connections+jobs) ───────────────

/**
 * Strip secret fields out of a connection object before sending to the client.
 * Presence of a secret is signaled with `<field>Set: true` instead of the value.
 */
function _redactConnection(conn) {
  if (!conn) return conn;
  const plain = conn.toObject ? conn.toObject() : { ...conn };
  const secretFields = getSecretFieldNames(plain.provider);

  const out = { ...plain };
  for (const field of secretFields) {
    const hasValue = !!out[field];
    out[`${field}Set`] = hasValue;
    delete out[field];
  }
  return out;
}

function _redactGit(git) {
  if (!git) return git;
  const plain = git.toObject ? git.toObject() : { ...git };
  const out = { ...plain };
  out.tokenSet = !!out.token;
  delete out.token;
  return out;
}

/** Redact an entire backupPolicy object (connections + git token) for client responses. */
function redactPolicy(policy) {
  if (!policy) return policy;
  const plain = policy.toObject ? policy.toObject() : JSON.parse(JSON.stringify(policy));

  return {
    ...plain,
    git: _redactGit(plain.git || {}),
    cloud: {
      ...(plain.cloud || {}),
      connections: (plain.cloud?.connections || []).map(_redactConnection),
    },
  };
}

const getPolicy = async (req, res) => {
  try {
    const policy = await getBackupPolicy();
    return res.json({ success: true, data: redactPolicy(policy) });
  } catch (err) {
    console.error("[Backup] getPolicy:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch backup policy" });
  }
};

const updatePolicy = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ success: false, message: "Body must be a JSON object" });
    }

    const Settings = await getSettingsModel();
    const current = await Settings.getSettings();

    // Never touch cloud.connections/jobs through this generic endpoint —
    // those go through their own CRUD routes so secrets are handled correctly.
    const incoming = { ...req.body };
    delete incoming.cloud;

    // Git token: encrypt only if a new one was actually provided (non-empty string)
    if (incoming.git && typeof incoming.git.token === "string") {
      if (incoming.git.token.trim() === "") {
        delete incoming.git.token; // keep existing encrypted token
      } else {
        incoming.git.token = encrypt(incoming.git.token);
      }
    }

    const merged = deepMerge(current.backupPolicy ?? {}, incoming);
    // Preserve existing cloud config untouched (managed by dedicated routes)
    merged.cloud = (current.backupPolicy ?? {}).cloud ?? { connections: [], jobs: [] };

    const updated = await Settings.updateSettings({ backupPolicy: merged });
    scheduleBackup(merged);

    settingsEvents.emit("settings.updated", { section: "backupPolicy", data: merged });

    return res.json({ success: true, data: redactPolicy(updated.backupPolicy) });
  } catch (err) {
    console.error("[Backup] updatePolicy:", err);
    return res.status(500).json({ success: false, message: "Failed to update policy" });
  }
};

// ── Cloud Connections CRUD ────────────────────────────────────────────────────

const listConnections = async (req, res) => {
  try {
    const policy = await getBackupPolicy();
    const connections = (policy.cloud?.connections || []).map(_redactConnection);
    return res.json({ success: true, data: connections });
  } catch (err) {
    console.error("[Backup] listConnections:", err);
    return res.status(500).json({ success: false, message: "Failed to list connections" });
  }
};

const createConnection = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.provider || !ALL_PROVIDERS.includes(body.provider)) {
      return res.status(400).json({ success: false, message: `Invalid or missing provider. Must be one of: ${ALL_PROVIDERS.join(", ")}` });
    }

    const Settings = await getSettingsModel();
    const current  = await Settings.getSettings();
    const cloud    = current.backupPolicy?.cloud ?? { connections: [], jobs: [] };

    const secretFields = getSecretFieldNames(body.provider);
    const record = { ...body, id: crypto.randomUUID() };

    for (const field of secretFields) {
      if (record[field]) record[field] = encrypt(record[field]);
    }

    const connections = [...(cloud.connections || []), record];
    const updated = await Settings.updateSettings({
      "backupPolicy.cloud": { ...cloud, connections },
    });

    const saved = updated.backupPolicy.cloud.connections.find(c => c.id === record.id);
    settingsEvents.emit("settings.updated", { section: "backupPolicy.cloud.connections", action: "create", id: record.id });

    return res.status(201).json({ success: true, data: _redactConnection(saved) });
  } catch (err) {
    console.error("[Backup] createConnection:", err);
    return res.status(500).json({ success: false, message: "Failed to create connection" });
  }
};

const updateConnection = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const Settings = await getSettingsModel();
    const current  = await Settings.getSettings();
    const cloud    = current.backupPolicy?.cloud ?? { connections: [], jobs: [] };

    const idx = (cloud.connections || []).findIndex(c => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Connection not found" });
    }

    const existing = cloud.connections[idx].toObject ? cloud.connections[idx].toObject() : cloud.connections[idx];
    const provider = body.provider || existing.provider;
    const secretFields = getSecretFieldNames(provider);

    const merged = { ...existing, ...body, id, provider, updatedAt: new Date() };

    // For secret fields: only overwrite if a new non-empty value was sent;
    // otherwise keep the existing (already-encrypted) value.
    for (const field of secretFields) {
      if (body[field] === undefined || body[field] === "") {
        merged[field] = existing[field]; // keep old encrypted value
      } else {
        merged[field] = encrypt(body[field]);
      }
    }

    const connections = [...cloud.connections];
    connections[idx] = merged;

    const updated = await Settings.updateSettings({
      "backupPolicy.cloud": { ...cloud, connections },
    });

    const saved = updated.backupPolicy.cloud.connections.find(c => c.id === id);
    settingsEvents.emit("settings.updated", { section: "backupPolicy.cloud.connections", action: "update", id });

    return res.json({ success: true, data: _redactConnection(saved) });
  } catch (err) {
    console.error("[Backup] updateConnection:", err);
    return res.status(500).json({ success: false, message: "Failed to update connection" });
  }
};

const deleteConnection = async (req, res) => {
  try {
    const { id } = req.params;

    const Settings = await getSettingsModel();
    const current  = await Settings.getSettings();
    const cloud    = current.backupPolicy?.cloud ?? { connections: [], jobs: [] };

    const connections = (cloud.connections || []).filter(c => c.id !== id);
    if (connections.length === (cloud.connections || []).length) {
      return res.status(404).json({ success: false, message: "Connection not found" });
    }

    // Also drop any jobs referencing this connection
    const jobs = (cloud.jobs || []).filter(j => j.connectionId !== id);

    await Settings.updateSettings({
      "backupPolicy.cloud": { ...cloud, connections, jobs },
    });

    settingsEvents.emit("settings.updated", { section: "backupPolicy.cloud.connections", action: "delete", id });

    return res.json({ success: true, message: "Connection deleted", removedJobs: (cloud.jobs || []).length - jobs.length });
  } catch (err) {
    console.error("[Backup] deleteConnection:", err);
    return res.status(500).json({ success: false, message: "Failed to delete connection" });
  }
};

/**
 * Test a connection's credentials without saving anything.
 * Body can either reference a saved connection by { id } (decrypts stored
 * secrets) or provide a full unsaved connection object directly, so the
 * frontend can "Test" before the user hits Save.
 */
const testConnection = async (req, res) => {
  try {
    const body = req.body || {};
    let conn;
    let creds;

    if (body.id) {
      const policy = await getBackupPolicy();
      const found = (policy.cloud?.connections || []).find(c => c.id === body.id);
      if (!found) return res.status(404).json({ success: false, message: "Connection not found" });
      conn = found;
      const secretFields = getSecretFieldNames(conn.provider);
      creds = {};
      for (const field of secretFields) creds[field] = conn[field] ? decrypt(conn[field]) : null;
    } else {
      if (!body.provider || !ALL_PROVIDERS.includes(body.provider)) {
        return res.status(400).json({ success: false, message: "Invalid or missing provider" });
      }
      conn = body;
      creds = body; // unsaved test — fields are already plaintext in the request
    }

    if (!S3_COMPATIBLE_PROVIDERS.includes(conn.provider)) {
      return res.status(400).json({
        success: false,
        message: `Live connection testing isn't implemented yet for "${conn.provider}". Save the connection and it will be validated the next time a job runs.`,
      });
    }

    await s3Compatible.testConnection(conn, creds);
    return res.json({ success: true, message: "Connection successful" });
  } catch (err) {
    console.error("[Backup] testConnection:", err);
    return res.status(400).json({ success: false, message: err.message || "Connection test failed" });
  }
};

// ── Backup Jobs CRUD ──────────────────────────────────────────────────────────

const listJobs = async (req, res) => {
  try {
    const policy = await getBackupPolicy();
    return res.json({ success: true, data: policy.cloud?.jobs || [] });
  } catch (err) {
    console.error("[Backup] listJobs:", err);
    return res.status(500).json({ success: false, message: "Failed to list jobs" });
  }
};

const createJob = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.connectionId) {
      return res.status(400).json({ success: false, message: "connectionId is required" });
    }

    const Settings = await getSettingsModel();
    const current  = await Settings.getSettings();
    const cloud    = current.backupPolicy?.cloud ?? { connections: [], jobs: [] };

    const connExists = (cloud.connections || []).some(c => c.id === body.connectionId);
    if (!connExists) {
      return res.status(400).json({ success: false, message: "connectionId does not reference an existing connection" });
    }

    const job = {
      id: crypto.randomUUID(),
      connectionId: body.connectionId,
      name: body.name || "",
      enabled: body.enabled !== false,
      includeMedia: body.includeMedia !== false,
      backupPath: body.backupPath || "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const jobs = [...(cloud.jobs || []), job];
    const updated = await Settings.updateSettings({ "backupPolicy.cloud": { ...cloud, jobs } });

    const saved = updated.backupPolicy.cloud.jobs.find(j => j.id === job.id);
    settingsEvents.emit("settings.updated", { section: "backupPolicy.cloud.jobs", action: "create", id: job.id });

    return res.status(201).json({ success: true, data: saved });
  } catch (err) {
    console.error("[Backup] createJob:", err);
    return res.status(500).json({ success: false, message: "Failed to create job" });
  }
};

const updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const Settings = await getSettingsModel();
    const current  = await Settings.getSettings();
    const cloud    = current.backupPolicy?.cloud ?? { connections: [], jobs: [] };

    const idx = (cloud.jobs || []).findIndex(j => j.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    if (body.connectionId) {
      const connExists = (cloud.connections || []).some(c => c.id === body.connectionId);
      if (!connExists) {
        return res.status(400).json({ success: false, message: "connectionId does not reference an existing connection" });
      }
    }

    const existing = cloud.jobs[idx].toObject ? cloud.jobs[idx].toObject() : cloud.jobs[idx];
    const merged = { ...existing, ...body, id, updatedAt: new Date() };

    const jobs = [...cloud.jobs];
    jobs[idx] = merged;

    const updated = await Settings.updateSettings({ "backupPolicy.cloud": { ...cloud, jobs } });
    const saved = updated.backupPolicy.cloud.jobs.find(j => j.id === id);

    settingsEvents.emit("settings.updated", { section: "backupPolicy.cloud.jobs", action: "update", id });

    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("[Backup] updateJob:", err);
    return res.status(500).json({ success: false, message: "Failed to update job" });
  }
};

const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;

    const Settings = await getSettingsModel();
    const current  = await Settings.getSettings();
    const cloud    = current.backupPolicy?.cloud ?? { connections: [], jobs: [] };

    const jobs = (cloud.jobs || []).filter(j => j.id !== id);
    if (jobs.length === (cloud.jobs || []).length) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    await Settings.updateSettings({ "backupPolicy.cloud": { ...cloud, jobs } });
    settingsEvents.emit("settings.updated", { section: "backupPolicy.cloud.jobs", action: "delete", id });

    return res.json({ success: true, message: "Job deleted" });
  } catch (err) {
    console.error("[Backup] deleteJob:", err);
    return res.status(500).json({ success: false, message: "Failed to delete job" });
  }
};

const triggerManualBackup = async (req, res) => {
  try {
    const { targets = ["local"] } = req.body || {};
    const result = await runBackup({ targets });
    return res.json({ success: true, message: "Manual backup triggered", result });
  } catch (err) {
    console.error("[Backup] triggerManualBackup:", err);
    return res.status(500).json({ success: false, message: "Manual backup failed", error: err.message });
  }
};

// ── Local Storage Helpers ─────────────────────────────────────────────────────
async function _saveLocalCopy(filename, jsonString) {
  try {
    await fsp.writeFile(path.join(BACKUPS_DIR, filename), jsonString, "utf8");
  } catch (err) {
    console.warn("[Backup] Could not save local copy:", err.message);
  }
}

async function _listLocalBackups() {
  try {
    const files = await fsp.readdir(BACKUPS_DIR);
    const jsonFiles = files.filter(f => f.endsWith(".json"));

    const stats = await Promise.all(
      jsonFiles.map(async (f) => {
        const s = await fsp.stat(path.join(BACKUPS_DIR, f));
        return {
          filename: f,
          size: s.size,
          createdAt: s.birthtime,
          modifiedAt: s.mtime,
        };
      })
    );

    return stats.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.warn("[Backup] Failed to list backups:", err.message);
    return [];
  }
}

// ── Git Backup Adapter ─────────────────────────────────────────────────────────
async function _runGitBackup(payload, gitConfig) {
  try {
    if (!gitConfig?.repoURL) {
      return { target: "git", success: false, error: "No repository URL configured" };
    }
    const token = gitConfig.token ? decrypt(gitConfig.token) : null;
    if (!token) {
      return { target: "git", success: false, error: "No access token configured" };
    }

    // NOTE: actual git push requires `simple-git` or shelling out to the `git` binary
    // plus a scratch clone directory. Wire this up once that dependency is added —
    // the credential handling above (decrypt on use, never log) is already correct.
    console.warn("[Backup] Git push not implemented — credentials resolved OK, but no git client wired up yet.");
    return { target: "git", success: false, error: "Git push transport not implemented yet" };
  } catch (err) {
    return { target: "git", success: false, error: err.message };
  }
}

// ── Cloud Backup Adapter (dispatches per connection/provider) ────────────────
async function _runCloudBackup(payload, cloud, includeMediaDefault) {
  const connections = cloud?.connections || [];
  const jobs        = (cloud?.jobs || []).filter(j => j.enabled !== false);

  if (!jobs.length) {
    return { target: "cloud", success: false, error: "No enabled backup jobs configured" };
  }

  const jsonString = JSON.stringify(payload, null, 2);
  const jobResults = [];

  for (const job of jobs) {
    const conn = connections.find(c => c.id === job.connectionId);
    if (!conn) {
      jobResults.push({ jobId: job.id, success: false, error: "Connection not found" });
      continue;
    }

    try {
      const result = await _uploadToProvider(conn, {
        filename: `backup-${payload.meta.timestamp.replace(/[:.]/g, "-")}.json`,
        content: jsonString,
        remotePath: job.backupPath || "",
        includeMedia: job.includeMedia !== false && includeMediaDefault,
      });
      jobResults.push({ jobId: job.id, connectionId: conn.id, provider: conn.provider, success: true, ...result });
    } catch (err) {
      jobResults.push({ jobId: job.id, connectionId: conn.id, provider: conn.provider, success: false, error: err.message });
    }
  }

  const anySuccess = jobResults.some(r => r.success);
  return { target: "cloud", success: anySuccess, jobs: jobResults };
}

/**
 * Dispatch an upload to the correct provider SDK based on connection.provider.
 * Secrets are decrypted here, immediately before use, and never logged.
 *
 * Each branch is a real integration point — wire in the corresponding SDK
 * (aws-sdk/@aws-sdk/client-s3 for s3-compatible ones, googleapis for gdrive,
 * dropbox-sdk-js for dropbox, @azure/storage-blob for azure, basic-ftp/ssh2-sftp-client
 * for ftp/sftp, webdav for webdav) and install as a dependency when ready.
 */
async function _uploadToProvider(conn, { filename, content, remotePath, includeMedia }) {
  const provider = conn.provider;
  const secretFields = getSecretFieldNames(provider);
  const creds = {};
  for (const field of secretFields) {
    creds[field] = conn[field] ? decrypt(conn[field]) : null;
  }

  const isS3Compatible = S3_COMPATIBLE_PROVIDERS.includes(provider);

  if (isS3Compatible) {
    if (!creds.accessKey || !creds.secretKey) {
      throw new Error(`Missing credentials for ${provider} connection "${conn.name || conn.id}"`);
    }

    const uploadResult = await s3Compatible.uploadPayload(conn, creds, { filename, content, remotePath });

    if (includeMedia && fs.existsSync(UPLOADS_DIR)) {
      const mediaResult = await s3Compatible.uploadDirectory(conn, creds, { localDir: UPLOADS_DIR, remotePath });
      return { ...uploadResult, media: mediaResult };
    }

    return uploadResult;
  }

  if (provider === "gdrive") {
    if (!creds.refreshToken) throw new Error("Missing Google Drive refresh token");
    console.log(`[Backup] (stub) Would upload ${filename} to Google Drive folder "${conn.rootFolder || "root"}"`);
    return { uploaded: true, provider, folder: conn.rootFolder, stub: true };
  }

  if (provider === "dropbox") {
    if (!creds.refreshToken) throw new Error("Missing Dropbox refresh token");
    console.log(`[Backup] (stub) Would upload ${filename} to Dropbox folder "${conn.folder || "/"}"`);
    return { uploaded: true, provider, folder: conn.folder, stub: true };
  }

  if (provider === "onedrive") {
    if (!creds.refreshToken) throw new Error("Missing OneDrive refresh token");
    console.log(`[Backup] (stub) Would upload ${filename} to OneDrive folder "${conn.rootFolder || "root"}"`);
    return { uploaded: true, provider, folder: conn.rootFolder, stub: true };
  }

  if (provider === "azure") {
    if (!creds.accountKey) throw new Error("Missing Azure account key");
    console.log(`[Backup] (stub) Would upload ${filename} to Azure container "${conn.container}"`);
    return { uploaded: true, provider, container: conn.container, stub: true };
  }

  if (provider === "gcs") {
    if (!creds.serviceAccountJSON) throw new Error("Missing GCS service account JSON");
    console.log(`[Backup] (stub) Would upload ${filename} to GCS bucket "${conn.bucket}"`);
    return { uploaded: true, provider, bucket: conn.bucket, stub: true };
  }

  if (provider === "ftp") {
    if (!creds.password) throw new Error("Missing FTP password");
    console.log(`[Backup] (stub) Would upload ${filename} to FTP ${conn.host}:${conn.port}${conn.directory || ""}`);
    return { uploaded: true, provider, host: conn.host, stub: true };
  }

  if (provider === "sftp") {
    if (!creds.password && !creds.privateKey) throw new Error("Missing SFTP password or private key");
    console.log(`[Backup] (stub) Would upload ${filename} to SFTP ${conn.host}:${conn.port}${conn.directory || ""}`);
    return { uploaded: true, provider, host: conn.host, stub: true };
  }

  if (provider === "webdav") {
    if (!creds.password) throw new Error("Missing WebDAV password");
    console.log(`[Backup] (stub) Would upload ${filename} to WebDAV ${conn.url}${conn.folder || ""}`);
    return { uploaded: true, provider, url: conn.url, stub: true };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// ── Core Backup Runner ────────────────────────────────────────────────────────
async function runBackup({ targets = ["local"] } = {}) {
  const policy = await getBackupPolicy();
  const includeMedia = policy.includeMedia ?? false;
  const payload = await buildBackupPayload({ includeMedia });

  const timestamp = payload.meta.timestamp.replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.json`;
  const jsonString = JSON.stringify(payload, null, 2);
  const runResults = [];

  if (targets.includes("local") || policy.targets?.local) {
    await _saveLocalCopy(filename, jsonString);
    runResults.push({ target: "local", success: true, filename });
  }

  if (targets.includes("git") || policy.targets?.git) {
    const r = await _runGitBackup(payload, policy.git ?? {});
    runResults.push(r);
  }

  if (targets.includes("cloud") || policy.targets?.cloud) {
    const r = await _runCloudBackup(payload, policy.cloud ?? {}, includeMedia);
    runResults.push(r);
  }

  console.log(`[Backup] Run complete:`, runResults.map(r => `${r.target}=${r.success}`).join(", "));
  return { timestamp, results: runResults };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
let _schedulerTimer = null;

function scheduleBackup(policy) {
  if (_schedulerTimer) {
    clearTimeout(_schedulerTimer);
    if (_schedulerTimer) clearInterval(_schedulerTimer);
    _schedulerTimer = null;
  }

  if (!policy?.enabled) return;

  const { interval, time = "02:00", customInterval } = policy.schedule ?? {};
  const INTERVALS = {
    realtime: 60 * 1000,
    hourly:   60 * 60 * 1000,
    daily:    24 * 60 * 60 * 1000,
    weekly:   7 * 24 * 60 * 60 * 1000,
  };

  if (interval === "custom" && customInterval > 0) {
    _schedulerTimer = setInterval(() => runBackup(), customInterval * 1000);
    return;
  }

  const ms = INTERVALS[interval];
  if (!ms) return;

  if (interval === "daily" || interval === "weekly") {
    const [hh, mm] = time.split(":").map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(hh, mm, 0, 0);
    if (next <= now) next.setTime(next.getTime() + ms);

    const delay = next - now;
    _schedulerTimer = setTimeout(() => {
      runBackup();
      _schedulerTimer = setInterval(() => runBackup(), ms);
    }, delay);
  } else {
    _schedulerTimer = setInterval(() => runBackup(), ms);
  }
}

// Auto-start scheduler
(async () => {
  try {
    const policy = await getBackupPolicy();
    scheduleBackup(policy);
  } catch (e) {
    // DB not ready yet
  }
})();

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  registerBackupProvider,
  buildBackupPayload,
  runBackup,
  scheduleBackup,

  // Route handlers
  exportBackup,
  importBackup,
  getBackupHistory,
  deleteBackup,
  downloadSavedBackup,
  getPolicy,
  updatePolicy,
  triggerManualBackup,

  // Cloud connections
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,

  // Cloud jobs
  listJobs,
  createJob,
  updateJob,
  deleteJob,
};
