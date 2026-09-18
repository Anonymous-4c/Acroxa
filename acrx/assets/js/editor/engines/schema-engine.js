// acrx/assets/js/editor/engines/schema-engine.js
//
// ENGINE 22 — Schema Engine (headless foundation)
//
// Generic, UI-free schema system for all Acroxa editor JSON data.
// Foundation for widget definitions, widget settings, documents, SEO data,
// metadata and every other JSON-driven subsystem (spec sections 27, 52, 65).
//
// Design notes:
// - Headless: no DOM, no window/document access, no editor UI. Pure data in,
//   structured data out. Runs identically in the browser (ES module) and in
//   Node (imported as ESM) so server-side save paths can reuse it.
// - JSON-first: schema definitions are plain JSON-serializable objects, with
//   the single documented exception of `default` factories and `validate`
//   callbacks, which are runtime-only and stripped by exportSchemas()/toJSON.
// - Strict by default: unknown object fields are reported (UNKNOWN_FIELD)
//   unless the schema opts into additionalProperties or the caller overrides
//   per validate() call. No silent type coercion is ever performed.
// - validate() never throws for *value* problems; it returns a structured
//   result { valid, errors, warnings, value }. It only throws SchemaError for
//   programmer errors (unknown schema, bad version, invalid definition).
// - Existing RTE schema (editor/src/schema.js) is intentionally untouched:
//   it is an allow-list gate for rich-text nodes/marks, while this engine is
//   the generic structural schema system that other engines build on.
//
// Public API (named exports):
//   createSchemaRegistry(options) -> registry instance (isolated)
//   schemaRegistry               -> shared default instance (convenience)
//   defineSchema(def)            -> normalized + validated definition (unregistered)
//   validateValue(fieldSchema, value, path) -> { valid, errors, warnings, value }
//   applyDefaultsToValue(fieldSchema, value) -> cloned value with defaults
//   createSchemaError(code, message, details) -> SchemaError
//   isSchemaError(err) -> boolean
//   FieldTypes                   -> frozen map of supported type names
//   SCHEMA_ENGINE_VERSION        -> string
//
// Registry instance API:
//   register(def)                -> stored definition (frozen clone)
//   has(name, version?)          -> boolean
//   get(name, version?)          -> definition clone | null (latest when omitted)
//   versions(name)               -> number[] sorted ascending
//   list()                       -> [{ name, version, title, description }]
//   unregister(name, version?)   -> boolean
//   clear()                      -> void
//   destroy()                    -> void (clear + drop listeners)
//   validate(name, value, opts?) -> { valid, errors, warnings, value }
//   applyDefaults(name, value?, opts?) -> cloned value with defaults applied
//   registerMigration(name, fromVersion, toVersion, fn) -> void
//   hasMigration(name, fromVersion, toVersion) -> boolean
//   migrate(name, value, opts?)  -> { value, from, to, steps }
//   exportSchemas()              -> JSON-safe array of definitions
//   importSchemas(array)         -> number of schemas imported
//   on(event, callback)          -> unsubscribe fn
//   off(event, callback?)        -> void
//
// Events emitted: schema:registered, schema:unregistered, schema:validated,
// schema:migrated, schema:cleared. Listener exceptions are isolated and
// reported via console.error, never propagated into engine callers.

export const SCHEMA_ENGINE_VERSION = "1.0.0";

export const ENGINE_ID = "schema";

export const FieldTypes = Object.freeze({
  STRING: "string",
  NUMBER: "number",
  INTEGER: "integer",
  BOOLEAN: "boolean",
  OBJECT: "object",
  ARRAY: "array",
  ENUM: "enum",
  ANY: "any",
  NULL: "null",
});

const SUPPORTED_TYPES = new Set(Object.values(FieldTypes));

const SUPPORTED_FORMATS = new Set([
  "url",
  "email",
  "color",
  "slug",
  "id",
  "uuid",
  "date-time",
]);

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/;

// Common keywords allowed on any field schema (metadata / behaviour).
const COMMON_KEYS = new Set([
  "type",
  "title",
  "description",
  "examples",
  "required",
  "nullable",
  "default",
  "enum",
  "const",
  "format",
  "validate",
  "deprecated",
  "severity",
]);

// Type-specific keywords. Registration rejects anything outside
// COMMON_KEYS + the applicable set so schema-authoring typos fail fast.
const TYPE_KEYS = {
  string: new Set(["minLength", "maxLength", "pattern"]),
  number: new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]),
  integer: new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]),
  boolean: new Set([]),
  object: new Set(["fields", "additionalProperties", "minProperties", "maxProperties"]),
  array: new Set(["items", "minItems", "maxItems", "uniqueItems"]),
  enum: new Set(["values"]),
  any: new Set([]),
  null: new Set([]),
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_PATTERN = /^[^\s]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR_PATTERN = /^(?:#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)|hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)|hsla\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*,\s*(?:0|1|0?\.\d+)\s*\))$/i;
const RELATIVE_URL_PATTERN = /^(?:\/|#|\.\/|\.\.\/|mailto:|tel:)/i;

// ─── Structured errors ─────────────────────────────────────────────────────

export class SchemaError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SchemaError";
    this.code = code;
    this.engine = ENGINE_ID;
    this.operation = details.operation || null;
    this.path = details.path || null;
    this.cause = details.cause !== undefined ? details.cause : null;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      engine: this.engine,
      operation: this.operation,
      path: this.path,
    };
  }
}

