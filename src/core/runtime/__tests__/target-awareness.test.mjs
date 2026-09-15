// src/core/runtime/__tests__/target-awareness.test.mjs
// AcroxaJS target-awareness regression tests (DB-free, node:test).
// The dependency graph had zero production writers (graph.depend was only
// ever read), so every invalidation carried targets:[] and no client could
// tell which element/page an update belonged to. These tests pin the wiring:
// view-file -> page edges, win32 separator normalization, unlink cleanup,
// and the admin client's page-unaffected skip.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const graph = require("../graph.js");

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

describe("graph separator normalization", () => {
  it("matches chokidar win32 paths against forward-slash declarations", () => {
    // Dep key space is bare normalized absolute paths — exactly what file-
    // change invalidations query with (pages.js declares, invalidate reads).
    graph.depend("page:/acrx/posts", ["C:/app/src/views/posts.js"]);
    const hit = graph.affectedBy("C:\\app\\src\\views\\posts.js");
    assert.ok(hit.includes("page:/acrx/posts"), "backslash lookup must hit forward-slash edge");
    graph.remove("page:/acrx/posts");
    graph.remove("C:/app/src/views/posts.js");
  });

  it("unlink cleanup drops the deleted file's impact edges", () => {
    graph.depend("page:/acrx/posts", ["C:/app/src/views/gone.js"]);
    assert.ok(graph.affectedBy("C:/app/src/views/gone.js").includes("page:/acrx/posts"));
    graph.remove("C:/app/src/views/gone.js");
    assert.ok(!graph.affectedBy("C:/app/src/views/gone.js").includes("page:/acrx/posts"));
    graph.remove("page:/acrx/posts");
  });
});

describe("pages.js declares view-file impact edges", () => {
  const pages = src("src/routes/pages.js");

  it("depends each page on its view source file in the invalidation key space", () => {
    assert.ok(pages.includes("graph.depend("), "graph.depend call missing");
    assert.ok(pages.includes('"page:"'), "page: resource prefix missing");
    assert.ok(pages.includes("__file"), "must use the per-view source file");
    assert.ok(pages.includes("VIEWS_DIR"), "must key on the real view path");
  });
});

describe("hot-reloader cleans edges on unlink", () => {
  const hr = src("src/hot-reloader.js");

  it("removes deleted files' edges", () => {
    assert.ok(hr.includes("graph').remove("), "graph.remove call missing");
  });
});

describe("admin runtime skips unaffected pages", () => {
  const client = src("acrx/assets/js/acrx-admin-runtime.js");

  it("compares invalidation targets against the current page", () => {
    assert.ok(client.includes("page-unaffected"), "skip reason missing");
    assert.ok(client.includes("window.location.pathname"), "must compare against current page");
    assert.ok(client.includes("page:'"), "must understand page: targets");
  });

  it("still swaps when scope is unknown (safe default preserved)", () => {
    // Non-page targets (or none) must fall through to swap(), never skip.
    const idxSkip = client.indexOf("page-unaffected");
    const idxSwap = client.indexOf("await swap();", idxSkip);
    assert.ok(idxSkip !== -1 && idxSwap !== -1 && idxSwap > idxSkip,
      "skip branch must fall through to swap() for unknown scopes");
    assert.ok(!client.includes("location.reload"), "auto-reload still forbidden");
  });
});
