// acrx/assets/js/editor/engines/serialization-engine.js
//
// ENGINE 23 — Serialization Engine (headless).
// Single canonical strategy for converting internal state to persisted JSON
// and back: versioned envelopes, deterministic stable output, migrations,
// compatibility checks and compact representation. No engine invents its own.

export const SERIALIZATION_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "serialization";
export const ENVELOPE_FORMAT = "acroxa-envelope";
export const ENVELOPE_VERSION = 1;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function serError(operation, code, message) {
  const err = new Error(message);
  err.name = "SerializationError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

// Deterministic deep key-sorting: identical values always produce identical
// strings regardless of insertion order (stable snapshots, hashing, tests).
export function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableSort(value[key]);
    return out;
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableSort(value));
}

export function createSerializationEngine(options = {}) {
  const migrations = new Map(); // "kind:from->to" -> fn
  const defaultKind = options.kind || "document";

  function migrationKey(kind, from, to) {
    return `${kind}:${from}->${to}`;
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return SERIALIZATION_ENGINE_VERSION; },

    serialize(payload, opts = {}) {
      const kind = opts.kind || defaultKind;
      return {
        format: ENVELOPE_FORMAT,
        formatVersion: ENVELOPE_VERSION,
        kind,
        schemaVersion: opts.schemaVersion !== undefined ? opts.schemaVersion : 1,
        createdAt: opts.createdAt || new Date().toISOString(),
        payload: clone(opts.stable === false ? payload : stableSort(payload)),
      };
    },

    detectFormat(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) return "unknown";
      if (input.format === ENVELOPE_FORMAT) return "envelope";
      if (Array.isArray(input.nodes) && typeof input.rootId === "string") return "document";
      if (input.type === "doc" && Array.isArray(input.content)) return "rte-doc";
      return "unknown";
    },

    validateEnvelope(envelope) {
      const errors = [];
      if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
        return { valid: false, errors: [{ code: "NOT_AN_OBJECT", path: "", message: "Envelope must be an object.", severity: "error" }], warnings: [] };
      }
      if (envelope.format !== ENVELOPE_FORMAT) {
        errors.push({ code: "BAD_FORMAT", path: "format", message: `Expected format "${ENVELOPE_FORMAT}".`, severity: "error" });
      }
      if (envelope.formatVersion !== ENVELOPE_VERSION) {
        errors.push({ code: "VERSION_MISMATCH", path: "formatVersion", message: `Unsupported envelope version ${JSON.stringify(envelope.formatVersion)}.`, severity: "error" });
      }
      if (!("payload" in envelope)) {
        errors.push({ code: "MISSING_PAYLOAD", path: "payload", message: "Envelope is missing its payload.", severity: "error" });
      }
      return { valid: errors.length === 0, errors, warnings: [] };
    },

    deserialize(envelope, opts = {}) {
      const check = engine.validateEnvelope(envelope);
      if (!check.valid) {
        throw serError("deserialize", check.errors[0].code, check.errors[0].message);
      }
      let payload = clone(envelope.payload);
      if (opts.migrateTo !== undefined && envelope.schemaVersion !== opts.migrateTo) {
        payload = engine.migratePayload(opts.kind || envelope.kind || defaultKind, payload, envelope.schemaVersion, opts.migrateTo);
      }
      return {
        kind: envelope.kind || defaultKind,
        schemaVersion: opts.migrateTo !== undefined ? opts.migrateTo : envelope.schemaVersion,
        payload,
        meta: { createdAt: envelope.createdAt || null },
      };
    },

    registerMigration(kind, fromVersion, toVersion, fn) {
      if (typeof fn !== "function") throw serError("registerMigration", "INVALID_MIGRATION", "Migration handler must be a function.");
      if (!Number.isInteger(fromVersion) || fromVersion < 1 || !Number.isInteger(toVersion) || toVersion < 1) {
        throw serError("registerMigration", "INVALID_MIGRATION", "Migration versions must be positive integers.");
      }
      if (fromVersion === toVersion) throw serError("registerMigration", "INVALID_MIGRATION", "Migration versions must differ.");
      migrations.set(migrationKey(kind, fromVersion, toVersion), fn);
    },

    migratePayload(kind, payload, from, to) {
      if (from === to) return clone(payload);
      const direction = to > from ? 1 : -1;
      let current = clone(payload);
      let cursor = from;
      while (cursor !== to) {
        const next = cursor + direction;
        const fn = migrations.get(migrationKey(kind, cursor, next));
        if (!fn) throw serError("migratePayload", "MIGRATION_MISSING", `No ${kind} migration from ${cursor} to ${next}.`);
        const produced = fn(current, { kind, from: cursor, to: next });
        if (produced === undefined) throw serError("migratePayload", "MIGRATION_FAILED", `Migration ${cursor}->${next} returned undefined.`);
        current = produced;
        cursor = next;
      }
      return current;
    },

    // Compact representation: drop undefined/null/empty-string/empty-array/
    // empty-object leaves (opt-in per key via options.keepNulls etc.).
    compact(value, opts = {}) {
      if (Array.isArray(value)) {
        const out = [];
        for (const item of value) {
          const c = engine.compact(item, opts);
          if (c === undefined) continue;
          out.push(c);
        }
        return out;
      }
      if (value !== null && typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value)) {
          const c = engine.compact(value[key], opts);
          if (c === undefined) continue;
          out[key] = c;
        }
        return out;
      }
      if (value === undefined) return undefined;
      if (value === null && !opts.keepNulls) return undefined;
      if (value === "" && !opts.keepEmptyStrings) return undefined;
      return value;
    },

    normalize(value, opts = {}) {
      const compacted = opts.compact ? engine.compact(value, opts) : clone(value);
      return opts.stable === false ? compacted : stableSort(compacted);
    },

    parse(text) {
      try {
        return JSON.parse(String(text));
      } catch (err) {
        throw serError("parse", "PARSE_FAILED", `Invalid JSON: ${err.message}.`);
      }
    },

    stringify(value, opts = {}) {
      const normalized = engine.normalize(value, opts);
      return opts.pretty ? JSON.stringify(normalized, null, 2) : JSON.stringify(normalized);
    },
  };

  return engine;
}

export default createSerializationEngine;