export function createSchemaError(code, message, details = {}) {
  return new SchemaError(code, message, details);
}

export function isSchemaError(err) {
  return err instanceof SchemaError || (err != null && err.name === "SchemaError");
}

// ─── Internal: cloning / equality ──────────────────────────────────────────
//
// structuredClone() throws on functions, and schema definitions legitimately
// carry runtime-only functions (default factories, validate callbacks), so
// the engine uses its own clone that preserves functions by reference and is
// cycle-safe. Values flowing through validate()/applyDefaults() are cloned
// with the same routine so inputs are never mutated.

function cloneInternal(value, seen) {
  if (value === null || value === undefined) return value;
  const tag = typeof value;
  if (tag !== "object") return value; // primitives + functions by value/ref
  if (seen.has(value)) return seen.get(value);

  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (value instanceof Date) return new Date(value.getTime());

  if (Array.isArray(value)) {
    const out = [];
    seen.set(value, out);
    for (const item of value) out.push(cloneInternal(item, seen));
    return out;
  }

  const out = {};
  seen.set(value, out);
  for (const key of Object.keys(value)) {
    out[key] = cloneInternal(value[key], seen);
  }
  return out;
}

function clone(value) {
  return cloneInternal(value, new WeakMap());
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return Number.isNaN(a) && Number.isNaN(b);
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return (
      a instanceof RegExp &&
      b instanceof RegExp &&
      a.source === b.source &&
      a.flags === b.flags
    );
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item, seen);
  } else {
    for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  }
  return Object.freeze(value);
}

// JSON-safe export: functions cannot survive persistence/transport, so they
// are stripped (default factories, validate callbacks). The caller is told
// exactly what was stripped via the returned `stripped` list.
function toJsonSafe(value, stripped, path) {
  if (typeof value === "function") {
    stripped.push(path || "$");
    return undefined;
  }
  if (value instanceof RegExp) return { $regexp: value.source, $flags: value.flags };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i++) {
      const item = toJsonSafe(value[i], stripped, `${path || "$"}[${i}]`);
      if (item !== undefined) out.push(item);
    }
    return out;
  }
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      const item = toJsonSafe(value[key], stripped, path ? `${path}.${key}` : key);
      if (item !== undefined) out[key] = item;
    }
    return out;
  }
  return value;
}

// ─── Internal: paths ───────────────────────────────────────────────────────

function joinPath(base, key) {
  if (base === "" || base == null) return String(key);
  return `${base}.${key}`;
}

function joinIndexPath(base, index) {
  if (base === "" || base == null) return `[${index}]`;
  return `${base}[${index}]`;
}

// ─── Internal: definition normalization ────────────────────────────────────
//
// Accepts authoring shorthands and expands them to canonical field schemas:
//   fields: { title: "string" }              -> { title: { type: "string" } }
//   { type: "array", items: "string" }       -> items: { type: "string" }
//   { type: "string", pattern: /.../ }       -> pattern kept as RegExp

