// src/editing.js — Core editing primitives

import { cloneNode, text, paragraph, resolve, nodeTextLength, isText, marksEqual } from "./model.js";
import { Transaction, mapSelection } from "./transaction.js";
import { cursor, isCollapsed, getStart, getEnd, getBlockInfo, getBlockPath } from "./selection.js";

// Path convention:
//   Position path: ["content", blockIdx, "content", textIdx]
//   Step parentPath for block ops: [] (the doc)
//   Step parentPath for text ops: ["content", blockIdx] (the block)

// ─── break() — THE Enter-key primitive ─────────────────────────────────────
export function breakBlock(doc, sel) {
  const pos = sel.anchor;
  const blockInfo = getBlockInfo(doc, pos);
  if (!blockInfo) return new Transaction(doc, sel);

  const { blockPath, blockNode, blockIndex } = blockInfo;
  const parentPath = []; // doc level
  const textIndex = pos.path[3];
  const textNode = resolve(doc, pos.path);

  if (!textNode || textNode.type !== "text") return new Transaction(doc, sel);

  const tr = new Transaction(doc, sel);

  const beforeText = textNode.text.slice(0, pos.offset);
  const afterText = textNode.text.slice(pos.offset);

  // Replace the original text node with the "before" part
  tr.replaceNode(blockPath, textIndex, text(beforeText, textNode.marks));

  // Create the new block
  const newBlock = paragraph();
  if (afterText.length > 0) {
    newBlock.content.push(text(afterText, textNode.marks));
  }
  for (let i = textIndex + 1; i < blockNode.content.length; i++) {
    newBlock.content.push(cloneNode(blockNode.content[i]));
  }
  // Remove moved text nodes from original block
  for (let i = blockNode.content.length - 1; i > textIndex; i--) {
    tr.deleteNode(blockPath, i);
  }

  // Insert the new block after the current block
  tr.insertNode(parentPath, blockIndex + 1, newBlock);

  // Move cursor to start of new block
  tr.setSelection(cursor(["content", blockIndex + 1, "content", 0], 0));

  return tr;
}

// ─── breakAtStart() — Enter at the very start of a block ───────────────────
export function breakAtStart(doc, sel) {
  const pos = sel.anchor;
  const blockInfo = getBlockInfo(doc, pos);
  if (!blockInfo) return new Transaction(doc, sel);

  const { blockIndex } = blockInfo;
  const parentPath = [];

  const tr = new Transaction(doc, sel);
  tr.insertNode(parentPath, blockIndex, paragraph());
  tr.setSelection(cursor(["content", blockIndex + 1, "content", 0], 0));

  return tr;
}

// ─── breakAtEnd() — Enter at the very end of a block ───────────────────────
export function breakAtEnd(doc, sel) {
  const pos = sel.anchor;
  const blockInfo = getBlockInfo(doc, pos);
  if (!blockInfo) return new Transaction(doc, sel);

  const { blockIndex } = blockInfo;
  const parentPath = [];

  const tr = new Transaction(doc, sel);
  tr.insertNode(parentPath, blockIndex + 1, paragraph());
  tr.setSelection(cursor(["content", blockIndex + 1, "content", 0], 0));

  return tr;
}

// ─── breakInEmptyBlock() — Enter inside an already-empty block ──────────────
export function breakInEmptyBlock(doc, sel) {
  const pos = sel.anchor;
  const blockInfo = getBlockInfo(doc, pos);
  if (!blockInfo) return new Transaction(doc, sel);

  const { blockIndex } = blockInfo;
  const parentPath = [];

  const tr = new Transaction(doc, sel);
  tr.insertNode(parentPath, blockIndex + 1, paragraph());
  tr.setSelection(cursor(["content", blockIndex + 1, "content", 0], 0));

  return tr;
}

