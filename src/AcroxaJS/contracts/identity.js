// src/AcroxaJS/contracts/identity.js
// Frozen identity contract (Phase 1). Thin, real layer over
// src/core/runtime/identity.js — adds boundary-level vocabulary and
// DOM serialization. No new ID scheme: same `type:owner:key` space so
// server render <-> registry <-> client DOM <-> invalidation agree.
//
// Levels (smallest → largest): element < component < boundary < widget <
// module < view < layout < route. See update-protocol.js SCOPE_RANK.

"use strict";

const base = require("../../core/runtime/identity");

const LEVELS = Object.freeze([
  "element",
  "component",
  "boundary",
  "widget",
  "module",
  "view",
  "layout",
  "route",
]);

function isLevel(t) {
  return LEVELS.includes(String(t || "").toLowerCase());
}

function escapeAttrValue(v) {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Deterministic boundary id. Same inputs → same id, no randoms.
// e.g. boundaryId("dashboard", "stats") → "boundary:core:dashboard.stats"
function boundaryId(owner, ...parts) {
  const key = parts.filter(Boolean).join(".") || "default";
  return base.makeTargetId("boundary", owner || "core", key);
}

function elementId(owner, boundary, element) {
  const key = [boundary, element].filter(Boolean).join(".") || "default";
  return base.makeTargetId("element", owner || "core", key);
}

function parse(id) {
  return base.parseTargetId(id);
}

function isValid(id) {
  return base.isValidTargetId(id);
}

// Serialize data-acrx-* attrs for server HTML. Compact metadata only.
function toAttrs(type, owner, key, opts) {
  return base.targetAttrs(type, owner, key, opts);
}

function attrsString(type, owner, key, opts) {
  const attrs = toAttrs(type, owner, key, opts);
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeAttrValue(v)}"`)
    .join(" ");
}

module.exports = {
  LEVELS,
  isLevel,
  boundaryId,
  elementId,
  parse,
  isValid,
  toAttrs,
  attrsString,
  // re-exports so callers never import two identity modules
  makeTargetId: base.makeTargetId,
  parseTargetId: base.parseTargetId,
  isValidTargetId: base.isValidTargetId,
  targetAttrs: base.targetAttrs,
};
