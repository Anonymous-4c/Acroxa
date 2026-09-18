// src/core/runtime/extensions.js
// Acroxa extension registry (NOT "plugins" — Acroxa terminology is extension).
// Code-first: extensions register via pluginAPI.registerExtension() or
// manifest files under src/extensions/*/manifest.json when present.
// Each extension: { id, version, deps[], conflicts[], capabilities[],
//   boundaries[], scripts[], styles[], hooks[], criticality, enabled }.
// Conflict detection explains shared targets/mutations — never just
// "Conflict detected." Owner-scoped disposal via registry.disposeOwner.

"use strict";

const registry = require("./registry");
const graph = require("./graph");

const store = new Map(); // id -> record
const GLOBAL_KEY = "__acroxa_extensions__";

function _slot() {
  if (!global[GLOBAL_KEY]) global[GLOBAL_KEY] = { enabled: new Set(), disabled: new Set() };
  return global[GLOBAL_KEY];
}

const ID_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/i;
const VER_RE = /^[0-9]+\.[0-9]+\.[0-9]+([-+][a-zA-Z0-9.-]+)?$/;

function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== "object") return { ok: false, errors: ["manifest must be an object"] };
  if (typeof m.id !== "string" || !ID_RE.test(m.id)) errors.push(`invalid id: ${m && m.id}`);
  if (m.version !== undefined && m.version !== null &&
      (typeof m.version !== "string" || !VER_RE.test(m.version)))
    errors.push(`invalid version (semver required): ${m.version}`);
  for (const k of ["deps", "conflicts", "capabilities", "boundaries", "scripts", "styles", "hooks"]) {
    if (m[k] !== undefined && !Array.isArray(m[k])) errors.push(`${k} must be an array`);
  }
  if (m.criticality !== undefined &&
      !["core", "system", "normal", "optional"].includes(String(m.criticality)))
    errors.push(`invalid criticality: ${m.criticality}`);
  return { ok: errors.length === 0, errors };
}

function register(manifest = {}, { owner = null } = {}) {
  const { ok, errors } = validateManifest(manifest);
  if (!ok) throw new Error(`[extensions] invalid manifest: ${errors.join("; ")}`);
  const id = String(manifest.id);
  const slot = _slot();
  const prev = store.get(id);
  const record = {
    id,
    version: manifest.version || (prev && prev.version) || "0.0.0",
    deps: Array.isArray(manifest.deps) ? manifest.deps.slice(0, 50) : (prev ? prev.deps : []),
    conflicts: Array.isArray(manifest.conflicts) ? manifest.conflicts.slice(0, 50) : (prev ? prev.conflicts : []),
    capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities.slice(0, 100) : (prev ? prev.capabilities : []),
    boundaries: Array.isArray(manifest.boundaries) ? manifest.boundaries.slice(0, 200) : (prev ? prev.boundaries : []),
    scripts: Array.isArray(manifest.scripts) ? manifest.scripts.slice(0, 20) : (prev ? prev.scripts : []),
    styles: Array.isArray(manifest.styles) ? manifest.styles.slice(0, 20) : (prev ? prev.styles : []),
    hooks: Array.isArray(manifest.hooks) ? manifest.hooks.slice(0, 100) : (prev ? prev.hooks : []),
    apis: Array.isArray(manifest.apis) ? manifest.apis.slice(0, 100) : (prev ? prev.apis : []),
    criticality: manifest.criticality || (prev && prev.criticality) || "normal",
    enabled: manifest.enabled !== undefined ? !!manifest.enabled : (prev ? prev.enabled : !slot.disabled.has(id)),
    owner: owner || manifest.owner || `extension:${id}`,
    updatedAt: Date.now(),
  };
  store.set(id, record);
  if (record.enabled) { slot.enabled.add(id); slot.disabled.delete(id); }
  else { slot.disabled.add(id); slot.enabled.delete(id); }
  // Registry mirror (disposable) + graph edges (extension → boundaries).
  try {
    registry.register({
      type: "extension", owner: record.owner, name: id,
      version: record.version, deps: record.deps,
      meta: { capabilities: record.capabilities, criticality: record.criticality, enabled: record.enabled },
      dispose: null,
    });
  } catch (_) {}
  try {
    if (record.boundaries.length) graph.depend(`extension:${id}`, record.boundaries);
  } catch (_) {}
  try { require("./events").emit("extension:loaded", { id, version: record.version }); } catch (_) {}
  try { require("./revision").bump(`extension:${id}`, "module"); } catch (_) {}
  try { require("./debug").log("extensions", `registered ${id}@${record.version} (${record.boundaries.length} boundaries)`); } catch (_) {}
  return { ...record };
}

