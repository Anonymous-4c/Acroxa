// src/layouts/framework/init.js
//
// Layout lifecycle manager.
// Handles: startup boot, hot layout switching, preview engine creation,
// engine cleanup, and layout helper state sync.

const LayoutEngine = require("./layoutEngine.js");
const publicAPI    = require("../../core/publicAPI.js");
const Layout       = require("../../core/layoutHelpers.js");
const { ensureLayoutReady } = require("../../services/layoutService.js");

// ── BOOT: initialize active layout on server start ────────────────────────────

async function bootLayout(acrx) {
  const activeId = Layout.getActiveLayout();

  if (!activeId) {
    console.log("[LayoutInit] No active layout set — skipping boot");
    return;
  }

  try {
    await initializeLayout(acrx, activeId);
    console.log(`[LayoutInit] ✅ Boot complete: ${activeId}`);
  } catch (err) {
    console.error(`[LayoutInit] ❌ Boot failed for ${activeId}:`, err.message);
  }
}

// ── INITIALIZE LAYOUT (switch or first-time activation) ──────────────────────

async function initializeLayout(acrx, layoutId) {
  // Guard: if called without an explicit layoutId (e.g. from hot-reloader
  // calling initializeLayout(acrx) with no second arg), fall back to the
  // persisted active layout so we never crash with "path must be string".
  if (!layoutId) {
    layoutId = Layout.getActiveLayout();
  }
  if (!layoutId) {
    console.warn("[LayoutInit] initializeLayout() called with no layoutId and no active layout saved — skipping.");
    return null;
  }

  console.log(`[LayoutInit] Switching to layout: ${layoutId}`);

  // 1. Ensure layout config in DB is up to date with meta.json schema
  const meta = await ensureLayoutReady(layoutId);

  // 2. Clean up the current live engine
  const currentEngine = publicAPI.getLiveEngine();
  if (currentEngine) {
    await currentEngine.cleanup();
  }

  // 3. Create and initialize the new live engine
  const newEngine = new LayoutEngine(acrx, layoutId, { context: "live" });
  await newEngine.initialize();

  // 4. Atomically swap into the live slot
  publicAPI.setLiveEngine(newEngine);

  // 5. Update layout helpers state + persist to disk
  Layout.setActiveLayout(layoutId, meta);

  console.log(`[LayoutInit] ✅ Live engine active: ${layoutId}`);
  return newEngine;
}

// ── CREATE PREVIEW ENGINE ─────────────────────────────────────────────────────
// Returns an isolated LayoutEngine instance for a given layout id.
// Preview engines are NOT mounted as catch-all; they render via renderVirtual().

async function createPreviewEngine(acrx, layoutId, options = {}) {
  console.log(`[LayoutInit] Creating preview engine: ${layoutId}`);

  const engine = new LayoutEngine(acrx, layoutId, {
    context:         "preview",
    isolated:        true,
    configOverrides: options.configOverrides || null,
  });

  await engine.initialize();

  console.log(`[LayoutInit] ✅ Preview engine ready: ${layoutId}`);
  return engine;
}

// ── CREATE ISOLATED ENGINE (for virtual/customizer rendering) ─────────────────

async function createIsolatedEngine(acrx, layoutId, options = {}) {
  const engine = new LayoutEngine(acrx, layoutId, {
    context:         options.context || "virtual",
    isolated:        true,
    configOverrides: options.configOverrides || null,
  });
  await engine.initialize();
  return engine;
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  bootLayout,
  initializeLayout,
  createPreviewEngine,
  createIsolatedEngine,
};