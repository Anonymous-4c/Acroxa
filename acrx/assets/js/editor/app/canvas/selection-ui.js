// acrx/assets/js/editor/app/canvas/selection-ui.js
//
// Canvas selection behavior + canvas <-> layers <-> inspector sync.
// Click selects, Ctrl/Cmd-click toggles multi-select, Shift-click extends,
// checkbox toggles membership, text selections spanning blocks upgrade to
// block-range selection. Engine selection stays canonical; State mirrors it.

let ctx = null;
let lastClickedId = null;

export function initSelection(shared) {
  ctx = shared;
}

function canvas() {
  return ctx.canvas();
}

function wrapOf(el) {
  return el ? el.closest(".block-wrap") : null;
}

function blockIdOfWrap(wrap) {
  return wrap ? wrap.getAttribute("data-for-block-id") : null;
}

export function paintSelection() {
  const sel = ctx.editor.engines.selection;
  const selected = new Set(sel.selectedBlockIds());
  const multiIds = sel.get().mode === "blocks" ? new Set(sel.get().blockIds) : new Set();
  const canvasEl = canvas();
  canvasEl.querySelectorAll(":scope .block-wrap.is-selected, :scope .block-wrap.is-multiselected, :scope .block-wrap.is-anchored").forEach((w) => {
    w.classList.remove("is-selected", "is-multiselected", "is-anchored");
  });
  // The floating block-actions bar anchors to exactly one block.
  const anchorId = multiIds.size > 0 ? null : [...selected][0] || null;
  for (const id of selected) {
    const wrap = canvasEl.querySelector(`:scope > .block-wrap[data-for-block-id="${CSS.escape(id)}"], :scope .block-wrap[data-for-block-id="${CSS.escape(id)}"]`);
    if (!wrap) continue;
    wrap.classList.add(multiIds.has(id) ? "is-multiselected" : "is-selected");
    if (id === anchorId) wrap.classList.add("is-anchored");
  }
  canvas().querySelectorAll(":scope .block-check").forEach((box) => {
    const wrap = wrapOf(box);
    const id = blockIdOfWrap(wrap);
    box.checked = !!(id && multiIds.has(id));
  });
}

export function select(id, opts = {}) {
  if (!id) return;
  const sel = ctx.editor.engines.selection;
  if (opts.toggle) {
    sel.toggleBlock(id);
  } else if (opts.additive && !sel.isEmpty()) {
    const ids = sel.selectedBlockIds();
    if (!ids.includes(id)) sel.selectBlocks([...ids, id]);
    else sel.setCaret(id, 0);
  } else {
    sel.setCaret(id, opts.offset || 0);
  }
  lastClickedId = id;
  ctx.afterSelectionChange(opts.focus !== false ? id : null);
}

export function extendTo(id) {
  const topId = topLevelAncestor(id);
  const sel = ctx.editor.engines.selection;
  if (sel.isEmpty() || !lastClickedId) {
    select(topId || id, { focus: false });
    return;
  }
  const order = ctx.topLevelOrder();
  const a = order.indexOf(topLevelAncestor(lastClickedId) || lastClickedId);
  const b = order.indexOf(topId || id);
  if (a < 0 || b < 0) {
    select(topId || id, { focus: false });
    return;
  }
  const [from, to] = a <= b ? [a, b] : [b, a];
  sel.selectBlocks(order.slice(from, to + 1));
  ctx.afterSelectionChange(null);
}

export function clearSelection() {
  ctx.editor.engines.selection.clear();
  lastClickedId = null;
  ctx.afterSelectionChange(null);
}

// Nearest top-level ancestor of a (possibly nested) block id, for range ops
// that only understand top-level order. Null when the id is unknown.
export function topLevelAncestor(id) {
  if (!id) return null;
  const doc = ctx.editor.document;
  const order = ctx.topLevelOrder();
  const seen = new Set();
  let cur = id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (order.includes(cur)) return cur;
    const node = doc.getNode(cur);
    cur = node ? node.parentId || doc.rootId : null;
    if (!cur || cur === doc.rootId) return null;
  }
  return null;
}

