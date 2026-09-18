import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "../editor-runtime.js";
import { createAIEngine, estimateTokens } from "../ai-engine.js";
import { createSyncEngine } from "../sync-engine.js";
import { createEditorState } from "../editor-state-engine.js";
import * as all from "../index.js";

describe("ai engine", () => {
  it("packs token-conscious context without DOM", () => {
    const editor = createEditor();
    editor.execute("insertBlock", { parentId: editor.document.rootId, type: "heading", id: "h", data: { level: 1, text: "Title here" } });
    editor.execute("insertBlock", { parentId: editor.document.rootId, type: "paragraph", id: "p", data: { text: "Body text for the AI digest." } });
    const ai = createAIEngine({ maxNodes: 5 });
    const digest = ai.digestDocument(editor.document);
    assert.equal(digest.kind, "document-digest");
    assert.ok(digest.nodes.length >= 3);
    assert.equal(digest.nodes.find((n) => n.id === "h").text, "Title here");
    const pack = ai.contextPack({ document: editor.document, selection: editor.engines.selection, metadata: { title: "T" } });
    assert.equal(pack.kind, "ai-context");
    assert.ok(pack.budget.tokens > 0);
    assert.equal(pack.budget.estimated, true);
    assert.equal(estimateTokens("abcd").tokens, 1);
    const redacted = ai.digestDocument(editor.document, { redact: ["nodes"] });
    assert.equal(redacted.nodes, undefined);
    editor.destroy();
  });
});

describe("sync engine", () => {
  it("stamps, dedupes, orders and restores operations", () => {
    const a = createSyncEngine({ siteId: "a" });
    const [op1, op2] = a.submitLocal([{ op: "insert", args: { id: 1 } }, { op: "insert", args: { id: 2 } }]);
    assert.equal(op1.site, "a");
    assert.equal(op2.seq, 2);
    const b = createSyncEngine({ siteId: "b" });
    // Out-of-order delivery buffers until the gap fills.
    const first = b.receiveRemote([op2]);
    assert.equal(first.applicable.length, 0);
    assert.equal(first.buffered, 1);
    const second = b.receiveRemote([op1, op2]); // op2 retransmission deduped
    assert.equal(second.applicable.length, 2);
    assert.equal(second.buffered, 0);
    assert.deepEqual(b.appliedOps().map((o) => o.seq), [1, 2]);
    const snap = b.serialize();
    const c = createSyncEngine({ siteId: "b" });
    c.restore(snap);
    assert.equal(c.status().applied, 2);
    assert.throws(() => b.receiveRemote([{ nope: 1 }]), /site and positive integer seq/);
    assert.throws(() => a.submitLocal([]), /at least one operation/);
  });
});

describe("editor state engine", () => {
  it("coordinates without owning", () => {
    const editor = createEditor({ configuration: { title: "Draft post" } });
    const st = editor.engines.editorState;
    assert.equal(st.get("title"), "Draft post");
    assert.equal(st.isDirty(), false);
    editor.execute("insertBlock", { parentId: editor.document.rootId, type: "paragraph", data: { text: "x" } });
    assert.equal(st.isDirty(), true);
    st.setViewport("mobile", 50);
    assert.deepEqual([st.get("viewport"), st.get("zoom")], ["mobile", 50]);
    assert.throws(() => st.setViewport("watch"), /Unknown viewport/);
    st.setMode("preview");
    assert.equal(st.get("mode"), "preview");
    st.setStatus("published");
    assert.equal(st.get("status"), "published");
    const snap = st.snapshot();
    assert.ok(snap.document && snap.selection !== undefined && snap.historyDepth);
    st.markSaved();
    assert.equal(st.isDirty(), false);
    assert.ok(st.get("lastSavedAt"));
    editor.destroy();
  });
});

describe("editor runtime", () => {
  it("edits through commands with undo/redo and selection restore", () => {
    const editor = createEditor();
    const root = editor.document.rootId;
    const ins = editor.execute("insertBlock", { parentId: root, type: "paragraph", id: "p1", data: { text: "v1" } });
    assert.equal(ins.ok, true);
    assert.equal(editor.engines.selection.contains("p1"), true);
    editor.execute("updateBlock", { id: "p1", data: { text: "v2" } });
    assert.equal(editor.document.getNode("p1").data.text, "v2");
    editor.undo();
    assert.equal(editor.document.getNode("p1").data.text, "v1");
    editor.redo();
    assert.equal(editor.document.getNode("p1").data.text, "v2");
    const dup = editor.execute("duplicateBlock", { id: "p1" });
    assert.equal(dup.ok, true);
    assert.equal(editor.document.childrenOf(root).length, 2);
    editor.execute("removeBlock", { id: dup.result.id });
    assert.equal(editor.document.childrenOf(root).length, 1);
    assert.equal(editor.execute("removeBlock", {}).ok, false); // no target, no selection
    assert.equal(editor.execute("nope-cmd").ok, false);
    assert.deepEqual(editor.handleKey("ctrl+z").handled, true); // undo via keyboard (restores deletion)
    assert.equal(editor.document.getNode("p1").data.text, "v2");
    assert.equal(editor.document.childrenOf(root).length, 2);
    assert.equal(editor.handleKey("f9").handled, false);
    editor.destroy();
  });

  it("saves/loads envelopes, analyzes, previews and exports", () => {
    const editor = createEditor({ configuration: { siteHost: "acroxa.com" } });
    const root = editor.document.rootId;
    editor.execute("insertBlock", { parentId: root, type: "heading", data: { level: 1, text: "Acroxa runtime" } });
    editor.execute("insertBlock", { parentId: root, type: "paragraph", data: { text: "Runtime composes every engine." } });
    const saved = editor.execute("save");
    assert.equal(saved.ok, true);
    assert.equal(saved.result.format, "acroxa-envelope");
    const editor2 = createEditor();
    editor2.load(saved.result);
    assert.equal(editor2.document.size, editor.document.size);
    const report = editor.analyze({
      title: "Acroxa runtime composes every headless engine cleanly",
      metaDescription: "The runtime orchestrator wires documents, blocks, history, rendering and analysis into one coherent headless editing API.",
      focusKeyword: "runtime",
      slug: "runtime",
      canonical: "https://acroxa.com/runtime",
      language: "en",
      ogImage: "https://acroxa.com/og.png",
    });
    assert.ok(report.seo.score >= 0);
    assert.ok(report.accessibility.score >= 0);
    assert.equal(report.performance.measured, null);
    assert.ok(report.rollup.seo);
    const html = editor.exportHtml({ metadata: { title: "T" } });
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(!html.includes("data-block-id"));
    assert.ok(editor.layers().children.length >= 2);
    const pack = editor.snapshotForAI({ metadata: { title: "T" } });
    assert.equal(pack.kind, "ai-context");
    assert.equal(editor.validate().valid, true);
    assert.equal(editor.state().document.size, editor.document.size);
    let savedEvent = 0;
    editor.on("editor:saved", () => savedEvent++);
    editor.execute("save");
    assert.equal(savedEvent, 1);
    editor.destroy();
    editor2.destroy();
  });

  it("boots the full index without cycles", () => {
    assert.equal(typeof all.createEditor, "function");
    assert.equal(typeof all.createSEOEngine, "function");
    assert.equal(typeof all.createSyncEngine, "function");
    assert.ok(Object.keys(all).length > 60);
  });
});
