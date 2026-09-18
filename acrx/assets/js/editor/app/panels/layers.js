// acrx/assets/js/editor/app/panels/layers.js
//
// Layers panel on the existing shell hooks (#sidebar-left-panel-layers,
// #layers-tree). Renders the live document hierarchy from the layers engine:
// expand/collapse, click-to-select, visibility + lock toggles, drag reorder
// with capability validation, context menu, and canvas two-way sync.

import { CATALOG_BY_TYPE, blockLabel } from "../core/model.js";

let ctx = null;
let treeEl = null;
let collapsed = new Set();
let filterText = "";

export function initLayers(shared) {
  ctx = shared;
  const panel = document.getElementById("sidebar-left-panel-layers");
  if (!panel) return;
  treeEl = document.getElementById("layers-tree");
  if (!treeEl) return;

  // Toolbar row (additive; existing tree contract preserved).
  if (!panel.querySelector(".layers-toolbar")) {
    const bar = document.createElement("div");
    bar.className = "layers-toolbar";
    bar.innerHTML =
      `<input type="text" class="layers-filter" placeholder="Filter layers..." aria-label="Filter layers">` +
      `<button type="button" class="axed-btn axed-icon layers-expand-all" data-title="Expand all" aria-label="Expand all"><i class="fa-duotone fa-angles-down"></i></button>` +
      `<button type="button" class="axed-btn axed-icon layers-collapse-all" data-title="Collapse all" aria-label="Collapse all"><i class="fa-duotone fa-angles-up"></i></button>`;
    panel.insertBefore(bar, treeEl);
    bar.querySelector(".layers-filter").addEventListener("input", (e) => {
      filterText = e.target.value.toLowerCase();
      refresh();
    });
    bar.querySelector(".layers-expand-all").addEventListener("click", () => {
      collapsed.clear();
      refresh();
    });
    bar.querySelector(".layers-collapse-all").addEventListener("click", () => {
      for (const l of ctx.editor.engines.layers.flatten(ctx.editor.document)) {
        if (l.depth > 0 && l.childCount > 0) collapsed.add(l.id);
      }
      refresh();
    });
  }

  treeEl.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-layer-toggle]");
    if (toggle) {
      const id = toggle.getAttribute("data-layer-toggle");
      collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
      refresh();
      return;
    }
    const vis = event.target.closest("[data-layer-vis]");
    if (vis) {
      ctx.toggleHide(vis.getAttribute("data-layer-vis"));
      return;
    }
    const lock = event.target.closest("[data-layer-lock]");
    if (lock) {
      ctx.toggleLock(lock.getAttribute("data-layer-lock"));
      return;
    }
    const item = event.target.closest("[data-layer-id]");
    if (item) {
      const id = item.getAttribute("data-layer-id");
      if (event.ctrlKey || event.metaKey) ctx.toggleMultiSelect(id);
      else ctx.selectBlock(id);
    }
  });

  treeEl.addEventListener("contextmenu", (event) => {
    const item = event.target.closest("[data-layer-id]");
    if (!item) return;
    event.preventDefault();
    ctx.openLayerMenu(item.getAttribute("data-layer-id"), event.clientX, event.clientY);
  });

  // Drag reorder (HTML5 DnD + touch long-press handled in dragdrop.js).
  treeEl.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-layer-id]");
    if (!item) return;
    event.dataTransfer.setData("text/acrx-layer", item.getAttribute("data-layer-id"));
    event.dataTransfer.effectAllowed = "move";
  });
  treeEl.addEventListener("dragover", (event) => {
    const item = event.target.closest("[data-layer-id]");
    if (!item) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    treeEl.querySelectorAll(".drop-before,.drop-after,.drop-inside").forEach((n) => n.classList.remove("drop-before", "drop-after", "drop-inside"));
    const rect = item.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    item.classList.add(ratio < 0.25 ? "drop-before" : ratio > 0.75 ? "drop-after" : "drop-inside");
  });
  treeEl.addEventListener("dragleave", (event) => {
    if (event.target === treeEl) {
      treeEl.querySelectorAll(".drop-before,.drop-after,.drop-inside").forEach((n) => n.classList.remove("drop-before", "drop-after", "drop-inside"));
    }
  });
  treeEl.addEventListener("drop", (event) => {
    const item = event.target.closest("[data-layer-id]");
    treeEl.querySelectorAll(".drop-before,.drop-after,.drop-inside").forEach((n) => n.classList.remove("drop-before", "drop-after", "drop-inside"));
    if (!item) return;
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/acrx-layer");
    if (!sourceId) return;
    const targetId = item.getAttribute("data-layer-id");
    // Recompute the drop position from the pointer (indicators were cleared).
    const rect = item.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    const position = ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
    ctx.moveLayer(sourceId, targetId, position);
  });
}

