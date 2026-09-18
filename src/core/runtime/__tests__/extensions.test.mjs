// src/core/runtime/__tests__/extensions.test.mjs
// Extension registry + conflict detection (DB-free, node:test).

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const extensions = require("../extensions.js");

beforeEach(() => {
  extensions.clear();
});

describe("extension registry", () => {
  it("registers and validates manifests", () => {
    const r = extensions.register({ id: "gallery", version: "1.2.0", boundaries: ["boundary:core:nav"], hooks: ["render:beforeRender"] });
    assert.equal(r.id, "gallery");
    assert.equal(r.enabled, true);
    assert.throws(() => extensions.register({ id: "Bad Id!!" }), /invalid manifest/);
    assert.throws(() => extensions.register({ id: "x", version: "not-semver" }), /invalid manifest/);
  });
  it("enables and disables with revision side effects", () => {
    extensions.register({ id: "analytics" });
    assert.equal(extensions.setEnabled("analytics", false), true);
    assert.equal(extensions.get("analytics").enabled, false);
    assert.equal(extensions.setEnabled("analytics", true), true);
    assert.equal(extensions.list({ enabledOnly: true }).length, 1);
  });
  it("detects shared-boundary conflicts with explanations", () => {
    extensions.register({ id: "ext-a", boundaries: ["boundary:core:nav"], hooks: ["render:beforeRender"] });
    extensions.register({ id: "ext-b", boundaries: ["boundary:core:nav"], hooks: ["render:beforeRender"] });
    const conflicts = extensions.detectConflicts();
    assert.ok(conflicts.length >= 1);
    const c = conflicts.find((x) => x.a === "ext-a" && x.b === "ext-b");
    assert.ok(c);
    assert.ok(c.reason.includes("ext-a") && c.reason.includes("ext-b"));
    assert.ok(c.targets.includes("boundary:core:nav"));
    assert.equal(extensions.stats().conflicts >= 1, true);
  });
  it("detects declared conflicts", () => {
    extensions.register({ id: "old-seo", conflicts: ["new-seo"] });
    extensions.register({ id: "new-seo" });
    const conflicts = extensions.detectConflicts();
    assert.ok(conflicts.some((c) => c.kind === "declared"));
  });
  it("attributes boundaries to owners", () => {
    extensions.register({ id: "search", boundaries: ["boundary:core:search"] });
    assert.equal(extensions.ownerOfBoundary("boundary:core:search"), "search");
    assert.equal(extensions.ownerOfBoundary("boundary:core:missing"), null);
  });
});
