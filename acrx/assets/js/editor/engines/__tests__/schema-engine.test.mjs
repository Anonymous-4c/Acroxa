// acrx/assets/js/editor/engines/schema-engine.test.mjs
//
// Deterministic tests for ENGINE 22 — Schema Engine.
// Run: node --test acrx/assets/js/editor/engines/schema-engine.test.mjs
// (or: npm run test:engines)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createSchemaRegistry,
  schemaRegistry,
  defineSchema,
  validateValue,
  applyDefaultsToValue,
  createSchemaError,
  isSchemaError,
  SchemaError,
  FieldTypes,
  SCHEMA_ENGINE_VERSION,
} from "../schema-engine.js";

function makeRegistry() {
  return createSchemaRegistry();
}

function buttonSchema(version = 1) {
  return {
    name: "widget.button",
    version,
    title: "Button",
    description: "Clickable button widget.",
    type: "object",
    fields: {
      text: { type: "string", required: true, minLength: 1, maxLength: 200, default: "Click me" },
      href: { type: "string", format: "url", default: "/" },
      variant: { type: "string", enum: ["primary", "secondary", "ghost"], default: "primary" },
      disabled: { type: "boolean", default: false },
    },
  };
}

describe("schema engine identity", () => {
  it("exposes a version and field type map", () => {
    assert.equal(typeof SCHEMA_ENGINE_VERSION, "string");
    assert.equal(FieldTypes.STRING, "string");
    assert.ok(Object.isFrozen(FieldTypes));
  });

  it("provides an isolated factory plus a shared default instance", () => {
    const a = makeRegistry();
    const b = makeRegistry();
    assert.notEqual(a, b);
    assert.equal(schemaRegistry.engine, "schema");
    a.register(buttonSchema());
    assert.equal(a.has("widget.button"), true);
    assert.equal(b.has("widget.button"), false);
  });
});

describe("registration and lookup", () => {
  it("registers, resolves latest, lists and unregisters", () => {
    const r = makeRegistry();
    r.register(buttonSchema(1));
    r.register(buttonSchema(2));
    assert.deepEqual(r.versions("widget.button"), [1, 2]);
    assert.equal(r.get("widget.button").version, 2);
    assert.equal(r.get("widget.button", 1).version, 1);
    assert.equal(r.has("widget.button", 2), true);
    assert.equal(r.has("widget.button", 9), false);
    assert.equal(r.has("missing"), false);
    assert.equal(r.get("missing"), null);
    const list = r.list();
    assert.equal(list.length, 2);
    assert.equal(r.unregister("widget.button", 1), true);
    assert.deepEqual(r.versions("widget.button"), [2]);
    assert.equal(r.unregister("widget.button"), true);
    assert.equal(r.has("widget.button"), false);
    assert.equal(r.unregister("widget.button"), false);
  });

  it("returns clones so stored definitions cannot be mutated externally", () => {
    const r = makeRegistry();
    r.register(buttonSchema());
    const first = r.get("widget.button");
    first.fields.text.type = "number";
    first.title = "Hacked";
    const second = r.get("widget.button");
    assert.equal(second.fields.text.type, "string");
    assert.equal(second.title, "Button");
  });

  it("re-registering the same name+version replaces it", () => {
    const r = makeRegistry();
    r.register(buttonSchema(1));
    r.register({ ...buttonSchema(1), title: "Button v2" });
    assert.equal(r.get("widget.button", 1).title, "Button v2");
  });

  it("rejects invalid definitions with SchemaError", () => {
    const r = makeRegistry();
    assert.throws(() => r.register(null), (e) => isSchemaError(e) && e.code === "INVALID_SCHEMA");
    assert.throws(() => r.register({ version: 1 }), (e) => e.code === "INVALID_SCHEMA");
    assert.throws(() => r.register({ name: "9bad", version: 1 }), (e) => e.code === "INVALID_SCHEMA");
    assert.throws(() => r.register({ name: "x", version: 0 }), (e) => e.code === "INVALID_SCHEMA");
    assert.throws(() => r.register({ name: "x", version: 1.5 }), (e) => e.code === "INVALID_SCHEMA");
    assert.throws(
      () => r.register({ name: "x", version: 1, type: "frobnicator" }),
      (e) => e.code === "INVALID_FIELD_TYPE"
    );
    assert.throws(
      () => r.register({ name: "x", version: 1, type: "object", fields: { a: { type: "string", minItems: 2 } } }),
      (e) => e.code === "INVALID_FIELD"
    );
    assert.throws(
      () => r.register({ name: "x", version: 1, type: "string", format: "not-a-format" }),
      (e) => e.code === "INVALID_FIELD"
    );
    assert.throws(
      () => r.register({ name: "x", version: 1, type: "enum" }),
      (e) => e.code === "INVALID_FIELD"
    );
  });

  it("supports authoring shorthands", () => {
    const r = makeRegistry();
    r.register({
      name: "shorthand",
      version: 1,
      type: "object",
      fields: {
        title: "string",
        tags: { type: "array", items: "string" },
      },
    });
    const def = r.get("shorthand");
    assert.equal(def.fields.title.type, "string");
    assert.equal(def.fields.tags.items.type, "string");
  });

  it("defineSchema validates without registering", () => {
    const def = defineSchema(buttonSchema());
    assert.equal(def.name, "widget.button");
    const r = makeRegistry();
    assert.equal(r.has("widget.button"), false);
  });
});

