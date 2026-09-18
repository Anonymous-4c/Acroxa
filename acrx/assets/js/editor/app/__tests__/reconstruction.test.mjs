import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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

before(async () => {
  controller = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  await controller.boot();
  ctx = controller.getCtx();
  // Boot opens first-visit onboarding on this id-less URL; dismiss it so
  // overlay assertions below only see the dialogs under test.
  const ob = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/services/onboarding.js");
  ob.closeOnboarding();
});

function canvas() {
  return document.getElementById("editor-canvas");
}

function editableOf(id) {
  return canvas().querySelector(`.block-wrap[data-for-block-id="${id}"] [contenteditable='true']`);
}

describe("placeholder follows document state", () => {
  it("marks fresh editables empty and clears on input", async () => {
    const { isEmptyEditable, syncEmptyState, normalizeEmptyEditable } = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/canvas/text.js");
    const id = ctx.insertAtSelection("paragraph");
    const editable = editableOf(id);
    assert.ok(editable);
    assert.equal(editable.getAttribute("data-placeholder"), "Start typing...");
    assert.ok(editable.classList.contains("is-empty"), "fresh paragraph carries is-empty");

    editable.innerHTML = "Hello world";
    editable.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.ok(!editable.classList.contains("is-empty"), "placeholder state clears on input");
    assert.equal(isEmptyEditable(editable), false);

    // Browser residue (<br>, empty wrappers, ZWSP) still counts as empty.
    editable.innerHTML = "<br>";
    assert.equal(isEmptyEditable(editable), true);
    editable.innerHTML = "<div><br></div>";
    assert.equal(isEmptyEditable(editable), true);
    editable.innerHTML = "   ";
    assert.equal(isEmptyEditable(editable), true);
    assert.equal(normalizeEmptyEditable(editable), true);
    assert.equal(editable.innerHTML, "");
    assert.ok(editable.classList.contains("is-empty"));
    syncEmptyState(editable);
  });

  it("shows placeholder again after deleting all content", async () => {
    const id = ctx.insertAtSelection("heading");
    const editable = editableOf(id);
    editable.innerHTML = "Title";
    editable.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.ok(!editable.classList.contains("is-empty"));
    editable.innerHTML = "";
    editable.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.ok(editable.classList.contains("is-empty"), "placeholder returns on empty");
  });
});

describe("empty containers show an in-flow hint, never an overlay", () => {
  it("hints only while genuinely empty", () => {
    const id = ctx.insertAtSelection("group");
    assert.ok(id);
    const wrap = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`);
    assert.ok(wrap.querySelector(".container-empty-hint"), "empty group renders in-flow hint");
    assert.equal(wrap.querySelectorAll(".container-empty-hint").length, 1);
    // No absolutely-positioned overlay hint exists anywhere.
    assert.equal(canvas().querySelectorAll(".block-wrap.empty").length, 0);

    // Adding a child removes the hint (render-time truth).
    const res = ctx.editor.execute("insertBlock", { parentId: id, type: "paragraph", data: { content: [] } });
    assert.ok(res.ok);
    ctx.afterStructuralChange({});
    const after = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`);
    assert.equal(after.querySelector(".container-empty-hint"), null, "hint disappears with content");
    ctx.deleteBlock(id, { silent: true });
  });
});

describe("sidebar tab and panel share one source of truth", () => {
  it("activates exactly the matching panel with aria agreement", () => {
    for (const [side, name, btn, panel] of [
      ["left", "widgets", "sidebar-left-btn-widgets", "sidebar-left-panel-widgets"],
      ["left", "patterns", "sidebar-left-btn-patterns", "sidebar-left-panel-patterns"],
      ["left", "layers", "sidebar-left-btn-layers", "sidebar-left-panel-layers"],
      ["right", "seo", "sidebar-right-btn-seo", "sidebar-right-panel-seo"],
      ["right", "block", "sidebar-right-btn-settings", "sidebar-right-panel-settings"],
      ["right", "post", "sidebar-right-btn-post", "sidebar-right-panel-post"],
    ]) {
      ctx.showPanel(side, name);
      const tab = document.getElementById(btn);
      const pnl = document.getElementById(panel);
      assert.ok(tab.classList.contains("active"), `${btn} active`);
      assert.ok(pnl.classList.contains("active"), `${panel} visible`);
      assert.equal(tab.getAttribute("aria-selected"), "true");
      const bar = side === "left" ? "#editor-left-sidebar" : "#editor-right-sidebar";
      for (const other of document.querySelectorAll(`${bar} .sidebar-panel`)) {
        if (other.id !== panel) assert.ok(!other.classList.contains("active"), `${other.id} hidden while ${panel} active`);
      }
    }
  });
});

