// acrx/assets/js/editor/app/canvas/keyboard.js
//
// Central keyboard semantics (blueprint Phase 5): Enter splits, Backspace
// merges/deletes, arrows navigate, Tab indents lists, modifiers trigger
// marks/undo/save/palette. All mutations flow through controller commands so
// history stays coherent. Focus is preserved across block operations.

import { inlineToText } from "../core/model.js";
import { activeMarks } from "./text.js";
import { canApplyMark } from "../../engines/index.js";

let ctx = null;

export function initKeyboard(shared) {
  ctx = shared;
}

function focusedEditable() {
  const ae = document.activeElement;
  if (!ae || !ctx.canvas().contains(ae)) return null;
  if (ae.id === "canvas-main-input") return { el: ae, blockId: null, main: true };
  const editable = ae.closest ? ae.closest("[contenteditable='true']") : null;
  if (!editable) return null;
  const wrap = editable.closest(".block-wrap");
  const blockId = wrap ? wrap.getAttribute("data-for-block-id") : editable.getAttribute("data-block-id");
  return { el: editable, blockId, main: false };
}

function caretOffset(editable) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(editable);
  pre.setEnd(range.startContainer, range.startOffset);
  return { at: pre.toString().length, collapsed: range.collapsed, range };
}

function topLevelSiblings(blockId) {
  const order = ctx.topLevelOrder();
  const idx = order.indexOf(blockId);
  return { order, idx, prev: idx > 0 ? order[idx - 1] : null, next: idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null };
}

function focusEditable(blockId, offset) {
  requestAnimationFrame(() => {
    const wrap = ctx.canvas().querySelector(`.block-wrap[data-for-block-id="${CSS.escape(blockId)}"] [contenteditable='true']`);
    if (!wrap) return;
    wrap.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      let remaining = Math.max(0, offset ?? wrap.textContent.length);
      let placed = false;
      const walk = (node) => {
        if (placed) return;
        if (node.nodeType === 3) {
          if (remaining <= node.textContent.length) {
            range.setStart(node, remaining);
            range.collapse(true);
            placed = true;
            return;
          }
          remaining -= node.textContent.length;
          return;
        }
        for (const child of node.childNodes) walk(child);
      };
      walk(wrap);
      if (!placed) { range.selectNodeContents(wrap); range.collapse(false); }
      sel.removeAllRanges();
      sel.addRange(range);
    } catch { /* focus is best-effort */ }
  });
}

function isTextish(block) {
  return block && (block.type === "paragraph" || block.type === "heading" || block.type === "blockquote" || block.type === "codeblock" || block.type === "alert");
}