describe("primitive validation", () => {
  it("accepts valid values and reports typed mismatches", () => {
    assert.equal(validateValue("string", "hi").valid, true);
    assert.equal(validateValue("string", 42).valid, false);
    assert.equal(validateValue("number", 1.5).valid, true);
    assert.equal(validateValue("number", Number.NaN).valid, false);
    assert.equal(validateValue("number", Number.POSITIVE_INFINITY).valid, false);
    assert.equal(validateValue("integer", 3).valid, true);
    assert.equal(validateValue("integer", 3.2).valid, false);
    assert.equal(validateValue("boolean", false).valid, true);
    assert.equal(validateValue("null", null).valid, true);
    assert.equal(validateValue("null", 0).valid, false);
    assert.equal(validateValue("any", { whatever: [1] }).valid, true);
  });

  it("enforces required and nullable", () => {
    assert.equal(validateValue({ type: "string", required: true }, undefined).valid, false);
    assert.equal(validateValue({ type: "string" }, undefined).valid, true);
    assert.equal(validateValue({ type: "string", nullable: true }, null).valid, true);
    assert.equal(validateValue({ type: "string" }, null).valid, false);
  });

  it("enforces string constraints", () => {
    assert.equal(validateValue({ type: "string", minLength: 2 }, "a").errors[0].code, "MIN_LENGTH");
    assert.equal(validateValue({ type: "string", maxLength: 2 }, "abc").errors[0].code, "MAX_LENGTH");
    assert.equal(validateValue({ type: "string", pattern: "^a+$" }, "b").errors[0].code, "PATTERN");
    assert.equal(validateValue({ type: "string", format: "email" }, "not-an-email").errors[0].code, "FORMAT");
    assert.equal(validateValue({ type: "string", format: "email" }, "a@b.co").valid, true);
    assert.equal(validateValue({ type: "string", format: "slug" }, "Hello World").valid, false);
    assert.equal(validateValue({ type: "string", format: "slug" }, "hello-world-2").valid, true);
    assert.equal(validateValue({ type: "string", format: "uuid" }, "not-a-uuid").valid, false);
    assert.equal(
      validateValue({ type: "string", format: "uuid" }, "123e4567-e89b-12d3-a456-426614174000").valid,
      true
    );
    assert.equal(validateValue({ type: "string", format: "color" }, "#ff0000").valid, true);
    assert.equal(validateValue({ type: "string", format: "color" }, "nope").valid, false);
    assert.equal(validateValue({ type: "string", format: "date-time" }, "2026-09-05").valid, true);
    assert.equal(validateValue({ type: "string", format: "date-time" }, "yesterday-ish").valid, false);
  });

  it("accepts editor-style urls (relative, anchors, mailto)", () => {
    for (const href of ["/pricing", "#section", "https://example.com/x", "mailto:a@b.co", "tel:+123"]) {
      assert.equal(validateValue({ type: "string", format: "url" }, href).valid, true, href);
    }
    assert.equal(validateValue({ type: "string", format: "url" }, "::::").valid, false);
  });

  it("enforces numeric ranges, enums and const", () => {
    assert.equal(validateValue({ type: "number", minimum: 5 }, 4).errors[0].code, "MINIMUM");
    assert.equal(validateValue({ type: "number", maximum: 5 }, 6).errors[0].code, "MAXIMUM");
    assert.equal(validateValue({ type: "number", minimum: 5, exclusiveMinimum: true }, 5).valid, false);
    assert.equal(validateValue({ type: "string", enum: ["a", "b"] }, "c").errors[0].code, "ENUM_MISMATCH");
    assert.equal(validateValue({ type: "enum", values: [1, 2] }, 2).valid, true);
    assert.equal(validateValue({ type: "enum", values: [1, 2] }, 3).errors[0].code, "ENUM_MISMATCH");
    assert.equal(validateValue({ type: "string", const: "fixed" }, "other").errors[0].code, "CONST_MISMATCH");
    assert.equal(validateValue({ type: "string", const: "fixed" }, "fixed").valid, true);
  });

  it("produces structured issues with engine-relevant fields", () => {
    const res = validateValue({ type: "string", minLength: 5 }, "abc", "title");
    assert.equal(res.valid, false);
    assert.equal(res.errors.length, 1);
    assert.deepEqual(
      { code: res.errors[0].code, path: res.errors[0].path, severity: res.errors[0].severity },
      { code: "MIN_LENGTH", path: "title", severity: "error" }
    );
    assert.equal(typeof res.errors[0].message, "string");
  });
});

