// src/AcroxaJS/contracts/manifest.js
// Frozen manifest contract (Phase 1). The manifest is the coordination
// document for client/server agreement: versions, routes, capabilities.
// Built ONLY from live runtime state — no invented entries.

"use strict";

const RUNTIME_VERSION = "0.2.0";
const RUNTIME_ENDPOINTS = Object.freeze({
  rc: "/acr/api/runtime/rc",
  rr: "/acr/api/runtime/rr",
  rt: "/acr/api/runtime/rt",
  legacy: Object.freeze({
    targetPlan: "/acr/api/runtime/target-plan",
    fragment: "/acr/api/runtime/fragment",
    invalidate: "/acr/api/runtime/invalidate",
  }),
});

function safe(fn, fallback) {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function build({ includeRoutes = true } = {}) {
  const revision = safe(() => require("../../core/runtime/revision").snapshot(), { rev: 0, bootId: null, last: null });
  const registry = safe(() => require("../../core/runtime/registry").stats(), { total: 0, byType: {}, byOwner: {} });
  const graph = safe(() => require("../../core/runtime/graph").stats(), { resources: 0, edges: 0 });
  const capabilities = safe(() => Object.keys(require("../../core/runtime/hookBus").describe()), []);
  const extensions = safe(() => require("../../core/runtime/extensions").stats(), { total: 0, enabled: 0, conflicts: 0 });

  let routes = [];
  if (includeRoutes) {
    routes = safe(() => {
      const pages = require("../../routes/pages");
      const list = typeof pages.getPages === "function" ? pages.getPages() : [];
      return list
        .filter((p) => p && typeof p.path === "string")
        .map((p) => ({ path: p.path, title: p.title || null, layout: p.layout || null, public: p.public === true }));
    }, []);
  }

  const manifest = {
    kind: "acroxajs-manifest",
    runtimeVersion: RUNTIME_VERSION,
    rev: revision.rev || 0,
    bootId: revision.bootId || null,
    generation: revision.rev || 0,
    at: Date.now(),
    routes,
    registry,
    graph,
    extensions,
    endpoints: { ...RUNTIME_ENDPOINTS },
    transports: [{ name: "sse", url: "/acr/api/runtime/sse" }, { name: "poll", url: "/acr/api/runtime/sync" }],
    capabilities: capabilities.slice(0, 200),
  };
  const { ok, errors } = validate(manifest);
  if (!ok) throw new Error(`[manifest] built invalid manifest: ${errors.join("; ")}`);
  return manifest;
}

function validate(m) {
  const errors = [];
  if (!m || typeof m !== "object") return { ok: false, errors: ["manifest must be an object"] };
  if (m.kind !== "acroxajs-manifest") errors.push("kind must be acroxajs-manifest");
  if (typeof m.runtimeVersion !== "string" || !m.runtimeVersion) errors.push("runtimeVersion required");
  if (!Number.isInteger(m.rev) || m.rev < 0) errors.push("rev must be a non-negative integer");
  if (m.bootId !== null && m.bootId !== undefined && typeof m.bootId !== "string")
    errors.push("bootId must be a string");
  if (!Array.isArray(m.routes)) errors.push("routes must be an array");
  if (!Array.isArray(m.capabilities)) errors.push("capabilities must be an array");
  if (typeof m.at !== "number" || !Number.isFinite(m.at)) errors.push("at must be a timestamp");
  return { ok: errors.length === 0, errors };
}

// Client-side gate: returns { ok:true } when the client may proceed, or
// { ok:false, reason } when it must resync / controlled-reload.
function checkCompatible(manifest, client) {
  if (!manifest || !client) return { ok: false, reason: "missing manifest or client state" };
  if (manifest.bootId && client.bootId && manifest.bootId !== client.bootId)
    return { ok: false, reason: "bootId mismatch — server restarted, resync required", action: "resync" };
  if (Number.isInteger(manifest.rev) && Number.isInteger(client.v) && manifest.rev < client.v)
    return { ok: false, reason: "server rev older than client — possible rollback", action: "resync" };
  const [maj] = String(manifest.runtimeVersion || "").split(".");
  const [cmaj] = String(client.runtimeVersion || "").split(".");
  if (maj && cmaj && maj !== cmaj)
    return { ok: false, reason: "runtime major mismatch", action: "reload" };
  return { ok: true };
}

module.exports = { RUNTIME_VERSION, RUNTIME_ENDPOINTS, build, validate, checkCompatible };
