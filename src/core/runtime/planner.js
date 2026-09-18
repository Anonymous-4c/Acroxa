// src/core/runtime/planner.js
// Update planner — chooses the smallest safe strategy for a change.
// Strategies: noop|stylesheet-refresh|rehydrate|fragment-replace|
// subtree-reconcile|module-reload|navigation|full-reload

"use strict";

const STRATEGIES = new Set([
  "noop",
  "state-update",
  "attribute-update",
  "text-update",
  "fragment-replace",
  "subtree-reconcile",
  "rehydrate",
  "module-reload",
  "stylesheet-refresh",
  "navigation",
  "full-reload",
]);

/**
 * Choose a strategy from a classified change.
 * { kind, scope, resource, owner } -> { strategy, reason, targets }
 */
function choose({ kind = "backend", scope = "generic", resource = null, owner = null } = {}) {
  switch (kind) {
    case "css":
      return { strategy: "stylesheet-refresh", reason: "stylesheet changed — swap link href, no DOM churn", targets: resource ? [resource] : [], scope };
    case "frontend":
      return { strategy: "rehydrate", reason: "frontend module changed — dispose + rehydrate affected roots", targets: resource ? [resource] : [], scope };
    case "view":
      return { strategy: "fragment-replace", reason: "view changed — regenerate affected fragments", targets: resource ? [resource] : [], scope };
    case "layout":
    case "meta":
      return { strategy: "subtree-reconcile", reason: "layout changed — reconcile dependent pages", targets: resource ? [resource] : [], scope };
    case "extension":
      return { strategy: "module-reload", reason: `extension ${owner || resource || "unknown"} changed — dispose owner scope, rehydrate affected boundaries`, targets: resource ? [resource] : [], scope };
    case "route":
    case "api":
      return { strategy: "module-reload", reason: "route/api reloaded atomically — clients keep state, new requests use new impl", targets: [], scope };
    case "config":
      return { strategy: "full-reload", reason: "process-level dependency changed (config shapes DB/auth/paths)", targets: [], scope };
    default:
      return { strategy: "module-reload", reason: `backend ${scope} reloaded (scoped require.cache)`, targets: [], scope };
  }
}

function isFullReload(plan) {
  return plan && plan.strategy === "full-reload";
}

module.exports = { STRATEGIES, choose, isFullReload };
