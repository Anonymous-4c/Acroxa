// acrx/assets/js/editor/app/core/store.js
//
// Editor state ownership: the headless runtime engines own canonical data.
// This module owns the reactive UI mirrors in the existing State engine
// (acrx/assets/js/utils/state.js) — blueprint stores "editor", "document",
// "history", "selection" — plus the runtime singleton. A single sync point
// (syncFromEditor) refreshes mirrors after mutations; panels subscribe via
// State.watch. No second document model is introduced.

import State from "../../../utils/state.js";
import { createEditor } from "../../engines/index.js";
import { createDocument } from "../../engines/index.js";
import { snapshotToBlueprint } from "./model.js";

let editor = null;
let syncTimer = 0;

function ensureStore(name, initial) {
  if (!State.has(name)) State.create(name, initial);
  return State;
}

export function initStores() {
  ensureStore("editor", {
    documentId: null,
    postType: "post",
    title: "",
    status: "draft",
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    saveError: null,
    autosaveEnabled: true,
    selectedBlockId: null,
    selectedBlockIds: [],
    focusedElement: null,
    leftActivePanel: "layers",
    rightActivePanel: "post",
    deviceMode: "desktop",
    zoom: 100,
    commandPaletteOpen: false,
    slashMenuOpen: false,
    moreActionsOpen: false,
    transformOpen: false,
    wordCount: 0,
    charCount: 0,
    blockCount: 0,
    seoScore: null,
  });

  ensureStore("document", {
    blocks: {},
    blockOrder: [],
    rootId: null,
    version: 1,
    rev: 0,
  });

  ensureStore("history", {
    undoDepth: 0,
    redoDepth: 0,
    canUndo: false,
    canRedo: false,
  });

  ensureStore("selection", {
    anchorBlockId: null,
    anchorOffset: 0,
    focusBlockId: null,
    focusOffset: 0,
    isCollapsed: true,
    selectedBlockIds: [],
  });

  ensureStore("post", {
    title: "",
    slug: "",
    status: "draft",
    author: null,
    publishDate: null,
    featuredImage: "",
    featuredImageAlt: "",
    excerpt: "",
    categories: [],
    tags: [],
    template: "default",
    allowComments: true,
  });

  ensureStore("seo", {
    metaTitle: "",
    metaDescription: "",
    focusKeyword: "",
    keywords: [],
    canonicalUrl: "",
    noIndex: false,
    noFollow: false,
    ogTitle: "",
    ogDescription: "",
    ogImage: "",
    report: null,
  });
}

function blockId() {
  return "block_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Runtime singleton. Document uses block_* ids to match the blueprint.
export function getEditor() {
  if (editor) return editor;
  const doc = createDocument({ idFactory: blockId });
  editor = createEditor({ document: doc });
  return editor;
}

export function setEditor(instance) {
  editor = instance;
}

// Mirror engine snapshots into State stores. Debounced for input bursts.
export function syncFromEditor(immediate = false) {
  if (!editor) return;
  const run = () => {
    const doc = editor.document;
    const bp = snapshotToBlueprint(doc.snapshot());
    State.batch(() => {
      State.patch("document", {
        blocks: bp.blocks,
        blockOrder: bp.blockOrder,
        rootId: bp.rootId,
        version: bp.version,
        rev: doc.rev,
      });
      const sel = editor.engines.selection.get();
      State.patch("selection", {
        anchorBlockId: sel.anchorId,
        anchorOffset: sel.anchorOffset,
        focusBlockId: sel.focusId,
        focusOffset: sel.focusOffset,
        isCollapsed: sel.mode === "none" ? true : editor.engines.selection.isCollapsed(),
        selectedBlockIds: sel.mode === "blocks" ? [...sel.blockIds] : [],
      });
      State.patch("history", { ...editor.engines.history.status() });
      const st = editor.state();
      State.patch("editor", {
        isDirty: st.dirty,
        selectedBlockId: st.selection && st.selection.mode !== "none" ? st.selection.anchorId : State.value("editor.selectedBlockId"),
        blockCount: Math.max(0, Object.keys(bp.blocks).length - 1),
      });
    });
  };
  if (immediate) {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = 0; }
    run();
    return;
  }
  if (syncTimer) return;
  syncTimer = setTimeout(() => { syncTimer = 0; run(); }, 60);
}

export function updateCounts(words, chars) {
  State.patch("editor", { wordCount: words, charCount: chars });
}

export { State };
export default { initStores, getEditor, setEditor, syncFromEditor, updateCounts, State };