function get(id) {
  const r = store.get(String(id));
  return r ? { ...r, deps: [...r.deps], boundaries: [...r.boundaries] } : null;
}

function list({ enabledOnly = false } = {}) {
  return [...store.values()]
    .filter((r) => !enabledOnly || r.enabled)
    .map((r) => ({ ...r }));
}

function setEnabled(id, enabled) {
  const r = store.get(String(id));
  if (!r) return false;
  r.enabled = !!enabled;
  r.updatedAt = Date.now();
  const slot = _slot();
  if (r.enabled) { slot.enabled.add(r.id); slot.disabled.delete(r.id); }
  else { slot.disabled.add(r.id); slot.enabled.delete(r.id); }
  try { require("./registry").mark(`extension:${r.owner}:${r.id}`, r.enabled ? "active" : "disposed", { enabled: r.enabled }); } catch (_) {}
  try { require("./events").emit(r.enabled ? "extension:loaded" : "extension:unloaded", { id: r.id }); } catch (_) {}
  try { require("./revision").bump(`extension:${r.id}:${r.enabled ? "enable" : "disable"}`, "module"); } catch (_) {}
  return true;
}

function unregister(id) {
  const r = store.get(String(id));
  if (!r) return false;
  store.delete(String(id));
  try { graph.remove(`extension:${id}`); } catch (_) {}
  try { require("./events").emit("extension:unloaded", { id: String(id) }); } catch (_) {}
  return true;
}

// Detect shared-target / hook / route / dependency conflicts between
// enabled extensions. Returns [{ a, b, targets[], hooks[], routes[],
// reason }] with human explanations — never bare "Conflict detected."
function detectConflicts() {
  const enabled = [...store.values()].filter((r) => r.enabled);
  const out = [];
  // Declared conflicts (semver-agnostic id match).
  for (const r of enabled) {
    for (const c of r.conflicts || []) {
      const other = store.get(String(c));
      if (other && other.enabled) {
        out.push({
          a: r.id, b: other.id, targets: [], hooks: [], routes: [],
          kind: "declared",
          reason: `Extension ${r.id} declares a conflict with ${other.id}. Only one should be enabled.`,
        });
      }
    }
  }
  // Shared boundaries / hooks / apis.
  for (let i = 0; i < enabled.length; i++) {
    for (let j = i + 1; j < enabled.length; j++) {
      const a = enabled[i];
      const b = enabled[j];
      const sharedTargets = (a.boundaries || []).filter((t) => (b.boundaries || []).includes(t));
      const sharedHooks = (a.hooks || []).filter((h) => (b.hooks || []).includes(h));
      const sharedApis = (a.apis || []).filter((u) => (b.apis || []).includes(u));
      if (sharedTargets.length || sharedHooks.length || sharedApis.length) {
        const parts = [];
        if (sharedTargets.length) parts.push(`shared boundaries: ${sharedTargets.slice(0, 5).join(", ")}`);
        if (sharedHooks.length) parts.push(`shared hooks: ${sharedHooks.slice(0, 5).join(", ")}`);
        if (sharedApis.length) parts.push(`shared routes: ${sharedApis.slice(0, 5).join(", ")}`);
        out.push({
          a: a.id, b: b.id,
          targets: sharedTargets.slice(0, 20),
          hooks: sharedHooks.slice(0, 20),
          routes: sharedApis.slice(0, 20),
          kind: "shared-target",
          reason: `Extension ${a.id} and ${b.id} both affect ${parts.join("; ")}. ` +
            (sharedTargets.length ? `Potentially affected: ${sharedTargets.slice(0, 3).join(", ")}. ` : "") +
            `Reason: both registered mutations against the same runtime boundary.`,
        });
      }
    }
  }
  return out;
}

function ownerOfBoundary(boundaryId) {
  for (const r of store.values()) {
    if ((r.boundaries || []).includes(boundaryId)) return r.id;
  }
  return null;
}

function stats() {
  const all = [...store.values()];
  return {
    total: all.length,
    enabled: all.filter((r) => r.enabled).length,
    disabled: all.filter((r) => !r.enabled).length,
    conflicts: detectConflicts().length,
  };
}

function clear() {
  store.clear();
}

module.exports = {
  register, get, list, setEnabled, unregister,
  detectConflicts, ownerOfBoundary, stats, clear, validateManifest,
};
