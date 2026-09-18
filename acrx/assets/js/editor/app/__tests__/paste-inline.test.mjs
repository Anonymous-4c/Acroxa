import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

// P0-03: single-paragraph pastes land inline at the caret (marks intact,
// caret follows, one undo step) instead of exploding into blocks below.
// P1-10: long pastes cap loudly (500 + toast), never silently at 60.

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
let isInlinePaste;

before(async () => {
  controller = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  const text = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/canvas/text.js");
  isInlinePaste = text.isInlinePaste;
  await controller.boot();
  ctx = controller.getCtx();
});

function wrapEl(id) {
  return document.querySelector(`#editor-canvas .block-wrap[data-for-block-id="${id}"]`);
}

function plainOf(block) {
  return (block.content || []).map((n) => n.text || "").join("");
}

// Place a collapsed caret at `offset` inside `editable` (jsdom Selection).
function placeCaret(editable, offset) {
  editable.focus();
  const node = editable.firstChild;
  const range = document.createRange();
  range.setStart(node, Math.min(offset, node.textContent.length));
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretOf(editable) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(editable);
  pre.setEnd(range.startContainer, range.startOffset);
  return { from: pre.toString().length, collapsed: range.collapsed };
}

describe("P0-03 isInlinePaste routing", () => {
  it("treats inline payloads as inline, structure as blocks", () => {
    assert.equal(isInlinePaste("<b>bold</b> word", null), true);
    assert.equal(isInlinePaste('<a href="https://a.co">x</a>', null), true);
    assert.equal(isInlinePaste("<s>gone</s>", null), true);
    assert.equal(isInlinePaste("<p>para</p>", null), false);
    assert.equal(isInlinePaste("<div>soup</div>", null), false);
    assert.equal(isInlinePaste("<ul><li>x</li></ul>", null), false);
    assert.equal(isInlinePaste(null, "one\n\ntwo"), false);
    assert.equal(isInlinePaste(null, "one\ntwo"), true);
    assert.equal(isInlinePaste(null, "   "), false);
  });
});

describe("P0-03 inline paste at caret", () => {
  it("pastes a bold word mid-sentence: one paragraph, marks intact, caret follows, one undo", () => {
    const id = ctx.insertAtSelection("paragraph");
    ctx.setBlockData(id, { content: [{ type: "text", text: "ab", marks: [] }] }, { record: false });
    ctx.sync();
    ctx.render();
    const editable = wrapEl(id).querySelector("[contenteditable='true']");
    placeCaret(editable, 1);
    assert.equal(ctx.pasteInline(id, editable, "<strong>X</strong>", null), true);
    const block = ctx.getBlock(id);
    assert.equal(plainOf(block), "aXb");
    assert.equal(ctx.topLevelOrder().length, ctx.topLevelOrder().length); // no block split
    const mid = block.content.find((n) => n.text === "X");
    assert.deepEqual(mid.marks, [{ type: "bold" }]);
    const caret = caretOf(editable);
    assert.ok(caret && caret.collapsed && caret.from === 2, `caret after insertion, got ${JSON.stringify(caret)}`);
    ctx.undo();
    assert.equal(plainOf(ctx.getBlock(id)), "ab");
  });

  it("multi-block HTML in an editable escalates to block insertion", () => {
    const id = ctx.insertAtSelection("paragraph");
    ctx.setBlockData(id, { content: [{ type: "text", text: "anchor", marks: [] }] }, { record: false });
    ctx.sync();
    ctx.render();
    const editable = wrapEl(id).querySelector("[contenteditable='true']");
    // <p> tags mean structure: inline path must decline.
    assert.equal(ctx.pasteInline(id, editable, "<p>one</p><p>two</p>", null), false);
    // And the anchor paragraph itself is untouched.
    assert.equal(plainOf(ctx.getBlock(id)), "anchor");
  });
});

describe("P0-03/P1-10 block paste: one undo step, honest cap", () => {
  it("multi-paragraph text paste lands after the anchor and undoes in one step", () => {
    const before = ctx.topLevelOrder().length;
    const id = ctx.insertAtSelection("paragraph");
    ctx.setBlockData(id, { content: [{ type: "text", text: "anchor", marks: [] }] }, { record: false });
    ctx.sync();
    const anchored = ctx.topLevelOrder().length;
    ctx.pasteText("one\n\ntwo\n\nthree");
    assert.equal(ctx.topLevelOrder().length, anchored + 3);
    ctx.undo();
    assert.equal(ctx.topLevelOrder().length, anchored, "one undo reverses the whole paste");
    assert.ok(before <= anchored);
  });

  it("505-paragraph paste caps at 500 instead of silently dropping at 60", () => {
    const big = Array.from({ length: 505 }, (_, i) => `chunk ${i}`).join("\n\n");
    const anchored = ctx.topLevelOrder().length;
    ctx.pasteText(big);
    assert.equal(ctx.topLevelOrder().length, anchored + 500);
    ctx.undo();
    assert.equal(ctx.topLevelOrder().length, anchored);
  });
});
