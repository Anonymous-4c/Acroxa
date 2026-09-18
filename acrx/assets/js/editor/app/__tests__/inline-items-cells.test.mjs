import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

// P0-02: list items and table cells live in the inline model, so marks work
// exactly like paragraphs — bold/link inside item 3 or cell (2,1), kept
// through typing, split, transform, paste, save and export.

const require = createRequire(import.meta.url);
const shell = require("C:/Users/sohai/Desktop/Acroxa/src/views/editor.js");

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${shell.renderEditor()}</body></html>`, {
  url: "http://localhost/acrx/editor/",
  pretendToBeVisual: true,
});

for (const key of ["window", "document", "navigator", "localStorage", "Element", "Node", "Document", "Window", "HTMLElement", "Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  if (dom.window[key] !== undefined && globalThis[key] === undefined) {
    globalThis[key] = key === "requestAnimationFrame" || key === "cancelAnimationFrame"
      ? dom.window[key].bind(dom.window)
      : dom.window[key];
  }
}
if (!globalThis.CSS || !globalThis.CSS.escape) {
  globalThis.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
}

let controller;
let ctx;
let setSelectionRange;
let insertLink;

before(async () => {
  controller = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  const text = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/canvas/text.js");
  setSelectionRange = text.setSelectionRange;
  insertLink = text.insertLink;
  await controller.boot();
  ctx = controller.getCtx();
});

function wrapEl(id) {
  return document.querySelector(`#editor-canvas .block-wrap[data-for-block-id="${id}"]`);
}

function liAt(id, i) {
  return wrapEl(id).querySelector(`li.block-child[data-item-index="${i}"]`);
}

function cellAt(id, r, c) {
  const rows = [...wrapEl(id).querySelectorAll("tr")];
  return rows[r].children[c];
}

function itemMarks(block, i) {
  const item = block.data.items[i];
  assert.ok(Array.isArray(item), `item ${i} must be inline-model, got ${JSON.stringify(item)}`);
  return item;
}

describe("P0-02 inline items and cells", () => {
  it("heals legacy string surfaces to inline arrays on read", () => {
    const id = ctx.insertAtSelection("bulletList");
    ctx.setBlockData(id, { items: ["alpha", "beta"] }, { record: false });
    const block = ctx.getBlock(id);
    assert.deepEqual(block.data.items, [
      [{ type: "text", text: "alpha", marks: [] }],
      [{ type: "text", text: "beta", marks: [] }],
    ]);
    const t = ctx.insertAtSelection("table");
    ctx.setBlockData(t, { rows: [["a", "b"]] }, { record: false });
    assert.deepEqual(ctx.getBlock(t).data.rows, [
      [[{ type: "text", text: "a", marks: [] }], [{ type: "text", text: "b", marks: [] }]],
    ]);
  });

  it("bolds inside item 3 only, keeps selection, undoes in one step", () => {
    const id = ctx.insertAtSelection("bulletList");
    ctx.setBlockData(id, { items: ["one", "two", "three"] }, { record: false });
    ctx.sync();
    ctx.render();
    ctx.selectBlock(id, { focus: false });
    const li = liAt(id, 2);
    setSelectionRange(li, 1, 4);
    assert.equal(ctx.toggleMark(id, "bold"), true);
    const block = ctx.getBlock(id);
    assert.deepEqual(itemMarks(block, 0), [{ type: "text", text: "one", marks: [] }]);
    assert.deepEqual(itemMarks(block, 1), [{ type: "text", text: "two", marks: [] }]);
    const third = itemMarks(block, 2);
    assert.equal(third.map((n) => n.text).join(""), "three");
    assert.deepEqual(third.find((n) => n.text === "hre").marks, [{ type: "bold" }]);
    // Canvas shows the mark where it lives.
    assert.ok(li.querySelector("strong"), "expected a <strong> in item 3");
    assert.equal(wrapEl(id).querySelectorAll("strong").length, 1);
    ctx.undo();
    assert.deepEqual(
      ctx.getBlock(id).data.items.map((nodes) => nodes.map((n) => n.text).join("")),
      ["one", "two", "three"]
    );
  });

  it("links inside table cell (2,1) and keeps them through save shape + export", () => {
    const id = ctx.insertAtSelection("table");
    ctx.setBlockData(id, { rows: [["H", "H"], ["Cell", "Cell"]] }, { record: false });
    ctx.sync();
    ctx.render();
    ctx.selectBlock(id, { focus: false });
    const cell = cellAt(id, 1, 0);
    setSelectionRange(cell, 0, 4);
    assert.equal(insertLink(id, "https://l.co"), true);
    const saved = ctx.getBlock(id).data.rows[1][0];
    assert.deepEqual(saved, [{ type: "text", text: "Cell", marks: [{ type: "link", attrs: { href: "https://l.co" } }] }]);
    // Blueprint (save payload) carries the mark.
    const bp = ctx.blueprint();
    const stored = bp.blocks[id].data.rows[1][0];
    assert.deepEqual(stored, saved);
    // Exported HTML carries a working href.
    const { html } = ctx.renderExport();
    assert.ok(html.includes('<a href="https://l.co">Cell</a>'), html.slice(html.indexOf("https://l.co") - 80, html.indexOf("https://l.co") + 40));
  });

  it("typing at a marked item's end preserves its marks", () => {
    const id = ctx.insertAtSelection("bulletList");
    ctx.setBlockData(id, { items: [[{ type: "text", text: "hey", marks: [{ type: "bold" }] }]] }, { record: false });
    ctx.sync();
    ctx.render();
    const li = liAt(id, 0);
    li.dispatchEvent(new dom.window.Event("focusin", { bubbles: true }));
    // Faithful keystroke: the browser inserts inside the <strong>, it does
    // not replace the item's textContent.
    const strong = li.querySelector("strong");
    assert.ok(strong, "precondition: bold renders");
    strong.firstChild.textContent = "hey!";
    li.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    const item = ctx.getBlock(id).data.items[0];
    assert.equal(item.map((n) => n.text).join(""), "hey!");
    assert.ok(item.some((n) => (n.marks || []).some((m) => m.type === "bold")), "bold must survive typing");
  });

  it("Enter-split keeps marks on both halves and lands in settings", () => {
    const id = ctx.insertAtSelection("bulletList");
    ctx.setBlockData(id, { items: [[{ type: "text", text: "ab", marks: [{ type: "bold" }] }]] }, { record: false });
    ctx.sync();
    ctx.render();
    const li = liAt(id, 0);
    setSelectionRange(li, 1, 1);
    ctx.splitBlock(id, li);
    const items = ctx.getBlock(id).data.items;
    assert.equal(items.length, 2);
    assert.deepEqual(items[0], [{ type: "text", text: "a", marks: [{ type: "bold" }] }]);
    assert.deepEqual(items[1], [{ type: "text", text: "b", marks: [{ type: "bold" }] }]);
  });

  it("list-to-list transform preserves item marks", () => {
    const id = ctx.insertAtSelection("bulletList");
    ctx.setBlockData(id, { items: [[{ type: "text", text: "marked", marks: [{ type: "italic" }] }]] }, { record: false });
    ctx.sync();
    assert.equal(ctx.transformBlock(id, "orderedList"), true);
    const items = ctx.getBlock(id).data.items;
    assert.deepEqual(items, [[{ type: "text", text: "marked", marks: [{ type: "italic" }] }]]);
  });
});