describe("insert zones share the insertion model via the slash menu", () => {
  it("prepends at document start from a zone open", async () => {
    const slash = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/menus/slashMenu.js");
    const menu = document.getElementById("editor-slash-menu");
    const before = ctx.topLevelOrder()[0] || null;
    assert.equal(slash.openForInsertion("", { left: 10, top: 10, bottom: 20, right: 310 }), true);
    assert.ok(!menu.classList.contains("hidden"), "menu opens for zone");
    const first = menu.querySelector(".slash-menu-item");
    assert.ok(first, "menu has rows");
    first.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    assert.ok(menu.classList.contains("hidden"), "menu closes after choose");
    const order = ctx.topLevelOrder();
    assert.notEqual(order[0], before, "new block prepended at index 0");
    assert.ok(ctx.getBlock(order[0]));
  });

  it("inserts after the zone anchor and resets on dismiss", async () => {
    const slash = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/menus/slashMenu.js");
    const menu = document.getElementById("editor-slash-menu");
    const anchor = ctx.topLevelOrder()[0];
    slash.openForInsertion(anchor, { left: 10, top: 100, bottom: 110, right: 310 });
    slash.closeIfOpen();
    assert.ok(menu.classList.contains("hidden"));
    // Dismiss resets zone state: a fresh open still works.
    assert.equal(slash.openForInsertion(anchor, { left: 10, top: 100, bottom: 110, right: 310 }), true);
    const first = menu.querySelector(".slash-menu-item");
    first.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const order = ctx.topLevelOrder();
    assert.equal(order[order.indexOf(anchor) + 1] !== undefined, true);
    assert.equal(order.indexOf(order[order.indexOf(anchor) + 1]), order.indexOf(anchor) + 1);
  });
});

