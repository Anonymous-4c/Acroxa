// src/core/runtime/__tests__/render-diff.test.mjs
// AcroxaJS Phase 5 tests (DB-free, node:test).
// Covers the full diff op matrix (text/attr/insert/remove/replace/move/
// order/unchanged-reuse/leaf-fallback) + patch envelope validation +
// decideApply version fencing (v44-after-v45 never applies).

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
const diff = require(path.join(ROOT, "src/core/runtime/diff/index.js"));
const patch = require(path.join(ROOT, "src/core/runtime/diff/patch.js"));
const snapshot = require(path.join(ROOT, "src/core/runtime/render/snapshot.js"));
const fw = require(path.join(ROOT, "src/views/lib/framework.js"));

function renderTree(fn) {
  let nodes = null;
  rc.withRenderContext({}, (ctx) => { fn(); nodes = ctx.nodes; });
  return treeMod.build(nodes).roots[0];
}

describe("diff engine", () => {
  it("identical trees short-circuit (unchanged subtrees reused)", () => {
    const a = renderTree(() => fw.el("div", { key: "r" }, fw.el("span", { key: "s" }, "x")));
    const b = renderTree(() => fw.el("div", { key: "r" }, fw.el("span", { key: "s" }, "x")));
    const res = diff.diff(a, b);
    assert.equal(res.unchanged, true);
    assert.deepEqual(res.ops, []);
  });

  it("detects text changes as setHtml", () => {
    const a = renderTree(() => fw.el("h1", { key: "title" }, "Dashboard"));
    const b = renderTree(() => fw.el("h1", { key: "title" }, "Acroxa Dashboard"));
    const res = diff.diff(a, b);
    assert.equal(res.ops.length, 1);
    assert.equal(res.ops[0].op, "setHtml");
    assert.equal(res.ops[0].target, "title");
    assert.equal(res.ops[0].value, "Acroxa Dashboard");
  });

  it("detects attribute changes as setAttr/removeAttr", () => {
    const a = renderTree(() => fw.el("div", { key: "n", class: "old", hidden: true }));
    const b = renderTree(() => fw.el("div", { key: "n", class: "new" }));
    const res = diff.diff(a, b);
    const ops = res.ops;
    assert.ok(ops.some((o) => o.op === "setAttr" && o.name === "class" && o.value === "new"));
    assert.ok(ops.some((o) => o.op === "removeAttr" && o.name === "hidden"));
    assert.ok(!ops.some((o) => o.op === "setHtml"), "no text op for attr-only change");
  });

  it("never emits setAttr for rev/generation (versioning attrs excluded)", () => {
    const a = renderTree(() => fw.el("div", { key: "n" }));
    a.attrs = { ...a.attrs, "data-acrx-rev": "1", "data-acrx-generation": "1" };
    const b = renderTree(() => fw.el("div", { key: "n" }));
    b.attrs = { ...b.attrs, "data-acrx-rev": "2", "data-acrx-generation": "2" };
    const res = diff.diff(a, b);
    assert.equal(res.unchanged, true, "rev-only diff is a no-op");
  });

  it("detects insertions and removals (keyed children)", () => {
    const a = renderTree(() => fw.el("ul", { key: "list" }, fw.el("li", { key: "i1" }, "a")));
    const b = renderTree(() => fw.el("ul", { key: "list" },
      fw.el("li", { key: "i1" }, "a"),
      fw.el("li", { key: "i2" }, "b")
    ));
    const res = diff.diff(a, b);
    const ins = res.ops.filter((o) => o.op === "insert");
    assert.equal(ins.length, 1);
    assert.equal(ins[0].parent, "list");
    assert.ok(ins[0].html.includes('data-acrx-key="i2"'));
    // Reverse: removal
    const rev = diff.diff(b, a);
    const rem = rev.ops.filter((o) => o.op === "remove");
    assert.equal(rem.length, 1);
    assert.equal(rem[0].target, "i2");
  });

  it("detects order changes as move ops", () => {
    const a = renderTree(() => fw.el("ul", { key: "list" },
      fw.el("li", { key: "i1" }, "a"),
      fw.el("li", { key: "i2" }, "b"),
      fw.el("li", { key: "i3" }, "c")
    ));
    const b = renderTree(() => fw.el("ul", { key: "list" },
      fw.el("li", { key: "i3" }, "c"),
      fw.el("li", { key: "i1" }, "a"),
      fw.el("li", { key: "i2" }, "b")
    ));
    const res = diff.diff(a, b);
    const moves = res.ops.filter((o) => o.op === "move");
    assert.ok(moves.length >= 1, `moves emitted: ${JSON.stringify(res.ops)}`);
    // No content change ops — only repositioning
    assert.ok(!res.ops.some((o) => o.op === "setHtml" || o.op === "insert" || o.op === "remove"));
  });

  it("detects node replacement (tag change) as replaceSubtree", () => {
    const a = renderTree(() => fw.el("div", { key: "n" }, "x"));
    const b = renderTree(() => fw.el("section", { key: "n" }, "x"));
    const res = diff.diff(a, b);
    assert.equal(res.ops.length, 1);
    assert.equal(res.ops[0].op, "replaceSubtree");
    assert.ok(res.ops[0].html.startsWith("<section"));
  });

  it("detects identity change as replaceSubtree", () => {
    const a = renderTree(() => fw.el("div", { key: "old-id" }, "x"));
    const b = renderTree(() => fw.el("div", { key: "new-id" }, "x"));
    const res = diff.diff(a, b);
    assert.equal(res.ops[0].op, "replaceSubtree");
  });

  it("detects nested content changes without touching unchanged siblings", () => {
    const a = renderTree(() => fw.el("div", { key: "r" },
      fw.el("span", { key: "s1" }, "same"),
      fw.el("span", { key: "s2" }, "old")
    ));
    const b = renderTree(() => fw.el("div", { key: "r" },
      fw.el("span", { key: "s1" }, "same"),
      fw.el("span", { key: "s2" }, "new")
    ));
    const res = diff.diff(a, b);
    assert.equal(res.ops.length, 1);
    assert.equal(res.ops[0].target, "s2");
  });

  it("conservative: unkeyed structural mismatch replaces the parent", () => {
    const a = renderTree(() => fw.el("div", { key: "r" }, fw.el("p", {}, "a")));
    const b = renderTree(() => fw.el("div", { key: "r" }, fw.el("p", {}, "a"), fw.el("p", {}, "b")));
    const res = diff.diff(a, b);
    assert.ok(res.ops.length >= 1, "some op emitted");
    assert.ok(
      res.ops.some((o) => o.op === "setHtml" || o.op === "insert" || o.op === "replaceSubtree"),
      `safe op: ${JSON.stringify(res.ops)}`
    );
  });

  it("plain html roots diff as a region-level setHtml", () => {
    const res = diff.diff(
      { type: "html", id: "page-root", html: "<p>old</p>" },
      { type: "html", id: "page-root", html: "<p>new</p>" }
    );
    assert.equal(res.ops[0].op, "setHtml");
    assert.equal(res.ops[0].target, "page-root");
    assert.equal(res.ops[0].value, "<p>new</p>");
    const same = diff.diff(
      { type: "html", id: "page-root", html: "<p>same</p>" },
      { type: "html", id: "page-root", html: "<p>same</p>" }
    );
    assert.equal(same.unchanged, true);
  });
});

