// src/AcroxaJS/tests/runtime-contracts.test.mjs
// RC/RR/RT contract invariants (DB-free, node:test).
// Run: node --test --test-force-exit "src/AcroxaJS/tests/*.test.mjs"

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rc = require("../contracts/runtime-contracts.js");
const verify = require("../server/verify.js");
const transaction = require("../dom/transaction.js");

describe("RC contract", () => {
  it("rejects empty requests and accepts target/file", () => {
    assert.equal(rc.validateRcRequest({}).ok, false);
    assert.equal(rc.validateRcRequest({ target: "widget:core:video-x" }).ok, true);
    assert.equal(rc.validateRcRequest({ changedFile: "src/views/posts.js" }).ok, true);
  });
  it("requires a non-empty WHY explanation", () => {
    const base = { action: "PATCH", affected: [], why: ["classified as view/view", "view changed"], rev: 1 };
    assert.equal(rc.validateRcResponse(base).ok, true);
    assert.equal(rc.validateRcResponse({ ...base, why: [] }).ok, false);
    assert.equal(rc.validateRcResponse({ ...base, action: "NOPE" }).ok, false);
  });
  it("maps strategies to smallest safe actions", () => {
    assert.equal(rc.strategyToAction("stylesheet-refresh"), "STYLE_UPDATE");
    assert.equal(rc.strategyToAction("fragment-replace"), "REPLACE");
    assert.equal(rc.strategyToAction("full-reload"), "FULL_REFRESH");
    assert.equal(rc.strategyToAction("eject-inject"), "MODULE_UPDATE");
    // Safety over minimality: critical boundaries always FULL_REFRESH.
    assert.equal(rc.strategyToAction("fragment-replace", { critical: true }), "FULL_REFRESH");
  });
  it("escalates one step toward full refresh", () => {
    assert.equal(rc.escalate("PATCH"), "REPLACE");
    assert.equal(rc.escalate("MODULE_RELOAD"), "FULL_REFRESH");
    assert.equal(rc.escalate("FULL_REFRESH"), "FULL_REFRESH");
  });
});

describe("RR contract", () => {
  it("embeds a verifiable hash envelope", () => {
    const env = verify.verifyEnvelope({ boundary: "widget:core:video-x", html: "<div>hi</div>", rev: 7, bootId: "b1", generation: 7 });
    assert.equal(env.verify.bytes > 0, true);
    assert.equal(verify.checkHtml("<div>hi</div>", env.verify).ok, true);
    assert.equal(verify.checkHtml("<div>bye</div>", env.verify).ok, false);
    assert.equal(rc.validateRrResponse({ html: env.html, rev: 7, verify: env.verify }).ok, true);
  });
});

describe("RT contract", () => {
  it("validates ops and generations", () => {
    assert.equal(rc.validateRtRequest({ op: "patch", target: "widget:core:x", generation: 3 }).ok, true);
    assert.equal(rc.validateRtRequest({ op: "teleport" }).ok, false);
    assert.equal(rc.validateRtRequest({ op: "patch", generation: -1 }).ok, false);
  });
  it("drives the transaction gate (patch/drop/reload)", () => {
    const committed = { v: 5, bootId: "b1" };
    assert.equal(transaction.decide({ v: 6, bootId: "b1", type: "boundary", id: "boundary:core:x", scope: "boundary", targets: ["boundary:core:x"] }, committed).action, "patch");
    assert.equal(transaction.decide({ v: 5, bootId: "b1", type: "boundary", id: "boundary:core:x", scope: "boundary", targets: [] }, committed).action, "drop");
    assert.equal(transaction.decide({ v: 9, bootId: "b2", type: "boundary", id: "boundary:core:x", scope: "boundary", targets: [] }, committed).action, "reload");
  });
});
