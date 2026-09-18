// src/AcroxaJS/contracts/lifecycle.js
// Frozen lifecycle vocabulary (Phase 1). Single source of truth for event
// names — reuses hookBus.KNOWN_HOOKS as the registry so server and client
// can never diverge. Extends it only with the §21 names hookBus lacks.

"use strict";

const hookBus = (() => {
  try {
    return require("../../core/runtime/hookBus");
  } catch (_) {
    return null;
  }
})();

// Canonical §21 lifecycle. Every name here must either exist in
// hookBus.KNOWN_HOOKS or be listed in EXTRA with a definition.
const LIFECYCLE_EVENTS = Object.freeze([
  "runtime:init",
  "runtime:ready",
  "runtime:error",
  "runtime:destroy",
  "route:before",
  "route:start",
  "route:resolve",
  "route:render",
  "route:after",
  "route:error",
  "layout:before-render",
  "layout:after-render",
  "layout:hydrate",
  "layout:update",
  "layout:destroy",
  "view:before-render",
  "view:after-render",
  "view:hydrate",
  "view:before-update",
  "view:after-update",
  "view:destroy",
  "boundary:mount",
  "boundary:before-update",
  "boundary:update",
  "boundary:after-update",
  "boundary:unmount",
  "dom:before-patch",
  "dom:after-patch",
  "dom:insert",
  "dom:remove",
  "data:request",
  "data:response",
  "data:error",
  "module:load",
  "module:ready",
  "module:invalidate",
  "module:dispose",
  "navigation:before",
  "navigation:start",
  "navigation:complete",
  "navigation:error",
  "update:detected",
  "update:started",
  "update:completed",
  "update:failed",
]);

function knownHooks() {
  if (hookBus && typeof hookBus.describe === "function") {
    try {
      return hookBus.describe();
    } catch (_) {
      return {};
    }
  }
  return {};
}

function isKnown(event) {
  if (LIFECYCLE_EVENTS.includes(event)) return true;
  const defs = knownHooks();
  if (defs && Object.prototype.hasOwnProperty.call(defs, event)) return true;
  // hookBus normalizes bare names; accept render:/page: aliases too
  if (hookBus && typeof hookBus.normalizeName === "function") {
    try {
      const n = hookBus.normalizeName(event);
      if (LIFECYCLE_EVENTS.includes(n)) return true;
      if (defs && Object.prototype.hasOwnProperty.call(defs, n)) return true;
    } catch (_) {}
  }
  return false;
}

module.exports = { LIFECYCLE_EVENTS, knownHooks, isKnown };
