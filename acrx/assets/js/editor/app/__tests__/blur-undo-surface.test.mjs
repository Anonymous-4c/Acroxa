import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

// P0-09: blur-coalesced undo must cover the block's full editable surface
// (content + items/rows/text/...), not just `content`. Typing in a list item
// or table cell, then blurring, then Ctrl+Z must reverse the session exactly
// once. On the old code the snapshot compared only `content`, so undo either
// did nothing visible or unwound an unrelated (insert) entry.

const require = createRequire(import.meta.url);
const shell = require("C:/Users/sohai/Desktop/Acroxa/src/views/editor.js");

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${shell.renderEditor()}</body></html>`, {
  url: "http://localhost/acrx/editor/",
  pretendToBeVisual: true,
});

for (const key of ["window", "document", "navigator", "localStorage", "Element", "Node", "Document", "Window", "HTMLElement", "Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "ResizeObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  if (dom.window[key] !== undefined && globalThis[key] === undefined) {
    globalThis[key] = key === "requestAnimationFrame" || key === "cancelAnimationFrame"
      ? dom.window[key].bind(dom.window)
      : dom.window[key];
  }
}
// jsdom lacks ResizeObserver; editor app boot observes the canvas.
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

let controller;
let ctx;

before(async () => {
  controller = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  await controller.boot();
  ctx = controller.getCtx();
});

function wrapEl(id) {
  return document.querySelector(`#editor-canvas .block-wrap[data-for-block-id="${id}"]`);
}

// Plain text of each list item (items live in the inline model, P0-02).
function itemTexts(block) {
  return (block.data.items || []).map((item) =>
    (Array.isArray(item) ? item : [{ type: "text", text: item || "" }])
      .filter((n) => n?.type === "text").map((n) => n.text || "").join(""));
}

// Plain text of each table cell (cells live in the inline model, P0-02).
function cellTexts(block) {
  const plain = (v) => (Array.isArray(v) ? v : [{ type: "text", text: v || "" }])
    .filter((n) => n?.type === "text").map((n) => n.text || "").join("");
  return (block.data.rows || []).map((row) => (Array.isArray(row) ? row : [row]).map(plain));
}

// One typing session: focus in, change DOM text, input event, focus out.
function typeSession(editable, text) {
  editable.dispatchEvent(new dom.window.Event("focusin", { bubbles: true }));
  editable.textContent = text;
  editable.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  editable.dispatchEvent(new dom.window.Event("focusout", { bubbles: true }));
}

function plainOf(block) {
  return (block.content || []).map((n) => n.text || "").join("");
}

describe("P0-09 blur-undo editable surfaces", () => {
  it("paragraph typing session reverses in exactly one undo", () => {
    const id = ctx.insertAtSelection("paragraph");
    ctx.setBlockData(id, { content: [{ type: "text", text: "hello", marks: [] }] }, { record: false });
    ctx.sync();
    ctx.render();
    const editable = wrapEl(id).querySelector("[contenteditable='true']");
    typeSession(editable, "hello world");
    assert.equal(plainOf(ctx.getBlock(id)), "hello world");
    ctx.undo();
    assert.equal(plainOf(ctx.getBlock(id)), "hello");
  });

  it("list-item typing session reverses in exactly one undo", () => {
    const id = ctx.insertAtSelection("bulletList");
    ctx.setBlockData(id, { items: ["hello"] }, { record: false });
    ctx.sync();
    ctx.render();
    const li = wrapEl(id).querySelector("li.block-child");
    assert.ok(li, "expected a rendered list item");
    typeSession(li, "hello world");
    assert.deepEqual(itemTexts(ctx.getBlock(id)), ["hello world"]);
    ctx.undo();
    const after = ctx.getBlock(id);
    assert.ok(after, "undo must reverse the edit, not remove the block");
    assert.deepEqual(itemTexts(after), ["hello"]);
  });

  it("table-cell typing session reverses in exactly one undo", () => {
    const id = ctx.insertAtSelection("table");
    ctx.setBlockData(id, { rows: [["H", "H"], ["Cell", "Cell"]] }, { record: false });
    ctx.sync();
    ctx.render();
    const cell = wrapEl(id).querySelector('[data-row="1"]');
    assert.ok(cell, "expected a rendered table cell");
    typeSession(cell, "CellX");
    assert.deepEqual(cellTexts(ctx.getBlock(id)), [["H", "H"], ["CellX", "Cell"]]);
    ctx.undo();
    const after = ctx.getBlock(id);
    assert.ok(after, "undo must reverse the edit, not remove the block");
    assert.deepEqual(cellTexts(after), [["H", "H"], ["Cell", "Cell"]]);
  });
});
