import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../document-engine.js";
import { createLayoutEngine, normalizeLayout, layoutToCSSProperties, createRow } from "../layout-engine.js";
import { createStyleEngine, normalizeColor, normalizeLength, mergeStyles, styleToCSS } from "../style-engine.js";
import { createResponsiveEngine, breakpointForWidth, resolveValue, resolveTree } from "../responsive-engine.js";
import { createWidgetRendererRegistry } from "../widget-renderer-registry.js";
import { createRenderer, el } from "../renderer-engine.js";
import { createPreviewEngine } from "../preview-engine.js";

function sampleDoc() {
  const doc = createDocument({ id: "d" });
  doc.insertNode(doc.rootId, {
    id: "hero", type: "hero", data: { text: "Welcome", style: { textColor: "#fff", backgroundColor: "#123456" }, layout: { display: "stack" } },
  });
  doc.insertNode(doc.rootId, {
    id: "cols", type: "columns", data: { layout: { display: "grid", columns: 2, gap: 16 } },
  });
  doc.insertNode("cols", { id: "c1", type: "column", data: { content: [{ type: "text", text: "Left", marks: [{ type: "bold" }] }] } });
  doc.insertNode("cols", { id: "img1", type: "image", data: { src: "a.png", alt: "A" } });
  return doc;
}

describe("layout engine", () => {
  it("normalizes, validates and converts layouts", () => {
    const l = createLayoutEngine();
    assert.deepEqual(normalizeLayout({}).display, "stack");
    assert.deepEqual(normalizeLayout({ display: "grid" }).columns, 2);
    assert.equal(l.validate({ display: "nope" }).valid, false);
    assert.equal(l.validate(normalizeLayout({ display: "row", gap: 8 })).valid, true);
    const css = layoutToCSSProperties({ display: "grid", columns: 3, gap: 10 });
    assert.equal(css.display, "grid");
    assert.equal(css["grid-template-columns"], "repeat(3, minmax(0, 1fr))");
    const row = createRow(3);
    assert.equal(row.columns.length, 3);
    assert.throws(() => createRow(0), /positive integer/);
  });
});

describe("style engine", () => {
  it("keeps semantic data canonical and derives CSS", () => {
    assert.equal(normalizeColor("#f00"), "#ff0000");
    assert.equal(normalizeColor("nope"), null);
    assert.equal(normalizeLength(8), "8px");
    assert.equal(normalizeLength("2em"), "2em");
    assert.equal(normalizeLength("junk"), null);
    const merged = mergeStyles({ textColor: "#000000", fontSize: "12px" }, { textColor: "#ffffff" });
    assert.deepEqual(merged, { textColor: "#ffffff", "fontSize": "12px" });
    const css = styleToCSS({ textColor: "#fff", bogusProp: 1, opacity: 2 });
    assert.ok(css.includes("color:#ffffff"));
    assert.ok(!css.includes("bogus"));
    assert.ok(css.includes("opacity:1"));
    const st = createStyleEngine();
    assert.equal(st.validate({ textColor: "red!" }).errors[0].code, "BAD_COLOR");
    assert.equal(st.validate({}).valid, true);
  });
});

describe("responsive engine", () => {
  it("resolves breakpoints with fallback inheritance", () => {
    assert.equal(breakpointForWidth(390), "mobile");
    assert.equal(breakpointForWidth(800), "tablet");
    assert.equal(breakpointForWidth(1400), "desktop");
    assert.equal(resolveValue({ base: "a", desktop: "d" }, "mobile"), "a");
    assert.equal(resolveValue({ base: "a", mobile: "m" }, "tablet"), "m");
    assert.equal(resolveValue({ base: "a", desktop: "d" }, "desktop"), "d");
    assert.equal(resolveValue("plain", "mobile"), "plain");
    const r = createResponsiveEngine();
    assert.deepEqual(resolveTree({ color: { base: "red", mobile: "blue" } }, "mobile"), { color: "blue" });
    assert.equal(r.validate({ base: 1, phone: 1 }).errors[0].code, "UNKNOWN_BREAKPOINT");
    assert.throws(() => resolveValue({}, "watch"), /Unknown breakpoint/);
  });
});

describe("renderer registry + renderer", () => {
  it("builds framework-compatible HTML strings", () => {
    assert.equal(el("p", { class: "x" }, "Hi"), "<p class=\"x\">Hi</p>");
    assert.equal(el("img", { src: "a.png", alt: "" }), "<img src=\"a.png\" alt=\"\" />");
    assert.equal(el("div", { dataBlockId: "n1", ariaLabel: "x" }, "t"), "<div data-block-id=\"n1\" aria-label=\"x\">t</div>");
    const reg = createWidgetRendererRegistry();
    reg.register("hero", (node, ctx) => ctx.h("section", { class: "hero" }, ctx.h("h1", {}, node.data.text)));
    reg.setFallback((node, ctx) => ctx.defaultRender(node, {}));
    assert.equal(reg.resolve("hero").version, "1.0.0");
    assert.equal(reg.resolve("unknown").label, "fallback");
    assert.equal(reg.list().length, 1);
    const renderer = createRenderer({ registry: reg });
    const doc = sampleDoc();
    const html = renderer.renderDocument(doc, { mode: "export" });
    assert.ok(html.includes("<section"));
    assert.ok(html.includes("<strong>Left</strong>"));
    assert.ok(!html.includes("data-block-id")); // export omits editor attrs
    const editorHtml = renderer.renderDocument(doc);
    assert.ok(editorHtml.includes('data-block-id="cols"')); // editor mode marks default-rendered blocks
    assert.equal(renderer.blockIdFromDomId("block-abc"), "abc");
    assert.equal(renderer.domIdFor("abc"), "block-abc");
    assert.throws(() => renderer.renderNode({}), /id and type/);
    const strict = createRenderer({ registry: createWidgetRendererRegistry() });
    assert.throws(() => strict.renderNode({ id: "x", type: "mystery" }), /No renderer/);
  });
});

describe("preview engine", () => {
  it("renders isolated previews without touching the source", () => {
    const renderer = createRenderer({});
    const preview = createPreviewEngine({ renderer });
    const doc = sampleDoc();
    const before = JSON.stringify(doc.toJSON());
    const p = preview.previewDocument(doc, { device: "mobile" });
    assert.equal(p.device, "mobile");
    assert.equal(p.breakpoint, "mobile");
    assert.equal(p.width, 390);
    assert.ok(p.html.includes("Welcome"));
    assert.equal(JSON.stringify(doc.toJSON()), before);
    const node = preview.previewNode(doc, "img1");
    assert.ok(node.html.includes("<img"));
    assert.equal(preview.deviceForWidth(500), "tablet");
    assert.throws(() => preview.previewNode(doc, "ghost"), /does not exist/);
  });
});
