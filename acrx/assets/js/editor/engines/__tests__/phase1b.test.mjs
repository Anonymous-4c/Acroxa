import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument, loadDocument, cloneDocument, DOCUMENT_SCHEMA_VERSION } from "../document-engine.js";
import { createSerializationEngine, stableStringify } from "../serialization-engine.js";

describe("document engine", () => {
  it("creates a rooted tree and mutates it structurally", () => {
    const doc = createDocument({ id: "d1" });
    assert.equal(typeof doc.rootId, "string");
    assert.equal(doc.size, 1);
    const a = doc.insertNode(doc.rootId, { id: "a", type: "paragraph", data: { text: "Hi" } });
    const b = doc.insertNode(doc.rootId, { id: "b", type: "heading" }, 0);
    assert.deepEqual(doc.childrenOf(doc.rootId).map((n) => n.id), ["b", "a"]);
    assert.equal(a.parentId, doc.rootId);
    assert.equal(doc.parentOf("a").id, doc.rootId);
    assert.deepEqual(doc.pathTo("a"), [doc.rootId, "a"]);
    assert.equal(doc.depthOf("a"), 1);
    doc.moveNode("a", doc.rootId, 0);
    assert.deepEqual(doc.childrenOf(doc.rootId).map((n) => n.id), ["a", "b"]);
    doc.updateNode("a", { type: "paragraph", data: { align: "center" } });
    assert.equal(doc.getNode("a").data.text, "Hi");
    assert.equal(doc.getNode("a").data.align, "center");
    doc.replaceNode("b", { type: "paragraph", data: {} });
    assert.equal(doc.getNode("b").type, "paragraph");
    const removed = doc.removeNode("b");
    assert.equal(removed.length, 1);
    assert.equal(doc.hasNode("b"), false);
    assert.equal(doc.validateStructure().valid, true);
    assert.equal(doc.rev > 0, true);
  });

  it("rejects orphans, cycles, root removal and bad indexes", () => {
    const doc = createDocument();
    assert.throws(() => doc.insertNode("nope", { type: "x" }), /Parent/);
    assert.throws(() => doc.insertNode(doc.rootId, { type: "x" }, 99), /bounds/);
    const p = doc.insertNode(doc.rootId, { id: "p", type: "columns" });
    const c = doc.insertNode("p", { id: "c", type: "column" });
    assert.throws(() => doc.moveNode("p", "c"), /cycle/);
    assert.throws(() => doc.removeNode(doc.rootId), /root/);
    assert.throws(() => doc.removeNode("p", { cascade: false }), /children/);
    assert.deepEqual(doc.ancestorsOf("c").map((n) => n.id), [doc.rootId, "p"]);
    assert.equal(doc.descendantsOf("p").length, 1);
    assert.equal(doc.findByType("column").length, 1);
    const order = [];
    doc.traverse((n) => order.push(n.id));
    assert.deepEqual(order, [doc.rootId, "p", "c"]);
  });

  it("snapshots, restores and round-trips through JSON", () => {
    const doc = createDocument({ id: "d9" });
    doc.insertNode(doc.rootId, { id: "a", type: "paragraph", data: { t: 1 } });
    const snap = doc.snapshot();
    assert.ok(Object.isFrozen(snap));
    doc.insertNode(doc.rootId, { id: "b", type: "paragraph" });
    assert.equal(doc.size, 3);
    doc.restore(JSON.parse(JSON.stringify(snap)));
    assert.equal(doc.size, 2);
    const json = doc.toJSON();
    const re = loadDocument(JSON.parse(JSON.stringify(json)));
    assert.equal(re.getNode("a").data.t, 1);
    assert.equal(re.validateStructure().valid, true);
    const copy = cloneDocument(doc);
    assert.notEqual(copy, doc);
    assert.equal(copy.size, doc.size);
    assert.equal(DOCUMENT_SCHEMA_VERSION, 1);
  });

  it("emits lifecycle events", () => {
    const doc = createDocument();
    const seen = [];
    doc.on("node:inserted", (ctx) => seen.push(ctx.node.id));
    doc.insertNode(doc.rootId, { id: "z", type: "paragraph" });
    assert.deepEqual(seen, ["z"]);
  });
});

describe("serialization engine", () => {
  it("wraps, detects, validates and migrates envelopes deterministically", () => {
    const s = createSerializationEngine();
    const env = s.serialize({ b: 1, a: [3, 2] }, { kind: "document", schemaVersion: 1 });
    assert.equal(env.format, "acroxa-envelope");
    const keys = JSON.stringify(env.payload);
    assert.equal(keys, JSON.stringify({ a: [3, 2], b: 1 }));
    assert.equal(s.detectFormat(env), "envelope");
    assert.equal(s.detectFormat({ nodes: [], rootId: "r" }), "document");
    assert.equal(s.detectFormat({ type: "doc", content: [] }), "rte-doc");
    assert.equal(s.detectFormat(null), "unknown");
    assert.equal(s.validateEnvelope(env).valid, true);
    assert.equal(s.validateEnvelope({}).valid, false);
    const back = s.deserialize(env);
    assert.deepEqual(back.payload, { a: [3, 2], b: 1 });
    s.registerMigration("document", 1, 2, (p) => ({ ...p, v2: true }));
    const migrated = s.deserialize(env, { migrateTo: 2 });
    assert.equal(migrated.payload.v2, true);
    assert.throws(() => s.deserialize({}), /Expected format|missing its payload/);
    assert.throws(() => s.parse("{nope"), /Invalid JSON/);
    assert.equal(stableStringify({ b: 1, a: 1 }), stableStringify({ a: 1, b: 1 }));
  });

  it("compacts and normalizes values", () => {
    const s = createSerializationEngine();
    assert.deepEqual(s.compact({ a: null, b: "", c: [], d: 0, e: false }), { c: [], d: 0, e: false });
    assert.deepEqual(s.normalize({ b: 1, a: null }, { compact: true }), { b: 1 });
  });
});
