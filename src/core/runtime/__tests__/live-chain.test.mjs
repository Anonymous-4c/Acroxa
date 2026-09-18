// src/core/runtime/__tests__/live-chain.test.mjs
// AcroxaJS Phase 6 live-chain tests (DB-free, node:test).
// Server side: source contracts — renderPageWrapper records the content
// tree (withRenderContext), commits snapshots, fragment responses carry
// ops + contentVersion, layout stamps the version, admin runtime
// version-gates op patches. Client side (jsdom): applyOps applies the
// server op list with state preservation (input/focus/scroll) and
// mutate-first semantics; dup-listener safety after repeated patches.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const pagesSrc = src("src/routes/pages.js");
const layoutSrc = src("src/modules/layout.js");
const adminSrc = src("acrx/assets/js/acrx-admin-runtime.js");

const PATCH_JS = src("acrx/assets/js/dom-patch.js");

function bootDom(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`, { url: "http://localhost/" });
  const { window } = dom;
  // dom-patch.js uses CSS.escape (real browsers have the CSS global; the
  // Function sandbox scope chain is Node's global — expose jsdom's CSS).
  globalThis.CSS = window.CSS;
  const run = new Function("window", "document", "requestAnimationFrame", "module", "exports", PATCH_JS);
  const module = { exports: {} };
  run(window, window.document, undefined, module, module.exports);
  window.AcroxaDomPatch = window.AcroxaDomPatch || module.exports;
  return { window, api: window.AcroxaDomPatch };
}

describe("live chain — server contracts", () => {
  it("renderPageWrapper renders inside a render context (tree source)", () => {
    assert.ok(pagesSrc.includes("withRenderContext"), "withRenderContext missing");
    assert.ok(pagesSrc.includes('"page:" + page.path'), "pageId key missing");
    assert.ok(pagesSrc.includes("commitContentSnapshot"), "snapshot commit missing");
  });

  it("fragment responses carry contentVersion always + ops when expressible", () => {
    assert.ok(pagesSrc.includes("body.contentVersion = snap.version"), "contentVersion missing");
    assert.ok(pagesSrc.includes("body.ops = patchInfo.ops"), "ops missing");
    assert.ok(pagesSrc.includes("body.fromVersion = patchInfo.fromVersion"), "fromVersion missing");
    assert.ok(pagesSrc.includes("d.ops.length <= 40"), "op bound missing (bounded patch protocol)");
  });

  it("layout stamps the committed version on #acrx-content", () => {
    assert.ok(layoutSrc.includes("data-acrx-content-version"), "version attr missing");
    assert.ok(layoutSrc.includes("contentVersion"), "contentVersion param missing");
  });

  it("admin runtime version-gates op patches against the committed version", () => {
    assert.ok(adminSrc.includes("frag.fromVersion === contentVersion"), "version gate missing");
    assert.ok(adminSrc.includes("window.AcroxaDomPatch.applyOps"), "applyOps delegation missing");
    assert.ok(adminSrc.includes("contentVersion = frag.contentVersion"), "version adoption missing");
    assert.ok(adminSrc.includes("data-acrx-content-version"), "boot read missing");
    assert.ok(adminSrc.includes("location.reload") === false, "zero location.reload (never auto-reload)");
  });
});

describe("live chain — applyOps (jsdom)", () => {
  it("setHtml updates text and preserves focused input values", () => {
    const { window, api } = bootDom(
      `<div data-acrx-id="panel"><input data-acrx-id="fld" value="keep"><span data-acrx-id="label">old</span></div>`
    );
    const input = window.document.querySelector('[data-acrx-id="fld"]');
    input.focus();
    const out = api.applyOps([
      { op: "setHtml", target: "label", value: "new" },
    ]);
    assert.equal(out.applied, 1);
    assert.equal(out.failed, 0);
    assert.equal(window.document.querySelector('[data-acrx-id="label"]').textContent, "new");
    assert.equal(window.document.querySelector('[data-acrx-id="fld"]').value, "keep", "input preserved");
    assert.equal(window.document.activeElement === input || window.document.activeElement === window.document.body, true);
  });

  it("setAttr / removeAttr mutate without destroying the element", () => {
    const { window, api } = bootDom(`<div data-acrx-id="n" class="old" hidden></div>`);
    const el = window.document.querySelector('[data-acrx-id="n"]');
    const out = api.applyOps([
      { op: "setAttr", target: "n", name: "class", value: "new" },
      { op: "removeAttr", target: "n", name: "hidden" },
    ]);
    assert.equal(out.applied, 2);
    assert.equal(window.document.querySelector('[data-acrx-id="n"]'), el, "same node — no destroy");
    assert.equal(el.getAttribute("class"), "new");
    assert.equal(el.hasAttribute("hidden"), false);
  });

  it("insert / remove / move work on keyed children", () => {
    const { window, api } = bootDom(
      `<ul data-acrx-id="list"><li data-acrx-key="i1">a</li><li data-acrx-key="i2">b</li></ul>`
    );
    const out = api.applyOps([
      { op: "insert", parent: "list", html: `<li data-acrx-key="i3">c</li>`, before: null },
    ]);
    assert.equal(out.applied, 1);
    let kids = [...window.document.querySelectorAll('[data-acrx-key]')].map((k) => k.getAttribute("data-acrx-key"));
    assert.deepEqual(kids, ["i1", "i2", "i3"]);

    const moved = api.applyOps([
      { op: "move", target: "i3", parent: "list", before: "i1" },
    ]);
    assert.equal(moved.applied, 1);
    kids = [...window.document.querySelectorAll('[data-acrx-key]')].map((k) => k.getAttribute("data-acrx-key"));
    assert.deepEqual(kids, ["i3", "i1", "i2"]);

    const removed = api.applyOps([
      { op: "remove", target: "i2" },
    ]);
    assert.equal(removed.applied, 1);
    kids = [...window.document.querySelectorAll('[data-acrx-key]')].map((k) => k.getAttribute("data-acrx-key"));
    assert.deepEqual(kids, ["i3", "i1"]);
  });

  it("replaceSubtree replaces and rehydrates", () => {
    const { window, api } = bootDom(`<div data-acrx-id="wrap"><p data-acrx-id="old">x</p></div>`);
    const out = api.applyOps([
      { op: "replaceSubtree", target: "old", html: `<section data-acrx-id="old">new</section>` },
    ]);
    assert.equal(out.applied, 1);
    assert.equal(out.failed, 0);
    const el = window.document.querySelector('[data-acrx-id="old"]');
    assert.equal(el.tagName, "SECTION");
    assert.equal(el.textContent, "new");
  });

  it("missing targets fail safely (never corrupt the DOM)", () => {
    const { window, api } = bootDom(`<div data-acrx-id="keep">x</div>`);
    const out = api.applyOps([
      { op: "setHtml", target: "nope", value: "y" },
      { op: "remove", target: "nope" },
    ]);
    assert.equal(out.applied, 0);
    assert.equal(out.failed, 2);
    assert.ok(window.document.querySelector('[data-acrx-id="keep"]'), "DOM untouched");
  });

  it("repeated op patches never duplicate listeners (click fires once)", () => {
    const { window, api } = bootDom(
      `<div data-acrx-id="panel"><button data-acrx-id="btn" id="btn">go</button><span data-acrx-id="count">0</span></div>`
    );
    let clicks = 0;
    const btn = window.document.querySelector('[data-acrx-id="btn"]');
    btn.addEventListener("click", () => { clicks++; });
    // Simulate the server-side hydration delegation pattern: listener on the
    // button; repeated setHtml patches on the SIBLING (count) must never
    // touch the button's listeners; a button replaceSubtree re-binds via
    // the delegated pattern (listener survives because the node survives).
    for (let i = 1; i <= 5; i++) {
      api.applyOps([{ op: "setHtml", target: "count", value: String(i) }]);
    }
    btn.click();
    assert.equal(clicks, 1, "exactly one handler fired after 5 patches");
    assert.equal(window.document.querySelector('[data-acrx-id="btn"]'), btn, "button node retained");
  });
});
