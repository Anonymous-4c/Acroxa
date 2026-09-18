// src/core/runtime/targets.js
// Server render-target registry (§110). Tracks mounted runtime targets
// (widget/view/component instances) with enough state to re-render one
// target without regenerating the whole page. In-memory only; entries are
// replaced on each render and pruned by TTL. Never holds user/session data.

"use strict";

const MAX = 500;
const TTL_MS = 30 * 60 * 1000;

const targets = new Map(); // id -> { id, type, owner, node, rev, strategy, hydrate, component, updatedAt }

function _isExpired(t, now) {
  return (now - t.updatedAt) > TTL_MS;
}

function _prune() {
  // Always sweep expired entries (previously only swept when over MAX,
  // so stale entries lived forever under a quiet registry).
  const now = Date.now();
  for (const [id, t] of targets) {
    if (_isExpired(t, now)) targets.delete(id);
  }
  if (targets.size <= MAX) return;
  // Still over: drop oldest.
  if (targets.size > MAX) {
    const sorted = [...targets.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    for (const [id] of sorted.slice(0, targets.size - MAX)) targets.delete(id);
  }
}

function _cleanAssets(assets) {
  // Per-target asset requirements for targeted updates: which JS/CSS files
  // must be present (and re-injected when stale) for this target to run.
  // Bounded + string-only so registry entries stay small and serializable.
  const out = { js: [], css: [] };
  try {
    if (assets && typeof assets === "object") {
      for (const k of ["js", "css"]) {
        const list = assets[k];
        if (Array.isArray(list)) {
          for (const u of list.slice(0, 20)) {
            if (typeof u === "string" && u.length > 0 && u.length <= 512) out[k].push(u);
          }
        }
      }
    }
  } catch (_) {}
  return out;
}

function _mergeAssets(prev, next) {
  // Union, deduped + bounded: re-renders (which pass no assets) must not
  // wipe previously declared requirements, and explicit declarations
  // accumulate instead of clobbering each other.
  const out = { js: [], css: [] };
  for (const k of ["js", "css"]) {
    const seen = new Set();
    for (const src of [prev, next]) {
      const list = src && Array.isArray(src[k]) ? src[k] : [];
      for (const u of list) {
        if (typeof u !== "string" || seen.has(u)) continue;
        seen.add(u);
        out[k].push(u);
        if (out[k].length >= 20) break;
      }
      if (out[k].length >= 20) break;
    }
  }
  return out;
}

function register({ id, type = "widget", owner = "core", node = null, rev = null, generation = null, strategy = null, hydrate = null, component = null, assets = null, file = null, boundary = null } = {}) {
  if (!id || typeof id !== "string") throw new Error("[targets] id required");
  if (id.length > 192) throw new Error("[targets] id too long");
  const prev = targets.get(id);
  const strat = typeof strategy === "string" && strategy ? strategy.slice(0, 32)
    : typeof hydrate === "string" && hydrate ? hydrate.slice(0, 32)
    : (prev ? prev.strategy : null);
  let currentRev = rev !== null && rev !== undefined ? rev : (prev ? prev.rev : null);
  if (currentRev === null || currentRev === undefined) {
    try { currentRev = require("./revision").get(); } catch (_) { currentRev = 0; }
  }
  const gen = Number.isInteger(generation) ? generation
    : Number.isInteger(currentRev) ? currentRev
    : (prev && Number.isInteger(prev.generation) ? prev.generation : 0);
  targets.set(id, {
    id,
    type: type || (prev ? prev.type : "widget"),
    owner: owner || (prev ? prev.owner : "core"),
    node: node || (prev ? prev.node : null),
    rev: currentRev,
    generation: gen,
    strategy: strat,
    hydrate: typeof hydrate === "string" ? hydrate.slice(0, 32) : (prev ? prev.hydrate : null),
    component: typeof component === "string" ? component.slice(0, 64) : (prev ? prev.component : null),
    assets: _mergeAssets(prev ? prev.assets : null, _cleanAssets(assets)),
    file: typeof file === "string" ? file.slice(0, 512) : (prev ? prev.file : null),
    boundary: typeof boundary === "string" ? boundary.slice(0, 192) : (prev ? prev.boundary : null),
    updatedAt: Date.now(),
  });
  _prune();
  return id;
}

function get(id) {
  const t = targets.get(id);
  if (!t) return null;
  if (_isExpired(t, Date.now())) { targets.delete(id); return null; } // lazy TTL on read
  return t;
}

function remove(id) {
  return targets.delete(id);
}

function clear() {
  targets.clear();
}

function stats() {
  let oldestAgeMs = 0;
  const now = Date.now();
  for (const t of targets.values()) {
    const age = now - t.updatedAt;
    if (age > oldestAgeMs) oldestAgeMs = age;
  }
  return { targets: targets.size, max: MAX, ttlMs: TTL_MS, oldestAgeMs };
}

module.exports = { register, get, remove, clear, stats, prune: _prune, TTL_MS, MAX };
