import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

// P1: live paste/typing path sanitizes anchors like the import engine, and
// removeLink is child-aware (list items, table cells) like toggleMark.

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
let text;

before(async () => {
  controller = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  text = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/canvas/text.js");
  await controller.boot();
  ctx = controller.getCtx();
});

function wrapEl(id) {
  return document.querySelector(`#editor-canvas .block-wrap[data-for-block-id="${id}"]`);
}

function inlineOf(html) {
  const host = document.createElement("div");
  host.innerHTML = html;
  return text.domToInline(host);
}

describe("P1 pasted anchors sanitize like the import engine", () => {
  it("drops javascript: hrefs but keeps the anchor text", () => {
    const nodes = inlineOf('<a href="javascript:alert(1)">click</a>');
    assert.equal(nodes.map((n) => n.text).join(""), "click");
    assert.ok(nodes.every((n) => !(n.marks || []).some((m) => m.type === "link")), "no link mark survives");
  });

  it("keeps safe hrefs as link marks", () => {
    const nodes = inlineOf('<a href="https://a.co/page">ok</a>');
    assert.deepEqual(nodes, [{ type: "text", text: "ok", marks: [{ type: "link", attrs: { href: "https://a.co/page" } }] }]);
  });

  it("degrades href-less anchors to plain text", () => {
    const nodes = inlineOf("<a>bare</a>");
    assert.equal(nodes.map((n) => n.text).join(""), "bare");
    assert.ok(nodes.every((n) => !(n.marks || []).some((m) => m.type === "link")));
  });

  it("keeps nested emphasis inside a dropped anchor", () => {
    const nodes = inlineOf('<a href="javascript:x"><b>bold</b> plain</a>');
    assert.equal(nodes.map((n) => n.text).join(""), "bold plain");
    const bold = nodes.find((n) => n.text === "bold");
    assert.deepEqual(bold.marks, [{ type: "bold" }]);
  });
});

describe("P1 removeLink is child-aware", () => {
  it("removes a link inside a table cell and undoes", () => {
    const id = ctx.insertAtSelection("table");
    ctx.setBlockData(id, { rows: [["H", "H"], ["Cell", "Cell"]] }, { record: false });
    ctx.sync();
    ctx.render();
    ctx.selectBlock(id, { focus: false });
    const rows = [...wrapEl(id).querySelectorAll("tr")];
    const cell = rows[1].children[0];
    text.setSelectionRange(cell, 0, 4);
    assert.equal(text.insertLink(id, "https://l.co"), true);
    text.setSelectionRange(cell, 0, 4);
    assert.equal(text.removeLink(id), true);
    assert.deepEqual(ctx.getBlock(id).data.rows[1][0], [{ type: "text", text: "Cell", marks: [] }]);
    ctx.undo();
    assert.deepEqual(ctx.getBlock(id).data.rows[1][0], [{ type: "text", text: "Cell", marks: [{ type: "link", attrs: { href: "https://l.co" } }] }]);
  });

  it("removes a link inside a list item only", () => {
    const id = ctx.insertAtSelection("bulletList");
    ctx.setBlockData(id, { items: ["one", "two"] }, { record: false });
    ctx.sync();
    ctx.render();
    ctx.selectBlock(id, { focus: false });
    const li = wrapEl(id).querySelector(`li.block-child[data-item-index="1"]`);
    text.setSelectionRange(li, 0, 3);
    assert.equal(text.insertLink(id, "https://l.co"), true);
    text.setSelectionRange(li, 0, 3);
    assert.equal(text.removeLink(id), true);
    const items = ctx.getBlock(id).data.items;
    assert.deepEqual(items[1], [{ type: "text", text: "two", marks: [] }]);
    assert.deepEqual(items[0], [{ type: "text", text: "one", marks: [] }]);
  });
});
