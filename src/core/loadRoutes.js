// src/core/loadRoutes.js
//
// Router Proxy Pattern — hot-reloadable without server restart.
//
// How it works:
//   1. A single "proxy router" is created ONCE and mounted in api.js.
//   2. On every request, the proxy delegates to `currentRouter` (an inner router).
//   3. When reloadRoutes() is called, `currentRouter` is swapped atomically.
//   4. No routes are ever re-mounted on the outer proxy — zero duplicates.

const fs   = require("fs");
const path = require("path");
const express = require("express");

const { verifyAPIToken } = require("../middlewares/authMiddleware");

const routesDir = path.join(__dirname, "../routes");

// ─── Require-cache utilities ───────────────────────────────────────────────

/**
 * Recursively clear a module and all its children from require.cache.
 * Bounded to routesDir to avoid nuking node_modules or core framework files.
 */
function clearModuleCache(filePath, visited = new Set()) {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  const mod = require.cache[filePath];
  if (!mod) return;

  // Only recurse into children that live inside our routes directory
  mod.children.forEach(child => {
    if (child.filename.startsWith(routesDir)) {
      clearModuleCache(child.filename, visited);
    }
  });

  delete require.cache[filePath];
}

// ─── Route-file metadata helpers ──────────────────────────────────────────

function getRouteFiles() {
  return fs
    .readdirSync(routesDir)
    .filter(
      file =>
        file.endsWith("Routes.js") &&
        file !== "index.js" &&
        !file.startsWith(".")
    );
}

function resolveMount(file) {
  // Determine mount prefix and middleware for a given route file.
  // Auth / CMS routes always sit at root; media gets /media.
  if (file === "authRoutes.js" || file === "cmsRoutes.js") {
    return { prefix: "/", middleware: [] };
  }
  if (file === "mediaRoutes.js") {
    return { prefix: "/media", middleware: [verifyAPIToken] };
  }

  // For all other route files, respect an exported PREFIX; default to "/"
  // We peek at the cached module (if available) or require it fresh.
  let routeModule;
  try {
    routeModule = require(path.join(routesDir, file));
  } catch {
    return { prefix: "/", middleware: [verifyAPIToken] };
  }

  const prefix = routeModule.PREFIX || "/";
  const middleware = prefix !== "/" ? [verifyAPIToken] : [];
  return { prefix, middleware };
}

// ─── Inner-router builder ──────────────────────────────────────────────────

function buildInnerRouter() {
  const innerRouter = express.Router();
  const files = getRouteFiles();

  console.log("[Routes] Building inner router…\n");

  files.forEach(file => {
    const filePath = path.join(routesDir, file);
    // Always clear cache so we get a fresh module on rebuild
    clearModuleCache(filePath);

    try {
      const routeModule = require(filePath);
      const { prefix, middleware } = resolveMount(file);

      if (middleware.length > 0) {
        innerRouter.use(prefix, ...middleware, routeModule);
      } else {
        innerRouter.use(prefix, routeModule);
      }

      console.log(`[Routes] Mounted → ${prefix.padEnd(12)} (${file})`);
          console.log(`[Routes] Mounting ${file} → ${prefix} (middleware: ${middleware.length})`);

    } catch (err) {
      // A broken route file must never bring down the whole router.
      console.error(`[Routes] ✗ Failed to load ${file}:`, err.message);
    }
  });

  console.log("\n[Routes] Inner router built.\n");
  return innerRouter;
}

// ─── Proxy router (mounted ONCE in api.js) ────────────────────────────────

let currentRouter = buildInnerRouter();

/**
 * The proxy router delegates every request to the currently active
 * inner router. Swapping `currentRouter` is the only thing reload does.
 */
const proxyRouter = express.Router();

proxyRouter.use((req, res, next) => {
  // Delegate to the live inner router.
  // Using .handle() lets us pass `next` so unmatched requests fall through.
  currentRouter.handle(req, res, next);
});

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Hot-reload all route files.
 * Safe to call at runtime (e.g. from an admin endpoint).
 * Returns a summary of what was loaded.
 */
function reloadRoutes() {
  console.log("[Routes] Hot-reload triggered…");

  try {
    const newRouter = buildInnerRouter();
    currentRouter = newRouter; // Atomic swap — in-flight requests finish normally
    console.log("[Routes] Hot-reload complete.");
    return { success: true, timestamp: new Date().toISOString() };
  } catch (err) {
    console.error("[Routes] Hot-reload failed:", err.message);
    return { success: false, error: err.message, timestamp: new Date().toISOString() };
  }
}

/**
 * Returns the proxy router. Call this ONCE in api.js.
 * Subsequent reloads update the inner router automatically.
 */
function loadRoutes() {
  return proxyRouter;
}

module.exports = { loadRoutes, reloadRoutes };