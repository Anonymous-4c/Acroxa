// acrx/assets/js/editor/engines/history-engine.js
//
// ENGINE 10 — History Engine (headless).
// Undo/redo over committed transaction entries. Operates strictly through
// before/after snapshots (never mutates the document itself): the host
// applies them via document.restore(). Supports grouping markers, adjacent
// merge, capacity limits, boundaries and lifecycle events.

export const HISTORY_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "history";

function histError(operation, code, message) {
  const err = new Error(message);
  err.name = "HistoryError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

export function createHistoryEngine(options = {}) {
  const maxSteps = options.maxSteps && options.maxSteps > 0 ? Math.floor(options.maxSteps) : 100;
  const undoStack = [];
  const redoStack = [];
  const listeners = new Map();
  let merger = typeof options.merge === "function" ? options.merge : null;

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try { cb({ engine: ENGINE_ID, event, ...payload }); } catch (err) {
        if (typeof console !== "undefined") console.error(`[history] listener for "${event}" threw:`, err);
      }
    }
  }

  function cloneEntry(entry) {
    return JSON.parse(JSON.stringify({
      id: entry.id || null,
      label: entry.label || "",
      before: entry.before,
      after: entry.after,
      meta: entry.meta || {},
      at: entry.at || null,
    }));
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return HISTORY_ENGINE_VERSION; },
    get maxSteps() { return maxSteps; },

    // Record a committed transaction. Adjacent entries merge when the
    // configured merge(prev, next) returns a merged entry.
    record(entry) {
      if (!entry || typeof entry !== "object" || !entry.before || !entry.after) {
        throw histError("record", "INVALID_ENTRY", "History entries require before/after snapshots.");
      }
      const next = cloneEntry({ ...entry, at: entry.at || new Date().toISOString() });
      const prev = undoStack[undoStack.length - 1];
      if (prev && merger) {
        let merged = null;
        try { merged = merger(cloneEntry(prev), cloneEntry(next)); } catch { merged = null; }
        if (merged) {
          undoStack[undoStack.length - 1] = cloneEntry(merged);
          redoStack.length = 0;
          emit("history:merged", { id: merged.id || null });
          return engine.status();
        }
      }
      undoStack.push(next);
      if (undoStack.length > maxSteps) undoStack.splice(0, undoStack.length - maxSteps);
      redoStack.length = 0; // new change after undo clears the redo path
      emit("history:recorded", { id: next.id, depth: undoStack.length });
      return engine.status();
    },

    setMerger(fn) {
      merger = typeof fn === "function" ? fn : null;
    },

    canUndo() { return undoStack.length > 0; },
    canRedo() { return redoStack.length > 0; },

    // Returns the entry whose `before` snapshot the host must restore, or null.
    undo() {
      const entry = undoStack.pop();
      if (!entry) return null;
      redoStack.push(entry);
      emit("history:undone", { id: entry.id, depth: undoStack.length });
      return cloneEntry(entry);
    },

    // Returns the entry whose `after` snapshot the host must restore, or null.
    redo() {
      const entry = redoStack.pop();
      if (!entry) return null;
      undoStack.push(entry);
      emit("history:redone", { id: entry.id, depth: undoStack.length });
      return cloneEntry(entry);
    },

    peekUndo() {
      return undoStack.length > 0 ? cloneEntry(undoStack[undoStack.length - 1]) : null;
    },

    peekRedo() {
      return redoStack.length > 0 ? cloneEntry(redoStack[redoStack.length - 1]) : null;
    },

    status() {
      return {
        undoDepth: undoStack.length,
        redoDepth: redoStack.length,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
      };
    },

    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
      emit("history:cleared", {});
    },

    serialize() {
      return {
        maxSteps,
        undo: undoStack.map(cloneEntry),
        redo: redoStack.map(cloneEntry),
      };
    },

    restore(data) {
      if (!data || typeof data !== "object") throw histError("restore", "INVALID_DATA", "History data must be an object.");
      undoStack.length = 0;
      redoStack.length = 0;
      for (const e of data.undo || []) undoStack.push(cloneEntry(e));
      for (const e of data.redo || []) redoStack.push(cloneEntry(e));
      while (undoStack.length > maxSteps) undoStack.shift();
      emit("history:restored", engine.status());
      return engine.status();
    },

    on(event, cb) {
      if (typeof cb !== "function") throw histError("on", "INVALID_LISTENER", "Listener must be a function.");
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => engine.off(event, cb);
    },

    off(event, cb) {
      const set = listeners.get(event);
      if (!set) return;
      if (cb) { set.delete(cb); if (set.size === 0) listeners.delete(event); }
      else listeners.delete(event);
    },

    destroy() {
      undoStack.length = 0;
      redoStack.length = 0;
      listeners.clear();
    },
  };

  return engine;
}

export default createHistoryEngine;
