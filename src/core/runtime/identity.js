// src/core/runtime/identity.js
// Stable runtime identity for renderable targets.
// target id = `${type}:${owner}:${key}` — deterministic, no randoms.
// Maps server render <-> registry <-> client DOM <-> hydration <-> invalidation.

"use strict";

const ID_RE = /^[a-z0-9_-]+:[a-z0-9_-]+:[a-zA-Z0-9_.-]+$/;

function sanitize(part, fallback = "default") {
  const s = String(part ?? fallback).trim();
  if (!s) return fallback;
  return s.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 128) || fallback;
}

function makeTargetId(type, owner, key) {
  const t = sanitize(type, "component").toLowerCase();
  const o = sanitize(owner, "core").toLowerCase();
  const k = sanitize(key, "default");
  return `${t}:${o}:${k}`;
}

function parseTargetId(id) {
  if (typeof id !== "string") return null;
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const type = parts[0];
  const owner = parts[1];
  const key = parts.slice(2).join(":");
  if (!type || !owner || !key) return null;
  return { type, owner, key };
}

function isValidTargetId(id) {
  return typeof id === "string" && ID_RE.test(id);
}

/**
 * Render HTML data attributes for a runtime target.
 * Compact metadata only — never serialize functions or closures.
 */
function targetAttrs(type, owner, key, { hydrate = null, rev = null, component = null } = {}) {
  const id = makeTargetId(type, owner, key);
  const out = { "data-acrx-id": id };
  if (hydrate) out["data-acrx-hydrate"] = hydrate;
  if (rev !== null && rev !== undefined) out["data-acrx-rev"] = String(rev);
  if (component) out["data-acrx-component"] = String(component);
  if (owner) out["data-acrx-owner"] = String(owner);
  return out;
}

function attrsToString(attrs) {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
}

module.exports = { makeTargetId, parseTargetId, isValidTargetId, targetAttrs, attrsToString };