describe("nested objects and arrays", () => {
  it("validates nested objects with dotted paths", () => {
    const r = makeRegistry();
    r.register({
      name: "card",
      version: 1,
      type: "object",
      fields: {
        heading: { type: "string", required: true },
        body: {
          type: "object",
          fields: { text: { type: "string", required: true } },
        },
      },
    });
    const bad = r.validate("card", { heading: "Hi", body: {} });
    assert.equal(bad.valid, false);
    assert.equal(bad.errors[0].code, "REQUIRED");
    assert.equal(bad.errors[0].path, "body.text");
    assert.equal(r.validate("card", { heading: "Hi", body: { text: "x" } }).valid, true);
  });

  it("rejects unknown fields by default and supports opt-outs", () => {
    const r = makeRegistry();
    r.register(buttonSchema());
    const strict = r.validate("widget.button", { text: "Buy", typoField: 1 });
    assert.equal(strict.valid, false);
    assert.equal(strict.errors[0].code, "UNKNOWN_FIELD");

    const lenient = r.validate("widget.button", { text: "Buy", typoField: 1 }, { allowUnknown: true });
    assert.equal(lenient.valid, true);
    assert.equal(lenient.value.typoField, 1);

    const stripped = r.validate("widget.button", { text: "Buy", typoField: 1 }, { stripUnknown: true });
    assert.equal(stripped.valid, true);
    assert.equal("typoField" in stripped.value, false);
    assert.ok(stripped.warnings.some((w) => w.code === "UNKNOWN_FIELD_STRIPPED"));
  });

  it("validates arrays, item paths, sizes and uniqueness", () => {
    const field = { type: "array", items: { type: "integer" }, minItems: 1, maxItems: 3, uniqueItems: true };
    assert.equal(validateValue(field, []).errors[0].code, "MIN_ITEMS");
    assert.equal(validateValue(field, [1, 2, 3, 4]).errors[0].code, "MAX_ITEMS");
    assert.equal(validateValue(field, [1, 1]).errors[0].code, "UNIQUE_ITEMS");
    const badItem = validateValue(field, [1, "x"], "ids");
    assert.equal(badItem.valid, false);
    assert.equal(badItem.errors[0].path, "ids[1]");
    assert.equal(validateValue(field, [1, 2]).valid, true);
  });

  it("never mutates validation input", () => {
    const r = makeRegistry();
    r.register(buttonSchema());
    const input = { text: "Buy", extra: { deep: [1] } };
    const snapshot = JSON.parse(JSON.stringify(input));
    r.validate("widget.button", input, { stripUnknown: true });
    assert.deepEqual(input, snapshot);
  });

  it("supports custom validators, warnings and throwing validators", () => {
    const ok = validateValue(
      { type: "string", validate: (v) => (v === "fine" ? true : "must be fine") },
      "nope"
    );
    assert.equal(ok.valid, false);
    assert.equal(ok.errors[0].code, "CUSTOM");

    const warn = validateValue(
      { type: "string", validate: () => ({ severity: "warning", message: "legacy value" }) },
      "x"
    );
    assert.equal(warn.valid, true);
    assert.equal(warn.warnings.length, 1);

    const threw = validateValue(
      {
        type: "string",
        validate: () => {
          throw new Error("boom");
        },
      },
      "x"
    );
    assert.equal(threw.valid, false);
    assert.equal(threw.errors[0].code, "VALIDATOR_THREW");
  });

  it("flags deprecated fields as warnings, not errors", () => {
    const res = validateValue({ type: "string", deprecated: true }, "x", "oldProp");
    assert.equal(res.valid, true);
    assert.equal(res.warnings[0].code, "DEPRECATED");
  });
});

