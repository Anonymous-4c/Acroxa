import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

// Toolbar + selection UX:
// 1. An underline button exists and applies underline through real wiring.
// 2. Formatting keeps the text range selected so marks chain (Docs behavior).
// 3. Drag-selecting across blocks upgrades to block selection — including
//    drags that cross nested widget boundaries — and the mouseup click on
//    bare canvas no longer wipes it.

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
let selectionUI;

before(async () => {
  controller = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  selectionUI = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/canvas/selection-ui.js");
  await controller.boot();
  ctx = controller.getCtx();
});

function wrapEl(id) {
  return document.querySelector(`#editor-canvas .block-wrap[data-for-block-id="${id}"]`);
}

function editableOf(id) {
  return wrapEl(id).querySelector("[contenteditable='true']");
}

function selectRange(editable, from, to) {
  editable.focus();
  const node = editable.firstChild;
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function domOffsets(editable) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return null;
  const before = (node, offset) => {
    const r = document.createRange();
    r.selectNodeContents(editable);
    r.setEnd(node, offset);
    return r.toString().length;
  };
  return {
    from: before(range.startContainer, range.startOffset),
    to: before(range.endContainer, range.endOffset),
    collapsed: range.collapsed,
  };
}

function engineBlocks() {
  const sel = ctx.editor.engines.selection.get();
  return sel.mode === "blocks" ? [...sel.blockIds] : null;
}

function seedParagraph(text) {
  const id = ctx.insertAtSelection("paragraph");
  ctx.setBlockData(id, { content: [{ type: "text", text, marks: [] }] }, { record: false });
  ctx.sync();
  ctx.render();
  return id;
}

describe("toolbar underline + selection-preserving format", () => {
  it("has an underline button that applies underline through real wiring", () => {
    const btn = document.querySelector("#toolbar-underline");
    assert.ok(btn, "shell must render #toolbar-underline");
    const id = seedParagraph("hello");
    ctx.selectBlock(id, { focus: false });
    const editable = editableOf(id);
    selectRange(editable, 0, 5);
    btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    const marks = ctx.getBlock(id).content.flatMap((n) => n.marks || []).map((m) => m.type);
    assert.ok(marks.includes("underline"), `expected underline, got ${JSON.stringify(marks)}`);
  });

  it("formatting keeps the range selected so marks chain", () => {
    const id = seedParagraph("hello");
    ctx.selectBlock(id, { focus: false });
    const editable = editableOf(id);
    selectRange(editable, 1, 4);
    assert.equal(ctx.toggleMark(id, "bold"), true);
    let off = domOffsets(editable);
    assert.deepEqual([off.from, off.to, off.collapsed], [1, 4, false]);
    assert.equal(ctx.toggleMark(id, "italic"), true);
    off = domOffsets(editable);
    assert.deepEqual([off.from, off.to, off.collapsed], [1, 4, false]);
    const mid = ctx.getBlock(id).content.find((n) => n.text === "ell");
    assert.deepEqual(mid.marks.map((m) => m.type).sort(), ["bold", "italic"]);
  });
});

describe("cross-block drag selection", () => {
  it("upgrades a text range spanning two blocks", () => {
    const a = seedParagraph("alpha");
    const b = seedParagraph("omega");
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(editableOf(a).firstChild, 1);
    range.setEnd(editableOf(b).firstChild, 2);
    sel.removeAllRanges();
    sel.addRange(range);
    assert.equal(selectionUI.maybeUpgradeTextSelection(), true);
    assert.deepEqual(engineBlocks(), [a, b]);
  });

  it("mouseup click on bare canvas does not wipe the upgraded range", () => {
    assert.ok(engineBlocks() && engineBlocks().length === 2, "precondition: blocks selected");
    const canvas = document.getElementById("editor-canvas");
    canvas.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    assert.deepEqual(engineBlocks()?.length, 2);
  });

  it("upgrades drags crossing nested widget boundaries", () => {
    const cols = ctx.insertAtSelection("columns");
    ctx.sync();
    const colId = ctx.getBlock(cols).children[0];
    const nested = ctx.appendTo(colId, "paragraph");
    ctx.setBlockData(nested, { content: [{ type: "text", text: "nested", marks: [] }] }, { record: false });
    // Anchor on the columns block so the next insert lands top-level after it.
    ctx.selectBlock(cols, { focus: false });
    const top = ctx.insertAtSelection("paragraph");
    ctx.setBlockData(top, { content: [{ type: "text", text: "topper", marks: [] }] }, { record: false });
    ctx.sync();
    ctx.render();
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(editableOf(nested).firstChild, 0);
    range.setEnd(editableOf(top).firstChild, 3);
    sel.removeAllRanges();
    sel.addRange(range);
    assert.equal(selectionUI.maybeUpgradeTextSelection(), true);
    const blocks = engineBlocks();
    assert.ok(blocks.includes(cols) && blocks.includes(top), `got ${JSON.stringify(blocks)}`);
  });
});
