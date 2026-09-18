import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEventBus, EVENT_BUS_VERSION } from "../event-bus.js";
import { createValidationEngine } from "../validation-engine.js";

describe("event bus", () => {
  it("emits payloads to subscribers and supports off", () => {
    const bus = createEventBus();
    assert.equal(typeof EVENT_BUS_VERSION, "string");
    let got = null;
    const off = bus.on("doc:insert", (ctx) => { got = ctx; });
    bus.emit("doc:insert", { id: "n1" });
    assert.equal(got.id, "n1");
    assert.equal(got.event, "doc:insert");
    off();
    got = null;
    bus.emit("doc:insert", { id: "n2" });
    assert.equal(got, null);
    bus.destroy();
  });

  it("supports wildcards, once and namespaces", () => {
    const bus = createEventBus();
    const seen = [];
    bus.on("doc:*", (ctx) => seen.push(ctx.event));
    bus.once("doc:insert", () => seen.push("once-insert"));
    bus.emit("doc:insert");
    bus.emit("doc:insert");
    bus.emit("doc:remove");
    bus.emit("other:insert");
    assert.deepEqual(seen, ["doc:insert", "once-insert", "doc:insert", "doc:remove"]);
    bus.destroy();
  });

  it("shouldRun is a cancelable guard; stopPropagation halts listeners", () => {
    const bus = createEventBus();
    bus.on("cmd:save", (ctx) => ctx.preventDefault());
    assert.equal(bus.shouldRun("cmd:save"), false);
    assert.equal(bus.shouldRun("cmd:other"), true);
    const order = [];
    bus.on("chain", (ctx) => { order.push(1); ctx.stopPropagation(); });
    bus.on("chain", () => order.push(2));
    bus.emit("chain");
    assert.deepEqual(order, [1]);
    bus.destroy();
  });

  it("isolates listener errors and reports listener counts", () => {
    const bus = createEventBus();
    const reports = [];
    bus.setErrorHandler((info) => reports.push(info.pattern));
    let ran = false;
    bus.on("x", () => { throw new Error("boom"); });
    bus.on("x", () => { ran = true; });
    bus.emit("x");
    assert.equal(ran, true);
    assert.deepEqual(reports, ["x"]);
    assert.equal(bus.listenerCount("x"), 2);
    assert.equal(bus.listenerCount(), 2);
    assert.deepEqual(bus.eventNames(), ["x"]);
    bus.clear();
    assert.equal(bus.listenerCount(), 0);
    bus.destroy();
  });

  it("waitFor resolves on emit and rejects on timeout", async () => {
    const bus = createEventBus();
    const p = bus.waitFor("ready");
    bus.emit("ready", { n: 7 });
    assert.equal((await p).n, 7);
    await assert.rejects(() => bus.waitFor("never", { timeout: 10 }), /Timed out/);
    bus.destroy();
  });
});

describe("validation engine", () => {
  it("aggregates checks into structured results", () => {
    const v = createValidationEngine();
    v.registerCheck({ id: "title", scope: "doc", run: (t) => (!t.title ? "Missing title." : null) });
    v.registerCheck({
      id: "alt", scope: "doc", severity: "warning",
      run: (t) => (t.img && !t.img.alt ? [{ code: "NO_ALT", path: "img.alt", message: "Image lacks alt text." }] : null),
    });
    const bad = v.validate({ img: {} }, { scope: "doc" });
    assert.equal(bad.valid, false);
    assert.equal(bad.errors[0].code, "CHECK_FAILED");
    assert.equal(bad.warnings[0].code, "NO_ALT");
    assert.deepEqual(bad.ran, ["title", "alt"]);
    const good = v.validate({ title: "Hi", img: { alt: "x" } }, { scope: "doc" });
    assert.equal(good.valid, true);
    assert.equal(v.listChecks("doc").length, 2);
    v.destroy();
  });

  it("captures throwing checks and filters by ids", () => {
    const v = createValidationEngine();
    v.registerCheck({ id: "boom", run: () => { throw new Error("kaboom"); } });
    v.registerCheck({ id: "fine", run: () => true });
    const res = v.validate({});
    assert.equal(res.valid, false);
    assert.equal(res.errors[0].code, "CHECK_THREW");
    const only = v.validate({}, { ids: ["fine"] });
    assert.equal(only.valid, true);
    assert.equal(v.unregisterCheck("boom"), true);
    v.destroy();
  });
});
