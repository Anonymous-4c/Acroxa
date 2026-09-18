import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../document-engine.js";
import { createSelectionEngine } from "../selection-engine.js";
import { createCommandEngine } from "../command-engine.js";
import { createTransactionEngine } from "../transaction-engine.js";
import { createHistoryEngine } from "../history-engine.js";
import { createFocusEngine } from "../focus-engine.js";
import { createKeyboardEngine, normalizeCombo } from "../keyboard-engine.js";

function docWithBlocks() {
  const doc = createDocument({ id: "d" });
  doc.insertNode(doc.rootId, { id: "a", type: "paragraph", data: {} });
  doc.insertNode(doc.rootId, { id: "b", type: "paragraph", data: {} });
  return doc;
}

describe("selection engine", () => {
  it("owns caret, range, multi-select, persistence and events", () => {
    const sel = createSelectionEngine({ exists: (id) => ["a", "b"].includes(id) });
    assert.equal(sel.isEmpty(), true);
    sel.setCaret("a", 3);
    assert.equal(sel.isCollapsed(), true);
    assert.deepEqual(sel.selectedBlockIds(), ["a"]);
    sel.setRange("a", 0, "b", 5);
    assert.equal(sel.isCollapsed(), false);
    assert.deepEqual(sel.selectedBlockIds(), ["a", "b"]);
    sel.selectBlocks(["a", "b", "a"]);
    assert.deepEqual(sel.get().blockIds, ["a", "b"]);
    assert.equal(sel.contains("b"), true);
    sel.toggleBlock("b");
    assert.deepEqual(sel.selectedBlockIds(), ["a"]);
    const saved = sel.serialize();
    sel.clear();
    assert.equal(sel.isEmpty(), true);
    sel.restore(saved);
    assert.equal(sel.contains("a"), true);
    assert.throws(() => sel.setCaret("ghost"), /Unknown block/);
    assert.throws(() => sel.restore({ nope: 1 }), /malformed/);
    const events = [];
    const off = sel.subscribe((ctx) => events.push(ctx.reason));
    sel.setCaret("b", 0);
    assert.deepEqual(events, ["caret"]);
    off();
    sel.destroy();
  });
});

describe("command engine", () => {
  it("registers, gates and executes commands with metadata", () => {
    const cmds = createCommandEngine({ context: { n: 1 } });
    cmds.register({
      id: "double", label: "Double", category: "math", shortcut: "ctrl+d",
      precondition: (ctx) => (ctx.n > 0 ? true : { ok: false, reason: "n must be positive" }),
      run: (ctx) => ctx.n * 2,
    });
    assert.deepEqual(cmds.metadata("double").label, "Double");
    assert.equal(cmds.list("math").length, 1);
    assert.deepEqual(cmds.execute("double"), { ok: true, id: "double", result: 2 });
    cmds.disable("double");
    assert.equal(cmds.execute("double").ok, false);
    cmds.enable("double");
    assert.deepEqual(cmds.canExecute("double", {}, { n: -1 }).ok, false);
    assert.equal(cmds.execute("missing").error.code, "CANNOT_EXECUTE");
    cmds.register({ id: "boom", run: () => { throw new Error("kaput"); } });
    const failed = cmds.execute("boom");
    assert.equal(failed.ok, false);
    assert.equal(failed.error.message, "kaput");
    cmds.compose("double-twice", ["double"]);
    // composed macro receives macro args; inner gets {} -> ctx.n=1 -> 2
    assert.equal(cmds.execute("double-twice").ok, true);
    const seen = [];
    cmds.on("command:after", (ctx) => seen.push(ctx.id));
    cmds.execute("double");
    assert.deepEqual(seen, ["double"]);
    cmds.destroy();
  });
});

