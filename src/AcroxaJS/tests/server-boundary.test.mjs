// src/AcroxaJS/tests/server-boundary.test.mjs
// Phase 2: boundary HTML composes with framework.js output, fragment
// envelope carries live rev/bootId.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const boundary = require("../server/boundary.js");
const framework = require("../../views/lib/framework.js");
const identity = require("../contracts/identity.js");

describe("server boundary", () => {
  it("wraps framework.js HTML without altering inner content", () => {
    const inner = framework.div({ class: "stat" }, framework.span({}, "42"));
    const out = boundary.renderBoundary("core", "demo.stats", inner);
    assert.ok(out.includes('data-acrx-id="boundary:core:demo.stats"'));
    assert.ok(out.includes('<div class="stat"><span>42</span></div>'));
    assert.ok(boundary.carriesBoundary(out, "core", "demo.stats"));
  });
  it("boundary id matches the identity contract", () => {
    assert.equal(identity.boundaryId("core", "demo.stats"), "boundary:core:demo.stats");
  });
  it("fragment envelope carries live revision", () => {
    const html = boundary.renderBoundary("core", "demo.clock", "12:00");
    const f = boundary.fragment("core", "demo.clock", html);
    assert.equal(f.boundary, "boundary:core:demo.clock");
    assert.ok(Number.isInteger(f.rev));
    assert.ok(f.html.includes("12:00"));
  });
});
