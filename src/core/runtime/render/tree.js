// src/core/runtime/render/tree.js
// AcroxaJS canonical render tree (Phase 2).
// Builds a parent-child hierarchy from the flat node list recorded by
// render/context.js during el() execution. el() evaluates arguments before
// the parent frame exists, so hierarchy is reconstructed by html containment:
//   node B is a child of node A  ⟺  B.html ⊂ A.html
//     and B is not contained in any shorter node contained in A.
// Deterministic: html strings are exact rendered output, record order IS
// document order (args evaluate left-to-right). No parsing, no deps.
//
// Identity priority: data-acrx-id (h()/boundary nodes) > explicit key >
// tree position (filled as `pos` — never random).

"use strict";

function nodeIdOf(node) {
  if (node.id) return node.id;
  const attrs = node.attrs || {};
  if (attrs["data-acrx-id"]) return String(attrs["data-acrx-id"]);
  if (node.key) return String(node.key);
  return null;
}

/**
 * Build a render tree from a flat node list. Returns
 * { roots, byId, count, unkeyed } — mutates each node's `children`
 * (initialized empty by context.js) and adds `parentId`/`pos`.
 */
function build(flatNodes) {
  const nodes = Array.isArray(flatNodes) ? flatNodes : [];
  // Longest html first: a node's parent is the SHORTEST other node whose
  // html contains it — processing longest-first guarantees that shorter
  // containers are already attached when we look for a node's parent.
  const order = nodes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (b.n.html || "").length - (a.n.html || "").length || a.i - b.i);

  const byId = new Map();
  let unkeyed = 0;

  for (const { n, i } of order) {
    n.parentId = null;
    n.pos = i;
    const id = nodeIdOf(n);
    if (id) {
      if (!byId.has(id)) byId.set(id, n);
      // Duplicate ids keep the first (deterministic); the duplicate still
      // participates in hierarchy as a positional node.
    } else {
      unkeyed++;
    }
  }

  for (const { n } of order) {
    const html = n.html || "";
    if (!html) continue;
    let parent = null;
    let parentLen = Infinity;
    for (const { n: other } of order) {
      if (other === n) continue;
      const oh = other.html || "";
      if (!oh || oh === html || oh.length <= html.length) continue;
      if (oh.length >= parentLen) continue;
      if (oh.includes(html)) {
        parent = other;
        parentLen = oh.length;
      }
    }
    if (parent) {
      n.parentId = nodeIdOf(parent) || `pos:${parent.pos}`;
      parent.children.push(n);
    }
  }

  // Document order within each children list: by first occurrence of the
  // child's html in the parent, tiebreak by record order.
  for (const { n } of order) {
    if (!n.children.length) continue;
    const html = n.html || "";
    const positions = n.children.map((c) => {
      const idx = html.indexOf(c.html || "");
      return { c, idx: idx === -1 ? Number.MAX_SAFE_INTEGER : idx };
    });
    positions.sort((a, b) => a.idx - b.idx || a.c.pos - b.c.pos);
    n.children = positions.map((p) => p.c);
  }

  const roots = order.map((o) => o.n).filter((n) => !n.parentId);
  // Roots in document order (record order = document order for top-level).
  roots.sort((a, b) => a.pos - b.pos);

  return { roots, byId, count: nodes.length, unkeyed };
}

/**
 * Serialize a tree node to a plain-JSON transport-safe shape.
 * Scalars only — attrs filtered at record time; html included for client
 * reconciliation, omitted when `lean` (diagnostics).
 */
function serialize(node, { lean = false, depth = 0, maxDepth = 64 } = {}) {
  if (!node || depth > maxDepth) return null;
  const out = {
    id: nodeIdOf(node),
    type: "element",
    tag: node.tag,
  };
  if (node.key != null) out.key = String(node.key);
  if (!lean && node.attrs && Object.keys(node.attrs).length) out.attrs = node.attrs;
  if (node.component) out.component = node.component;
  if (node.owner) out.owner = node.owner;
  if (!lean) out.html = node.html || "";
  if (node.children && node.children.length) {
    out.children = node.children
      .map((c) => serialize(c, { lean, depth: depth + 1, maxDepth }))
      .filter(Boolean);
  }
  return out;
}

module.exports = { build, serialize, nodeIdOf };
