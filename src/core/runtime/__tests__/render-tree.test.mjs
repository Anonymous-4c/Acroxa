// src/core/runtime/__tests__/render-tree.test.mjs
// AcroxaJS Phase 2 render tree + snapshot tests (DB-free, node:test).
// Covers: hierarchy reconstruction via html containment, identity priority
// (data-acrx-id > key > position), deterministic serialization, snapshot
// commit/version/hash/history, since() resync states, targeted drop.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const require = createRequire(import.meta.url);

const rc = require(path.join(ROOT, "src/core/runtime/render/context.js"));
const treeMod = require(path.join(ROOT, "src/core/runtime/render/tree.js"));
const snapshot = require(path.join(ROOT, "src/core/runtime/render/snapshot.js"));
const fw = require(path.join(ROOT, "src/views/lib/framework.js"));

function renderPage(fn) {
  let html = "";
  let nodes = null;
  rc.withRenderContext({ route: "/acrx/t" }, (ctx) => {
    html = fn();
    nodes = ctx.nodes;
  });
  return { html, nodes };
}

describe("render tree", () => {
  it("reconstructs parent-child hierarchy from flat recorded nodes", () => {
    const { nodes } = renderPage(() => fw.el(
      "div",
      { key: "root" },
      fw.el("h1", { key: "title" }, "Dashboard"),
      fw.el("section", { key: "body" }, fw.el("p", { key: "p1" }, "text"))
    ));
    const built = treeMod.build(nodes);
    assert.equal(built.roots.length, 1);
    const root = built.roots[0];
    assert.equal(treeMod.nodeIdOf(root), "root");
    const childIds = root.children.map((c) => treeMod.nodeIdOf(c));
    assert.deepEqual(childIds, ["title", "body"]);
    const body = root.children[1];
    assert.deepEqual(body.children.map((c) => treeMod.nodeIdOf(c)), ["p1"]);
    assert.equal(body.children[0].parentId, "body");
  });

  it("prefers data-acrx-id over key for identity", () => {
    const { nodes } = renderPage(() => fw.h("section", { key: "k" }, "x"));
    const built = treeMod.build(nodes);
    // h() contract: key becomes data-acrx-id
    assert.equal(treeMod.nodeIdOf(built.roots[0]), "k");
  });

  it("attaches nodes to nearest recorded ancestor when parent is raw HTML", () => {
    const { nodes } = renderPage(() => fw.el(
      "div",
      { key: "outer" },
      '<div class="raw-shell">' + fw.el("span", { key: "inner" }, "x") + "</div>"
    ));
    const built = treeMod.build(nodes);
    const outer = built.roots.find((n) => treeMod.nodeIdOf(n) === "outer");
    const inner = built.byId.get("inner");
    assert.ok(inner, "inner exists");
    assert.equal(inner.parentId, "outer", "inner attaches to nearest recorded ancestor");
    assert.ok(outer.children.includes(inner));
  });

  it("is deterministic — same render twice builds identical trees", () => {
    const a = renderPage(() => fw.el("div", { key: "r" }, fw.el("span", {}, "x")));
    const b = renderPage(() => fw.el("div", { key: "r" }, fw.el("span", {}, "x")));
    const ta = treeMod.serialize(treeMod.build(a.nodes).roots[0]);
    const tb = treeMod.serialize(treeMod.build(b.nodes).roots[0]);
    assert.deepEqual(tb, ta);
  });

  it("serialize emits plain JSON with children, lean mode drops html", () => {
    const { nodes } = renderPage(() => fw.el("div", { key: "r" }, fw.el("span", {}, "x")));
    const root = treeMod.build(nodes).roots[0];
    const full = treeMod.serialize(root);
    assert.equal(full.type, "element");
    assert.equal(full.tag, "div");
    assert.ok(typeof full.html === "string");
    assert.ok(Array.isArray(full.children) && full.children.length === 1);
    const lean = treeMod.serialize(root, { lean: true });
    assert.equal(lean.html, undefined);
    assert.equal(lean.children.length, 1);
  });

  it("handles unkeyed duplicates as positional siblings", () => {
    const { nodes } = renderPage(() => fw.el(
      "ul",
      { key: "list" },
      fw.el("li", {}, "a"),
      fw.el("li", {}, "a")
    ));
    const built = treeMod.build(nodes);
    const list = built.roots[0];
    assert.equal(list.children.length, 2);
    assert.equal(list.children[0].pos < list.children[1].pos, true);
  });
});

describe("snapshots", () => {
  const page = () => `page:snap-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  it("commits with version, hash, bytes, deps, tree root", () => {
    const p = page();
    const { html, nodes } = renderPage(() => fw.el("main", { key: "root" }, fw.el("h1", {}, "Hi")));
    const snap = snapshot.commit(p, { html, tree: nodes, deps: ["service:posts"], owners: ["core:views"] });
    assert.equal(snap.version, 1);
    assert.equal(snap.hash, snapshot.latest(p).hash);
    assert.equal(snap.bytes, Buffer.byteLength(html));
    assert.deepEqual(snap.deps, ["service:posts"]);
    assert.equal(snap.root.tag, "main");
  });

  it("versions monotonically per page", () => {
    const p = page();
    const s1 = snapshot.commit(p, { html: "v1" });
    const s2 = snapshot.commit(p, { html: "v2" });
    const s3 = snapshot.commit(p, { html: "v3" });
    assert.deepEqual([s1.version, s2.version, s3.version], [1, 2, 3]);
    assert.equal(snapshot.latest(p).hash, s3.hash);
  });

  it("keeps history and serves specific versions (resync source)", () => {
    const p = page();
    const snaps = [];
    for (let i = 1; i <= 5; i++) snaps.push(snapshot.commit(p, { html: `v${i}` }));
    assert.equal(snapshot.get(p, 2).hash, snaps[1].hash);
    assert.equal(snapshot.get(p, 5).hash, snaps[4].hash);
    assert.equal(snapshot.get(p, 999), null);
  });

  it("since() reports current / stale-recoverable / needsFull", () => {
    const p = page();
    snapshot.commit(p, { html: "v1" });
    snapshot.commit(p, { html: "v2" });
    assert.deepEqual(snapshot.since(p, 2), { current: true, missed: [], from: 2, needsFull: false });
    const stale = snapshot.since(p, 1);
    assert.equal(stale.current, false);
    assert.deepEqual(stale.missed, [2]);
    assert.equal(stale.needsFull, false, "v1 still in history — recoverable");
    // Unknown version beyond history → needsFull
    assert.equal(snapshot.since(p, 0).needsFull, true);
    assert.equal(snapshot.since(p, 99).needsFull, true);
  });

  it("falls back to html root when no tree was recorded", () => {
    const p = page();
    const snap = snapshot.commit(p, { html: "<p>plain</p>" });
    assert.equal(snap.root.type, "html");
    assert.equal(snap.root.html, "<p>plain</p>");
  });

  it("drop() is targeted; stats reflect live state", () => {
    const p1 = page();
    const p2 = page();
    snapshot.commit(p1, { html: "a" });
    snapshot.commit(p2, { html: "b" });
    assert.equal(snapshot.drop(p1), true);
    assert.equal(snapshot.latest(p1), null);
    assert.ok(snapshot.latest(p2), "unrelated page untouched");
    const st = snapshot.stats();
    assert.ok(st.pages >= 1);
  });
});
