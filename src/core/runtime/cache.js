// src/core/runtime/cache.js
//
// Explicit cache/invalidation architecture (spec §§28-29).
// Rules: deterministic keys, explicit deps, real hit/miss stats, safe defaults.
// Auth/user-specific/editor/mutation data must NEVER use the shared caches
// without a user-scoped key — callers own that decision; this module only
// provides the mechanism + dependency tracking.
//
//   const cache = require("./cache");
//   const c = cache.getCache("settings", { ttlMs: 30_000 });
//   c.set("site", value, ["settings:site"]);
//   cache.invalidate("settings:site");       // targeted
//   cache.invalidate("layout:zenith");       // layout-scoped
//   cache.versionTag(input);                 // asset fingerprint

"use strict";

const crypto = require("crypto");
const events = require("./events");

const caches = new Map(); // name -> Store
const depIndex = new Map(); // dep -> Set<{cache, key}>
const tagIndex = new Map(); // tag -> Set<{cache, key}>

function _now() { return Date.now(); }

function getCache(name, { ttlMs = 30_000 } = {}) {
  if (caches.has(name)) return caches.get(name);
  const store = {
    name,
    ttlMs,
    map: new Map(), // key -> { value, expiresAt, deps[] }
    hits: 0,
    misses: 0,
    sets: 0,
    invalidations: 0,
    get(key) {
      const e = this.map.get(key);
      if (!e) { this.misses++; return undefined; }
      if (e.expiresAt !== 0 && e.expiresAt <= _now()) {
        this.map.delete(key);
        _deindex(depIndex, this, key, e.deps);
        this.misses++;
        return undefined;
      }
      this.hits++;
      return e.value;
    },
    set(key, value, deps = [], tags = []) {
      const old = this.map.get(key);
      if (old) _deindex(depIndex, this, key, old.deps);
      if (old) _deindex(tagIndex, this, key, old.tags);
      const depList = Array.isArray(deps) ? [...deps] : [];
      const tagList = Array.isArray(tags) ? [...tags] : [];
      this.map.set(key, {
        value,
        expiresAt: this.ttlMs > 0 ? _now() + this.ttlMs : 0,
        deps: depList,
        tags: tagList,
      });
      this.sets++;
      _index(depIndex, this, key, depList);
      _index(tagIndex, this, key, tagList);
      return value;
    },
    del(key) {
      const e = this.map.get(key);
      if (!e) return false;
      this.map.delete(key);
      _deindex(depIndex, this, key, e.deps);
      _deindex(tagIndex, this, key, e.tags);
      this.invalidations++;
      return true;
    },
    clear() {
      for (const [key, e] of this.map) {
        _deindex(depIndex, this, key, e.deps);
        _deindex(tagIndex, this, key, e.tags);
      }
      const n = this.map.size;
      this.map.clear();
      this.invalidations += n;
      return n;
    },
    stats() {
      return { name: this.name, size: this.map.size, hits: this.hits, misses: this.misses, sets: this.sets, invalidations: this.invalidations, ttlMs: this.ttlMs };
    },
  };
  caches.set(name, store);
  return store;
}

function _index(idx, cacheObj, key, deps) {
  for (const d of deps || []) {
    if (!idx.has(d)) idx.set(d, new Set());
    idx.get(d).add({ cache: cacheObj, key });
  }
}

function _deindex(idx, cacheObj, key, deps) {
  for (const d of deps || []) {
    const s = idx.get(d);
    if (!s) continue;
    for (const ref of [...s]) {
      if (ref.cache === cacheObj && ref.key === key) s.delete(ref);
    }
    if (!s.size) idx.delete(d);
  }
}

/**
 * Invalidate every entry depending on `dep` (exact match) or, when
 * `dep` ends with ":*", every dep under that prefix.
 * Emits `api:invalidated`. Returns count.
 */
function invalidate(dep) {
  let targets = [];
  if (dep.endsWith("*")) {
    // Any trailing asterisk is a prefix wildcard (covers both "prefix:*"
    // and "route:/about*" styles). Prefix = everything before the "*".
    const prefix = dep.slice(0, -1);
    for (const [d, refs] of depIndex) {
      if (d.startsWith(prefix)) targets.push(...[...refs].map((r) => ({ ...r, dep: d })));
    }
  } else {
    const refs = depIndex.get(dep);
    if (refs) targets = [...refs].map((r) => ({ ...r, dep }));
  }
  let n = 0;
  for (const t of targets) {
    if (t.cache.del(t.key)) n++;
  }
  try { events.emit("api:invalidated", { dep, count: n }); } catch (_) {}
  return n;
}

/**
 * Invalidate every entry tagged with `tag` (exact match) or, when `tag`
 * ends with ":*", every tag under that prefix. Real deletion via del() —
 * deindexes both dep and tag refs. Emits `api:invalidated` with
 * kind:"tag". Returns count.
 */
function invalidateTag(tag) {
  const t = String(tag || "");
  if (!t) return 0;
  let targets = [];
  if (t.endsWith(":*")) {
    const prefix = t.slice(0, -1);
    for (const [name, refs] of tagIndex) {
      if (name.startsWith(prefix)) targets.push(...[...refs].map((r) => ({ ...r, tag: name })));
    }
  } else {
    const refs = tagIndex.get(t);
    if (refs) targets = [...refs].map((r) => ({ ...r, tag: t }));
  }
  let n = 0;
  for (const target of targets) {
    if (target.cache.del(target.key)) n++;
  }
  try { events.emit("api:invalidated", { dep: t, kind: "tag", count: n }); } catch (_) {}
  return n;
}

function clearAll() {
  let n = 0;
  for (const c of caches.values()) n += c.clear();
  return n;
}

function stats() {
  const out = { caches: {}, tags: tagIndex.size };
  for (const [name, c] of caches) out.caches[name] = c.stats();
  return out;
}

/**
 * Asset fingerprint for browser caching (spec §47).
 * Production: stable content hash → long cache lifetime, new URL on change.
 * Development: mtime/nonce → always fresh.
 * Returns "?v=<tag>".
 */
function versionTag(input, { dev = process.env.NODE_ENV !== "production" } = {}) {
  if (dev) {
    // In dev, input may carry mtime; fall back to per-call nonce (old behavior).
    const mtime = input && typeof input === "object" && input.mtime ? String(input.mtime) : String(Date.now());
    return `?v=${mtime}`;
  }
  const h = crypto.createHash("sha1");
  if (typeof input === "string") h.update(input);
  else {
    try { h.update(JSON.stringify(input)); }
    catch (_) { h.update(String(input)); }
  }
  return `?v=${h.digest("hex").slice(0, 10)}`;
}

module.exports = { getCache, invalidate, invalidateTag, clearAll, stats, versionTag };
