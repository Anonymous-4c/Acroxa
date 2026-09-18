// acrx/assets/js/editor/app/canvas/text.js
//
// Text engine UI: contentEditable <-> inline-node model sync, marks and links.
// DOM is parsed into the canonical inline model on every input (marks derived
// from actual tags, never guessed); model→DOM happens only on structural
// renders, so typing never fights the caret.

import { applyMark, removeMark, normalizeContent, fromInlineHTML, sliceInline as sliceInlineNodes, plainLength as plainLengthOf, classifyLink } from "../../engines/index.js";

export const MARK_DEFS = {
  bold: { tag: "strong", label: "Bold", shortcut: "Ctrl+B" },
  italic: { tag: "em", label: "Italic", shortcut: "Ctrl+I" },
  underline: { tag: "u", label: "Underline", shortcut: "Ctrl+U" },
  strikethrough: { tag: "s", label: "Strike", shortcut: "Ctrl+Shift+X" },
  code: { tag: "code", label: "Code", shortcut: "" },
  link: { tag: "a", label: "Link", shortcut: "" },
};

const TAG_TO_MARK = {
  STRONG: "bold", B: "bold",
  EM: "italic", I: "italic",
  U: "underline",
  S: "strikethrough", STRIKE: "strikethrough", DEL: "strikethrough",
  CODE: "code",
};

let ctx = null;

export function initText(shared) {
  ctx = shared;
}

// Parse an editable element into inline nodes, inheriting marks from tags.
export function domToInline(root) {
  const out = [];
  const walk = (node, marks) => {
    if (node.nodeType === 3) {
      if (node.textContent) out.push({ type: "text", text: node.textContent, marks: [...marks] });
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    const next = [...marks];
    if (TAG_TO_MARK[tag] && !next.some((m) => m.type === TAG_TO_MARK[tag])) {
      next.push({ type: TAG_TO_MARK[tag] });
    }
    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      // Pasted/typed anchors obey the same safety rule as the import engine:
      // unsafe protocols and empty hrefs degrade to plain text rather than a
      // link mark (which would render a clickable javascript: URL). The
      // anchor's text is always preserved — only the link mark is dropped.
      let nextMarks = next;
      if (href) {
        const kind = classifyLink(href).kind;
        if (kind !== "unsafe" && kind !== "invalid" && kind !== "empty") {
          nextMarks = [...next, { type: "link", attrs: { href } }];
        }
      }
      for (const child of node.childNodes) walk(child, nextMarks);
      return;
    }
    if (tag === "BR") {
      out.push({ type: "text", text: "\n", marks: [...marks] });
      return;
    }
    if (tag === "DIV" || tag === "P" || tag === "LI") {
      const had = out.length > 0;
      for (const child of node.childNodes) walk(child, next);
      if (had && out.length > 0) {
        const last = out[out.length - 1];
        if (!last.text.endsWith("\n")) last.text += "\n";
      }
      return;
    }
    for (const child of node.childNodes) walk(child, next);
  };
  for (const child of root.childNodes) walk(child, []);
  return normalizeContent(out.filter((n) => n.text !== ""));
}

// Absolute char offsets of the window selection clamped inside an editable.
export function selectionOffsets(editable) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return null;
  const before = (node, offset) => {
    const r = document.createRange();
    r.selectNodeContents(editable);
    r.setEnd(node, offset);
    return r.toString().length;
  };
  return {
    from: before(range.startContainer, range.startOffset),
    to: before(range.endContainer, range.endOffset),
    collapsed: range.collapsed,
  };
}

