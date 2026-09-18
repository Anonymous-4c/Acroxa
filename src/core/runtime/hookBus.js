// src/core/runtime/hookBus.js
//
// First-class hook architecture with deterministic ordering + disposal.
// Contract per hook registration:
//   { hookName, plugin, callback, priority, mode, canModify, seq }
//
// hookName: "domain:action" (e.g. "render:beforeRender", "hydrate:afterHydrate").
//   Legacy bare names ("beforeRender") are accepted and mapped to "render:<name>".
// priority: core=0 → extension=10 → module=20 → component=30 (numeric override wins).
// mode: "sync" (default, back-compat fold) | "async" (awaited in runAsync).
// canModify: when false, return value is ignored (notification hook).
// Every register returns a disposer. disposeOwner(plugin) removes all of a plugin.
// Failures are isolated: one throwing hook logs + continues, never kills core.

"use strict";

const registry = require("./registry");

const hooks = new Map(); // hookName -> Array<record> (sorted)
let seq = 0;

const OWNER_PRIORITY = { core: 0, extension: 10, module: 20, component: 30 };

// Lifecycle stages documented in code (spec §25). Only these well-known
// suffixes get the render: prefix mapping; anything already namespaced passes through.
const STAGE_SUFFIXES = new Set([
  "beforeRender", "afterRender", "beforeHydrate", "afterHydrate",
  "beforeUpdate", "afterUpdate", "beforeDispose", "afterDispose",
  "beforeMount", "afterMount", "beforeUnmount", "afterUnmount",
  "stateChange", "navigation", "apiRequest", "apiResponse",
]);

function normalizeName(name) {
  if (typeof name !== "string" || !name.trim()) throw new Error("[hookBus] hookName required");
  const n = name.trim();
  if (n.includes(":")) return n;
  if (STAGE_SUFFIXES.has(n)) return `render:${n}`;
  return `custom:${n}`;
}

function _priorityFor(plugin, explicit) {
  if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
  if (Object.prototype.hasOwnProperty.call(OWNER_PRIORITY, plugin)) return OWNER_PRIORITY[plugin];
  // Unknown plugins (layout/extension names) sit between core and module.
  return 10;
}

function _sort(name) {
  const arr = hooks.get(name);
  if (arr) arr.sort((a, b) => (a.priority - b.priority) || (a.seq - b.seq));
}

/**
 * Register a hook. Returns a disposer.
 * opts: { priority?: number, mode?: "sync"|"async", canModify?: boolean }
 */
function register(hookName, callback, plugin = "core", opts = {}) {
  if (typeof callback !== "function") throw new Error("[hookBus] callback must be a function");
  const name = normalizeName(hookName);
  const mode = opts.mode === "async" ? "async" : "sync";
  const record = {
    hookName: name, plugin, callback,
    priority: _priorityFor(plugin, opts.priority),
    mode, canModify: opts.canModify !== false,
    seq: seq++,
  };
  if (!hooks.has(name)) hooks.set(name, []);
  hooks.get(name).push(record);
  _sort(name);
  registry.register({
    type: "hook", owner: plugin, name: `${name}#${record.seq}`,
    meta: { hookName: name, priority: record.priority, mode },
    dispose: () => { remove(record); },
  });
  return () => remove(record);
}

function remove(recordOrFn, hookName = null) {
  let removed = 0;
  const names = hookName ? [normalizeName(hookName)] : [...hooks.keys()];
  for (const name of names) {
    const arr = hooks.get(name);
    if (!arr) continue;
    for (let i = arr.length - 1; i >= 0; i--) {
      const r = arr[i];
      if (r === recordOrFn || r.callback === recordOrFn) {
        arr.splice(i, 1);
        removed++;
        try { registry.unregister(registry.makeId("hook", r.plugin, `${r.hookName}#${r.seq}`)); } catch (_) {}
      }
    }
    if (!arr.length) hooks.delete(name);
  }
  return removed;
}

/** Sync fold (back-compat with pluginAPI.runHooks). Async hooks are skipped with a warning. */
function run(hookName, data, ctx = {}) {
  const name = normalizeName(hookName);
  const arr = hooks.get(name) || [];
  let out = data;
  for (const h of arr) {
    if (h.mode === "async") {
      console.warn(`[hookBus] skipping async hook ${name} [${h.plugin}] in sync run() — use runAsync()`);
      continue;
    }
    try {
      const r = h.callback(out, ctx);
      if (h.canModify && r !== undefined) out = r;
    } catch (err) {
      console.error(`[hookBus] hook failed ${name} [${h.plugin}]:`, err.message);
    }
  }
  return out;
}

/** Async fold — awaits promises, isolates failures, preserves order. */
async function runAsync(hookName, data, ctx = {}) {
  const name = normalizeName(hookName);
  const arr = hooks.get(name) || [];
  let out = data;
  for (const h of arr) {
    try {
      const r = await h.callback(out, ctx);
      if (h.canModify && r !== undefined) out = r;
    } catch (err) {
      console.error(`[hookBus] async hook failed ${name} [${h.plugin}]:`, err.message);
    }
  }
  return out;
}

function disposeOwner(plugin) {
  let n = 0;
  for (const [name, arr] of [...hooks]) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].plugin === plugin) {
        const r = arr[i];
        arr.splice(i, 1);
        n++;
        try { registry.unregister(registry.makeId("hook", r.plugin, `${r.hookName}#${r.seq}`)); } catch (_) {}
      }
    }
    if (!arr.length) hooks.delete(name);
  }
  return n;
}

