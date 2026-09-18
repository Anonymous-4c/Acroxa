// src/core/runtime/diff/index.js
// AcroxaJS render-tree diff engine (Phase 5).
// Pure, DOM-free: diffs two serialized trees (snapshot root / subtree) into
// an op list the browser applies via dom-patch.js. Ops model fits AcroxaJS:
//   setHtml        — replace target's inner HTML (text + raw content)
//   setAttr        — set one attribute
//   removeAttr     — remove one attribute
//   replaceSubtree — replace the whole target element (identity/tag changed)
//   insert         — insert new child (html, before sibling id or append)
//   remove         — remove child
//   move           — reposition existing child (keyed lists)
// Unchanged subtrees short-circuit on reference+html equality — recursion
// only touches nodes that actually changed. Unkeyed children diff
// positionally when structurally aligned; conservative replaceSubtree on
// the parent otherwise (the proven swap path — correctness > minimality).

"use strict";

function innerOf(node) {
  const html = node && node.html;
  const tag = node && node.tag;
  if (typeof html !== "string" || !tag) return null;
  const open = html.indexOf(">");
  const close = html.lastIndexOf("</" + tag);
  if (open === -1 || close === -1 || close < open) return null;
  return html.slice(open + 1, close);
}

function idOf(node) {
  if (!node) return null;
  if (node.id) return String(node.id);
  const attrs = node.attrs || {};
  if (attrs["data-acrx-id"]) return String(attrs["data-acrx-id"]);
  if (node.key) return String(node.key);
  return null;
}

function diffAttrs(target, oldAttrs = {}, newAttrs = {}, ops) {
  const before = ops.length;
  const names = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);
  for (const name of names) {
    if (name === "data-acrx-rev" || name === "data-acrx-generation") continue;
    const a = oldAttrs[name];
    const b = newAttrs[name];
    if (a === b) continue;
    if (b === undefined || b === false || b === null) ops.push({ op: "removeAttr", target, name });
    else ops.push({ op: "setAttr", target, name, value: String(b) });
  }
  return ops.length - before;
}

/**
 * Diff two serialized tree nodes into ops. Returns ops array (mutated in
 * place by recursion). `parentId` is the nearest identified ancestor for
 * insert targeting.
 */
function walk(oldNode, newNode, ops, parentId) {
  const oldId = idOf(oldNode);
  const newId = idOf(newNode);

  // Identity changed → the client cannot reuse this node.
  if (oldId !== newId) {
    ops.push({ op: "replaceSubtree", target: oldId || parentId, html: newNode.html || "" });
    return;
  }
  const target = newId || parentId;

  // Tag changed → same identity, different element — replace.
  if ((oldNode.tag || "") !== (newNode.tag || "")) {
    ops.push({ op: "replaceSubtree", target, html: newNode.html || "" });
    return;
  }

  const beforeWalk = ops.length;
  const attrCount = diffAttrs(target, oldNode.attrs, newNode.attrs, ops);

  const oldKids = Array.isArray(oldNode.children) ? oldNode.children : [];
  const newKids = Array.isArray(newNode.children) ? newNode.children : [];

  if (!oldKids.length && !newKids.length) {
    // Leaf: attr ops absent → html change must be text/raw content.
    if (attrCount === 0) {
      const a = innerOf(oldNode);
      const b = innerOf(newNode);
      if (a !== null && b !== null && a !== b) {
        ops.push({ op: "setHtml", target, value: b });
      }
    }
    return;
  }

  const beforeChildren = ops.length;
  diffChildren(oldNode, newNode, oldKids, newKids, ops, target);
  const hadChildOps = ops.length > beforeChildren;

  // Non-leaf direct-text change: children AND attrs unchanged but the inner
  // html differs → the difference is the node's own text segments.
  if (!hadChildOps && attrCount === 0) {
    const a = innerOf(oldNode);
    const b = innerOf(newNode);
    if (a !== null && b !== null && a !== b) {
      ops.push({ op: "setHtml", target, value: b });
    }
  }
  void beforeWalk;
}

