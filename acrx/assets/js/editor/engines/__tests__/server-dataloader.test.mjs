import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import { JSDOM } from "jsdom";

// DataLoader + LayoutEngine post-rendering support: server derivation of
// html/raw/responsive CSS from blueprint json (never blank for missing
// stored fields), template-level title/content/meta keys, numeric read_time
// from real words, and head/body injection (responsive CSS + hydration).

const require = createRequire(import.meta.url);
const DataLoader = require("../../../../../../src/layouts/framework/dataLoader.js");

function loader() {
  // Pure methods only — never constructs (constructor needs a live DB).
  return Object.create(DataLoader.prototype);
}

function blueprint(paragraphs = ["Hello world"]) {
  const blocks = {};
  const order = paragraphs.map((text, i) => {
    const id = `b${i}`;
    blocks[id] = {
      id, type: "paragraph", content: [{ type: "text", text, marks: [] }],
      attrs: {}, styles: {}, responsive: {}, children: [], parent: "block_root", data: {},
    };
    return id;
  });
  return { version: 1, rootId: "block_root", blockOrder: order, blocks };
}

function fakePost(words = 20, extra = {}) {
  return {
    id: "p1", title: "Test Post", slug: "test-post", excerpt: "Excerpt here",
    content: { json: blueprint([Array(words).fill("word").join(" ")]), html: "", raw: "" },
    metaTitle: "MT", metaDescription: "MD", focusKeyword: "kw",
    canonicalUrl: "", ogTitle: "", ogDescription: "", ogImage: "",
    noIndex: false, noFollow: false,
    featuredImage: "https://cdn.co/i.png", publishDate: "2026-01-02T00:00:00.000Z",
    categories: [], author: { username: "Ann" },
    ...extra,
  };
}

describe("dataLoader blueprint derivation", () => {
  it("derives missing html/raw/responsive CSS from blueprint json", () => {
    const l = loader();
    const bp = blueprint(["Hello world"]);
    bp.blocks.b0.responsive = { mobile: { fontSize: "14px" }, tablet: {}, desktop: {} };
    const out = l._deriveContent({ content: { json: bp, html: "", raw: "" } });
    assert.ok(out.json, "json parsed");
    assert.ok(out.html.includes("Hello world"), "html derived");
    assert.equal(out.raw, "Hello world", "raw derived");
    assert.ok(out.responsiveCss.includes("@media (max-width: 767px)"), "responsive CSS derived");
    assert.ok(out.responsiveCss.includes(".wdg-b0"), "scoped to the stable block id");
  });

  it("stored html/raw win over derivation, corrupt json never throws", () => {
    const l = loader();
    const kept = l._deriveContent({
      content: { json: blueprint(["Fresh words"]), html: "<p>Stored</p>", raw: "Stored" },
    });
    assert.equal(kept.html, "<p>Stored</p>");
    assert.equal(kept.raw, "Stored");
    const bad = l._deriveContent({ content: { json: "{nope", html: "", raw: "" } });
    assert.deepEqual([bad.json, bad.html, bad.raw, bad.responsiveCss], [null, "", "", ""]);
    assert.deepEqual(l._deriveContent(null), { json: null, html: "", raw: "", responsiveCss: "" });
  });

  it("formats posts with derived content and word-based numeric read_time", () => {
    const l = loader();
    const short = l.formatPostForTemplate(fakePost(20));
    assert.ok(short.content.includes("word"), "content falls back to derivation");
    assert.equal(short.read_time, 1);
    assert.equal(short.author, "Ann");
    assert.ok(short.date.includes("2026"), "date formatted");
    assert.equal(short.url, "/post/test-post");
    assert.ok(short.editorJson && short.editorJson.blocks, "blueprint preserved");
    const long = l.formatPostForTemplate(fakePost(400));
    assert.equal(long.read_time, 2, "400 words => 2 min, tags never counted");
  });

  it("getPostData exposes template-level title/content/meta keys", async () => {
    const l = loader();
    l.getPostBySlug = async () => fakePost(30);
    const data = await l.getPostData("test-post");
    assert.equal(data.title, "Test Post");
    assert.ok(data.content.includes("word"), "template content key renders");
    assert.equal(data.meta.author, "Ann");
    assert.ok(data.meta.date.includes("2026"));
    assert.equal(data.meta.readTime, "1 min read");
    assert.ok(data.contentHtml.includes("word"));
    assert.ok(data.contentRaw.includes("word"));
    assert.equal(typeof data.editorResponsiveCss, "string");
    assert.equal(data.seo.metaTitle, "MT");
  });

  it("getPageData exposes template-level keys (pages rendered empty before)", async () => {
    const l = loader();
    l.getPageBySlug = async () => ({
      id: "pg1", title: "About", slug: "about",
      content: { json: blueprint(["About words here"]), html: "", raw: "" },
      featuredImage: "", template: "default", customCSS: "",
    });
    const data = await l.getPageData("about");
    assert.equal(data.title, "About", "template title key must exist");
    assert.ok(data.content.includes("About words here"), "template content key must render");
    assert.ok(data.contentHtml.includes("About words here"));
    assert.equal(data.page.template, "default");
  });
});

