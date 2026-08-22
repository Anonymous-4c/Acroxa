// src/modules/link.js — Hyperlink mark

import { applyMark, removeMark } from "../editing.js";
import { isCollapsed } from "../selection.js";

export function link(options = {}) {
  return {
    name: "link",
    settings: { ...options },

    commands: {
      setLink(url) {
        const editor = this.editor;
        if (!editor.selection || isCollapsed(editor.selection)) return;
        // Single capability gate — see engine.canUseMark().
        if (!editor.canUseMark("link")) return;

        editor.utils.transaction((tr) => {
          // Replace any existing link on the range first so we never stack
          // two link marks on one text node.
          const cleared = removeMark(editor.doc, editor.selection, "link");
          for (const step of cleared.steps) tr.steps.push(step);
          const applied = applyMark(editor.doc, editor.selection, {
            type: "link",
            attrs: { href: url },
          });
          for (const step of applied.steps) tr.steps.push(step);
          tr.setSelection(editor.selection);
        });
      },

      removeLink() {
        const editor = this.editor;
        if (!editor.selection || isCollapsed(editor.selection)) return;
        editor.utils.transaction((tr) => {
          const sub = removeMark(editor.doc, editor.selection, "link");
          for (const step of sub.steps) tr.steps.push(step);
          tr.setSelection(editor.selection);
        });
      },

      getLinkHref() {
        const editor = this.editor;
        if (!editor.selection) return null;
        const node = editor.utils.getNode(editor.selection.anchor.path);
        const mark = (node?.marks || []).find((m) => m.type === "link");
        return mark?.attrs?.href ?? null;
      },
    },

    contextMenu: [],

    // Does not widen the schema; see basicMarks for the rationale.
    onEnable(editor) {},
    onDisable(editor) {},
    onDestroy(editor) {},
  };
}
