// src/AcroxaJS/tests/transaction-demo.test.mjs
// Phase 3 invariants: patch gate + demo route boundaries.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tx = require("../dom/transaction.js");

describe("patch transaction gate", () => {
  const committed = { v: 11, bootId: "b1" };
  it("patches newer same-boot messages", () => {
    const r = tx.decide({ v: 12, bootId: "b1", type: "boundary", id: "boundary:core:demo.counter", scope: "boundary", reason: "test", targets: ["boundary:core:demo.counter"], at: Date.now() }, committed);
    assert.equal(r.action, "patch");
    assert.deepEqual(r.targets, ["boundary:core:demo.counter"]);
  });
  it("drops stale messages (never overwrites newer)", () => {
    assert.equal(tx.decide({ v: 10, bootId: "b1", type: "boundary", id: "x", scope: "boundary", reason: "s", at: Date.now() }, committed).action, "drop");
    assert.equal(tx.decide({ v: 11, bootId: "b1", type: "boundary", id: "x", scope: "boundary", reason: "s", at: Date.now() }, committed).action, "drop");
  });
  it("reloads on boot mismatch or invalid payload", () => {
    assert.equal(tx.decide({ v: 99, bootId: "b2", type: "boundary", id: "x", scope: "boundary", reason: "s", at: Date.now() }, committed).action, "reload");
    assert.equal(tx.decide({ v: -1, bootId: "b1", type: "nope", id: "", scope: "nope" }, committed).action, "reload");
    assert.equal(tx.decide({ v: 12, bootId: "b1", type: "full-reload", id: "app", scope: "global", reason: "deploy", at: Date.now() }, committed).action, "reload");
  });
  it("commit advances the revision cursor", () => {
    const next = tx.commit(committed, { v: 12, bootId: "b1" });
    assert.deepEqual(next, { v: 12, bootId: "b1" });
  });
});

describe("demo route", () => {
  it("renders six independent boundaries with stable ids", () => {
    const { renderAcroxaJSDemo } = require("../../views/acroxajsDemo.js");
    const html = renderAcroxaJSDemo();
    for (const b of ["demo.counter", "demo.clock", "demo.data", "demo.nested", "demo.form", "demo.style"]) {
      assert.ok(html.includes(`data-acrx-id="boundary:core:${b}"`), `missing ${b}`);
    }
    assert.ok(html.includes('data-demo="form-input"'));
    assert.ok(html.includes("/acrx/assets/js/acroxajs-demo.js"));
  });
  it("demo meta registers the route", () => {
    const demo = require("../../views/acroxajsDemo.js");
    assert.equal(demo.meta[0].path, "/acrx/__acroxajs-demo");
  });
});
