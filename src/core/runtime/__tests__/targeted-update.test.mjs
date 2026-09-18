// src/core/runtime/__tests__/targeted-update.test.mjs
// AcroxaJS targeted-update regression tests (DB-free, node:test).
// The dynamic targeted update was dead three ways: (1) content swaps could
// never apply JS changes (ensureJs skips loaded scripts, so edited frontend
// files had no effect without a manual hard refresh); (2) re-rendering a
// target wiped its registered asset requirements; (3) no endpoint answered
// "rerender or eject+inject?" / "which element?" / "which JS files?".
// These tests pin the four-API setup: target-plan, target, target-deps,
// and the asset-carrying fragment — plus the client wiring.

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const targets = require("../targets.js");
const graph = require("../graph.js");
const rc = require("../../../controllers/runtimeController.js");

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

function fakeRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = () => {};
  return r;
}

const TID = "widget:core:test-tabs-plan";
const NODE = { id: "test-plan", type: "tabs", attributes: { tabs: [] } };

beforeEach(() => {
  targets.remove(TID);
  graph.remove(TID);
  targets.register({
    id: TID, type: "widget", owner: "core", node: NODE,
    component: "tabs", hydrate: "interaction",
    assets: { js: ["/acrx/assets/js/utils.js"], css: [] },
  });
});

