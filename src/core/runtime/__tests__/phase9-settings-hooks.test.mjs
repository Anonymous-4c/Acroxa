// src/core/runtime/__tests__\phase9-settings-hooks.test.mjs
// AcroxaJS Phase 9 tests (DB-free, node:test).
// Covers: runtime settings section (models + controller + view + client
// controller wiring, flat shape), hooks fired at real lifecycle points,
// extension contract delegates, admin snapshot endpoint.

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
const hookBus = require(path.join(ROOT, "src/core/runtime/hookBus.js"));
const pluginAPI = require(path.join(ROOT, "src/core/pluginAPI.js"));

describe("runtime settings section (Phase 9)", () => {
  it("SQL + mongo models declare the flat runtime section with behavior keys", () => {
    const sql = src("src/models/sql/Settings.js");
    const mongo = src("src/models/mongo/Settings.js");
    for (const [name, s] of [["sql", sql], ["mongo", mongo]]) {
      assert.ok(s.includes("runtime:"), `${name}: runtime section missing`);
      assert.ok(s.includes("cacheEnabled"), `${name}: cacheEnabled missing`);
      assert.ok(s.includes("cacheStrategy"), `${name}: cacheStrategy missing`);
      assert.ok(s.includes("cacheTTL"), `${name}: cacheTTL missing`);
      assert.ok(s.includes("patchLog"), `${name}: patchLog missing`);
      assert.ok(s.includes("inspector"), `${name}: inspector missing`);
    }
  });

  it("settingsController exposes the runtime section", () => {
    const ctrl = src("src/controllers/settingsController.js");
    assert.ok(ctrl.includes('"runtime"'), "runtime not in VALID_SECTIONS");
  });

  it("admin UI: view + meta + client controller follow existing conventions", () => {
    const view = src("src/views/settings.js");
    assert.ok(view.includes("function RuntimeSettingsPage"), "view missing");
    assert.ok(view.includes('path: "/acrx/system/acrxjs"'), "meta missing");
    assert.ok(view.includes('render: "RuntimeSettingsPage"'), "render ref missing");
    const client = src("acrx/assets/js/system/acrxjs-runtime.js");
    assert.ok(client.includes("System.getSection('runtime')"), "client load missing");
    assert.ok(client.includes("System.updateSection('runtime'"), "client save missing");
    assert.ok(client.includes("/acr/api/system/runtime"), "live stats endpoint missing");
  });

  it("layers.js policy() reads the flat settings shape", () => {
    const layers = require(path.join(ROOT, "src/core/runtime/cache/layers.js"));
    global._settingsCache = { runtime: { cacheEnabled: true, cacheStrategy: "revalidate", cacheTTL: 1234, cacheSwrGraceMs: 5678, cacheMaxSize: 42 } };
    const p = layers.policy();
    assert.deepEqual(p, { enabled: true, strategy: "revalidate", ttlMs: 1234, swrGraceMs: 5678, maxSize: 42 });
    global._settingsCache = null;
    assert.deepEqual(layers.policy(), layers.DEFAULT_POLICY);
  });
});

describe("lifecycle hooks fire at real points", () => {
  it("KNOWN_HOOKS includes the AcroxaJS render pipeline hooks", () => {
    for (const name of ["render:afterSnapshot", "render:afterDiff", "render:patchSent", "cache:hit", "cache:miss"]) {
      const d = hookBus.describe(name);
      assert.ok(d.definition, `${name} known`);
    }
  });

  it("snapshot.commit fires render:afterSnapshot with real data", () => {
    const snapshot = require(path.join(ROOT, "src/core/runtime/render/snapshot.js"));
    const seen = [];
    const dispose = hookBus.register("render:afterSnapshot", (data) => { seen.push(data); }, "phase9-test");
    const page = `page:hooks-${Date.now()}`;
    snapshot.commit(page, { html: "<p>x</p>" });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].page, page);
    assert.equal(seen[0].version, 1);
    assert.ok(seen[0].hash.length === 16);
    dispose();
    snapshot.drop(page);
  });

  it("cache layers fire cache:hit / cache:miss", () => {
    const layers = require(path.join(ROOT, "src/core/runtime/cache/layers.js"));
    const events = [];
    const dHit = hookBus.register("cache:hit", (d) => events.push({ kind: "hit", key: d.key }), "phase9-test");
    const dMiss = hookBus.register("cache:miss", (d) => events.push({ kind: "miss", key: d.key }), "phase9-test");
    const key = layers.visitorKey({ url: "/hook-page", query: {} });
    layers.getVisitor(key); // miss
    layers.putVisitor(key, "<p>x</p>");
    layers.getVisitor(key); // hit
    assert.deepEqual(events, [{ kind: "miss", key }, { kind: "hit", key }]);
    dHit(); dMiss();
    global._settingsCache = null;
  });
});

describe("extension contract (Phase 9)", () => {
  it("pluginAPI exposes invalidate/snapshot delegates that really work", () => {
    assert.equal(typeof pluginAPI.invalidateCacheTag, "function");
    assert.equal(typeof pluginAPI.invalidateCacheDep, "function");
    assert.equal(typeof pluginAPI.renderSnapshot, "function");
    assert.equal(typeof pluginAPI.snapshotStats, "function");

    const cache = require(path.join(ROOT, "src/core/runtime/cache.js"));
    const snapshot = require(path.join(ROOT, "src/core/runtime/render/snapshot.js"));
    const c = cache.getCache("phase9-pluginapi");
    c.set("k", "v", [], ["ext-tag"]);
    assert.equal(pluginAPI.invalidateCacheTag("ext-tag"), 1, "tag really deletes");
    assert.equal(c.get("k"), undefined);
    c.set("k2", "v", ["ext-dep"]);
    assert.equal(pluginAPI.invalidateCacheDep("ext-dep"), 1);
    const page = `page:pluginapi-${Date.now()}`;
    snapshot.commit(page, { html: "<p>s</p>" });
    assert.equal(pluginAPI.renderSnapshot(page).version, 1);
    assert.equal(pluginAPI.renderSnapshot(page, 1).version, 1);
    assert.equal(pluginAPI.renderSnapshot(page, 99), null);
    assert.ok(pluginAPI.snapshotStats().pages >= 1);
    snapshot.drop(page);
  });

  it("closed core: delegates are read/evict only (no core mutation surface)", () => {
    const cache = require(path.join(ROOT, "src/core/runtime/cache.js"));
    const before = cache.stats();
    pluginAPI.invalidateCacheDep("never-existed");
    pluginAPI.renderSnapshot("never-existed");
    const after = cache.stats();
    assert.deepEqual(after, before);
  });
});

describe("admin snapshot endpoint (Phase 9)", () => {
  it("runtimeRoutes exposes the admin-gated snapshot fetch", () => {
    const routes = src("src/routes/runtimeRoutes.js");
    assert.ok(routes.includes('"/runtime/snapshot"'), "snapshot endpoint missing");
    assert.ok(routes.includes("snapshots.since("), "resync info missing");
    assert.ok(routes.includes("no snapshot for page"), "404 path missing");
  });
});
