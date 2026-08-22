// src/core/PreviewEngineManager.js
//
// Manages isolated preview engines for the customizer.
// Each preview engine is keyed by (layoutId + configHash).
// Engines are lazily created, LRU-evicted, and safely cleaned up.
//
// Usage:
//   const html = await PreviewEngineManager.render(acrx, layoutId, url, configOverrides);
//
// Preview URL format (mounted in pages.js):
//   GET /acrx/layouts/preview?id=nova-nexus&url=/about
//   POST /acrx/layouts/preview/reload   { id, config }
//   POST /acrx/layouts/preview/clear    { id }

const { createPreviewEngine } = require("../layouts/framework/init.js");

// ── LRU Engine Cache ──────────────────────────────────────────────────────────
// Max simultaneous preview engines before oldest is evicted
const MAX_ENGINES = 5;

// Engine entries: { engine, layoutId, createdAt, lastUsed, configHash }
const _engineCache = new Map();

function _cacheKey(layoutId, configHash) {
  return `${layoutId}::${configHash || "default"}`;
}

function _hashConfig(config) {
  if (!config || !Object.keys(config).length) return "default";
  // Simple deterministic hash — not cryptographic
  return Buffer.from(JSON.stringify(config)).toString("base64").slice(0, 16);
}

async function _evictOldest() {
  if (_engineCache.size < MAX_ENGINES) return;

  let oldestKey = null;
  let oldestTime = Infinity;

  for (const [key, entry] of _engineCache) {
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed;
      oldestKey  = key;
    }
  }

  if (oldestKey) {
    const entry = _engineCache.get(oldestKey);
    try {
      await entry.engine.cleanup();
    } catch (_) {}
    _engineCache.delete(oldestKey);
    console.log(`[PreviewEngineManager] Evicted engine: ${oldestKey}`);
  }
}

// ── RENDER (primary entry point) ──────────────────────────────────────────────

/**
 * Render a URL using an isolated preview engine for the given layout.
 *
 * @param {object} acrx           - Global acrx context
 * @param {string} layoutId       - Layout folder name
 * @param {string} url            - URL to render (e.g. "/about")
 * @param {object} [configOverrides] - Live customizer config overrides
 * @param {object} [dataOverrides]   - Per-call data overlay (editor draft preview);
 *                                     passed through to engine.renderVirtual()
 * @returns {Promise<string>}     - Rendered HTML
 */
async function render(acrx, layoutId, url, configOverrides = null, dataOverrides = null) {
  const configHash = _hashConfig(configOverrides);
  const key        = _cacheKey(layoutId, configHash);

  // Touch existing engine
  if (_engineCache.has(key)) {
    const entry  = _engineCache.get(key);
    entry.lastUsed = Date.now();
    try {
      return await entry.engine.renderVirtual(url, {}, dataOverrides);
    } catch (err) {
      console.warn(`[PreviewEngineManager] Cached engine failed, rebuilding:`, err.message);
      await entry.engine.cleanup();
      _engineCache.delete(key);
    }
  }

  // Evict if at capacity
  await _evictOldest();

  // Create new preview engine
  const engine = await createPreviewEngine(acrx, layoutId, { configOverrides });

  _engineCache.set(key, {
    engine,
    layoutId,
    configHash,
    createdAt: Date.now(),
    lastUsed:  Date.now(),
  });

  return engine.renderVirtual(url, {}, dataOverrides);
}

// ── RELOAD (invalidate cache for a layout) ────────────────────────────────────

/**
 * Invalidate all cached engines for a layout and create a fresh one.
 * Called when layout files change or customizer config updates.
 */
async function reload(acrx, layoutId, configOverrides = null) {
  // Cleanup all engines for this layout
  for (const [key, entry] of _engineCache) {
    if (entry.layoutId === layoutId) {
      try { await entry.engine.cleanup(); } catch (_) {}
      _engineCache.delete(key);
    }
  }

  console.log(`[PreviewEngineManager] Reloaded: ${layoutId}`);

  // Pre-warm a fresh engine
  if (acrx) {
    await render(acrx, layoutId, "/", configOverrides);
  }
}

// ── CLEAR (cleanup all engines for a layout) ──────────────────────────────────

async function clear(layoutId) {
  for (const [key, entry] of _engineCache) {
    if (entry.layoutId === layoutId) {
      try { await entry.engine.cleanup(); } catch (_) {}
      _engineCache.delete(key);
    }
  }
  console.log(`[PreviewEngineManager] Cleared: ${layoutId}`);
}

// ── CLEAR ALL ─────────────────────────────────────────────────────────────────

async function clearAll() {
  for (const [key, entry] of _engineCache) {
    try { await entry.engine.cleanup(); } catch (_) {}
  }
  _engineCache.clear();
  console.log("[PreviewEngineManager] All engines cleared");
}

// ── STATUS ────────────────────────────────────────────────────────────────────

function status() {
  const engines = [];
  for (const [key, entry] of _engineCache) {
    engines.push({
      key,
      layoutId:   entry.layoutId,
      configHash: entry.configHash,
      createdAt:  entry.createdAt,
      lastUsed:   entry.lastUsed,
      age:        Math.round((Date.now() - entry.createdAt) / 1000) + "s",
    });
  }
  return { count: engines.length, max: MAX_ENGINES, engines };
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  render,
  reload,
  clear,
  clearAll,
  status,
};