function list(hookName = null) {
  if (hookName) {
    const name = normalizeName(hookName);
    return (hooks.get(name) || []).map((h) => ({ hookName: h.hookName, plugin: h.plugin, priority: h.priority, mode: h.mode, canModify: h.canModify, seq: h.seq }));
  }
  const out = {};
  for (const [name, arr] of hooks) out[name] = arr.length;
  return out;
}

function stats() {
  let total = 0;
  for (const arr of hooks.values()) total += arr.length;
  return { hooks: hooks.size, registrations: total, byHook: list() };
}

// Well-known lifecycle hooks (discoverable contract). Modules may register
// any namespaced hook, but these are the ones the core actually fires.
const KNOWN_HOOKS = {
  "page:beforeRender": { scope: "page", phase: "render", params: "{ title, content, path }", returns: "filtered options.content", sync: true },
  "page:afterRender": { scope: "page", phase: "render", params: "{ html, path }", returns: "filtered html", sync: true },
  "render:beforeRender": { scope: "render", phase: "render", params: "{ templateKey, params }", returns: "filtered params", sync: true },
  "render:afterRender": { scope: "render", phase: "render", params: "html string", returns: "filtered html", sync: true },
  "runtime:invalidated": { scope: "runtime", phase: "invalidation", params: "invalidation object", returns: "ignored (notification)", sync: true },
  "module:updated": { scope: "module", phase: "lifecycle", params: "{ id, stage }", returns: "ignored", sync: true },
  "module:disposed": { scope: "module", phase: "lifecycle", params: "{ id }", returns: "ignored", sync: true },
  "extension:loaded": { scope: "extension", phase: "lifecycle", params: "{ owner }", returns: "ignored", sync: true },
  "api:registered": { scope: "api", phase: "lifecycle", params: "{ reason, count }", returns: "ignored", sync: true },
  "api:invalidated": { scope: "api", phase: "invalidation", params: "{ dep|id }", returns: "ignored", sync: true },
  // Client/shared lifecycle vocabulary (§7): fired by the browser runtimes
  // (boundary/dom/navigation/data/update) and available for server use.
  // Alias-compatible with the render:/page: names above.
  "view:before-update": { scope: "view", phase: "update", params: "{ id|target }", returns: "ignored", sync: true },
  "view:after-update": { scope: "view", phase: "update", params: "{ id|target }", returns: "ignored", sync: true },
  "view:hydrate": { scope: "view", phase: "hydration", params: "{ id }", returns: "ignored", sync: true },
  "boundary:mount": { scope: "boundary", phase: "lifecycle", params: "{ id }", returns: "ignored", sync: true },
  "boundary:before-update": { scope: "boundary", phase: "update", params: "{ id|target }", returns: "ignored", sync: true },
  "boundary:after-update": { scope: "boundary", phase: "update", params: "{ id|target }", returns: "ignored", sync: true },
  "boundary:unmount": { scope: "boundary", phase: "lifecycle", params: "{ id }", returns: "ignored", sync: true },
  "dom:before-patch": { scope: "dom", phase: "update", params: "{ target }", returns: "false cancels", sync: true },
  "dom:after-patch": { scope: "dom", phase: "update", params: "{ target, strategy }", returns: "ignored", sync: true },
  "navigation:before": { scope: "navigation", phase: "navigation", params: "{ url }", returns: "false cancels", sync: true },
  "navigation:start": { scope: "navigation", phase: "navigation", params: "{ url }", returns: "ignored", sync: true },
  "navigation:after": { scope: "navigation", phase: "navigation", params: "{ url }", returns: "ignored", sync: true },
  "navigation:error": { scope: "navigation", phase: "navigation", params: "{ url, message }", returns: "ignored", sync: true },
  "data:request": { scope: "data", phase: "request", params: "{ url }", returns: "ignored", sync: true },
  "data:response": { scope: "data", phase: "request", params: "{ url }", returns: "ignored", sync: true },
  "data:error": { scope: "data", phase: "request", params: "{ url, message }", returns: "ignored", sync: true },
  "update:detected": { scope: "update", phase: "update", params: "invalidation", returns: "ignored", sync: true },
  "update:started": { scope: "update", phase: "update", params: "{ rev }", returns: "ignored", sync: true },
  "update:completed": { scope: "update", phase: "update", params: "{ rev, ms }", returns: "ignored", sync: true },
  "update:failed": { scope: "update", phase: "update", params: "{ message }", returns: "ignored", sync: true },
  // AcroxaJS render pipeline (Phases 2-6): fired by snapshot/diff/cache
  // layers at real lifecycle points. domain:action names — pass through
  // normalizeName unchanged.
  "render:afterSnapshot": { scope: "render", phase: "snapshot", params: "snapshot { page, version, hash }", returns: "ignored", sync: true },
  "render:afterDiff": { scope: "render", phase: "diff", params: "{ page, ops, unchanged }", returns: "ignored", sync: true },
  "render:patchSent": { scope: "render", phase: "patch", params: "patch envelope { page, patchId, fromVersion, toVersion, ops }", returns: "ignored", sync: true },
  "cache:hit": { scope: "cache", phase: "cache", params: "{ key, store }", returns: "ignored", sync: true },
  "cache:miss": { scope: "cache", phase: "cache", params: "{ key, store }", returns: "ignored", sync: true },
};

function describe(name = null) {
  if (name) {
    const n = normalizeName(name);
    return { hook: n, definition: KNOWN_HOOKS[n] || null, registrations: (hooks.get(n) || []).length };
  }
  const out = {};
  for (const [k, v] of Object.entries(KNOWN_HOOKS)) out[k] = { ...v, registrations: (hooks.get(k) || []).length };
  return out;
}

module.exports = { register, remove, run, runAsync, disposeOwner, list, stats, normalizeName, KNOWN_HOOKS, describe };
