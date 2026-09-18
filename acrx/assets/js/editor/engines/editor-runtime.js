// acrx/assets/js/editor/engines/editor-runtime.js
//
// ENGINE 46 — Editor Runtime / Orchestrator (headless composition root).
// Initializes every engine in dependency order and exposes one coherent
// public API without leaking internals:
//
//   const editor = createEditor({ document, configuration });
//   editor.execute("insertBlock", { parentId, type });
//   editor.undo(); editor.redo();
//   editor.save(); editor.analyze(); editor.exportHtml();
//
// Mutation path: Command -> Transaction (document ops) -> History entry.
// UI layers (canvas, panels, toolbar) consume this API; nothing here touches
// the DOM.

import { createEventBus } from "./event-bus.js";
import { createSchemaRegistry } from "./schema-engine.js";
import { createValidationEngine } from "./validation-engine.js";
import { createSerializationEngine } from "./serialization-engine.js";
import { createDocument, loadDocument } from "./document-engine.js";
import { createBlockEngine } from "./block-engine.js";
import { createWidgetDefinitionEngine } from "./widget-definition-engine.js";
import { createWidgetSettingsEngine } from "./widget-settings-engine.js";
import { createWidgetStateEngine } from "./widget-state-engine.js";
import { createConstraintEngine } from "./constraint-engine.js";
import { createSelectionEngine } from "./selection-engine.js";
import { createCommandEngine } from "./command-engine.js";
import { createTransactionEngine } from "./transaction-engine.js";
import { createHistoryEngine } from "./history-engine.js";
import { createFocusEngine } from "./focus-engine.js";
import { createKeyboardEngine } from "./keyboard-engine.js";
import { createClipboardEngine } from "./clipboard-engine.js";
import { createTableEngine } from "./table-engine.js";
import { createLinkEngine } from "./link-engine.js";
import { createMediaEngine } from "./media-engine.js";
import { createAssetEngine } from "./asset-engine.js";
import { createLayoutEngine } from "./layout-engine.js";
import { createStyleEngine } from "./style-engine.js";
import { createResponsiveEngine } from "./responsive-engine.js";
import { createRenderer } from "./renderer-engine.js";
import { createWidgetRendererRegistry } from "./widget-renderer-registry.js";
import { createPreviewEngine } from "./preview-engine.js";
import { createLayersEngine } from "./layers-engine.js";
import { createSearchEngine } from "./search-engine.js";
import { createOutlineEngine } from "./outline-engine.js";
import { createMetadataEngine, normalizeMetadata } from "./metadata-engine.js";
import { createSEOEngine } from "./seo-engine.js";
import { createSEOPreviewEngine } from "./seo-preview-engine.js";
import { createAccessibilityEngine } from "./accessibility-engine.js";
import { createPerformanceEngine } from "./performance-engine.js";
import { createComponentEngine } from "./component-engine.js";
import { createTemplateEngine } from "./template-engine.js";
import { createVariableEngine } from "./variable-engine.js";
import { createFormEngine } from "./form-engine.js";
import { createPluginEngine } from "./plugin-engine.js";
import { createImportExportEngine } from "./import-export-engine.js";
import { createHtmlExportEngine } from "./html-export-engine.js";
import { createEditorState } from "./editor-state-engine.js";
import { createAIEngine } from "./ai-engine.js";
import { createSyncEngine } from "./sync-engine.js";

export const RUNTIME_VERSION = "1.0.0";
export const ENGINE_ID = "editor-runtime";

