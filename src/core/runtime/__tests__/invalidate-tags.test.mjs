// src/core/runtime/__tests__/invalidate-tags.test.mjs
// AcroxaJS Phase 4 tests (DB-free, node:test).
// Covers: cache tags (set with tags → invalidateTag really deletes →
// unrelated entries survive, prefix wildcards, TTL + dep invalidation),
// snapshot drop on page-scoped invalidation, bundle does the same.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const require = createRequire(import.meta.url);

const cache = require(path.join(ROOT, "src/core/runtime/cache.js"));
const invalidate = require(path.join(ROOT, "src/core/runtime/invalidate.js"));
const snapshot = require(path.join(ROOT, "src/core/runtime/render/snapshot.js"));

let n = 0;
const cacheName = () => `test-cache-${n++}`;

afterEach(() => {
  cache.clearAll();
});

describe("cache tags", () => {
  it("invalidateTag deletes tagged entries and leaves others", () => {
    const c = cache.getCache(cacheName());
    c.set("product:list", [1, 2], [], ["product-catalog"]);
    c.set("product:detail", { id: 1 }, [], ["product-catalog"]);
    c.set("settings:site", "Acroxa", [], ["settings"]);
    assert.equal(cache.invalidateTag("product-catalog"), 2);
    assert.equal(c.get("product:list"), undefined);
    assert.equal(c.get("product:detail"), undefined);
    assert.equal(c.get("settings:site"), "Acroxa", "untagged entry survives");
  });

  it("prefix wildcard invalidateTag works", () => {
    const c = cache.getCache(cacheName());
    c.set("a", 1, [], ["product:list"]);
    c.set("b", 2, [], ["product:detail"]);
    c.set("c", 3, [], ["other"]);
    assert.equal(cache.invalidateTag("product:*"), 2);
    assert.equal(c.get("a"), undefined);
    assert.equal(c.get("b"), undefined);
    assert.equal(c.get("c"), 3);
  });

  it("re-setting a key moves its tags (old tags deindexed)", () => {
    const c = cache.getCache(cacheName());
    c.set("k", 1, [], ["tag-a"]);
    c.set("k", 2, [], ["tag-b"]);
    assert.equal(cache.invalidateTag("tag-a"), 0, "old tag no longer references the key");
    assert.equal(c.get("k"), 2);
    assert.equal(cache.invalidateTag("tag-b"), 1);
    assert.equal(c.get("k"), undefined);
  });

  it("back-compat: set(key, value, deps) still works", () => {
    const c = cache.getCache(cacheName());
    c.set("k", "v", ["dep:x"]);
    assert.equal(c.get("k"), "v");
    assert.equal(cache.invalidate("dep:x"), 1);
    assert.equal(c.get("k"), undefined);
  });

  it("stats reports live tag count", () => {
    const c = cache.getCache(cacheName());
    c.set("a", 1, [], ["t1"]);
    c.set("b", 2, [], ["t2"]);
    assert.equal(cache.stats().tags >= 2, true);
  });
});

describe("invalidation stale-marks snapshots of affected pages", () => {
  it("invalidate(page:x) stale-marks that page only; history kept for diffing", () => {
    const p1 = `page:inv-a-${Date.now()}`;
    const p2 = `page:inv-b-${Date.now()}`;
    snapshot.commit(p1, { html: "<p>a</p>" });
    snapshot.commit(p2, { html: "<p>b</p>" });
    invalidate.invalidate({ type: "page", id: p1, scope: "page", reason: "test" });
    assert.equal(snapshot.isStale(p1), true, "affected snapshot stale-marked");
    assert.equal(snapshot.isStale(p2), false, "unrelated snapshot untouched");
    assert.ok(snapshot.latest(p1), "history KEPT (diff source + resync)");
    assert.equal(snapshot.get(p1, 1).hash, snapshot.latest(p1).hash, "old version recoverable");
    snapshot.drop(p1); snapshot.drop(p2);
  });

  it("invalidate of a view file stale-marks pages that depend on it", () => {
    const viewKey = `view-src-${Date.now()}`;
    const p = `page:inv-view-${Date.now()}`;
    const graph = require(path.join(ROOT, "src/core/runtime/graph.js"));
    graph.depend(p, [viewKey]);
    snapshot.commit(p, { html: "<p>stale</p>" });
    invalidate.invalidate({ type: "view", id: viewKey, scope: "view", reason: "test" });
    assert.equal(snapshot.isStale(p), true, "dependent page stale-marked via graph walk");
    graph.remove(p); snapshot.drop(p);
  });

  it("bundle stale-marks bundled page targets", () => {
    const p = `page:inv-bundle-${Date.now()}`;
    snapshot.commit(p, { html: "<p>x</p>" });
    invalidate.bundle([{ type: "page", id: p, scope: "page" }], { reason: "test" });
    assert.equal(snapshot.isStale(p), true);
    snapshot.drop(p);
  });

  it("non-page invalidations leave snapshots alone", () => {
    const p = `page:inv-safe-${Date.now()}`;
    snapshot.commit(p, { html: "<p>keep</p>" });
    invalidate.invalidate({ type: "widget", id: "widget:core:hero", scope: "widget", reason: "test" });
    assert.equal(snapshot.isStale(p), false, "widget invalidation does not touch page snapshots");
    snapshot.drop(p);
  });
});