describe("defaults", () => {
  it("fills root, nested and array-item defaults without mutating input", () => {
    const r = makeRegistry();
    r.register(buttonSchema());
    const input = {};
    const out = r.applyDefaults("widget.button", input);
    assert.deepEqual(out, { text: "Click me", href: "/", variant: "primary", disabled: false });
    assert.deepEqual(input, {});

    const nested = applyDefaultsToValue(
      { type: "object", fields: { inner: { type: "object", fields: { n: { type: "number", default: 7 } } } } },
      { inner: {} }
    );
    assert.deepEqual(nested, { inner: { n: 7 } });

    let calls = 0;
    const fresh = applyDefaultsToValue(
      { type: "object", fields: { list: { type: "array", default: () => { calls++; return []; } } } },
      {}
    );
    assert.deepEqual(fresh, { list: [] });
    assert.equal(calls, 1);
  });

  it("does not materialize absent optional objects without defaults", () => {
    const out = applyDefaultsToValue(
      { type: "object", fields: { opt: { type: "object", fields: { x: { type: "string" } } } } },
      {}
    );
    assert.deepEqual(out, {});
  });
});

describe("versioning and migrations", () => {
  it("migrates stepwise through a version chain", () => {
    const r = makeRegistry();
    r.register({ name: "doc", version: 1, type: "object", fields: { title: { type: "string", default: "" } } });
    r.register({
      name: "doc",
      version: 2,
      type: "object",
      fields: { title: { type: "string", default: "" }, subtitle: { type: "string", default: "" } },
    });
    r.register({
      name: "doc",
      version: 3,
      type: "object",
      fields: {
        title: { type: "string", default: "" },
        subtitle: { type: "string", default: "" },
        tags: { type: "array", items: "string", default: [] },
      },
    });
    r.registerMigration("doc", 1, 2, (value) => ({ ...value, subtitle: "" }));
    r.registerMigration("doc", 2, 3, (value) => ({ ...value, tags: [] }));

    const res = r.migrate("doc", { title: "Hello" }, { from: 1, to: 3 });
    assert.deepEqual(res.value, { title: "Hello", subtitle: "", tags: [] });
    assert.deepEqual(res.steps, [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ]);
    assert.equal(r.validate("doc", res.value, { version: 3 }).valid, true);
  });

  it("detects the source version from value markers", () => {
    const r = makeRegistry();
    r.register({ name: "m", version: 1, type: "object", fields: { schemaVersion: { type: "integer" } } });
    r.register({ name: "m", version: 2, type: "object", fields: { schemaVersion: { type: "integer" } } });
    r.registerMigration("m", 1, 2, (v) => ({ ...v, schemaVersion: 2 }));
    const res = r.migrate("m", { schemaVersion: 1 });
    assert.equal(res.to, 2);
    assert.equal(res.value.schemaVersion, 2);
  });

  it("throws structured errors for missing/ambiguous/failed migrations", () => {
    const r = makeRegistry();
    r.register({ name: "n", version: 1, type: "object", fields: {} });
    r.register({ name: "n", version: 2, type: "object", fields: {} });
    assert.throws(() => r.migrate("n", {}, { from: 1, to: 2 }), (e) => e.code === "MIGRATION_MISSING");
    assert.throws(
      () => r.migrate("n", { schemaVersion: 1, version: 2 }),
      (e) => e.code === "AMBIGUOUS_VERSION"
    );
    r.registerMigration("n", 1, 2, () => undefined);
    assert.throws(() => r.migrate("n", {}, { from: 1, to: 2 }), (e) => e.code === "MIGRATION_FAILED");
  });

  it("same-version migration is a pure clone", () => {
    const r = makeRegistry();
    r.register({ name: "s", version: 1, type: "object", fields: {} });
    const input = { a: 1 };
    const res = r.migrate("s", input, { from: 1, to: 1 });
    assert.deepEqual(res.value, input);
    assert.notEqual(res.value, input);
    assert.deepEqual(res.steps, []);
  });
});