// Upgrade a text selection spanning multiple blocks into block selection.
// Nested endpoints resolve to their top-level ancestors so drags crossing
// widget boundaries (columns, heroes, tables…) upgrade instead of dying.
export function maybeUpgradeTextSelection() {
  const domSel = window.getSelection();
  if (!domSel || domSel.rangeCount === 0 || domSel.isCollapsed) return false;
  const range = domSel.getRangeAt(0);
  const startWrap = wrapOf(range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement);
  const endWrap = wrapOf(range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement);
  const startId = blockIdOfWrap(startWrap);
  const endId = blockIdOfWrap(endWrap);
  if (!startId || !endId || startId === endId) return false;
  const topA = topLevelAncestor(startId) || startId;
  const topB = topLevelAncestor(endId) || endId;
  if (topA === topB) return false;
  const order = ctx.topLevelOrder();
  const a = order.indexOf(topA);
  const b = order.indexOf(topB);
  if (a < 0 || b < 0) return false;
  const [from, to] = a <= b ? [a, b] : [b, a];
  ctx.editor.engines.selection.selectBlocks(order.slice(from, to + 1));
  ctx.afterSelectionChange(null);
  return true;
}

export function selectedId() {
  const sel = ctx.editor.engines.selection.get();
  if (sel.mode === "none") return null;
  return sel.anchorId;
}

export function selectedIds() {
  return ctx.editor.engines.selection.selectedBlockIds();
}

export function isMulti() {
  return ctx.editor.engines.selection.get().mode === "blocks";
}

export function bindCanvasSelection() {
  const cv = canvas();

  cv.addEventListener("click", (event) => {
    // Insertion buttons and media placeholders handle themselves.
    if (event.target.closest("[data-action]")) return;
    const check = event.target.closest(".block-check");
    if (check) {
      const wrap = wrapOf(check);
      const id = blockIdOfWrap(wrap);
      if (id) {
        event.preventDefault();
        select(id, { toggle: true, focus: false });
      }
      return;
    }
    const handle = event.target.closest(".block-handle");
    if (handle) {
      const id = handle.getAttribute("data-handle-block-id");
      if (id) {
        event.preventDefault();
        if (event.shiftKey) extendTo(id);
        else select(id, { toggle: event.ctrlKey || event.metaKey, focus: false });
      }
      return;
    }
    // A drag that leaves a live text range owns this gesture: the mouseup
    // click lands on the common ancestor (often bare canvas), and without
    // this guard it would collapse to one caret — or clear entirely —
    // instead of upgrading the cross-block range to block selection.
    const domSel = window.getSelection();
    if (domSel && !domSel.isCollapsed && domSel.rangeCount > 0) {
      let inside = false;
      try {
        inside = cv.contains(domSel.anchorNode) && cv.contains(domSel.focusNode);
      } catch { inside = false; }
      if (inside) {
        if (maybeUpgradeTextSelection()) return;
        // Single-block range (e.g. triple-click): fall through so normal
        // click handling still selects its block below.
      }
    }
    const wrap = event.target.closest(".block-wrap");
    if (!wrap) {
      if (!event.target.closest(".canvas-empty-state")) clearSelection();
      return;
    }
    const id = blockIdOfWrap(wrap);
    if (!id) return;
    if (event.shiftKey) {
      extendTo(id);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      select(id, { toggle: true });
      return;
    }
    const current = selectedId();
    if (current !== id) select(id, { focus: false });
  });

  document.addEventListener("selectionchange", () => {
    if (!ctx.isActive()) return;
    const ae = document.activeElement;
    if (ae && cv.contains(ae)) {
      // Defer: let the DOM settle, then upgrade cross-block text ranges.
      clearTimeout(bindCanvasSelection._t);
      bindCanvasSelection._t = setTimeout(() => {
        if (ctx.isActive()) maybeUpgradeTextSelection();
      }, 120);
    }
  });
}

export default { initSelection, bindCanvasSelection, paintSelection, select, extendTo, clearSelection, maybeUpgradeTextSelection, topLevelAncestor, selectedId, selectedIds, isMulti };
