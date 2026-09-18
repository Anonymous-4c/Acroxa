// src/core/runtime/registry.js
//
// Central runtime registry — deterministic identity + owner-scoped disposal.
// Wraps the legacy `pluginAPI.registered` arrays without breaking them:
// legacy arrays stay canonical for menus/widgets/etc, while this registry
// tracks every disposable capability so unload/reload cannot leak.
//
// Entry: { id, type, owner, name, version, deps[], status, meta, dispose, createdAt, updatedAt }
//   id     = `${type}:${owner}:${name}` (stable, no randoms per render)
//   type   = module|extension|layout|widget|route|api|hook|asset|frontend-module|renderer|schema|menu|...
//   owner  = plugin/layout/module name ("core" for built-ins)
//   status = active|failed|disposed
//   dispose= optional () => void|Promise<void>

"use strict";

const entries = new Map(); // id -> entry
const byOwner = new Map(); // owner -> Set<id>
const byType = new Map();  // type -> Set<id>

function makeId(type, owner, name) {
  const t = String(type || "unknown").trim() || "unknown";
  const o = String(owner || "core").trim() || "core";
  const n = String(name || "").trim() || "default";
  return `${t}:${o}:${n}`;
}

function _index(entry) {
  if (!byOwner.has(entry.owner)) byOwner.set(entry.owner, new Set());
  byOwner.get(entry.owner).add(entry.id);
  if (!byType.has(entry.type)) byType.set(entry.type, new Set());
  byType.get(entry.type).add(entry.id);
}

function _deindex(entry) {
  const o = byOwner.get(entry.owner);
  if (o) { o.delete(entry.id); if (!o.size) byOwner.delete(entry.owner); }
  const t = byType.get(entry.type);
  if (t) { t.delete(entry.id); if (!t.size) byType.delete(entry.type); }
}

/**
 * Register a runtime capability. Re-registering the same id updates metadata
 * instead of duplicating (reload-safe). Returns a disposer function.
 */
function register({ type, owner = "core", name, version = null, deps = [], meta = {}, dispose = null, status = "active" }) {
  if (!type || !name) throw new Error("[registry] register requires { type, name }");
  const id = makeId(type, owner, name);
  const now = Date.now();
  const existing = entries.get(id);
  if (existing) {
    existing.version = version ?? existing.version;
    existing.deps = Array.isArray(deps) && deps.length ? deps : existing.deps;
    existing.meta = { ...existing.meta, ...meta };
    if (typeof dispose === "function") existing.dispose = dispose;
    existing.status = status;
    existing.updatedAt = now;
    return () => unregister(id);
  }
  const entry = {
    id, type, owner, name, version,
    deps: Array.isArray(deps) ? [...deps] : [],
    status, meta: { ...meta },
    dispose: typeof dispose === "function" ? dispose : null,
    createdAt: now, updatedAt: now,
  };
  entries.set(id, entry);
  _index(entry);
  return () => unregister(id);
}

function get(id) {
  return entries.get(id) || null;
}

function list(filter = {}) {
  const { type, owner, status } = filter;
  let ids;
  if (type && byType.has(type)) ids = [...byType.get(type)];
  else if (owner && byOwner.has(owner)) ids = [...byOwner.get(owner)];
  else ids = [...entries.keys()];
  return ids
    .map((id) => entries.get(id))
    .filter(Boolean)
    .filter((e) => (!type || e.type === type) && (!owner || e.owner === owner) && (!status || e.status === status))
    .map((e) => ({ ...e, deps: [...e.deps], meta: { ...e.meta } }));
}

function mark(id, status, extraMeta = {}) {
  const e = entries.get(id);
  if (!e) return false;
  e.status = status;
  e.meta = { ...e.meta, ...extraMeta };
  e.updatedAt = Date.now();
  return true;
}

function unregister(id) {
  const e = entries.get(id);
  if (!e) return false;
  try {
    if (typeof e.dispose === "function") {
      const r = e.dispose();
      if (r && typeof r.then === "function") r.catch((err) => console.error(`[registry] async dispose failed ${id}:`, err.message));
    }
  } catch (err) {
    console.error(`[registry] dispose failed ${id}:`, err.message);
  }
  _deindex(e);
  entries.delete(id);
  return true;
}

/**
 * Dispose everything owned by `owner` (extension/layout/module unload).
 * Runs disposers, removes index entries. Returns { disposed, errors }.
 * Never throws — isolation is mandatory (one bad disposer must not kill core).
 */
async function disposeOwner(owner) {
  const ids = byOwner.has(owner) ? [...byOwner.get(owner)] : [];
  let disposed = 0;
  const errors = [];
  for (const id of ids) {
    const e = entries.get(id);
    if (!e) continue;
    try {
      if (typeof e.dispose === "function") await e.dispose();
      disposed++;
    } catch (err) {
      errors.push({ id, message: err.message });
      console.error(`[registry] disposeOwner(${owner}) failed ${id}:`, err.message);
    }
    _deindex(e);
    e.status = "disposed";
    entries.delete(id);
  }
  return { owner, disposed, errors };
}

function stats() {
  const out = { total: entries.size, byType: {}, byOwner: {} };
  for (const [t, s] of byType) out.byType[t] = s.size;
  for (const [o, s] of byOwner) out.byOwner[o] = s.size;
  return out;
}

function clear() {
  entries.clear();
  byOwner.clear();
  byType.clear();
}

module.exports = { makeId, register, get, list, mark, unregister, disposeOwner, stats, clear };
