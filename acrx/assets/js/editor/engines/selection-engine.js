// acrx/assets/js/editor/engines/selection-engine.js
//
// ENGINE 07 — Selection Engine (headless).
// Central owner of editor selection: caret, text range, block (multi-)
// selection, persistence, restoration and change events. The UI visualizes;
// this engine owns the state.

export const SELECTION_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "selection";

function selError(operation, code, message) {
  const err = new Error(message);
  err.name = "SelectionError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

function cloneSel(s) {
  return JSON.parse(JSON.stringify(s));
}

export function createSelectionEngine(options = {}) {
  const exists = typeof options.exists === "function" ? options.exists : null;
  let sel = { mode: "none", anchorId: null, anchorOffset: 0, focusId: null, focusOffset: 0, blockIds: [] };
  const subs = new Set();

  function notify(reason) {
    const snap = engine.get();
    for (const cb of [...subs]) {
      try { cb({ engine: ENGINE_ID, event: "selection:changed", reason, selection: snap }); } catch (err) {
        if (typeof console !== "undefined") console.error("[selection] listener threw:", err);
      }
    }
  }

  function checkId(id, operation) {
    if (typeof id !== "string" || id === "") throw selError(operation, "INVALID_ID", "Block id must be a non-empty string.");
    if (exists && !exists(id)) throw selError(operation, "UNKNOWN_BLOCK", `Unknown block "${id}".`);
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return SELECTION_ENGINE_VERSION; },

    setCaret(blockId, offset = 0) {
      checkId(blockId, "setCaret");
      sel = { mode: "caret", anchorId: blockId, anchorOffset: offset, focusId: blockId, focusOffset: offset, blockIds: [] };
      notify("caret");
      return engine.get();
    },

    setRange(anchorId, anchorOffset, focusId, focusOffset) {
      checkId(anchorId, "setRange");
      checkId(focusId, "setRange");
      sel = { mode: "range", anchorId, anchorOffset, focusId, focusOffset, blockIds: [] };
      notify("range");
      return engine.get();
    },

    selectBlocks(ids, opts = {}) {
      if (!Array.isArray(ids) || ids.length === 0) throw selError("selectBlocks", "INVALID_IDS", "Provide a non-empty array of block ids.");
      for (const id of ids) checkId(id, "selectBlocks");
      const unique = [...new Set(ids)];
      sel = {
        mode: "blocks",
        anchorId: unique[0], anchorOffset: 0,
        focusId: unique[unique.length - 1], focusOffset: 0,
        blockIds: unique,
      };
      if (opts.additive) { /* additive handled by toggleBlocks; kept for API clarity */ }
      notify("blocks");
      return engine.get();
    },

    toggleBlock(blockId) {
      checkId(blockId, "toggleBlock");
      const set = new Set(sel.blockIds);
      if (set.has(blockId)) set.delete(blockId);
      else set.add(blockId);
      const ids = [...set];
      if (ids.length === 0) return engine.clear();
      return engine.selectBlocks(ids);
    },

    clear() {
      sel = { mode: "none", anchorId: null, anchorOffset: 0, focusId: null, focusOffset: 0, blockIds: [] };
      notify("clear");
      return engine.get();
    },

    get() {
      return cloneSel(sel);
    },

    isCollapsed() {
      if (sel.mode === "none") return true;
      if (sel.mode === "blocks") return sel.blockIds.length <= 1;
      return sel.anchorId === sel.focusId && sel.anchorOffset === sel.focusOffset;
    },

    isEmpty() {
      return sel.mode === "none";
    },

    contains(blockId) {
      if (sel.mode === "blocks") return sel.blockIds.includes(blockId);
      return sel.anchorId === blockId || sel.focusId === blockId;
    },

    selectedBlockIds() {
      if (sel.mode === "blocks") return [...sel.blockIds];
      if (sel.mode === "none" || !sel.anchorId) return [];
      return [...new Set([sel.anchorId, sel.focusId])];
    },

    // Persistence across document reloads / inspector focus trips.
    serialize() {
      return cloneSel(sel);
    },

    restore(saved) {
      if (!saved || typeof saved !== "object" || !saved.mode) {
        throw selError("restore", "INVALID_SELECTION", "Saved selection is malformed.");
      }
      sel = {
        mode: ["none", "caret", "range", "blocks"].includes(saved.mode) ? saved.mode : "none",
        anchorId: saved.anchorId || null,
        anchorOffset: saved.anchorOffset || 0,
        focusId: saved.focusId || null,
        focusOffset: saved.focusOffset || 0,
        blockIds: Array.isArray(saved.blockIds) ? [...saved.blockIds] : [],
      };
      notify("restore");
      return engine.get();
    },

    subscribe(cb) {
      if (typeof cb !== "function") throw selError("subscribe", "INVALID_LISTENER", "Listener must be a function.");
      subs.add(cb);
      return () => subs.delete(cb);
    },

    destroy() {
      subs.clear();
    },
  };

  return engine;
}

export default createSelectionEngine;
