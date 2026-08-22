// src/model.js — AST model definitions and helpers

// Create a text node
export function text(text = "", marks = []) {
  return { type: "text", text, marks: [...marks] };
}

// Create a block node
export function block(type, attrs = {}, content = []) {
  return { type, attrs: { ...attrs }, content: content.map(cloneNode) };
}

// Create an empty paragraph
export function paragraph(content = []) {
  return { type: "paragraph", attrs: {}, content: content.length ? content.map(cloneNode) : [] };
}

// Create a heading
export function heading(level = 1, content = []) {
  return { type: "heading", attrs: { level }, content: content.map(cloneNode) };
}

// Create a doc
export function doc(content = []) {
  return { type: "doc", content: content.map(cloneNode) };
}

// Deep clone a node.
//
// structuredClone throws on functions, DOM nodes, class instances and cyclic
// references — all of which turn up in host-supplied JSON. Fall back to a
// manual copy that keeps only plain AST data, so bad input degrades instead
// of taking the editor down.
export function cloneNode(node) {
  try {
    return structuredClone(node);
  } catch {
    return safeClone(node, new WeakSet());
  }
}

function safeClone(value, seen) {
  if (value === null || typeof value !== "object") {
    return typeof value === "function" ? undefined : value;
  }
  if (seen.has(value)) return undefined;      // break cycles
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => safeClone(v, seen)).filter((v) => v !== undefined);
  }
  const out = {};
  for (const key of Object.keys(value)) {
    const cloned = safeClone(value[key], seen);
    if (cloned !== undefined) out[key] = cloned;
  }
  return out;
}

// Check if node is a text node
export function isText(node) {
  return node && node.type === "text";
}

// Check if node is a block node
export function isBlock(node) {
  return node && node.type !== "text" && node.type !== "doc";
}

// Check if node is a doc
export function isDoc(node) {
  return node && node.type === "doc";
}

// Get total text length of a node (recursively)
export function nodeTextLength(node) {
  if (!node) return 0;
  if (node.type === "text") return node.text.length;
  let len = 0;
  for (const child of node.content || []) {
    len += nodeTextLength(child);
  }
  return len;
}

// Resolve a path to a node
// Path format: ["content", blockIndex, "content", textIndex, ...]
export function resolve(doc, path) {
  let node = doc;
  for (const key of path) {
    if (node == null || typeof node[key] === "undefined") return null;
    node = node[key];
  }
  return node;
}

// Get the parent container and index from a path
export function getParentInfo(doc, path) {
  if (path.length < 2) return null;
  const parent = resolve(doc, path.slice(0, -1));
  const index = path[path.length - 1];
  return { parent, index };
}

// Compare two paths
export function comparePaths(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const av = typeof a[i] === "number" ? a[i] : 0;
    const bv = typeof b[i] === "number" ? b[i] : 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return a.length - b.length;
}

// Check path equality
export function pathsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Extract all text content from a node
export function extractText(node) {
  if (!node) return [];
  if (node.type === "text") return [{ type: "text", text: node.text, marks: [] }];
  const result = [];
  for (const child of node.content || []) {
    result.push(...extractText(child));
  }
  return result;
}

// Normalize marks: deduplicate, sort
export function normalizeMarks(marks) {
  if (!marks || marks.length === 0) return [];
  const seen = new Set();
  const result = [];
  for (const mark of marks) {
    if (!seen.has(mark.type)) {
      seen.add(mark.type);
      result.push(mark.attrs ? { type: mark.type, attrs: { ...mark.attrs } } : { type: mark.type });
    }
  }
  result.sort((a, b) => a.type.localeCompare(b.type));
  return result;
}

// Check if two mark arrays are equal
export function marksEqual(a, b) {
  const na = normalizeMarks(a || []);
  const nb = normalizeMarks(b || []);
  if (na.length !== nb.length) return false;
  for (let i = 0; i < na.length; i++) {
    if (na[i].type !== nb[i].type) return false;
    const aa = na[i].attrs || {};
    const ba = nb[i].attrs || {};
    const aKeys = Object.keys(aa);
    const bKeys = Object.keys(ba);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (aa[k] !== ba[k]) return false;
    }
  }
  return true;
}
