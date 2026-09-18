// src/core/runtime/lifecycle.js
//
// Predictable module lifecycle with mandatory cleanup.
// Stages (not every module needs all): discover → load → initialize →
// register → activate → update → deactivate → dispose → unregister → invalidate.
//
// Usage:
//   const mod = defineModule({ id: "extension:gallery", owner: "gallery", ...handlers });
//   await mod.activate(ctx); ... await mod.dispose(ctx);
//
// Error isolation: a failing module is marked failed, its registrations are
// cleaned, core stays alive. Never throws out of dispose().

"use strict";

const registry = require("./registry");
const events = require("./events");

const STAGES = [
  "discover", "load", "initialize", "register",
  "activate", "update", "deactivate", "dispose",
  "unregister", "invalidate",
];

function defineModule({ id, type = "module", owner = "core", version = null, deps = [], meta = {}, handlers = {} }) {
  if (!id) throw new Error("[lifecycle] defineModule requires { id }");
  for (const k of Object.keys(handlers)) {
    if (!STAGES.includes(k)) throw new Error(`[lifecycle] unknown stage "${k}" for ${id}`);
    if (typeof handlers[k] !== "function") throw new Error(`[lifecycle] stage "${k}" must be a function for ${id}`);
  }
  const state = { stage: "defined", failures: 0, lastError: null, updatedAt: Date.now() };

  async function run(stage, ctx = {}) {
    const fn = handlers[stage];
    state.stage = stage;
    state.updatedAt = Date.now();
    if (!fn) return { id, stage, skipped: true };
    try {
      const result = await fn(ctx);
      events.emit("module:updated", { id, stage });
      return { id, stage, result };
    } catch (err) {
      state.failures++;
      state.lastError = err.message;
      registry.mark(registry.makeId(type, owner, id), "failed", { lastError: err.message });
      console.error(`[lifecycle] ${id} stage "${stage}" failed:`, err.message);
      events.emit("module:disposed", { id, stage, error: err.message });
      return { id, stage, error: err.message };
    }
  }

  const api = {
    id, type, owner, version, deps,
    get stage() { return state.stage; },
    get failures() { return state.failures; },
    activate: (ctx) => run("activate", ctx),
    update: (ctx) => run("update", ctx),
    deactivate: (ctx) => run("deactivate", ctx),
    run,
    async dispose(ctx = {}) {
      const out = await run("dispose", ctx);
      await registry.disposeOwner(owner);
      events.disposeOwner(owner);
      state.stage = "disposed";
      return out;
    },
  };

  registry.register({
    type, owner, name: id, version, deps,
    meta: { ...meta, stages: Object.keys(handlers) },
    status: "active",
    dispose: async () => { try { if (handlers.dispose) await handlers.dispose({}); } catch (_) {} },
  });

  return api;
}

/**
 * Track a disposable resource under an owner so module unload cleans it up.
 * Returns the resource's own disposer.
 */
function track(owner, type, name, dispose, meta = {}) {
  return registry.register({ type, owner, name, meta, dispose });
}

module.exports = { STAGES, defineModule, track };
