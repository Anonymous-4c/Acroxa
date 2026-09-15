// src/core/runtime/pipeline.js
// Change pipeline: Watcher -> ChangeManager -> Invalidation -> Graph ->
// Planner -> Transport -> Client. Watchers never touch the browser directly.

"use strict";

const path = require("path");
const owners = require("./owners");
const revision = require("./revision");
const graph = require("./graph");
const planner = require("./planner");
const perf = require("./perf");

function classify(file) {
  const norm = String(file || "").replace(/\\/g, "/");
  const lower = norm.toLowerCase();
  if (lower.endsWith(".css")) return { kind: "css", scope: "stylesheet" };
  if (lower.endsWith(".json") && norm.includes("/layouts/")) return { kind: "meta", scope: "layout" };
  if (norm.includes("/layouts/")) return { kind: "layout", scope: "layout" };
  if (norm.includes("/views/")) return { kind: "view", scope: "view" };
  if (norm.includes("/routes/")) return { kind: "route", scope: "module" };
  if (norm.includes("/controllers/") || norm.includes("/services/")) return { kind: "api", scope: "module" };
  if (norm.includes("acrx/assets/js")) return { kind: "frontend", scope: "component" };
  if (norm.includes("/core/") || norm.includes("/modules/") || norm.includes("/functions/")) return { kind: "backend", scope: "module" };
  if (lower.endsWith(".json") && (lower.includes("config") || lower.includes("paths"))) return { kind: "config", scope: "global" };
  if (norm.includes("/models/")) return { kind: "backend", scope: "module" };
  return { kind: "backend", scope: "module" };
}

/**
 * Full change handling. Returns { classification, owner, plan, invalidation }.
 * Side effects: revision bump + graph edge + cache invalidate + SSE broadcast
 * happen inside invalidate(); this function only orchestrates.
 */
function handleFileChange(file, { operation = "change" } = {}) {
  return perf.measure("pipeline", () => {
  const c = classify(file);
  const owner = owners.ownerOf(file);
  const resource = String(file);
  const plan = planner.choose({ kind: c.kind, scope: c.scope, resource, owner });
  let invalidation = null;
  // Config changes demand restart — broadcast intent, do not bump as applied.
  if (c.kind === "config") {
    try { require("../sseHub").broadcast("settings.updated", { file, kind: c.kind, restartRequired: true }); } catch (_) {}
    return { classification: c, owner, plan, invalidation: null, operation };
  }
  try {
    const inv = require("./invalidate");
    invalidation = inv.invalidate({
      type: c.kind, id: resource, scope: plan.strategy === "stylesheet-refresh" ? "stylesheet" : c.scope,
      reason: `${operation}:${path.basename(String(file))}`, strategy: plan.strategy,
    });
    plan.targets = invalidation.targets;
  } catch (err) {
    console.error("[pipeline] invalidate failed:", err.message);
  }
  // Structured dev log (never in production).
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Acroxa:RUNTIME] ${operation} ${path.basename(String(file))} → ${plan.strategy} (rev ${revision.get()})`);
  }
  return { classification: c, owner, plan, invalidation, operation };
  });
}

module.exports = { classify, handleFileChange };