function normalizeFieldSchema(raw, path, operation) {
  if (typeof raw === "string") {
    raw = { type: raw };
  }
  if (!isPlainObject(raw)) {
    throw createSchemaError(
      "INVALID_FIELD",
      `Field schema at "${path || "<root>"}" must be an object or type-name shorthand.`,
      { operation, path: path || null }
    );
  }

  const field = { ...raw };

  if (typeof field.type !== "string" || !SUPPORTED_TYPES.has(field.type)) {
    throw createSchemaError(
      "INVALID_FIELD_TYPE",
      `Field "${path || "<root>"}" has unsupported type ${JSON.stringify(field.type)}.`,
      { operation, path: path || null }
    );
  }

  const allowed = new Set([...COMMON_KEYS, ...(TYPE_KEYS[field.type] || [])]);
  for (const key of Object.keys(field)) {
    if (!allowed.has(key)) {
      throw createSchemaError(
        "INVALID_FIELD",
        `Field "${path || "<root>"}" uses unknown keyword "${key}" for type "${field.type}".`,
        { operation, path: path || null }
      );
    }
  }

  if (field.required !== undefined && typeof field.required !== "boolean") {
    throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": "required" must be a boolean.`, {
      operation,
      path: path || null,
    });
  }
  if (field.nullable !== undefined && typeof field.nullable !== "boolean") {
    throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": "nullable" must be a boolean.`, {
      operation,
      path: path || null,
    });
  }
  if (field.severity !== undefined && field.severity !== "error" && field.severity !== "warning") {
    throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": "severity" must be "error" or "warning".`, {
      operation,
      path: path || null,
    });
  }
  if (field.validate !== undefined && typeof field.validate !== "function") {
    throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": "validate" must be a function.`, {
      operation,
      path: path || null,
    });
  }
  if (field.format !== undefined && !SUPPORTED_FORMATS.has(field.format)) {
    throw createSchemaError(
      "INVALID_FIELD",
      `Field "${path || "<root>"}" uses unknown format ${JSON.stringify(field.format)}.`,
      { operation, path: path || null }
    );
  }
  if (field.enum !== undefined && !Array.isArray(field.enum)) {
    throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": "enum" must be an array.`, {
      operation,
      path: path || null,
    });
  }

  if (field.type === "enum") {
    if (!Array.isArray(field.values) || field.values.length === 0) {
      throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": enum type requires a non-empty "values" array.`, {
        operation,
        path: path || null,
      });
    }
  }

  if (field.pattern !== undefined) {
    if (typeof field.pattern === "string") {
      try {
        field.pattern = new RegExp(field.pattern);
      } catch (err) {
        throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": "pattern" is not a valid regular expression.`, {
          operation,
          path: path || null,
          cause: err,
        });
      }
    } else if (!(field.pattern instanceof RegExp)) {
      throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": "pattern" must be a string or RegExp.`, {
        operation,
        path: path || null,
      });
    }
  }

  for (const key of ["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "minProperties", "maxProperties"]) {
    if (field[key] !== undefined && (typeof field[key] !== "number" || Number.isNaN(field[key]))) {
      throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": "${key}" must be a number.`, {
        operation,
        path: path || null,
      });
    }
  }
  for (const key of ["exclusiveMinimum", "exclusiveMaximum", "uniqueItems", "additionalProperties", "deprecated"]) {
    if (field[key] !== undefined && typeof field[key] !== "boolean") {
      throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": "${key}" must be a boolean.`, {
        operation,
        path: path || null,
      });
    }
  }

  if (field.type === "object") {
    if (field.fields !== undefined) {
      if (!isPlainObject(field.fields)) {
        throw createSchemaError("INVALID_FIELD", `Field "${path || "<root>"}": "fields" must be an object map.`, {
          operation,
          path: path || null,
        });
      }
      const normalized = {};
      for (const key of Object.keys(field.fields)) {
        normalized[key] = normalizeFieldSchema(field.fields[key], joinPath(path, key), operation);
      }
      field.fields = normalized;
    } else {
      field.fields = {};
    }
    if (field.additionalProperties === undefined) field.additionalProperties = false;
  }

  if (field.type === "array") {
    if (field.items !== undefined) {
      field.items = normalizeFieldSchema(field.items, joinPath(path, "[]"), operation);
    } else {
      field.items = { type: "any" };
    }
  }

  if (field.required === undefined) field.required = false;
  if (field.nullable === undefined) field.nullable = false;
  if (field.deprecated === undefined) field.deprecated = false;

  return field;
}

function normalizeDefinition(raw) {
  const operation = "register";
  if (!isPlainObject(raw)) {
    throw createSchemaError("INVALID_SCHEMA", "Schema definition must be an object.", { operation });
  }
  if (typeof raw.name !== "string" || !NAME_PATTERN.test(raw.name)) {
    throw createSchemaError(
      "INVALID_SCHEMA",
      'Schema "name" is required and must start with a letter followed by letters, digits, ".", "_", "-" or "/".',
      { operation }
    );
  }
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1) {
    throw createSchemaError("INVALID_SCHEMA", `Schema "${raw.name}": "version" must be a positive integer.`, {
      operation,
    });
  }

  const def = {
    name: raw.name,
    version: raw.version,
    title: raw.title !== undefined ? String(raw.title) : raw.name,
    description: raw.description !== undefined ? String(raw.description) : "",
  };

  // The root of a schema is itself a field schema. Default root type is object.
  const rootRaw = { ...raw };
  delete rootRaw.name;
  delete rootRaw.version;
  delete rootRaw.title;
  delete rootRaw.description;
  if (rootRaw.type === undefined) rootRaw.type = "object";

  const root = normalizeFieldSchema(rootRaw, "", operation);
  for (const key of Object.keys(root)) {
    def[key] = root[key];
  }
  return def;
}

// ─── Internal: formats ─────────────────────────────────────────────────────

