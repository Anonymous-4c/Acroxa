// src/core/publicAPI.js
//
// Single catch-all proxy for public frontend rendering.
// Admin routes (/acrx/*) are explicitly excluded and fall through
// to the Express admin router as normal.

const express = require("express");

// Persistent proxy router — mounted ONCE on app, never removed.
// Hot layout swaps only replace _liveEngine, no Express stack mutation.
let proxyRouter  = express.Router();
let proxyMounted = false;

// Active engine references
let _liveEngine    = null;
let _previewEngine = null;

// Maintenance mode check (imported lazily to avoid circular deps)
let _maintenanceFn = null;
function _isMaintenanceMode() {
  if (!_maintenanceFn) {
    try {
      const { getSettingsCached } = require("../middlewares/authMiddleware.js");
      _maintenanceFn = async () => {
        const settings = await getSettingsCached();
        return settings?.system?.maintenanceMode === true;
      };
    } catch (_) {
      _maintenanceFn = async () => false;
    }
  }
  return _maintenanceFn();
}

// Maintenance page (inline, no external deps)
function _renderMaintenancePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maintenance Mode · Acroxa CMS</title>
  <link rel="stylesheet" href="/acrx/assets/css/root.css">
  <link rel="stylesheet" href="/acrx/assets/css/all.css">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: var(--color-primary-100); font-family: 'Outfit', system-ui, sans-serif; padding: 2rem;
    }
    .card {
      max-width: 480px; width: 100%; text-align: center;
      background: linear-gradient(135deg, var(--accent-100) 0%, var(--color-primary-200) 100%);
      border-radius: 20px; padding: 3rem 2rem;
      border: 1px solid var(--color-primary-300); box-shadow: 0 12px 40px rgba(0,0,0,0.08);
    }
    .icon { width: 72px; height: 72px; margin: 0 auto 1.5rem; background: var(--accent-500);
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 32px; color: #fff; }
    h1 { font-size: 1.6rem; font-weight: 700; color: var(--color-primary-800); margin-bottom: 0.5rem; }
    p { font-size: 0.95rem; color: var(--color-primary-600); line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon"><i class="fa-solid fa-wrench"></i></div>
    <h1>We'll Be Right Back</h1>
    <p>This site is currently undergoing scheduled maintenance. Please check back soon.</p>
  </div>
</body>
</html>`;
}

function setApp(app) {
  if (proxyMounted) return;

  // IMPORTANT: /acrx/* is the admin namespace.
  // Always call next() for those so your admin router handles them.
  // Only non-/acrx requests go to the layout engine.
  proxyRouter.use("/", async (req, res, next) => {
    if (req.path.startsWith("/acrx/") || req.path === "/acrx" || req.path.startsWith("/acroxa/") || req.path.startsWith("/acr/api/")) {
      return next();
    }

    // Maintenance mode: only block public-facing routes
    try {
      if (await _isMaintenanceMode()) {
        return res.status(503).send(_renderMaintenancePage());
      }
    } catch (_) {}

    if (_liveEngine) {
      return _liveEngine.handle(req, res);
    }

    // No engine yet (first boot) — friendly placeholder
    return res.status(503).send(_noEnginePage());
  });

  app.use("/", proxyRouter);
  proxyMounted = true;

  console.log("[publicAPI] Catch-all proxy mounted (admin /acrx/* excluded)");
}

// Engine setters
function setLiveEngine(engine) {
  _liveEngine = engine;
  console.log(`[publicAPI] Live engine set: ${engine?.layoutName || "none"}`);
}

function getLiveEngine() {
  return _liveEngine;
}

function setPreviewEngine(engine) {
  _previewEngine = engine;
}

function getPreviewEngine() {
  return _previewEngine;
}

// Legacy compat stubs — old code may call these; they are safe no-ops now.
function registerPublicRoute({ path, method = "get", handler, plugin = "core" } = {}) {
  console.warn(
    `[publicAPI] registerPublicRoute() is deprecated and ignored.` +
    ` Route "${method.toUpperCase()} ${path}" from plugin "${plugin}" will not be registered.` +
    ` Routing is now owned by RouteResolver inside LayoutEngine.handle().`
  );
}

function clearLayoutRoutes(plugin) {
  console.log(`[publicAPI] clearLayoutRoutes("${plugin}") — no-op in new arch`);
}

const publicRegistered = [];

function _noEnginePage() {
  return `<!DOCTYPE html><html><head><title>Starting up...</title>
<style>body{font-family:monospace;background:#0a0a14;color:#ccc;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0;}
h2{color:#00f0ff;}p{opacity:.6;}</style></head>
<body><div><h2>Acroxa CMS</h2><p>Layout engine initializing...</p></div></body></html>`;
}

module.exports = {
  setApp,
  setLiveEngine,
  getLiveEngine,
  setPreviewEngine,
  getPreviewEngine,
  registerPublicRoute,
  clearLayoutRoutes,
  publicRegistered,
};