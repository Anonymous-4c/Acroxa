// src/core/runtime/revision.js
// Monotonic runtime revision — answers "is the browser looking at rev 17
// while the server is at rev 18?" Survives hot-reload via global slot,
// resets only on process restart (bootId changes).

"use strict";

const GLOBAL_KEY = "__acroxa_runtime_rev__";

function _slot() {
  if (!global[GLOBAL_KEY]) {
    global[GLOBAL_KEY] = { rev: 0, bootId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, history: [] };
  }
  return global[GLOBAL_KEY];
}

function get() {
  return _slot().rev;
}

function bootId() {
  return _slot().bootId;
}

/**
 * Bump the global revision. Returns the new rev.
 * reason: short string (e.g. "layout:rainfall_grove", "route:api").
 * scope: invalidation scope (global|layout|view|widget|...).
 */
function bump(reason = "unknown", scope = "global") {
  const s = _slot();
  s.rev += 1;
  s.history.push({ rev: s.rev, reason: String(reason), scope: String(scope), at: Date.now() });
  if (s.history.length > 50) s.history.splice(0, s.history.length - 50);
  return s.rev;
}

function last() {
  const s = _slot();
  return s.history.length ? s.history[s.history.length - 1] : null;
}

function snapshot() {
  const s = _slot();
  return { rev: s.rev, bootId: s.bootId, last: last() };
}

module.exports = { get, bootId, bump, last, snapshot };
