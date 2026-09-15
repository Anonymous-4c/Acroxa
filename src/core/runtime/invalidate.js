// src/core/runtime/invalidate.js
// Explicit invalidation protocol. Invalidation = "your representation may be
// stale". Update (fragment payload) is a separate step via render endpoints.
// Payload: { v, bootId, type, id, scope, reason, targets, strategy, at }

"use strict";

const revision = require("./revision");
const graph = require("./graph");
const perf = require("./perf");

const VALID_SCOPES = new Set([
  "global", "application", "page", "layout", "view", "widget",
  "component", "element", "asset", "stylesheet", "module",
]);

function _scope(s) {
  const v = String(s || "global").toLowerCase();
  return VALID_SCOPES.has(v) ? v : "global";
}

/**
 * Invalidate a resource. Bumps global rev, walks dependents, emits events,
 * invalidates cache deps, broadcasts SSE. Returns the invalidation object.
 */
function invalidate({ type = "module", id = null, scope = "global", reason = "source-change", targets = [], strategy = null } = {}) {
  if (!id) throw new Error("[invalidate] id required");
  return perf.measure("invalidate", () => {
  const rev = revision.bump(`${type}:${id}`, _scope(scope));
  const bootId = revision.bootId();
  const affected = graph.affectedBy(id).slice(0, 100);
  const inv = {
    v: rev,
    bootId,
    type: String(type),
    id: String(id),
    scope: _scope(scope),
    reason: String(reason),
    targets: Array.isArray(targets) && targets.length ? [...targets] : affected,
    strategy: strategy || null,
    at: Date.now(),
  };
  // Runtime events (namespaced) — never throws.
  try { require("./events").emit("runtime:invalidated", inv); } catch (_) {}
  // Hook fan-out (filter-capable listeners).
  try { require("./hookBus").run("runtime:invalidated", inv, { scope: inv.scope }); } catch (_) {}
  // Dependency-aware cache invalidation (best effort).
  try {
    const cache = require("./cache");
    cache.invalidate(id);
    cache.invalidate(`${type}:*`);
  } catch (_) {}
  // SSE broadcast (one-way runtime signal).
  try { require("../sseHub").broadcast("runtime.invalidated", inv); } catch (_) {}
  // Legacy compat: keep old customizer/activity channels working.
  try {
    const sse = require("../sseHub");
    if (inv.scope === "stylesheet" || inv.scope === "asset") sse.broadcast("layout.updated", inv);
    else if (type === "view" || type === "page") sse.broadcast("page.updated", inv);
    else sse.broadcast("layout.updated", inv);
  } catch (_) {}
  return inv;
  });
}

/**
 * Bundle N related changes into one coherent invalidation (no 10x DOM churn).
 * changes: [{ type, id, scope, reason }]
 */
function bundle(changes = [], { reason = "batch", scope = "global" } = {}) {
  const list = (Array.isArray(changes) ? changes : []).filter(Boolean);
  if (!list.length) throw new Error("[invalidate] bundle requires at least one change");
  return perf.measure("invalidate-bundle", () => {
  const rev = revision.bump(`bundle:${list.length}`, _scope(scope));
  const bootId = revision.bootId();
  const targets = [];
  for (const c of list) {
    if (c.id) {
      targets.push(String(c.id));
      for (const a of graph.affectedBy(String(c.id)).slice(0, 50)) targets.push(a);
    }
  }
  const inv = {
    v: rev, bootId, type: "bundle", id: `bundle:${rev}`,
    scope: _scope(scope), reason: String(reason),
    targets: [...new Set(targets)].slice(0, 200),
    changes: list.map((c) => ({ type: c.type || "module", id: String(c.id || ""), scope: _scope(c.scope || scope) })),
    at: Date.now(),
  };
  try { require("./events").emit("runtime:invalidated", inv); } catch (_) {}
  try { require("../sseHub").broadcast("runtime.invalidated", inv); } catch (_) {}
  return inv;
  });
}

module.exports = { invalidate, bundle, VALID_SCOPES };
