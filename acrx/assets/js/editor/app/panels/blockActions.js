// acrx/assets/js/editor/app/panels/blockActions.js
//
// Wires the existing block-actions bar (transform dropdown, settings, hide,
// lock, duplicate, delete, move, more) to the selected block with
// capability-aware enablement. Existing IDs/classes are preserved.

import { CATALOG_BY_TYPE } from "../core/model.js";

let ctx = null;
let bar = null;

export function initBlockActions(shared) {
  ctx = shared;
  bar = document.querySelector(".editor-block-actions");
  if (!bar) return;

  // Keep the floating bar glued to its block while the canvas scrolls.
  const canvas = ctx.canvas();
  let scrollRaf = 0;
  canvas.addEventListener("scroll", () => {
    if (!bar || bar.classList.contains("hidden")) return;
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => positionBar(ctx.currentBlockId()));
  }, { passive: true });

  document.querySelector("#transform-block-btn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelector(".transform-block-dropdown")?.classList.toggle("hidden");
  });

  document.querySelectorAll(".transform-block-item").forEach((item) => {
    item.addEventListener("click", () => {
      const id = ctx.currentBlockId();
      const slug = item.getAttribute("data-transform");
      document.querySelector(".transform-block-dropdown")?.classList.add("hidden");
      if (!id || !slug) return;
      ctx.transformBlock(id, slugToType(slug));
    });
  });

  document.querySelector("#block-settings-btn")?.addEventListener("click", () => {
    if (ctx.currentBlockId()) ctx.showPanel("right", "block");
    else ctx.toast("Select a block first", "info");
  });

  document.querySelector("#Hide-block-btn")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (id) ctx.toggleHide(id);
  });

  document.querySelector("#lock-block-btn")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (id) ctx.toggleLock(id);
  });

  document.querySelector("#duplicate-block-btn")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (id) ctx.duplicateBlock(id);
  });

  document.querySelector("#delete-block-btn")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (id) ctx.deleteBlock(id);
  });

  document.querySelector("#move-block-up-btn")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (id) ctx.moveBlock(id, -1);
  });

  document.querySelector("#move-block-down-btn")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (id) ctx.moveBlock(id, 1);
  });

  document.querySelector("#more-block-actions-btn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    ctx.openBlockMenu(ctx.currentBlockId());
  });

  document.addEventListener("click", () => {
    document.querySelector(".transform-block-dropdown")?.classList.add("hidden");
  });
}

function slugToType(slug) {
  const map = {
    paragraph: "paragraph", heading: "heading", "inline-code": "codeblock",
    blockquote: "blockquote", "code-block": "codeblock",
    "ordered-list": "orderedList", "unordered-list": "bulletList",
  };
  return map[slug] || "paragraph";
}

// Show/hide + enablement from the selected block's capabilities.
export function refresh() {
  if (!bar) return;
  const id = ctx.currentBlockId();
  const block = id ? ctx.getBlock(id) : null;
  bar.classList.toggle("hidden", !block);
  if (!block) return;
  const def = CATALOG_BY_TYPE[block.type];
  const capabilities = def ? def.capabilities : {};
  const locked = !!block.locked;
  const setEnabled = (selector, on, title) => {
    const btn = document.querySelector(selector);
    if (!btn) return;
    btn.disabled = !on;
    btn.classList.toggle("is-disabled", !on);
    if (title) btn.setAttribute("data-title", title);
  };
  const order = ctx.topLevelOrder();
  const idx = order.indexOf(id);
  setEnabled("#duplicate-block-btn", !locked && capabilities.duplicable !== false);
  setEnabled("#delete-block-btn", !locked);
  setEnabled("#move-block-up-btn", !locked && idx > 0);
  setEnabled("#move-block-down-btn", !locked && idx >= 0 && idx < order.length - 1);
  setEnabled("#lock-block-btn", capabilities.lockable !== false);
  document.querySelector("#lock-block-btn")?.classList.toggle("is-active", locked);
  document.querySelector("#Hide-block-btn")?.classList.toggle("is-active", !!block.hidden);
  const transformBtn = document.querySelector("#transform-block-btn");
  if (transformBtn) {
    const icon = transformBtn.querySelector("i, svg");
    if (icon && def) {
      icon.setAttribute("class", `fa-duotone fa-${def.icon}`);
    }
  }
  positionBar(block ? block.id : null);
}

// Explicit placement above the selected block. The shell's CSS-anchor
// positioning is left as a progressive enhancement, but explicit geometry
// is deterministic across browsers and does not depend on global anchor
// state (which proved unreliable in practice).
export function positionBar(blockId) {
  if (!bar) return;
  const block = blockId ? ctx.getBlock(blockId) : null;
  if (!block) return;
  const canvas = ctx.canvas();
  const wrap = canvas.querySelector(`.block-wrap[data-for-block-id="${CSS.escape(blockId)}"]`);
  const main = canvas.closest(".acrx-editor-main") || canvas.parentElement;
  if (!wrap || !main) return;
  const wr = wrap.getBoundingClientRect();
  const mr = main.getBoundingClientRect();
  // Rects already reflect scroll position; plain difference tracks the block.
  // Left-aligned to the block with a solid backdrop: predictable, readable,
  // and never stretched across unrelated content.
  const top = wr.top - mr.top - bar.offsetHeight - 10;
  const left = wr.left - mr.left + 8;
  bar.style.top = `${Math.max(2, top)}px`;
  bar.style.left = `${Math.max(2, Math.min(left, mr.width - bar.offsetWidth - 2))}px`;
}

export default { initBlockActions, refresh, positionBar };
