// acrx/assets/js/editor/app/canvas/clipboard-ui.js
//
// Structured copy/paste: block selections serialize through the clipboard
// engine's internal format (type, data, children preserved); paste generates
// fresh IDs via the insertion engine. Plain-text selections keep native
// rich-text semantics and paste as paragraphs.

import { fromEngineNode } from "../core/model.js";

let ctx = null;

export function initClipboard(shared) {
  ctx = shared;
  document.addEventListener("copy", onCopy);
  document.addEventListener("cut", onCut);
  document.addEventListener("paste", onPaste);
}

function activeInCanvas() {
  if (!ctx.isActive()) return false;
  const ae = document.activeElement;
  // Native inputs/textareas keep native behavior.
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return true;
  return !!ae && !!ctx.canvas().contains(ae);
}

function selectedSubtrees() {
  const ids = ctx.multiSelectedIds();
  const doc = ctx.editor.document;
  return ids.map((id) => doc.getNode(id)).filter(Boolean).map((n) => JSON.parse(JSON.stringify(n)));
}

function onCopy(event) {
  if (!activeInCanvas()) return;
  const domSel = window.getSelection();
  if (domSel && !domSel.isCollapsed && domSel.toString().trim() &&
    !ctx.editor.engines.selection.selectedBlockIds().length) {
    return; // text selection: native copy
  }
  const trees = selectedSubtrees();
  if (trees.length === 0) return;
  event.preventDefault();
  const transfer = ctx.editor.engines.clipboard.copy(trees, "blocks");
  event.clipboardData.setData("text/plain", transfer["text/plain"]);
  try {
    event.clipboardData.setData("application/x-acroxa", transfer["application/x-acroxa"]);
  } catch { /* some browsers restrict custom types */ }
  ctx.toast(`Copied ${trees.length} block${trees.length === 1 ? "" : "s"}`, "success");
}

function onCut(event) {
  if (!activeInCanvas()) return;
  const domSel = window.getSelection();
  if (domSel && !domSel.isCollapsed && domSel.toString().trim()) return; // native
  const trees = selectedSubtrees();
  if (trees.length === 0) return;
  event.preventDefault();
  const transfer = ctx.editor.engines.clipboard.cut(trees, "blocks");
  event.clipboardData.setData("text/plain", transfer["text/plain"]);
  try {
    event.clipboardData.setData("application/x-acroxa", transfer["application/x-acroxa"]);
  } catch { /* ignore */ }
  for (const t of trees) ctx.deleteBlock(t.id, { silent: true });
  ctx.afterStructuralChange({});
  ctx.toast(`Cut ${trees.length} block${trees.length === 1 ? "" : "s"}`, "success");
}

async function onPaste(event) {
  if (!activeInCanvas()) return;
  const ae = document.activeElement;
  const inEditable = ae && ae.isContentEditable && ctx.canvas().contains(ae);
  const dt = event.clipboardData;
  if (!dt) return;
  const internal = tryInternal(dt);
  if (internal) {
    event.preventDefault();
    ctx.pasteNodes(internal);
    return;
  }
  const html = dt.getData("text/html");
  const text = dt.getData("text/plain");
  if (!html && !text) return;
  if (inEditable) {
    // Single-paragraph payloads land at the caret with marks intact (P0-03);
    // single-line plain text keeps native behavior; anything structural
    // escalates to block-level insertion below.
    const singleLinePlain = text && !html && !/\n/.test(text);
    if (!singleLinePlain) {
      const wrap = ae.closest ? ae.closest(".block-wrap") : null;
      const blockId = wrap?.getAttribute("data-for-block-id") || ae.getAttribute("data-block-id");
      if (blockId && ctx.pasteInline(blockId, ae, html, text)) {
        event.preventDefault();
        return;
      }
    } else {
      return; // plain typing paste: native
    }
  }
  event.preventDefault();
  if (html) {
    ctx.pasteHtml(html);
  } else if (text) {
    ctx.pasteText(text);
  }
}

function tryInternal(dt) {
  const clip = ctx.editor.engines.clipboard;
  const map = {};
  for (const mime of dt.types || []) {
    try { map[mime] = dt.getData(mime); } catch { /* ignore */ }
  }
  try {
    const out = clip.paste(map);
    if (out && out.kind === "internal") return out.data;
  } catch { /* no usable representation */ }
  return null;
}

export function blocksToInternal(ids) {
  const doc = ctx.editor.document;
  return ids.map((id) => doc.getNode(id)).filter(Boolean);
}

export default { initClipboard, blocksToInternal };
