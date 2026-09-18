// src/core/runtime/__tests__/rc-rr-rt.test.mjs
// RC/RR/RT endpoint invariants (DB-free, node:test, mocked req/res).

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../../../controllers/runtimeController.js");
const targets = require("../targets.js");
const revision = require("../revision.js");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

beforeEach(() => {
  try { targets.clear(); } catch (_) {}
});

describe("RC endpoint", () => {
  it("rejects empty bodies and explains decisions", () => {
    const res = mockRes();
    runtime.rc({ body: {} }, res);
    assert.equal(res.statusCode, 400);
  });
  it("classifies a css change as STYLE_UPDATE with WHY", () => {
    const res = mockRes();
    runtime.rc({ body: { changedFile: "C:\\proj\\public\\assets\\site.css" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.action, "STYLE_UPDATE");
    assert.ok(Array.isArray(res.body.why) && res.body.why.length >= 2);
    assert.equal(typeof res.body.rev, "number");
  });
  it("classifies a view change with affected deps", () => {
    const res = mockRes();
    runtime.rc({ body: { changedFile: "src/views/posts.js" } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(["REPLACE", "VIEW_UPDATE"].includes(res.body.action));
    assert.ok(res.body.why.length >= 2);
  });
});

describe("RR endpoint", () => {
  it("renders a registered target with a verify envelope", () => {
    targets.register({
      id: "widget:core:video-rr1", type: "widget", owner: "core",
      node: { id: "rr1", type: "video", attributes: { src: "/v.mp4" } },
      component: "video", hydrate: "none",
    });
    const res = mockRes();
    runtime.rr({ body: { target: "widget:core:video-rr1" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.boundary, "widget:core:video-rr1");
    assert.ok(res.body.html.includes("<video"));
    assert.ok(res.body.verify && typeof res.body.verify.hash === "string");
    assert.equal(typeof res.body.generation, "number");
  });
  it("404s unknown targets (never fabricates HTML)", () => {
    const res = mockRes();
    runtime.rr({ body: { target: "widget:core:does-not-exist-xyz" } }, res);
    assert.equal(res.statusCode, 404);
  });
});

describe("RT endpoint", () => {
  it("rejects unknown ops and validates targets", () => {
    const bad = mockRes();
    runtime.rt({ body: { op: "teleport" } }, bad);
    assert.equal(bad.statusCode, 400);
    const missing = mockRes();
    runtime.rt({ body: { op: "patch", target: "widget:core:nope-rt-xyz" } }, missing);
    assert.equal(missing.statusCode, 404);
  });
  it("rejects stale generations with 409", () => {
    targets.register({
      id: "widget:core:video-rt1", type: "widget", owner: "core",
      node: { id: "rt1", type: "video", attributes: {} },
      component: "video", generation: revision.get() + 10,
    });
    const res = mockRes();
    runtime.rt({ body: { op: "patch", target: "widget:core:video-rt1", generation: 0 } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.stale, true);
  });
  it("validates fresh ops without mutating (applied=false)", () => {
    targets.register({
      id: "widget:core:video-rt2", type: "widget", owner: "core",
      node: { id: "rt2", type: "video", attributes: {} },
      component: "video",
    });
    const entry = targets.get("widget:core:video-rt2");
    const res = mockRes();
    runtime.rt({ body: { op: "patch", target: "widget:core:video-rt2", generation: entry.generation } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.applied, false);
    assert.ok(res.body.selector.includes("widget:core:video-rt2"));
  });
});
