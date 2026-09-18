// src/core/runtime/cache/layers.js
// AcroxaJS cache layers (Phase 8) over the proven cache.js primitives.
// Visitor isolation (§11,28,30): the visitor output cache is a SEPARATE
// named store with its own lifecycle — the admin live-development system
// never needs its internals. Admin correctness-first (invalidate → stale
// immediately via snapshot.markStale); visitor perf-first (TTL + targeted
// dependency-driven drops).
//
// Strategies (every one affects runtime behavior — tested):
//   no-cache             → renders fresh on every request
//   cache-first          → hit → serve (default)
//   revalidate           → TTL 0: only invalidation drops entries
//   stale-while-revalidate → past TTL, serve stale within a grace window
//                            once, then expire (next request renders fresh)
//   invalidation-driven  → alias of revalidate (dependency-driven only)
//
// Configuration source: existing system settings (global._settingsCache,
// set by settingsController side-effects) under runtime.cache — Phase 9
// wires the UI. Defaults are sensible; core contracts stay non-configurable.

"use strict";

const base = require("../cache");

const VISITOR_STORE = "visitor-output";
const DATA_STORE = "data";

const STRATEGIES = new Set([
  "no-cache", "cache-first", "revalidate",
  "stale-while-revalidate", "invalidation-driven",
]);

const DEFAULT_POLICY = {
  enabled: true,
  strategy: "cache-first",
  ttlMs: 60000,
  swrGraceMs: 30000,
  maxSize: 200,
};

/** Read the runtime cache policy from existing system settings (or defaults).
 * Settings shape is FLAT (every section convention): runtime.cacheEnabled,
 * runtime.cacheStrategy, runtime.cacheTTL, runtime.cacheSwrGraceMs,
 * runtime.cacheMaxSize. */
function policy() {
  try {
    const s = global._settingsCache;
    const rc = s && s.runtime && typeof s.runtime === "object" ? s.runtime : null;
    if (!rc) return { ...DEFAULT_POLICY };
    return {
      enabled: rc.cacheEnabled !== false,
      strategy: STRATEGIES.has(rc.cacheStrategy) ? rc.cacheStrategy : DEFAULT_POLICY.strategy,
      ttlMs: Number.isFinite(rc.cacheTTL) ? rc.cacheTTL : DEFAULT_POLICY.ttlMs,
      swrGraceMs: Number.isFinite(rc.cacheSwrGraceMs) ? rc.cacheSwrGraceMs : DEFAULT_POLICY.swrGraceMs,
      maxSize: Number.isFinite(rc.cacheMaxSize) ? rc.cacheMaxSize : DEFAULT_POLICY.maxSize,
    };
  } catch (_) {
    return { ...DEFAULT_POLICY };
  }
}

/** Visitor cache key: normalized pathname + pagination param only.
 * Tracking/analytics-style queries never fragment the cache. */
function visitorKey(req) {
  try {
    const p = (req.originalUrl || req.url || "/").split("?")[0];
    const page = parseInt(req.query && req.query.page, 10) || 1;
    return `route:${p}?page=${page}`;
  } catch (_) {
    return "route:/?page=1";
  }
}

function _store() {
  const p = policy();
  const wantTtl = (p.strategy === "revalidate" || p.strategy === "invalidation-driven") ? 0 : p.ttlMs;
  const store = base.getCache(VISITOR_STORE, { ttlMs: wantTtl });
  if (store.ttlMs !== wantTtl) {
    // Policy changed — reset (entries cached under one TTL policy never
    // survive a strategy switch; fresh sets use the new policy).
    store.clear();
    store.ttlMs = wantTtl;
  }
  return store;
}

/** Visitor cache lookup. Returns cached HTML or null (miss/disabled/stale). */
function getVisitor(key) {
  const p = policy();
  if (!p.enabled || p.strategy === "no-cache") return null;
  const store = _store();
  const entry = store.map ? store.map.get(key) : null;
  if (!entry) {
    try { require("../hookBus").run("cache:miss", { key, store: VISITOR_STORE }); } catch (_) {}
    return null;
  }
  const expired = entry.expiresAt !== 0 && entry.expiresAt <= Date.now();
  if (!expired) {
    const v = store.get(key);
    if (v !== undefined) {
      try { require("../debug").log("cache", `visitor hit ${key}`); } catch (_) {}
      try { require("../hookBus").run("cache:hit", { key, store: VISITOR_STORE }); } catch (_) {}
    }
    return v === undefined ? null : v;
  }
  // Past TTL: stale-while-revalidate serves stale ONCE within the grace
  // window, then expires (next request renders fresh). Other strategies
  // treat expiry as a miss.
  if (p.strategy === "stale-while-revalidate") {
    const age = Date.now() - entry.expiresAt;
    if (age <= p.swrGraceMs && !entry.swrServed) {
      entry.swrServed = true;
      try { require("../debug").log("cache", `visitor SWR stale serve ${key}`); } catch (_) {}
      return entry.value;
    }
  }
  store.del(key);
  return null;
}

/** Store rendered visitor output. The route dep is derived from the key
 * automatically (targeted invalidation works without caller effort);
 * extra deps/tags are additive. */
function putVisitor(key, html, { deps = [], tags = [] } = {}) {
  const p = policy();
  if (!p.enabled || p.strategy === "no-cache") return false;
  const store = _store();
  // Bounded size: evict oldest when over maxSize (lean, deterministic).
  if (store.map && store.map.size >= p.maxSize) {
    const oldest = store.map.keys().next().value;
    if (oldest !== undefined) store.del(oldest);
  }
  const routeDep = typeof key === "string" && key.startsWith("route:") ? key.split("?")[0] : null;
  const allDeps = ["visitor", ...(routeDep && !deps.includes(routeDep) ? [routeDep] : []), ...deps];
  store.set(key, html, allDeps, tags);
  return true;
}

/** Targeted visitor invalidation: one route, a prefix, or the whole
 * visitor store via the "visitor" dep (structural layout changes — every
 * page's HTML wraps the layout, so this is correct, not a nuke-by-default). */
function invalidateRoute(pathOrPrefix) {
  const raw = String(pathOrPrefix || "");
  if (raw === "visitor") return base.invalidate("visitor");
  if (raw.endsWith("*")) return base.invalidate(raw);
  const clean = raw.split("?")[0];
  const n = base.invalidate(`route:${clean}`);
  try { require("../debug").log("cache", `visitor invalidate route:${clean} (${n})`); } catch (_) {}
  return n;
}

/** Data cache for expensive service operations (callers own user-scoping). */
function getDataCache() {
  const p = policy();
  return base.getCache(DATA_STORE, { ttlMs: p.enabled ? p.ttlMs : 0 });
}

module.exports = {
  policy, visitorKey, getVisitor, putVisitor, invalidateRoute, getDataCache,
  STRATEGIES, DEFAULT_POLICY, VISITOR_STORE, DATA_STORE,
};