function iconFor(type) {
  const def = CATALOG_BY_TYPE[type];
  return def ? def.icon : "cube";
}

function renderNode(layer, selectedIds, multiIds) {
  const matches = !filterText || layer.label.toLowerCase().includes(filterText) || layer.type.includes(filterText);
  const childHTML = (!collapsed.has(layer.id) || filterText ? layer.children : [])
    .map((c) => renderNode(c, selectedIds, multiIds))
    .join("");
  const hasVisibleKids = layer.children.length > 0 && childHTML !== "";
  // When filtering, show matching branches even if collapsed.
  const hidden = !matches && !hasVisibleKids && filterText ? " hidden" : "";
  const isSel = selectedIds.has(layer.id);
  const isMulti = multiIds.has(layer.id);
  return `<div class="layers-tree-item layer-item${isSel && !isMulti ? " is-selected" : ""}${isMulti ? " is-multiselected" : ""}${layer.visible ? "" : " is-hidden"}${hidden}" ` +
    `data-layer-id="${layer.id}" data-block-id="${layer.id}" draggable="true" role="treeitem" aria-selected="${isSel}" aria-expanded="${!collapsed.has(layer.id)}">` +
    `<span class="layer-indent" style="--layer-depth:${layer.depth}"></span>` +
    (layer.children.length > 0
      ? `<button type="button" class="layers-tree-toggle" data-layer-toggle="${layer.id}" aria-label="Expand or collapse"><i class="fa-duotone fa-angle-${collapsed.has(layer.id) && !filterText ? "right" : "down"}"></i></button>`
      : `<span class="layers-tree-spacer"></span>`) +
    `<span class="layer-icon"><i class="fa-duotone fa-${iconFor(layer.type)}"></i></span>` +
    `<span class="layer-label">${escapeHtml(layer.label)}</span>` +
    `<span class="layer-flags">` +
    `<button type="button" class="layer-flag" data-layer-vis="${layer.id}" data-title="${layer.visible ? "Hide" : "Show"}" aria-label="Toggle visibility"><i class="fa-duotone fa-${layer.visible ? "eye" : "eye-slash"}"></i></button>` +
    `<button type="button" class="layer-flag${layer.locked ? " is-on" : ""}" data-layer-lock="${layer.id}" data-title="${layer.locked ? "Unlock" : "Lock"}" aria-label="Toggle lock"><i class="fa-duotone fa-lock${layer.locked ? "" : "-keyhole-open"}"></i></button>` +
    `</span></div>` +
    (hasVisibleKids ? `<div class="layer-children" role="group">${childHTML}</div>` : "");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function refresh() {
  if (!treeEl || !ctx) return;
  const tree = ctx.editor.engines.layers.build(ctx.editor.document);
  const sel = ctx.editor.engines.selection;
  const selectedIds = new Set(sel.selectedBlockIds());
  const multiIds = sel.get().mode === "blocks" ? new Set(sel.get().blockIds) : new Set();
  const kids = (tree.children || []).map((c) => renderNode(c, selectedIds, multiIds)).join("");
  treeEl.innerHTML =
    `<div class="layers-tree-root" data-layer-id="${tree.id}" data-block-id="${tree.id}" role="tree" aria-label="Document layers">` +
    `<div class="layers-tree-root-label"><i class="fa-duotone fa-layer-group"></i><span>Content</span>` +
    `<span class="layers-count">${tree.children.length}</span></div>` +
    `<div class="layers-tree-root-children">${kids || `<div class="layers-empty">No blocks yet. Use + or / to add content.</div>`}</div></div>`;
}

export function reveal(id) {
  // Expand ancestors so the layer is visible, then scroll to it.
  let node = ctx.editor.document.getNode(id);
  while (node && node.parentId) {
    collapsed.delete(node.parentId);
    node = ctx.editor.document.getNode(node.parentId);
  }
  refresh();
  treeEl.querySelector(`[data-layer-id="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: "nearest" });
}

export default { initLayers, refresh, reveal };
