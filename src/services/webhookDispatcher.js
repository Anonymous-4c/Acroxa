// src/services/webhookDispatcher.js
// Dispatches event payloads to registered webhook URLs.
// Triggered by settings events and other system events.

const { settingsEvents } = require("../controllers/settingsController");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const TIMEOUT_MS = 10000;

/**
 * Send a POST request to a single webhook URL with retry logic.
 * @param {string} url
 * @param {object} payload
 * @param {number} attempt
 * @returns {Promise<{url: string, success: boolean, status?: number, error?: string}>}
 */
async function sendToWebhook(url, payload, attempt = 1) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Acroxa-CMS-Webhook/1.0",
        "X-Acroxa-Event": payload.event || "unknown",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    return { url, success: res.ok, status: res.status };
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      return sendToWebhook(url, payload, attempt + 1);
    }
    return { url, success: false, error: err.message || "Request failed" };
  }
}

/**
 * Dispatch a webhook event to all registered URLs.
 * @param {string} event - Event name (e.g. "settings.updated")
 * @param {object} data - Event data
 * @param {string[]} urls - Webhook URLs to notify
 * @returns {Promise<Array>} Results for each URL
 */
async function dispatch(event, data, urls) {
  if (!urls || !urls.length) return [];

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    source: "acroxa-cms",
    data,
  };

  const results = await Promise.allSettled(
    urls.map(url => sendToWebhook(url, payload))
  );

  return results.map(r => r.status === "fulfilled" ? r.value : { url: "unknown", success: false, error: r.reason?.message });
}

/**
 * Dispatch to webhook URLs from settings.
 * Reads the current webhook URLs from the Settings model and dispatches.
 * @param {string} event
 * @param {object} data
 */
async function dispatchFromSettings(event, data) {
  try {
    const { getModels } = require("../controllers/settingsController");
    const models = await getModels();
    const settings = await models.Settings.getSettings();
    const urls = settings.api?.webhookURLs;
    if (!urls || !urls.length) return [];
    return dispatch(event, data, urls);
  } catch (err) {
    console.error("[Webhook] Failed to dispatch:", err.message);
    return [];
  }
}

/**
 * Initialize webhook listeners.
 * Called once at startup to wire settings events to webhook dispatch.
 */
function initWebhookListeners() {
  settingsEvents.on("settings.updated", (payload) => {
    // Dispatch async — don't block the response
    dispatchFromSettings("settings.updated", payload).catch(() => {});
  });

  settingsEvents.on("settings.reset", (payload) => {
    dispatchFromSettings("settings.reset", payload).catch(() => {});
  });
}

module.exports = {
  sendToWebhook,
  dispatch,
  dispatchFromSettings,
  initWebhookListeners,
};
