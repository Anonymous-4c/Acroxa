// src/core/runtime/__tests__/render-scheduler.test.mjs
// AcroxaJS Phase 7 tests (DB-free, node:test).
// Covers: render fence (out-of-order commits dropped, newest wins),
// fence diagnostics, stale-render error state contracts (admin runtime).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const require = createRequire(import.meta.url);

const scheduler = require(path.join(ROOT, "src/core/runtime/render/scheduler.js"));
const snapshot = require(path.join(ROOT, "src/core/runtime/render/snapshot.js"));

describe("render scheduler fence", () => {
  it("newest render wins; older finisher is dropped (§35)", () => {
    const page = `page:sched-${Date.now()}`;
    // v44 render begins, then v45 begins (out-of-order scenario)
    const t44 = scheduler.begin(page);
    const t45 = scheduler.begin(page);
    // v45 finishes first → commits
    const r45 = scheduler.commit(page, t45, () => snapshot.commit(page, { html: "v45" }));
    assert.equal(r45.committed, true);
    assert.equal(snapshot.latest(page).html, undefined); // html root type — check hash instead
    assert.equal(snapshot.latest(page).hash.length, 16);
    const v45hash = snapshot.latest(page).hash;
    // v44 finishes later → MUST be dropped, never overwrite
    const r44 = scheduler.commit(page, t44, () => snapshot.commit(page, { html: "v44" }));
    assert.equal(r44.committed, false);
    assert.equal(r44.stale, true);
    assert.equal(snapshot.latest(page).hash, v45hash, "v45 state intact — v44 never overwrote");
    snapshot.drop(page);
  });

  it("in-order renders commit normally", () => {
    const page = `page:sched-order-${Date.now()}`;
    const t1 = scheduler.begin(page);
    const r1 = scheduler.commit(page, t1, () => snapshot.commit(page, { html: "one" }));
    assert.equal(r1.committed, true);
    const t2 = scheduler.begin(page);
    const r2 = scheduler.commit(page, t2, () => snapshot.commit(page, { html: "two" }));
    assert.equal(r2.committed, true);
    assert.equal(snapshot.latest(page).version, 2);
    snapshot.drop(page);
  });

  it("unknown/null tokens are dropped safely", () => {
    const page = `page:sched-null-${Date.now()}`;
    assert.equal(scheduler.commit(page, null, () => { throw new Error("must not run"); }).stale, true);
    assert.equal(scheduler.commit(page, { pageId: page, seq: 999 }, () => { throw new Error("must not run"); }).stale, true);
    assert.equal(snapshot.latest(page), null, "commitFn never ran");
  });

  it("stats reports fenced drops for diagnostics", () => {
    const page = `page:sched-stats-${Date.now()}`;
    const t1 = scheduler.begin(page);
    const t2 = scheduler.begin(page);
    scheduler.commit(page, t2, () => snapshot.commit(page, { html: "x" }));
    scheduler.commit(page, t1, () => snapshot.commit(page, { html: "y" }));
    const st = scheduler.stats();
    assert.ok(st.dropped[page] >= 1, "dropped count recorded");
    snapshot.drop(page);
  });
});

describe("stale-render error state (Phase 7 contracts)", () => {
  it("admin runtime surfaces render 5xx as stale with a recovery hint", () => {
    const adminSrc = fs.readFileSync(path.join(ROOT, "acrx/assets/js/acrx-admin-runtime.js"), "utf8");
    assert.ok(adminSrc.includes("indexOf('fragment 5') === 0"), "5xx detection missing");
    assert.ok(adminSrc.includes("recovers on the next save"), "recovery hint missing");
    assert.ok(adminSrc.includes("markStale"), "stale-mark missing");
  });

  it("per-widget error boundary kept in widgetRenderer", () => {
    const wr = fs.readFileSync(path.join(ROOT, "src/layouts/framework/widgetRenderer.js"), "utf8");
    assert.ok(wr.includes("runtime:error"), "widget error emit missing");
    assert.ok(wr.includes("data-acrx-error"), "widget error boundary attr missing");
  });

  it("broken pages never take down every admin page (per-file isolation)", () => {
    const pages = fs.readFileSync(path.join(ROOT, "src/routes/pages.js"), "utf8");
    assert.ok(pages.includes("Skipping broken view"), "per-file view isolation missing");
  });
});