function checkFormat(format, value) {
  switch (format) {
    case "email":
      return EMAIL_PATTERN.test(value) ? null : "must be a valid email address";
    case "slug":
      return SLUG_PATTERN.test(value) ? null : "must be a URL slug (lowercase letters, digits, hyphens)";
    case "id":
      return typeof value === "string" && value.length > 0 && ID_PATTERN.test(value)
        ? null
        : "must be a non-empty identifier without whitespace";
    case "uuid":
      return UUID_PATTERN.test(value) ? null : "must be a valid UUID";
    case "date-time":
      return Number.isNaN(Date.parse(value)) ? "must be a valid date-time string" : null;
    case "color":
      return COLOR_PATTERN.test(value) ? null : "must be a valid CSS color (hex, rgb/rgba, hsl/hsla)";
    case "url":
      if (RELATIVE_URL_PATTERN.test(value)) return null;
      try {
        const parsed = new URL(value);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return null;
        return "must be an http(s) URL, site-relative path, #anchor, mailto: or tel: link";
      } catch {
        return "must be a valid URL";
      }
    default:
      return null;
  }
}

// ─── Internal: value validation ────────────────────────────────────────────

function makeIssue(code, path, message, severity, extra = {}) {
  return {
    code,
    path: path || "",
    message,
    severity,
    ...(extra.expected !== undefined ? { expected: extra.expected } : {}),
    ...(extra.actual !== undefined ? { actual: extra.actual } : {}),
  };
}

function checkType(type, value) {
  switch (type) {
    case "any":
      return true;
    case "null":
      return value === null;
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && !Number.isNaN(value) && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "object":
      return isPlainObject(value);
    case "array":
      return Array.isArray(value);
    case "enum":
      return true; // membership checked separately via `values`
    default:
      return false;
  }
}

