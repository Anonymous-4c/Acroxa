// acrx/assets/js/editor/engines/form-engine.js
//
// ENGINE 38 — Form Engine (headless).
// Future form widgets: structures, fields, labels, defaults, validation
// rules, field state, submission serialization and accessibility metadata.

export const FORM_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "form";

const FIELD_TYPES = new Set(["text", "email", "number", "textarea", "select", "checkbox", "radio", "date", "hidden"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formError(operation, code, message) {
  const err = new Error(message);
  err.name = "FormError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function normalizeField(raw, index) {
  if (!raw || typeof raw !== "object") throw formError("field", "INVALID_FIELD", `Field at index ${index} must be an object.`);
  const type = FIELD_TYPES.has(raw.type) ? raw.type : "text";
  const name = String(raw.name || raw.id || `field_${index}`);
  return {
    id: String(raw.id || name),
    name,
    type,
    label: raw.label !== undefined ? String(raw.label) : "",
    required: raw.required === true,
    default: raw.default !== undefined ? raw.default : (type === "checkbox" ? false : ""),
    placeholder: raw.placeholder || "",
    options: Array.isArray(raw.options) ? raw.options.map(String) : [],
    minLength: raw.minLength, maxLength: raw.maxLength,
    minimum: raw.minimum, maximum: raw.maximum, pattern: raw.pattern,
    help: raw.help || "",
  };
}

function validateFieldValue(field, value) {
  const issues = [];
  const empty = value === undefined || value === null || value === "" || (field.type === "checkbox" && value === false);
  if (empty) {
    if (field.required) issues.push({ code: "REQUIRED", path: field.name, message: `"${field.label || field.name}" is required.`, severity: "error" });
    return issues;
  }
  if (field.type === "email" && !EMAIL_PATTERN.test(String(value))) {
    issues.push({ code: "BAD_EMAIL", path: field.name, message: `"${field.label || field.name}" must be a valid email.`, severity: "error" });
  }
  if (field.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) issues.push({ code: "BAD_NUMBER", path: field.name, message: `"${field.label || field.name}" must be a number.`, severity: "error" });
    else {
      if (field.minimum !== undefined && n < field.minimum) issues.push({ code: "MINIMUM", path: field.name, message: `"${field.label || field.name}" must be at least ${field.minimum}.`, severity: "error" });
      if (field.maximum !== undefined && n > field.maximum) issues.push({ code: "MAXIMUM", path: field.name, message: `"${field.label || field.name}" must be at most ${field.maximum}.`, severity: "error" });
    }
  }
  if (typeof value === "string") {
    if (field.minLength !== undefined && value.length < field.minLength) issues.push({ code: "MIN_LENGTH", path: field.name, message: `"${field.label || field.name}" is too short.`, severity: "error" });
    if (field.maxLength !== undefined && value.length > field.maxLength) issues.push({ code: "MAX_LENGTH", path: field.name, message: `"${field.label || field.name}" is too long.`, severity: "error" });
    if (field.pattern) {
      let re = null;
      try { re = new RegExp(field.pattern); } catch { re = null; }
      if (re && !re.test(value)) issues.push({ code: "PATTERN", path: field.name, message: `"${field.label || field.name}" has an invalid format.`, severity: "error" });
    }
  }
  if ((field.type === "select" || field.type === "radio") && field.options.length > 0 && !field.options.includes(String(value))) {
    issues.push({ code: "BAD_OPTION", path: field.name, message: `"${field.label || field.name}" has an invalid option.`, severity: "error" });
  }
  return issues;
}

export function createFormEngine() {
  const forms = new Map();

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return FORM_ENGINE_VERSION; },
    get fieldTypes() { return [...FIELD_TYPES]; },

    define(raw) {
      if (!raw || typeof raw !== "object") throw formError("define", "INVALID_FORM", "Form definition must be an object.");
      if (!Array.isArray(raw.fields) || raw.fields.length === 0) {
        throw formError("define", "INVALID_FORM", "Form requires a non-empty fields array.");
      }
      const form = {
        id: String(raw.id || `form_${Date.now().toString(36)}`),
        name: raw.name || "Untitled form",
        action: raw.action || "",
        method: (raw.method || "POST").toUpperCase(),
        fields: raw.fields.map(normalizeField),
        meta: raw.meta && typeof raw.meta === "object" ? JSON.parse(JSON.stringify(raw.meta)) : {},
      };
      forms.set(form.id, form);
      return JSON.parse(JSON.stringify(form));
    },

    get(id) {
      const f = forms.get(id);
      return f ? JSON.parse(JSON.stringify(f)) : null;
    },

    has(id) { return forms.has(id); },

    list() {
      return [...forms.values()].map((f) => ({ id: f.id, name: f.name, fieldCount: f.fields.length }));
    },

    unregister(id) { return forms.delete(id); },

    initialValues(id) {
      const form = forms.get(id);
      if (!form) throw formError("initialValues", "NOT_FOUND", `Form "${id}" does not exist.`);
      const out = {};
      for (const f of form.fields) out[f.name] = JSON.parse(JSON.stringify(f.default));
      return out;
    },

    validate(id, values = {}) {
      const form = forms.get(id);
      if (!form) throw formError("validate", "NOT_FOUND", `Form "${id}" does not exist.`);
      const errors = [];
      const warnings = [];
      for (const field of form.fields) {
        errors.push(...validateFieldValue(field, values[field.name]));
        if (field.type !== "hidden" && !field.label) {
          warnings.push({ code: "FIELD_NO_LABEL", path: field.name, message: `Field "${field.name}" has no label.`, severity: "warning" });
        }
      }
      const known = new Set(form.fields.map((f) => f.name));
      for (const key of Object.keys(values)) {
        if (!known.has(key)) warnings.push({ code: "UNKNOWN_FIELD", path: key, message: `Unknown field "${key}" will be ignored on submit.`, severity: "warning" });
      }
      return { valid: errors.length === 0, errors, warnings };
    },

    // Submission payload: known fields only, trimmed strings, with metadata.
    serializeSubmission(id, values = {}) {
      const form = forms.get(id);
      if (!form) throw formError("serializeSubmission", "NOT_FOUND", `Form "${id}" does not exist.`);
      const data = {};
      for (const field of form.fields) {
        let v = values[field.name] !== undefined ? values[field.name] : field.default;
        if (typeof v === "string") v = v.trim();
        data[field.name] = v;
      }
      const check = engine.validate(id, data);
      if (!check.valid) {
        throw formError("serializeSubmission", check.errors[0].code, `Invalid submission: ${check.errors[0].message}.`);
      }
      return { formId: id, formName: form.name, data, submittedAt: new Date().toISOString() };
    },

    describe(id) {
      const form = forms.get(id);
      if (!form) throw formError("describe", "NOT_FOUND", `Form "${id}" does not exist.`);
      return {
        id: form.id, name: form.name,
        fields: form.fields.map((f) => ({
          ...JSON.parse(JSON.stringify(f)),
          accessible: f.type === "hidden" || f.label !== "",
        })),
      };
    },

    clear() { forms.clear(); },
    destroy() { forms.clear(); },
  };

  return engine;
}

export default createFormEngine;
