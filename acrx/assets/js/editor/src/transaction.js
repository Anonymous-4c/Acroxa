// src/transaction.js — Transaction system with position mapping

import { cloneNode, resolve, nodeTextLength } from "./model.js";

// Step types: insert_node, delete_node, replace_node, insert_text, delete_text, set_attrs
// Convention:
//   parentPath points to the OBJECT containing the content array
//   index is the position in that content array
//   For block ops: parentPath = [] (the doc)
//   For text ops: parentPath = ["content", blockIdx] (the block)

class Step {
  constructor(type, parentPath, index, data = {}) {
    this.type = type;
    this.parentPath = parentPath;
    this.index = index;
    this.data = data;
  }
}

// Get the "array key" for a step's parentPath
// For block ops: the array is doc.content, so the key after parentPath is "content"
// For text ops: the array is doc[blockIdx].content, so the key after parentPath is "content"
// In both cases, the key is "content"
function getArrayPath(step) {
  return [...step.parentPath, "content"];
}

// Map a position through one step
function mapThroughStep(position, step, doc) {
  if (!position) return position;

  const { parentPath, index, type, data } = step;
  const arrayPath = getArrayPath(step); // e.g., ["content"] or ["content", 0, "content"]

  // Check if position's path starts with arrayPath
  if (position.path.length < arrayPath.length) return position;
  let inSameArray = true;
  for (let i = 0; i < arrayPath.length; i++) {
    if (position.path[i] !== arrayPath[i]) {
      inSameArray = false;
      break;
    }
  }
  if (!inSameArray) return position;

  // Get the position's index within the array
  const posArrayIdx = position.path[arrayPath.length];

  switch (type) {
    case "insert_node":
      if (posArrayIdx >= index) {
        const newPath = [...position.path];
        newPath[arrayPath.length] = posArrayIdx + 1;
        return { path: newPath, offset: position.offset };
      }
      return position;

    case "delete_node":
      if (posArrayIdx > index) {
        const newPath = [...position.path];
        newPath[arrayPath.length] = posArrayIdx - 1;
        return { path: newPath, offset: position.offset };
      }
      if (posArrayIdx === index) {
        // Position was inside the deleted node
        if (index > 0) {
          const newPath = [...position.path];
          newPath[arrayPath.length] = index - 1;
          const prevNode = resolve(doc, newPath);
          return { path: newPath, offset: prevNode ? nodeTextLength(prevNode) : 0 };
        }
        return { path: position.path, offset: 0 };
      }
      return position;

    case "replace_node":
      if (posArrayIdx === index) {
        const newNode = data.node;
        const newLen = nodeTextLength(newNode);
        return { path: position.path, offset: Math.min(position.offset, newLen) };
      }
      return position;

    case "splice_nodes":
      // Replaces one node with multiple nodes
      if (posArrayIdx === index) {
        // Position is inside the replaced node — map to correct new node
        const newNodes = data.nodes;
        let cumulativeLen = 0;
        for (let i = 0; i < newNodes.length; i++) {
          const nodeLen = nodeTextLength(newNodes[i]);
          if (position.offset <= cumulativeLen + nodeLen) {
        const newPath = [...position.path];
        newPath[arrayPath.length] = index + i;
        return { path: newPath, offset: position.offset - cumulativeLen };
          }
          cumulativeLen += nodeLen;
        }
        // Offset is past the end — map to last node
        const lastIdx = newNodes.length - 1;
        const newPath = [...position.path];
        newPath[arrayPath.length] = index + lastIdx;
        return { path: newPath, offset: nodeTextLength(newNodes[lastIdx]) };
      }
      if (posArrayIdx > index) {
        // Shift by the number of new nodes minus 1 (the replaced node)
        const shift = data.nodes.length - 1;
        const newPath = [...position.path];
        newPath[arrayPath.length] = posArrayIdx + shift;
        return { path: newPath, offset: position.offset };
      }
      return position;

    case "insert_text":
      // Only affects the specific text node
      if (posArrayIdx === index) {
        if (position.offset > data.offset) {
          return { path: position.path, offset: position.offset + data.text.length };
        }
      }
      return position;

    case "delete_text":
      if (posArrayIdx === index) {
        if (position.offset > data.offset + data.length) {
          return { path: position.path, offset: position.offset - data.length };
        }
        if (position.offset > data.offset) {
          return { path: position.path, offset: data.offset };
        }
      }
      return position;

    default:
      return position;
  }
}

// Map a position through a list of steps
export function mapPosition(position, steps, doc) {
  let pos = position;
  for (const step of steps) {
    pos = mapThroughStep(pos, step, doc);
  }
  return pos;
}

// Map a selection through steps
export function mapSelection(selection, steps, doc) {
  if (!selection) return null;
  return {
    anchor: mapPosition(selection.anchor, steps, doc),
    head: mapPosition(selection.head, steps, doc),
  };
}