// Validates a single value against a normalized field schema.
// Appends issues to `errors` / `warnings`. Returns the (possibly stripped)
// cloned value to use downstream. Never mutates its input.
function validateField(field, value, path, errors, warnings, opts) {
  const severity = field.severity === "warning" ? "warning" : "error";
  const fail = (code, message, extra) => {
    const issue = makeIssue(code, path, message, severity, extra);
    if (severity === "warning") warnings.push(issue);
    else errors.push(issue);
  };

  if (value === undefined) {
    if (field.required) {
      fail("REQUIRED", `${path || "value"} is required.`);
    }
    return undefined;
  }

  if (value === null) {
    if (field.type === "null" || field.type === "any" || field.nullable) {
      if (field.deprecated) {
        warnings.push(makeIssue("DEPRECATED", path, `${path || "value"} is deprecated.`, "warning"));
      }
      runCustomValidator(field, value, path, errors, warnings);
      return null;
    }
    fail("TYPE_MISMATCH", `${path || "value"} must be of type "${field.type}" but received null.`, {
      expected: field.type,
      actual: null,
    });
    return null;
  }

  if (field.type === "enum") {
    const ok = field.values.some((candidate) => deepEqual(candidate, value));
    if (!ok) {
      fail("ENUM_MISMATCH", `${path || "value"} must be one of the allowed values.`, {
        expected: clone(field.values),
        actual: clone(value),
      });
      return clone(value);
    }
    if (field.deprecated) {
      warnings.push(makeIssue("DEPRECATED", path, `${path || "value"} is deprecated.`, "warning"));
    }
    runCustomValidator(field, value, path, errors, warnings);
    return clone(value);
  }

  if (!checkType(field.type, value)) {
    const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    fail("TYPE_MISMATCH", `${path || "value"} must be of type "${field.type}" but received "${actual}".`, {
      expected: field.type,
      actual: clone(value),
    });
    return clone(value);
  }

  const cloned = clone(value);

  if (field.const !== undefined && !deepEqual(cloned, field.const)) {
    fail("CONST_MISMATCH", `${path || "value"} must equal the fixed value.`, {
      expected: clone(field.const),
      actual: cloned,
    });
  }

  if (field.enum !== undefined) {
    const ok = field.enum.some((candidate) => deepEqual(candidate, cloned));
    if (!ok) {
      fail("ENUM_MISMATCH", `${path || "value"} must be one of the allowed values.`, {
        expected: clone(field.enum),
        actual: cloned,
      });
    }
  }

  switch (field.type) {
    case "string": {
      if (field.minLength !== undefined && cloned.length < field.minLength) {
        fail("MIN_LENGTH", `${path || "value"} must be at least ${field.minLength} characters long.`, {
          expected: field.minLength,
          actual: cloned.length,
        });
      }
      if (field.maxLength !== undefined && cloned.length > field.maxLength) {
        fail("MAX_LENGTH", `${path || "value"} must be at most ${field.maxLength} characters long.`, {
          expected: field.maxLength,
          actual: cloned.length,
        });
      }
      if (field.pattern && !field.pattern.test(cloned)) {
        fail("PATTERN", `${path || "value"} does not match the required pattern.`, {
          expected: String(field.pattern),
          actual: cloned,
        });
      }
      if (field.format) {
        const reason = checkFormat(field.format, cloned);
        if (reason) {
          fail("FORMAT", `${path || "value"} ${reason}.`, { expected: field.format, actual: cloned });
        }
      }
      break;
    }
    case "number":
    case "integer": {
      if (field.minimum !== undefined) {
        const violates = field.exclusiveMinimum ? cloned <= field.minimum : cloned < field.minimum;
        if (violates) {
          fail("MINIMUM", `${path || "value"} must be ${field.exclusiveMinimum ? "greater than" : "at least"} ${field.minimum}.`, {
            expected: field.minimum,
            actual: cloned,
          });
        }
      }
      if (field.maximum !== undefined) {
        const violates = field.exclusiveMaximum ? cloned >= field.maximum : cloned > field.maximum;
        if (violates) {
          fail("MAXIMUM", `${path || "value"} must be ${field.exclusiveMaximum ? "less than" : "at most"} ${field.maximum}.`, {
            expected: field.maximum,
            actual: cloned,
          });
        }
      }
      break;
    }
    case "object": {
      const fields = field.fields || {};
      const allowUnknown =
        opts.allowUnknown !== undefined
          ? opts.allowUnknown
          : field.additionalProperties !== false;
      const stripUnknown =
        opts.stripUnknown !== undefined ? opts.stripUnknown : false;
      const result = {};
      for (const key of Object.keys(fields)) {
        const childPath = joinPath(path, key);
        const hasKey = Object.prototype.hasOwnProperty.call(cloned, key);
        const validated = validateField(
          fields[key],
          hasKey ? cloned[key] : undefined,
          childPath,
          errors,
          warnings,
          opts
        );
        if (validated !== undefined) result[key] = validated;
      }
      for (const key of Object.keys(cloned)) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) continue;
        const childPath = joinPath(path, key);
        if (allowUnknown) {
          result[key] = cloned[key];
        } else if (stripUnknown) {
          // Silently drop; still record what was removed for auditability.
          warnings.push(
            makeIssue("UNKNOWN_FIELD_STRIPPED", childPath, `"${childPath}" is not defined by the schema and was removed.`, "warning")
          );
        } else {
          const issue = makeIssue("UNKNOWN_FIELD", childPath, `"${childPath}" is not defined by the schema.`, "error");
          errors.push(issue);
          result[key] = cloned[key];
        }
      }
      const size = Object.keys(result).length;
      if (field.minProperties !== undefined && size < field.minProperties) {
        fail("MIN_PROPERTIES", `${path || "value"} must define at least ${field.minProperties} properties.`, {
          expected: field.minProperties,
          actual: size,
        });
      }
      if (field.maxProperties !== undefined && size > field.maxProperties) {
        fail("MAX_PROPERTIES", `${path || "value"} must define at most ${field.maxProperties} properties.`, {
          expected: field.maxProperties,
          actual: size,
        });
      }
      if (field.deprecated) {
        warnings.push(makeIssue("DEPRECATED", path, `${path || "value"} is deprecated.`, "warning"));
      }
      runCustomValidator(field, result, path, errors, warnings);
      return result;
    }
    case "array": {
      if (field.minItems !== undefined && cloned.length < field.minItems) {
        fail("MIN_ITEMS", `${path || "value"} must contain at least ${field.minItems} items.`, {
          expected: field.minItems,
          actual: cloned.length,
        });
      }
      if (field.maxItems !== undefined && cloned.length > field.maxItems) {
        fail("MAX_ITEMS", `${path || "value"} must contain at most ${field.maxItems} items.`, {
          expected: field.maxItems,
          actual: cloned.length,
        });
      }
      if (field.uniqueItems) {
        for (let i = 0; i < cloned.length; i++) {
          for (let j = i + 1; j < cloned.length; j++) {
            if (deepEqual(cloned[i], cloned[j])) {
              fail("UNIQUE_ITEMS", `${path || "value"} must not contain duplicate items (indexes ${i} and ${j}).`);
              i = cloned.length;
              break;
            }
          }
        }
      }
      const out = [];
      for (let i = 0; i < cloned.length; i++) {
        out.push(
          validateField(field.items, cloned[i], joinIndexPath(path, i), errors, warnings, opts)
        );
      }
      if (field.deprecated) {
        warnings.push(makeIssue("DEPRECATED", path, `${path || "value"} is deprecated.`, "warning"));
      }
      runCustomValidator(field, out, path, errors, warnings);
      return out;
    }
    default:
      break;
  }

  if (field.deprecated) {
    warnings.push(makeIssue("DEPRECATED", path, `${path || "value"} is deprecated.`, "warning"));
  }
  runCustomValidator(field, cloned, path, errors, warnings);
  return cloned;
}

