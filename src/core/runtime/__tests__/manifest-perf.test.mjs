// src/core/runtime/__tests__/manifest-perf.test.mjs
// AcroxaJS manifest + perf regression tests (DB-free, node:test).
// Covers: perf.measure/record/stats aggregates, public manifest shape
// (rev/bootId/transports/capabilities, no secrets).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const perf = require("../perf.js");
const runtime = require("../../../controllers/runtimeController.js");

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

describe("perf", () => {
  it("measures sync work and aggregates per stage", () => {
    perf.clear();
    const out = perf.measure("test-stage", () => 42);
    assert.equal(out, 42);
    const s = perf.stats();
    assert.ok(s.stages["test-stage"]);
    assert.equal(s.stages["test-stage"].count, 1);
    assert.equal(typeof s.stages["test-stage"].avgMs, "number");
    assert.equal(typeof s.stages["test-stage"].maxMs, "number");
    assert.equal(typeof s.stages["test-stage"].lastMs, "number");
    perf.clear();
  });

  it("measures async work and never throws on bad input", () => {
    return perf.measureAsync("test-async", async () => "ok").then((v) => {
      assert.equal(v, "ok");
      assert.ok(perf.stats().stages["test-async"]);
      assert.doesNotThrow(() => perf.record(null, NaN));
      assert.doesNotThrow(() => perf.record("x", -5));
      perf.clear();
    });
  });
});

describe("manifest", () => {
  it("exposes live rev/bootId/transports/capabilities with no-store", () => {
    const res = mockRes();
    runtime.manifest({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Cache-Control"], "no-store");
    const b = res.body;
    assert.equal(b.success, true);
    assert.equal(b.runtime, "acroxajs/1");
    assert.equal(typeof b.rev, "number");
    assert.equal(typeof b.bootId, "string");
    assert.ok(Array.isArray(b.transports));
    assert.ok(b.transports.some((t) => t.name === "sse" && t.url === "/acr/api/runtime/sse"));
    assert.ok(b.capabilities.fragmentTypes.includes("widget-node"));
    assert.ok(b.capabilities.fragmentTypes.includes("target"));
    assert.ok(b.capabilities.strategies.includes("stylesheet-refresh"));
    assert.ok(b.capabilities.strategies.includes("full-reload"));
    assert.ok(Array.isArray(b.hooks));
    assert.ok(b.registry && typeof b.registry.total === "number");
    assert.ok(b.graph && typeof b.graph.resources === "number");
    assert.ok(b.targets && typeof b.targets.targets === "number");
    assert.ok(b.perf && typeof b.perf.stages === "object");
  });

  it("leaks no callbacks, paths, or secrets", () => {
    const res = mockRes();
    runtime.manifest({}, res);
    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes("callback"));
    assert.ok(!raw.includes("password"));
    assert.ok(!raw.includes("secret"));
    assert.ok(!raw.includes("token"));
  });
});
