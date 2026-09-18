// acrx/assets/js/editor/app/canvas/insertion.js
//
// Unified insertion: every entry point (plus buttons, slash menu, palette,
// widgets panel, drag/drop, paste, duplication, patterns) resolves to one
// { parentId, index } computation and one history-aware command path.
// Insertion understands selection, containers, empty canvas and nesting.

import { CATALOG_BY_TYPE, CONTAINER_TYPES, createBlockData } from "../core/model.js";

let ctx = null;

export function initInsertion(shared) {
  ctx = shared;
}

// Catalog defaults are the source of truth for fresh blocks; caller data
// overrides per key (settings bags merge instead of replacing).
function freshData(type, overrides) {
  const base = createBlockData(type);
  if (!overrides) return base;
  for (const [key, value] of Object.entries(overrides)) {
    if (key === "settings" && value && typeof value === "object") {
      base.settings = { ...(base.settings || {}), ...JSON.parse(JSON.stringify(value)) };
    } else if (value !== undefined) {
      base[key] = value;
    }
  }
  return base;
}

// Resolve where a new block goes: inside the selected block when it is an
// empty container, otherwise after it (same parent), or at the document end.
export function resolveInsertion(afterId) {
  const doc = ctx.editor.document;
  const rootId = doc.rootId;
  const order = ctx.topLevelOrder();
  if (!afterId) {
    const sel = ctx.currentBlockId();
    afterId = sel || order[order.length - 1] || null;
  }
  if (!afterId) return { parentId: rootId, index: 0 };
  const node = doc.getNode(afterId);
  if (!node) return { parentId: rootId, index: doc.childrenOf(rootId).length };
  if (CONTAINER_TYPES.has(node.type) && node.children.length === 0) {
    return { parentId: node.id, index: 0 };
  }
  const parentId = node.parentId || rootId;
  const siblings = parentId === rootId ? order : doc.childrenOf(parentId).map((c) => c.id);
  return { parentId, index: siblings.indexOf(afterId) + 1 };
}

export function insertBlock(type, opts = {}) {
  const def = CATALOG_BY_TYPE[type];
  if (!def) {
    ctx.toast(`Unknown block type "${type}"`, "error");
    return null;
  }
  const at = opts.parentId !== undefined
    ? { parentId: opts.parentId, index: opts.index }
    : resolveInsertion(opts.afterId);
  const res = ctx.editor.execute("insertBlock", {
    parentId: at.parentId,
    type,
    index: at.index,
    id: opts.id,
    data: freshData(type, opts.data),
    settings: opts.settings,
    // Columns-style blocks declare initial children (e.g. column shells) and
    // are inserted atomically with the parent so undo is one coherent step.
    children: (!opts.skipChildren && def.insertChildren) ? def.insertChildren({}) : undefined,
  });
  if (!res.ok) {
    ctx.toast(res.error?.message || "Cannot insert here", "error");
    return null;
  }
  const newId = res.result.id;
  ctx.afterStructuralChange({ select: opts.select === false ? null : newId, focus: opts.focus });
  if (newId && opts.suggest !== false) ctx.showSuggestions(type, newId);
  return newId;
}

export function insertAfter(afterId, type, opts = {}) {
  const doc = ctx.editor.document;
  const node = afterId ? doc.getNode(afterId) : null;
  const parentId = node ? node.parentId || doc.rootId : doc.rootId;
  const siblings = parentId === doc.rootId ? ctx.topLevelOrder() : doc.childrenOf(parentId).map((c) => c.id);
  const index = node ? siblings.indexOf(afterId) + 1 : siblings.length;
  return insertBlock(type, { ...opts, parentId, index });
}

export function insertPatternNodes(converted, afterId) {
  if (!converted || converted.nodes.length === 0) {
    ctx.toast("Pattern has no blocks to insert", "info");
    return [];
  }
  const ids = [];
  let anchor = afterId || null;
  for (const node of converted.nodes) {
    const id = insertSubtree(node, anchor);
    if (id) {
      ids.push(id);
      anchor = id;
    }
  }
  if (converted.skipped > 0) {
    ctx.toast(`${converted.skipped} node(s) could not be converted and were skipped`, "warning");
  }
  if (ids.length > 0) ctx.afterStructuralChange({ select: ids[0] });
  return ids;
}

function insertSubtree(node, afterId, forceParentId) {
  const doc = ctx.editor.document;
  let at;
  if (forceParentId) {
    at = { parentId: forceParentId, index: doc.childrenOf(forceParentId).length };
  } else if (afterId) {
    const anchor = doc.getNode(afterId);
    const parentId = anchor ? anchor.parentId || doc.rootId : doc.rootId;
    const siblings = parentId === doc.rootId ? ctx.topLevelOrder() : doc.childrenOf(parentId).map((c) => c.id);
    at = { parentId, index: anchor ? siblings.indexOf(afterId) + 1 : siblings.length };
  } else {
    at = { parentId: doc.rootId, index: ctx.topLevelOrder().length };
  }
  const id = insertBlock(node.type, {
    parentId: at.parentId,
    index: at.index,
    data: node.data || {},
    select: false,
    skipChildren: true,
    suggest: false,
  });
  if (!id) return null;
  for (const child of node.children || []) insertSubtree(child, null, id);
  return id;
}

export default { initInsertion, resolveInsertion, insertBlock, insertAfter, insertPatternNodes };