const CORE_WIDGETS = [
  { type: "paragraph", category: "text", label: "Paragraph", kind: "content", capabilities: { editable: true, draggable: true }, defaults: { text: "" } },
  { type: "heading", category: "text", label: "Heading", kind: "content", capabilities: { editable: true, draggable: true }, defaults: { level: 2, text: "" } },
  { type: "blockquote", category: "text", label: "Quote", kind: "content", capabilities: { editable: true, draggable: true }, defaults: { text: "" } },
  { type: "codeblock", category: "text", label: "Code", kind: "content", capabilities: { editable: true, draggable: true }, defaults: { text: "", language: "" } },
  { type: "bulletList", category: "text", label: "Bullet list", kind: "container", capabilities: { editable: true, draggable: true }, defaults: { items: [] } },
  { type: "orderedList", category: "text", label: "Numbered list", kind: "container", capabilities: { editable: true, draggable: true }, defaults: { items: [] } },
  { type: "image", category: "media", label: "Image", kind: "atomic", capabilities: { editable: false, draggable: true }, defaults: { src: "", alt: "" } },
  { type: "video", category: "media", label: "Video", kind: "atomic", capabilities: { editable: false, draggable: true }, defaults: { src: "", poster: "" } },
  { type: "button", category: "interactive", label: "Button", kind: "atomic", capabilities: { editable: false, draggable: true }, defaults: { text: "Click me", href: "/" } },
  { type: "divider", category: "layout", label: "Divider", kind: "atomic", capabilities: { editable: false, draggable: true }, defaults: {} },
  { type: "columns", category: "layout", label: "Columns", kind: "container", capabilities: { nestable: true, draggable: true, editable: false }, allowedChildren: ["column"], defaults: {} },
  { type: "column", category: "layout", label: "Column", kind: "container", capabilities: { nestable: true, draggable: true, editable: false }, allowedParents: ["columns"], defaults: {} },
  { type: "container", category: "layout", label: "Container", kind: "container", capabilities: { nestable: true, draggable: true, editable: false }, defaults: {} },
  { type: "table", category: "content", label: "Table", kind: "atomic", capabilities: { editable: true, draggable: true }, defaults: { rows: 2, cols: 2 } },
  { type: "embed", category: "media", label: "Embed", kind: "atomic", capabilities: { editable: false, draggable: true }, defaults: { src: "" } },
];

