// acrx/assets/js/editor/app/canvas/dragdrop.js
//
// Single drag/drop model: source block, target parent/index, before/after/
// inside resolution, capability validation, subtle drop indicator, Escape to
// cancel, touch long-press fallback, auto-scroll near edges. Canvas handles
// and layers both speak this model; insertion executes the resolved move.

import { CONTAINER_TYPES } from "../core/model.js";

let ctx = null;
let dragId = null;
let indicator = null;
let autoScrollTimer = 0;

export function initDragDrop(shared) {
  ctx = shared;
  const canvas = ctx.canvas();

  indicator = document.createElement("div");
  indicator.className = "block-drop-indicator hidden";
  canvas.appendChild(indicator);

  // Drag from block handles.
  canvas.addEventListener("dragstart", (event) => {
    const handle = event.target.closest(".block-handle");
    const wrap = event.target.closest(".block-wrap");
    if (!handle || !wrap) return;
    const id = wrap.getAttribute("data-for-block-id");
    const block = ctx.getBlock(id);
    if (!block || block.locked) {
      event.preventDefault();
      return;
    }
    dragId = id;
    event.dataTransfer.setData("text/acrx-block", id);
    event.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => wrap.classList.add("dragging"));
    ctx.selectBlock(id, { focus: false });
  });

  canvas.addEventListener("dragend", () => {
    cancel();
  });

  // Widget drag from the Widgets panel (copy, not move).
  canvas.addEventListener("dragover", (event) => {
    if (!dragId && !hasType(event, "text/acrx-widget")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = dragId ? "move" : "copy";
    updateIndicator(event);
    autoScroll(event);
  });

  canvas.addEventListener("drop", (event) => {
    const widgetType = getType(event, "text/acrx-widget");
    const target = resolveTarget(event);
    hideIndicator();
    stopAutoScroll();
    if (widgetType && target) {
      event.preventDefault();
      ctx.insertWidgetAt(widgetType, target);
      return;
    }
    if (!dragId || !target) return;
    event.preventDefault();
    const source = dragId;
    cancel();
    ctx.moveBlockTo(source, target);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dragId) cancel();
  });

  // Touch fallback: long-press a handle to start a move, tap target to drop.
  let touchTimer = 0;
  let touchId = null;
  canvas.addEventListener("touchstart", (event) => {
    const handle = event.target.closest(".block-handle");
    if (!handle) return;
    const wrap = handle.closest(".block-wrap");
    touchId = wrap?.getAttribute("data-for-block-id");
    clearTimeout(touchTimer);
    touchTimer = setTimeout(() => {
      if (touchId) {
        dragId = touchId;
        wrap?.classList.add("dragging");
        ctx.toast("Move mode: tap a block to place before it", "info");
      }
    }, 450);
  }, { passive: true });
  canvas.addEventListener("touchend", (event) => {
    clearTimeout(touchTimer);
    if (!dragId) return;
    const wrap = event.target.closest(".block-wrap");
    const targetId = wrap?.getAttribute("data-for-block-id");
    if (targetId && targetId !== dragId) {
      const source = dragId;
      cancel();
      ctx.moveBlockTo(source, { parentId: ctx.parentOf(targetId), index: ctx.indexOf(targetId) });
    } else if (!wrap) {
      cancel();
    }
  });
  canvas.addEventListener("touchmove", () => clearTimeout(touchTimer), { passive: true });
}

function hasType(event, type) {
  return [...(event.dataTransfer?.types || [])].includes(type);
}

// Deepest container block under the pointer that is NOT top-level (top-level
// zones own those) and NOT the drag source or its descendant (invalid move).
function deepestNestedContainerAt(x, y) {
  if (typeof document.elementFromPoint !== "function") return null;
  const el = document.elementFromPoint(x, y);
  const inner = el?.closest?.(".block[data-block-id]");
  if (!inner) return null;
  let node = inner;
  while (node && node !== ctx.canvas()) {
    if (node.classList && node.classList.contains("block") && node.hasAttribute("data-block-id")) {
      const id = node.getAttribute("data-block-id");
      const wrap = node.closest(".block-wrap");
      const isTopLevel = wrap && wrap.parentElement === ctx.canvas();
      if (!isTopLevel) {
        const block = ctx.getBlock(id);
        if (block && CONTAINER_TYPES.has(block.type) && id !== dragId && !isDescendantOf(id, dragId)) {
          return id;
        }
      }
    }
    node = node.parentElement;
  }
  return null;
}

