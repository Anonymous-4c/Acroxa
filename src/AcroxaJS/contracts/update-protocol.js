// src/AcroxaJS/contracts/update-protocol.js
// Frozen server→client update protocol (Phase 1). Validates, versions and
// orders the messages invalidate.js already broadcasts — adds the missing
// pieces: scope hierarchy (smallest safe scope), staleness guard, and a
// single validate() gate both transports use.
//
// Message shape (extends invalidate.js payload):
//   { v, bootId, type, id, scope, reason, targets, strategy, seq, at }

"use strict";

const VALID_TYPES = new Set([
  "data",
  "element",
  "boundary",
  "component",
  "module",
  "view",
  "layout",
  "route",
  "style",
  "script",
  "asset",
  "invalidation",
  "manifest",
  "full-reload",
  "error",
  // legacy wire names still broadcast by invalidate.js / hot-reloader
  "widget",
  "page",
  "api",
  "stylesheet",
  "bundle",
]);

const VALID_SCOPES = new Set([
  "global",
  "application",
  "route",
  "layout",
  "view",
  "module",
  "boundary",
  "component",
  "widget",
  "element",
  "asset",
  "stylesheet",
  "page",
]);

// Smallest → largest. The runtime must pick the smallest scope that can
// safely represent a change; full-reload is last resort, never default.
const SCOPE_RANK = Object.freeze({
  element: 0,
  component: 1,
  boundary: 2,
  widget: 3,
  module: 4,
  view: 5,
  page: 5,
  layout: 6,
  route: 7,
  application: 8,
  asset: 4,
  stylesheet: 4,
  global: 9,
});

function normalizeScope(s) {
  const v = String(s || "global").toLowerCase();
  return VALID_SCOPES.has(v) ? v : "global";
}

function rankOf(scope) {
  const s = normalizeScope(scope);
  return Object.prototype.hasOwnProperty.call(SCOPE_RANK, s) ? SCOPE_RANK[s] : 9;
}

// Returns true if `candidate` is same-or-smaller than `current`
// (i.e. safe to prefer candidate as the update scope).
function isNarrowerOrEqual(candidate, current) {
  return rankOf(candidate) <= rankOf(current);
}

function validate(msg) {
  const errors = [];
  if (!msg || typeof msg !== "object") return { ok: false, errors: ["message must be an object"] };
  if (!Number.isInteger(msg.v) || msg.v < 0) errors.push("v must be a non-negative integer");
  if (msg.bootId !== null && msg.bootId !== undefined && typeof msg.bootId !== "string")
    errors.push("bootId must be a string");
  if (typeof msg.type !== "string" || !VALID_TYPES.has(String(msg.type).toLowerCase()))
    errors.push(`unknown type: ${msg.type}`);
  if (typeof msg.id !== "string" || !msg.id || msg.id.length > 512)
    errors.push("id must be a non-empty string ≤512 chars");
  if (typeof msg.scope !== "string" || !VALID_SCOPES.has(String(msg.scope).toLowerCase()))
    errors.push(`unknown scope: ${msg.scope}`);
  if (msg.reason !== undefined && (typeof msg.reason !== "string" || msg.reason.length > 128))
    errors.push("reason must be a string ≤128 chars");
  if (msg.targets !== undefined && !Array.isArray(msg.targets))
    errors.push("targets must be an array");
  if (Array.isArray(msg.targets) && msg.targets.length > 200)
    errors.push("targets capped at 200 entries");
  if (msg.at !== undefined && (!Number.isFinite(msg.at) || msg.at < 0))
    errors.push("at must be a timestamp");
  return { ok: errors.length === 0, errors };
}

// Staleness guard (§29): a message is stale when it belongs to an older
// boot (process restarted) or an older-or-equal revision than the client
// already committed. Callers must drop stale messages, never apply them.
function isStale(msg, committed) {
  if (!msg || !committed) return false;
  if (msg.bootId && committed.bootId && msg.bootId !== committed.bootId) return true;
  if (Number.isInteger(msg.v) && Number.isInteger(committed.v) && msg.v <= committed.v) return true;
  return false;
}

// Build a protocol message from an invalidate.js result, filling the
// fields invalidate.js omits (seq mirrors v; at defaults to now).
function fromInvalidation(inv) {
  if (!inv || typeof inv !== "object") throw new Error("[update-protocol] invalidation required");
  const msg = {
    v: inv.v,
    bootId: inv.bootId || null,
    type: String(inv.type || "invalidation"),
    id: String(inv.id || ""),
    scope: normalizeScope(inv.scope),
    reason: String(inv.reason || "source-change").slice(0, 128),
    targets: Array.isArray(inv.targets) ? inv.targets.slice(0, 200) : [],
    strategy: inv.strategy || null,
    seq: inv.v,
    at: inv.at || Date.now(),
  };
  const { ok, errors } = validate(msg);
  if (!ok) throw new Error(`[update-protocol] invalid message: ${errors.join("; ")}`);
  return msg;
}

module.exports = {
  VALID_TYPES,
  VALID_SCOPES,
  SCOPE_RANK,
  normalizeScope,
  rankOf,
  isNarrowerOrEqual,
  validate,
  isStale,
  fromInvalidation,
};
