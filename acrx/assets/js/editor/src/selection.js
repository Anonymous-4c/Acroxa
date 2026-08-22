// src/selection.js — Selection system (model-based positions)

import { resolve, nodeTextLength, comparePaths, pathsEqual } from "./model.js";

// A position is { path, offset } where:
//   path = full path to a text node, e.g. ["content", 0, "content", 1]
//   offset = character offset within that text node

export function cursor(path, offset) {
  return { anchor: { path, offset }, head: { path, offset } };
}

export function range(anchor, head) {
  return { anchor, head };
}

export function isCollapsed(sel) {
  if (!sel) return true;
  return pathsEqual(sel.anchor.path, sel.head.path) && sel.anchor.offset === sel.head.offset;
}

export function selectionEquals(a, b) {
  if (!a || !b) return false;
  return pathsEqual(a.anchor.path, b.anchor.path) && a.anchor.offset === b.anchor.offset &&
    pathsEqual(a.head.path, b.head.path) && a.head.offset === b.head.offset;
}

// Get the document order start/end of a selection
export function getStart(sel) {
  if (!sel) return null;
  const cmp = comparePaths(
    [...sel.anchor.path, sel.anchor.offset],
    [...sel.head.path, sel.head.offset]
  );
  return cmp <= 0 ? sel.anchor : sel.head;
}

export function getEnd(sel) {
  if (!sel) return null;
  const cmp = comparePaths(
    [...sel.anchor.path, sel.anchor.offset],
    [...sel.head.path, sel.head.offset]
  );
  return cmp >= 0 ? sel.anchor : sel.head;
}

// Defensive: a half-formed selection (missing anchor or head) must never
// crash a command. Commands run on hot paths like keydown, where an
// exception would leave the editor wedged.
export function saveSelection(sel) {
  if (!sel || !sel.anchor || !sel.head) return null;
  if (!Array.isArray(sel.anchor.path) || !Array.isArray(sel.head.path)) return null;
  return {
    anchor: { path: [...sel.anchor.path], offset: sel.anchor.offset | 0 },
    head: { path: [...sel.head.path], offset: sel.head.offset | 0 },
  };
}

export function restoreSelection(saved) {
  if (!saved || !saved.anchor || !saved.head) return null;
  if (!Array.isArray(saved.anchor.path) || !Array.isArray(saved.head.path)) return null;
  return {
    anchor: { path: [...saved.anchor.path], offset: saved.anchor.offset | 0 },
    head: { path: [...saved.head.path], offset: saved.head.offset | 0 },
  };
}

// Check if position is at the end of its text node
export function isAtEndOfText(doc, pos) {
  const node = resolve(doc, pos.path);
  if (!node || node.type !== "text") return true;
  return pos.offset >= node.text.length;
}

// Check if position is at the start of its text node
export function isAtStartOfText(pos) {
  return pos.offset === 0;
}

// Get the text node at a position
export function getTextNode(doc, pos) {
  return resolve(doc, pos.path);
}

// Get the block containing a position.
//
// A caret inside an EMPTY block has no text node to point at (content is []),
// so its path legitimately degrades to the block itself — ["content", i]
// rather than ["content", i, "content", 0]. Requiring length >= 4 here made
// every command silently no-op in an empty block, which real keyboard input
// exposed (synthetic tests seeded a text node and never hit it).
// Both shapes are valid positions and both must resolve.
export function getBlockInfo(doc, pos) {
  if (!pos || !Array.isArray(pos.path)) return null;
  if (pos.path.length < 2 || pos.path[0] !== "content") return null;
  if (typeof pos.path[1] !== "number") return null;

  const blockPath = pos.path.slice(0, 2); // ["content", blockIdx]
  const blockNode = resolve(doc, blockPath);
  if (!blockNode) return null;

  return {
    blockPath,
    blockNode,
    blockIndex: pos.path[1],
    // true when the caret is on the block itself (empty block, no text node)
    isBlockLevel: pos.path.length < 4,
    textIndex: pos.path.length >= 4 ? pos.path[3] : 0,
  };
}

// Get the parent block path for any position. Works for both a text-level
// caret (["content",i,"content",j]) and a block-level one (["content",i]).
export function getBlockPath(pos) {
  if (!pos || !Array.isArray(pos.path)) return null;
  if (pos.path.length >= 2 && pos.path[0] === "content" && typeof pos.path[1] === "number") {
    return ["content", pos.path[1]];
  }
  return null;
}

// Convert a model position to a flat document offset (for debugging)
export function positionToOffset(doc, pos) {
  let offset = 0;
  const docContent = doc.content || [];
  for (let i = 0; i < (pos.path[1] || 0); i++) {
    offset += nodeTextLength(docContent[i]) + 1;
  }
  const blockContent = docContent[pos.path[1]]?.content || [];
  for (let i = 0; i < (pos.path[3] || 0); i++) {
    offset += blockContent[i].text?.length || 0;
  }
  offset += pos.offset;
  return offset;
}
