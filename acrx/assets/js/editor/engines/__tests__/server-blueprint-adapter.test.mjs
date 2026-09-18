import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

// P0-05: the server renderer must read the blueprint documents the client
// saves (1.3 repro: renderDocument => "" and extractText => ""). The adapter
// translates blueprint -> legacy nodes up front, so preview, derivation and
// every layout template render real content. P0-06 guards the JSON preview
// contract on both ends.

const require = createRequire(import.meta.url);
const widgetRenderer = require("../../../../../../src/layouts/framework/widgetRenderer.js");
const { renderDocument, extractTextFromDocument } = widgetRenderer;

function tx(text, marks = []) {
  return { type: "text", text, marks };
}

function block(id, type, extra = {}) {
  return {
    id, type,
    content: [], attrs: {}, styles: {}, responsive: {},
    children: [], parent: "block_root",
    locked: false, hidden: false, customClasses: "", customId: "",
    customCSS: "", tag: "", ariaLabel: "", dataAttrs: {}, customAttributes: {},
    data: {},
    ...extra,
  };
}

function docOf(blocks) {
  const map = {};
  for (const b of blocks) map[b.id] = b;
  return { version: 1, rootId: "block_root", blockOrder: blocks.map((b) => b.id), blocks: map };
}

describe("P0-05 blueprint adapter (1.3 repro)", () => {
  it("renders a blueprint paragraph with marks and links", () => {
    const doc = docOf([block("block_a", "paragraph", {
      content: [
        tx("Hello "),
        tx("bold", [{ type: "bold" }]),
        tx(" "),
        tx("link", [{ type: "link", attrs: { href: "https://example.com/x" } }]),
      ],
    })]);
    const html = renderDocument(doc);
    assert.ok(html.includes("Hello"), "words must render");
    assert.ok(html.includes("<strong>bold</strong>"), "marks must render");
    assert.ok(html.includes('<a href="https://example.com/x">link</a>'), "hrefs must render");
    assert.equal(extractTextFromDocument(doc), "Hello bold link");
  });

  it("renders headings, quotes, code, lists, tables, media", () => {
    const doc = docOf([
      block("h", "heading", { content: [tx("Head ", [{ type: "italic" }])], data: { level: 3 } }),
      block("q", "blockquote", { content: [tx("Quoted")], data: { author: "Author Name" } }),
      block("c", "codeblock", { content: [tx("const x = 1;")], data: { language: "js" } }),
      block("l", "bulletList", { data: { items: ["one", "two"] } }),
      block("t", "table", { data: { rows: [["Name", "Val"], ["a", "b"]], hasHeader: true } }),
      block("i", "image", { data: { src: "https://cdn.co/a.png", alt: "Alt text", caption: "Cap words" } }),
      block("b", "button", { data: { text: "Click me", href: "/go" } }),
      block("d", "divider", {}),
    ]);
    const html = renderDocument(doc);
    for (const w of ["Head", "Quoted", "Author Name", "const x = 1", "one", "two", "Name", "Val", "Click me", "Alt text", "Cap words"]) {
      assert.ok(html.includes(w), `missing word: ${w}`);
    }
    assert.ok(html.includes("<h3"), "heading level must map");
    assert.ok(html.includes("<em>Head"), "heading marks must not arrive as tag soup");
    assert.ok(html.includes("<thead>"), "header row must promote to thead");
    assert.ok(html.includes('alt="Alt text"'), "alt must map");
    assert.ok(html.includes('href="/go"'), "button href must map");
    const text = extractTextFromDocument(doc);
    for (const w of ["Head", "Quoted", "one", "Click me", "Cap words"]) {
      assert.ok(text.includes(w), `extract missing: ${w}`);
    }
  });

  it("renders widgets, nesting, fallbacks and responsive CSS", () => {
    const col = block("col1", "column", { children: ["nest"] });
    const doc = docOf([
      block("hero", "hero", { data: { eyebrow: "Brow words", title: "Hero Title", subtitle: "Sub words", buttonText: "Start", buttonUrl: "/s", secondaryText: "More", secondaryUrl: "/m" } }),
      block("cta", "cta", { data: { title: "CTA Title", description: "CTA Desc", buttonText: "Go" } }),
      block("card", "card", { data: { title: "Card Title", description: "Card Desc", badge: "New", buttonText: "Open", buttonUrl: "/o" } }),
      block("faq", "faq", { data: { items: [{ q: "Why?", a: "Because." }] } }),
      block("acc", "accordion", { data: { items: [{ q: "Sec?", a: "Content." }] } }),
      block("tabs", "tabs", { data: { tabs: [{ label: "Tab One", content: "Panel words" }] } }),
      block("pr", "pricing", { data: { plans: [{ name: "Starter", price: "$9", period: "/mo", description: "Plan desc", features: ["Feat one"], ctaText: "Choose" }] } }),
      block("al", "alert", { content: [tx("Alert words")], data: { title: "Note", tone: "warning" } }),
      block("lk", "link", { content: [tx("Link words")], data: { href: "https://l.co" } }),
      block("tm", "testimonial", { content: [tx("Great product")], data: { author: "Jane" } }),
      block("st", "stats", { data: { stats: [{ value: "99%", label: "Uptime" }] } }),
      block("tl", "timeline", { data: { events: [{ date: "2026", title: "Launch", text: "Shipped" }] } }),
      block("ft", "features", { data: { features: [{ title: "Fast", text: "Very fast" }] } }),
      block("em", "embed", { data: { src: "https://v.co/e" } }),
      { ...block("cols", "columns", { children: ["col1"] }), },
      col,
      block("nest", "paragraph", { content: [tx("Nested words")], parent: "col1" }),
      block("un", "unresolved", { data: { originalType: "mystery" } }),
      block("xx", "fancy-future-type", { content: [tx("Future words")] }),
      block("rsp", "paragraph", {
        content: [tx("Responsive words")],
        styles: {},
        responsive: { mobile: { fontSize: "14px" }, tablet: {}, desktop: {} },
      }),
    ]);
    // fix column parent link for realism
    doc.blocks.nest.parent = "col1";
    const html = renderDocument(doc);
    for (const w of ["Brow words", "Hero Title", "Sub words", "Start", "More", "CTA Title", "CTA Desc",
      "Card Title", "Card Desc", "New", "Open", "Why?", "Because.", "Sec?", "Tab One", "Panel words",
      "Starter", "$9", "/mo", "Plan desc", "Feat one", "Choose", "Alert words", "Note",
      "Link words", "Great product", "Jane", "99%", "Uptime", "2026", "Launch", "Shipped",
      "Fast", "Very fast", "Nested words", "Future words", "Responsive words"]) {
      assert.ok(html.includes(w), `missing word: ${w}`);
    }
    assert.ok(html.includes("data-acroxa-responsive"), "responsive overrides must ship CSS");
    assert.ok(html.includes("@media (max-width: 767px)"), "mobile media query must ship");
    assert.ok(html.includes(".wdg-rsp"), "responsive CSS must key on the stable block id");
    const text = extractTextFromDocument(doc);
    for (const w of ["Hero Title", "Why?", "Starter", "Great product", "Nested words", "Future words"]) {
      assert.ok(text.includes(w), `extract missing: ${w}`);
    }
  });

  it("keeps legacy shapes rendering (no regressions)", () => {
    const legacy = { type: "doc", content: [{ id: "a", type: "paragraph", attributes: { content: "Legacy words" }, style: {}, children: [] }] };
    assert.ok(renderDocument(legacy).includes("Legacy words"));
    assert.ok(renderDocument([{ id: "a", type: "paragraph", attributes: { content: "Array words" }, style: {}, children: [] }]).includes("Array words"));
    assert.equal(extractTextFromDocument(legacy), "Legacy words");
    assert.equal(renderDocument(""), "");
    assert.equal(extractTextFromDocument(null), "");
  });
});

describe("P0-06 preview JSON contract (static guards)", () => {
  const ctrlPath = path.join(process.cwd(), "src", "controllers", "cmsController.js");
  const appPath = path.join(process.cwd(), "acrx", "assets", "js", "editor", "app", "core", "controller.js");
  const ctrl = fs.readFileSync(ctrlPath, "utf8");
  const app = fs.readFileSync(appPath, "utf8");

  it("server preview answers JSON { html }, never text/html", () => {
    assert.ok(ctrl.includes("res.json({ success: true, html })"), "preview must send JSON { html }");
    assert.ok(!ctrl.includes('res.setHeader("Content-Type", "text/html; charset=utf-8")'), "no text/html preview body");
  });

  it("client preview posts full context and reads JSON", () => {
    const i = app.indexOf("openPreview()");
    assert.ok(i !== -1);
    const blk = app.slice(i, app.indexOf("showPanel(side, panelName)", i));
    assert.ok(blk.includes("postType"), "must send postType");
    assert.ok(blk.includes("meta: payload.meta"), "must send meta");
    assert.ok(blk.includes("seo: payload.seo"), "must send seo");
    assert.ok(blk.includes("title: payload.title"), "must send title");
  });
});
