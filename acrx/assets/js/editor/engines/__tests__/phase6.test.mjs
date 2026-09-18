import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../document-engine.js";
import { createLayersEngine } from "../layers-engine.js";
import { createSearchEngine } from "../search-engine.js";
import { createOutlineEngine } from "../outline-engine.js";

function sampleDoc() {
  const doc = createDocument({ id: "d" });
  doc.insertNode(doc.rootId, { id: "h1", type: "heading", data: { level: 1, text: "Title" } });
  doc.insertNode(doc.rootId, { id: "cols", type: "columns", data: {} });
  doc.insertNode("cols", { id: "c1", type: "column", data: {} });
  doc.insertNode("c1", { id: "p1", type: "paragraph", data: { text: "Hello brave world", locked: true } });
  doc.insertNode("c1", { id: "p2", type: "paragraph", data: { text: "hello again", hidden: true } });
  doc.insertNode(doc.rootId, { id: "h2", type: "heading", data: { level: 3, text: "Deep dive" } });
  return doc;
}

describe("layers engine", () => {
  it("derives layer trees with state and move descriptors", () => {
    const doc = sampleDoc();
    const layers = createLayersEngine();
    layers.setSelected(["p1"]);
    layers.setExpanded("cols", true);
    const tree = layers.build(doc);
    assert.equal(tree.children.length, 3);
    const cols = tree.children.find((l) => l.id === "cols");
    assert.equal(cols.childCount, 1);
    assert.equal(cols.expanded, true);
    const p1 = layers.findLayer(doc, "p1");
    assert.equal(p1.selected, true);
    assert.equal(p1.locked, true);
    assert.equal(p1.label, "Paragraph — Hello brave world");
    const p2 = layers.findLayer(doc, "p2");
    assert.equal(p2.visible, false);
    assert.equal(layers.documentIdFor("p1"), "p1");
    assert.equal(layers.layerIdFor("p1"), "p1");
    const flat = layers.flatten(doc);
    assert.ok(flat.length >= 7);
    const mv = layers.moveDescriptor(doc, "p2", "p1", "after");
    assert.deepEqual(mv, { nodeId: "p2", newParentId: "c1", index: 1 });
    const inside = layers.moveDescriptor(doc, "h2", "cols", "inside");
    assert.deepEqual(inside.newParentId, "cols");
    assert.throws(() => layers.moveDescriptor(doc, "p1", "p1"), /itself/);
    const hide = layers.visibilityPatch(doc, "p1", false);
    assert.deepEqual(hide, { nodeId: "p1", patch: { data: { hidden: true } } });
    const lock = layers.lockPatch(doc, "p1", false);
    assert.equal(lock.patch.data.locked, false);
    // JSON snapshot input works too
    const fromJson = createLayersEngine().list(JSON.parse(JSON.stringify(doc.toJSON())));
    assert.equal(fromJson.length, 3);
  });
});

describe("search engine", () => {
  it("finds text, types, attributes and produces replace edits", () => {
    const doc = sampleDoc();
    const s = createSearchEngine();
    const hits = s.searchText(doc, "hello");
    assert.equal(hits.length, 2); // case-insensitive across p1 + p2
    assert.equal(hits[0].excerpt.includes("Hello"), true);
    assert.equal(s.searchText(doc, "hello", { wholeWord: true }).length, 2);
    assert.equal(s.searchByType(doc, "paragraph").length, 2);
    assert.equal(s.searchById(doc, "h1")[0].nodeType, "heading");
    assert.equal(s.searchByAttribute(doc, "data.locked", true)[0].nodeId, "p1");
    const combined = s.search(doc, { type: "paragraph", text: "again" });
    assert.deepEqual(combined.map((r) => r.nodeId), ["p2"]);
    const edits = s.replaceAll(doc, "hello", "hi");
    assert.equal(edits.length, 2);
    assert.ok(edits.every((e) => !/hello/i.test(e.patch.data.text)));
    // edits are descriptors only — document untouched until applied
    assert.ok(doc.getNode("p1").data.text.includes("Hello"));
    const session = s.createSession(hits);
    assert.equal(session.size, 2);
    assert.equal(session.current().nodeId, hits[0].nodeId);
    assert.equal(session.next().nodeId, hits[1].nodeId);
    assert.equal(session.next().nodeId, hits[0].nodeId); // wraps
    assert.equal(session.prev().nodeId, hits[1].nodeId);
    assert.throws(() => s.searchText(doc, ""), /non-empty/);
  });
});

describe("outline engine", () => {
  it("builds heading trees, sections and validates hierarchy", () => {
    const doc = sampleDoc();
    const o = createOutlineEngine();
    const { tree, flat, count } = o.headings(doc);
    assert.equal(count, 2);
    assert.deepEqual(flat.map((h) => h.level), [1, 3]);
    assert.equal(tree.length, 1); // h3 nests under h1
    assert.equal(tree[0].children[0].text, "Deep dive");
    const check = o.validate(doc);
    assert.equal(check.valid, false); // skipped h2 level
    assert.equal(check.errors[0].code, "SKIPPED_LEVEL");
    const blocks = o.blocks(doc);
    assert.ok(blocks.length >= 6);
    assert.equal(blocks[0].depth, 0);
    doc.insertNode(doc.rootId, { id: "sec", type: "section", data: { region: "main", title: "Body" } });
    assert.deepEqual(o.sections(doc).map((s) => s.region), ["main"]);
    const empty = createDocument();
    assert.equal(o.validate(empty).warnings[0].code, "NO_HEADINGS");
  });
});
