import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

// U-09: a cold /editor/new session must be savable. The client pre-creates
// the post/page server-side on flow start (single-flight: concurrent saves
// race exactly one creation), falls back to create-on-first-save, and rewrites
// the URL to the real document id.

const require = createRequire(import.meta.url);
const shell = require("C:/Users/sohai/Desktop/Acroxa/src/views/editor.js");

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${shell.renderEditor()}</body></html>`, {
  url: "http://localhost/acrx/editor/new?type=post",
  pretendToBeVisual: true,
});

for (const key of ["window", "document", "navigator", "localStorage", "Element", "Node", "Document", "Window", "HTMLElement", "Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "history", "location"]) {
  if (dom.window[key] !== undefined && globalThis[key] === undefined) {
    globalThis[key] = dom.window[key];
  }
}
if (!globalThis.CSS || !globalThis.CSS.escape) {
  globalThis.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
}

let persistence;
let State;

before(async () => {
  persistence = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/services/persistence.js");
  const store = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/store.js");
  State = store.State;
  store.initStores();
});

describe("U-09 draft pre-creation", () => {
  it("creates exactly one draft for concurrent callers and adopts its id + URL", async () => {
    State.patch("editor", { documentId: null, postType: "post" });
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true, json: async () => ({ success: true, post: { id: "draft123" } }) };
    };
    const [a, b] = await Promise.all([
      persistence.ensureDraftDocument(),
      persistence.ensureDraftDocument(),
    ]);
    assert.equal(a, "draft123");
    assert.equal(b, "draft123");
    assert.equal(calls.length, 1, "single-flight: one POST per session");
    assert.equal(calls[0].url, "/acr/api/posts");
    assert.equal(calls[0].body.title, "Untitled Post");
    assert.equal(calls[0].body.status, "draft");
    assert.ok(calls[0].body.content, "create requires a content envelope");
    assert.equal(State.get("editor").documentId, "draft123");
    assert.ok(window.location.pathname.endsWith("/editor/draft123"), window.location.pathname);
    assert.equal(new URLSearchParams(window.location.search).get("type"), "post");
    // Subsequent calls reuse the adopted id without POSTing.
    await persistence.ensureDraftDocument();
    assert.equal(calls.length, 1);
  });

  it("targets the pages endpoint for page drafts", async () => {
    State.patch("editor", { documentId: null, postType: "page" });
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return { ok: true, json: async () => ({ success: true, page: { id: "page9" } }) };
    };
    await persistence.ensureDraftDocument();
    assert.deepEqual(calls, ["/acr/api/pages"]);
    assert.equal(State.get("editor").documentId, "page9");
  });

  it("save path falls back to creation instead of dropping the save", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/services/persistence.js", "utf8");
    const i = src.indexOf("async function doSave()");
    assert.ok(i !== -1);
    const blk = src.slice(i, src.indexOf("export {", i));
    assert.ok(blk.includes("ensureDraftDocument()"), "doSave must attempt creation when id is missing");
  });
});