function runCustomValidator(field, value, path, errors, warnings) {
  if (typeof field.validate !== "function" || value === undefined) return;
  let outcome;
  try {
    outcome = field.validate(value, { path, field });
  } catch (err) {
    errors.push(
      makeIssue("VALIDATOR_THREW", path, `${path || "value"} could not be validated: validator threw (${err && err.message ? err.message : String(err)}).`)
    );
    return;
  }
  if (outcome === true || outcome === undefined || outcome === null) return;
  if (outcome === false) {
    errors.push(makeIssue("CUSTOM", path, `${path || "value"} failed custom validation.`));
    return;
  }
  if (typeof outcome === "string") {
    errors.push(makeIssue("CUSTOM", path, outcome));
    return;
  }
  if (typeof outcome === "object") {
    const severity = outcome.severity === "warning" ? "warning" : "error";
    const issue = makeIssue(outcome.code || "CUSTOM", path, outcome.message || `${path || "value"} failed custom validation.`, severity);
    if (severity === "warning") warnings.push(issue);
    else errors.push(issue);
  }
}

// Applies defaults without validating. Returns a new value; input untouched.
function applyFieldDefaults(field, value) {
  if (value === undefined) {
    if (field.default !== undefined) {
      return clone(typeof field.default === "function" ? field.default() : field.default);
    }
    if (field.type === "object") {
      const result = {};
      let filled = false;
      for (const key of Object.keys(field.fields || {})) {
        const child = applyFieldDefaults(field.fields[key], undefined);
        if (child !== undefined) {
          result[key] = child;
          filled = true;
        }
      }
      // Only materialize the object when at least one default exists;
      // otherwise preserve "absent" so required-checks stay meaningful.
      return filled ? result : undefined;
    }
    return undefined;
  }
  if (value === null) return null;
  const cloned = clone(value);
  if (field.type === "object" && isPlainObject(cloned)) {
    for (const key of Object.keys(field.fields || {})) {
      const child = applyFieldDefaults(
        field.fields[key],
        Object.prototype.hasOwnProperty.call(cloned, key) ? cloned[key] : undefined
      );
      if (child !== undefined) cloned[key] = child;
    }
    return cloned;
  }
  if (field.type === "array" && Array.isArray(cloned) && field.items) {
    return cloned.map((item) => {
      const filled = applyFieldDefaults(field.items, item);
      return filled === undefined ? item : filled;
    });
  }
  return cloned;
}

// ─── Registry ──────────────────────────────────────────────────────────────

function assertValidVersion(version, operation, name) {
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw createSchemaError("INVALID_VERSION", `Schema "${name}": version must be a positive integer.`, {
      operation,
    });
  }
}

