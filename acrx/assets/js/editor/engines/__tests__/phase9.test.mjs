import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../document-engine.js";
import { createRenderer } from "../renderer-engine.js";
import { createPluginEngine } from "../plugin-engine.js";
import { createImportExportEngine, htmlToNodes, markdownToNodes, nodesToMarkdown } from "../import-export-engine.js";
import { createHtmlExportEngine, stripEditorArtifacts, minifyHtml } from "../html-export-engine.js";

function sampleDoc() {
  const doc = createDocument({ id: "d" });
  doc.insertNode(doc.rootId, { id: "h", type: "heading", data: { level: 2, text: "Hello" } });
  doc.insertNode(doc.rootId, { id: "p", type: "paragraph", data: { text: "World" } });
  return doc;
}

describe("plugin engine", () => {
  it("runs capability-gated lifecycles with cleanup", () => {
    const activated = [];
    const plugins = createPluginEngine({ host: { commands: { run: () => {} } } });
    plugins.register({ id: "base", name: "Base" });
    plugins.register({
      id: "seo-pack", name: "SEO Pack", version: "2.0.0",
      dependencies: ["base"], capabilities: ["commands"],
      activate: (api) => {
        assert.ok(api.commands); // gated surface present
        assert.equal(api.documents, undefined); // ungated surface absent
        activated.push(api.pluginId);
      },
    });
    assert.throws(() => plugins.activate("seo-pack"), (e) => e.code === "MISSING_DEPENDENCY");
    plugins.install("base");
    plugins.activate("base");
    plugins.install("seo-pack");
    plugins.grant("seo-pack", ["commands"]);
    assert.equal(plugins.can("seo-pack", "commands"), true);
    plugins.activate("seo-pack");
    assert.deepEqual(activated, ["seo-pack"]);
    plugins.contribute("seo-pack", "commands", [{ id: "seo.audit" }]);
    assert.equal(plugins.contributionsOf("seo-pack", "commands").length, 1);
    plugins.deactivate("seo-pack");
    assert.equal(plugins.contributionsOf("seo-pack", "commands").length, 0); // purged
    assert.equal(plugins.status("seo-pack").status, "inactive");
    assert.equal(plugins.list().length, 2);
    assert.equal(plugins.uninstall("seo-pack"), true);
    assert.throws(() => plugins.activate("ghost"), /not registered/);
    assert.throws(() => plugins.register({ name: "no-id" }), /non-empty string id/);
    plugins.register({ id: "bad", activate: () => { throw new Error("nope"); } });
    plugins.install("bad");
    assert.throws(() => plugins.activate("bad"), /failed to activate/);
    plugins.destroy();
  });
});

describe("import/export engine", () => {
  it("detects formats and converts pipelines", () => {
    const ie = createImportExportEngine({ renderer: createRenderer({}) });
    assert.equal(ie.detectFormat("<p>Hi</p>"), "html");
    assert.equal(ie.detectFormat("# Title\n\ntext"), "markdown");
    assert.equal(ie.detectFormat({ nodes: [], rootId: "r" }), "acroxa-json");
    assert.equal(ie.detectFormat('{"nodes":[],"rootId":"r"}'), "acroxa-json");
    assert.equal(ie.detectFormat(""), "unknown");
    const html = ie.importData("html", "<h1>Title</h1><p>Body<script>evil()</script></p><ul><li>a</li><li>b</li></ul><img src=\"a.png\" alt=\"A\">");
    assert.deepEqual(html.nodes.map((n) => n.type), ["heading", "paragraph", "bulletList", "image"]);
    // P0-04 contract: text blocks carry inline-model `content[]` (marks
    // included), not flat `text`.
    assert.deepEqual(html.nodes[1].data.content, [{ type: "text", text: "Body", marks: [] }]);
    const md = ie.importData("markdown", "# T\n\npara\n\n- x\n- y\n\n```\ncode\n```");
    assert.deepEqual(md.nodes.map((n) => n.type), ["heading", "paragraph", "bulletList", "codeblock"]);
    const rte = ie.importData("rte-doc", { type: "doc", content: [{ type: "paragraph", attrs: {}, content: [{ type: "text", text: "Hi", marks: [] }] }] });
    assert.equal(rte.nodes[0].data.text, "Hi");
    assert.equal(ie.importData("auto", "# Auto").format, "markdown");
    assert.throws(() => ie.importData("pdf", "x"), /No importer/);
    assert.equal(ie.exportData("markdown", [{ type: "heading", data: { level: 1, text: "T" } }]), "# T");
    assert.ok(ie.exportData("text", [{ type: "paragraph", data: { text: "a" } }]).includes("a"));
    const json = ie.exportData("acroxa-json", [{ id: "n1", type: "paragraph", data: { text: "x" } }]);
    const back = ie.importData("acroxa-json", json);
    assert.equal(back.nodes[0].id, "n1");
    const htmlOut = ie.exportData("html", [{ id: "n1", type: "paragraph", data: { text: "x" } }]);
    assert.ok(htmlOut.includes("<p"));
    const noRenderer = createImportExportEngine();
    assert.throws(() => noRenderer.exportData("html", []), /requires a renderer/);
    assert.deepEqual(ie.formats().import.sort(), ["acroxa-json", "html", "markdown", "rte-doc"]);
  });

  it("parses markdown edge cases", () => {
    assert.deepEqual(markdownToNodes("")[0], undefined);
    assert.equal(markdownToNodes("> quote")[0].type, "blockquote");
    assert.equal(markdownToNodes("---")[0].type, "divider");
    assert.equal(nodesToMarkdown([{ type: "mystery", data: { text: "kept" } }]), "kept");
    assert.equal(htmlToNodes("<div><p>Nested</p></div>").length >= 1, true);
  });
});

describe("html export engine", () => {
  it("produces clean production HTML, never editor DOM", () => {
    const exporter = createHtmlExportEngine({ renderer: createRenderer({}) });
    const doc = sampleDoc();
    const fragment = exporter.exportDocument(doc, { fragment: true });
    assert.ok(!fragment.includes("data-block-id"));
    assert.ok(!fragment.includes("contenteditable"));
    assert.ok(fragment.includes("<h2"));
    const full = exporter.exportDocument(doc, { metadata: { title: "Page", description: "Desc", canonical: "https://a.co/p" } });
    assert.ok(full.startsWith("<!DOCTYPE html>"));
    assert.ok(full.includes("<title>Page</title>"));
    assert.ok(full.includes('rel="canonical"'));
    const min = exporter.exportDocument(doc, { minify: true });
    assert.equal(min.includes("\n"), false);
    const dirty = '<div class="block-wrap is-selected" data-block-id="x" contenteditable="true"><p data-placeholder="Type">Hi</p></div>';
    const clean = stripEditorArtifacts(dirty);
    assert.equal(/block-wrap|data-block-id|contenteditable|data-placeholder/.test(clean), false);
    assert.ok(clean.includes("<p>Hi</p>"));
    assert.equal(minifyHtml("  <p>  a   b  </p>  "), "<p> a b </p>");
    assert.throws(() => createHtmlExportEngine({}), /requires a renderer/);
  });
});
