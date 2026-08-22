// src/dom-utils.js — DOM ↔ model position conversion using data-path attributes

import { nodeTextLength } from "./model.js";

// Find the closest ancestor (or self) with a data-path attribute
function findDataPath(el) {
  let current = el;
  while (current && current !== document.body) {
    if (current.hasAttribute?.("data-path")) {
      return current;
    }
    if (current.hasAttribute?.("data-node-type")) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

// Convert a DOM position to a model position using data-path
export function domToModelPosition(doc, contentEl, domNode, domOffset) {
  // If the DOM node is a text node, find its parent element
  let targetNode = domNode;
  if (domNode.nodeType === Node.TEXT_NODE) {
    targetNode = domNode.parentNode;
  }

  // Find the element with data-path
  const pathEl = findDataPath(targetNode);
  if (!pathEl) return null;

  // Get the path from the data-path attribute
  let path;
  try {
    const rawPath = pathEl.getAttribute("data-path");
    if (rawPath) {
      path = JSON.parse(rawPath);
    } else {
      // Fall back to computing from DOM structure
      path = computePathFromDom(contentEl, pathEl);
    }
  } catch (e) {
    return null;
  }

  // If the path points to a block node, we need to find the text node within
  let finalPath = path;
  let finalOffset = domOffset;

  const resolvedNode = resolvePath(doc, path);
  if (resolvedNode && resolvedNode.type !== "text" && resolvedNode.content?.length > 0) {
    // It's a block node — find the text node within
    const textIdx = findTextNodeIndex(targetNode, pathEl);
    if (textIdx !== null) {
      finalPath = [...path, "content", textIdx];
    }
  }

  // Clamp offset to the text node length
  const finalNode = resolvePath(doc, finalPath);
  if (finalNode && finalNode.type === "text") {
    finalOffset = Math.min(domOffset, finalNode.text.length);
  }

  return { path: finalPath, offset: finalOffset };
}

// Compute path from DOM structure (fallback)
function computePathFromDom(contentEl, el) {
  const path = [];
  let current = el;

  while (current && current !== contentEl) {
    const parent = current.parentNode;
    if (!parent) break;

    let index = 0;
    for (const child of parent.childNodes) {
      if (child === current) break;
      index++;
    }

    // Check if parent is a block node
    if (parent.hasAttribute?.("data-node-type")) {
      path.unshift("content");
      path.unshift(index);
    } else if (parent === contentEl) {
      path.unshift("content");
      path.unshift(index);
      break;
    }

    current = parent;
  }

  return path;
}

// Find the text node index within a block element
function findTextNodeIndex(domNode, blockEl) {
  // Count text nodes and mark wrappers before this node
  let index = 0;
  for (const child of blockEl.childNodes) {
    if (child === domNode || child.contains?.(domNode)) {
      return index;
    }
    index++;
  }
  return null;
}

// Resolve a path in the document
function resolvePath(doc, path) {
  let node = doc;
  for (const key of path) {
    if (node == null || typeof node[key] === "undefined") return null;
    node = node[key];
  }
  return node;
}

// Convert a model position to a DOM position using data-path
export function modelToDomPosition(doc, contentEl, modelPos) {
  if (!modelPos) return null;

  // Locate the element for this path by WALKING the path, not by scanning.
  //
  // The previous implementation ran querySelectorAll("[data-path]") over the
  // whole document and compared every result. On a 2000-block document that
  // measured 31ms per keystroke — on its own, twice the 16ms frame budget.
  // Walking is O(depth) instead of O(document).
  let el = walkToPath(contentEl, modelPos.path);

  // Fall back to a scan only if the walk fails (mid-render, stale path).
  if (!el) {
    const pathAttr = JSON.stringify(modelPos.path);
    const els = contentEl.querySelectorAll("[data-path]");
    for (const e of els) {
      if (e.getAttribute("data-path") === pathAttr) { el = e; break; }
    }
  }

  if (el) {
    // Find the text node within the element
    const textNode = findFirstTextNode(el);
    if (textNode) {
      return {
        node: textNode,
        offset: Math.min(modelPos.offset, textNode.textContent?.length || 0),
      };
    }
    // Fallback: use the element itself
    return {
      node: el,
      offset: 0,
    };
  }

  // Fallback: navigate using DOM structure
  const blockIndex = modelPos.path[1];
  const textIndex = modelPos.path[3];

  const blocks = contentEl.children;
  if (blockIndex >= blocks.length) return null;

  const blockEl = blocks[blockIndex];
  if (!blockEl) return null;

  // Get text/mark elements
  const childNodes = [...blockEl.childNodes].filter(
    (n) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.ELEMENT_NODE
  );

  if (textIndex < childNodes.length) {
    const target = childNodes[textIndex];
    let textNode = target;
    if (target.nodeType === Node.ELEMENT_NODE) {
      textNode = findFirstTextNode(target) || target;
    }
    return {
      node: textNode,
      offset: Math.min(modelPos.offset, textNode.textContent?.length || 0),
    };
  }

  return null;
}

// Follow a model path down the DOM by index. The renderer emits children in
// the same order as model content, so ["content",3,"content",1] means
// "child 3, then its child 1". O(path depth).
function walkToPath(root, path) {
  let el = root;
  for (let i = 0; i < path.length; i += 2) {
    if (path[i] !== "content") return null;
    const idx = path[i + 1];
    if (typeof idx !== "number") return null;
    const kids = el.children;
    if (!kids || idx >= kids.length) return null;
    el = kids[idx];
  }
  // Confirm we landed where we think we did; if the DOM has drifted from the
  // model, report failure so the caller can fall back rather than mis-place
  // the caret.
  const attr = el.getAttribute?.("data-path");
  if (attr && attr !== JSON.stringify(path)) return null;
  return el;
}

function findFirstTextNode(el) {
  if (el.nodeType === Node.TEXT_NODE) return el;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  return walker.nextNode();
}

// Read the current browser selection
export function getDomSelection(doc, contentEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const anchor = domToModelPosition(doc, contentEl, range.startContainer, range.startOffset);
  const head = domToModelPosition(doc, contentEl, range.endContainer, range.endOffset);

  if (!anchor || !head) return null;
  return { anchor, head };
}

// Set the browser selection from a model selection
export function setDomSelection(contentEl, modelSel) {
  if (!modelSel) return;

  const anchor = modelToDomPosition(null, contentEl, modelSel.anchor);
  const head = modelToDomPosition(null, contentEl, modelSel.head);

  if (!anchor || !head) return;

  const sel = window.getSelection();
  const range = document.createRange();

  try {
    range.setStart(anchor.node, anchor.offset);
    range.setEnd(head.node, head.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {
    // Selection might fail if DOM has changed — that's OK
  }
}
