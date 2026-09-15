// src/core/runtime/__tests__/runtime.test.mjs
// AcroxaJS runtime primitive regression tests (DB-free, node:test).
// Covers: identity, revision, registry, hookBus, events, cache,
// graph, planner, invalidate, pipeline, targets, owners.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const identity = require("../identity.js");
const revision = require("../revision.js");
const registry = require("../registry.js");
const hookBus = require("../hookBus.js");
const events = require("../events.js");
const cache = require("../cache.js");
const graph = require("../graph.js");
const planner = require("../planner.js");
const invalidate = require("../invalidate.js");
const pipeline = require("../pipeline.js");
const targets = require("../targets.js");
const owners = require("../owners.js");

describe("identity", () => {
  it("makes stable deterministic target ids", () => {
    const a = identity.makeTargetId("widget", "core", "hero");
    assert.equal(a, "widget:core:hero");
    assert.ok(identity.isValidTargetId(a));
    assert.deepEqual(identity.parseTargetId(a), { type: "widget", owner: "core", key: "hero" });
  });
  it("sanitizes unsafe parts", () => {
    const id = identity.makeTargetId("Widget!", "Own er", "a/b");
    assert.ok(identity.isValidTargetId(id));
  });
  it("emits compact attrs", () => {
    const attrs = identity.targetAttrs("widget", "core", "tabs-x", { hydrate: "interaction" });
    assert.equal(attrs["data-acrx-id"], "widget:core:tabs-x");
    assert.equal(attrs["data-acrx-hydrate"], "interaction");
  });
});

describe("revision", () => {
  it("bumps monotonically", () => {
    const before = revision.get();
    const next = revision.bump("test", "global");
    assert.equal(next, before + 1);
    assert.equal(revision.get(), next);
  });
});

describe("registry", () => {
  it("registers, re-registers without duplicating, disposes by owner", async () => {
    const d1 = registry.register({ type: "widget", owner: "test-owner", name: "hero", version: 1 });
    assert.equal(typeof d1, "function");
    registry.register({ type: "widget", owner: "test-owner", name: "hero", version: 2 });
    const list = registry.list({ owner: "test-owner" });
    assert.equal(list.length, 1);
    assert.equal(list[0].version, 2);
    const out = await registry.disposeOwner("test-owner");
    assert.equal(out.disposed, 1);
    assert.equal(registry.list({ owner: "test-owner" }).length, 0);
  });
});

describe("hookBus", () => {
  it("runs filter chain in priority order and isolates failures", () => {
    const order = [];
    const d1 = hookBus.register("test:chain", (v) => { order.push("second"); return v + 2; }, "module");
    const d2 = hookBus.register("test:chain", (v) => { order.push("first"); return v + 1; }, "core");
    hookBus.register("test:chain", () => { throw new Error("boom"); }, "core");
    const out = hookBus.run("test:chain", 0);
    assert.equal(out, 3);
    assert.deepEqual(order, ["first", "second"]);
    d1(); d2();
    hookBus.disposeOwner("core");
    hookBus.disposeOwner("module");
  });
  it("exposes known hook definitions", () => {
    const defs = hookBus.describe();
    assert.ok(defs["page:beforeRender"]);
    assert.ok(defs["render:afterRender"]);
  });
});

describe("events", () => {
  it("requires namespaced names and disposes by owner", () => {
    assert.throws(() => events.on("badname", () => {}), /domain:action/);
    let n = 0;
    const off = events.on("test:fired", () => { n++; }, "test-owner");
    events.emit("test:fired", {});
    assert.equal(n, 1);
    off();
    events.emit("test:fired", {});
    assert.equal(n, 1);
  });
});

describe("cache", () => {
  it("hits, misses, and invalidates by dep", () => {
    const c = cache.getCache(`t-${Date.now()}`, { ttlMs: 60_000 });
    assert.equal(c.get("k"), undefined);
    c.set("k", 42, ["widget:hero"]);
    assert.equal(c.get("k"), 42);
    cache.invalidate("widget:hero");
    assert.equal(c.get("k"), undefined);
  });
});

describe("graph", () => {
  it("walks dependents transitively", () => {
    graph.depend("page:home", ["layout:default", "widget:hero"]);
    graph.depend("layout:default", ["css:theme"]);
    const affected = graph.affectedBy("widget:hero");
    assert.ok(affected.includes("page:home"));
    graph.remove("page:home");
    graph.remove("layout:default");
  });
});

describe("planner", () => {
  it("picks smallest safe strategy", () => {
    assert.equal(planner.choose({ kind: "css", scope: "stylesheet" }).strategy, "stylesheet-refresh");
    assert.equal(planner.choose({ kind: "view", scope: "view" }).strategy, "fragment-replace");
    assert.equal(planner.choose({ kind: "config", scope: "global" }).strategy, "full-reload");
  });
});

describe("invalidate", () => {
  it("bumps rev and carries targets", () => {
    const before = revision.get();
    const inv = invalidate.invalidate({ type: "widget", id: "widget:core:test", scope: "widget", reason: "test" });
    assert.equal(inv.v, before + 1);
    assert.equal(inv.id, "widget:core:test");
    assert.ok(inv.at);
  });
});

describe("pipeline", () => {
  it("classifies and plans without touching the browser", () => {
    const css = pipeline.handleFileChange("/app/src/layouts/zenith/assets/x.css", { operation: "change" });
    assert.equal(css.plan.strategy, "stylesheet-refresh");
    const view = pipeline.handleFileChange("/app/src/views/posts.js", { operation: "change" });
    assert.equal(view.plan.strategy, "fragment-replace");
    const cfg = pipeline.handleFileChange("/app/config/paths.json", { operation: "change" });
    assert.equal(cfg.plan.strategy, "full-reload");
    assert.equal(cfg.invalidation, null);
  });
});

describe("targets", () => {
  it("registers and retrieves render targets", () => {
    targets.register({ id: "widget:core:test-tabs", type: "widget", owner: "core", node: { type: "tabs" } });
    const t = targets.get("widget:core:test-tabs");
    assert.equal(t.type, "widget");
    targets.remove("widget:core:test-tabs");
    assert.equal(targets.get("widget:core:test-tabs"), null);
  });
});

describe("owners", () => {
  it("attributes layout files heuristically", () => {
    const sep = process.platform === "win32" ? "\\" : "/";
    const owner = owners.ownerOf(`/app/src${sep}layouts${sep}zenith${sep}layout.js`);
    assert.ok(owner.includes("zenith") || owner === "core");
  });
});