describe("serialization", () => {
  it("round-trips schemas through export/import", () => {
    const r = makeRegistry();
    r.register(buttonSchema(1));
    r.register(buttonSchema(2));
    const exported = r.exportSchemas();
    assert.equal(exported.schemas.length, 2);
    assert.equal(exported.runtimeOnlyStripped.length, 0);
    const json = JSON.parse(JSON.stringify(exported));
    const r2 = makeRegistry();
    assert.equal(r2.importSchemas(json.schemas), 2);
    assert.deepEqual(r2.versions("widget.button"), [1, 2]);
    assert.equal(r2.validate("widget.button", { text: "x" }).valid, true);
  });

  it("strips runtime-only functions on export and reports them", () => {
    const r = makeRegistry();
    r.register({
      name: "withfn",
      version: 1,
      type: "object",
      fields: {
        a: { type: "string", default: () => "gen", validate: (v) => true },
      },
    });
    const exported = r.exportSchemas();
    assert.equal(exported.runtimeOnlyStripped.length, 1);
    const r2 = makeRegistry();
    r2.importSchemas(exported.schemas);
    // Imported schema still validates structurally; the custom callback is gone by design.
    assert.equal(r2.validate("withfn", { a: "anything" }).valid, true);
    assert.deepEqual(r2.applyDefaults("withfn", {}), {});
  });
});

describe("events and lifecycle", () => {
  it("emits registered/validated/migrated and supports unsubscribe", () => {
    const r = makeRegistry();
    const seen = [];
    const off = r.on("schema:registered", (ctx) => seen.push(ctx.name));
    r.register(buttonSchema());
    assert.deepEqual(seen, ["widget.button"]);
    off();
    r.register({ ...buttonSchema(), version: 2 });
    assert.deepEqual(seen, ["widget.button"]);

    let validated = 0;
    r.on("schema:validated", () => validated++);
    r.validate("widget.button", { text: "x" });
    assert.equal(validated, 1);
    r.off("schema:validated");
    r.validate("widget.button", { text: "x" });
    assert.equal(validated, 1);
  });

  it("isolates throwing listeners", () => {
    const r = makeRegistry();
    const originalError = console.error;
    console.error = () => {};
    try {
      let secondRan = false;
      r.on("schema:registered", () => {
        throw new Error("listener boom");
      });
      r.on("schema:registered", () => {
        secondRan = true;
      });
      r.register(buttonSchema());
      assert.equal(secondRan, true);
    } finally {
      console.error = originalError;
    }
  });

  it("clear() empties schemas and migrations", () => {
    const r = makeRegistry();
    r.register(buttonSchema());
    r.registerMigration("widget.button", 1, 2, (v) => v);
    let cleared = 0;
    r.on("schema:cleared", () => cleared++);
    r.clear();
    assert.equal(r.has("widget.button"), false);
    assert.equal(r.hasMigration("widget.button", 1, 2), false);
    assert.equal(cleared, 1);
    r.destroy();
  });
});

describe("error handling", () => {
  it("throws SchemaError with engine metadata for programmer errors", () => {
    const r = makeRegistry();
    try {
      r.validate("nope", {});
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(isSchemaError(err));
      assert.ok(err instanceof SchemaError);
      assert.equal(err.code, "SCHEMA_NOT_FOUND");
      assert.equal(err.engine, "schema");
      assert.equal(err.operation, "validate");
      assert.deepEqual(err.toJSON().engine, "schema");
    }
    const custom = createSchemaError("X", "msg", { operation: "test", path: "a.b" });
    assert.equal(custom.path, "a.b");
    assert.equal(isSchemaError(new Error("plain")), false);
  });

  it("is deterministic across repeated calls", () => {
    const r = makeRegistry();
    r.register(buttonSchema());
    const input = { text: "Buy", href: "/x", variant: "ghost", disabled: true };
    const first = r.validate("widget.button", input);
    const second = r.validate("widget.button", input);
    assert.deepEqual(first, second);
  });
});
