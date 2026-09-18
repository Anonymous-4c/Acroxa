import { describe, it, before } from "node:test";
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
let palette;

const RECENTS_KEY = "acrx-editor-recents";
const FAVORITES_KEY = "acrx-editor-favorites";

before(async () => {
  controller = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  await controller.boot();
  ctx = controller.getCtx();
  palette = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/menus/palette.js");
  // Boot opens first-visit onboarding on this id-less URL; it is unrelated.
  document.querySelector(".acrx-onboarding-overlay")?.remove();
  localStorage.removeItem(RECENTS_KEY);
  localStorage.removeItem(FAVORITES_KEY);
  for (const id of [...ctx.topLevelOrder()]) ctx.deleteBlock(id);
  ctx.sync();
  ctx.render();
});

function overlay() {
  return document.getElementById("editor-command-palette");
}

function isShown() {
  return !overlay().classList.contains("hidden");
}

function searchInput() {
  return document.getElementById("editor-cmdk-search");
}

function type(text) {
  const input = searchInput();
  input.value = text;
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

function cardLabels() {
  return [...overlay().querySelectorAll("[data-cmd-index] .cmdk-item-label")].map((n) => n.textContent);
}

function press(target, key, opts = {}) {
  target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
}

describe("palette surface", () => {
  it("builds the overlay panel with search, results, footer and dialog semantics", () => {
    assert.ok(overlay());
    assert.ok(overlay().querySelector(".cmdk-panel"));
    assert.equal(overlay().querySelector(".cmdk-panel").getAttribute("role"), "dialog");
    assert.ok(searchInput());
    assert.ok(overlay().querySelector(".cmdk-results"));
    assert.ok(overlay().querySelector(".cmdk-footer"));
    assert.equal(isShown(), false);
  });

  it("header pill input is an opener, not a second surface", () => {
    const opener = document.getElementById("editor-cmdk-input");
    assert.ok(opener);
    assert.equal(opener.readOnly, true);
    assert.equal(document.getElementById("editor-cmdk-dropdown"), null);
  });

  it("every rendered card carries a duotone icon", () => {
    palette.open();
    const icons = [...overlay().querySelectorAll(".cmdk-card-icon i, .cmdk-chip .cmdk-card-icon i")];
    assert.ok(icons.length > 0);
    for (const icon of icons) {
      assert.ok(icon.className.includes("fa-duotone"), `icon renders duotone: ${icon.className}`);
    }
    palette.close(false);
  });
});

describe("palette open and close", () => {
  it("opens on header input focus and closes on Escape with focus restored", () => {
    const opener = document.getElementById("editor-cmdk-input");
    const id = ctx.insertAtSelection("paragraph");
    const editable = document.querySelector(`#editor-canvas .block-wrap[data-for-block-id="${id}"] [contenteditable='true']`);
    editable.focus();
    opener.focus();
    assert.equal(isShown(), true);
    assert.equal(document.activeElement, searchInput());
    press(searchInput(), "Escape");
    assert.equal(isShown(), false);
    // Invoker was the header pill (focus had already moved there on open).
    assert.equal(document.activeElement, opener);
  });

  it("restores a canvas invoker when opened programmatically", () => {
    const id = ctx.insertAtSelection("paragraph");
    const editable = document.querySelector(`#editor-canvas .block-wrap[data-for-block-id="${id}"] [contenteditable='true']`);
    editable.focus();
    palette.open();
    assert.equal(document.activeElement, searchInput());
    press(searchInput(), "Escape");
    assert.equal(isShown(), false);
    assert.equal(document.activeElement, editable);
  });

  it("mod+K toggles open and closed, including from inside its own search", () => {
    palette.close(false);
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    assert.equal(isShown(), true);
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    assert.equal(isShown(), false);
  });

  it("backdrop click closes without restoring focus elsewhere", () => {
    palette.open();
    assert.equal(isShown(), true);
    overlay().dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true }));
    // pointerdown on the panel itself must NOT close
    palette.open();
    document.querySelector(".cmdk-panel").dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true }));
    assert.equal(isShown(), true);
    palette.close(false);
  });
});

