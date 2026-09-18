// src/core/runtime/__tests__/cache-layers.test.mjs
// AcroxaJS Phase 8 tests (DB-free, node:test).
// Covers: every strategy affects behavior (no-cache / cache-first /
// revalidate / stale-while-revalidate grace window), visitor hit/miss,
// targeted invalidation (route prefix + structural layout), visitor store
// isolation from admin stores, bounded size eviction, fixture seed contract.

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const require = createRequire(import.meta.url);

const layers = require(path.join(ROOT, "src/core/runtime/cache/layers.js"));
const base = require(path.join(ROOT, "src/core/runtime/cache.js"));

beforeEach(() => {
  global._settingsCache = null; // defaults policy
  base.clearAll();
});

describe("cache policy strategies", () => {
  it("no-cache renders fresh on every request", () => {
    global._settingsCache = { runtime: { cacheEnabled: true, cacheStrategy: "no-cache" } };
    const key = layers.visitorKey({ url: "/about", query: {} });
    assert.equal(layers.putVisitor(key, "<p>v1</p>"), false, "put is a no-op");
    assert.equal(layers.getVisitor(key), null);
  });

  it("cache-first: miss → put → hit", () => {
    const key = layers.visitorKey({ url: "/about", query: {} });
    assert.equal(layers.getVisitor(key), null, "miss");
    assert.equal(layers.putVisitor(key, "<p>v1</p>", { deps: ["route:/about"] }), true);
    assert.equal(layers.getVisitor(key), "<p>v1</p>", "hit");
  });

  it("revalidate: TTL 0 — entries never expire by time, only invalidation", () => {
    global._settingsCache = { runtime: { cacheEnabled: true, cacheStrategy: "revalidate", cacheTTL: 60000 } };
    const key = layers.visitorKey({ url: "/about", query: {} });
    layers.putVisitor(key, "<p>v1</p>");
    const store = base.getCache(layers.VISITOR_STORE);
    assert.equal(store.map.get(key).expiresAt, 0, "no TTL expiry");
    // Advance past any real TTL — still valid
    const realNow = Date.now;
    Date.now = () => realNow() + 10 * 60 * 1000;
    try {
      assert.equal(layers.getVisitor(key), "<p>v1</p>", "time does not expire revalidate entries");
    } finally {
      Date.now = realNow;
    }
    // Invalidation drops it
    layers.invalidateRoute("/about");
    assert.equal(layers.getVisitor(key), null);
  });

  it("stale-while-revalidate: serves stale once within grace, then expires", () => {
    global._settingsCache = { runtime: { cacheEnabled: true, cacheStrategy: "stale-while-revalidate", cacheTTL: 1000, cacheSwrGraceMs: 5000 } };
    const key = layers.visitorKey({ url: "/about", query: {} });
    layers.putVisitor(key, "<p>stale</p>");
    const realNow = Date.now;
    Date.now = () => realNow() + 2000; // past TTL, within grace
    try {
      assert.equal(layers.getVisitor(key), "<p>stale</p>", "first past-TTL read serves stale");
      assert.equal(layers.getVisitor(key), null, "second read expires (next request renders fresh)");
    } finally {
      Date.now = realNow;
    }
  });

  it("disabled policy bypasses everything", () => {
    global._settingsCache = { runtime: { cacheEnabled: false } };
    const key = layers.visitorKey({ url: "/about", query: {} });
    assert.equal(layers.putVisitor(key, "<p>x</p>"), false);
    assert.equal(layers.getVisitor(key), null);
  });

  it("unknown strategy falls back to the default (never crashes)", () => {
    global._settingsCache = { runtime: { cacheEnabled: true, cacheStrategy: "warp-drive" } };
    assert.equal(layers.policy().strategy, "cache-first");
  });
});

describe("visitor cache behavior", () => {
  it("pagination param varies the key; tracking queries do not", () => {
    assert.equal(
      layers.visitorKey({ url: "/blog?page=2", query: { page: "2", utm: "x" } }),
      layers.visitorKey({ url: "/blog?page=2", query: { page: "2" } })
    );
    assert.notEqual(
      layers.visitorKey({ url: "/blog?page=1", query: { page: "1" } }),
      layers.visitorKey({ url: "/blog?page=2", query: { page: "2" } })
    );
  });

  it("targeted invalidation: one route prefix leaves other routes valid", () => {
    const k1 = layers.visitorKey({ url: "/about", query: {} });
    const k2 = layers.visitorKey({ url: "/pricing", query: {} });
    layers.putVisitor(k1, "<p>about</p>");
    layers.putVisitor(k2, "<p>pricing</p>");
    layers.invalidateRoute("/about");
    assert.equal(layers.getVisitor(k1), null, "affected route invalidated");
    assert.equal(layers.getVisitor(k2), "<p>pricing</p>", "unrelated route stays valid");
  });

  it("structural layout invalidation drops the visitor store (correct — every page wraps the layout)", () => {
    const k1 = layers.visitorKey({ url: "/about", query: {} });
    layers.putVisitor(k1, "<p>about</p>");
    const invalidate = require(path.join(ROOT, "src/core/runtime/invalidate.js"));
    invalidate.invalidate({ type: "layout", id: "layout:zenith", scope: "layout", reason: "structural" });
    assert.equal(layers.getVisitor(k1), null, "visitor entries dropped on layout change");
  });

  it("visitor store is isolated from admin/data stores", () => {
    const k = layers.visitorKey({ url: "/about", query: {} });
    layers.putVisitor(k, "<p>about</p>", { deps: ["route:/about"] });
    const dataCache = layers.getDataCache();
    dataCache.set("expensive:calc", 42, ["expensive:calc"]);
    // Admin-side targeted invalidation of an unrelated dep must not touch the visitor store.
    base.invalidate("expensive:calc");
    assert.equal(dataCache.get("expensive:calc"), undefined);
    assert.equal(layers.getVisitor(k), "<p>about</p>", "visitor store untouched");
  });

  it("bounded size: eviction keeps the cache lean", () => {
    global._settingsCache = { runtime: { cacheEnabled: true, cacheStrategy: "cache-first", cacheMaxSize: 5 } };
    for (let i = 0; i < 8; i++) {
      layers.putVisitor(layers.visitorKey({ url: `/r${i}`, query: {} }), `<p>${i}</p>`);
    }
    const store = base.getCache(layers.VISITOR_STORE);
    assert.ok(store.map.size <= 5, `size bounded: ${store.map.size}`);
  });
});

describe("fixture seed contract", () => {
  it("seed.js creates the acroxajs-fixture page with an interactive tabs widget", () => {
    const seedSrc = fs.readFileSync(path.join(ROOT, "src/seed.js"), "utf8");
    assert.ok(seedSrc.includes("acroxajs-fixture"), "fixture page missing");
    assert.ok(seedSrc.includes('type: "tabs"'), "tabs widget missing");
    assert.ok(seedSrc.includes("status: \"published\""), "page must be published");
    assert.ok(seedSrc.includes("findOne({ slug: \"acroxajs-fixture\" })"), "idempotent seed");
  });
});