describe("layoutEngine head/body injection", () => {
  it("injects responsive CSS and the hydration runtime", () => {
    const LayoutEngine = require("../../../../../../src/layouts/framework/layoutEngine.js");
    const engine = Object.create(LayoutEngine.prototype);
    engine.meta = { name: "Test" };
    engine.acrx = { registered: { publicInject: [] } };
    engine.isolated = true;
    engine._isolatedAssets = [];
    const withCss = engine.buildHTML("<p>Hi</p>", {
      page_title: "T", site_title: "S", site_description: "",
      editorResponsiveCss: "@media (max-width: 767px){ .wdg-b0 { font-size: 14px } }",
    });
    assert.ok(withCss.includes('<style data-acroxa-responsive>@media (max-width: 767px)'), "head carries responsive CSS");
    assert.ok(withCss.includes("wdg-tab-btn"), "hydration runtime ships");
    assert.ok(withCss.includes("data-acrx-tabs"), "tabs init ships");
    const bare = engine.buildHTML("<p>Hi</p>", { page_title: "T", site_title: "S", site_description: "" });
    assert.ok(!bare.includes("data-acroxa-responsive"), "no CSS block when no overrides");
    assert.ok(bare.includes("wdg-tab-btn"), "hydration still ships (inert without tabs)");
  });

  it("hydration activates first tab and switches on click", () => {
    const LayoutEngine = require("../../../../../../src/layouts/framework/layoutEngine.js");
    const engine = Object.create(LayoutEngine.prototype);
    const tabs = `<div class="wdg-tabs"><div class="wdg-tab-buttons">` +
      `<button class="wdg-tab-btn" data-tab="t-0">One</button>` +
      `<button class="wdg-tab-btn" data-tab="t-1">Two</button></div>` +
      `<div class="wdg-tab-panels"><div class="wdg-tab-panel" data-panel="t-0">P1</div>` +
      `<div class="wdg-tab-panel" data-panel="t-1">P2</div></div></div>`;
    const page = engine.buildHTML(tabs, { page_title: "T", site_title: "S", site_description: "" });
    const open = page.indexOf("<script>(function ()");
    const src = page.slice(open + "<script>".length, page.indexOf("</script>", open));
    const d = new JSDOM(`<!DOCTYPE html><html><body>${tabs}</body></html>`);
    const sandbox = { document: d.window.document, window: d.window };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    const doc = d.window.document;
    const panel = (id) => doc.querySelector(`[data-panel="${id}"]`);
    const btn = (id) => doc.querySelector(`[data-tab="${id}"]`);
    assert.ok(!panel("t-0").hasAttribute("hidden"), "first panel visible after init");
    assert.ok(panel("t-1").hasAttribute("hidden"), "second panel hidden after init");
    assert.equal(btn("t-0").getAttribute("aria-selected"), "true");
    btn("t-1").dispatchEvent(new d.window.MouseEvent("click", { bubbles: true }));
    assert.ok(panel("t-1").hasAttribute("hidden") === false, "click reveals second panel");
    assert.ok(panel("t-0").hasAttribute("hidden"), "click hides first panel");
    assert.equal(btn("t-1").getAttribute("aria-selected"), "true");
  });
});
