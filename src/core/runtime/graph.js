// src/core/runtime/graph.js
// Resource dependency graph: resource -> deps, dep -> dependents.
// Answers "widget:hero changed — which pages/targets are affected?"
// without scanning the whole app on every update.

"use strict";

const GLOBAL_KEY = "__acroxa_graph__";

function _slot() {
  if (!global[GLOBAL_KEY]) global[GLOBAL_KEY] = { deps: new Map(), rdeps: new Map() };
  return global[GLOBAL_KEY];
}

function _key(r) {
  // Normalize path separators so a dependency declared with forward slashes
  // (pages.js, hot-reloader) matches a lookup from a chokidar event that
  // carries native separators (backslashes on win32). Plain ids unaffected.
  return String(r).replace(/\\/g, "/");
}

/** Declare that `resource` depends on `...deps`. Overwrites previous deps. */
function depend(resource, deps = []) {
  const s = _slot();
  const r = _key(resource);
  const next = new Set((Array.isArray(deps) ? deps : [deps]).map(_key).filter(Boolean));
  const prev = s.deps.get(r) || new Set();
  // Remove stale reverse edges.
  for (const d of prev) {
    if (!next.has(d)) {
      const set = s.rdeps.get(d);
      if (set) { set.delete(r); if (!set.size) s.rdeps.delete(d); }
    }
  }
  // Add new reverse edges.
  for (const d of next) {
    if (!s.rdeps.has(d)) s.rdeps.set(d, new Set());
    s.rdeps.get(d).add(r);
  }
  s.deps.set(r, next);
  return { resource: r, deps: [...next] };
}

function dependenciesOf(resource) {
  const s = _slot();
  return [...(s.deps.get(_key(resource)) || [])];
}

function dependentsOf(dep) {
  const s = _slot();
  return [...(s.rdeps.get(_key(dep)) || [])];
}

/** BFS walk of dependents starting from `root`. Returns ordered unique list. */
function affectedBy(root, { max = 500 } = {}) {
  const seen = new Set();
  const queue = [_key(root)];
  const out = [];
  while (queue.length && out.length < max) {
    const cur = queue.shift();
    for (const dep of dependentsOf(cur)) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      out.push(dep);
      queue.push(dep);
    }
  }
  return out;
}

function remove(resource) {
  const s = _slot();
  const r = _key(resource);
  const deps = s.deps.get(r) || new Set();
  for (const d of deps) {
    const set = s.rdeps.get(d);
    if (set) { set.delete(r); if (!set.size) s.rdeps.delete(d); }
  }
  s.deps.delete(r);
  const rev = s.rdeps.get(r);
  if (rev) {
    for (const dependent of [...rev]) {
      const dd = s.deps.get(dependent);
      if (dd) dd.delete(r);
    }
    s.rdeps.delete(r);
  }
  return true;
}

function stats() {
  const s = _slot();
  return { resources: s.deps.size, edges: [...s.deps.values()].reduce((n, set) => n + set.size, 0) };
}

module.exports = { depend, dependenciesOf, dependentsOf, affectedBy, remove, stats };