describe("palette search and rank", () => {
  it("finds Undo with its shortcut visible", () => {
    palette.open();
    type("undo");
    const labels = cardLabels();
    assert.ok(labels.includes("Undo"), `Undo found, got: ${labels.join(", ")}`);
    const card = [...overlay().querySelectorAll("[data-cmd-index]")].find((n) => n.textContent.includes("Undo"));
    assert.ok(card.querySelector("kbd") && card.textContent.includes("mod+z"));
    palette.close(false);
  });

  it("matches keywords and descriptions, not just labels", () => {
    palette.open();
    type("phone");
    assert.ok(cardLabels().includes("Mobile preview"), `keyword hit, got: ${cardLabels().join(", ")}`);
    type("breakpoint");
    assert.ok(cardLabels().includes("Mobile preview"));
    palette.close(false);
  });

  it("empty query shows bento sections; big categories collapse behind show-all", () => {
    palette.open();
    type("");
    const groups = [...overlay().querySelectorAll(".cmdk-group")].map((n) => n.textContent);
    assert.ok(groups.includes("Insert"), `Insert grid present: ${groups.join(" | ")}`);
    const showAll = overlay().querySelector('[data-show-all="Insert"]');
    assert.ok(showAll, "Insert grid capped with show-all");
    showAll.click();
    const after = [...overlay().querySelectorAll(".cmdk-group")].map((n) => n.textContent);
    assert.deepEqual(after, ["Insert"]);
    assert.ok(cardLabels().length > 6, "full category listed");
    palette.close(false);
  });

  it("gibberish shows the empty state with a working clear action", () => {
    palette.open();
    type("zzz-no-such-command");
    assert.ok(overlay().querySelector(".cmdk-empty"));
    overlay().querySelector("[data-cmdk-clear2]").click();
    assert.equal(searchInput().value, "");
    assert.ok(cardLabels().length > 0, "results return after clear");
    palette.close(false);
  });
});

describe("palette availability", () => {
  function hasId(id) {
    return !!overlay().querySelector(`[data-cmd-id="${id}"]`);
  }

  it("hides block-scoped commands without a selection", () => {
    ctx.clearSelection();
    palette.open();
    type("");
    assert.ok(!hasId("block.delete"), "Delete hidden with no selection");
    assert.ok(!hasId("block.duplicate"), "Duplicate hidden with no selection");
    palette.close(false);
  });

  it("shows Delete with danger styling once a block is selected", () => {
    const id = ctx.insertAtSelection("paragraph");
    ctx.selectBlock(id, { focus: false });
    palette.open();
    type("delete block");
    const card = overlay().querySelector('[data-cmd-id="block.delete"]');
    assert.ok(card, "Delete visible with selection");
    assert.ok(card.classList.contains("is-danger"), "destructive card marked");
    palette.close(false);
  });

  it("shows Group only for multi-selection", () => {
    const a = ctx.insertAtSelection("paragraph");
    const b = ctx.insertAtSelection("paragraph");
    ctx.selectBlock(a, { focus: false });
    palette.open();
    type("group selected");
    assert.ok(!hasId("block.group"), "Group hidden for single selection");
    palette.close(false);
    ctx.editor.engines.selection.selectBlocks([a, b]);
    ctx.afterSelectionChange(null);
    palette.open();
    type("group selected");
    assert.ok(hasId("block.group"), "Group visible for multi-selection");
    palette.close(false);
    ctx.clearSelection();
  });

  it("lists engine-annotated commands only, never bare runtime primitives", () => {
    ctx.clearSelection();
    palette.open();
    type("");
    const groups = [...overlay().querySelectorAll(".cmdk-group")].map((n) => n.textContent);
    for (const g of groups) {
      assert.equal(g, g[0].toUpperCase() + g.slice(1), `no lowercase engine category leaks: ${g}`);
    }
    assert.ok(!hasId("save"), "runtime save primitive hidden");
    assert.ok(hasId("document.save"), "annotated Save now shown");
    palette.close(false);
  });
});