export function createSchemaRegistry(options = {}) {
  const defaultOpts = {
    allowUnknownFields: undefined, // undefined = defer to each schema
    stripUnknownFields: false,
  };
  const registryOpts = { ...defaultOpts };
  if (options.allowUnknownFields !== undefined) {
    registryOpts.allowUnknownFields = !!options.allowUnknownFields;
  }
  if (options.stripUnknownFields !== undefined) {
    registryOpts.stripUnknownFields = !!options.stripUnknownFields;
  }

  // name -> Map(version -> frozen definition)
  const schemas = new Map();
  // "name:from->to" -> migration function
  const migrations = new Map();
  // event -> Set(callback)
  const listeners = new Map();

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    const ctx = { engine: ENGINE_ID, event, ...payload };
    for (const cb of [...set]) {
      try {
        cb(ctx);
      } catch (err) {
        if (typeof console !== "undefined" && typeof console.error === "function") {
          console.error(`[schema-engine] listener for "${event}" threw:`, err);
        }
      }
    }
  }

  function latestVersion(name) {
    const byVersion = schemas.get(name);
    if (!byVersion || byVersion.size === 0) return null;
    let max = -Infinity;
    for (const v of byVersion.keys()) {
      if (v > max) max = v;
    }
    return max;
  }

  function resolve(name, version, operation) {
    const byVersion = schemas.get(name);
    if (!byVersion || byVersion.size === 0) {
      throw createSchemaError("SCHEMA_NOT_FOUND", `Unknown schema "${name}".`, { operation });
    }
    let target = version;
    if (target === undefined || target === null) {
      target = latestVersion(name);
    }
    assertValidVersion(target, operation, name);
    const def = byVersion.get(target);
    if (!def) {
      throw createSchemaError(
        "VERSION_NOT_FOUND",
        `Schema "${name}" has no version ${target}. Available: ${[...byVersion.keys()].sort((a, b) => a - b).join(", ")}.`,
        { operation }
      );
    }
    return def;
  }

  const registry = {
    get engine() {
      return ENGINE_ID;
    },
    get version() {
      return SCHEMA_ENGINE_VERSION;
    },

    register(rawDef) {
      const def = normalizeDefinition(rawDef);
      let byVersion = schemas.get(def.name);
      if (!byVersion) {
        byVersion = new Map();
        schemas.set(def.name, byVersion);
      }
      const existed = byVersion.has(def.version);
      byVersion.set(def.version, deepFreeze(clone(def)));
      emit("schema:registered", {
        name: def.name,
        version: def.version,
        updated: existed,
        definition: registry.get(def.name, def.version),
      });
      return registry.get(def.name, def.version);
    },

    has(name, version) {
      const byVersion = schemas.get(name);
      if (!byVersion) return false;
      if (version === undefined || version === null) return byVersion.size > 0;
      return byVersion.has(version);
    },

    get(name, version) {
      const byVersion = schemas.get(name);
      if (!byVersion) return null;
      let target = version;
      if (target === undefined || target === null) target = latestVersion(name);
      if (target === null) return null;
      const def = byVersion.get(target);
      return def ? clone(def) : null;
    },

    versions(name) {
      const byVersion = schemas.get(name);
      if (!byVersion) return [];
      return [...byVersion.keys()].sort((a, b) => a - b);
    },

    list() {
      const out = [];
      for (const [name, byVersion] of schemas) {
        for (const version of [...byVersion.keys()].sort((a, b) => a - b)) {
          const def = byVersion.get(version);
          out.push({
            name,
            version,
            title: def.title,
            description: def.description,
          });
        }
      }
      out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version - b.version));
      return out;
    },

    unregister(name, version) {
      const byVersion = schemas.get(name);
      if (!byVersion) return false;
      if (version === undefined || version === null) {
        const removed = schemas.delete(name);
        if (removed) {
          for (const key of [...migrations.keys()]) {
            const sep = key.indexOf(":");
            if (sep > 0 && key.slice(0, sep) === name) migrations.delete(key);
          }
          emit("schema:unregistered", { name, version: null, all: true });
        }
        return removed;
      }
      const removed = byVersion.delete(version);
      if (removed) {
        if (byVersion.size === 0) schemas.delete(name);
        for (const key of [...migrations.keys()]) {
          const sep = key.indexOf(":");
          if (sep > 0 && key.slice(0, sep) === name) {
            const legs = key.slice(sep + 1).split("->").map(Number);
            if (legs.includes(version)) migrations.delete(key);
          }
        }
        emit("schema:unregistered", { name, version, all: false });
      }
      return removed;
    },

    clear() {
      schemas.clear();
      migrations.clear();
      emit("schema:cleared", {});
    },

    destroy() {
      schemas.clear();
      migrations.clear();
      listeners.clear();
    },

    validate(name, value, opts = {}) {
      const operation = "validate";
      const def = resolve(name, opts.version, operation);
      const errors = [];
      const warnings = [];
      const effective = {
        allowUnknown:
          opts.allowUnknown !== undefined
            ? opts.allowUnknown
            : registryOpts.allowUnknownFields,
        stripUnknown:
          opts.stripUnknown !== undefined ? opts.stripUnknown : registryOpts.stripUnknownFields,
      };
      const output = validateField(def, clone(value), opts.path || "", errors, warnings, effective);
      const result = {
        valid: errors.length === 0,
        errors,
        warnings,
        value: output,
        schema: { name: def.name, version: def.version },
      };
      emit("schema:validated", { name: def.name, version: def.version, valid: result.valid });
      return result;
    },

    applyDefaults(name, value, opts = {}) {
      const operation = "applyDefaults";
      const def = resolve(name, opts.version, operation);
      const output = applyFieldDefaults(def, value === undefined ? undefined : clone(value));
      return output === undefined ? undefined : output;
    },

    registerMigration(name, fromVersion, toVersion, fn) {
      const operation = "registerMigration";
      if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
        throw createSchemaError("INVALID_SCHEMA", "Migration requires a valid schema name.", { operation });
      }
      assertValidVersion(fromVersion, operation, name);
      assertValidVersion(toVersion, operation, name);
      if (fromVersion === toVersion) {
        throw createSchemaError("INVALID_MIGRATION", "Migration source and target versions must differ.", {
          operation,
        });
      }
      if (typeof fn !== "function") {
        throw createSchemaError("INVALID_MIGRATION", "Migration handler must be a function.", { operation });
      }
      migrations.set(`${name}:${fromVersion}->${toVersion}`, fn);
    },

    hasMigration(name, fromVersion, toVersion) {
      return migrations.has(`${name}:${fromVersion}->${toVersion}`);
    },

    migrate(name, value, opts = {}) {
      const operation = "migrate";
      const byVersion = schemas.get(name);
      if (!byVersion || byVersion.size === 0) {
        throw createSchemaError("SCHEMA_NOT_FOUND", `Unknown schema "${name}".`, { operation });
      }
      let from = opts.from !== undefined && opts.from !== null ? opts.from : null;
      let to = opts.to !== undefined && opts.to !== null ? opts.to : latestVersion(name);
      assertValidVersion(to, operation, name);
      if (!byVersion.has(to)) {
        throw createSchemaError("VERSION_NOT_FOUND", `Schema "${name}" has no version ${to}.`, { operation });
      }
      if (from === null) {
        // Detect the source version: prefer an explicit marker on the value,
        // otherwise assume the earliest registered version. Never guess
        // silently when markers disagree — the caller must disambiguate.
        const markers = [];
        if (isPlainObject(value)) {
          for (const key of ["schemaVersion", "version", "v"]) {
            if (typeof value[key] === "number" && Number.isInteger(value[key])) markers.push(value[key]);
          }
        }
        const unique = [...new Set(markers)];
        if (unique.length > 1) {
          throw createSchemaError(
            "AMBIGUOUS_VERSION",
            `Cannot detect source version for "${name}": conflicting markers (${unique.join(", ")}). Pass opts.from explicitly.`,
            { operation }
          );
        }
        from = unique.length === 1 ? unique[0] : Math.min(...byVersion.keys());
      }
      assertValidVersion(from, operation, name);
      if (!byVersion.has(from)) {
        throw createSchemaError("VERSION_NOT_FOUND", `Schema "${name}" has no version ${from}.`, { operation });
      }
      if (from === to) {
        return { value: clone(value), from, to, steps: [] };
      }

      const direction = to > from ? 1 : -1;
      let current = clone(value);
      const steps = [];
      let cursor = from;
      while (cursor !== to) {
        const next = cursor + direction;
        const key = `${name}:${cursor}->${next}`;
        const fn = migrations.get(key);
        if (!fn) {
          throw createSchemaError(
            "MIGRATION_MISSING",
            `No migration registered for "${name}" from version ${cursor} to ${next}.`,
            { operation }
          );
        }
        let produced;
        try {
          produced = fn(clone(current), { name, from: cursor, to: next, engine: ENGINE_ID });
        } catch (err) {
          throw createSchemaError(
            "MIGRATION_FAILED",
            `Migration of "${name}" from ${cursor} to ${next} failed: ${err && err.message ? err.message : String(err)}.`,
            { operation, cause: err }
          );
        }
        if (produced === undefined) {
          throw createSchemaError(
            "MIGRATION_FAILED",
            `Migration of "${name}" from ${cursor} to ${next} returned undefined; migrations must return the new value.`,
            { operation }
          );
        }
        current = produced;
        steps.push({ from: cursor, to: next });
        cursor = next;
      }
      const result = { value: current, from, to, steps };
      emit("schema:migrated", { name, from, to, steps: [...steps] });
      return result;
    },

    exportSchemas() {
      const out = [];
      const strippedNotes = [];
      for (const [name, byVersion] of schemas) {
        for (const version of [...byVersion.keys()].sort((a, b) => a - b)) {
          const stripped = [];
          const safe = toJsonSafe(clone(byVersion.get(version)), stripped, "$");
          out.push(safe);
          if (stripped.length > 0) {
            strippedNotes.push({ name, version, stripped });
          }
        }
      }
      out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version - b.version));
      return { schemas: out, runtimeOnlyStripped: strippedNotes };
    },

    importSchemas(payload) {
      const operation = "importSchemas";
      const list = Array.isArray(payload) ? payload : payload && payload.schemas;
      if (!Array.isArray(list)) {
        throw createSchemaError("INVALID_SCHEMA", "importSchemas() requires an array of schema definitions.", {
          operation,
        });
      }
      let count = 0;
      for (const raw of list) {
        registry.register(raw);
        count++;
      }
      return count;
    },

    on(event, callback) {
      if (typeof callback !== "function") {
        throw createSchemaError("INVALID_LISTENER", "Event listener must be a function.", {
          operation: "on",
        });
      }
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
      return () => registry.off(event, callback);
    },

    off(event, callback) {
      const set = listeners.get(event);
      if (!set) return;
      if (callback) {
        set.delete(callback);
        if (set.size === 0) listeners.delete(event);
      } else {
        listeners.delete(event);
      }
    },
  };

  return registry;
}

