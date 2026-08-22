// src/modules/blocks.js — Block-type transforms (paragraph / heading / quote / code)
//
// The schema may allow "heading", "blockquote" and "codeblock", but without
// this module nothing can actually CREATE them except a markdown shortcut.
// This module provides the commands the context menu and host toolbars call.
//
// Every transform preserves the block's inline content — changing a block's
// type must never destroy the user's text.

import { paragraph, cloneNode } from "../model.js";

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

// The block the caret currently sits in. Works for both a text-level caret
// and a block-level one (empty block).
function currentBlock(editor) {
  const pos = editor.selection?.anchor;
  if (!pos || !Array.isArray(pos.path)) return null;
  if (pos.path[0] !== "content" || typeof pos.path[1] !== "number") return null;
  const blockIndex = pos.path[1];
  const blockPath = ["content", blockIndex];
  const node = editor.utils.getNode(blockPath);
  if (!node) return null;
  return { blockIndex, blockPath, node };
}

// Inline content of a block, flattened out of any wrapper (e.g. a list item).
function inlineOf(node) {
  if (!node) return [];
  const out = [];
  for (const child of node.content || []) {
    if (child.type === "text") out.push(cloneNode(child));
    else out.push(...inlineOf(child));
  }
  return out;
}

// Replace the current block with `build(inline)`, keeping the caret in place.
function transform(editor, type, build) {
  if (!editor.canUseNode(type)) return false;
  const cur = currentBlock(editor);
  if (!cur) return false;

  const inline = inlineOf(cur.node);
  const replacement = build(inline);

  editor.utils.transaction((tr) => {
    tr.replaceNode([], cur.blockIndex, replacement);
    // Land the caret at the end of the (preserved) text.
    const lastIdx = Math.max(0, replacement.content.length - 1);
    const lastLen = replacement.content[lastIdx]?.text?.length ?? 0;
    tr.setResolvedSelection({
      anchor: { path: ["content", cur.blockIndex, "content", lastIdx], offset: lastLen },
      head:   { path: ["content", cur.blockIndex, "content", lastIdx], offset: lastLen },
    });
  });
  return true;
}

export function blocks(options = {}) {
  return {
    name: "blocks",
    settings: { ...options },

    commands: {
      setParagraph() {
        return transform(this.editor, "paragraph",
          (inline) => ({ type: "paragraph", attrs: {}, content: inline }));
      },

      setHeading(level = 1) {
        const lv = HEADING_LEVELS.includes(Number(level)) ? Number(level) : 1;
        return transform(this.editor, "heading",
          (inline) => ({ type: "heading", attrs: { level: lv }, content: inline }));
      },

      toggleBlockquote() {
        const cur = currentBlock(this.editor);
        if (!cur) return false;
        return cur.node.type === "blockquote"
          ? this.editor.setParagraph()
          : transform(this.editor, "blockquote",
              (inline) => ({ type: "blockquote", attrs: {}, content: inline }));
      },

      toggleCodeblock() {
        const cur = currentBlock(this.editor);
        if (!cur) return false;
        return cur.node.type === "codeblock"
          ? this.editor.setParagraph()
          : transform(this.editor, "codeblock",
              (inline) => ({ type: "codeblock", attrs: {}, content: inline }));
      },

      // Introspection for host toolbars.
      getBlockType() {
        const cur = currentBlock(this.editor);
        return cur ? cur.node.type : null;
      },

      getHeadingLevel() {
        const cur = currentBlock(this.editor);
        return cur?.node.type === "heading" ? (cur.node.attrs?.level ?? 1) : null;
      },
    },

    contextMenu: [
      { id: "block-paragraph", label: "Paragraph",  command: "setParagraph",    when: "single-node", type: "settings" },
      { id: "block-quote",     label: "Blockquote", command: "toggleBlockquote", when: "single-node", type: "settings" },
      { id: "block-code",      label: "Code Block", command: "toggleCodeblock",  when: "single-node", type: "settings" },
    ],

    onEnable(editor) {},
    onDisable(editor) {},
    onDestroy(editor) {},
  };
}
