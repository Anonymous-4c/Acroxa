// acrx/assets/js/editor/engines/editor-state-engine.js
//
// ENGINE 45 — Editor State Engine (headless coordinator).
// Central runtime state composition — document identity, dirty/saving flags,
// viewport/device/mode, preview state, selection/focus mirrors and history
// depth — WITHOUT absorbing other engines' responsibilities. It subscribes to
// their events and calls their APIs; all editing still happens in the owners.

export const EDITOR_STATE_VERSION = "1.0.0";
export const ENGINE_ID = "editor-state";

const VIEWPORTS = new Set(["desktop", "tablet", "mobile"]);
const MODES = new Set(["edit", "preview", "readonly"]);

function stateError(operation, code, message) {
  const err = new Error(message);
  err.name = "EditorStateError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

export function createEditorState(options = {}) {
  const doc = options.document || null;
  const selection = options.selection || null;
  const history = options.history || null;
  const focus = options.focus || null;

  const state = {
    documentId: options.documentId || null,
    postType: options.postType || "post",
    title: options.title || "",
    status: options.status || "draft",
    dirty: false,
    saving: false,
    lastSavedAt: null,
    autosave: options.autosave !== false,
    viewport: "desktop",
    zoom: 100,
    mode: "edit",
    previewDevice: null,
    selection: selection ? selection.get() : null,
    focusedId: null,
    historyDepth: history ? history.status() : { undoDepth: 0, redoDepth: 0, canUndo: false, canRedo: false },
  };

  const listeners = new Set();
  const unsubs = [];

  function notify(reason) {
    const snap = engine.snapshot();
    for (const cb of [...listeners]) {
      try { cb({ engine: ENGINE_ID, event: "state:changed", reason, state: snap }); } catch (err) {
        if (typeof console !== "undefined") console.error("[editor-state] listener threw:", err);
      }
    }
  }

  // Coordinator subscriptions (read-only mirrors; never write back).
  if (doc && typeof doc.on === "function") {
    unsubs.push(doc.on("node:inserted", () => { state.dirty = true; notify("document"); }));
    unsubs.push(doc.on("node:removed", () => { state.dirty = true; notify("document"); }));
    unsubs.push(doc.on("node:moved", () => { state.dirty = true; notify("document"); }));
    unsubs.push(doc.on("node:updated", () => { state.dirty = true; notify("document"); }));
    unsubs.push(doc.on("node:replaced", () => { state.dirty = true; notify("document"); }));
    unsubs.push(doc.on("document:restored", () => { state.dirty = true; notify("document"); }));
  }
  if (selection && typeof selection.subscribe === "function") {
    unsubs.push(selection.subscribe((ctx) => {
      state.selection = ctx.selection;
      notify("selection");
    }));
  }
  if (focus && typeof focus.subscribe === "function") {
    unsubs.push(focus.subscribe((ctx) => {
      state.focusedId = ctx.current ? ctx.current.id : null;
      notify("focus");
    }));
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return EDITOR_STATE_VERSION; },

    get(key) {
      if (!(key in state)) throw stateError("get", "UNKNOWN_KEY", `Unknown state key "${key}".`);
      return JSON.parse(JSON.stringify(state[key]));
    },

    setTitle(title) {
      state.title = String(title || "");
      state.dirty = true;
      notify("title");
      return state.title;
    },

    setStatus(status) {
      if (!["draft", "published", "scheduled", "archived"].includes(status)) {
        throw stateError("setStatus", "INVALID_STATUS", `Unknown status "${status}".`);
      }
      state.status = status;
      state.dirty = true;
      notify("status");
      return status;
    },

    setViewport(viewport, zoom) {
      if (!VIEWPORTS.has(viewport)) throw stateError("setViewport", "INVALID_VIEWPORT", `Unknown viewport "${viewport}".`);
      state.viewport = viewport;
      if (zoom !== undefined) {
        if (typeof zoom !== "number" || zoom < 25 || zoom > 400) throw stateError("setViewport", "INVALID_ZOOM", "Zoom must be between 25 and 400.");
        state.zoom = zoom;
      }
      notify("viewport");
      return { viewport: state.viewport, zoom: state.zoom };
    },

    setMode(mode) {
      if (!MODES.has(mode)) throw stateError("setMode", "INVALID_MODE", `Unknown mode "${mode}".`);
      state.mode = mode;
      notify("mode");
      return mode;
    },

    setPreviewDevice(device) {
      state.previewDevice = device || null;
      notify("preview");
      return state.previewDevice;
    },

    setSaving(on) {
      state.saving = !!on;
      if (on) return state.saving;
      notify("saving");
      return state.saving;
    },

    markSaved() {
      state.dirty = false;
      state.saving = false;
      state.lastSavedAt = new Date().toISOString();
      if (history) state.historyDepth = history.status();
      notify("saved");
      return state.lastSavedAt;
    },

    markClean() {
      state.dirty = false;
      notify("clean");
    },

    isDirty() {
      return state.dirty;
    },

    refreshHistory() {
      if (history) {
        state.historyDepth = history.status();
        notify("history");
      }
      return JSON.parse(JSON.stringify(state.historyDepth));
    },

    snapshot() {
      const snap = JSON.parse(JSON.stringify(state));
      snap.document = doc ? { id: doc.id || null, rev: doc.rev, size: doc.size, rootId: doc.rootId } : null;
      return snap;
    },

    subscribe(cb) {
      if (typeof cb !== "function") throw stateError("subscribe", "INVALID_LISTENER", "Listener must be a function.");
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    destroy() {
      for (const off of unsubs) {
        try { off(); } catch { /* already torn down */ }
      }
      unsubs.length = 0;
      listeners.clear();
    },
  };

  return engine;
}

export default createEditorState;
