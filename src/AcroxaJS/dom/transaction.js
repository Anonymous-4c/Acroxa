// src/AcroxaJS/dom/transaction.js
// Patch transaction gate (shared server/client contract, DOM-free).
// DETECT → PLAN → VALIDATE → (client PATCHes) → VERIFY → COMMIT,
// failure → ROLLBACK (drop) → REPORT → SAFE FALLBACK (reload).
//
// This module is the VALIDATE + VERIFY step: given an incoming update
// message and the client's committed state, decide exactly one action:
//   patch  — safe to apply to the named boundary
//   drop   — stale/duplicate/invalid; keep current DOM, no fallback
//   reload — newer boot or protocol violation; controlled reload required
// The DOM mutation itself stays in acrx/assets/js/dom-patch.js; this gate
// guarantees it never applies a stale or malformed payload.

"use strict";

const proto = require("../contracts/update-protocol");
const identity = require("../contracts/identity");

function decide(message, committed = { v: -1, bootId: null }) {
  const { ok, errors } = proto.validate(message);
  if (!ok) {
    return { action: "reload", reason: `invalid message: ${errors.join("; ")}`.slice(0, 200) };
  }
  // New boot → client state belongs to a dead process. Never patch across it.
  if (
    message.bootId &&
    committed.bootId &&
    message.bootId !== committed.bootId
  ) {
    return { action: "reload", reason: "bootId mismatch" };
  }
  if (proto.isStale(message, committed)) {
    return { action: "drop", reason: `stale v${message.v} <= committed v${committed.v}` };
  }
  // Boundary-scoped messages must name a real boundary id.
  if (["boundary", "element", "component", "widget"].includes(String(message.type).toLowerCase())) {
    const target = (Array.isArray(message.targets) && message.targets[0]) || message.id;
    if (target && !identity.isValid(target) && !String(target).startsWith("boundary:")) {
      return { action: "drop", reason: `unresolvable target: ${target}`.slice(0, 160) };
    }
  }
  if (String(message.type).toLowerCase() === "full-reload" || String(message.scope).toLowerCase() === "global") {
    // Global scope without a narrower target: only reload when explicitly asked.
    if (String(message.type).toLowerCase() === "full-reload") {
      return { action: "reload", reason: message.reason || "full-reload requested" };
    }
  }
  return {
    action: "patch",
    reason: message.reason || "ok",
    scope: message.scope,
    targets: Array.isArray(message.targets) && message.targets.length ? message.targets : [message.id],
    v: message.v,
  };
}

function commit(committed, message) {
  return {
    v: Number.isInteger(message.v) ? message.v : committed.v,
    bootId: message.bootId || committed.bootId || null,
  };
}

module.exports = { decide, commit };