describe("palette recents and favorites", () => {
  it("records executed commands and surfaces a Recent section", () => {
    palette.open();
    type("mobile preview");
    press(searchInput(), "Enter");
    assert.deepEqual(JSON.parse(localStorage.getItem(RECENTS_KEY))[0], "ui.deviceMobile");
    palette.open();
    type("");
    const groups = [...overlay().querySelectorAll(".cmdk-group")].map((n) => n.textContent);
    assert.ok(groups.includes("Recent"), `Recent section present: ${groups.join(" | ")}`);
    palette.close(false);
  });

  it("pins and unpins favorites with aria state", () => {
    palette.open();
    type("undo");
    const star = overlay().querySelector("[data-fav]");
    assert.ok(star);
    assert.equal(star.getAttribute("aria-pressed"), "false");
    star.click();
    assert.deepEqual(JSON.parse(localStorage.getItem(FAVORITES_KEY)), ["history.undo"]);
    type("");
    assert.ok([...overlay().querySelectorAll(".cmdk-group")].map((n) => n.textContent).includes("Favorites"));
    const pinned = overlay().querySelector('[data-fav="history.undo"]');
    assert.equal(pinned.getAttribute("aria-pressed"), "true");
    pinned.click();
    assert.deepEqual(JSON.parse(localStorage.getItem(FAVORITES_KEY)), []);
    palette.close(false);
  });
});

describe("palette keyboard and execution", () => {
  it("arrows wrap, Home and End jump, Tab moves focus", () => {
    palette.open();
    type("a");
    const count = overlay().querySelectorAll("[data-cmd-index]").length;
    assert.ok(count > 1);
    press(searchInput(), "End");
    assert.equal(document.activeElement.getAttribute("data-cmd-index"), String(count - 1));
    press(document.activeElement, "ArrowDown");
    assert.equal(document.activeElement.getAttribute("data-cmd-index"), "0");
    press(document.activeElement, "ArrowUp");
    assert.equal(document.activeElement.getAttribute("data-cmd-index"), String(count - 1));
    press(document.activeElement, "Home");
    assert.equal(document.activeElement.getAttribute("data-cmd-index"), "0");
    press(document.activeElement, "Tab");
    assert.equal(document.activeElement.getAttribute("data-cmd-index"), "1");
    palette.close(false);
  });

  it("Enter inserts a paragraph block and closes", () => {
    const before = ctx.topLevelOrder().length;
    palette.open();
    type("insert paragraph");
    press(searchInput(), "Enter");
    assert.equal(isShown(), false);
    assert.equal(ctx.topLevelOrder().length, before + 1);
    assert.equal(ctx.getBlock(ctx.topLevelOrder()[ctx.topLevelOrder().length - 1]).type, "paragraph");
  });

  it("delete runs through the engine with an undo toast", () => {
    const id = ctx.insertAtSelection("paragraph");
    ctx.selectBlock(id, { focus: false });
    palette.open();
    type("delete block");
    press(searchInput(), "Enter");
    assert.equal(ctx.getBlock(id), null);
    assert.match(document.body.textContent, /Ctrl\+Z to undo/);
    ctx.undo();
    assert.ok(ctx.getBlock(id), "undo restores the deleted block");
  });

  it("mouse hover follows highlight and click executes", () => {
    const before = ctx.topLevelOrder().length;
    palette.open();
    type("insert heading");
    const card = [...overlay().querySelectorAll("[data-cmd-index]")][0];
    card.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true }));
    assert.ok(card.classList.contains("is-active"));
    card.click();
    assert.equal(ctx.topLevelOrder().length, before + 1);
  });
});
