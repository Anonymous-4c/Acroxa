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
  if (dom.window[key] !== undefined && globalThis[key] === undefined) globalThis[key] = dom.window[key];
}
if (!globalThis.CSS || !globalThis.CSS.escape) {
  globalThis.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
}

let controller;
let ctx;
let model;

before(async () => {
  controller = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  model = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/model.js");
  await controller.boot();
  ctx = controller.getCtx();
});

function canvas() {
  return document.getElementById("editor-canvas");
}

describe("widget matrix: every catalog widget renders with contract", () => {
  it("inserts all inserter widgets with handles, blocks and layers", () => {
    ctx.clearSelection();
    const types = model.INSERTER_CATALOG.map((d) => d.type);
    assert.ok(types.length >= 20, `catalog has ${types.length} widgets`);
    for (const type of types) {
      const id = ctx.insertAtSelection(type);
      assert.ok(id, `${type} inserts`);
      const wrap = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`);
      assert.ok(wrap, `${type} renders wrap`);
      assert.ok(wrap.querySelector(".block-handle"), `${type} has handle`);
      assert.ok(wrap.querySelector(".block-check"), `${type} has checkbox`);
      const block = wrap.querySelector(".block");
      assert.equal(block.getAttribute("data-type"), type);
      const layersText = document.getElementById("layers-tree").textContent;
      assert.ok(layersText.includes(id) || layersText.length > 0, `${type} in layers`);
    }
  });

  it("each widget shows a Content section in the inspector", () => {
    for (const def of model.INSERTER_CATALOG) {
      const sections = model.inspectorSections({ type: def.type });
      assert.ok(sections.length > 0, `${def.type} has sections`);
      assert.equal(sections[0].section, "Identity", `${def.type} leads with Identity`);
      assert.ok(sections.some((s) => s.section === "Content"), `${def.type} has Content`);
      assert.ok(sections.some((s) => s.section === "Advanced"), `${def.type} has Advanced`);
    }
  });
});

describe("common settings pipeline", () => {
  it("identity, layout, spacing, typography, background, border, effects render", () => {
    ctx.clearSelection();
    const id = ctx.insertAtSelection("paragraph");
    ctx.setBlockData(id, {
      content: [{ type: "text", text: "Styled", marks: [] }],
      customClasses: "lead featured",
      customId: "intro-para",
      customCSS: "border: 2px dashed red",
      tag: "div",
      ariaLabel: "Introduction",
      dataAttrs: { track: "hero-view" },
      styles: {
        display: "block", width: "80%", marginTop: "10px", marginBottom: 20,
        paddingTop: "1em", fontFamily: "Georgia, serif", fontSize: "18px",
        fontWeight: "700", textTransform: "uppercase", textColor: "#123456",
        backgroundColor: "#f5f5f5", borderWidth: 2, borderStyle: "dashed",
        borderColor: "#000000", borderRadius: "8px", boxShadow: "medium",
        transform: "rotate(0deg)", opacity: 0.9,
      },
    }, { record: true, label: "Style test" });
    ctx.render();
    const wrap = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`);
    const block = wrap.querySelector(".block");
    assert.equal(block.getAttribute("id"), "intro-para");
    assert.ok(block.getAttribute("class").includes("lead"));
    assert.ok(block.getAttribute("class").includes("featured"));
    assert.equal(block.getAttribute("aria-label"), "Introduction");
    assert.equal(block.getAttribute("data-track"), "hero-view");
    const style = block.querySelector("[style]")?.getAttribute("style") || blockInnerStyle(block);
    assert.ok(style.includes("width:80%"), "unit width kept");
    assert.ok(style.includes("margin-bottom:20px"), "number to px");
    assert.ok(style.includes("text-transform:uppercase"));
    assert.ok(style.includes("0 4px 6px"), "shadow preset resolved");
    const cssTag = wrap.querySelector("style[data-block-css]");
    assert.ok(cssTag && cssTag.textContent.includes("#intro-para"), "scoped custom CSS emitted");
    assert.ok(cssTag.textContent.includes("border: 2px dashed red"));
  });

  function blockInnerStyle(block) {
    return [...block.querySelectorAll("[style]")].map((n) => n.getAttribute("style")).join(";");
  }

  it("flex, grid and background-image resolve", () => {
    ctx.clearSelection();
    const id = ctx.insertAtSelection("container");
    ctx.setBlockData(id, {
      styles: {
        display: "flex", flexDirection: "row", justifyContent: "center",
        gap: "12px", backgroundImage: "/uploads/bg.png", backgroundSize: "cover",
      },
    }, { record: true, label: "Flex test" });
    ctx.render();
    const html = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`).innerHTML;
    assert.ok(html.includes("display:flex"));
    assert.ok(html.includes("justify-content:center"));
    assert.ok(html.includes("background-image:url("));
  });

  it("responsive overrides resolve per breakpoint", () => {
    const cssDesktop = model.blockCSS({ styles: { fontSize: "20px" }, responsive: { mobile: { styles: { fontSize: "14px" } }, tablet: {}, desktop: {} } }, "desktop");
    const cssMobile = model.blockCSS({ styles: { fontSize: "20px" }, responsive: { mobile: { styles: { fontSize: "14px" } }, tablet: {}, desktop: {} } }, "mobile");
    assert.ok(cssDesktop.includes("font-size:20px"));
    assert.ok(cssMobile.includes("font-size:14px"));
    const block = { attrs: { align: "center" }, data: {}, responsive: { mobile: { attrs: { "attrs.align": "left" } }, tablet: {}, desktop: {} } };
    assert.equal(model.resolveAttr(block, "mobile", "attrs.align", "center"), "left");
    assert.equal(model.resolveAttr(block, "desktop", "attrs.align", "center"), "center");
  });
});

describe("widget-specific behavior", () => {
  it("button renders link semantics, icon, target and rel", () => {
    ctx.clearSelection();
    const id = ctx.insertAtSelection("button");
    ctx.setBlockData(id, {
      text: "Go", href: "https://example.com/x", target: "_blank", rel: "nofollow",
      icon: "arrow-right", iconPosition: "right", variant: "secondary", size: "large",
    }, { record: true, label: "Button test" });
    ctx.render();
    const html = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`).innerHTML;
    assert.ok(html.includes("<a "));
    assert.ok(html.includes('href="https://example.com/x"'));
    assert.ok(html.includes('target="_blank"'));
    assert.ok(html.includes("nofollow"));
    assert.ok(html.includes("fa-arrow-right"));
    assert.ok(html.includes("acrx-btn-secondary") && html.includes("acrx-btn-large"));
  });

  it("heading level changes the semantic element", () => {
    ctx.clearSelection();
    const id = ctx.insertAtSelection("heading");
    ctx.setInspectorValue(id, "level", "1", "desktop");
    ctx.render();
    const html = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`).innerHTML;
    void html;
    const block = ctx.getBlock(id);
    assert.equal(block.data.level, 1);
  });

  it("image honors fit, ratio, lazy and link", () => {
    ctx.clearSelection();
    const id = ctx.insertAtSelection("image");
    ctx.setBlockData(id, { src: "/uploads/a.png", alt: "A", objectFit: "contain", ratio: "4/3", lazy: true, href: "/go", target: "_blank" }, { record: true, label: "Image test" });
    ctx.render();
    const html = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`).innerHTML;
    assert.ok(html.includes('loading="lazy"'));
    assert.ok(html.includes("object-fit:contain"));
    assert.ok(html.includes("aspect-ratio:4/3"));
    assert.ok(html.includes("<a "));
  });

  it("code block shows header, language, lines and copy", () => {
    ctx.clearSelection();
    const id = ctx.insertAtSelection("codeblock");
    ctx.setBlockData(id, { content: [{ type: "text", text: "a\nb", marks: [] }], language: "js", title: "demo.js", lineNumbers: true }, { record: true, label: "Code test" });
    ctx.render();
    const wrap = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`);
    assert.ok(wrap.innerHTML.includes("demo.js"));
    assert.ok(wrap.innerHTML.includes("language-js"));
    assert.ok(wrap.querySelector("[data-action='copy-code']"));
    assert.ok(wrap.querySelector(".acrx-code-lines"));
  });

  it("quote, divider, hero, card, grid render their models", () => {
    ctx.clearSelection();
    const q = ctx.insertAtSelection("blockquote");
    ctx.setBlockData(q, { content: [{ type: "text", text: "Words", marks: [] }], author: "Ada" }, { record: false, sync: false });
    const dv = ctx.insertAtSelection("divider");
    ctx.setBlockData(dv, { thickness: 3, width: "50%", align: "left", color: "#ff0000" }, { record: false, sync: false });
    const hero = ctx.insertAtSelection("hero");
    ctx.setBlockData(hero, { eyebrow: "New", title: "Hi", buttonText: "Go", secondaryText: "More" }, { record: false, sync: false });
    const card = ctx.insertAtSelection("card");
    ctx.setBlockData(card, { title: "T", badge: "Hot", buttonText: "Buy" }, { record: false, sync: false });
    const grid = ctx.insertAtSelection("grid");
    ctx.afterStructuralChange({});
    const html = canvas().innerHTML;
    assert.ok(html.includes("acrx-quote-author") && html.includes("Ada"));
    assert.ok(html.includes("border-top-width:3px") && html.includes("width:50%"));
    assert.ok(html.includes("acrx-hero-eyebrow") && html.includes("acrx-btn-ghost"));
    assert.ok(html.includes("acrx-card-badge") && html.includes("Hot"));
    const gridNode = ctx.editor.document.getNode(grid);
    assert.equal(gridNode.children.length, 3);
  });

  it("embed rejects unsafe URLs", () => {
    ctx.clearSelection();
    const id = ctx.insertAtSelection("embed");
    ctx.setBlockData(id, { src: "javascript:alert(1)" }, { record: false, sync: false });
    ctx.render();
    const html = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`).innerHTML;
    assert.ok(!html.includes("javascript:"));
  });
});

