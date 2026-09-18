// src/controllers/settingsController.js

const EventEmitter = require("events");
const settingsEvents = new EventEmitter();

// Initialize webhook listeners for settings events (deferred to avoid circular deps)
let _webhookInitialized = false;
function _ensureWebhookListeners() {
  if (_webhookInitialized) return;
  _webhookInitialized = true;
  try {
    const { initWebhookListeners } = require("../services/webhookDispatcher");
    initWebhookListeners();
  } catch (_) {}
}
// Init on next tick to break circular dependency
process.nextTick(_ensureWebhookListeners);

// ── DB Access ────────────────────────────────────────────────────────────────
const getModels = async () => {
  const { connectDB } = require("../core/connect-db");
  return await connectDB();
};

function getSettingsModel() {
  return getModels().then(models => models.Settings);
}

// ── Constants ────────────────────────────────────────────────────────────────
const VALID_SECTIONS = [
  "general", "localization", "system", "security",
  "appearance", "api", "content",
  // NEW routing-related sections
  "homepage", "blogPage", "routing",
  "seo", "analytics", "ai", "advanced", "backupPolicy",
  "email",
  // AcroxaJS runtime (cache strategies, diagnostics — flat shape like all
  // sections; layers.js policy() reads it, every key affects behavior)
  "runtime",
];

const AI_MODELS = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro"],
  custom: [],
};

const isValidSection = (section) => VALID_SECTIONS.includes(section);

// Routing-related sections that require RouteResolver cache bust on update
const ROUTING_SECTIONS = new Set(["homepage", "blogPage", "routing"]);

// ── Deep Merge ───────────────────────────────────────────────────────────────
const deepMerge = (target = {}, source = {}) => {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
};

// ── RouteResolver cache bust ──────────────────────────────────────────────────
// Called whenever a routing-relevant section is updated so that
// RouteResolver picks up the new homepage/blogPage/routing config immediately.
function _bustRoutingCache(section) {
  if (!ROUTING_SECTIONS.has(section)) return;
  try {
    const { bustSettingsCache, bustBlogSlugCache } = require("../core/RouteResolver");
    bustSettingsCache();
    if (section === "blogPage") bustBlogSlugCache();
  } catch (_) {
    // RouteResolver may not be initialized yet at startup — safe to ignore
  }
}

// ── Controllers ──────────────────────────────────────────────────────────────

// GET ALL SETTINGS
const getSettings = async (req, res) => {
  try {
    const models   = await getModels();
    const settings = await models.Settings.getSettings();
    return res.json({ success: true, data: settings });
  } catch (err) {
    console.error("[Settings] getSettings:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch settings" });
  }
};

// GET SINGLE SECTION
const getSection = async (req, res) => {
  try {
    const { section } = req.params;
    if (!isValidSection(section)) {
      return res.status(404).json({ success: false, message: "Invalid section" });
    }
    const models   = await getModels();
    const settings = await models.Settings.getSettings();

    // The "routing" page needs data from three separate sections
    if (section === "routing") {
      return res.json({
        success: true,
        section,
        data: {
          homepage: settings.homepage || {},
          blogPage: settings.blogPage || {},
          routing:  settings.routing  || {},
        },
      });
    }

    return res.json({ success: true, section, data: settings[section] || {} });
  } catch (err) {
    console.error("[Settings] getSection:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch section" });
  }
};

// UPDATE SINGLE SECTION
const updateSection = async (req, res) => {
  try {
    const { section } = req.params;
    if (!isValidSection(section)) {
      return res.status(404).json({ success: false, message: "Invalid section" });
    }
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ success: false, message: "Invalid body" });
    }

    const models  = await getModels();
    const current = await models.Settings.getSettings();
    const merged  = deepMerge(current[section] || {}, req.body);
    const updated = await models.Settings.updateSettings({ [section]: merged });

    // Reset email transporter if email settings changed
    if (section === "email") {
      try {
        const { resetTransporter } = require("../services/emailService");
        resetTransporter();
      } catch (_) {}
    }

    // Bust RouteResolver cache for routing-sensitive sections
    _bustRoutingCache(section);

    // Update global settings cache for middleware/LayoutEngine reads
    try {
      const fresh = await models.Settings.getSettings();
      global._settingsCache = fresh;
    } catch (_) {}

    settingsEvents.emit("settings.updated", { section, data: merged });

    return res.json({ success: true, section, data: updated[section] });
  } catch (err) {
    console.error("[Settings] updateSection:", err);
    return res.status(500).json({ success: false, message: "Failed to update section" });
  }
};

