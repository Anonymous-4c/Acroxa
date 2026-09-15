// src/core/runtime/__tests__/core-stability.test.mjs
// AcroxaJS core-stability regression tests (DB-free, node:test).
// Guards the process-stable singleton boundary: scoped require.cache
// eviction of feature code (controllers/views/routes) must never wipe
// src/core/ runtime singletons (registry, hookBus, events) as a side
// effect. Regression test for the silent hook/registration wipe where
// editing an unrelated controller reset every runtime registry.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");

describe("scoped eviction preserves runtime core", () => {
  it("clearModuleScoped(controller) keeps registry entries, evicts the controller", () => {
    const registry = require("../registry.js");
    const CMSHotReloader = require("../../../hot-reloader.js");
    const hr = new CMSHotReloader();

    const controller = path.join(ROOT, "src", "controllers", "runtimeController.js");
    require(controller); // ensure cached so eviction is observable
    const before = require.resolve(controller);
    assert.ok(require.cache[before], "controller should be cached before eviction");

    registry.register({ type: "test", owner: "stability-probe", name: "marker" });
    hr.clearModuleScoped(controller);

    assert.equal(require.cache[before], undefined, "controller itself must be evicted");
    const kept = registry.get(registry.makeId("test", "stability-probe", "marker"));
    assert.ok(kept, "registry singleton must survive scoped eviction of non-core code");
    registry.unregister(registry.makeId("test", "stability-probe", "marker"));
    require(controller); // restore for other tests
  });

  it("clearModuleScoped(view) keeps hookBus registrations", () => {
    const hookBus = require("../hookBus.js");
    const CMSHotReloader = require("../../../hot-reloader.js");
    const hr = new CMSHotReloader();

    const view = path.join(ROOT, "src", "views", "widgets.js");
    let viewRes = null;
    try { viewRes = require.resolve(view); } catch (_) {}
    const dispose = hookBus.register("test:stability", (v) => v, "stability-probe");
    if (viewRes) hr.clearModuleScoped(view);

    assert.equal(hookBus.run("test:stability", 7), 7, "hookBus must survive view eviction");
    dispose();
  });

  it("rebuildPagesRouter drop() never cascades into src/core (source contract)", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(path.join(ROOT, "index.js"), "utf-8");
    assert.ok(
      src.includes('startsWith(coreRoot)'),
      "rebuildPagesRouter must exclude the runtime core from cache drops"
    );
  });
});
