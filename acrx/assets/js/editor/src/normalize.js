// src/normalize.js — Document normalization

import { isText, marksEqual, normalizeMarks } from "./model.js";

// Merge adjacent text nodes with identical marks
function mergeAdjacentText(content) {
  const result = [];
  for (const node of content) {
    if (!node) continue;
    const last = result[result.length - 1];
    if (last && isText(last) && isText(node) && marksEqual(last.marks, node.marks)) {
      last.text += node.text;
    } else if (isText(node)) {
      result.push({ type: "text", text: node.text, marks: normalizeMarks(node.marks) });
    } else {
      result.push(node);
    }
  }
  return result;
}

// Normalize a node tree
export function normalize(node, schema) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return null;

  if (node.type === "text") {
    // Tolerate malformed text like the schema filter does — normalize runs on
    // every transaction and must never be the thing that throws.
    const str = typeof node.text === "string" ? node.text
              : (node.text === null || node.text === undefined) ? "" : String(node.text);
    return {
      type: "text",
      text: str,
      marks: schema ? schema.filterMarks(node.marks) : normalizeMarks(node.marks),
    };
  }

  // Recursively normalize children
  const rawKids = Array.isArray(node.content) ? node.content : [];
  let content = rawKids.map((c) => normalize(c, schema)).filter(Boolean);

  // Merge adjacent text nodes with identical marks
  content = mergeAdjacentText(content);

  // Strip disallowed node types — convert to paragraph
  if (schema && node.type !== "doc" && !schema.allowsNode(node.type)) {
    const texts = [];
    for (const c of content) {
      if (isText(c)) texts.push(c);
      else {
        const extracted = extractText(c);
        texts.push(...extracted);
      }
    }
    return { type: "paragraph", attrs: {}, content: texts };
  }

  // Strip disallowed marks from text nodes
  if (schema) {
    content = content.map((c) => {
      if (isText(c)) {
        return { type: "text", text: c.text, marks: schema.filterMarks(c.marks) };
      }
      return c;
    });
  }

  // The doc root is a container, not a content node — it carries no attrs.
  // Emitting `attrs: {}` here made getJSON() differ between a freshly-supplied
  // document and a normalized one, which broke structural round-trip equality.
  if (node.type === "doc") {
    return { type: "doc", content };
  }

  return { type: node.type, attrs: { ...(node.attrs || {}) }, content };
}

function extractText(node) {
  if (!node) return [];
  if (node.type === "text") return [{ type: "text", text: node.text, marks: [] }];
  const result = [];
  for (const child of node.content || []) {
    result.push(...extractText(child));
  }
  return result;
}

// Normalize a full document.
//
// Rebuilding every block on every transaction is O(document) per keystroke,
// which dominated typing cost on large documents. `touched` lets callers name
// the top-level block indices a transaction actually altered; untouched
// blocks are already normal (they were normalized when last modified) and are
// passed through by reference.
//
// Omitting `touched` normalizes everything, which is the safe default for
// setJSON and any path that can't identify what it changed.
export function normalizeDoc(doc, schema, touched) {
  if (!doc) return { type: "doc", content: [] };

  if (!touched || touched.size === 0) {
    const result = normalize(doc, schema);
    return result && result.type === "doc" ? result : { type: "doc", content: [] };
  }

  const content = [];
  const src = doc.content || [];
  for (let i = 0; i < src.length; i++) {
    content.push(touched.has(i) ? normalize(src[i], schema) : src[i]);
  }
  return { type: "doc", content: content.filter(Boolean) };
}

// Which top-level block indices does this transaction touch?
// Returns null when the answer isn't a clean subset (block insert/delete
// shifts every later index), signalling "normalize everything".
export function touchedBlocks(steps) {
  const set = new Set();
  for (const step of steps) {
    const p = step.parentPath;
    if (!Array.isArray(p)) return null;
    if (p.length === 0) return null;          // structural change at doc level
    if (p[0] !== "content" || typeof p[1] !== "number") return null;
    set.add(p[1]);
  }
  return set;
}