// BULK UPDATE
const bulkUpdate = async (req, res) => {
  try {
    const models       = await getModels();
    const current      = await models.Settings.getSettings();
    const updatePayload = {};
    const skipped      = [];

    for (const [section, data] of Object.entries(req.body)) {
      if (!isValidSection(section)) { skipped.push(section); continue; }
      updatePayload[section] = deepMerge(current[section] || {}, data);
    }

    if (!Object.keys(updatePayload).length) {
      return res.status(400).json({ success: false, message: "No valid sections provided", skipped });
    }

    const updated = await models.Settings.updateSettings(updatePayload);

    // Bust routing cache for any routing sections in payload
    Object.keys(updatePayload).forEach(section => {
      _bustRoutingCache(section);
      settingsEvents.emit("settings.updated", { section, data: updatePayload[section] });
    });

    return res.json({
      success: true,
      updatedSections: Object.keys(updatePayload),
      skipped,
      data: updated,
    });
  } catch (err) {
    console.error("[Settings] bulkUpdate:", err);
    return res.status(500).json({ success: false, message: "Bulk update failed" });
  }
};

// RESET SETTINGS
const resetSettings = async (req, res) => {
  try {
    const models = await getModels();
    if (typeof models.Settings.deleteMany === "function") {
      await models.Settings.deleteMany({});
    } else if (typeof models.Settings.destroy === "function") {
      await models.Settings.destroy({ where: {}, truncate: true });
    }
    const fresh = await models.Settings.getSettings();

    // Bust all routing caches on reset
    _bustRoutingCache("homepage");
    _bustRoutingCache("blogPage");
    _bustRoutingCache("routing");

    settingsEvents.emit("settings.reset", { data: fresh });
    return res.json({ success: true, message: "Settings reset", data: fresh });
  } catch (err) {
    console.error("[Settings] resetSettings:", err);
    return res.status(500).json({ success: false, message: "Reset failed" });
  }
};

// TOGGLE MAINTENANCE
const toggleMaintenance = async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ success: false, message: '"enabled" must be boolean' });
    }

    const models  = await getModels();
    const current = await models.Settings.getSettings();
    const merged  = deepMerge(current.system || {}, { maintenanceMode: enabled });
    const updated = await models.Settings.updateSettings({ system: merged });

    settingsEvents.emit("settings.updated", { section: "system", data: merged });
    // Maintenance is runtime state: push invalidation so visitor clients learn
    // without restart/polling (admin clients stay authorized).
    try {
      require("../core/runtime/invalidate").invalidate({
        type: "system", id: "maintenance", scope: "global",
        reason: enabled ? "maintenance:on" : "maintenance:off",
        strategy: "full-reload",
      });
    } catch (_) {}
    return res.json({ success: true, data: updated.system });
  } catch (err) {
    console.error("[Settings] toggleMaintenance:", err);
    return res.status(500).json({ success: false, message: "Toggle failed" });
  }
};

