// acrx/assets/js/editor/engines/variable-engine.js
//
// ENGINE 42 — Variable/Dynamic Data Engine (headless, provider-agnostic).
// Dynamic variables, data bindings, dotted-path expressions with fallbacks,
// contextual resolution and serialization. No expression eval — only property
// navigation over caller-supplied context plus registered sync sources.

export const VARIABLE_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "variable";

function variableError(operation, code, message) {
  const err = new Error(message);
  err.name = "VariableError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function readPath(context, path) {
  if (!path) return undefined;
  return String(path).split(".").reduce((acc, seg) => (acc && typeof acc === "object" ? acc[seg] : undefined), context);
}

const EXPR_PATTERN = /\{\{\s*([^}|]+?)(?:\|([^}]*))?\s*\}\}/g;

export function listVariables(template) {
  const found = new Set();
  if (typeof template !== "string") return [];
  EXPR_PATTERN.lastIndex = 0;
  let m;
  while ((m = EXPR_PATTERN.exec(template)) !== null) found.add(m[1].trim());
  return [...found];
}

export function interpolate(template, context = {}, opts = {}) {
  if (typeof template !== "string") return { text: template, missing: [] };
  const missing = new Set();
  EXPR_PATTERN.lastIndex = 0;
  const text = template.replace(EXPR_PATTERN, (full, rawName, rawFallback) => {
    const name = rawName.trim();
    // "source.key" first tries a registered source, then plain context paths.
    const resolved = readPath(context, name);
    if (resolved === undefined || resolved === null) {
      if (rawFallback !== undefined) return rawFallback;
      missing.add(name);
      if (opts.strict) throw variableError("interpolate", "MISSING_VARIABLE", `Variable "${name}" is not available.`);
      return opts.keepUnresolved === false ? "" : full;
    }
    return String(resolved);
  });
  return { text, missing: [...missing] };
}

export function createVariableEngine() {
  const sources = new Map(); // name -> { resolve(ctx), description }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return VARIABLE_ENGINE_VERSION; },

    registerSource(name, resolve, opts = {}) {
      if (typeof name !== "string" || name === "") throw variableError("registerSource", "INVALID_SOURCE", "Source requires a non-empty name.");
      if (typeof resolve !== "function") throw variableError("registerSource", "INVALID_SOURCE", `Source "${name}" requires a resolve(context) function.`);
      sources.set(name, { resolve, description: opts.description || "" });
      return name;
    },

    unregisterSource(name) {
      return sources.delete(name);
    },

    listSources() {
      return [...sources.entries()].map(([name, s]) => ({ name, description: s.description }));
    },

    // bindings: [{ path, source, key?, fallback? }] -> { values: {path: value}, missing: [] }
    // path = where to write in the output map; source.key navigates the
    // source payload; fallback applies when resolution yields undefined.
    resolveBindings(bindings, context = {}) {
      if (!Array.isArray(bindings)) throw variableError("resolveBindings", "INVALID_BINDINGS", "Bindings must be an array.");
      const values = {};
      const missing = [];
      for (const b of bindings) {
        if (!b || typeof b.path !== "string") {
          missing.push({ path: b && b.path, reason: "Binding requires a string path." });
          continue;
        }
        const entry = sources.get(b.source);
        let resolved;
        if (!entry) {
          resolved = readPath(context, b.key || b.source);
        } else {
          try {
            const payload = entry.resolve(context);
            resolved = b.key ? readPath(payload, b.key) : payload;
          } catch (err) {
            missing.push({ path: b.path, reason: `Source "${b.source}" threw: ${err.message}.` });
            continue;
          }
        }
        if (resolved === undefined || resolved === null) {
          if (b.fallback !== undefined) values[b.path] = b.fallback;
          else missing.push({ path: b.path, reason: `Unresolved binding "${b.source}${b.key ? `.${b.key}` : ""}".` });
        } else {
          values[b.path] = resolved;
        }
      }
      return { values, missing };
    },

    interpolate: (template, context, opts) => interpolate(template, context, opts),
    listVariables,

    validateBinding(binding) {
      const errors = [];
      if (!binding || typeof binding !== "object") {
        return { valid: false, errors: [{ code: "INVALID_BINDING", path: "", message: "Binding must be an object.", severity: "error" }], warnings: [] };
      }
      if (typeof binding.path !== "string" || binding.path === "") {
        errors.push({ code: "MISSING_PATH", path: "path", message: "Binding requires a target path.", severity: "error" });
      }
      if (typeof binding.source !== "string" || binding.source === "") {
        errors.push({ code: "MISSING_SOURCE", path: "source", message: "Binding requires a source name.", severity: "error" });
      } else if (!sources.has(binding.source)) {
        errors.push({ code: "UNKNOWN_SOURCE", path: "source", message: `Unknown source "${binding.source}".`, severity: "error" });
      }
      return { valid: errors.length === 0, errors, warnings: [] };
    },
  };

  return engine;
}

export default createVariableEngine;
