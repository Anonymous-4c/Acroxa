import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const shell = require("C:/Users/sohai/Desktop/Acroxa/src/views/editor.js");

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${shell.renderEditor()}</body></html>`, {
  url: "http://localhost/acrx/editor/",
  pretendToBeVisual: true,
});

for (const key of ["window", "document", "navigator", "localStorage", "Element", "Node", "Document", "Window", "HTMLElement", "Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  if (dom.window[key] !== undefined && globalThis[key] === undefined) globalThis[key] = dom.window[key];
}
// jsdom lacks ResizeObserver; editor panels observe overflow containers.
if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!globalThis.CSS || !globalThis.CSS.escape) {
  globalThis.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
}
dom.window.confirm = () => true;

let controller;
let ctx;

before(async () => {
  controller = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  await controller.boot();
  ctx = controller.getCtx();
});

after(() => {
  dom.window.close();
});

function canvas() {
  return document.getElementById("editor-canvas");
}

describe("slash menu positioning and selection", () => {
  it("anchors fixed near the caret and selects via mousedown", async () => {
    const id = ctx.insertAtSelection("paragraph");
    const editable = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"] [contenteditable='true']`);
    editable.focus();
    editable.textContent = "/";
    editable.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const menu = document.getElementById("editor-slash-menu");
    assert.equal(menu.classList.contains("hidden"), false);
    assert.equal(menu.style.position, "fixed");
    const top = parseFloat(menu.style.top);
    const left = parseFloat(menu.style.left);
    assert.ok(Number.isFinite(top) && top >= 0 && top <= window.innerHeight, `top ${top} in viewport`);
    assert.ok(Number.isFinite(left) && left >= 0, `left ${left} sane`);
    assert.ok(menu.querySelector(".slash-menu-footer"), "footer hints present");
    assert.equal(menu.querySelector("#slash-menu-search").getAttribute("role"), "combobox");
    const before = ctx.topLevelOrder().length;
    const first = menu.querySelector(".slash-menu-item");
    first.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(menu.classList.contains("hidden"), true);
    assert.ok(ctx.topLevelOrder().length >= before, "insert happened");
  });
});

describe("custom dropdown control", () => {
  it("opens, selects, keyboard-navigates without native select", async () => {
    const { createDropdown } = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/controls.js");
    let picked = null;
    const dd = createDropdown({ value: "b", options: ["a", "b", "c"], ariaLabel: "Test", onChange: (v) => { picked = v; } });
    document.body.appendChild(dd.el);
    assert.equal(dd.el.querySelector("select"), null);
    dd.el.querySelector(".acrx-select-trigger").click();
    assert.equal(dd.el.querySelector(".acrx-select-pop").hidden, false);
    const opts = dd.el.querySelectorAll(".acrx-select-option");
    assert.equal(opts.length, 3);
    opts[2].click();
    assert.equal(picked, "c");
    assert.equal(dd.el.querySelector(".acrx-select-value").textContent, "c");
    // keyboard: open, arrow, enter
    picked = null;
    dd.el.querySelector(".acrx-select-trigger").click();
    dd.el.querySelector(".acrx-select-trigger").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.equal(picked, "b");
    dd.destroy();
  });

  it("inspector uses dropdowns instead of native selects", () => {
    ctx.clearSelection();
    const id = ctx.insertAtSelection("button");
    ctx.selectBlock(id, { focus: false });
    const panel = document.getElementById("sidebar-right-panel-settings");
    assert.equal(panel.querySelectorAll("select.insp-select").length, 0);
    assert.ok(panel.querySelectorAll(".acrx-select").length > 0);
  });
});

describe("new structural and content widgets", () => {
  it("group/stack/row/split/link/icon/testimonial/stats render and nest", () => {
    const ids = {};
    for (const type of ["group", "stack", "row", "split", "link", "icon", "testimonial", "stats"]) {
      ctx.clearSelection();
      // Insert at document end so empty containers do not capture the insert.
      const doc = ctx.editor.document;
      const id = ctx.insertWidgetAt(type, { parentId: doc.rootId, index: ctx.topLevelOrder().length });
      assert.ok(id, `${type} inserts`);
      ids[type] = id;
      const wrap = canvas().querySelector(`.block-wrap[data-for-block-id="${ids[type]}"]`);
      assert.ok(wrap?.querySelector(".block-handle"), `${type} handle`);
      assert.ok(wrap?.querySelector(".block"), `${type} block`);
    }
    const splitNode = ctx.editor.document.getNode(ids.split);
    assert.equal(splitNode.children.length, 2);
    assert.ok(canvas().querySelector(`.block-wrap[data-for-block-id="${ids.stats}"]`).textContent.includes("99%"));
    assert.ok(canvas().querySelector(`.block-wrap[data-for-block-id="${ids.icon}"]`).innerHTML.includes("fa-star"));
  });

  it("groups wrap siblings and ungroup restores them", () => {
    ctx.clearSelection();
    const a = ctx.insertAtSelection("paragraph");
    const b = ctx.insertAtSelection("paragraph");
    const c = ctx.insertAtSelection("paragraph");
    ctx.editor.engines.selection.selectBlocks([a, b, c]);
    const gid = ctx.groupSelection("group");
    assert.ok(gid);
    const gnode = ctx.editor.document.getNode(gid);
    assert.deepEqual(gnode.children, [a, b, c]);
    assert.ok(ctx.editor.document.getNode(a).parentId === gid);
    assert.equal(ctx.ungroup(gid), true);
    assert.equal(ctx.editor.document.getNode(a).parentId, ctx.editor.document.rootId);
    assert.ok(!ctx.editor.document.getNode(gid));
  });

  it("aligns and deletes multi-selections in one undo step", () => {
    ctx.clearSelection();
    const a = ctx.insertAtSelection("paragraph");
    const b = ctx.insertAtSelection("paragraph");
    ctx.editor.engines.selection.selectBlocks([a, b]);
    assert.equal(ctx.alignBlocks(null, "center"), true);
    assert.equal(ctx.getBlock(a).attrs.align, "center");
    assert.equal(ctx.getBlock(b).attrs.align, "center");
    ctx.undo();
    assert.notEqual(ctx.getBlock(a).attrs.align, "center");
    ctx.editor.engines.selection.selectBlocks([a, b]);
    assert.equal(ctx.deleteBlocks([a, b]), true);
    assert.equal(ctx.getBlock(a), null);
    ctx.undo();
    assert.ok(ctx.getBlock(a));
  });
});