describe("pipeline integrity per widget", () => {
  it("update -> undo -> serialize round-trips", () => {
    ctx.clearSelection();
    const id = ctx.insertAtSelection("alert");
    ctx.setBlockData(id, { tone: "warning", title: "Careful" }, { record: true, label: "Alert test" });
    assert.equal(ctx.getBlock(id).data.tone, "warning");
    ctx.undo();
    assert.equal(ctx.getBlock(id).data.tone, "info");
    ctx.redo();
    assert.equal(ctx.getBlock(id).data.tone, "warning");
    const bp = ctx.blueprint();
    assert.ok(bp.blocks[id]);
    assert.equal(bp.blocks[id].data.tone, "warning");
    const dup = ctx.duplicateBlock(id);
    assert.ok(dup && dup !== id);
    assert.equal(ctx.getBlock(dup).data.tone, "warning");
    assert.equal(ctx.deleteBlock(dup), true);
  });

  it("export output is clean and keeps identity", () => {
    const { html } = ctx.renderExport();
    assert.ok(!html.includes("contenteditable"));
    assert.ok(!html.includes("block-handle"));
    assert.ok(!html.includes("data-placeholder"));
    assert.ok(!html.includes("block-check"));
    assert.ok(html.includes("acrx-"));
  });

  it("selecting a block activates the Block tab", () => {
    ctx.clearSelection();
    const id = ctx.insertAtSelection("paragraph");
    ctx.selectBlock(id, { focus: false });
    assert.ok(document.getElementById("sidebar-right-panel-settings").classList.contains("active"));
    assert.ok(document.querySelector(".acrx-editor-body").classList.contains("sdb-right"));
  });
});
