// src/paths.js — Container-generic path arithmetic.
//
// The original primitives all hard-coded the shape
//     ["content", blockIndex, "content", textIndex]
// which is only true for top-level blocks. Inside a list item or a table cell
// the real path is deeper, e.g.
//     ["content",0,"content",2,"content",0,"content",0,"content",1]
//      \_ list ______/ \_ item _/ \_ para ____/ \_ text __/
// Every primitive that assumed depth-4 either corrupted or crashed there.
//
// This module answers the two questions the primitives actually need:
//   - which node holds the INLINE content the caret is in?  (the "leaf block")
//   - which node holds that block, and at what index?       (its container)
// Both work at any depth, so one implementation covers top level, list items
// and table cells alike.

import { resolve } from "./model.js";

// Types that hold inline (text) content directly.
const LEAF_BLOCKS = new Set([
  "paragraph", "heading", "blockquote", "codeblock",
]);

// Types that hold other blocks.
const CONTAINERS = new Set([
  "doc", "listItem", "tableCell", "bulletList", "orderedList",
  "taskList", "table", "tableRow",
]);

export function isLeafBlock(type) { return LEAF_BLOCKS.has(type); }
export function isContainer(type) { return CONTAINERS.has(type); }

// Split a node path into { parentPath, index }.
// A node path always ends ["content", <number>]; parentPath points at the
// OBJECT owning that array, which is what the transaction API expects.
export function splitPath(path) {
  if (!Array.isArray(path) || path.length < 2) return { parentPath: [], index: null };
  const index = path[path.length - 1];
  if (typeof index !== "number") return { parentPath: [], index: null };
  return { parentPath: path.slice(0, -2), index };
}

// Walk every ancestor of `path`, outermost first.
// Yields { path, node } for each addressable node along the way.
export function ancestors(doc, path) {
  const out = [];
  for (let i = 2; i <= path.length; i += 2) {
    const p = path.slice(0, i);
    const node = resolve(doc, p);
    if (node) out.push({ path: p, node });
  }
  return out;
}

// The innermost block that directly holds inline content for this position.
// Returns { blockPath, block, textIndex, container, containerPath, index }.
//
// `textIndex` is the position's index within block.content, defaulting to 0
// for a block-level caret (an empty block has no text node to point at).
export function resolveBlock(doc, pos) {
  if (!pos || !Array.isArray(pos.path)) return null;

  const chain = ancestors(doc, pos.path);
  if (!chain.length) return null;

  // Find the deepest leaf block in the chain.
  let blockEntry = null;
  for (const entry of chain) {
    if (isLeafBlock(entry.node.type)) blockEntry = entry;
  }

  // No recognised leaf block: fall back to the deepest node that owns an
  // array of children, so callers still get something coherent.
  if (!blockEntry) {
    for (const entry of chain) {
      if (Array.isArray(entry.node.content) &&
          entry.node.content.some((c) => c && c.type === "text")) {
        blockEntry = entry;
      }
    }
  }
  if (!blockEntry) return null;

  const blockPath = blockEntry.path;
  const block = blockEntry.node;

  // The index into block.content, if the path reaches that deep.
  const depth = blockPath.length;
  const textIndex = typeof pos.path[depth + 1] === "number"
    ? pos.path[depth + 1] : 0;

  const { parentPath, index } = splitPath(blockPath);
  const container = resolve(doc, parentPath);

  return {
    blockPath, block, textIndex,
    containerPath: parentPath,
    container,
    index,                       // block's index inside its container
    isBlockLevel: pos.path.length <= depth,
  };
}

// The nearest ancestor of the given type, or null.
export function closest(doc, path, type) {
  const chain = ancestors(doc, path);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].node.type === type) return chain[i];
  }
  return null;
}

// The nearest ancestor whose type is in `types`.
export function closestOf(doc, path, types) {
  const set = new Set(types);
  const chain = ancestors(doc, path);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (set.has(chain[i].node.type)) return chain[i];
  }
  return null;
}

// Do two positions live in the same leaf block?
export function sameBlock(doc, a, b) {
  const ra = resolveBlock(doc, a);
  const rb = resolveBlock(doc, b);
  if (!ra || !rb) return false;
  return ra.blockPath.join("/") === rb.blockPath.join("/");
}

// Character offset of a position within its own leaf block.
export function charOffsetIn(doc, pos) {
  const r = resolveBlock(doc, pos);
  if (!r) return 0;
  let n = 0;
  const kids = r.block.content || [];
  for (let i = 0; i < r.textIndex && i < kids.length; i++) {
    n += kids[i]?.text?.length ?? 0;
  }
  return n + (pos.offset || 0);
}

// Build a position from a leaf block path + character offset.
export function positionAt(doc, blockPath, char) {
  const block = resolve(doc, blockPath);
  if (!block) return null;
  const kids = block.content || [];
  if (!kids.length) return { path: [...blockPath], offset: 0 };

  let remaining = Math.max(0, char);
  for (let i = 0; i < kids.length; i++) {
    const len = kids[i]?.text?.length ?? 0;
    if (remaining <= len) {
      return { path: [...blockPath, "content", i], offset: remaining };
    }
    remaining -= len;
  }
  const last = kids.length - 1;
  return {
    path: [...blockPath, "content", last],
    offset: kids[last]?.text?.length ?? 0,
  };
}

// Slice a leaf block's inline content by character range, preserving marks.
export function sliceInline(doc, blockPath, from, to) {
  const block = resolve(doc, blockPath);
  if (!block) return [];
  const out = [];
  let at = 0;
  for (const node of block.content || []) {
    if (!node || node.type !== "text") continue;
    const len = node.text.length;
    const s = at, e = at + len;
    at = e;
    const a = Math.max(from, s);
    const b = Math.min(to, e);
    if (b <= a) continue;
    const piece = node.text.slice(a - s, b - s);
    if (piece) out.push({ type: "text", text: piece, marks: [...(node.marks || [])] });
  }
  return out;
}

// Total text length of a leaf block.
export function blockTextLength(doc, blockPath) {
  const block = resolve(doc, blockPath);
  if (!block) return 0;
  let n = 0;
  for (const c of block.content || []) n += c?.text?.length ?? 0;
  return n;
}

// Compare two paths in document order.
export function comparePathsDeep(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i], bv = b[i];
    if (typeof av === "number" && typeof bv === "number") {
      if (av !== bv) return av < bv ? -1 : 1;
    }
  }
  return a.length === b.length ? 0 : (a.length < b.length ? -1 : 1);
}