describe("transaction + history", () => {
  it("applies atomically and rolls back on failure", () => {
    const doc = docWithBlocks();
    const tx = createTransactionEngine({ document: doc });
    const entry = tx.run({ label: "add" }, (t) => {
      t.insert(doc.rootId, { id: "c", type: "paragraph", data: {} });
      t.update("a", { data: { x: 1 } });
      return "done";
    });
    assert.equal(entry.ops.length, 2);
    assert.equal(entry.result, "done");
    assert.equal(doc.hasNode("c"), true);
    assert.throws(() => tx.run(() => {
      tx.add({ op: "insert", args: { parentId: doc.rootId, node: { id: "d", type: "x", data: {} } } });
      tx.add({ op: "bogus", args: {} });
    }), /Unsupported operation/);
    assert.equal(doc.hasNode("d"), false); // rolled back verbatim
    assert.throws(() => tx.commit(), /No active transaction/);
    assert.throws(() => { tx.begin(); tx.begin(); }, /already active/);
    tx.rollback("test");
    const events = [];
    tx.on("transaction:committed", (ctx) => events.push(ctx.id));
    tx.run((t) => t.update("a", { data: { y: 2 } }));
    assert.equal(events.length, 1);
    tx.destroy();
  });

  it("undoes and redoes through snapshots with limits and merge", () => {
    const doc = docWithBlocks();
    const hist = createHistoryEngine({ maxSteps: 2 });
    const snap0 = doc.snapshot();
    doc.updateNode("a", { data: { v: 1 } });
    hist.record({ id: "e1", label: "v1", before: snap0, after: doc.snapshot() });
    doc.updateNode("a", { data: { v: 2 } });
    hist.record({ id: "e2", label: "v2", before: hist.peekUndo().after, after: doc.snapshot() });
    doc.updateNode("a", { data: { v: 3 } });
    hist.record({ id: "e3", label: "v3", before: hist.peekUndo().after, after: doc.snapshot() });
    assert.deepEqual([hist.status().undoDepth, hist.status().canRedo], [2, false]); // capacity enforced
    const undone = hist.undo();
    doc.restore(JSON.parse(JSON.stringify(undone.before)));
    assert.equal(doc.getNode("a").data.v, 2);
    assert.equal(hist.status().canRedo, true);
    const redone = hist.redo();
    doc.restore(JSON.parse(JSON.stringify(redone.after)));
    assert.equal(doc.getNode("a").data.v, 3);
    hist.record({ id: "e4", label: "v4", before: doc.snapshot(), after: doc.snapshot() });
    assert.equal(hist.status().canRedo, false); // new change clears redo
    // merge adjacent typing entries
    hist.clear();
    hist.setMerger((prev, next) => {
      if (prev.meta.kind === "type" && next.meta.kind === "type") {
        return { ...next, before: prev.before, meta: { kind: "type", merged: true } };
      }
      return null;
    });
    hist.record({ id: "t1", before: snap0, after: doc.snapshot(), meta: { kind: "type" } });
    hist.record({ id: "t2", before: doc.snapshot(), after: doc.snapshot(), meta: { kind: "type" } });
    assert.equal(hist.status().undoDepth, 1);
    const data = hist.serialize();
    const h2 = createHistoryEngine();
    h2.restore(data);
    assert.equal(h2.status().undoDepth, 1);
    hist.undo(); // drain the single merged entry
    assert.equal(hist.undo(), null);
    assert.equal(h2.redo(), null);
    hist.destroy();
    h2.destroy();
  });
});

describe("focus engine", () => {
  it("tracks, restores and navigates focus", () => {
    const f = createFocusEngine();
    f.focus("w1", { kind: "widget" });
    f.focus("w2", { kind: "text", reason: "click" });
    assert.equal(f.current().id, "w2");
    assert.equal(f.hasFocus("w2"), true);
    f.restore();
    assert.equal(f.current().id, "w1");
    f.focusNext(["w1", "w2", "w3"]);
    assert.equal(f.current().id, "w2");
    f.focusPrev(["w1", "w2", "w3"]);
    assert.equal(f.current().id, "w1");
    f.focusPrev(["w1", "w2"], { wrap: false });
    assert.equal(f.current().id, "w1");
    assert.throws(() => f.focus("x", { kind: "nope" }), /Unknown focus kind/);
    f.blur("escape");
    assert.equal(f.current(), null);
    f.destroy();
  });
});

describe("keyboard engine", () => {
  it("normalizes combos, maps shortcuts and classifies intents", () => {
    assert.equal(normalizeCombo("Shift+Ctrl+B", "other"), "ctrl+shift+b");
    assert.equal(normalizeCombo("mod+k", "mac"), "meta+k");
    assert.equal(normalizeCombo("mod+k", "other"), "ctrl+k");
    assert.equal(normalizeCombo({ key: "Enter", shiftKey: true }, "other"), "shift+enter");
    const kb = createKeyboardEngine({ platform: "other" });
    kb.registerShortcut("mod+b", "toggle-bold");
    kb.registerShortcut("ctrl+k", "open-palette", { when: (ctx) => ctx.palette !== false });
    assert.equal(kb.resolve("ctrl+b"), "toggle-bold");
    assert.equal(kb.resolve({ key: "k", ctrlKey: true }, { palette: false }), null);
    assert.equal(kb.resolve("ctrl+z"), null);
    assert.equal(kb.shortcutFor("toggle-bold"), "ctrl+b");
    assert.equal(kb.listShortcuts().length, 2);
    assert.equal(kb.classifyIntent("enter"), "break");
    assert.equal(kb.classifyIntent("backspace"), "delete-backward");
    assert.equal(kb.classifyIntent("a"), "insert-text");
    assert.equal(kb.classifyIntent("arrowup"), "navigate");
    assert.equal(kb.classifyIntent("escape"), "cancel");
    assert.equal(kb.classifyIntent("ctrl+b"), "shortcut");
    kb.unregisterShortcut("mod+b");
    assert.equal(kb.resolve("ctrl+b"), null);
  });
});