// Apply a single step to the model
function applyStep(doc, step) {
  const parent = resolve(doc, step.parentPath);
  if (!parent || !Array.isArray(parent.content)) return null;

  switch (step.type) {
    case "insert_node": {
      parent.content.splice(step.index, 0, cloneNode(step.data.node));
      return null;
    }

    case "delete_node": {
      const removed = parent.content[step.index];
      parent.content.splice(step.index, 1);
      return removed;
    }

    case "replace_node": {
      const old = parent.content[step.index];
      parent.content[step.index] = cloneNode(step.data.node);
      return old;
    }

    case "insert_text": {
      const textNode = parent.content[step.index];
      if (textNode && textNode.type === "text") {
        const off = step.data.offset;
        textNode.text = textNode.text.slice(0, off) + step.data.text + textNode.text.slice(off);
      }
      return null;
    }

    case "delete_text": {
      const textNode = parent.content[step.index];
      if (textNode && textNode.type === "text") {
        const off = step.data.offset;
        const len = step.data.length;
        const deleted = textNode.text.slice(off, off + len);
        textNode.text = textNode.text.slice(0, off) + textNode.text.slice(off + len);
        return deleted;
      }
      return null;
    }

    case "splice_nodes": {
      const old = parent.content[step.index];
      const nodes = step.data.nodes.map(cloneNode);
      parent.content.splice(step.index, 1, ...nodes);
      return old;
    }

    case "set_attrs": {
      const node = parent.content[step.index];
      if (node) {
        const oldAttrs = { ...(node.attrs || {}) };
        node.attrs = { ...step.data.attrs };
        return oldAttrs;
      }
      return null;
    }

    default:
      return null;
  }
}

// Generate the inverse step
function invertStep(step, inverseData) {
  switch (step.type) {
    case "insert_node":
      return new Step("delete_node", step.parentPath, step.index, { node: inverseData });
    case "delete_node":
      return new Step("insert_node", step.parentPath, step.index, { node: inverseData });
    case "replace_node":
      return new Step("replace_node", step.parentPath, step.index, { node: inverseData });
    case "insert_text":
      return new Step("delete_text", step.parentPath, step.index, { offset: step.data.offset, length: step.data.text.length });
    case "delete_text":
      return new Step("insert_text", step.parentPath, step.index, { offset: step.data.offset, text: inverseData });
    case "splice_nodes":
      return new Step("splice_nodes", step.parentPath, step.index, { nodes: [inverseData] });
    case "set_attrs":
      return new Step("set_attrs", step.parentPath, step.index, { attrs: inverseData });
    default:
      return null;
  }
}

// Transaction class
export class Transaction {
  constructor(doc, selection = null) {
    this.doc = doc;
    this.steps = [];
    this.beforeSelection = selection;
    this.afterSelection = null;
    this.inverseSteps = [];
    this.meta = {};
    this._selectionIsMapped = false;
  }

  insertNode(parentPath, index, node) {
    this.steps.push(new Step("insert_node", parentPath, index, { node: cloneNode(node) }));
    return this;
  }

  deleteNode(parentPath, index) {
    this.steps.push(new Step("delete_node", parentPath, index, {}));
    return this;
  }

  replaceNode(parentPath, index, node) {
    this.steps.push(new Step("replace_node", parentPath, index, { node: cloneNode(node) }));
    return this;
  }

  insertText(parentPath, index, offset, text) {
    this.steps.push(new Step("insert_text", parentPath, index, { offset, text }));
    return this;
  }

  deleteText(parentPath, index, offset, length) {
    this.steps.push(new Step("delete_text", parentPath, index, { offset, length }));
    return this;
  }

  // Replace one node with multiple nodes (for splitting operations)
  spliceNodes(parentPath, index, nodes) {
    this.steps.push(new Step("splice_nodes", parentPath, index, { nodes: nodes.map(cloneNode) }));
    return this;
  }

  setAttrs(parentPath, index, attrs) {
    this.steps.push(new Step("set_attrs", parentPath, index, { attrs: { ...attrs } }));
    return this;
  }

  // Selection expressed in PRE-transaction coordinates. It will be mapped
  // through this transaction's steps on apply(). Use this when you are
  // tracking an existing cursor across edits.
  setSelection(sel) {
    this.afterSelection = sel;
    this._selectionIsMapped = false;
    return this;
  }

  // Selection expressed in POST-transaction coordinates — a position the
  // command has *deliberately computed* for the resulting document (e.g.
  // "start of the new block I just inserted"). It is used verbatim and must
  // NOT be mapped, otherwise the insert gets counted twice and the cursor
  // lands one block too far. This distinction is the fix for that class of
  // off-by-one cursor bug.
  setResolvedSelection(sel) {
    this.afterSelection = sel;
    this._selectionIsMapped = true;
    return this;
  }

  setMeta(key, value) {
    this.meta[key] = value;
    return this;
  }

  // Apply all steps to the document
  apply() {
    const inverseSteps = [];

    for (const step of this.steps) {
      const inverseData = applyStep(this.doc, step);
      const inverse = invertStep(step, inverseData);
      if (inverse) inverseSteps.unshift(inverse);
    }

    this.inverseSteps = inverseSteps;

    // Map after-selection through all steps — unless the caller already gave
    // us post-transaction coordinates via setResolvedSelection().
    if (this.afterSelection && !this._selectionIsMapped) {
      this.afterSelection = mapSelection(this.afterSelection, this.steps, this.doc);
    }

    return {
      doc: this.doc,
      steps: this.steps,
      inverseSteps: this.inverseSteps,
      beforeSelection: this.beforeSelection,
      afterSelection: this.afterSelection,
      meta: this.meta,
    };
  }
}

export function createTransaction(doc, selection = null) {
  return new Transaction(doc, selection);
}