function diffChildren(oldNode, newNode, oldKids, newKids, ops, parentId) {
  const oldIds = oldKids.map(idOf);
  const newIds = newKids.map(idOf);

  // Unkeyed on both sides, same count → positional walk (conservative:
  // any tag/identity mismatch inside replaces that subtree).
  const allUnkeyed = oldIds.every((i) => i === null) && newIds.every((i) => i === null);
  if (allUnkeyed && oldKids.length === newKids.length) {
    for (let i = 0; i < oldKids.length; i++) walk(oldKids[i], newKids[i], ops, parentId);
    return;
  }

  const oldMap = new Map();
  oldKids.forEach((k, i) => { if (oldIds[i] !== null) oldMap.set(oldIds[i], k); });
  const newMap = new Map();
  newKids.forEach((k, i) => { if (newIds[i] !== null) newMap.set(newIds[i], k); });

  // Removals (keyed, present in old only).
  for (let i = 0; i < oldKids.length; i++) {
    const id = oldIds[i];
    if (id !== null && !newMap.has(id)) ops.push({ op: "remove", target: id });
  }

  // Common children in NEW order — recurse + move detection.
  const commonOldOrder = [];
  for (let i = 0; i < newKids.length; i++) {
    const id = newIds[i];
    if (id === null) continue;
    const oldKid = oldMap.get(id);
    if (!oldKid) continue;
    const nextNew = newKids[i + 1] ? idOf(newKids[i + 1]) : null;
    walk(oldKid, newKids[i], ops, parentId);
    commonOldOrder.push({ id, nextNew });
  }

  // Moves: a common child whose old-order position decreased relative to
  // the previous common child must be repositioned (correct, bounded —
  // not LIS-optimal).
  let lastIdx = -1;
  for (const c of commonOldOrder) {
    const idx = oldIds.indexOf(c.id);
    if (idx !== -1 && idx < lastIdx) {
      ops.push({ op: "move", target: c.id, parent: parentId, before: c.nextNew });
    } else if (idx !== -1) {
      lastIdx = idx;
    }
  }

  // Insertions (keyed, present in new only) — in document order.
  for (let i = 0; i < newKids.length; i++) {
    const id = newIds[i];
    if (id === null) continue;
    if (oldMap.has(id)) continue;
    const nextNew = newKids[i + 1] ? idOf(newKids[i + 1]) : null;
    ops.push({ op: "insert", parent: parentId, html: newKids[i].html || "", before: nextNew });
  }

  // Unkeyed leftovers (mixed keyed/unkeyed): conservative replace of the
  // parent when unkeyed content changed shape.
  const oldUnkeyed = oldKids.filter((_, i) => oldIds[i] === null);
  const newUnkeyed = newKids.filter((_, i) => newIds[i] === null);
  if (oldUnkeyed.length || newUnkeyed.length) {
    const a = oldUnkeyed.map((k) => k.html || "").join("");
    const b = newUnkeyed.map((k) => k.html || "").join("");
    if (a !== b && parentId) {
      ops.push({ op: "setHtml", target: parentId, value: innerOf(newNode) || b });
    }
  }
}

/**
 * Diff two trees. Accepts serialized roots (snapshot.root / children) or
 * plain html-type roots. Returns { ops, unchanged }.
 */
function diff(oldTree, newTree) {
  const ops = [];

  if (!oldTree || !newTree) return { ops: [], unchanged: false };

  // Plain html roots (no recorded tree): region-level inner swap.
  if (oldTree.type === "html" && newTree.type === "html") {
    if (oldTree.html === newTree.html) return { ops: [], unchanged: true };
    return {
      ops: [{ op: "setHtml", target: oldTree.id || "page-root", value: newTree.html }],
      unchanged: false,
    };
  }
  if (oldTree.type === "html" || newTree.type === "html") {
    // Tree ↔ html transition: full replace (client swaps region).
    return {
      ops: [{
        op: "replaceSubtree",
        target: oldTree.id || "page-root",
        html: newTree.type === "html" ? (newTree.html || "") : JSON.stringify(newTree),
      }],
      unchanged: false,
    };
  }

  walk(oldTree, newTree, ops, null);
  return { ops, unchanged: ops.length === 0 };
}

module.exports = { diff, innerOf, idOf };
