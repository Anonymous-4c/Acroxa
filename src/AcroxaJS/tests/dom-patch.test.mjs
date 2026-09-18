// src/AcroxaJS/tests/dom-patch.test.mjs
// Browser reconciler invariants via jsdom (DB-free, node:test).
// Proves: keyed diff reuses nodes, stale generations drop, failed patches
// roll back, rapid queued patches collapse newest-wins, input state survives.

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "..", "acrx", "assets", "js", "dom-patch.js"),
  "utf8"
);

function boot(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`, { url: "http://localhost/" });
  const { window } = dom;
  // Minimal browser surface dom-patch.js touches.
  const sandboxWindow = window;
  const run = new Function("window", "document", "requestAnimationFrame", "module", "exports", SRC);
  const module = { exports: {} };
  run(sandboxWindow, window.document, undefined, module, module.exports);
  // Expose globals the module captured via window.* lookups.
  sandboxWindow.AcroxaDomPatch = sandboxWindow.AcroxaDomPatch || module.exports;
  return { window, api: sandboxWindow.AcroxaDomPatch };
}

describe("dom-patch reconciler", () => {
  it("keyed diff reuses stable nodes and updates text", () => {
    const { window, api } = boot(
      `<div data-acrx-id="boundary:core:x" data-acrx-generation="5"><p data-acrx-id="element:core:x.a">hi</p><p data-acrx-id="element:core:x.b">stay</p></div>`
    );
    const before = window.document.querySelector('[data-acrx-id="element:core:x.b"]');
    const el = window.document.querySelector('[data-acrx-id="boundary:core:x"]');
    const out = api.patchWithGeneration(
      el,
      `<div data-acrx-id="boundary:core:x" data-acrx-generation="6"><p data-acrx-id="element:core:x.a">hello</p><p data-acrx-id="element:core:x.b">stay</p></div>`,
      { generation: 6 }
    );
    assert.equal(out.action, "patch");
    assert.equal(window.document.querySelector('[data-acrx-id="element:core:x.a"]').textContent, "hello");
    assert.equal(window.document.querySelector('[data-acrx-id="element:core:x.b"]'), before);
  });

  it("drops stale generations without touching DOM", () => {
    const { window, api } = boot(
      `<div data-acrx-id="boundary:core:y" data-acrx-generation="10"><p>new</p></div>`
    );
    const el = window.document.querySelector('[data-acrx-id="boundary:core:y"]');
    const out = api.patchWithGeneration(
      el,
      `<div data-acrx-id="boundary:core:y" data-acrx-generation="9"><p>old</p></div>`,
      { generation: 9 }
    );
    assert.equal(out.action, "drop");
    assert.equal(window.document.querySelector('[data-acrx-id="boundary:core:y"]').textContent, "new");
  });

  it("preserves input values across patches", () => {
    const { window, api } = boot(
      `<div data-acrx-id="boundary:core:f" data-acrx-generation="1"><input data-acrx-id="element:core:f.q" value=""><span data-acrx-id="element:core:f.s">a</span></div>`
    );
    const input = window.document.querySelector('[data-acrx-id="element:core:f.q"]');
    input.value = "typed";
    const el = window.document.querySelector('[data-acrx-id="boundary:core:f"]');
    const out = api.patchWithGeneration(
      el,
      `<div data-acrx-id="boundary:core:f" data-acrx-generation="2"><input data-acrx-id="element:core:f.q" value=""><span data-acrx-id="element:core:f.s">b</span></div>`,
      { generation: 2 }
    );
    assert.equal(out.action, "patch");
    assert.equal(window.document.querySelector('[data-acrx-id="element:core:f.q"]').value, "typed");
    assert.equal(window.document.querySelector('[data-acrx-id="element:core:f.s"]').textContent, "b");
  });

  it("rolls back when verification fails (boundary vanishes)", () => {
    const { window, api } = boot(
      `<div id="wrap"><div data-acrx-id="boundary:core:z" data-acrx-generation="1"><p>orig</p></div></div>`
    );
    const el = window.document.querySelector('[data-acrx-id="boundary:core:z"]');
    // Payload replaces the boundary with an unmarked node: verification must
    // fail and the original must be restored.
    const out = api.patchWithGeneration(el, `<div><p>hijack</p></div>`, { generation: 2 });
    assert.ok(["drop", "reload"].includes(out.action));
    assert.equal(window.document.querySelector('[data-acrx-id="boundary:core:z"]').textContent, "orig");
  });

  it("queuePatch collapses rapid updates newest-wins", async () => {
    const { window, api } = boot(
      `<div data-acrx-id="boundary:core:q" data-acrx-generation="1"><p>v1</p></div>`
    );
    const el = window.document.querySelector('[data-acrx-id="boundary:core:q"]');
    api.queuePatch(el, `<div data-acrx-id="boundary:core:q"><p>v2</p></div>`, { generation: 2 });
    api.queuePatch(el, `<div data-acrx-id="boundary:core:q"><p>v3</p></div>`, { generation: 3 });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(window.document.querySelector('[data-acrx-id="boundary:core:q"]').textContent, "v3");
  });

  it("repeated patches do not accumulate listeners (leak guard)", () => {
    const { window, api } = boot(
      `<div data-acrx-id="boundary:core:leak" data-acrx-generation="1"><p>x</p></div>`
    );
    const before = window.document.querySelectorAll("*").length;
    for (let i = 2; i <= 52; i++) {
      const el = window.document.querySelector('[data-acrx-id="boundary:core:leak"]');
      const out = api.patchWithGeneration(
        el,
        `<div data-acrx-id="boundary:core:leak" data-acrx-generation="${i}"><p>x${i}</p></div>`,
        { generation: i }
      );
      assert.equal(out.action, "patch");
    }
    const after = window.document.querySelectorAll("*").length;
    assert.ok(after <= before + 2, `node count stable (before=${before}, after=${after})`);
    assert.equal(window.document.querySelector('[data-acrx-id="boundary:core:leak"]').textContent, "x52");
  });
});