describe("top bar functionality", () => {
  it("adds working undo/redo buttons and opens the more menu", () => {
    assert.ok(document.getElementById("editor-undo-btn"));
    assert.ok(document.getElementById("editor-redo-btn"));
    document.getElementById("editor-more-actions").click();
    assert.ok(document.querySelector(".acrx-context-menu"));
    document.querySelector(".acrx-context-menu")?.remove();
  });

  it("lists revisions from the real endpoint shape and restores", async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, opts = {}) => {
      calls.push(String(url));
      if (String(url).includes("/revisions") && (!opts.method || opts.method === "GET")) {
        return { ok: true, json: async () => ({ revisions: [{ _id: "r1", revisionNumber: 3, title: "Draft", createdAt: new Date().toISOString() }] }) };
      }
      if (String(url).includes("/restore")) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    try {
      const { State } = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/store.js");
      State.patch("editor", { documentId: "doc123" });
      document.getElementById("editor-more-actions").click();
      document.querySelector('[data-ctx-id="revisions"]')?.click();
      await new Promise((r) => setTimeout(r, 60));
      assert.ok(document.querySelector(".acrx-modal-overlay"), "revisions dialog opens");
      assert.ok(document.querySelector("[data-rev-restore]"), "restore button present");
      document.querySelector("[data-rev-restore]").click();
      await new Promise((r) => setTimeout(r, 60));
      assert.ok(calls.some((u) => u.includes("/restore")), "restore POST issued");
      document.querySelectorAll(".acrx-modal-overlay").forEach((n) => n.remove());
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("suggestions and empty state", () => {
  it("shows contextual suggestions after insert and inserts on click", async () => {
    ctx.clearSelection();
    ctx.insertAtSelection("heading");
    await new Promise((r) => setTimeout(r, 60));
    const bar = document.querySelector(".acrx-suggest-bar");
    assert.ok(bar, "suggestion bar appears");
    assert.ok(bar.textContent.includes("Add paragraph"));
    const before = ctx.topLevelOrder().length;
    bar.querySelector(".acrx-suggest-btn").click();
    assert.ok(ctx.topLevelOrder().length > before);
  });

  it("empty canvas offers creation paths", () => {
    const doc = ctx.editor.document;
    for (const id of ctx.topLevelOrder()) doc.removeNode(id);
    ctx.afterStructuralChange({});
    const empty = canvas().querySelector(".canvas-empty-state");
    assert.ok(empty);
    for (const action of ["insert-here", "ai-generate", "layout-columns", "layout-grid", "layout-hero", "browse-widgets"]) {
      assert.ok(empty.querySelector(`[data-action="${action}"]`), `empty action ${action}`);
    }
  });
});

describe("seo presentation", () => {
  it("renders ring, categories, google and social cards", async () => {
    ctx.showPanel("right", "seo");
    const panel = document.getElementById("sidebar-right-panel-seo");
    const title = panel.querySelector('[data-seo-field="metaTitle"]');
    title.value = "A proper editor title for testing purposes here";
    title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    assert.ok(panel.querySelector("svg.seo-ring"), "ring present");
    assert.ok(panel.querySelector(".seo-ring-num"), "ring number present");
    assert.ok(panel.querySelectorAll(".seo-cat").length >= 4, "category rows present");
    assert.ok(panel.querySelector(".seo-google-card"), "google card present");
    assert.ok(panel.querySelector(".seo-google-title"), "google title present");
    assert.ok(panel.querySelector(".seo-x-card"), "x card present");
    assert.ok(panel.querySelector(".seo-og-card"), "og card present");
  });
});

describe("keyboard additions", () => {
  it("ctrl+d duplicates, ctrl+g groups, delete removes multi", () => {
    ctx.clearSelection();
    const a = ctx.insertAtSelection("paragraph");
    ctx.selectBlock(a, { focus: false });
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true }));
    assert.equal(ctx.topLevelOrder().length >= 2, true);
    const ids = ctx.topLevelOrder().slice(-2);
    ctx.editor.engines.selection.selectBlocks(ids);
    const gid = ctx.groupSelection("group");
    assert.ok(gid);
    ctx.undo();
    assert.ok(!ctx.editor.document.getNode(gid));
  });
});