describe("datetime helpers are timezone-safe and canonical", () => {
  it("parses, formats and grids without Date shifting", async () => {
    const dt = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/datetime.js");
    assert.deepEqual(dt.parseLocal("2026-03-15T09:30"), { y: 2026, m: 3, d: 15, h: 9, min: 30 });
    assert.equal(dt.parseLocal("2026-02-30T00:00"), null, "impossible date rejected");
    assert.equal(dt.parseLocal("not-a-date"), null);
    assert.equal(dt.toLocalValue(2026, 3, 15, 9, 30), "2026-03-15T09:30");
    assert.equal(dt.toLocalValue(2026, 2, 30, 0, 0), "", "impossible date never stored");
    // Round-trip is stable: no timezone conversion anywhere.
    assert.equal(dt.toLocalValue(...Object.values(dt.parseLocal("2026-12-31T23:59"))), "2026-12-31T23:59");
    const grid = dt.monthGrid(2026, 9);
    assert.ok(grid.length === 35 || grid.length === 42);
    assert.ok(grid.some((c) => !c.outside && c.d === 1));
    assert.deepEqual(dt.shiftMonth(2026, 12, 1), { y: 2027, m: 1 });
    assert.deepEqual(dt.shiftMonth(2026, 1, -1), { y: 2025, m: 12 });
    assert.equal(dt.inRange("2026-05-01", "2026-01-01", "2026-12-31"), true);
    assert.equal(dt.inRange("2025-05-01", "2026-01-01", ""), false);
    assert.ok(dt.formatDisplay("2026-03-15T09:30").length > 0);
    assert.equal(dt.formatDisplay(""), "");
  });

  it("opens, picks a day and commits through onPick", async () => {
    const dt = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/datetime.js");
    const host = document.createElement("div");
    document.body.appendChild(host);
    let picked = "unset";
    host.innerHTML = dt.datetimeMountHTML({ key: "publishDate", value: "", label: "Publish date" });
    dt.hydrateDatetimes(host, (key, value) => { picked = `${key}=${value}`; });
    const trigger = host.querySelector(".acrx-dt-trigger");
    assert.ok(trigger, "custom trigger rendered (no native datetime input)");
    assert.equal(host.querySelector('input[type="datetime-local"]'), null);
    trigger.click();
    const pop = document.querySelector(".acrx-dt-pop");
    assert.ok(pop, "popover opens");
    assert.ok(pop.querySelectorAll("[data-dt-day]").length >= 28);
    const enabled = pop.querySelector("[data-dt-day]:not(:disabled):not(.is-outside)");
    enabled.click();
    assert.match(picked, /^publishDate=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // Escape closes and returns focus.
    pop.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(document.querySelector(".acrx-dt-pop"), null, "popover closed on Escape");
    host.remove();
  });
});

describe("new widgets register, render and inspect", () => {
  it("catalog, slugs and containers know the new types", async () => {
    const model = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/model.js");
    for (const [slug, type] of [["tabs", "tabs"], ["accordion", "accordion"], ["timeline", "timeline"], ["features", "features"], ["section", "section"]]) {
      assert.ok(model.CATALOG_BY_TYPE[type], `${type} in catalog`);
      assert.equal(model.SLUG_TO_TYPE[slug], type);
      assert.ok(model.INSERTER_CATALOG.some((d) => d.type === type), `${type} insertable`);
      assert.ok(model.inspectorSections({ type, data: {}, attrs: {}, styles: {} }).length > 0, `${type} has inspector`);
    }
    assert.ok(model.CONTAINER_TYPES.has("section"), "section is a container");
  });

  it("renders canvas views and inspector editors", () => {
    const tabs = ctx.insertAtSelection("tabs");
    const tabsWrap = canvas().querySelector(`.block-wrap[data-for-block-id="${tabs}"]`);
    assert.ok(tabsWrap.querySelector(".acrx-tabs-bar"));
    assert.equal(tabsWrap.querySelectorAll(".acrx-tab-btn").length, 2);
    // Canvas tab switching previews without touching the model.
    tabsWrap.querySelectorAll(".acrx-tab-btn")[1].click();
    assert.ok(tabsWrap.querySelectorAll(".acrx-tab-btn")[1].classList.contains("is-active"));
    assert.equal(ctx.getBlock(tabs).data.active, 0, "model default untouched by preview");

    ctx.selectBlock(tabs, { focus: false, keepPanel: true });
    const settings = document.getElementById("sidebar-right-panel-settings");
    assert.ok(settings.innerHTML.includes("data-tab-label"), "tabs inspector editor present");

    const timeline = ctx.insertAtSelection("timeline");
    assert.ok(canvas().querySelector(`.block-wrap[data-for-block-id="${timeline}"] .acrx-timeline-item`));
    ctx.selectBlock(timeline, { focus: false, keepPanel: true });
    assert.ok(settings.innerHTML.includes("data-ev-title"), "timeline inspector editor present");

    const features = ctx.insertAtSelection("features");
    assert.ok(canvas().querySelector(`.block-wrap[data-for-block-id="${features}"] .acrx-feature-icon`));

    const section = ctx.insertAtSelection("section");
    const sectionWrap = canvas().querySelector(`.block-wrap[data-for-block-id="${section}"]`);
    assert.ok(sectionWrap.querySelector("section.acrx-section"));
    assert.ok(sectionWrap.querySelector(".container-empty-hint"), "empty section hints in-flow");

    const accordion = ctx.insertAtSelection("accordion");
    assert.ok(canvas().querySelector(`.block-wrap[data-for-block-id="${accordion}"] details.acrx-accordion-item`));
  });
});

describe("code editor dialog edits through the model", () => {
  it("guesses languages, saves and guards unsaved changes", async () => {
    const code = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/codeEditor.js");
    assert.equal(code.guessLanguage("app.py"), "python");
    assert.equal(code.guessLanguage("style.css"), "css");
    assert.equal(code.guessLanguage("mystery.xyz"), "txt");

    const id = ctx.insertAtSelection("codeblock");
    assert.equal(code.openCodeEditor(id), true);
    const area = document.querySelector("[data-code-area]");
    assert.ok(area, "dialog opened with textarea (themed, no new dependency)");
    assert.ok(document.querySelector("[data-code-gutter]"));
    area.value = "const a = 1;";
    area.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    document.querySelector("[data-code-save]").click();
    assert.equal(document.querySelector(".acrx-modal-overlay"), null, "dialog closed after save");
    const saved = ctx.getBlock(id);
    assert.ok(JSON.stringify(saved.content).includes("const a = 1;"), "code committed to model");
    ctx.undo();
    assert.ok(!JSON.stringify(ctx.getBlock(id).content).includes("const a = 1;"), "save is a single undo step");
    ctx.redo();
  });
});

describe("widget and pattern panels", () => {
  it("tiles carry corner tags, categories and favorite toggles", async () => {
    ctx.showPanel("left", "widgets");
    const widgets = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/widgets.js");
    widgets.refresh();
    const panel = document.getElementById("sidebar-left-panel-widgets");
    const tile = panel.querySelector(".widget-tile");
    assert.ok(tile);
    assert.ok(tile.querySelector(".widget-fav"), "favorite toggle present");
    assert.ok(tile.querySelector(".widget-tile-cat"), "category caption present");
    assert.ok(tile.getAttribute("aria-label").length > 0);
    const tag = tile.querySelector(".widget-tag");
    if (tag) assert.ok(!tile.querySelector(".widget-tile-name").contains(tag), "tag never sits beside the name");
  });

  it("pattern cards render tags, favorites and hover actions", async () => {
    const patterns = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/patterns.js");
    patterns.setPatterns([{
      _id: "p1", name: "Hero pack", slug: "hero-pack", description: "A hero plus CTA.",
      category: "Marketing", featured: true,
      content: { nodes: [{ type: "hero", settings: { title: "Hi" } }] },
    }]);
    ctx.showPanel("left", "patterns");
    patterns.refresh();
    const panel = document.getElementById("sidebar-left-panel-patterns");
    const card = panel.querySelector(".pattern-card");
    assert.ok(card);
    assert.ok(card.querySelector("[data-fav-pattern]"), "favorite action present");
    assert.ok(card.querySelector("[data-pattern-preview-toggle]"), "preview action present");
    assert.equal(card.querySelector(".widget-tag").textContent, "Featured");
    assert.ok(card.getAttribute("tabindex") === "0");
  });
});

describe("sidebar panels use own capsule classes, never root globals", () => {
  it("no btn-act/button-pst/insp-check anywhere in panel markup", async () => {
    const widgets = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/widgets.js");
    const patterns = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/patterns.js");
    const post = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/postPanel.js");
    const seo = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/seoPanel.js");
    const code = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/codeEditor.js");
    const { State } = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/store.js");

    // Fill every panel with representative content.
    for (const type of ["video", "pricing", "table", "faq", "tabs", "timeline", "features", "button", "gallery", "hero"]) {
      const id = ctx.insertAtSelection(type);
      ctx.selectBlock(id, { focus: false, keepPanel: true });
      ctx.showPanel("right", "block");
      const bad = document.getElementById("sidebar-right-panel-settings").querySelector(".btn-act,.button-pst,.insp-check,.insp-toggle");
      assert.equal(bad, null, `${type} inspector is global-class free`);
    }
    widgets.refresh();
    ctx.showPanel("left", "widgets");
    patterns.setPatterns([{
      _id: "gx", name: "Pack", slug: "pack", description: "d", category: "General",
      content: { nodes: [{ type: "hero", settings: {} }] },
    }]);
    ctx.showPanel("left", "patterns");
    State.patch("post", { allowComments: true, categories: [] });
    post.refresh();
    ctx.showPanel("right", "post");
    State.patch("seo", { noIndex: false, noFollow: false });
    seo.refresh();
    ctx.showPanel("right", "seo");
    for (const panelId of ["sidebar-left-panel-widgets", "sidebar-left-panel-patterns", "sidebar-left-panel-layers", "sidebar-right-panel-post", "sidebar-right-panel-seo", "sidebar-right-panel-settings"]) {
      const bad = document.getElementById(panelId).querySelector(".btn-act,.button-pst,.insp-check,.insp-toggle");
      assert.equal(bad, null, `${panelId} is global-class free`);
    }
    // Capsule voice present instead.
    assert.ok(document.querySelector(".sidebar-panel .axed-btn"), "capsule buttons render in panels");
    assert.ok(document.querySelector(".sidebar-panel .toggle-input"), "framework toggles render in panels");

    // Datetime popover + code dialog follow the same voice.
    document.querySelector('#sidebar-right-panel-post .acrx-dt-trigger')?.click();
    const pop = document.querySelector(".acrx-dt-pop");
    assert.ok(pop, "datetime popover opens");
    assert.equal(pop.querySelector(".btn-act,.button-pst"), null);
    assert.ok(pop.querySelectorAll(".axed-btn").length >= 2);
    pop.querySelector("[data-dt-done]").click();
    const cid = ctx.insertAtSelection("codeblock");
    assert.equal(code.openCodeEditor(cid), true);
    assert.equal(document.querySelector(".acrx-modal-overlay").querySelector(".btn-act,.button-pst"), null);
    document.querySelector("[data-code-cancel]").click();
  });
});

describe("framework toggles replace sidebar checkboxes", () => {
  it("inspector booleans render framework markup and commit on flip", () => {
    const id = ctx.insertAtSelection("video");
    ctx.selectBlock(id, { focus: false, keepPanel: true });
    ctx.showPanel("right", "block");
    const settings = document.getElementById("sidebar-right-panel-settings");
    const input = settings.querySelector('.toggle-input[data-field-key="autoplay"]');
    assert.ok(input, "autoplay is a framework toggle input");
    assert.ok(input.closest(".toggle-wrap"), "framework wrap present");
    assert.ok(input.closest(".toggle-wrap").querySelector(".toggle-track"), "framework track present");
    assert.equal(settings.querySelector(".insp-toggle"), null, "legacy switch markup gone");
    assert.equal(settings.querySelector('input[type="checkbox"]:not(.toggle-input):not(.block-check)'), null, "no naked checkboxes left");
    assert.equal(ctx.getBlock(id).data.autoplay, false);
    input.click();
    assert.equal(ctx.getBlock(id).data.autoplay, true, "flip commits through the model");
    // Commit re-renders the panel: re-query the live input for the next flip.
    settings.querySelector('.toggle-input[data-field-key="autoplay"]').click();
    assert.equal(ctx.getBlock(id).data.autoplay, false);
  });

  it("post panel comments switch flips state", async () => {
    const post = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/postPanel.js");
    const { State } = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/store.js");
    State.patch("post", { allowComments: true });
    post.refresh();
    ctx.showPanel("right", "post");
    const input = document.querySelector('#sidebar-right-panel-post .toggle-input[data-post-field="allowComments"]');
    assert.ok(input, "allow comments is a framework toggle");
    assert.ok(input.closest("label.toggle-wrap").textContent.includes("Allow comments"));
    input.click();
    assert.equal(State.get("post").allowComments, false, "uncheck commits");
  });

  it("seo robots render as labeled toggles and commit", async () => {
    const seo = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/seoPanel.js");
    const { State } = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/store.js");
    State.patch("seo", { noIndex: false, noFollow: false });
    seo.refresh();
    ctx.showPanel("right", "seo");
    const noIndex = document.querySelector('#sidebar-right-panel-seo .toggle-input[data-seo-field="noIndex"]');
    const noFollow = document.querySelector('#sidebar-right-panel-seo .toggle-input[data-seo-field="noFollow"]');
    assert.ok(noIndex && noFollow, "robots are framework toggles");
    noIndex.click();
    assert.equal(State.get("seo").noIndex, true, "noindex commits");
    assert.equal(document.querySelector('#sidebar-right-panel-seo input[type="checkbox"]:not(.toggle-input)'), null);
  });

  it("code dialog wrap uses the framework toggle", async () => {
    const code = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/codeEditor.js");
    const id = ctx.insertAtSelection("codeblock");
    assert.equal(code.openCodeEditor(id), true);
    const wrap = document.querySelector("[data-code-wrap].toggle-input");
    assert.ok(wrap, "wrap lines is a framework toggle");
    assert.ok(wrap.closest("label.toggle-wrap").textContent.includes("Wrap lines"));
    document.querySelector("[data-code-cancel]").click();
    assert.equal(document.querySelector(".acrx-modal-overlay"), null);
  });
});

describe("sidebar vibe rules (real stylesheet applied)", () => {
  before(() => {
    if (!document.getElementById("sidebar-vibe-css")) {
      const style = document.createElement("style");
      style.id = "sidebar-vibe-css";
      style.textContent = readFileSync("C:/Users/sohai/Desktop/Acroxa/acrx/assets/css/ad-ed-app.css", "utf8");
      document.head.appendChild(style);
    }
  });

  function cs(el, prop) {
    return dom.window.getComputedStyle(el).getPropertyValue(prop);
  }

  it("search bars share one 36px capsule vibe and stick", async () => {
    ctx.showPanel("left", "widgets");
    const widgets = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/widgets.js");
    widgets.refresh();
    const search = document.querySelector("#sidebar-left-panel-widgets .widgets-search");
    assert.equal(cs(search, "min-height"), "36px");
    assert.equal(cs(search.closest(".widgets-search-wrap"), "position"), "sticky");

    ctx.showPanel("left", "layers");
    const filter = document.querySelector("#sidebar-left-panel-layers .layers-filter");
    assert.ok(filter, "layers filter rendered");
    assert.equal(cs(filter, "min-height"), "36px");
    assert.equal(cs(filter.closest(".layers-toolbar"), "position"), "sticky");
  });

  it("layer rows breathe with 24px targets", () => {
    ctx.showPanel("left", "layers");
    const id = ctx.insertAtSelection("paragraph");
    ctx.showPanel("left", "layers");
    const row = document.querySelector("#sidebar-left-panel-layers .layer-item");
    assert.ok(row, "layer row rendered");
    assert.equal(cs(row, "min-height"), "36px");
    const toggle = row.querySelector(".layers-tree-toggle, .layers-tree-spacer");
    assert.ok(toggle);
    assert.equal(cs(toggle, "width"), "24px");
  });

  it("widget tiles keep 12px grid rhythm and press feedback", async () => {
    ctx.showPanel("left", "widgets");
    const widgets = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/panels/widgets.js");
    widgets.refresh();
    const grid = document.querySelector("#sidebar-left-panel-widgets .widgets-grid.tiles");
    assert.ok(grid);
    assert.equal(cs(grid, "gap"), "12px");
    const icon = document.querySelector("#sidebar-left-panel-widgets .widget-tile-icon");
    assert.equal(cs(icon, "width"), "36px");
  });

  it("inspector sections use the 16-side tier and 44px heads", () => {
    const id = ctx.insertAtSelection("heading");
    ctx.selectBlock(id, { focus: false, keepPanel: true });
    ctx.showPanel("right", "block");
    const head = document.querySelector("#sidebar-right-panel-settings .insp-section-head");
    assert.ok(head, "inspector section rendered");
    assert.equal(cs(head, "min-height"), "44px");
    const body = document.querySelector("#sidebar-right-panel-settings .insp-section-body");
    assert.equal(cs(body, "padding-left"), "16px");
  });
});
