// src/core/runtime/diff/patch.js
// AcroxaJS patch protocol (Phase 5).
// Formal internal envelope the client applies safely:
//   { type:"render.patch", page, patchId, fromVersion, toVersion, ops, at }
// Versioning: the client never blindly applies — fromVersion must match its
// committed version, else it resyncs via snapshot.since() (needsFull → full
// snapshot/html; recoverable → replay). Validation is strict: unknown ops
// or missing fields reject the envelope before it reaches the DOM.

"use strict";

const crypto = require("node:crypto");

const OPS = new Set([
  "setHtml", "setAttr", "removeAttr",
  "replaceSubtree", "insert", "remove", "move",
]);

const REQUIRED_FIELDS = {
  setHtml: ["target", "value"],
  setAttr: ["target", "name", "value"],
  removeAttr: ["target", "name"],
  replaceSubtree: ["target", "html"],
  insert: ["parent", "html"],
  remove: ["target"],
  move: ["target"],
};

function makePatch({ page, fromVersion, toVersion, ops }) {
  if (!page) throw new Error("[patch] page required");
  if (!Number.isInteger(fromVersion) || !Number.isInteger(toVersion)) {
    throw new Error("[patch] fromVersion/toVersion must be integers");
  }
  if (!Array.isArray(ops)) throw new Error("[patch] ops must be an array");
  const v = { ok: true, errors: [] };
  const check = validatePatch({
    type: "render.patch", page, fromVersion, toVersion, ops,
    patchId: "p",
  });
  if (!check.ok) {
    v.ok = false;
    v.errors = check.errors;
  }
  let patchId = null;
  let bootId = null;
  try {
    const revision = require("../revision");
    bootId = revision.bootId();
  } catch (_) {}
  patchId = `patch-${toVersion}-${crypto.randomBytes(4).toString("hex")}`;
  return {
    type: "render.patch",
    page: String(page),
    patchId,
    fromVersion,
    toVersion,
    bootId,
    ops,
    at: Date.now(),
    valid: v.ok,
    errors: v.errors,
  };
}

/** Strict validation. Returns { ok, errors[] }. */
function validatePatch(p) {
  const errors = [];
  if (!p || typeof p !== "object") return { ok: false, errors: ["patch must be an object"] };
  if (p.type !== "render.patch") errors.push(`unknown type: ${p.type}`);
  if (typeof p.page !== "string" || !p.page.length) errors.push("page required");
  if (!Number.isInteger(p.fromVersion) || p.fromVersion < 0) errors.push("fromVersion must be a non-negative integer");
  if (!Number.isInteger(p.toVersion) || p.toVersion <= p.fromVersion) errors.push("toVersion must exceed fromVersion");
  if (!Array.isArray(p.ops)) {
    errors.push("ops must be an array");
    return { ok: errors.length === 0, errors };
  }
  for (const op of p.ops) {
    if (!op || typeof op !== "object") { errors.push("op must be an object"); continue; }
    if (!OPS.has(op.op)) { errors.push(`unknown op: ${op.op}`); continue; }
    for (const field of REQUIRED_FIELDS[op.op]) {
      const v = op[field];
      if (v === undefined || v === null || v === "") errors.push(`${op.op}.${field} required`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Should the client resync instead of applying? Given the client's
 * committed version and a patch/announcement, decide:
 *   apply    — fromVersion matches committed
 *   resync   — version gap; snapshot.since() says recoverable or not
 *   stale    — announcement older than committed (drop, no fetch)
 */
function decideApply(committedVersion, message) {
  const v = Number(message && (message.toVersion ?? message.v));
  if (!Number.isFinite(v)) return { action: "stale", reason: "no version" };
  const from = Number(message.fromVersion);
  if (Number.isFinite(from) && from === Number(committedVersion)) {
    return { action: "apply", reason: "fromVersion matches" };
  }
  if (v <= Number(committedVersion)) {
    return { action: "stale", reason: `v${v} <= committed v${committedVersion}` };
  }
  return { action: "resync", reason: `gap: committed v${committedVersion}, incoming v${v}` };
}

module.exports = { makePatch, validatePatch, decideApply, OPS };
