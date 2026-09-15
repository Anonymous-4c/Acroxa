// src/core/runtime/__tests__/pages-hmr.test.mjs
// AcroxaJS pages-HMR wiring tests. Follows the repo's source-as-text pattern
// (cf. editor-routes-auth.test.mjs): asserts the rebuild contract exists in
// the real source without booting Express or touching the DB.

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

describe("pages.js rebuild contract", () => {
  const pages = src("src/routes/pages.js");

  it("exposes pages list + load errors for diagnostics/rebuild", () => {
    assert.ok(pages.includes("module.exports.getPages"), "getPages export missing");
    assert.ok(pages.includes("module.exports.getLoadErrors"), "getLoadErrors export missing");
  });

  it("isolates broken view files instead of crashing all admin pages", () => {
    assert.ok(pages.includes("Skipping broken view"), "per-file isolation missing");
  });

  it("has no bare mod[] landmine (render resolved at loadViews time)", () => {
    assert.ok(!pages.includes("mod[page.render]"), "stale mod[page.render] reference still present");
    assert.ok(pages.includes('typeof page.render === "function"'), "resolved-render check missing");
  });
});

describe("index.js stable pages proxy", () => {
  const index = src("index.js");

  it("mounts the pages proxy exactly once (no per-request require wrapper)", () => {
    const mounts = (index.match(/app\.use\(pagesProxy\)/g) || []).length;
    assert.equal(mounts, 1, `expected 1 pagesProxy mount, found ${mounts}`);
    assert.ok(!index.includes("const loadPagesRouter"), "stale per-request loader still present");
  });

  it("defines rebuildPagesRouter with bounded cache drop + atomic swap", () => {
    assert.ok(index.includes("global.acrx.rebuildPagesRouter"), "rebuildPagesRouter missing");
    assert.ok(index.includes('src/routes/pages.js'), "pages cache-drop path missing");
    assert.ok(index.includes("startsWith(srcRoot)"), "src-bounded drop missing");
    assert.ok(index.includes("currentPagesRouter = fresh"), "atomic swap missing");
  });

  it("keeps the previous router on rebuild failure and reports it", () => {
    assert.ok(index.includes("keeping previous router"), "failure fallback missing");
    assert.ok(index.includes('"failed"'), "failed registry mark missing");
  });
});

describe("admin fragment contract (Phase 2)", () => {
  const layout = src("src/modules/layout.js");
  const pages = src("src/routes/pages.js");
  const head = src("src/modules/head.js");
  const client = src("acrx/assets/js/acrx-admin-runtime.js");

  it("anchors the content region without moving the footer", () => {
    assert.ok(layout.includes('id="acrx-content"'), "acrx-content anchor missing");
    assert.ok(layout.includes('data-acrx-region="content"'), "content region marker missing");
    assert.ok(layout.includes('data-acrx-region="footer"'), "footer region marker missing");
    // Footer must stay where CSS expects it (inside .main).
    const mainIdx = layout.indexOf('id="acrx-content"');
    const footIdx = layout.indexOf('data-acrx-region="footer"');
    assert.ok(mainIdx !== -1 && footIdx > mainIdx, "footer must remain inside the content anchor");
  });

  it("serves content JSON with no-store inside the authed wrapper", () => {
    assert.ok(pages.includes('x-acrx-fragment'), "fragment header contract missing");
    assert.ok(pages.includes('_frag'), "fragment query contract missing");
    assert.ok(pages.includes('"no-store"'), "fragment must be no-store");
    // Fragment branch lives after page:beforeRender inside renderPageWrapper
    // (i.e. behind verifyAPIToken + role gates), not as a public route.
    const wrapIdx = pages.indexOf("function renderPageWrapper");
    const fragIdx = pages.indexOf("x-acrx-fragment");
    assert.ok(wrapIdx !== -1 && fragIdx > wrapIdx, "fragment must live inside renderPageWrapper");
  });

  it("loads the admin runtime on admin pages", () => {
    assert.ok(head.includes("acrx-admin-runtime.js"), "admin runtime script missing from head");
  });

  it("admin client swaps safely: guard, stale-mark, no auto-reload", () => {
    assert.ok(client.includes("AcroxaUpdateGuard"), "guard extension point missing");
    assert.ok(client.includes("data-acrx-stale"), "stale-marking missing");
    assert.ok(!client.includes("location.reload"), "auto-reload forbidden in admin runtime");
    assert.ok(client.includes("AcroxaAdminRuntime"), "client API missing");
    assert.ok(client.includes("acrx:update"), "diagnostics event hook missing");
  });
});

describe("update guard contract (Phase 3)", () => {
  const guard = src("acrx/assets/js/acrx-update-guard.js");
  const head = src("src/modules/head.js");
  const customizer = src("acrx/assets/js/customizer.js");
  const client = src("acrx/assets/js/acrx-admin-runtime.js");

  it("exposes lock/unlock/canPatch with editor checks via public surface", () => {
    assert.ok(guard.includes("AcroxaUpdateGuard"), "guard API missing");
    assert.ok(guard.includes("canPatch"), "canPatch missing");
    assert.ok(guard.includes("editor-dirty"), "editor-dirty reason missing");
    assert.ok(guard.includes("editor-focused"), "editor-focused reason missing");
    assert.ok(guard.includes("editor-canvas"), "canvas check missing");
  });

  it("loads before the admin runtime that consumes it", () => {
    const g = head.indexOf("acrx-update-guard.js");
    const r = head.indexOf("acrx-admin-runtime.js");
    assert.ok(g !== -1 && r !== -1 && g < r, "guard must load before admin runtime");
  });

  it("customizer syncs its dirty flag into the guard (no silent wipes)", () => {
    assert.ok(customizer.includes("lock('customizer'"), "dirty lock missing");
    assert.ok(customizer.includes("unlock('customizer')"), "dirty unlock missing");
    assert.ok(customizer.includes("refreshPreviewRemote"), "guarded remote refresh missing");
  });

  it("customizer no longer dumps pending config to the console", () => {
    assert.ok(!customizer.includes("console.log(store.pendingConfig)"), "debug dump still present");
  });

  it("admin client defers to the installed guard", () => {
    assert.ok(client.includes("window.AcroxaUpdateGuard"), "client must consult the guard");
  });
});