describe("API 1 — target-plan decides rerender vs eject+inject", () => {
  it("frontend JS change -> eject-inject with the servable script URL", () => {
    const res = fakeRes();
    rc.targetPlan({ body: { changedFile: "C:\\app\\acrx\\assets\\js\\utils.js" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.strategy, "eject-inject");
    assert.deepEqual(res.body.assets.js, ["/acrx/assets/js/utils.js"]);
  });

  it("stylesheet change -> stylesheet-refresh with the css URL", () => {
    const res = fakeRes();
    rc.targetPlan({ body: { changedFile: "C:/app/acrx/assets/css/root.css" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.strategy, "stylesheet-refresh");
    assert.deepEqual(res.body.assets.css, ["/acrx/assets/css/root.css"]);
  });

  it("registered target -> rerender with selector + assets", () => {
    const res = fakeRes();
    rc.targetPlan({ body: { target: TID } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.strategy, "rerender");
    assert.equal(res.body.selector, `[data-acrx-id="${TID}"]`);
    assert.deepEqual(res.body.assets.js, ["/acrx/assets/js/utils.js"]);
  });

  it("page:* target -> fragment-replace (content swap)", () => {
    const res = fakeRes();
    rc.targetPlan({ body: { target: "page:/acrx/posts" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.strategy, "fragment-replace");
  });

  it("config change -> full-reload (client marks stale, never reloads)", () => {
    const res = fakeRes();
    rc.targetPlan({ body: { changedFile: "C:/app/config/paths.json" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.strategy, "full-reload");
  });

  it("unknown target -> 404, empty body -> 400", () => {
    let res = fakeRes();
    rc.targetPlan({ body: { target: "widget:core:test-nope-missing" } }, res);
    assert.equal(res.statusCode, 404);
    res = fakeRes();
    rc.targetPlan({ body: {} }, res);
    assert.equal(res.statusCode, 400);
  });
});

describe("API 2 — target resolves the targeted element", () => {
  it("returns selector, meta, assets, and fresh HTML", () => {
    const res = fakeRes();
    rc.target({ query: { target: TID } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.found, true);
    assert.equal(res.body.selector, `[data-acrx-id="${TID}"]`);
    assert.equal(res.body.meta.component, "tabs");
    assert.deepEqual(res.body.assets.js, ["/acrx/assets/js/utils.js"]);
    assert.match(res.body.html, /wdg-tabs/);
  });

  it("unknown -> 404, malformed -> 400", () => {
    let res = fakeRes();
    rc.target({ query: { target: "widget:core:test-nope-missing" } }, res);
    assert.equal(res.statusCode, 404);
    res = fakeRes();
    rc.target({ query: { target: "!!!" } }, res);
    assert.equal(res.statusCode, 400);
  });
});

describe("API 3 — target-deps lists dependencies + required files", () => {
  it("merges declared assets with servable graph-edge files", () => {
    graph.depend(TID, ["C:/app/acrx/assets/js/utils.js", "C:/app/acrx/assets/css/root.css"]);
    const res = fakeRes();
    rc.targetDeps({ query: { target: TID } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.js.includes("/acrx/assets/js/utils.js"));
    assert.ok(res.body.css.includes("/acrx/assets/css/root.css"));
    assert.ok(res.body.deps.includes("C:/app/acrx/assets/js/utils.js"));
    graph.remove(TID);
  });
});

describe("target registry preserves requirements across re-renders", () => {
  it("re-register without assets keeps previously declared ones", () => {
    targets.register({ id: TID, type: "widget", owner: "core", node: NODE });
    const entry = targets.get(TID);
    assert.deepEqual(entry.assets.js, ["/acrx/assets/js/utils.js"]);
    assert.equal(entry.component, "tabs");
    assert.ok(entry.node, "node must survive re-register");
  });

  it("fragment for a target carries selector + assets + rerender strategy", () => {
    const res = fakeRes();
    rc.fragment({ body: { type: "target", target: TID } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.strategy, "rerender");
    assert.equal(res.body.selector, `[data-acrx-id="${TID}"]`);
    // Assets must survive the re-render the fragment itself triggers.
    assert.deepEqual(res.body.assets.js, ["/acrx/assets/js/utils.js"]);
    assert.deepEqual(targets.get(TID).assets.js, ["/acrx/assets/js/utils.js"]);
  });
});

describe("routes mount the three targeted endpoints", () => {
  const routes = src("src/routes/runtimeRoutes.js");

  it("exposes target, target-deps, and target-plan", () => {
    assert.ok(routes.includes('"/runtime/target"'), "GET target missing");
    assert.ok(routes.includes('"/runtime/target-deps"'), "GET target-deps missing");
    assert.ok(routes.includes('"/runtime/target-plan"'), "POST target-plan missing");
  });
});

describe("client four-step module + admin wiring", () => {
  const client = src("acrx/assets/js/acrx-targeted.js");
  const admin = src("acrx/assets/js/acrx-admin-runtime.js");
  const head = src("src/modules/head.js");
  const utils = src("acrx/assets/js/utils.js");

  it("AcroxaTargeted exposes plan/resolve/deps/rerender/ejectInject/update", () => {
    for (const fn of ["plan:", "resolve:", "deps:", "rerender:", "ejectInject:", "update:"]) {
      assert.ok(client.includes(fn), `AcroxaTargeted.${fn} missing`);
    }
    assert.ok(client.includes("window.AcroxaTargeted"), "global export missing");
  });

  it("eject+inject removes stale scripts and injects cache-busted copies in order", () => {
    assert.ok(client.includes(".remove()"), "must eject stale <script> tags");
    assert.ok(client.includes("?v="), "must cache-bust injected copies");
    assert.ok(client.includes("async = false"), "must preserve execution order");
    assert.ok(client.includes("LOAD_TIMEOUT_MS"), "must bound script loads");
  });

  it("every step emits acrx:update so changes register in diagnostics", () => {
    assert.ok(client.includes("targeted-plan"), "plan event missing");
    assert.ok(client.includes("targeted-applied"), "applied event missing");
    assert.ok(client.includes("targeted-swapped"), "swapped event missing");
  });

  it("admin runtime delegates frontend invalidations instead of dead-swapping", () => {
    assert.ok(admin.includes("AcroxaTargeted.update"), "delegation missing");
    assert.ok(admin.includes("targetedFrontendUpdate"), "targeted path missing");
    assert.ok(admin.includes("noteScript") && admin.includes("forgetScript"), "asset bookkeeping missing");
    assert.ok(admin.includes("markStale: markStale"), "markStale must be public for targeted full-reload");
  });

  it("legacy SSE events forward their payload so the file is known", () => {
    assert.ok(admin.includes("parseEventData"), "event-data parsing missing");
  });

  it("head loads acrx-targeted.js before the admin runtime", () => {
    const iT = head.indexOf("acrx-targeted.js");
    const iA = head.indexOf("acrx-admin-runtime.js");
    assert.ok(iT !== -1 && iA !== -1 && iT < iA, "load order wrong");
  });

  it("utils.js namespace is reload-safe (var, not const)", () => {
    assert.ok(/var Mini = \(\(\) =>/.test(utils), "top-level const Mini would throw on reinjection");
  });
});
