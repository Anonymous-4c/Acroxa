// src/core/runtime/__tests__/client-hooks.test.mjs
// AcroxaJS client hook-bus tests (DB-free, node:test).
// The browser hook module exports via module.exports, so its contract is
// tested directly: ordering, priority, once, disposal, scopes, cancellation,
// async semantics, error isolation, stats. Browser wiring is covered by
// source-contract tests below + Playwright in Phase 10.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const require = createRequire(import.meta.url);
const Hooks = require(path.join(ROOT, "acrx/assets/js/acrx-hooks.js"));

let n = 0;
const hook = (base) => `test:${base}-${n++}`;

afterEach(() => {
  Hooks.off();
});

describe("client hook bus", () => {
  it("runs listeners in priority order", () => {
    const h = hook("order");
    const order = [];
    Hooks.on(h, () => { order.push("late"); }, { priority: 30 });
    Hooks.on(h, () => { order.push("early"); }, { priority: 1 });
    Hooks.on(h, () => { order.push("mid"); });
    Hooks.run(h, {});
    assert.deepEqual(order, ["early", "mid", "late"]);
  });

  it("supports once + disposer + off + clear(scope)", () => {
    const h = hook("once");
    let c = 0;
    Hooks.once(h, () => { c++; });
    Hooks.run(h, {});
    Hooks.run(h, {});
    assert.equal(c, 1);

    const h2 = hook("dispose");
    const d = Hooks.on(h2, () => { c++; }, { scope: "probe-scope" });
    d();
    Hooks.run(h2, {});
    assert.equal(c, 1);

    Hooks.on(h2, () => { c++; }, { scope: "probe-scope" });
    assert.equal(Hooks.clear("probe-scope"), 1);
    Hooks.run(h2, {});
    assert.equal(c, 1);
  });

  it("cancels cancellable hooks on exact false", () => {
    const h = "navigation:before";
    const seen = [];
    Hooks.on(h, () => { seen.push(1); return false; });
    Hooks.on(h, () => { seen.push(2); });
    const ctx = Hooks.run(h, { url: "/x" });
    assert.equal(ctx.cancelled, true);
    assert.deepEqual(seen, [1]);
  });

  it("does not cancel non-cancellable hooks on false", () => {
    const h = hook("notify");
    const ctx = Hooks.run(h, {});
    Hooks.on(h, () => false);
    const out = Hooks.run(h, {});
    assert.equal(out.cancelled, false);
    void ctx;
  });

  it("skips async listeners in sync run, awaits them in runAsync", async () => {
    const h = hook("async");
    const order = [];
    Hooks.on(h, async () => { order.push("async"); });
    Hooks.on(h, () => { order.push("sync"); });
    Hooks.run(h, {});
    assert.deepEqual(order, ["sync"]);
    await Hooks.runAsync(h, {});
    assert.ok(order.includes("async"));
  });

  it("isolates listener errors and records them", () => {
    const h = hook("errors");
    let ok = false;
    Hooks.on(h, () => { throw new Error("boom"); }, { scope: "bad-scope" });
    Hooks.on(h, () => { ok = true; });
    Hooks.run(h, {});
    assert.equal(ok, true);
    const st = Hooks.stats();
    assert.ok(st.failed >= 1);
    assert.ok(st.failedHooks.some((f) => f.scope === "bad-scope" && f.hook === h));
  });

  it("shares mutable context and validates names", () => {
    const h = hook("ctx");
    Hooks.on(h, (ctx) => { ctx.extra = 42; });
    const out = Hooks.run(h, { a: 1 });
    assert.equal(out.extra, 42);
    assert.equal(out.a, 1);
    assert.equal(out.hook, h);
    assert.throws(() => Hooks.on("badname", () => {}), /domain:action/);
    assert.throws(() => Hooks.on(h, null), /function/);
  });

  it("lists registrations and exposes known vocabulary", () => {
    const h = hook("list");
    Hooks.on(h, () => {}, { scope: "s" });
    assert.equal(Hooks.list()[h], 1);
    assert.ok(Hooks.KNOWN_HOOKS["boundary:mount"]);
    assert.ok(Hooks.KNOWN_HOOKS["update:completed"]);
    assert.ok(Hooks.KNOWN_HOOKS["navigation:before"]);
    assert.ok(Hooks.CANCELLABLE["dom:before-patch"]);
  });
});

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

describe("client hook wiring", () => {
  it("loads before hydration that emits through it", () => {
    const head = src("src/modules/head.js");
    const h = head.indexOf("acrx-hooks.js");
    const hy = head.indexOf("hydration.js");
    assert.ok(h !== -1 && hy !== -1 && h < hy, "hooks lib must load before hydration.js");
  });

  it("hydration emits mount/unmount boundaries", () => {
    const hyd = src("acrx/assets/js/hydration.js");
    assert.ok(hyd.includes("boundary:mount"), "mount emit missing");
    assert.ok(hyd.includes("boundary:unmount"), "unmount emit missing");
  });

  it("dom-patch gates on cancellable before-patch and reports after", () => {
    const dp = src("acrx/assets/js/dom-patch.js");
    assert.ok(dp.includes("dom:before-patch"), "before-patch missing");
    assert.ok(dp.includes("dom:after-patch"), "after-patch missing");
    assert.ok(dp.includes("cancelled"), "cancellation must short-circuit to noop");
  });
});