// ─── mergeBlocks() — Merge two adjacent blocks ─────────────────────────────
export function mergeBlocks(doc, sel, direction = "backward") {
  const pos = sel.anchor;
  const blockInfo = getBlockInfo(doc, pos);
  if (!blockInfo) return new Transaction(doc, sel);

  const { blockPath, blockIndex } = blockInfo;
  const parentPath = [];

  const tr = new Transaction(doc, sel);

  if (direction === "backward" && blockIndex > 0) {
    const currentBlock = resolve(doc, blockPath);
    const prevBlockPath = ["content", blockIndex - 1];
    const prevBlock = resolve(doc, prevBlockPath);

    if (!currentBlock || !prevBlock) return tr;

    if (currentBlock.type === prevBlock.type) {
      for (const node of currentBlock.content) {
        tr.insertNode(prevBlockPath, prevBlock.content.length, cloneNode(node));
      }
      tr.deleteNode(parentPath, blockIndex);
      const joinOffset = nodeTextLength(prevBlock);
      tr.setSelection(cursor([...prevBlockPath, "content", prevBlock.content.length - 1], joinOffset));
    } else {
      const prevTextLen = nodeTextLength(prevBlock);
      const lastTextIdx = prevBlock.content.length - 1;
      tr.setSelection(cursor([...prevBlockPath, "content", lastTextIdx], prevTextLen));
    }
  }

  return tr;
}

// ─── deleteAcross() — Delete content across multiple blocks ────────────────
export function deleteAcross(doc, sel) {
  const tr = new Transaction(doc, sel);
  const start = getStart(sel);
  const end = getEnd(sel);

  if (isCollapsed(sel)) return tr;

  const startBlockIdx = start.path[1];
  const endBlockIdx = end.path[1];
  const startTextIdx = start.path[3];
  const endTextIdx = end.path[3];

  if (startBlockIdx === endBlockIdx) {
    const blockPath = ["content", startBlockIdx];

    if (startTextIdx === endTextIdx) {
      const textNode = resolve(doc, start.path);
      if (textNode && textNode.type === "text") {
        tr.deleteText(blockPath, startTextIdx, start.offset, end.offset - start.offset);
      }
    } else {
      const firstNode = resolve(doc, start.path);
      if (firstNode && firstNode.type === "text") {
        tr.deleteText(blockPath, startTextIdx, start.offset, firstNode.text.length - start.offset);
      }
      for (let i = endTextIdx - 1; i > startTextIdx; i--) {
        tr.deleteNode(blockPath, i);
      }
      const lastNode = resolve(doc, end.path);
      if (lastNode && lastNode.type === "text") {
        tr.deleteText(blockPath, endTextIdx, 0, end.offset);
      }
    }
  } else {
    const startNode = resolve(doc, start.path);
    if (startNode && startNode.type === "text") {
      const startBlockPath = ["content", startBlockIdx];
      tr.deleteText(startBlockPath, startTextIdx, start.offset, startNode.text.length - start.offset);
    }

    const startBlockNode = resolve(doc, ["content", startBlockIdx]);
    if (startBlockNode) {
      for (let i = startBlockNode.content.length - 1; i > startTextIdx; i--) {
        tr.deleteNode(["content", startBlockIdx], i);
      }
    }

    for (let i = endBlockIdx - 1; i > startBlockIdx; i--) {
      tr.deleteNode([], i);
    }

    const endNode = resolve(doc, end.path);
    if (endNode && endNode.type === "text") {
      const endBlockPath = ["content", startBlockIdx + 1];
      tr.deleteText(endBlockPath, endTextIdx, 0, end.offset);
    }

    const endBlockNode = resolve(doc, ["content", startBlockIdx + 1]);
    if (endBlockNode) {
      for (let i = endTextIdx - 1; i >= 0; i--) {
        tr.deleteNode(["content", startBlockIdx + 1], i);
      }
    }
  }

  tr.setSelection(cursor(start.path, start.offset));
  return tr;
}

// Add / strip a mark on a mark list.
function withMark(marks, mark) {
  const rest = (marks || []).filter((m) => m.type !== mark.type);
  return [...rest, mark];
}
function withoutMark(marks, markType) {
  return (marks || []).filter((m) => m.type !== markType);
}