export function setCaret(editable, offset) {
  editable.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  let remaining = Math.max(0, offset);
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
  walk(editable);
  if (!placed) {
    range.selectNodeContents(editable);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

// Select [from, to) inside an editable (model char offsets == DOM text).
export function setSelectionRange(editable, from, to) {
  const sel = window.getSelection();
  if (!sel || !editable) return false;
  const a = Math.max(0, Math.min(from, to));
  const b = Math.max(0, Math.max(from, to));
  const range = document.createRange();
  let acc = 0;
  let started = false;
  let done = false;
  const walk = (node) => {
    if (done) return;
    if (node.nodeType === 3) {
      const len = node.textContent.length;
      if (!started && acc + len >= a) {
        range.setStart(node, Math.min(a - acc, len));
        started = true;
      }
      if (started && acc + len >= b) {
        range.setEnd(node, Math.min(b - acc, len));
        done = true;
        return;
      }
      acc += len;
      return;
    }
    for (const child of node.childNodes) {
      walk(child);
      if (done) return;
    }
  };
  walk(editable);
  if (!started) return false;
  try {
    if (!done) {
      range.selectNodeContents(editable);
      range.collapse(false);
    }
  } catch { return false; }
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

// ─── Placeholder state ────────────────────────────────────────────────
// The placeholder is owned by document state, not by the `:empty`
// pseudo-class: browsers leave `<br>`, empty `<p>`/`<div>` wrappers and
// zero-width spaces behind, so `:empty` keeps matching (or stops matching)
// at the wrong times. Every `[data-placeholder]` editable instead carries
// an explicit `is-empty` class, synced here on input, blur and render.

// Elements that count as real content even with no text.
const CONTENT_SELECTOR = "img, video, audio, iframe, table, ul, ol, input, .acrx-gallery-item";

export function isEmptyEditable(el) {
  if (!el) return true;
  const text = (el.textContent || "").replace(/[\u200B\uFEFF\xA0]/g, "").trim();
  if (text) return false;
  return !el.querySelector(CONTENT_SELECTOR);
}

export function syncEmptyState(editable) {
  if (!editable || !editable.hasAttribute || !editable.hasAttribute("data-placeholder")) return true;
  const empty = isEmptyEditable(editable);
  editable.classList.toggle("is-empty", empty);
  return empty;
}

export function syncCanvasEmptyStates(canvas) {
  if (!canvas || !canvas.querySelectorAll) return;
  canvas.querySelectorAll("[data-placeholder]").forEach(syncEmptyState);
}

// Collapse whitespace-only residue (`<br>`, empty wrappers) back to a true
// empty editable so caret, serialization and placeholders stay truthful.
export function normalizeEmptyEditable(editable) {
  if (!editable) return false;
  if (!isEmptyEditable(editable)) return false;
  if (editable.innerHTML !== "") editable.innerHTML = "";
  editable.classList.add("is-empty");
  return true;
}

function editableFor(blockId, childSuffix) {
  const canvas = ctx.canvas();
  if (childSuffix) {
    return canvas.querySelector(`.block-child[data-child-id="${CSS.escape(childSuffix)}"]`);
  }
  const wrap = canvas.querySelector(`.block-wrap[data-for-block-id="${CSS.escape(blockId)}"]`);
  return wrap ? wrap.querySelector("[contenteditable='true']") : null;
}

// Input handler: DOM -> model. No re-render; caller adds block to skipIds.
export function handleInput(blockId, editable) {
  const block = ctx.getBlock(blockId);
  if (!block) return;
  const inline = domToInline(editable);
  if (block.type === "bulletList" || block.type === "orderedList") {
    const itemIndex = Number(editable.getAttribute("data-item-index") || 0);
    const items = [...(block.data.items || [])];
    // Items live in the inline model (P0-02): commit nodes, never plain text.
    items[itemIndex] = inline;
    ctx.setBlockData(blockId, { items }, { record: false, sync: true, light: true });
    // Keep the item placeholder truthful while typing: without this the
    // li.is-empty class only corrects on full render (e.g. after Enter).
    syncEmptyState(editable);
    return;
  }
  if (editable.hasAttribute("data-row")) {
    const row = Number(editable.getAttribute("data-row"));
    const rows = (block.data.rows || []).map((r) => [...r]);
    const col = Array.from(editable.parentElement.children).indexOf(editable);
    if (rows[row]) {
      rows[row][col] = inline;
      ctx.setBlockData(blockId, { rows }, { record: false, sync: true, light: true });
    }
    // Same placeholder truthfulness paragraphs and list items get (U-36).
    syncEmptyState(editable);
    return;
  }
  if (editable.hasAttribute("data-hero-field") || editable.closest("[data-hero-field]")) {
    return; // hero/cta text edits commit on blur (settings-owned)
  }
  if (editable.closest(".acrx-btn") && editable.getAttribute("data-child-id")?.endsWith("-btn-text")) {
    ctx.setBlockData(blockId, { text: inline.map((n) => n.text).join("") }, { record: false, sync: true, light: true });
    return;
  }
  ctx.setBlockData(blockId, { content: inline }, { record: false, sync: true, light: true });
  syncEmptyState(editable);
}

// Toggle a mark over the current selection inside a block's editable.
// The model update is canonical; the same mark is applied straight to the
// live DOM range so the user sees it instantly (a full re-render would have
// to skip the focused editable to protect the caret, showing nothing).
// Child-aware (P0-02): the editable holding the selection decides the target
// nodes — list item, table cell, or block content — so formatting item 3 no
// longer measures against item 1.
export function toggleMark(blockId, markType, attrs) {
  const block = ctx.getBlock(blockId);
  if (!block) return false;
  const editable = focusedEditableIn(blockId);
  if (!editable) {
    ctx.toast("Click into the text first", "info");
    return false;
  }
  const sel = selectionOffsets(editable);
  if (!sel || sel.from === sel.to) {
    ctx.toast(sel ? "Select text to format" : "Click into the text first", "info");
    return false;
  }
  const target = markTarget(block, editable);
  if (!target) {
    ctx.toast("Formatting isn't available here", "info");
    return false;
  }
  const total = plainLengthOf(target.nodes);
  const from = Math.max(0, Math.min(sel.from, sel.to, total));
  const to = Math.max(0, Math.min(Math.max(sel.from, sel.to), total));
  if (to <= from) {
    ctx.toast("Select text to format", "info");
    return false;
  }
  const mark = attrs ? { type: markType, attrs } : { type: markType };
  const active = target.nodes.some((n) => (n.marks || []).some((m) => m.type === markType));
  const next = active
    ? removeMark(target.nodes, from, to, markType)
    : applyMark(target.nodes, from, to, mark);
  target.commit(next, `${active ? "Remove" : "Apply"} ${markType}`);
  // Keep the range selected (Google Docs behavior) so marks chain
  // (bold, then italic) without re-selecting; caret callers pass through.
  repaintRangeFromModel(editable, next, from, to, { select: true });
  return true;
}

// The editable holding the live selection inside a block's wrap (falls back
// to the first editable when nothing is selected there yet).
export function focusedEditableIn(blockId) {
  const canvas = ctx.canvas();
  const wrap = canvas.querySelector(`.block-wrap[data-for-block-id="${CSS.escape(blockId)}"]`);
  if (!wrap) return null;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && sel.anchorNode) {
    const host = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const editable = host?.closest?.("[contenteditable='true']");
    if (editable && wrap.contains(editable)) return editable;
  }
  return editableFor(blockId, null);
}

// Inline nodes behind one editable + how to commit them back, recordably.
// Plain-string surfaces heal to nodes on read; static surfaces refuse.
function asInlineNodes(value) {
  if (Array.isArray(value)) return value.filter((n) => n?.type === "text");
  if (typeof value === "string") {
    return value === "" ? [] : [{ type: "text", text: value, marks: [] }];
  }
  return [];
}

function markTarget(block, editable) {
  if (!block || !editable) return null;
  if (block.type === "bulletList" || block.type === "orderedList") {
    const i = Number(editable.getAttribute("data-item-index") || 0);
    return {
      nodes: normalizeContent(asInlineNodes((block.data.items || [])[i])),
      commit: (next, label) => {
        const fresh = [...(ctx.getBlock(block.id)?.data.items || [])];
        fresh[i] = next;
        ctx.setBlockData(block.id, { items: fresh }, { record: true, label: label || "Format text" });
      },
    };
  }
  if (editable.hasAttribute("data-row")) {
    const row = Number(editable.getAttribute("data-row"));
    const col = Array.from(editable.parentElement.children).indexOf(editable);
    const cell = (block.data.rows || [])[row]?.[col];
    if (cell === undefined) return null;
    return {
      nodes: normalizeContent(asInlineNodes(cell)),
      commit: (next, label) => {
        const current = ctx.getBlock(block.id);
        const rows = (current?.data.rows || []).map((r) => [...r]);
        if (!rows[row]) return;
        rows[row][col] = next;
        ctx.setBlockData(block.id, { rows }, { record: true, label: label || "Format text" });
      },
    };
  }
  if (!Array.isArray(block.content)) return null;
  return {
    nodes: normalizeContent(block.content),
    commit: (next, label) => {
      ctx.setBlockData(block.id, { content: next }, { record: true, label: label || "Format text" });
    },
  };
}

const MARK_TAG = { bold: "strong", italic: "em", underline: "u", strikethrough: "s", code: "code", link: "a" };

// Rebuild the live range from the just-written model so the visible document
// always matches canonical state without any re-render (which would have to
// skip the focused editable and show nothing). Character offsets map 1:1
// because marks never change text length.
function repaintRangeFromModel(editable, content, from, to, opts = {}) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const live = sel.getRangeAt(0);
  if (!editable.contains(live.commonAncestorContainer)) return false;
  try {
    let acc = 0;
    const frag = document.createDocumentFragment();
    for (const node of content || []) {
      if (!node || node.type !== "text") continue;
      const start = acc;
      const end = acc + (node.text || "").length;
      if (end > from && start < to) {
        const text = node.text.slice(Math.max(0, from - start), Math.max(0, to - start));
        if (text) {
          let el = document.createTextNode(text);
          const marks = [...(node.marks || [])].sort((a, b) => (a.type === "link" ? 1 : b.type === "link" ? -1 : 0));
          for (const mark of marks) {
            const wrapper = document.createElement(MARK_TAG[mark.type] || "span");
            if (mark.type === "link") wrapper.setAttribute("href", (mark.attrs && mark.attrs.href) || "#");
            wrapper.appendChild(el);
            el = wrapper;
          }
          frag.appendChild(el);
        }
      }
      acc = end;
    }
    const range = live.cloneRange();
    range.deleteContents();
    range.insertNode(frag);
    // Formatting keeps the range selected so marks chain without
    // re-selecting; insertions collapse the caret after the new text.
    if (opts.select) setSelectionRange(editable, from, to);
    else setCaret(editable, to);
    return true;
  } catch {
    return false;
  }
}

export function activeMarks(blockId) {
  const block = ctx.getBlock(blockId);
  if (!block) return [];
  const editable = focusedEditableIn(blockId);
  if (!editable) return [];
  const sel = selectionOffsets(editable);
  if (!sel) return [];
  const target = markTarget(block, editable);
  if (!target) return [];
  const at = Math.min(sel.from, Math.max(0, sel.to - 1));
  let acc = 0;
  for (const node of target.nodes) {
    if (node.type !== "text") continue;
    if (at >= acc && at < acc + node.text.length) return (node.marks || []).map((m) => m.type);
    acc += node.text.length;
  }
  return [];
}

export function insertLink(blockId, url) {
  return toggleMark(blockId, "link", { href: url });
}

// Href of the link mark under the caret/selection, for editing existing
// links (popup prefill). Null when the selection is not inside a link.
export function linkHrefAt(blockId) {
  const block = ctx.getBlock(blockId);
  if (!block) return null;
  const editable = focusedEditableIn(blockId);
  if (!editable) return null;
  const sel = selectionOffsets(editable);
  if (!sel) return null;
  const target = markTarget(block, editable);
  if (!target) return null;
  const at = Math.min(sel.from, Math.max(0, sel.to - 1));
  let acc = 0;
  for (const node of target.nodes) {
    if (node.type !== "text") continue;
    if (at >= acc && at < acc + node.text.length) {
      const link = (node.marks || []).find((m) => m.type === "link");
      return link?.attrs?.href ?? null;
    }
    acc += node.text.length;
  }
  return null;
}

// ─── Inline paste (P0-03) ─────────────────────────────────────────────
// Single-paragraph payloads land AT the caret inside the focused editable —
// marks preserved, caret after the insertion, one undo step — instead of
// exploding into blocks below. Returns true when handled; the caller falls
// back to block-level insertion otherwise.

// Any of these tags means block structure: escalate to block insertion.
const BLOCK_HTML_RE = /<\s*(p|div|h[1-6]|li|[ou]l|table|blockquote|pre|hr|tr|t[dh]|thead|tbody|tfoot|figure|section|article|header|footer)\b/i;

export function isInlinePaste(html, text) {
  if (html && BLOCK_HTML_RE.test(html)) return false;
  const t = String(html || text || "");
  if (/\n\s*\n/.test(t)) return false; // blank line = multi-block
  if (t.trim() === "" && !/<\s*(img|br)\b/i.test(String(html || ""))) return false;
  return true;
}

export function tryInlinePaste(blockId, editable, html, text) {
  if (!isInlinePaste(html, text)) return false;
  const nodes = html
    ? normalizeContent(fromInlineHTML(html))
    : [{ type: "text", text: String(text || ""), marks: [] }];
  if (!nodes.length || !nodes.some((n) => n.text)) {
    // Nothing to insert (e.g. bare image tag): let the block path decide.
    return false;
  }
  return pasteInlineAtCaret(blockId, editable, nodes);
}

export function pasteInlineAtCaret(blockId, editable, nodes) {
  const block = ctx.getBlock(blockId);
  if (!block || !editable || !nodes?.length) return false;
  const sel = selectionOffsets(editable);
  if (!sel) return false;
  const from = Math.max(0, Math.min(sel.from, sel.to));
  const to = Math.max(0, Math.max(sel.from, sel.to));
  const plain = nodes.map((n) => n.text || "").join("");
  if (block.type === "bulletList" || block.type === "orderedList") {
    const i = Number(editable.getAttribute("data-item-index") || 0);
    const items = [...(block.data.items || [])];
    // Inline splice (P0-02): pasted marks survive inside the item.
    const cur = normalizeContent(asInlineNodes(items[i]));
    const total = plainLengthOf(cur);
    const a = Math.max(0, Math.min(from, total));
    const b = Math.max(0, Math.min(to, total));
    items[i] = normalizeContent([...sliceInlineNodes(cur, 0, a), ...nodes, ...sliceInlineNodes(cur, b, total)]);
    ctx.setBlockData(blockId, { items }, { record: true, label: "Paste" });
    repaintRangeFromModel(editable, items[i], a, a + plain.length);
    return true;
  }
  if (editable.hasAttribute("data-row")) {
    const row = Number(editable.getAttribute("data-row"));
    const rows = (block.data.rows || []).map((r) => [...r]);
    const col = Array.from(editable.parentElement.children).indexOf(editable);
    if (!rows[row]) return false;
    const cur = normalizeContent(asInlineNodes(rows[row][col]));
    const total = plainLengthOf(cur);
    const a = Math.max(0, Math.min(from, total));
    const b = Math.max(0, Math.min(to, total));
    rows[row][col] = normalizeContent([...sliceInlineNodes(cur, 0, a), ...nodes, ...sliceInlineNodes(cur, b, total)]);
    ctx.setBlockData(blockId, { rows }, { record: true, label: "Paste" });
    repaintRangeFromModel(editable, rows[row][col], a, a + plain.length);
    return true;
  }
  if (editable.closest(".acrx-btn") && editable.getAttribute("data-child-id")?.endsWith("-btn-text")) {
    const cur = block.data.text || "";
    const next = cur.slice(0, from) + plain + cur.slice(to);
    ctx.setBlockData(blockId, { text: next }, { record: true, label: "Paste" });
    editable.textContent = next;
    setCaret(editable, from + plain.length);
    return true;
  }
  // Content-bearing blocks only past here: atomic/static surfaces fall back
  // to block-level insertion so words never hide in an unrended slot.
  if (!Array.isArray(block.content)) return false;
  const content = block.content;
  const total = plainLengthOf(content);
  const next = normalizeContent([
    ...sliceInlineNodes(content, 0, from),
    ...nodes,
    ...sliceInlineNodes(content, to, total),
  ]);
  ctx.setBlockData(blockId, { content: next }, { record: true, label: "Paste" });
  repaintRangeFromModel(editable, next, from, from + plain.length);
  return true;
}

export function removeLink(blockId) {
  const block = ctx.getBlock(blockId);
  if (!block) return false;
  const editable = focusedEditableIn(blockId);
  if (!editable) return false;
  const sel = selectionOffsets(editable);
  if (!sel || sel.from === sel.to) return false;
  // Child-aware like toggleMark: list items and table cells own their nodes.
  const target = markTarget(block, editable);
  if (!target) return false;
  const total = plainLengthOf(target.nodes);
  const from = Math.max(0, Math.min(sel.from, sel.to, total));
  const to = Math.max(0, Math.min(Math.max(sel.from, sel.to), total));
  if (to <= from) return false;
  const next = removeMark(target.nodes, from, to, "link");
  target.commit(next, "Remove link");
  repaintRangeFromModel(editable, next, from, to);
  return true;
}

export default { initText, domToInline, selectionOffsets, setCaret, setSelectionRange, handleInput, toggleMark, focusedEditableIn, activeMarks, insertLink, removeLink, linkHrefAt, MARK_DEFS, isEmptyEditable, syncEmptyState, syncCanvasEmptyStates, normalizeEmptyEditable, isInlinePaste, tryInlinePaste, pasteInlineAtCaret };
