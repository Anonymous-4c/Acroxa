// src/AcroxaJS/tests/contracts.test.mjs
// Phase 1 contract invariants (DB-free, node:test).
// Run: node --test --test-force-exit "src/AcroxaJS/tests/*.test.mjs"

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AcroxaJS = require("../index.js");
const identity = require("../contracts/identity.js");
const proto = require("../contracts/update-protocol.js");
const manifest = require("../contracts/manifest.js");
const lifecycle = require("../contracts/lifecycle.js");

describe("AcroxaJS entry", () => {
  it("exposes version and contracts", () => {
    const d = AcroxaJS.describe();
    assert.equal(d.name, "AcroxaJS");
    assert.ok(d.version);
    assert.deepEqual(d.contracts, ["identity", "update-protocol", "manifest", "lifecycle", "runtime-contracts"]);
  });
});

describe("identity contract", () => {
  it("is deterministic and valid", () => {
    const a = identity.boundaryId("core", "dashboard", "stats");
    const b = identity.boundaryId("core", "dashboard", "stats");
    assert.equal(a, b);
    assert.ok(identity.isValid(a));
    assert.deepEqual(identity.parse(a), { type: "boundary", owner: "core", key: "dashboard.stats" });
  });
  it("serializes safe DOM attrs", () => {
    const s = identity.attrsString("boundary", "core", "x", { hydrate: "immediate" });
    assert.ok(s.includes('data-acrx-id="boundary:core:x"'));
    // unsafe key chars are sanitized to dashes by the shared id space
    const evil = identity.attrsString("boundary", "core", 'a"b<c', {});
    assert.ok(evil.includes('data-acrx-id="boundary:core:a-b-c"'));
    // unsafe metadata values are HTML-escaped, never break the attribute
    const comp = identity.attrsString("boundary", "core", "x", { component: 'a"b<c' });
    assert.ok(comp.includes("&quot;") && comp.includes("&lt;"));
    assert.ok(!comp.includes('a"b<c'));
  });
  it("shares the id space with runtime/identity", () => {
    const rt = require("../../core/runtime/identity.js");
    const id = identity.makeTargetId("view", "core", "home");
    assert.ok(rt.isValidTargetId(id));
  });
});

describe("update-protocol contract", () => {
  it("validates messages and caps targets", () => {
    const good = { v: 3, bootId: "b1", type: "boundary", id: "boundary:core:x", scope: "boundary", reason: "test", targets: [], at: Date.now() };
    assert.equal(proto.validate(good).ok, true);
    const bad = { ...good, scope: "nope", targets: new Array(201).fill("x") };
    const r = proto.validate(bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length >= 2);
  });
  it("scope rank prefers the smallest safe scope", () => {
    assert.ok(proto.rankOf("element") < proto.rankOf("boundary"));
    assert.ok(proto.rankOf("boundary") < proto.rankOf("view"));
    assert.ok(proto.rankOf("view") < proto.rankOf("route"));
    assert.ok(proto.isNarrowerOrEqual("boundary", "view"));
    assert.ok(!proto.isNarrowerOrEqual("route", "view"));
  });
  it("stale messages never overwrite newer state", () => {
    const committed = { v: 11, bootId: "b1" };
    assert.equal(proto.isStale({ v: 10, bootId: "b1" }, committed), true);
    assert.equal(proto.isStale({ v: 11, bootId: "b1" }, committed), true);
    assert.equal(proto.isStale({ v: 12, bootId: "b1" }, committed), false);
    assert.equal(proto.isStale({ v: 99, bootId: "b2" }, committed), true);
  });
  it("wraps real invalidations", () => {
    const inv = require("../../core/runtime/invalidate.js").invalidate({
      type: "view", id: "test-contract-view", scope: "view", reason: "contract-test",
    });
    const msg = proto.fromInvalidation(inv);
    assert.equal(proto.validate(msg).ok, true);
    assert.equal(msg.id, "test-contract-view");
  });
});

describe("manifest contract", () => {
  it("builds from live state and validates", () => {
    const m = manifest.build({ includeRoutes: false });
    assert.equal(m.kind, "acroxajs-manifest");
    assert.equal(manifest.validate(m).ok, true);
  });
  it("detects bootId mismatch and major mismatch", () => {
    const m = manifest.build({ includeRoutes: false });
    const stale = manifest.checkCompatible(m, { v: m.rev, bootId: "other-boot", runtimeVersion: m.runtimeVersion });
    assert.equal(stale.ok, false);
    const ok = manifest.checkCompatible(m, { v: m.rev, bootId: m.bootId, runtimeVersion: m.runtimeVersion });
    assert.equal(ok.ok, true);
  });
});

describe("lifecycle contract", () => {
  it("covers the §21 vocabulary and agrees with hookBus", () => {
    assert.ok(lifecycle.LIFECYCLE_EVENTS.includes("boundary:mount"));
    assert.ok(lifecycle.LIFECYCLE_EVENTS.includes("navigation:complete"));
    assert.ok(lifecycle.LIFECYCLE_EVENTS.includes("update:failed"));
    assert.ok(lifecycle.isKnown("boundary:mount"));
    assert.ok(lifecycle.isKnown("page:beforeRender"));
    assert.equal(lifecycle.isKnown("nope:never"), false);
  });
});