function runtimeError(operation, code, message) {
  const err = new Error(message);
  err.name = "EditorRuntimeError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

export function createEditor(options = {}) {
  const config = options.configuration || options.config || {};
  const bus = createEventBus();

  // ── Foundation (dependency order) ──
  const schemas = createSchemaRegistry();
  const validation = createValidationEngine();
  const serialization = createSerializationEngine({ kind: "document" });

  const doc = options.document
    ? (typeof options.document.getNode === "function" ? options.document : loadDocument(options.document))
    : createDocument({ id: options.documentId || null });

  // ── Structure ──
  const definitions = createWidgetDefinitionEngine({ schemaRegistry: schemas });
  for (const def of CORE_WIDGETS) {
    if (!definitions.has(def.type)) definitions.register(def);
  }
  for (const extra of config.widgets || []) {
    if (!definitions.has(extra.type)) definitions.register(extra);
  }
  const constraints = createConstraintEngine({ definitions });
  const blocks = createBlockEngine({ document: doc, definitions, constraints });
  const settings = createWidgetSettingsEngine({ definitions });
  const widgetState = createWidgetStateEngine();

  // ── Editing core ──
  const selection = createSelectionEngine();
  const transactions = createTransactionEngine({ document: doc });
  const history = createHistoryEngine({ maxSteps: config.maxHistory || 100 });
  const focus = createFocusEngine();
  const keyboard = createKeyboardEngine({ platform: config.platform || "other" });
  const commands = createCommandEngine();

  // ── Content ──
  const clipboard = createClipboardEngine();
  const tables = createTableEngine();
  const links = createLinkEngine({ siteHost: config.siteHost });
  const media = createMediaEngine();
  const assets = createAssetEngine();

  // ── Visual model ──
  const layout = createLayoutEngine();
  const styles = createStyleEngine();
  const responsive = createResponsiveEngine(config.breakpoints);
  const renderRegistry = createWidgetRendererRegistry();
  renderRegistry.setFallback((node, ctx) => ctx.defaultRender(node, {}));
  for (const custom of config.renderers || []) {
    renderRegistry.register(custom.type, custom.render, { mode: custom.mode, version: custom.version, label: custom.label });
  }
  const renderer = createRenderer({ registry: renderRegistry });
  const preview = createPreviewEngine({ renderer });

  // ── Navigation ──
  const layers = createLayersEngine();
  const search = createSearchEngine();
  const outline = createOutlineEngine();

  // ── Analysis ──
  const metadata = createMetadataEngine();
  const seo = createSEOEngine({ settings: { siteHost: config.siteHost } });
  const seoPreview = createSEOPreviewEngine();
  const accessibility = createAccessibilityEngine();
  const performance = createPerformanceEngine();

  // ── Advanced content ──
  const components = createComponentEngine();
  const templates = createTemplateEngine();
  const variables = createVariableEngine();
  const forms = createFormEngine();

  // ── Extensibility ──
  const plugins = createPluginEngine({ host: { commands, events: bus } });
  const importExport = createImportExportEngine({ renderer });
  const htmlExport = createHtmlExportEngine({
    renderer,
    headTagsFor: (meta) => metadata.toHeadTags(meta),
  });

  // ── Coordination ──
  const editorState = createEditorState({
    document: doc, selection, history, focus,
    documentId: doc.id, title: config.title || "", status: config.status || "draft",
    postType: config.postType || "post", autosave: config.autosave,
  });
  const ai = createAIEngine({ textBudget: config.aiTextBudget, maxNodes: config.aiMaxNodes });
  const sync = createSyncEngine({ siteId: config.siteId });

  // Structural self-check available to hosts and save gates.
  validation.registerCheck({
    id: "document-structure", scope: "document",
    run: () => {
      const res = doc.validateStructure();
      return res.valid ? null : res.errors.map((e) => ({ code: e.code, path: e.path, message: e.message }));
    },
  });

  // Fan key lifecycle events into the central bus.
  const forward = (source, events) => {
    for (const event of events) {
      source.on(event, (ctx) => bus.emit(ctx.event || event, { ...ctx, source: source.engine }));
    }
  };
  forward(commands, ["command:after", "command:error", "command:rejected"]);
  forward(transactions, ["transaction:committed", "transaction:rolledback"]);
  forward(history, ["history:recorded", "history:undone", "history:redone"]);
  forward(plugins, ["plugin:activated", "plugin:deactivated"]);

  // ── Mutation path: command -> transaction -> history (+selection) ──
  function mutate(label, fn, meta = {}) {
    const selectionBefore = selection.serialize();
    const entry = transactions.run({ label, ...meta }, fn);
    entry.label = label;
    entry.meta = { ...(entry.meta || {}), selectionBefore, selectionAfter: selection.serialize() };
    history.record(entry);
    editorState.refreshHistory();
    return entry;
  }

  function targetId(args) {
    const id = args && (args.id || args.blockId || args.nodeId);
    if (!id && !selection.isEmpty()) {
      const ids = selection.selectedBlockIds();
      return ids[0] || null;
    }
    return id || null;
  }

  commands.register({
    id: "insertBlock", label: "Insert block", category: "blocks",
    run: (ctx, args) => {
      if (!args || !args.parentId || !args.type) throw new Error("insertBlock requires parentId and type.");
      // Compound insert is atomic: the parent and its declared children
      // (e.g. columns + column shells) land in ONE transaction, so undo
      // reverses the whole tree in a single step.
      const entry = mutate("insertBlock", (tx) => {
        const node = blocks.createBlock(args.type, { id: args.id, data: args.data, settings: args.settings });
        tx.add({ op: "insert", args: { parentId: args.parentId, node, index: args.index } });
        const insertChildren = (parentId, children) => {
          for (const child of children || []) {
            if (!child || !child.type) continue;
            const cnode = blocks.createBlock(child.type, { data: child.data, settings: child.settings });
            tx.add({ op: "insert", args: { parentId, node: cnode, index: child.index } });
            insertChildren(cnode.id, child.children);
          }
        };
        insertChildren(node.id, args.children);
        return node.id;
      });
      selection.setCaret(entry.result, 0);
      return { id: entry.result, transaction: entry.id };
    },
  });
  commands.register({
    id: "removeBlock", label: "Delete block", category: "blocks",
    precondition: (ctx, args) => (targetId(args) ? true : { ok: false, reason: "No block targeted or selected." }),
    run: (ctx, args) => {
      const id = targetId(args);
      const entry = mutate("removeBlock", (tx) => {
        tx.add({ op: "remove", args: { nodeId: id } });
        return id;
      });
      selection.clear();
      return { id, transaction: entry.id };
    },
  });
  commands.register({
    id: "duplicateBlock", label: "Duplicate block", category: "blocks",
    precondition: (ctx, args) => (targetId(args) ? true : { ok: false, reason: "No block targeted or selected." }),
    run: (ctx, args) => {
      const id = targetId(args);
      const entry = mutate("duplicateBlock", () => blocks.duplicateBlock(id, args && args.parentId, args && args.index));
      selection.setCaret(entry.result.id, 0);
      return { id: entry.result.id, transaction: entry.id };
    },
  });
  commands.register({
    id: "moveBlock", label: "Move block", category: "blocks",
    run: (ctx, args) => {
      if (!args || !args.id || !args.newParentId) throw new Error("moveBlock requires id and newParentId.");
      const entry = mutate("moveBlock", (tx) => {
        tx.add({ op: "move", args: { nodeId: args.id, newParentId: args.newParentId, index: args.index } });
        return args.id;
      });
      return { id: args.id, transaction: entry.id };
    },
  });
  commands.register({
    id: "updateBlock", label: "Update block", category: "blocks",
    run: (ctx, args) => {
      if (!args || !args.id) throw new Error("updateBlock requires id.");
      const entry = mutate("updateBlock", (tx) => {
        tx.add({ op: "update", args: { nodeId: args.id, patch: { type: args.type, data: args.data } } });
        return args.id;
      });
      return { id: args.id, transaction: entry.id };
    },
  });
  commands.register({
    id: "undo", label: "Undo", category: "history", shortcut: "mod+z",
    precondition: () => (history.canUndo() ? true : { ok: false, reason: "Nothing to undo." }),
    run: () => {
      const entry = history.undo();
      doc.restore(JSON.parse(JSON.stringify(entry.before)));
      if (entry.meta && entry.meta.selectionBefore) selection.restore(entry.meta.selectionBefore);
      editorState.refreshHistory();
      return { restored: entry.id };
    },
  });
  commands.register({
    id: "redo", label: "Redo", category: "history", shortcut: "mod+shift+z",
    precondition: () => (history.canRedo() ? true : { ok: false, reason: "Nothing to redo." }),
    run: () => {
      const entry = history.redo();
      doc.restore(JSON.parse(JSON.stringify(entry.after)));
      if (entry.meta && entry.meta.selectionAfter) selection.restore(entry.meta.selectionAfter);
      editorState.refreshHistory();
      return { restored: entry.id };
    },
  });
  commands.register({
    id: "selectBlock", label: "Select block", category: "selection",
    run: (ctx, args) => {
      if (!args || !args.id) throw new Error("selectBlock requires id.");
      selection.setCaret(args.id, args.offset || 0);
      focus.focus(args.id, { kind: "widget", reason: "select" });
      return { id: args.id };
    },
  });

  // Default keyboard map -> command ids.
  keyboard.registerShortcut("mod+z", "undo");
  keyboard.registerShortcut("mod+shift+z", "redo");
  keyboard.registerShortcut("ctrl+y", "redo");
  keyboard.registerShortcut("mod+s", "save");

  commands.register({
    id: "save", label: "Save document", category: "document",
    run: () => editor.save(),
  });

  commands.setContext({
    document: doc, blocks, selection, focus, history, editorState,
    execute: (id, args) => editor.execute(id, args),
  });

  const engines = {
    bus, schemas, validation, serialization, document: doc, blocks, definitions,
    settings, widgetState, constraints, selection, commands, transactions, history,
    focus, keyboard, clipboard, tables, links, media, assets, layout, styles,
    responsive, renderer, renderRegistry, preview, layers, search, outline,
    metadata, seo, seoPreview, accessibility, performance, components, templates,
    variables, forms, plugins, importExport, htmlExport, editorState, ai, sync,
  };

  const editor = {
    get engine() { return ENGINE_ID; },
    get version() { return RUNTIME_VERSION; },
    get engines() { return engines; },
    get document() { return doc; },

    execute(id, args) {
      return commands.execute(id, args);
    },

    handleKey(input, ctx) {
      const commandId = keyboard.resolve(input, ctx);
      if (!commandId) return { handled: false, commandId: null };
      return { handled: true, commandId, ...editor.execute(commandId, ctx) };
    },

    undo() { return editor.execute("undo"); },
    redo() { return editor.execute("redo"); },

    validate() {
      return validation.validate(doc.toJSON(), { scope: "document" });
    },

    save(opts = {}) {
      const structural = editor.validate();
      if (!structural.valid && !opts.force) {
        throw runtimeError("save", structural.errors[0].code, `Refusing to save an invalid document: ${structural.errors[0].message}.`);
      }
      const envelope = serialization.serialize(doc.toJSON(), {
        kind: "document",
        schemaVersion: doc.schemaVersion,
      });
      editorState.markSaved();
      bus.emit("editor:saved", { rev: doc.rev });
      return envelope;
    },

    load(input, opts = {}) {
      let json = input;
      if (input && typeof input === "object" && input.format === "acroxa-envelope") {
        const out = serialization.deserialize(input, opts.migrateTo !== undefined ? { migrateTo: opts.migrateTo } : {});
        json = out.payload;
      } else if (typeof input === "string") {
        json = serialization.parse(input);
        if (json.format === "acroxa-envelope") json = serialization.deserialize(json).payload;
      }
      const restored = loadDocument(JSON.parse(JSON.stringify(json)));
      doc.restore(restored.snapshot());
      history.clear();
      selection.clear();
      editorState.refreshHistory();
      bus.emit("editor:loaded", { rev: doc.rev });
      return { rev: doc.rev, size: doc.size };
    },

    analyze(meta = {}) {
      const normalizedMeta = normalizeMetadata(meta);
      const seoReport = seo.analyze({ document: doc, metadata: normalizedMeta });
      const a11yReport = accessibility.check({ document: doc, metadata: normalizedMeta });
      const perfReport = performance.analyze({ document: doc });
      return {
        seo: seoReport,
        accessibility: a11yReport,
        performance: perfReport,
        rollup: ai.rollupAnalysis({ seo: seoReport, accessibility: a11yReport, performance: perfReport }),
      };
    },

    previews(meta = {}) {
      return seoPreview.all({ ...(meta || {}), metadata: meta });
    },

    exportHtml(opts = {}) {
      return htmlExport.exportDocument(doc, opts);
    },

    snapshotForAI(opts = {}) {
      return ai.contextPack({ document: doc, selection, metadata: opts.metadata, analysis: opts.analysis, ...opts });
    },

    layers() {
      return layers.build(doc);
    },

    on(event, cb) { return bus.on(event, cb); },
    off(event, cb) { return bus.off(event, cb); },

    state() {
      return editorState.snapshot();
    },

    destroy() {
      bus.emit("editor:destroying", {});
      for (const key of Object.keys(engines).reverse()) {
        if (key === "bus") continue; // the bus goes last so teardown can still announce
        try {
          if (engines[key] && typeof engines[key].destroy === "function") engines[key].destroy();
        } catch { /* best-effort teardown */ }
      }
      bus.emit("editor:destroyed", {});
      bus.destroy();
    },
  };

  return editor;
}

export default createEditor;
