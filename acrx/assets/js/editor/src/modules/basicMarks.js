// src/modules/basicMarks.js — Bold, italic, underline, strikethrough, code marks

import { applyMark, removeMark } from "../editing.js";
import { isCollapsed, getStart, getEnd } from "../selection.js";

const MARKS = ["bold", "italic", "underline", "strikethrough", "code"];

// Every text node the selection actually covers, with the slice of each node
// that lies inside the range. This is the basis for a correct active-state
// test: a mark is "active" only if it covers the WHOLE selection.
function coveredTextNodes(editor, sel) {
  const doc = editor.getJSON();
  const start = getStart(sel);
  const end = getEnd(sel);

  const sBlock = start.path[1], eBlock = end.path[1];
  const sText  = start.path[3] ?? 0, eText = end.path[3] ?? 0;

  const out = [];
  for (let b = sBlock; b <= eBlock; b++) {
    const block = doc.content?.[b];
    if (!block || !Array.isArray(block.content)) continue;

    for (let i = 0; i < block.content.length; i++) {
      const node = block.content[i];
      if (!node || node.type !== "text") continue;

      // Trim to the selected slice at the two ends of the range.
      let from = 0, to = node.text.length;
      if (b === sBlock && i === sText) from = start.offset;
      if (b === eBlock && i === eText) to = end.offset;
      if (b === sBlock && i < sText) continue;
      if (b === eBlock && i > eText) continue;
      if (to <= from) continue;

      out.push({ node, from, to });
    }
  }
  return out;
}

// A mark is active only when EVERY covered text node carries it.
//
// The old implementation looked at the single node under `anchor.path`.
// After applyMark() splits "Alpha Beta Gamma" into
// ["Alpha ", "Beta"{bold}, " Gamma"], the anchor sits on the UNBOLDED
// prefix "Alpha ", so it always reported false and the command could only
// ever re-apply the mark — the toggle never turned off.
function isActive(editor, markType) {
  const sel = editor.selection;
  if (!sel) return false;

  if (isCollapsed(sel)) {
    const node = editor.utils.getNode(sel.anchor.path);
    if (!node || node.type !== "text") return false;
    return (node.marks || []).some((m) => m.type === markType);
  }

  const covered = coveredTextNodes(editor, sel);
  if (!covered.length) return false;
  return covered.every(({ node }) =>
    (node.marks || []).some((m) => m.type === markType));
}

function toggle(editor, markType) {
  if (!editor.selection || isCollapsed(editor.selection)) return false;
  if (!editor.canUseMark(markType)) return false;

  const active = isActive(editor, markType);

  editor.utils.transaction((tr) => {
    const sub = active
      ? removeMark(editor.doc, editor.selection, markType)
      : applyMark(editor.doc, editor.selection, { type: markType });
    for (const step of sub.steps) tr.steps.push(step);
    // Selection is re-derived by the engine after the split; see
    // engine.remapSelectionAfterMarks().
    tr.setMeta("marksTouched", true);
    tr.setMeta("selectionSpan", editor.utils.getSelectionSpan());
  });
  return true;
}

export function basicMarks(options = {}) {
  return {
    name: "basicMarks",
    settings: { ...options },

    commands: {
      bold()          { return toggle(this.editor, "bold"); },
      italic()        { return toggle(this.editor, "italic"); },
      underline()     { return toggle(this.editor, "underline"); },
      strikethrough() { return toggle(this.editor, "strikethrough"); },
      code()          { return toggle(this.editor, "code"); },

      // Query helper for hosts building toolbars.
      isMarkActive(markType) {
        return isActive(this.editor, markType);
      },

      removeFormat() {
        const editor = this.editor;
        if (!editor.selection || isCollapsed(editor.selection)) return false;
        editor.utils.transaction((tr) => {
          for (const markType of [...MARKS, "link"]) {
            const sub = removeMark(editor.doc, editor.selection, markType);
            for (const step of sub.steps) tr.steps.push(step);
          }
          tr.setMeta("marksTouched", true);
          tr.setMeta("selectionSpan", editor.utils.getSelectionSpan());
        });
        return true;
      },
    },

    contextMenu: [],

    // The module does NOT widen the host's schema — that would make
    // allowedMarks meaningless. Capability is the AND of schema + enabled
    // module, computed by editor.canUseMark().
    onEnable(editor) {},
    onDisable(editor) {},
    onDestroy(editor) {},
  };
}