function isDescendantOf(id, ancestorId) {
  if (!ancestorId) return false;
  let node = ctx.getBlock(id);
  while (node && node.parentId) {
    if (node.parentId === ancestorId) return true;
    node = ctx.getBlock(node.parentId);
  }
  return false;
}

function getType(event, type) {
  try {
    return hasType(event, type) ? event.dataTransfer.getData(type) : null;
  } catch {
    return null;
  }
}

// Resolve pointer position to { parentId, index } using wrap geometry.
// Deepest nested container under the pointer wins (append inside); top-level
// wraps keep their before/inside/after zones; empty canvas drops at root.
export function resolveTarget(event) {
  const canvas = ctx.canvas();
  const wraps = [...canvas.querySelectorAll(":scope > .block-wrap")];
  if (wraps.length === 0) return { parentId: ctx.editor.document.rootId, index: 0 };
  const nested = deepestNestedContainerAt(event.clientX, event.clientY);
  if (nested) {
    const block = ctx.getBlock(nested);
    if (block && CONTAINER_TYPES.has(block.type)) {
      return { parentId: nested, index: (block.children || []).length };
    }
  }
  for (const wrap of wraps) {
    const rect = wrap.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height * 0.35) {
      return { parentId: ctx.parentOf(wrap.getAttribute("data-for-block-id")), index: ctx.indexOf(wrap.getAttribute("data-for-block-id")) };
    }
    if (event.clientY < rect.top + rect.height * 0.65) {
      const id = wrap.getAttribute("data-for-block-id");
      const block = ctx.getBlock(id);
      if (block && CONTAINER_TYPES.has(block.type) && id !== dragId) {
        return { parentId: id, index: (block.children || []).length };
      }
      return { parentId: ctx.parentOf(id), index: ctx.indexOf(id) + 1 };
    }
  }
  const last = wraps[wraps.length - 1].getAttribute("data-for-block-id");
  return { parentId: ctx.parentOf(last), index: ctx.indexOf(last) + 1 };
}

function updateIndicator(event) {
  const canvas = ctx.canvas();
  const target = resolveTarget(event);
  if (!target) { hideIndicator(); return; }
  const wraps = [...canvas.querySelectorAll(":scope > .block-wrap")];
  let anchor = null;
  let before = true;
  if (target.index === 0 && target.parentId === ctx.editor.document.rootId) {
    anchor = wraps[0] || document.getElementById("canvas-main-input");
    before = true;
  } else {
    const siblings = target.parentId === ctx.editor.document.rootId
      ? wraps
      : [...(canvas.querySelector(`.block-wrap[data-for-block-id="${CSS.escape(target.parentId)}"] .block`)?.children || [])];
    anchor = siblings[target.index] || null;
    before = !!anchor;
    if (!anchor) anchor = siblings[siblings.length - 1] || null;
  }
  const canvasRect = canvas.getBoundingClientRect();
  let top;
  if (!anchor) {
    top = canvasRect.height - 8;
  } else {
    const r = anchor.getBoundingClientRect();
    top = (before ? r.top : r.bottom) - canvasRect.top + canvas.scrollTop;
  }
  indicator.classList.remove("hidden");
  indicator.style.top = `${Math.max(0, top - 1)}px`;
}

function hideIndicator() {
  indicator?.classList.add("hidden");
}

function autoScroll(event) {
  stopAutoScroll();
  const canvas = ctx.canvas();
  autoScrollTimer = setInterval(() => {
    const rect = canvas.getBoundingClientRect();
    if (event.clientY < rect.top + 60) canvas.scrollTop -= 12;
    else if (event.clientY > rect.bottom - 60) canvas.scrollTop += 12;
    else stopAutoScroll();
  }, 50);
}

function stopAutoScroll() {
  clearInterval(autoScrollTimer);
  autoScrollTimer = 0;
}

export function cancel() {
  if (dragId) {
    ctx.canvas().querySelector(`.block-wrap[data-for-block-id="${CSS.escape(dragId)}"]`)?.classList.remove("dragging");
  }
  dragId = null;
  hideIndicator();
  stopAutoScroll();
}

export function isDragging() {
  return !!dragId;
}

export default { initDragDrop, resolveTarget, cancel, isDragging };