// TEST AI CONNECTION
const testAIConnection = async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) {
      return res.status(400).json({ success: false, message: "Provider is required" });
    }

    const models = await getModels();
    const settings = await models.Settings.getSettings();
    const aiConfig = settings.ai || {};
    const providerConfig = aiConfig.providers?.[provider];

    if (!providerConfig) {
      return res.status(400).json({ success: false, message: `Unknown provider: ${provider}` });
    }

    const apiKey = providerConfig.apiKey;
    if (!apiKey) {
      return res.status(400).json({ success: false, message: `No API key configured for ${provider}` });
    }

    const start = Date.now();

    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(400).json({
          success: false,
          message: err?.error?.message || `OpenAI returned HTTP ${response.status}`,
        });
      }
      return res.json({ success: true, provider, status: "connected", latencyMs });
    }

    if (provider === "gemini") {
      const model = providerConfig.model || "gemini-1.5-flash";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${apiKey}`,
        { method: "GET", signal: AbortSignal.timeout(15000) }
      );
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(400).json({
          success: false,
          message: err?.error?.message || `Gemini returned HTTP ${response.status}`,
        });
      }
      return res.json({ success: true, provider, status: "connected", latencyMs });
    }

    if (provider === "custom") {
      const endpoint = providerConfig.endpoint;
      if (!endpoint) {
        return res.status(400).json({ success: false, message: "No endpoint configured for custom provider" });
      }
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const response = await fetch(endpoint.replace(/\/$/, "") + "/models", {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        return res.status(400).json({
          success: false,
          message: `Custom provider returned HTTP ${response.status}`,
        });
      }
      return res.json({ success: true, provider, status: "connected", latencyMs });
    }

    return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
  } catch (err) {
    console.error("[Settings] testAIConnection:", err);
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return res.status(400).json({ success: false, message: "Connection timed out after 15 seconds" });
    }
    return res.status(500).json({ success: false, message: err.message || "AI test failed" });
  }
};

// GET AI MODELS
const getAIModels = (req, res) => {
  const { provider } = req.query;
  if (!provider) return res.status(400).json({ success: false, message: "provider required" });
  const models = AI_MODELS[provider];
  if (!models) return res.status(404).json({ success: false, message: "Unknown provider" });
  return res.json({ success: true, provider, models });
};

// SWITCH AI PROVIDER
const switchAIProvider = async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider || !AI_MODELS[provider]) {
      return res.status(400).json({ success: false, message: "Invalid provider" });
    }
    const models  = await getModels();
    const current = await models.Settings.getSettings();
    const merged  = deepMerge(current.ai || {}, { defaultProvider: provider });
    const updated = await models.Settings.updateSettings({ ai: merged });
    settingsEvents.emit("settings.updated", { section: "ai", data: merged });
    return res.json({ success: true, data: updated.ai });
  } catch (err) {
    console.error("[Settings] switchAIProvider:", err);
    return res.status(500).json({ success: false, message: "Switch failed" });
  }
};

// BACKUP POLICY (internal use)
const getBackupPolicy = async () => {
  const models   = await getModels();
  const settings = await models.Settings.getSettings();
  return settings.backupPolicy || {};
};

// TEST EMAIL CONNECTION
const testEmailConnection = async (req, res) => {
  try {
    const models = await getModels();
    const settings = await models.Settings.getSettings();
    const emailConfig = settings.email || {};

    if (!emailConfig.host) {
      return res.status(400).json({ success: false, message: "SMTP host is not configured" });
    }

    const { testConnection } = require("../services/emailService");
    const result = await testConnection(emailConfig);
    return res.json(result);
  } catch (err) {
    console.error("[Settings] testEmailConnection:", err);
    return res.status(500).json({ success: false, message: err.message || "Email test failed" });
  }
};

// SEND TEST EMAIL
const sendTestEmail = async (req, res) => {
  try {
    const { to } = req.body;
    if (!to || typeof to !== "string" || !to.includes("@")) {
      return res.status(400).json({ success: false, message: "Valid email address is required" });
    }

    const models = await getModels();
    const settings = await models.Settings.getSettings();
    const emailConfig = settings.email || {};

    if (!emailConfig.host) {
      return res.status(400).json({ success: false, message: "SMTP host is not configured" });
    }

    const { sendTestEmail: sendTest } = require("../services/emailService");
    const result = await sendTest(to, emailConfig);
    return res.json(result);
  } catch (err) {
    console.error("[Settings] sendTestEmail:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to send test email" });
  }
};

// FLUSH CACHE — explicit, scoped invalidation (never "clear everything" by default).
// Clears: runtime cache layer, RouteResolver caches, then rebuilds the file-route
// router atomically. Does NOT nuke the whole require.cache (that destroys live
// layout engines and leaks listeners); route modules reload via loadRoutes.
const flushCache = async (req, res) => {
  try {
    let runtimeCleared = 0;
    try {
      runtimeCleared = require("../core/runtime/cache").clearAll();
    } catch (_) {}

    // Bust all routing caches
    try {
      const { bustSettingsCache, bustBlogSlugCache } = require("../core/RouteResolver");
      bustSettingsCache();
      bustBlogSlugCache();
    } catch (_) {}

    // Rebuild the file-route inner router deterministically (atomic swap).
    let routes = null;
    try {
      routes = require("../core/loadRoutes").reloadRoutes();
    } catch (e) {
      routes = { success: false, error: e.message };
    }

    return res.json({ success: true, message: "Cache flushed", runtimeCleared, routes });
  } catch (err) {
    console.error("[Settings] flushCache:", err);
    return res.status(500).json({ success: false, message: "Cache flush failed" });
  }
};

// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  settingsEvents,
  deepMerge,
  VALID_SECTIONS,
  getBackupPolicy,
  getSettingsModel,
  getSettings,
  getSection,
  updateSection,
  bulkUpdate,
  resetSettings,
  toggleMaintenance,
  testAIConnection,
  getAIModels,
  switchAIProvider,
  testEmailConnection,
  sendTestEmail,
  flushCache,
};