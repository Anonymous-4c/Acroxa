// src/AcroxaJS/contracts/runtime-contracts.js
// Frozen RC/RR/RT contracts (AcroxaJS v2). Versioned aliases over the proven
// pipeline: RC=check (pipeline+planner+graph), RR=render (fragment/target),
// RT=trigger (invalidate + browser apply). Both transports (legacy
// target-plan/fragment/invalidate and new rc/rr/rt) share these validators
// so frontend and backend never depend on undocumented shapes.
//
// RC request  { target?, changedFile?, kind?, scope? }
// RC response { ok, action, strategy, affected[], why[], needsHydration,
//               needsModuleReload, generation, rev, bootId }
// RR request  { target?, type?, node?, doc?, template?, params? }
// RR response { ok, boundary, html, rev, bootId, generation, verify{hash,bytes},
//               assets{js,css}, hydrate, strategy }
// RT request  { op, target?, generation?, payload? }
// RT response { ok, op, target, generation, rev, bootId, applied, reason }
// op ∈ patch|replace|insert|remove|module-update|module-reload|hydrate|
//      style-update|controlled-refresh|full-refresh|rollback|error

"use strict";

const proto = require("./update-protocol");
const identity = require("./identity");

const RC_VERSION = "rc/1";
const RR_VERSION = "rr/1";
const RT_VERSION = "rt/1";

const RC_ACTIONS = new Set([
  "NOOP", "PATCH", "REPLACE", "INSERT", "REMOVE", "REHYDRATE",
  "MODULE_UPDATE", "MODULE_RELOAD", "STYLE_UPDATE", "ASSET_UPDATE",
  "VIEW_UPDATE", "EXTENSION_UPDATE", "FULL_REFRESH", "ERROR",
]);

const RT_OPS = new Set([
  "patch", "replace", "insert", "remove",
  "module-update", "module-reload", "hydrate",
  "style-update", "controlled-refresh", "full-refresh",
  "rollback", "error",
]);

const CORE_TYPES = new Set(["core", "system"]);
const CRITICAL_BOUNDARIES = new Set([
  "core:bootstrap", "core:runtime-root", "core:layout-engine",
  "core:transport", "core:auth",
]);

function _str(v, max) {
  if (typeof v !== "string") return null;
  if (!v.length || v.length > max) return null;
  return v;
}

function validateRcRequest(body) {
  const errors = [];
  if (!body || typeof body !== "object") return { ok: false, errors: ["body must be an object"] };
  const hasTarget = typeof body.target === "string" && body.target.length > 0;
  const hasFile = typeof body.changedFile === "string" && body.changedFile.length > 0
    || typeof body.file === "string" && body.file.length > 0;
  if (!hasTarget && !hasFile) errors.push("target or changedFile required");
  if (hasTarget && body.target.length > 192) errors.push("target too long");
  const file = body.changedFile || body.file;
  if (file !== undefined && file !== null && (typeof file !== "string" || file.length > 1024))
    errors.push("changedFile too long");
  return { ok: errors.length === 0, errors };
}

function validateRcResponse(res) {
  const errors = [];
  if (!res || typeof res !== "object") return { ok: false, errors: ["response must be an object"] };
  if (!RC_ACTIONS.has(res.action)) errors.push(`unknown action: ${res.action}`);
  if (!Array.isArray(res.affected)) errors.push("affected must be an array");
  if (!Array.isArray(res.why)) errors.push("why must be an array of reasons");
  if (Array.isArray(res.why) && !res.why.length) errors.push("why must explain the decision (non-empty)");
  if (!Number.isInteger(res.rev) || res.rev < 0) errors.push("rev must be a non-negative integer");
  return { ok: errors.length === 0, errors };
}

function validateRrRequest(body) {
  const errors = [];
  if (!body || typeof body !== "object") return { ok: false, errors: ["body must be an object"] };
  const t = body.target !== undefined ? body.target : body.boundary;
  if (t !== undefined && (typeof t !== "string" || t.length < 3 || t.length > 192))
    errors.push("target must be a string 3..192 chars");
  if (body.type !== undefined && typeof body.type !== "string") errors.push("type must be a string");
  return { ok: errors.length === 0, errors };
}

function validateRrResponse(res) {
  const errors = [];
  if (!res || typeof res !== "object") return { ok: false, errors: ["response must be an object"] };
  if (typeof res.html !== "string" || !res.html.length) errors.push("html must be a non-empty string");
  if (!Number.isInteger(res.rev) || res.rev < 0) errors.push("rev required");
  if (!res.verify || typeof res.verify.hash !== "string") errors.push("verify.hash required");
  return { ok: errors.length === 0, errors };
}

function validateRtRequest(body) {
  const errors = [];
  if (!body || typeof body !== "object") return { ok: false, errors: ["body must be an object"] };
  if (typeof body.op !== "string" || !RT_OPS.has(body.op.toLowerCase()))
    errors.push(`unknown op: ${body && body.op}`);
  if (body.target !== undefined && body.target !== null &&
      (typeof body.target !== "string" || body.target.length > 192))
    errors.push("target too long");
  if (body.generation !== undefined && body.generation !== null &&
      (!Number.isInteger(body.generation) || body.generation < 0))
    errors.push("generation must be a non-negative integer");
  return { ok: errors.length === 0, errors };
}

// Map planner strategy → RC action (smallest safe unit; safety > minimality).
function strategyToAction(strategy, { critical = false } = {}) {
  if (critical) return "FULL_REFRESH";
  switch (String(strategy || "")) {
    case "noop": return "NOOP";
    case "state-update":
    case "attribute-update":
    case "text-update": return "PATCH";
    case "fragment-replace": return "REPLACE";
    case "subtree-reconcile": return "REHYDRATE";
    case "rehydrate": return "REHYDRATE";
    case "module-reload": return "MODULE_RELOAD";
    case "stylesheet-refresh": return "STYLE_UPDATE";
    case "navigation": return "VIEW_UPDATE";
    case "eject-inject": return "MODULE_UPDATE";
    case "rerender": return "PATCH";
    case "full-reload": return "FULL_REFRESH";
    default: return "REPLACE";
  }
}

// Safety escalation ladder (index = severity). Never step down on failure.
const ESCALATION = Object.freeze([
  "NOOP", "PATCH", "REPLACE", "REHYDRATE",
  "MODULE_UPDATE", "MODULE_RELOAD", "FULL_REFRESH",
]);

function escalate(action) {
  const i = ESCALATION.indexOf(String(action || "NOOP").toUpperCase());
  if (i === -1) return "FULL_REFRESH";
  return ESCALATION[Math.min(i + 1, ESCALATION.length - 1)];
}

function isCriticalBoundary(id) {
  if (!id || typeof id !== "string") return false;
  if (CRITICAL_BOUNDARIES.has(id)) return true;
  const parsed = identity.parse(id);
  if (!parsed) return false;
  return CORE_TYPES.has(String(parsed.type || "").toLowerCase()) &&
    /bootstrap|runtime-root|layout-engine|transport|auth/i.test(parsed.key || "");
}

module.exports = {
  RC_VERSION, RR_VERSION, RT_VERSION,
  RC_ACTIONS, RT_OPS, ESCALATION, CRITICAL_BOUNDARIES,
  validateRcRequest, validateRcResponse,
  validateRrRequest, validateRrResponse,
  validateRtRequest,
  strategyToAction, escalate, isCriticalBoundary,
};
