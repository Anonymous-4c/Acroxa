// src/core/runtime/__tests__/testing-router.test.mjs
// Testing-alias safety regression tests (DB-free, node:test).
// The /acrx/testing aliases deliberately render admin pages without auth,
// so their gates must be proven in text: double-gated, GET-only, production
// refusal, no token middleware, no redirect script. Uses the repo's
// source-as-text pattern.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

function codeOf(rel) {
  return src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("testing aliases gates (pages.js)", () => {
  const t = src("src/routes/pages.js");
  const code = codeOf("src/routes/pages.js");

  it("requires explicit flag AND non-production (double gate)", () => {
    assert.ok(t.includes('E2E_TEST_ROUTER') && t.includes('=== "1"'), "explicit flag check missing");
    assert.ok(t.includes('NODE_ENV') && t.includes('"production"'), "production check missing");
  });

  it("lives behind the gate (no unconditional testing routes)", () => {
    const gateIdx = t.indexOf('E2E_TEST_ROUTER');
    const aliasIdx = t.indexOf('/acrx/testing');
    assert.ok(gateIdx !== -1 && aliasIdx > gateIdx, "testing aliases must come after the gate");
  });

  it("is GET-only (no mutations reachable)", () => {
    const block = t.slice(t.indexOf('E2E_TEST_ROUTER'));
    assert.ok(block.includes("router.get("), "GET routes missing");
    assert.ok(!block.includes("router.post("), "POST must not exist here");
    assert.ok(!block.includes("router.put("), "PUT must not exist here");
    assert.ok(!block.includes("router.delete("), "DELETE must not exist here");
    assert.ok(!block.includes("router.patch("), "PATCH must not exist here");
  });

  it("never uses token verification in the testing chain", () => {
    const block = code.slice(code.indexOf('E2E_TEST_ROUTER'));
    assert.ok(!block.includes("verifyAPIToken"), "testing chain must not reference verifyAPIToken");
  });

  it("reuses the production render path (no forked renderer)", () => {
    assert.ok(t.includes("handleProtectedPage(page, req, res)"), "must reuse handleProtectedPage");
  });

  it("skips the auth-redirect script injection", () => {
    const stub = code.slice(code.indexOf("const testingStub"), code.indexOf('router.get("/acrx/testing"'));
    assert.ok(!stub.includes("/acr/api/verify"), "stub must not carry the verify redirect script");
    assert.ok(!stub.includes("location.href"), "stub must never redirect to login");
    assert.ok(stub.includes('remove("hidden")'), "stub must still unhide the body for visual parity");
  });

  it("keeps the role gate (stub is admin, other roles still checked)", () => {
    const block = t.slice(t.indexOf('E2E_TEST_ROUTER'));
    assert.ok(block.includes("getAllowedRolesByPath") && block.includes("requireRoles"), "role gate must be reused");
  });

  it("has no standalone testingRoutes module (single authoritative table)", () => {
    assert.ok(!fs.existsSync(path.join(ROOT, "src/routes/testingRoutes.js")), "testingRoutes.js must not exist (aliases live in pages.js)");
  });
});

describe("pages.js shared handler", () => {
  const p = src("src/routes/pages.js");

  it("exports handleProtectedPage and uses it for protected routes", () => {
    assert.ok(p.includes("module.exports.handleProtectedPage"), "export missing");
    assert.ok(p.includes("handleProtectedPage(page, req, res)"), "protected route must call the shared handler");
  });

  it("keeps fragment support inside the shared path", () => {
    const hIdx = p.indexOf("async function handleProtectedPage");
    const fIdx = p.indexOf("renderPageWrapper(req, res", hIdx);
    assert.ok(hIdx !== -1 && fIdx > hIdx, "shared handler must go through renderPageWrapper (fragment JSON included)");
  });
});
