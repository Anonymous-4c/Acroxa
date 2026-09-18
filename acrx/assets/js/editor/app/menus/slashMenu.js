// acrx/assets/js/editor/app/menus/slashMenu.js
//
// Slash menu on the existing shell hooks (#editor-slash-menu,
// #slash-menu-search, #slash-menu-list, .slash-menu-item[data-widget-slug]).
// Opens when "/" starts an empty text line; live filters; keyboard navigable;
// inserts through controller insertion in a single undo step.
//
// Positioning is caret-anchored (fixed, viewport-clamped, flips above the
// caret when space is short) so the menu lands where the user is typing
// regardless of the surrounding admin layout.

import { slashItems, typeForSlug } from "../core/commands.js";

let ctx = null;
let menu = null;
let listEl = null;
let searchEl = null;
let activeIndex = 0;
let currentItems = [];
let anchorBlockId = null;
let anchorEditable = null;
// Programmatic open (insert-zone + buttons): no "/" trigger in the canvas,
// so choose() inserts at the zone position instead of after a typed anchor.
let zoneAfterId = undefined;

export function initSlashMenu(shared) {
  ctx = shared;
  menu = document.getElementById("editor-slash-menu");
  listEl = document.getElementById("slash-menu-list");
  searchEl = document.getElementById("slash-menu-search");
  if (!menu || !listEl) return;

  if (!menu.querySelector(".slash-menu-footer")) {
    const footer = document.createElement("div");
    footer.className = "slash-menu-footer";
    footer.innerHTML = `<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> select</span><span><kbd>esc</kbd> dismiss</span>`;
    menu.appendChild(footer);
  }

  if (searchEl) {
    searchEl.setAttribute("role", "combobox");
    searchEl.setAttribute("aria-expanded", "false");
    searchEl.setAttribute("aria-controls", "slash-menu-list");
    searchEl.setAttribute("aria-autocomplete", "list");
  }
  listEl.setAttribute("role", "listbox");
  listEl.setAttribute("aria-label", "Insert block");

  // Initial rows so the menu is never empty on first open.
  renderRows(slashItems());

  searchEl?.addEventListener("input", () => {
    filter(searchEl.value);
  });

  searchEl?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Enter") { event.preventDefault(); choose(); }
    else if (event.key === "Escape") { event.preventDefault(); close(true); }
  });

  // mousedown (not click) so selection beats input blur.
  listEl.addEventListener("mousedown", (event) => {
    const item = event.target.closest(".slash-menu-item");
    if (!item) return;
    event.preventDefault();
    const idx = currentItems.findIndex((i) => i.slug === item.getAttribute("data-widget-slug"));
    if (idx >= 0) {
      activeIndex = idx;
      choose();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (isOpen() && !menu.contains(event.target)) close(false);
  });
  window.addEventListener("resize", () => { if (isOpen()) positionNearCaret(); });
}

function renderRows(items) {
  currentItems = items;
  listEl.innerHTML = items.map((item, i) =>
    `<div class="slash-menu-item${i === activeIndex ? " is-active" : ""}" data-widget-slug="${item.slug}" role="option" id="slash-opt-${i}" aria-selected="${i === activeIndex}">` +
    `<span class="slash-menu-item-icon"><i class="fa-duotone fa-${item.icon}"></i></span>` +
    `<span class="slash-menu-item-text"><span class="slash-menu-item-label">${escapeHtml(item.label)}</span>` +
    `<span class="slash-menu-item-desc">${escapeHtml(item.description || "")}</span></span></div>`
  ).join("") || `<div class="slash-menu-empty">No blocks match. Try another search.</div>`;
  if (searchEl) searchEl.setAttribute("aria-activedescendant", items.length > 0 ? `slash-opt-${activeIndex}` : "");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function isOpen() {
  return !!menu && !menu.classList.contains("hidden");
}

export function filter(query) {
  const q = (query || "").toLowerCase().trim();
  const items = slashItems().filter((i) =>
    !q || i.label.toLowerCase().includes(q) || i.slug.includes(q) || (i.description || "").toLowerCase().includes(q)
  );
  activeIndex = 0;
  renderRows(items);
}

function move(delta) {
  if (currentItems.length === 0) return;
  activeIndex = (activeIndex + delta + currentItems.length) % currentItems.length;
  renderRows(currentItems);
  listEl.querySelector(".slash-menu-item.is-active")?.scrollIntoView?.({ block: "nearest" });
}

// Text blocks that participate in slash-menu TRANSFORM semantics: choosing one
// of these over an existing text anchor converts the block in place (carrying
// its content) instead of inserting a sibling.
const TRANSFORMABLE_TEXT = new Set([
  "paragraph", "heading", "blockquote", "codeblock", "bulletList", "orderedList",
]);

function choose() {
  const item = currentItems[activeIndex];
  if (!item) return;
  const type = typeForSlug(item.slug);
  // Zone-opened menu: insert at the exact zone position through the shared
  // insertion model (prepend when afterId is "", otherwise after the anchor).
  if (zoneAfterId !== undefined) {
    const after = zoneAfterId;
    zoneAfterId = undefined;
    close(false);
    let id = null;
    if (!after) {
      id = ctx.insertWidgetAt(type, { parentId: ctx.editor.document.rootId, index: 0 });
    } else {
      id = ctx.insertAfterBlock(after, type);
    }
    if (id) ctx.focusBlock?.(id, 0);
    return;
  }
  const blockId = anchorBlockId;
  const editable = anchorEditable;
  close(false);
  // Remove the "/" trigger from model and DOM FIRST so the transform sees the
  // block's real content (without the literal "/").
  if (blockId && editable && editable.isConnected) {
    ctx.clearSlashTrigger(blockId, editable);
  }
  // Slash over an existing text block converts it in place rather than
  // creating a new sibling (e.g. "/heading" on a paragraph becomes a heading).
  const anchor = blockId ? ctx.getBlock(blockId) : null;
  if (
    anchor &&
    anchor.type !== type &&
    TRANSFORMABLE_TEXT.has(anchor.type) &&
    TRANSFORMABLE_TEXT.has(type) &&
    ctx.transformBlock(blockId, type)
  ) {
    return;
  }
  ctx.insertAfterBlock(blockId, type);
}

// Caret-anchored fixed positioning with flip + viewport clamping.
function caretRect() {
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect && (rect.width > 0 || rect.height > 0)) return rect;
    }
  } catch { /* fall through to editable rect */ }
  if (anchorEditable && anchorEditable.isConnected) {
    return anchorEditable.getBoundingClientRect();
  }
  return null;
}

