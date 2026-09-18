import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createRichTextEngine, textNode, normalizeContent, plainText, insertTextAt,
  deleteRange, applyMark, removeMark, marksAt, splitAt, toHTML, fromInlineHTML, toMarkdown,
} from "../rich-text-engine.js";
import { createClipboardEngine, sanitizeHTML, htmlToText } from "../clipboard-engine.js";
import {
  createTableEngine, createTable, getCell, setCell, insertRow, deleteRow,
  insertColumn, deleteColumn, mergeCells, splitCell, validateTable,
  cellRangeSelection, navigateCell,
} from "../table-engine.js";
import { createLinkEngine, classifyLink, normalizeUrl, validateLink, buildRel } from "../link-engine.js";
import { createAssetEngine, validateAsset } from "../asset-engine.js";
import { createMediaEngine, detectEmbed, buildSrcSet, validateMedia, normalizeMedia } from "../media-engine.js";

describe("rich text engine", () => {
  it("models inline content with char-offset operations", () => {
    let c = [textNode("Hello world")];
    c = applyMark(c, 0, 5, { type: "bold" });
    assert.equal(c.length, 2);
    assert.deepEqual(c[0].marks, [{ type: "bold" }]);
    assert.deepEqual(marksAt(c, 2).map((m) => m.type), ["bold"]);
    c = applyMark(c, 6, 11, { type: "link", attrs: { href: "https://a.co" } });
    assert.equal(toHTML(c), "<strong>Hello</strong> world".replace(" world", ' <a href="https://a.co">world</a>'));
    c = removeMark(c, 0, 5, "bold");
    assert.deepEqual(c[0].marks, []);
    c = insertTextAt(c, 5, " brave", []);
    assert.equal(plainText(c), "Hello brave world");
    c = deleteRange(c, 5, 11);
    assert.equal(plainText(c), "Hello world");
    const [head, tail] = splitAt(c, 5);
    assert.equal(plainText(head), "Hello");
    assert.equal(plainText(tail), " world");
    const rt = createRichTextEngine();
    assert.equal(rt.commands.bold([textNode("x")], { from: 0, to: 1 })[0].marks[0].type, "bold");
    assert.equal(rt.toMarkdown([textNode("x", [{ type: "bold" }])]), "**x**");
    const parsed = fromInlineHTML("<strong>Hi</strong> <a href=\"https://a.co\">there</a><br>yo");
    assert.equal(plainText(parsed), "Hi there\nyo");
    assert.deepEqual(normalizeContent([textNode("a", [{ type: "bold" }]), textNode("b", [{ type: "bold" }])]).length, 1);
  });
});

describe("clipboard engine", () => {
  it("round-trips internal data and sanitizes foreign HTML", () => {
    const cb = createClipboardEngine();
    const transfer = cb.copy([{ id: "a" }], "blocks");
    assert.ok(transfer["application/x-acroxa"]);
    const pasted = cb.paste(transfer);
    assert.equal(pasted.kind, "internal");
    assert.deepEqual(pasted.data, [{ id: "a" }]);
    assert.equal(cb.hasInternal(), true);
    const dirty = '<p onclick="evil()">Hi<script>alert(1)</script><a href="javascript:evil()">x</a><a href="https://ok.co">ok</a></p>';
    const clean = sanitizeHTML(dirty);
    assert.equal(/onclick|script|javascript:/.test(clean), false);
    assert.ok(clean.includes('href="https://ok.co"'));
    assert.equal(htmlToText("<h1>Title</h1><p>one<br>two</p>"), "Title\none\ntwo");
    const foreign = cb.paste({ "text/html": "<b>Bold</b><script>bad()</script>" });
    assert.equal(foreign.data.text, "Bold");
    assert.equal(cb.paste({ "text/plain": "plain" }).data, "plain");
    assert.throws(() => cb.paste({}), /No usable clipboard/);
    cb.clear();
    assert.equal(cb.hasInternal(), false);
  });
});