export function bindKeyboard() {
  document.addEventListener("keydown", (event) => {
    if (!ctx.isActive()) return;
    // Global shortcuts work anywhere inside the editor shell.
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      ctx.saveNow();
      return;
    }
    if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      ctx.undo();
      return;
    }
    if ((mod && event.key.toLowerCase() === "y") || (mod && event.shiftKey && event.key.toLowerCase() === "z")) {
      event.preventDefault();
      ctx.redo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      // Palette toggle works from anywhere, including inside its own input.
      event.preventDefault();
      ctx.togglePalette();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "\\") {
      event.preventDefault();
      ctx.toggleSidebar("left");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "\\") {
      event.preventDefault();
      ctx.toggleSidebar("right");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && ["1", "2", "3"].includes(event.key)) {
      event.preventDefault();
      ctx.showPanel("left", ["layers", "widgets", "patterns"][Number(event.key) - 1]);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      const id = ctx.currentBlockId();
      if (id) ctx.duplicateBlock(id);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "g") {
      event.preventDefault();
      ctx.groupSelection("group");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "g") {
      event.preventDefault();
      ctx.ungroup();
      return;
    }
    if (event.key === "Escape") {
      if (ctx.closeTopmost()) { event.preventDefault(); return; }
      ctx.clearSelection();
      return;
    }

    // Delete/Backspace with a block (not text) selection removes blocks.
    if ((event.key === "Delete" || event.key === "Backspace") && !mod) {
      const ae = document.activeElement;
      const inText = ae && (ae.isContentEditable || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");
      if (!inText && ctx.editor.engines.selection.get().mode === "blocks") {
        event.preventDefault();
        ctx.deleteBlocks(ctx.multiSelectedIds());
        return;
      }
    }

    const focused = focusedEditable();
    if (!focused) return;

    // Mark shortcuts inside text.
    if (mod && !focused.main) {
      const key = event.key.toLowerCase();
      const markMap = { b: "bold", i: "italic", u: "underline" };
      const strikeKey = event.shiftKey && key === "x";
      const mark = strikeKey ? "strikethrough" : markMap[key];
      if (mark) {
        event.preventDefault();
        // Same rule as the toolbar: incompatible marks are refused with
        // feedback instead of silently corrupting code spans.
        if (!canApplyMark(activeMarks(focused.blockId), mark)) {
          ctx.toast("Remove code formatting first — code can't mix with rich marks", "info");
          return;
        }
        ctx.toggleMark(focused.blockId, mark);
        return;
      }
    }

    if (focused.main) {
      if (event.key === "Enter") {
        event.preventDefault();
        ctx.insertFromMainInput(focused.el);
      }
      return;
    }

    const block = ctx.getBlock(focused.blockId);
    if (!block) return;
    const { prev, next } = topLevelSiblings(block.id);

    if (event.key === "Enter" && !mod) {
      event.preventDefault();
      // Lists (Notion/TipTap parity): Enter = new item of the same type,
      // Shift+Enter = soft newline inside the item, empty item + Enter =
      // exit the list into a paragraph. Paragraphs keep Enter = split block.
      if (block.type === "bulletList" || block.type === "orderedList") {
        if (event.shiftKey) {
          document.execCommand("insertLineBreak");
          ctx.commitEditable(block.id, focused.el);
          return;
        }
        if (ctx.splitListItemSmart) {
          ctx.splitListItemSmart(block.id, focused.el);
          return;
        }
      }
      if (event.shiftKey) {
        document.execCommand("insertLineBreak");
        ctx.commitEditable(block.id, focused.el);
        return;
      }
      ctx.splitBlock(block.id, focused.el);
      return;
    }

    if (event.key === "Backspace" && !mod) {
      const pos = caretOffset(focused.el);
      if (pos && pos.at === 0 && pos.collapsed) {
        // At block start: merge with previous or delete when empty.
        const text = inlineToText(block.content) + (ctx.extraTextOf ? ctx.extraTextOf(block, focused.el) : "");
        if (!text) {
          event.preventDefault();
          ctx.deleteBlock(block.id, { focusPrev: true });
          return;
        }
        if (prev && isTextish(ctx.getBlock(prev))) {
          event.preventDefault();
          ctx.mergeBlockInto(block.id, prev);
          return;
        }
      }
      return;
    }

    if (event.key === "Delete" && !mod) {
      const pos = caretOffset(focused.el);
      const len = (focused.el.textContent || "").length;
      if (pos && pos.at === len && pos.collapsed && next && isTextish(ctx.getBlock(next))) {
        event.preventDefault();
        ctx.mergeBlockInto(next, block.id);
      }
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const nav = ctx.arrowNavigate(block.id, focused.el, event.key === "ArrowUp" ? -1 : 1);
      if (nav) event.preventDefault();
      return;
    }

    if (event.key === "Tab" && (block.type === "bulletList" || block.type === "orderedList")) {
      event.preventDefault();
      ctx.indentList(block.id, focused.el, event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "Tab" && block.type === "table") {
      // TipTap parity: Tab / Shift+Tab walks cells, never leaves the editor.
      event.preventDefault();
      if (!ctx.tableNextCell(block.id, focused.el, event.shiftKey ? -1 : 1)) {
        if (!event.shiftKey) ctx.tableAddRow(block.id, focused.el, "after");
      }
      return;
    }

    if (mod && event.key.toLowerCase() === "a" && !event.shiftKey) {
      // First Ctrl+A selects block text (native); a second press selects all blocks.
      if (ctx.selectAllBlocks(focused.el)) event.preventDefault();
    }
  });
}

export { focusEditable };
export default { initKeyboard, bindKeyboard, focusEditable };