function positionNearCaret() {
  const rect = caretRect();
  const MENU_WIDTH = 300;
  const MENU_MAX_H = 320;
  const GAP = 6;
  menu.style.position = "fixed";
  menu.style.width = `${MENU_WIDTH}px`;
  menu.style.maxHeight = `${MENU_MAX_H}px`;
  menu.style.left = "0px";
  menu.style.top = "0px";
  let left = 24;
  let top = window.innerHeight - MENU_MAX_H - 16;
  if (rect) {
    left = Math.min(Math.max(8, rect.left), window.innerWidth - MENU_WIDTH - 8);
    const below = rect.bottom + GAP;
    const above = rect.top - GAP - Math.min(MENU_MAX_H, menu.scrollHeight || MENU_MAX_H);
    top = below + Math.min(MENU_MAX_H, 240) <= window.innerHeight ? below : Math.max(8, above);
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

// Called by the controller on text input: opens when "/" starts an empty line.
export function handleSlashTrigger(blockId, editable, char) {
  if (!menu) return false;
  if (char === "/" && editable.textContent === "/") {
    anchorBlockId = blockId;
    anchorEditable = editable;
    if (searchEl) searchEl.value = "";
    activeIndex = 0;
    renderRows(slashItems());
    menu.classList.remove("hidden");
    positionNearCaret();
    if (searchEl) {
      searchEl.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => searchEl.focus());
    }
    ctx.setOverlay("slash", true);
    return true;
  }
  if (isOpen() && anchorEditable === editable) {
    const text = editable.textContent || "";
    if (!text.startsWith("/")) { close(false); return false; }
    if (searchEl && document.activeElement !== searchEl) filter(text.slice(1));
    return true;
  }
  return false;
}

export function close(refocusCanvas) {
  if (!menu || !isOpen()) { zoneAfterId = undefined; return; }
  menu.classList.add("hidden");
  zoneAfterId = undefined;
  if (searchEl) searchEl.setAttribute("aria-expanded", "false");
  ctx.setOverlay("slash", false);
  const editable = anchorEditable;
  anchorBlockId = null;
  anchorEditable = null;
  if (refocusCanvas && editable && editable.isConnected) {
    editable.focus();
  }
}

export function closeIfOpen() {
  if (isOpen()) { close(false); return true; }
  return false;
}

// Programmatic open from an insert-zone + button: the menu becomes the
// insertion interface for that exact position (no "/" trigger involved).
// afterId "" = prepend at the document start; any id = insert after it.
export function openForInsertion(afterId, rect) {
  if (!menu) return false;
  close(false);
  anchorBlockId = null;
  anchorEditable = null;
  zoneAfterId = afterId || "";
  if (searchEl) searchEl.value = "";
  activeIndex = 0;
  renderRows(slashItems());
  menu.classList.remove("hidden");
  if (rect) positionAtRect(rect);
  else positionNearCaret();
  if (searchEl) {
    searchEl.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => searchEl.focus());
  }
  ctx.setOverlay("slash", true);
  return true;
}

function positionAtRect(rect) {
  const MENU_WIDTH = 300;
  const MENU_MAX_H = 320;
  const GAP = 6;
  menu.style.position = "fixed";
  menu.style.width = `${MENU_WIDTH}px`;
  menu.style.maxHeight = `${MENU_MAX_H}px`;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - MENU_WIDTH - 8);
  const below = rect.bottom + GAP;
  const above = rect.top - GAP - Math.min(MENU_MAX_H, menu.scrollHeight || MENU_MAX_H);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(below + Math.min(MENU_MAX_H, 240) <= window.innerHeight ? below : Math.max(8, above))}px`;
}

export default { initSlashMenu, isOpen, close: closeIfOpen, handleSlashTrigger, openForInsertion };