describe("lifecycle + failure recovery (Phase 4)", () => {
  const init = src("src/layouts/framework/init.js");
  const index = src("index.js");

  it("layout init swaps before retiring (failed reload keeps old engine)", () => {
    const swapIdx = init.indexOf("setLiveEngine(newEngine)");
    const retireIdx = init.indexOf("previousEngine.cleanup()");
    assert.ok(swapIdx !== -1 && retireIdx !== -1 && swapIdx < retireIdx,
      "must setLiveEngine BEFORE cleaning up the previous engine");
    assert.ok(init.includes('"failed"'), "failed layout must be marked in the registry");
  });

  it("pages rebuild walks lifecycle stages observably", () => {
    assert.ok(index.includes('stage: "invalidate"'), "invalidate stage emit missing");
    assert.ok(index.includes('stage: "update"'), "update stage emit missing");
  });
});

describe("knob + panel feeds (Phase 5)", () => {
  const shell = src("src/core/runtime/shell.js");
  const routes = src("src/routes/settingsRoutes.js");
  const logstream = src("src/core/logStream.js");
  const knob = src("acrx/assets/js/acrx-runtime-knob.js");
  const head = src("src/modules/head.js");

  it("snapshot aggregates graph, targets and log health (all live)", () => {
    assert.ok(shell.includes("graph"), "graph stats missing from snapshot");
    assert.ok(shell.includes("targets"), "targets stats missing from snapshot");
    assert.ok(shell.includes("logStream"), "log health missing from snapshot");
  });

  it("log history is paginated JSON, bounded and copy-safe", () => {
    assert.ok(logstream.includes("readHistory"), "readHistory missing");
    assert.ok(routes.includes("/logs/history"), "history route missing");
    assert.ok(routes.includes("adminOnly"), "history must be admin-only");
  });

  it("knob hides when unauthenticated and fakes no numbers", () => {
    assert.ok(knob.includes("401"), "401 self-hide missing");
    assert.ok(knob.includes("No data"), "honest empty states missing");
    assert.ok(!knob.includes("Math.random"), "knob must not synthesize data");
  });

  it("knob loads on admin pages after the runtime it observes", () => {
    const r = head.indexOf("acrx-admin-runtime.js");
    const k = head.indexOf("acrx-runtime-knob.js");
    assert.ok(r !== -1 && k !== -1 && r < k, "knob must load after admin runtime");
  });
});

describe("visitor widget identity (Phase 6)", () => {
  const wr = src("src/layouts/framework/widgetRenderer.js");

  it("interactive widgets emit patch identity via one helper", () => {
    for (const w of ["accordion", "faq", "search-form", "video", "tabs"]) {
      assert.ok(wr.includes(`"${w}"`), `${w} identity missing`);
    }
    assert.ok(wr.includes("function acrxTarget"), "acrxTarget helper missing");
  });

  it("live: faq/accordion render carries data-acrx-id and registers the target", async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const renderer = require("../../../layouts/framework/widgetRenderer.js");
    const targets = require("../targets.js");
    const faqHtml = renderer.renderNode({ id: "t1", type: "faq", attributes: { items: [] } });
    assert.ok(faqHtml.includes('data-acrx-id="widget:core:faq-t1"'), "faq identity missing: " + faqHtml.slice(0, 160));
    const accHtml = renderer.renderNode({ id: "t2", type: "accordion", attributes: { items: [] } });
    assert.ok(accHtml.includes('data-acrx-id="widget:core:accordion-t2"'), "accordion identity missing");
    assert.ok(targets.get("widget:core:faq-t1"), "faq target not registered");
    targets.remove("widget:core:faq-t1");
    targets.remove("widget:core:accordion-t2");
  });
});

describe("hot-reloader batching + rebuild", () => {
  const hr = src("src/hot-reloader.js");

  it("coalesces rapid saves into one transaction", () => {
    assert.ok(hr.includes("this.pending"), "pending queue missing");
    assert.ok(hr.includes("_flush()"), "_flush missing");
    assert.ok(hr.includes("250"), "coalescing window missing");
  });

  it("bundles multi-file batches into a single invalidation", () => {
    assert.ok(hr.includes(".bundle("), "bundle() call missing");
    assert.ok(hr.includes("batch:"), "batch log missing");
  });

  it("rebuilds admin pages on view changes (no shim-only path)", () => {
    assert.ok(hr.includes("rebuildPagesRouter"), "rebuildPagesRouter call missing");
  });

  it("smartReload classifies without invalidating (batch owner invalidates)", () => {
    assert.ok(!hr.includes("pipeline').handleFileChange"), "per-file invalidate still in smartReload");
    assert.ok(hr.includes("pipeline').classify"), "classify() call missing");
  });
});