describe("table engine", () => {
  it("builds, reshapes, merges and validates grids", () => {
    const t = createTableEngine();
    let table = t.createTable(2, 3);
    assert.equal(table.rows, 2);
    assert.equal(table.cols, 3);
    table = setCell(table, 0, 0, { content: "A" });
    assert.equal(getCell(table, 0, 0).content, "A");
    table = insertRow(table, 1);
    assert.equal(table.rows, 3);
    table = deleteRow(table, 1);
    assert.equal(table.rows, 2);
    table = insertColumn(table, 0);
    assert.equal(table.cols, 4);
    table = deleteColumn(table, 0);
    assert.equal(table.cols, 3);
    table = mergeCells(table, 0, 0, 0, 1);
    assert.equal(getCell(table, 0, 0).colSpan, 2);
    assert.equal(getCell(table, 0, 1).covered, true);
    assert.throws(() => mergeCells(table, 0, 0, 1, 1), (e) => e.code === "OVERLAP");
    table = splitCell(table, 0, 1);
    assert.equal(getCell(table, 0, 0).colSpan, 1);
    assert.equal(validateTable(table).valid, true);
    assert.equal(validateTable({ cells: [[{ content: "x" }], []] }).valid, false);
    assert.deepEqual(cellRangeSelection(1, 1, 0, 0).length, 4);
    assert.deepEqual(navigateCell(table, 0, 2, "tab"), { row: 1, col: 0 });
    assert.deepEqual(navigateCell(table, 1, 0, "left"), { row: 1, col: 0 });
    assert.throws(() => createTable(0, 2), /at least 1/);
  });
});

describe("link engine", () => {
  it("classifies, normalizes, validates and builds links", () => {
    const links = createLinkEngine({ siteHost: "example.com" });
    assert.equal(classifyLink("https://example.com/x", { siteHost: "example.com" }).kind, "internal");
    assert.equal(classifyLink("https://other.co/").kind, "external");
    assert.equal(classifyLink("#top").kind, "anchor");
    assert.equal(classifyLink("/pricing").kind, "internal");
    assert.equal(classifyLink("javascript:evil()").kind, "unsafe");
    assert.equal(normalizeUrl("example.com/page"), "https://example.com/page");
    assert.equal(normalizeUrl(" /a ").trim(), "/a");
    const ext = links.create("https://other.co/", { text: "" });
    assert.equal(ext.target, "_blank");
    assert.ok(ext.rel.includes("noopener"));
    assert.equal(validateLink({ href: "" }).valid, false);
    assert.equal(validateLink({ href: "javascript:x" }).errors[0].code, "UNSAFE_PROTOCOL");
    assert.equal(validateLink({ href: "https://a.co", target: "_blank" }).warnings[0].code, "LINK_LABEL");
    assert.equal(buildRel({ target: "_blank", rel: "nofollow" }), "nofollow noopener noreferrer");
    assert.throws(() => links.create("::::"), /Cannot create link/);
  });
});

describe("asset engine", () => {
  it("tracks provider-agnostic asset references", () => {
    const assets = createAssetEngine();
    const img = assets.register({ url: "https://cdn.co/a.png", mime: "image/png", alt: "A" });
    assert.equal(img.kind, "image");
    assert.equal(assets.has(img.id), true);
    assert.deepEqual(assets.list("image").length, 1);
    assets.replace(img.id, { alt: "B" });
    assert.equal(assets.get(img.id).alt, "B");
    assert.equal(assets.findByUrl("https://cdn.co/a.png").id, img.id);
    assert.equal(validateAsset({ id: "x" }).valid, false);
    const json = assets.toJSON();
    const a2 = createAssetEngine();
    a2.fromJSON(json);
    assert.equal(a2.list().length, 1);
    assert.equal(assets.remove(img.id), true);
    assert.equal(assets.list().length, 0);
    assets.destroy();
    a2.destroy();
  });
});

describe("media engine", () => {
  it("normalizes media, detects embeds and builds responsive sets", () => {
    const media = createMediaEngine();
    const yt = detectEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(yt.provider, "youtube");
    assert.ok(yt.embedUrl.includes("embed"));
    assert.equal(detectEmbed("https://plain.co/v.mp4").provider, null);
    const img = normalizeMedia({ src: "a.jpg", mime: "image/jpeg" });
    assert.equal(img.kind, "image");
    assert.equal(img.renderer, "media.image");
    const emb = normalizeMedia({ src: "https://youtu.be/dQw4w9WgXcQ" });
    assert.equal(emb.kind, "embed");
    assert.equal(validateMedia({ src: "" }).valid, false);
    assert.equal(validateMedia({ src: "a.jpg", kind: "image" }).warnings[0].code, "MISSING_ALT");
    assert.equal(
      buildSrcSet("a.jpg", [320, 640], (w) => `a-${w}.jpg`),
      "a-320.jpg 320w, a-640.jpg 640w"
    );
    assert.throws(() => buildSrcSet("a.jpg", []), /non-empty/);
  });
});
