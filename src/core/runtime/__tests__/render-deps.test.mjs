// src/core/runtime/__tests__/render-deps.test.mjs
// AcroxaJS Phase 3 tests (DB-free, node:test).
// Covers: static import scanner (relative resolution, src-bounded, bare
// modules skipped), declarePageDeps graph edges + affectedBy BFS walk,
// tabs widget rev/generation contract (source-contract on widgetRenderer).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const require = createRequire(import.meta.url);

const deps = require(path.join(ROOT, "src/core/runtime/render/deps.js"));
const graph = require(path.join(ROOT, "src/core/runtime/graph.js"));

describe("static import scanner", () => {
  it("resolves relative requires to normalized absolute src paths", () => {
    const viewFile = path.join(ROOT, "src/views/dashboard.js").replace(/\\/g, "/");
    const imports = deps.scanFileImports(viewFile);
    assert.ok(imports.length > 0, "dashboard.js has relative requires");
    assert.ok(
      imports.some((p) => p.includes("/src/views/lib/framework")),
      `framework edge found: ${imports.join(", ")}`
    );
    for (const p of imports) {
      assert.ok(!p.includes("\\"), "normalized separators");
      assert.ok(p.startsWith(path.join(ROOT, "src").replace(/\\/g, "/")), "bounded to src/");
    }
  });

  it("skips bare module names (node_modules never declared)", () => {
    const tmp = path.join(os.tmpdir(), `acrx-deps-${Date.now()}.js`);
    fs.writeFileSync(tmp, "const chokidar = require('chokidar');\nconst fw = require('./fw.js');\n");
    try {
      const imports = deps.scanFileImports(tmp);
      // tmp is outside src/ → the ./fw.js resolution is also outside → []
      assert.deepEqual(imports, []);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("returns [] for unreadable/missing files (never throws)", () => {
    assert.deepEqual(deps.scanFileImports(path.join(ROOT, "src/views/nope-does-not-exist.js")), []);
  });
});

describe("page dependency declaration", () => {
  it("declares page → view file + imports; affectedBy BFS reaches the page", () => {
    const viewFile = path.join(ROOT, "src/views/dashboard.js").replace(/\\/g, "/");
    const pageId = `page:rc-deps-${Date.now()}`;
    const declared = deps.declarePageDeps(pageId, viewFile);
    assert.ok(declared.includes(viewFile));
    // Direct dependent of the view file = the page (plus scanner users)
    const dependents = graph.dependentsOf(viewFile);
    assert.ok(dependents.includes(pageId), `page is a direct dependent: ${dependents.join(", ")}`);
    // BFS from a component/module the view requires must reach the page
    const frameworkFile = require.resolve(path.join(ROOT, "src/views/lib/framework.js")).replace(/\\/g, "/");
    const affected = graph.affectedBy(frameworkFile);
    assert.ok(affected.includes(pageId), `BFS reaches page from framework: ${affected.slice(0, 6).join(", ")}`);
    graph.remove(pageId); // cleanup
  });

  it("declarePageDeps overwrites idempotently (rebuild-safe)", () => {
    const viewFile = path.join(ROOT, "src/views/settings.js").replace(/\\/g, "/");
    const pageId = `page:rc-deps-idem-${Date.now()}`;
    const a = deps.declarePageDeps(pageId, viewFile);
    const b = deps.declarePageDeps(pageId, viewFile);
    assert.deepEqual(a, b);
    assert.equal(graph.dependenciesOf(pageId).length, b.length);
    graph.remove(pageId);
  });
});

describe("tabs widget contract (Phase 3 fix)", () => {
  it("emits data-acrx-rev/generation like every other interactive widget", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/layouts/framework/widgetRenderer.js"), "utf8");
    const tabsFn = src.match(/function renderTabs\(node, ctx\) \{[\s\S]*?\n\}/);
    assert.ok(tabsFn, "renderTabs found");
    const body = tabsFn[0];
    assert.ok(body.includes("acrxTarget(node, \"tabs\""), "uses the shared acrxTarget helper");
    assert.ok(!body.includes("targets\").register"), "no hand-rolled register (helper owns it)");
    assert.ok(!/data-acrx-id="\$\{acrxId\}"/.test(body), "no hand-rolled attrs without rev/generation");
  });
});
