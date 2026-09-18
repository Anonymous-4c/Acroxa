// acrx/assets/js/editor/engines/keyboard-engine.js
//
// ENGINE 37 — Keyboard/Input Engine (headless).
// Central editor keyboard semantics: canonical combo normalization
// (ctrl/shift/alt + key, platform-aware mod), shortcut registry mapping combos
// to command ids, input normalization and editing-intent classification.
// Consumes/produces plain data — global key handling is never buried in widgets.

export const KEYBOARD_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "keyboard";

function kbError(operation, code, message) {
  const err = new Error(message);
  err.name = "KeyboardError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

const KEY_ALIASES = {
  " ": "space", spacebar: "space", esc: "escape", del: "delete",
  up: "arrowup", down: "arrowdown", left: "arrowleft", right: "arrowright",
  return: "enter", cmd: "meta", command: "meta", ctrl: "ctrl", control: "ctrl",
  alt: "alt", option: "alt", shift: "shift", super: "meta", win: "meta",
};

function canonicalKey(raw) {
  const k = String(raw || "").toLowerCase();
  return KEY_ALIASES[k] || k;
}

// Canonical combo: modifiers sorted ctrl+alt+shift+meta, then the key.
// "mod" is the platform primary modifier (cmd on macOS, ctrl elsewhere).
export function normalizeCombo(input, platform) {
  const isMac = platform === "mac" || platform === "darwin";
  let parts = [];
  if (typeof input === "string") {
    parts = input.split("+").map((p) => p.trim()).filter(Boolean);
  } else if (input && typeof input === "object") {
    if (input.ctrlKey || input.ctrl) parts.push("ctrl");
    if (input.altKey || input.alt) parts.push("alt");
    if (input.shiftKey || input.shift) parts.push("shift");
    if (input.metaKey || input.meta) parts.push("meta");
    parts.push(input.key !== undefined ? input.key : input.code);
  } else {
    throw kbError("normalizeCombo", "INVALID_INPUT", "Combo must be a string or key-event-like object.");
  }
  parts = parts.map((p) => {
    const c = canonicalKey(p);
    if (c === "mod") return isMac ? "meta" : "ctrl";
    return c;
  });
  const mods = [];
  for (const m of ["ctrl", "alt", "shift", "meta"]) {
    if (parts.includes(m) && !mods.includes(m)) mods.push(m);
  }
  const keys = parts.filter((p) => !["ctrl", "alt", "shift", "meta"].includes(p));
  if (keys.length === 0) throw kbError("normalizeCombo", "INVALID_COMBO", "Combo requires a non-modifier key.");
  if (keys.length > 1) throw kbError("normalizeCombo", "INVALID_COMBO", "Combo accepts a single non-modifier key.");
  return [...mods, keys[0]].join("+");
}

export function createKeyboardEngine(options = {}) {
  const platform = options.platform || "other";
  const shortcuts = new Map(); // combo -> { commandId, when? }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return KEYBOARD_ENGINE_VERSION; },
    get platform() { return platform; },

    normalize(input) {
      return normalizeCombo(input, platform);
    },

    registerShortcut(combo, commandId, opts = {}) {
      const canonical = normalizeCombo(combo, platform);
      if (typeof commandId !== "string" || commandId === "") {
        throw kbError("registerShortcut", "INVALID_COMMAND", "Shortcut requires a command id.");
      }
      const existed = shortcuts.has(canonical);
      shortcuts.set(canonical, { commandId, when: typeof opts.when === "function" ? opts.when : null, label: opts.label || "" });
      return { combo: canonical, replaced: existed };
    },

    unregisterShortcut(combo) {
      return shortcuts.delete(normalizeCombo(combo, platform));
    },

    // Resolve a key event (or combo string) to a command id, honoring `when`.
    resolve(input, ctx) {
      let canonical;
      try {
        canonical = normalizeCombo(input, platform);
      } catch {
        return null;
      }
      const entry = shortcuts.get(canonical);
      if (!entry) return null;
      if (entry.when) {
        try {
          if (!entry.when(ctx || {})) return null;
        } catch {
          return null;
        }
      }
      return entry.commandId;
    },

    shortcutFor(commandId) {
      for (const [combo, entry] of shortcuts) {
        if (entry.commandId === commandId) return combo;
      }
      return null;
    },

    listShortcuts() {
      return [...shortcuts.entries()]
        .map(([combo, e]) => ({ combo, commandId: e.commandId, label: e.label }))
        .sort((a, b) => (a.combo < b.combo ? -1 : 1));
    },

    // Editing-intent classification shared by text handling and commands.
    classifyIntent(input) {
      let canonical;
      try {
        canonical = normalizeCombo(input, platform);
      } catch {
        return "unknown";
      }
      const [mods, key] = [canonical.split("+").slice(0, -1), canonical.split("+").pop()];
      if (mods.length === 0) {
        if (key === "enter") return "break";
        if (key === "backspace") return "delete-backward";
        if (key === "delete") return "delete-forward";
        if (key === "tab") return "indent";
        if (key === "escape") return "cancel";
        if (key && key.startsWith("arrow")) return "navigate";
        if (key && key.length === 1) return "insert-text";
        return "unknown";
      }
      return "shortcut";
    },

    clear() {
      shortcuts.clear();
    },
  };

  return engine;
}

export default createKeyboardEngine;
