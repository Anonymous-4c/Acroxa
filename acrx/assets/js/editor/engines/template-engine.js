// acrx/assets/js/editor/engines/template-engine.js
//
// ENGINE 41 — Template Engine (headless).
// Reusable document fragments with {{variable}} substitution: registration,
// metadata, versioning, instantiation with variable binding, validation.

export const TEMPLATE_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "template";

let templateCounter = 0;

function templateError(operation, code, message) {
  const err = new Error(message);
  err.name = "TemplateError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

const VAR_PATTERN = /\{\{\s*([a-zA-Z_$][\w$.]*)(?:\|([^}]*))?\s*\}\}/g;

export function listVariables(value) {
  const found = new Set();
  const scan = (v) => {
    if (typeof v === "string") {
      VAR_PATTERN.lastIndex = 0;
      let m;
      while ((m = VAR_PATTERN.exec(v)) !== null) found.add(m[1]);
    } else if (Array.isArray(v)) {
      for (const item of v) scan(item);
    } else if (v && typeof v === "object") {
      for (const key of Object.keys(v)) scan(v[key]);
    }
  };
  scan(value);
  return [...found];
}

function getPath(context, path) {
  return String(path).split(".").reduce((acc, seg) => (acc && typeof acc === "object" ? acc[seg] : undefined), context);
}

export function substituteVariables(value, variables = {}, opts = {}) {
  const missing = new Set();
  const fill = (v) => {
    if (typeof v === "string") {
      VAR_PATTERN.lastIndex = 0;
      return v.replace(VAR_PATTERN, (full, name, fallback) => {
        const resolved = getPath(variables, name);
        if (resolved === undefined || resolved === null) {
          if (fallback !== undefined) return fallback;
          missing.add(name);
          if (opts.strict) throw templateError("instantiate", "MISSING_VARIABLE", `Template variable "${name}" was not provided.`);
          return opts.keepUnresolved === false ? "" : full;
        }
        return String(resolved);
      });
    }
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === "object") {
      const out = {};
      for (const key of Object.keys(v)) out[key] = fill(v[key]);
      return out;
    }
    return v;
  };
  return { value: fill(value), missing: [...missing] };
}

export function createTemplateEngine() {
  const templates = new Map();

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return TEMPLATE_ENGINE_VERSION; },

    register(raw) {
      if (!raw || typeof raw !== "object") throw templateError("register", "INVALID_TEMPLATE", "Template must be an object.");
      if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
        throw templateError("register", "INVALID_TEMPLATE", "Template requires a non-empty nodes array.");
      }
      const tpl = {
        id: raw.id || `template_${(++templateCounter).toString(36)}`,
        name: raw.name || "Untitled template",
        description: raw.description || "",
        version: Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 1,
        variables: Array.isArray(raw.variables) ? [...raw.variables] : listVariables(raw.nodes),
        nodes: JSON.parse(JSON.stringify(raw.nodes)),
        meta: raw.meta && typeof raw.meta === "object" ? JSON.parse(JSON.stringify(raw.meta)) : {},
      };
      templates.set(tpl.id, tpl);
      return JSON.parse(JSON.stringify(tpl));
    },

    get(id) {
      const t = templates.get(id);
      return t ? JSON.parse(JSON.stringify(t)) : null;
    },

    has(id) {
      return templates.has(id);
    },

    list() {
      return [...templates.values()].map((t) => ({
        id: t.id, name: t.name, description: t.description,
        version: t.version, variables: [...t.variables], nodeCount: t.nodes.length,
      }));
    },

    unregister(id) {
      return templates.delete(id);
    },

    validate(id) {
      const errors = [];
      const t = templates.get(id);
      if (!t) return { valid: false, errors: [{ code: "NOT_FOUND", path: "", message: `Template "${id}" does not exist.`, severity: "error" }], warnings: [] };
      for (const name of listVariables(t.nodes)) {
        if (!t.variables.includes(name)) {
          errors.push({ code: "UNDECLARED_VARIABLE", path: "", message: `Variable "${name}" is used but not declared.`, severity: "error" });
        }
      }
      return { valid: errors.length === 0, errors, warnings: [] };
    },

    instantiate(id, variables = {}, opts = {}) {
      const t = templates.get(id);
      if (!t) throw templateError("instantiate", "NOT_FOUND", `Template "${id}" does not exist.`);
      const { value, missing } = substituteVariables(JSON.parse(JSON.stringify(t.nodes)), variables, opts);
      return { nodes: value, missing, templateId: id, version: t.version };
    },

    clear() { templates.clear(); },
    destroy() { templates.clear(); },
  };

  return engine;
}

export default createTemplateEngine;
