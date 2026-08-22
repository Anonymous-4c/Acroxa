// src/modules/markdown.js — Markdown shortcut system
//
// Gating rule (spec 9.2): a shortcut fires ONLY if, at the moment of typing:
//   1. this module is enabled (it is unloaded when disabled, so its handler is gone), AND
//   2. the resulting node type is currently allowed by the live schema, AND
//   3. the module that owns that node type is currently enabled.
// All three are checked live on every keystroke — nothing is cached at init,
// so editor.disable("lists") stops list markdown immediately.

import { paragraph, text } from "../model.js";

// Simple block shortcuts — triggered by Space.
// `owner` is the module that must be enabled for this rule to apply
// (null = core, always available if the node type is in the schema).
const BLOCK_RULES = [
  { pattern: /^#$/,      type: "heading",     attrs: { level: 1 }, owner: null },
  { pattern: /^##$/,     type: "heading",     attrs: { level: 2 }, owner: null },
  { pattern: /^###$/,    type: "heading",     attrs: { level: 3 }, owner: null },
  { pattern: /^####$/,   type: "heading",     attrs: { level: 4 }, owner: null },
  { pattern: /^#####$/,  type: "heading",     attrs: { level: 5 }, owner: null },
  { pattern: /^######$/, type: "heading",     attrs: { level: 6 }, owner: null },
  { pattern: /^>$/,      type: "blockquote",  attrs: {},           owner: null },
  { pattern: /^-$/,      type: "bulletList",  attrs: {},           owner: "lists" },
  { pattern: /^\*$/,     type: "bulletList",  attrs: {},           owner: "lists" },
  { pattern: /^\d+\.$/,  type: "orderedList", attrs: {},           owner: "lists" },
];

// Inline mark shortcuts — triggered by Space, applied to the wrapped span.
const INLINE_RULES = [
  { pattern: /\*\*([^*]+)\*\*$/, markType: "bold",          owner: "basicMarks" },
  { pattern: /~~([^~]+)~~$/,     markType: "strikethrough", owner: "basicMarks" },
  { pattern: /`([^`]+)`$/,       markType: "code",          owner: "basicMarks" },
  { pattern: /(?<!\*)\*([^*]+)\*$/, markType: "italic",     owner: "basicMarks" },
];

export function markdown(options = {}) {
  return {
    name: "markdown",
    settings: { enableBlocks: true, enableInline: true, ...options },

    // Live gates — delegate to the engine's single capability choke point
    // (schema AND owning-module-enabled). Never cached.
    _ownerEnabled(editor, owner) {
      if (!owner) return true;
      return editor.modules.has(owner);
    },

    _canCreateNode(editor, type) {
      return editor.canUseNode(type);
    },

    _canCreateMark(editor, type) {
      return editor.canUseMark(type);
    },

    commands: {
      // Exposed so hosts/tests can drive the same code path the keystroke uses.
      // Returns true if a shortcut fired.
      applyMarkdownShortcut() {
        return this._tryShortcut(this.editor);
      },
    },

    // Core entry point, called on Space before the space is inserted.
    _tryShortcut(editor) {
      const pos = editor.selection?.anchor;
      if (!pos) return false;

      const blockIndex = pos.path[1];
      const blockPath = ["content", blockIndex];
      const blockNode = editor.utils.getNode(blockPath);
      if (!blockNode) return false;

      const textNode = editor.utils.getNode(pos.path);
      if (!textNode || textNode.type !== "text") return false;

      const before = textNode.text.slice(0, pos.offset);

      // ── Block shortcuts: the whole block so far must be exactly the marker
      if (this.settings.enableBlocks && pos.path[3] === 0) {
        for (const rule of BLOCK_RULES) {
          if (!rule.pattern.test(before)) continue;
          // LIVE gating — both checks, every time.
          if (!this._ownerEnabled(editor, rule.owner)) continue;
          if (!this._canCreateNode(editor, rule.type)) continue;

          // Strip the marker and transform the block, in one transaction.
          const rest = textNode.text.slice(pos.offset);
          editor.utils.transaction((tr) => {
            tr.replaceNode([], blockIndex, {
              type: rule.type,
              attrs: { ...rule.attrs },
              content: rest ? [text(rest, textNode.marks)] : [],
            });
            tr.setSelection({
              anchor: { path: ["content", blockIndex, "content", 0], offset: 0 },
              head: { path: ["content", blockIndex, "content", 0], offset: 0 },
            });
          });
          return true;
        }
      }

      // ── Inline shortcuts: wrap the matched span in a mark
      if (this.settings.enableInline) {
        for (const rule of INLINE_RULES) {
          const m = before.match(rule.pattern);
          if (!m) continue;
          if (!this._ownerEnabled(editor, rule.owner)) continue;
          if (!this._canCreateMark(editor, rule.markType)) continue;

          const inner = m[1];
          const matchStart = before.length - m[0].length;
          const after = textNode.text.slice(pos.offset);
          const textIdx = pos.path[3];

          const pieces = [];
          const head = before.slice(0, matchStart);
          if (head) pieces.push(text(head, textNode.marks));
          pieces.push(text(inner, [...textNode.marks, { type: rule.markType }]));
          if (after) pieces.push(text(after, textNode.marks));
          if (pieces.length === 0) pieces.push(text("", textNode.marks));

          editor.utils.transaction((tr) => {
            tr.spliceNodes(blockPath, textIdx, pieces);
            const landing = head ? textIdx + 1 : textIdx;
            tr.setSelection({
              anchor: { path: [...blockPath, "content", landing], offset: inner.length },
              head: { path: [...blockPath, "content", landing], offset: inner.length },
            });
          });
          return true;
        }
      }

      return false;
    },

    onEnable(editor) {
      // Bind a keydown hook that runs BEFORE the space is committed.
      this._onKeyDown = (e) => {
        if (e.key !== " ") return;
        if (editor._compositionActive) return;
        if (this._tryShortcut(editor)) {
          e.preventDefault();
        }
      };
      // capture:true so we win before the engine's own input handling
      editor.element.addEventListener("keydown", this._onKeyDown, true);
    },

    onDisable(editor) {
      // Full teardown — leaves zero trace (spec §3).
      if (this._onKeyDown) {
        editor.element.removeEventListener("keydown", this._onKeyDown, true);
        this._onKeyDown = null;
      }
    },

    onDestroy(editor) {
      this.onDisable(editor);
    },
  };
}
