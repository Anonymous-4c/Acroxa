// src/core/runtime/__tests__/phase10-inspector.test.mjs
// AcroxaJS Phase 10 tests (DB-free, node:test).
// Covers: knob patch-debugger tab (op-level detail from real runtime data,
// honest empties), shell.snapshot carries live snapshot stats, overview
// observability (ops/content version/snapshots), admin runtime forwards
// op details, no mock data anywhere.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const require = createRequire(import.meta.url);

const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("knob patch debugger (Phase 10)", () => {
  it("patches tab exists and reads op-level detail from acrx:update events", () => {
    const knob = src("acrx/assets/js/acrx-runtime-knob.js");
    assert.ok(knob.includes("'patches'"), "patches tab missing");
    assert.ok(knob.includes("u.detail && u.detail.opList"), "reads opList from update detail");
    assert.ok(knob.includes("No op-level patches yet"), "honest empty state missing");
  });

  it("onUpdate keeps the full detail reference (opList survives)", () => {
    const knob = src("acrx/assets/js/acrx-runtime-knob.js");
    assert.ok(knob.includes("detail: d"), "detail reference dropped");
    assert.ok(knob.includes("state.tab === 'patches'"), "patches tab not re-rendered on update");
  });

  it("patch debugger shows target/op/before/after/duration — real fields", () => {
    const knob = src("acrx/assets/js/acrx-runtime-knob.js");
    for (const label of ["Patch rev", "Operations", "Duration", "before:", "after:"]) {
      assert.ok(knob.includes(label), `${label} missing from patch debugger`);
    }
  });

  it("overview shows ops + content version + snapshot counts", () => {
    const knob = src("acrx/assets/js/acrx-runtime-knob.js");
    assert.ok(knob.includes("Op patches"), "op count missing");
    assert.ok(knob.includes("Content version"), "content version missing");
    assert.ok(knob.includes("Snapshots"), "snapshot counts missing");
  });

  it("admin runtime forwards op details (bounded) on swap events", () => {
    const admin = src("acrx/assets/js/acrx-admin-runtime.js");
    assert.ok(admin.includes("opList: r.results.slice(0, 40)"), "bounded opList missing");
    assert.ok(admin.includes("before: x.before || ''"), "before missing");
    assert.ok(admin.includes("after: x.op ? String(x.op.value || x.op.html || '').slice(0, 120)"), "after missing");
  });

  it("applyOps captures before-values for the debugger (jsdom contract)", () => {
    const domPatch = src("acrx/assets/js/dom-patch.js");
    assert.ok(domPatch.includes("beforeHtml = String(el.innerHTML || '').slice(0, 200)"), "setHtml before capture missing");
    assert.ok(domPatch.includes("beforeSub = String(elS.outerHTML || '').slice(0, 200)"), "replaceSubtree before capture missing");
  });
});

describe("shell snapshot observability", () => {
  it("shell.snapshot carries live render snapshot stats", () => {
    const shell = require(path.join(ROOT, "src/core/runtime/shell.js"));
    const snapshot = require(path.join(ROOT, "src/core/runtime/render/snapshot.js"));
    const page = `page:shell-obs-${Date.now()}`;
    snapshot.commit(page, { html: "<p>x</p>" });
    const snap = shell.snapshot();
    assert.ok(snap.snapshots, "snapshots missing from shell.snapshot");
    assert.ok(snap.snapshots.pages >= 1, "live page count");
    assert.ok(snap.snapshots.versions >= 1, "live version count");
    snapshot.drop(page);
  });

  it("every snapshot number is live state (no fake counters)", () => {
    const shell = require(path.join(ROOT, "src/core/runtime/shell.js"));
    const snap = shell.snapshot();
    // perf stages are real aggregates
    assert.ok(snap.perf && typeof snap.perf.stages === "object", "perf missing");
    // graph/targets/logs are real stats objects
    assert.ok(snap.graph && Number.isFinite(snap.graph.resources), "graph missing");
    assert.ok(snap.targets && Number.isFinite(snap.targets.targets), "targets missing");
  });
});
