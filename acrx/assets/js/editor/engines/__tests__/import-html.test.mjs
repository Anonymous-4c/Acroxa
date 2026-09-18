import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { htmlToNodes, nodesToMarkdown } from "../import-export-engine.js";
import { sanitizeHTML } from "../clipboard-engine.js";

// P0-04: pasting from the web must preserve headings, marks, links, lists
// and tables — never silently shred to plain text. Unknown structure unwraps
// to its words; scripts/handlers/unsafe URLs never survive (P1-15).

function plainOf(node) {
  return (node.data.content || []).filter((n) => n?.type === "text").map((n) => n.text || "").join("");
}

function marksOf(node, snippet) {
  const hit = (node.data.content || []).find((n) => (n.text || "").includes(snippet));
  return hit ? hit.marks : null;
}

describe("P0-04 HTML import fidelity", () => {
  it("imports a Wikipedia-style section with marks, links, lists, tables", () => {
    const nodes = htmlToNodes(
      `<h2>History</h2>` +
      `<p>The <b>quick</b> brown <i>fox</i> jumps over the <a href="https://example.com/dog">lazy dog</a>.</p>` +
      `<ul><li>First <b>item</b></li><li>Second item</li></ul>` +
      `<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>Beta</td></tr></table>`
    );
    const kinds = nodes.map((n) => n.type);
    assert.deepEqual(kinds, ["heading", "paragraph", "bulletList", "table"]);

    const [h, p, list, table] = nodes;
    assert.equal(h.data.level, 2);
    assert.ok(plainOf(h).includes("History"));
    assert.deepEqual(marksOf(p, "quick"), [{ type: "bold" }]);
    assert.deepEqual(marksOf(p, "fox"), [{ type: "italic" }]);
    assert.deepEqual(marksOf(p, "lazy dog"), [{ type: "link", attrs: { href: "https://example.com/dog" } }]);
    assert.deepEqual(list.data.items, ["First item", "Second item"]);
    assert.deepEqual(table.data.rows, [["Name", "Value"], ["Alpha", "Beta"]]);
    assert.equal(table.data.hasHeader, true);
  });

  it("maps s/strike/del to strikethrough, u to underline, code to code", () => {
    const nodes = htmlToNodes(`<p><s>gone</s> <del>away</del> <u>lined</u> <code>fn()</code></p>`);
    assert.equal(nodes.length, 1);
    assert.deepEqual(marksOf(nodes[0], "gone"), [{ type: "strikethrough" }]);
    assert.deepEqual(marksOf(nodes[0], "away"), [{ type: "strikethrough" }]);
    assert.deepEqual(marksOf(nodes[0], "lined"), [{ type: "underline" }]);
    assert.deepEqual(marksOf(nodes[0], "fn()"), [{ type: "code" }]);
  });

  it("keeps code fences literal with language detection", () => {
    const nodes = htmlToNodes(`<pre><code class="language-python">print(&quot;hi&quot;)</code></pre>`);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, "codeblock");
    assert.equal(nodes[0].data.language, "python");
    assert.ok(plainOf(nodes[0]).includes('print("hi")'));
  });

  it("unwraps div-soup into paragraphs without dropping words", () => {
    const nodes = htmlToNodes(`<div><div>Hello <b>brave</b> world</div><div>second <i>line</i> here</div></div>`);
    assert.ok(nodes.every((n) => n.type === "paragraph"));
    const all = nodes.map(plainOf).join(" ");
    for (const w of ["Hello", "brave", "world", "second", "line", "here"]) {
      assert.ok(all.includes(w), `dropped word: ${w}`);
    }
    assert.deepEqual(marksOf(nodes[0], "brave"), [{ type: "bold" }]);
  });

  it("flattens nested lists keeping every word", () => {
    const nodes = htmlToNodes(`<ul><li>outer <b>one</b><ul><li>inner two</li></ul></li><li>outer three</li></ul>`);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, "bulletList");
    const all = nodes[0].data.items.join(" ");
    for (const w of ["outer", "one", "inner", "two", "three"]) {
      assert.ok(all.includes(w), `dropped word: ${w}`);
    }
  });

  it("imports images, dividers, blockquotes", () => {
    const nodes = htmlToNodes(
      `<blockquote>Stay <b>hungry</b></blockquote><img src="https://cdn.co/a.png" alt="An image"><hr>`
    );
    assert.deepEqual(nodes.map((n) => n.type), ["blockquote", "image", "divider"]);
    assert.deepEqual(marksOf(nodes[0], "hungry"), [{ type: "bold" }]);
    assert.equal(nodes[1].data.src, "https://cdn.co/a.png");
    assert.equal(nodes[1].data.alt, "An image");
  });

  it("strips scripts, styles, handlers and unsafe URLs incl. entity-encoded (P1-15)", () => {
    assert.equal(/javascript:/i.test(sanitizeHTML(`<a href="javascript:evil()">x</a>`)), false);
    assert.equal(/javascript:/i.test(sanitizeHTML(`<a href="&#x6A;avascript:evil()">x</a>`)), false);
    assert.equal(/javascript:/i.test(sanitizeHTML(`<a href="java&#115;cript:evil()">x</a>`)), false);
    const nodes = htmlToNodes(
      `<p>Keep <a href="javascript:evil()">this</a> and <a href="https://ok.co/page">that</a>.</p>` +
      `<script>bad()</script><style>.x{}</style><p onclick="evil()">Fine</p>`
    );
    const all = nodes.map(plainOf).join(" ");
    for (const w of ["Keep", "this", "that", "Fine"]) assert.ok(all.includes(w), `dropped word: ${w}`);
    assert.ok(!all.includes("bad()"));
    const link = marksOf(nodes[0], "that");
    assert.deepEqual(link, [{ type: "link", attrs: { href: "https://ok.co/page" } }]);
    // The sanitized anchor degrades to plain text: no link mark at all.
    assert.deepEqual(marksOf(nodes[0], "this"), []);
  });

  it("handles empty input and bare text", () => {
    assert.deepEqual(htmlToNodes(""), []);
    assert.deepEqual(htmlToNodes("   "), []);
    const nodes = htmlToNodes("just words");
    assert.equal(nodes.length, 1);
    assert.equal(plainOf(nodes[0]), "just words");
  });

  it("imported nodes survive a Markdown round-trip", () => {
    const nodes = htmlToNodes(`<h1>Title</h1><p>Hello <b>world</b></p><ul><li>a</li></ul>`);
    const md = nodesToMarkdown(nodes);
    assert.ok(md.includes("# Title"));
    assert.ok(md.includes("Hello world"));
    assert.ok(md.includes("- a"));
  });
});
