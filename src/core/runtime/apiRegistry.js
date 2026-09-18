// src/core/runtime/apiRegistry.js
//
// Runtime-aware API registration layer around Express routing.
// Problem it solves: pluginAPI.registerRoute() used `_App[method](path, handler)`
// directly, so every reload duplicated routes with no removal path.
// Fix: entries live in a stable table; a single proxy router is mounted ONCE;
// rebuilds swap an inner router atomically (same pattern as loadRoutes.js).
//
// Entry: { id, method, path, owner, middleware[], handler, meta, createdAt }
//   id = `API:${owner}:${METHOD} ${path}` — duplicate registration updates
//   the entry in place instead of stacking another Express layer.

"use strict";

const registry = require("./registry");
const events = require("./events");

const entries = new Map(); // id -> entry
let proxyRouter = null;
let currentRouter = null;
let expressRef = null;
let mounted = false;

function _id(method, path, owner) {
  return `API:${owner || "core"}:${String(method || "get").toUpperCase()} ${path}`;
}

function _getExpress() {
  if (!expressRef) expressRef = require("express");
  return expressRef;
}

function _buildInner() {
  const express = _getExpress();
  const inner = express.Router();
  for (const e of entries.values()) {
    const m = String(e.method || "get").toLowerCase();
    const fn = inner[m] ? m : "use";
    try {
      if (e.middleware && e.middleware.length) inner[fn](e.path, ...e.middleware, e.handler);
      else inner[fn](e.path, e.handler);
    } catch (err) {
      console.error(`[apiRegistry] mount failed ${e.method.toUpperCase()} ${e.path}:`, err.message);
    }
  }
  return inner;
}

function _rebuild(reason = "register") {
  try {
    currentRouter = _buildInner();
    events.emit("api:registered", { reason, count: entries.size });
  } catch (err) {
    console.error("[apiRegistry] rebuild failed:", err.message);
  }
}

/**
 * Mount the proxy ONCE on the app. Idempotent. Must be called after setApp().
 * Plugin paths are absolute (/acrx/*) so the proxy mounts at "/".
 */
function ensureMounted(app) {
  if (mounted) return proxyRouter;
  if (!app || typeof app.use !== "function") throw new Error("[apiRegistry] ensureMounted requires an Express app");
  const express = _getExpress();
  proxyRouter = express.Router();
  currentRouter = _buildInner();
  proxyRouter.use((req, res, next) => {
    try {
      currentRouter.handle(req, res, next);
    } catch (err) {
      next(err);
    }
  });
  app.use("/", proxyRouter);
  mounted = true;
  return proxyRouter;
}

/**
 * Register an API/route entry. Duplicate id updates handler/metadata in place.
 * Returns a disposer that unregisters the entry and rebuilds the router.
 */
function register({ method = "get", path, handler, owner = "core", middleware = [], meta = {} } = {}) {
  if (!path || typeof handler !== "function") throw new Error("[apiRegistry] register requires { path, handler }");
  const m = String(method).toUpperCase();
  if (!/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|ALL)$/.test(m)) {
    throw new Error(`[apiRegistry] unsupported method "${method}"`);
  }
  if (!path.startsWith("/")) throw new Error(`[apiRegistry] path must be absolute, got "${path}"`);
  const id = _id(m, path, owner);
  const now = Date.now();
  const existing = entries.get(id);
  if (existing) {
    existing.handler = handler;
    existing.middleware = Array.isArray(middleware) ? [...middleware] : [];
    existing.meta = { ...existing.meta, ...meta, updatedAt: now };
    _rebuild("update");
    registry.mark(registry.makeId("api", owner, `${m} ${path}`), "active", { updatedAt: now });
    return () => unregister(id);
  }
  entries.set(id, {
    id, method: m, path, owner, handler,
    middleware: Array.isArray(middleware) ? [...middleware] : [],
    meta: { ...meta }, createdAt: now,
  });
  registry.register({
    type: "api", owner, name: `${m} ${path}`,
    meta: { method: m, path, ...meta },
    dispose: () => { unregister(id); },
  });
  _rebuild("register");
  return () => unregister(id);
}

function unregister(id) {
  const e = entries.get(id);
  if (!e) return false;
  entries.delete(id);
  try { registry.unregister(registry.makeId("api", e.owner, `${e.method} ${e.path}`)); } catch (_) {}
  _rebuild("unregister");
  events.emit("api:invalidated", { id });
  return true;
}

function unregisterRoute(method, path, owner = "core") {
  return unregister(_id(method, path, owner));
}

async function disposeOwner(owner) {
  let n = 0;
  for (const [id, e] of [...entries]) {
    if (e.owner === owner) {
      entries.delete(id);
      try { registry.unregister(registry.makeId("api", e.owner, `${e.method} ${e.path}`)); } catch (_) {}
      n++;
    }
  }
  if (n) _rebuild(`disposeOwner:${owner}`);
  await registry.disposeOwner(owner).catch(() => {});
  events.disposeOwner(owner);
  return n;
}

function list() {
  return [...entries.values()].map((e) => ({
    id: e.id, method: e.method, path: e.path, owner: e.owner,
    middlewareCount: (e.middleware || []).length, meta: { ...e.meta }, createdAt: e.createdAt,
  }));
}

function stats() {
  return { count: entries.size, mounted, routes: list().map((r) => `${r.method} ${r.path} [${r.owner}]`) };
}

module.exports = { ensureMounted, register, unregister, unregisterRoute, disposeOwner, list, stats };