// Shared default instance for application-wide use. Isolated work (tests,
// per-editor instances) should prefer createSchemaRegistry().
export const schemaRegistry = createSchemaRegistry();

// Validates + normalizes a definition without registering it. Useful for
// testing schema shapes and for tooling that authors schemas.
export function defineSchema(rawDef) {
  return clone(normalizeDefinition(rawDef));
}

// Standalone single-value validation against an inline field schema
// (no registration needed). Returns the same result shape as registry.validate.
export function validateValue(fieldSchema, value, path = "", opts = {}) {
  const normalized = normalizeFieldSchema(
    typeof fieldSchema === "string" ? { type: fieldSchema } : fieldSchema,
    path,
    "validateValue"
  );
  const errors = [];
  const warnings = [];
  const output = validateField(normalized, clone(value), path, errors, warnings, {
    allowUnknown: opts.allowUnknown,
    stripUnknown: opts.stripUnknown,
  });
  return { valid: errors.length === 0, errors, warnings, value: output };
}

// Standalone defaults application against an inline field schema.
export function applyDefaultsToValue(fieldSchema, value) {
  const normalized = normalizeFieldSchema(
    typeof fieldSchema === "string" ? { type: fieldSchema } : fieldSchema,
    "",
    "applyDefaultsToValue"
  );
  return applyFieldDefaults(normalized, value === undefined ? undefined : clone(value));
}

export default schemaRegistry;
