// acrx/assets/js/editor/engines/command-engine.js
//
// ENGINE 08 — Command Engine (headless).
// Central command abstraction: registration, metadata, precondition checks,
// enable/disable, composition (macros), execution with events and structured
// errors. Commands operate on injected context (document, selection, ...),
// never on arbitrary DOM.

export const COMMAND_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "command";

function cmdError(operation, code, message) {
  const err = new Error(message);
  err.name = "CommandError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

export function createCommandEngine(options = {}) {
  const commands = new Map();
  const disabled = new Set();
  const listeners = new Map();
  let context = options.context || {};

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return true;
    let proceed = true;
    for (const cb of [...set]) {
      try {
        const out = cb({ engine: ENGINE_ID, event, ...payload });
        if (out === false) proceed = false;
      } catch (err) {
        if (typeof console !== "undefined") console.error(`[command] listener for "${event}" threw:`, err);
      }
    }
    return proceed;
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return COMMAND_ENGINE_VERSION; },

    setContext(ctx) {
      context = ctx || {};
    },

    getContext() {
      return context;
    },

    register(def) {
      if (!def || typeof def !== "object") throw cmdError("register", "INVALID_COMMAND", "Command definition must be an object.");
      if (typeof def.id !== "string" || def.id === "") throw cmdError("register", "INVALID_COMMAND", "Command requires a non-empty string id.");
      if (typeof def.run !== "function") throw cmdError("register", "INVALID_COMMAND", `Command "${def.id}" requires a run(ctx, args) function.`);
      if (def.precondition !== undefined && typeof def.precondition !== "function") {
        throw cmdError("register", "INVALID_COMMAND", `Command "${def.id}": precondition must be a function.`);
      }
      if (def.when !== undefined && typeof def.when !== "function") {
        throw cmdError("register", "INVALID_COMMAND", `Command "${def.id}": when must be a function.`);
      }
      if (def.keywords !== undefined && !Array.isArray(def.keywords)) {
        throw cmdError("register", "INVALID_COMMAND", `Command "${def.id}": keywords must be an array.`);
      }
      const existed = commands.has(def.id);
      commands.set(def.id, {
        id: def.id,
        label: def.label || def.id,
        category: def.category || "general",
        shortcut: def.shortcut || null,
        description: def.description || "",
        // Palette display metadata (inert for execution).
        icon: def.icon || null,
        keywords: Array.isArray(def.keywords) ? [...def.keywords] : [],
        when: def.when || null,
        danger: def.danger === true,
        run: def.run,
        precondition: def.precondition || null,
      });
      emit(existed ? "command:updated" : "command:registered", { id: def.id });
      return def.id;
    },

    // Macro: a new command executing existing commands in order, stopping
    // at the first failure and returning each step result.
    compose(id, commandIds, meta = {}) {
      if (!Array.isArray(commandIds) || commandIds.length === 0) {
        throw cmdError("compose", "INVALID_COMMAND", "compose() requires a non-empty array of command ids.");
      }
      return engine.register({
        id,
        label: meta.label || id,
        category: meta.category || "macro",
        description: meta.description || "",
        run: (ctx, args) => {
          const steps = [];
          for (const cid of commandIds) {
            const res = engine.execute(cid, (args && args[cid]) || {}, ctx);
            steps.push({ id: cid, ok: res.ok, result: res.result });
            if (!res.ok) return { steps, stoppedAt: cid };
          }
          return { steps };
        },
      });
    },

    unregister(id) {
      disabled.delete(id);
      return commands.delete(id);
    },

    has(id) {
      return commands.has(id);
    },

    metadata(id) {
      const c = commands.get(id);
      if (!c) return null;
      return { id: c.id, label: c.label, category: c.category, shortcut: c.shortcut, description: c.description, icon: c.icon, keywords: [...c.keywords], danger: c.danger, when: c.when, enabled: !disabled.has(id) };
    },

    list(category) {
      const out = [];
      for (const c of commands.values()) {
        if (category !== undefined && c.category !== category) continue;
        out.push(engine.metadata(c.id));
      }
      return out.sort((a, b) => (a.id < b.id ? -1 : 1));
    },

    enable(id) {
      disabled.delete(id);
    },

    disable(id) {
      disabled.add(id);
    },

    canExecute(id, args, ctx) {
      const c = commands.get(id);
      if (!c) return { ok: false, reason: `Unknown command "${id}".` };
      if (disabled.has(id)) return { ok: false, reason: `Command "${id}" is disabled.` };
      if (c.precondition) {
        try {
          const out = c.precondition(ctx !== undefined ? ctx : context, args || {});
          if (out === false) return { ok: false, reason: `Precondition for "${id}" failed.` };
          if (out && typeof out === "object" && out.ok === false) return { ok: false, reason: out.reason || `Precondition for "${id}" failed.` };
        } catch (err) {
          return { ok: false, reason: `Precondition for "${id}" threw: ${err.message}.` };
        }
      }
      return { ok: true };
    },

    execute(id, args, ctx) {
      const effective = ctx !== undefined ? ctx : context;
      const gate = engine.canExecute(id, args, effective);
      if (!gate.ok) {
        emit("command:rejected", { id, reason: gate.reason });
        return { ok: false, id, error: { code: "CANNOT_EXECUTE", message: gate.reason } };
      }
      emit("command:before", { id, args });
      try {
        const result = commands.get(id).run(effective, args || {});
        emit("command:after", { id, result });
        return { ok: true, id, result: result === undefined ? null : result };
      } catch (err) {
        const error = { code: err && err.code ? err.code : "COMMAND_FAILED", message: err && err.message ? err.message : String(err) };
        emit("command:error", { id, error });
        return { ok: false, id, error };
      }
    },

    on(event, cb) {
      if (typeof cb !== "function") throw cmdError("on", "INVALID_LISTENER", "Listener must be a function.");
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => engine.off(event, cb);
    },

    off(event, cb) {
      const set = listeners.get(event);
      if (!set) return;
      if (cb) { set.delete(cb); if (set.size === 0) listeners.delete(event); }
      else listeners.delete(event);
    },

    clear() {
      commands.clear();
      disabled.clear();
    },

    destroy() {
      commands.clear();
      disabled.clear();
      listeners.clear();
    },
  };

  return engine;
}

export default createCommandEngine;
