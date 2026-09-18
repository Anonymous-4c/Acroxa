// acrx/assets/js/editor/engines/plugin-engine.js
//
// ENGINE 43 — Plugin Engine (headless).
// Modular plugins with registration, versioned manifests, dependency checks,
// capability grants, lifecycle (install/activate/deactivate/uninstall),
// contributions (commands, widgets, renderers, settings, schemas) and
// cleanup. Plugins receive a capability-gated host API — never raw core
// internals.

export const PLUGIN_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "plugin";

const CONTRIBUTION_KINDS = ["commands", "widgets", "renderers", "settings", "schemas"];

function pluginError(operation, code, message) {
  const err = new Error(message);
  err.name = "PluginError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

export function createPluginEngine(options = {}) {
  const host = options.host || {};
  const plugins = new Map(); // id -> record
  const listeners = new Map();

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try { cb({ engine: ENGINE_ID, event, ...payload }); } catch (err) {
        if (typeof console !== "undefined") console.error(`[plugin] listener for "${event}" threw:`, err);
      }
    }
  }

  function gatedApi(record) {
    const granted = record.granted;
    const api = { pluginId: record.manifest.id, host };
    // Capability-gated host surface. Unknown capabilities expose nothing.
    if (granted.has("commands") && host.commands) api.commands = host.commands;
    if (granted.has("documents") && host.documents) api.documents = host.documents;
    if (granted.has("events") && host.events) api.events = host.events;
    if (granted.has("settings") && host.settings) api.settings = host.settings;
    return Object.freeze(api);
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return PLUGIN_ENGINE_VERSION; },

    register(manifest) {
      if (!manifest || typeof manifest !== "object") throw pluginError("register", "INVALID_MANIFEST", "Plugin manifest must be an object.");
      if (typeof manifest.id !== "string" || manifest.id === "") throw pluginError("register", "INVALID_MANIFEST", "Plugin requires a non-empty string id.");
      if (manifest.activate !== undefined && typeof manifest.activate !== "function") {
        throw pluginError("register", "INVALID_MANIFEST", `Plugin "${manifest.id}": activate must be a function.`);
      }
      if (manifest.deactivate !== undefined && typeof manifest.deactivate !== "function") {
        throw pluginError("register", "INVALID_MANIFEST", `Plugin "${manifest.id}": deactivate must be a function.`);
      }
      const existed = plugins.has(manifest.id);
      plugins.set(manifest.id, {
        manifest: {
          id: manifest.id,
          name: manifest.name || manifest.id,
          version: manifest.version || "1.0.0",
          description: manifest.description || "",
          dependencies: Array.isArray(manifest.dependencies) ? [...manifest.dependencies] : [],
          capabilities: Array.isArray(manifest.capabilities) ? [...manifest.capabilities] : [],
          activate: manifest.activate || null,
          deactivate: manifest.deactivate || null,
        },
        status: existed ? plugins.get(manifest.id).status : "registered",
        granted: existed ? plugins.get(manifest.id).granted : new Set(),
        contributions: existed ? plugins.get(manifest.id).contributions : { commands: [], widgets: [], renderers: [], settings: [], schemas: [] },
        error: null,
      });
      emit("plugin:registered", { id: manifest.id, updated: existed });
      return manifest.id;
    },

    grant(pluginId, capabilities) {
      const record = plugins.get(pluginId);
      if (!record) throw pluginError("grant", "NOT_FOUND", `Plugin "${pluginId}" is not registered.`);
      for (const cap of Array.isArray(capabilities) ? capabilities : [capabilities]) record.granted.add(cap);
      return [...record.granted];
    },

    can(pluginId, capability) {
      const record = plugins.get(pluginId);
      return !!record && record.granted.has(capability);
    },

    dependenciesSatisfied(pluginId) {
      const record = plugins.get(pluginId);
      if (!record) throw pluginError("dependenciesSatisfied", "NOT_FOUND", `Plugin "${pluginId}" is not registered.`);
      const missing = record.manifest.dependencies.filter((dep) => {
        const other = plugins.get(dep);
        return !other || other.status !== "active";
      });
      return { ok: missing.length === 0, missing };
    },

    install(pluginId) {
      const record = plugins.get(pluginId);
      if (!record) throw pluginError("install", "NOT_FOUND", `Plugin "${pluginId}" is not registered.`);
      if (record.status === "active") throw pluginError("install", "INVALID_STATE", `Plugin "${pluginId}" is already active.`);
      record.status = "installed";
      emit("plugin:installed", { id: pluginId });
      return record.status;
    },

    activate(pluginId) {
      const record = plugins.get(pluginId);
      if (!record) throw pluginError("activate", "NOT_FOUND", `Plugin "${pluginId}" is not registered.`);
      if (record.status === "active") return record.status;
      const deps = engine.dependenciesSatisfied(pluginId);
      if (!deps.ok) {
        throw pluginError("activate", "MISSING_DEPENDENCY", `Plugin "${pluginId}" misses active dependencies: ${deps.missing.join(", ")}.`);
      }
      if (record.manifest.activate) {
        try {
          record.manifest.activate(gatedApi(record));
        } catch (err) {
          record.error = err.message;
          throw pluginError("activate", "ACTIVATE_FAILED", `Plugin "${pluginId}" failed to activate: ${err.message}.`);
        }
      }
      record.status = "active";
      record.error = null;
      emit("plugin:activated", { id: pluginId });
      return record.status;
    },

    deactivate(pluginId) {
      const record = plugins.get(pluginId);
      if (!record) throw pluginError("deactivate", "NOT_FOUND", `Plugin "${pluginId}" is not registered.`);
      if (record.status !== "active") return record.status;
      if (record.manifest.deactivate) {
        try {
          record.manifest.deactivate(gatedApi(record));
        } catch (err) {
          throw pluginError("deactivate", "DEACTIVATE_FAILED", `Plugin "${pluginId}" failed to deactivate: ${err.message}.`);
        }
      }
      // Cleanup: contributions are purged so a disabled plugin leaves nothing.
      record.contributions = { commands: [], widgets: [], renderers: [], settings: [], schemas: [] };
      record.status = "inactive";
      emit("plugin:deactivated", { id: pluginId });
      return record.status;
    },

    uninstall(pluginId) {
      const record = plugins.get(pluginId);
      if (!record) return false;
      if (record.status === "active") engine.deactivate(pluginId);
      plugins.delete(pluginId);
      emit("plugin:uninstalled", { id: pluginId });
      return true;
    },

    contribute(pluginId, kind, items) {
      const record = plugins.get(pluginId);
      if (!record) throw pluginError("contribute", "NOT_FOUND", `Plugin "${pluginId}" is not registered.`);
      if (!CONTRIBUTION_KINDS.includes(kind)) throw pluginError("contribute", "INVALID_CONTRIBUTION", `Unknown contribution kind "${kind}".`);
      const list = Array.isArray(items) ? items : [items];
      record.contributions[kind].push(...JSON.parse(JSON.stringify(list)));
      emit("plugin:contributed", { id: pluginId, kind, count: list.length });
      return record.contributions[kind].length;
    },

    contributionsOf(pluginId, kind) {
      const record = plugins.get(pluginId);
      if (!record) throw pluginError("contributionsOf", "NOT_FOUND", `Plugin "${pluginId}" is not registered.`);
      if (kind) return JSON.parse(JSON.stringify(record.contributions[kind] || []));
      return JSON.parse(JSON.stringify(record.contributions));
    },

    status(pluginId) {
      const record = plugins.get(pluginId);
      if (!record) return null;
      return {
        id: record.manifest.id, name: record.manifest.name, version: record.manifest.version,
        status: record.status, capabilities: [...record.granted], error: record.error,
      };
    },

    list() {
      return [...plugins.values()].map((r) => engine.status(r.manifest.id));
    },

    on(event, cb) {
      if (typeof cb !== "function") throw pluginError("on", "INVALID_LISTENER", "Listener must be a function.");
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

    clear() { plugins.clear(); },
    destroy() { plugins.clear(); listeners.clear(); },
  };

  return engine;
}

export default createPluginEngine;