// Split one text node into up to three fragments and splice them in.
//
// Empty fragments are DROPPED. Emitting zero-length text nodes that still
// carry the original marks (e.g. an empty {bold} node on either side of the
// unmarked run) blocks normalization from merging the neighbours, which is
// what corrupted the document into "Alpha Beta " + duplicated "Beta" after a
// couple of toggles.
function spliceMarked(tr, blockPath, index, node, from, to, transform) {
  const pieces = [];
  const head = node.text.slice(0, from);
  const mid  = node.text.slice(from, to);
  const tail = node.text.slice(to);

  if (head) pieces.push(text(head, node.marks));
  if (mid)  pieces.push(text(mid, transform(node.marks)));
  if (tail) pieces.push(text(tail, node.marks));

  // Never leave a block with no children at all.
  if (!pieces.length) pieces.push(text("", node.marks));

  tr.spliceNodes(blockPath, index, pieces);
}

// Shared driver for applyMark / removeMark so both behave identically.
function editMarks(doc, sel, transform) {
  const tr = new Transaction(doc, sel);
  if (isCollapsed(sel)) return tr;

  const start = getStart(sel);
  const end = getEnd(sel);
  const sBlock = start.path[1];
  const eBlock = end.path[1];

  // Walk blocks last-to-first, and text nodes last-to-first within each, so
  // that earlier (lower-index) steps are never invalidated by later ones.
  for (let b = eBlock; b >= sBlock; b--) {
    const blockPath = ["content", b];
    const block = resolve(doc, blockPath);
    if (!block || !Array.isArray(block.content)) continue;

    const first = b === sBlock ? (start.path[3] ?? 0) : 0;
    const last  = b === eBlock ? (end.path[3] ?? block.content.length - 1)
                               : block.content.length - 1;

    for (let i = Math.min(last, block.content.length - 1); i >= first; i--) {
      const node = block.content[i];
      if (!node || node.type !== "text") continue;

      const from = (b === sBlock && i === first) ? start.offset : 0;
      const to   = (b === eBlock && i === last)  ? end.offset   : node.text.length;
      if (to <= from) continue;

      spliceMarked(tr, blockPath, i, node, from, to, transform);
    }
  }
  return tr;
}

// ─── applyMark() — Apply a mark to a selection ─────────────────────────────
export function applyMark(doc, sel, mark) {
  return editMarks(doc, sel, (marks) => withMark(marks, mark));
}

// --- removeMark() - Remove a mark from a selection ---
export function removeMark(doc, sel, markType) {
  return editMarks(doc, sel, (marks) => withoutMark(marks, markType));
}

// ─── insertText() — Insert text at a cursor position ───────────────────────
export function insertText(doc, sel, textToInsert) {
  const tr = new Transaction(doc, sel);
  const pos = sel.anchor;
  const blockPath = getBlockPath(pos);
  if (!blockPath) return tr;

  const textIndex = pos.path[3];
  tr.insertText(blockPath, textIndex, pos.offset, textToInsert);

  const newPos = { path: pos.path, offset: pos.offset + textToInsert.length };
  tr.setSelection(cursor(newPos.path, newPos.offset));
  return tr;
}

// ─── deleteText() — Delete text backward or forward ────────────────────────
export function deleteText(doc, sel, direction = "backward", length = 1) {
  const tr = new Transaction(doc, sel);
  const pos = sel.anchor;
  const blockPath = getBlockPath(pos);
  if (!blockPath) return tr;

  const textIndex = pos.path[3];
  const textNode = resolve(doc, pos.path);
  if (!textNode || textNode.type !== "text") return tr;

  if (direction === "backward" && pos.offset > 0) {
    tr.deleteText(blockPath, textIndex, pos.offset - length, length);
    tr.setSelection(cursor(pos.path, pos.offset - length));
  } else if (direction === "forward" && pos.offset < textNode.text.length) {
    tr.deleteText(blockPath, textIndex, pos.offset, length);
    tr.setSelection(cursor(pos.path, pos.offset));
  }

  return tr;
}