describe("patch protocol", () => {
  it("makePatch builds a valid envelope with patchId + bootId", () => {
    const p = patch.makePatch({ page: "page:/acrx/dashboard", fromVersion: 42, toVersion: 43, ops: [{ op: "setHtml", target: "t", value: "x" }] });
    assert.equal(p.type, "render.patch");
    assert.equal(p.page, "page:/acrx/dashboard");
    assert.equal(p.fromVersion, 42);
    assert.equal(p.toVersion, 43);
    assert.ok(p.patchId.startsWith("patch-43-"));
    assert.equal(p.valid, true);
  });

  it("validatePatch rejects unknown ops and missing fields", () => {
    assert.equal(patch.validatePatch({ type: "render.patch", page: "p", fromVersion: 1, toVersion: 2, ops: [{ op: "teleport", target: "x" }] }).ok, false);
    assert.equal(patch.validatePatch({ type: "render.patch", page: "p", fromVersion: 1, toVersion: 2, ops: [{ op: "setHtml", target: "x" }] }).ok, false, "setHtml.value missing");
    assert.equal(patch.validatePatch({ type: "render.patch", page: "", fromVersion: 1, toVersion: 2, ops: [] }).ok, false);
    assert.equal(patch.validatePatch({ type: "render.patch", page: "p", fromVersion: 2, toVersion: 2, ops: [] }).ok, false, "toVersion must exceed fromVersion");
    assert.equal(patch.validatePatch(null).ok, false);
  });

  it("decideApply: apply / stale / resync fencing", () => {
    assert.deepEqual(patch.decideApply(42, { fromVersion: 42, toVersion: 43 }), { action: "apply", reason: "fromVersion matches" });
    assert.equal(patch.decideApply(43, { fromVersion: 42, toVersion: 43 }).action, "stale", "older announcement dropped");
    assert.equal(patch.decideApply(42, { fromVersion: 44, toVersion: 45 }).action, "resync", "gap detected — never corrupt the DOM");
    assert.equal(patch.decideApply(42, { toVersion: "junk" }).action, "stale");
  });
});

describe("end-to-end: render → commit → diff → patch", () => {
  it("full chain produces a valid patch from two real renders", () => {
    const page = `page:e2e-diff-${Date.now()}`;
    const render = (title) => {
      let html = "", nodes = null;
      rc.withRenderContext({ route: "/acrx/t" }, (ctx) => {
        html = fw.el("main", { key: "root" }, fw.el("h1", { key: "title" }, title));
        nodes = ctx.nodes;
      });
      return { html, nodes };
    };
    const first = render("Dashboard");
    snapshot.commit(page, { html: first.html, tree: first.nodes });
    const second = render("Acroxa Dashboard");
    const prev = snapshot.latest(page);
    const d = diff.diff(prev.root, treeMod.build(second.nodes).roots[0]);
    const p = patch.makePatch({ page, fromVersion: prev.version, toVersion: prev.version + 1, ops: d.ops });
    assert.equal(d.unchanged, false);
    assert.equal(p.valid, true);
    assert.equal(p.ops[0].op, "setHtml");
    assert.equal(p.ops[0].value, "Acroxa Dashboard");
    snapshot.drop(page);
  });
});
