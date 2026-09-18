// acrx/assets/js/editor/app/menus/palette.js
//
// Bento command center on the #editor-command-palette overlay shell hook.
// The header #editor-cmdk pill is an opener only (read-only input);
// all search + results live in the overlay panel.
//
// Sources: engine command registry only (icon/description/keywords/when
// metadata). No parallel command lists: widget inserts resolve to the
// insert.* engine commands annotated from INSERTER_CATALOG.
// Sections on empty query: Favorites -> Recent -> Suggested -> category
// bento grid. Typing (or a category "show all") switches to a ranked flat
// list. Arrow/Tab/Home/End navigation, Enter to run, Esc to close with
// focus restored to the invoker. Every run goes through editor.execute.

import { commandItems } from "../core/commands.js";
import { SLUG_TO_TYPE } from "../core/model.js";

let ctx = null;
let opener = null;
let overlay = null;
let panel = null;
let search = null;
let results = null;
let invoker = null;
let suppressOpener = false;
let query = "";
let categoryFilter = null;
let activeIndex = 0;
let flatItems = [];
let recents = [];
let favorites = [];

const RECENTS_KEY = "acrx-editor-recents";
const FAVORITES_KEY = "acrx-editor-favorites";
const RECENT_CAP = 12;
const FAVORITE_CAP = 12;

function loadList(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function saveList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* private mode: recents/favorites simply don't persist */
  }
}

// Pre-bento ids ("widget:<slug>") resolve to their insert.* engine command.
function normalizeId(id) {
  if (typeof id !== "string") return null;
  if (id.startsWith("widget:")) {
    const type = SLUG_TO_TYPE[id.slice(7)];
    return type ? `insert.${type}` : null;
  }
  return id;
}

try {
  recents = loadList(RECENTS_KEY).map(normalizeId).filter(Boolean).slice(0, RECENT_CAP);
  favorites = loadList(FAVORITES_KEY).slice(0, FAVORITE_CAP);
} catch {
  recents = [];
  favorites = [];
}

const CATEGORY_ORDER = ["AI", "Insert", "Block", "Transform", "Format", "Document", "History", "View"];

function categoryRank(category) {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

export function initPalette(shared) {
  ctx = shared;
  opener = document.getElementById("editor-cmdk");
  overlay = document.getElementById("editor-command-palette");
  if (!opener || !overlay) return;

  const openerInput = document.getElementById("editor-cmdk-input");
  if (openerInput) {
    // Single-surface palette: the header pill opens the overlay; typing
    // happens in the overlay search. Read-only keeps mobile keyboards away.
    openerInput.readOnly = true;
    openerInput.addEventListener("focus", () => {
      // Focus restored here by close() must not reopen (focus events are
      // synchronous, so a flag is deterministic — no timers involved).
      if (suppressOpener) return;
      open();
    });
    openerInput.addEventListener("pointerdown", () => {
      if (!isOpen()) open();
    });
  }

  buildPanel();

  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      jump(0);
    } else if (event.key === "End") {
      event.preventDefault();
      jump(flatItems.length - 1);
    } else if (event.key === "Tab") {
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
    } else if (event.key === "Enter" && event.target !== search) {
      event.preventDefault();
      choose();
    }
  });
  results.addEventListener("click", (event) => {
    const fav = event.target.closest("[data-fav]");
    if (fav) {
      event.stopPropagation();
      toggleFavorite(fav.getAttribute("data-fav"));
      return;
    }
    const showAll = event.target.closest("[data-show-all]");
    if (showAll) {
      categoryFilter = showAll.getAttribute("data-show-all");
      query = "";
      search.value = "";
      render();
      search.focus();
      return;
    }
    const item = event.target.closest("[data-cmd-index]");
    if (!item) return;
    activeIndex = Number(item.getAttribute("data-cmd-index"));
    choose();
  });
  results.addEventListener("mouseover", (event) => {
    const item = event.target.closest("[data-cmd-index]");
    if (!item) return;
    const next = Number(item.getAttribute("data-cmd-index"));
    if (next !== activeIndex) {
      activeIndex = next;
      paintActive();
    }
  });
  search.addEventListener("input", () => {
    query = search.value;
    categoryFilter = null;
    render();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      choose();
    }
  });
  panel.querySelector("[data-cmdk-clear]")?.addEventListener("click", () => {
    search.value = "";
    query = "";
    categoryFilter = null;
    render();
    search.focus();
  });
}

function buildPanel() {
  overlay.innerHTML =
    `<div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="Command palette">` +
    `<div class="cmdk-search-row"><i class="fa-duotone fa-magnifying-glass" aria-hidden="true"></i>` +
    `<input id="editor-cmdk-search" type="text" placeholder="Type a command or search…" aria-label="Search commands" role="combobox" aria-expanded="true" aria-controls="cmdk-results" autocomplete="off">` +
    `<button type="button" class="cmdk-clear" data-cmdk-clear aria-label="Clear search">×</button>` +
    `<kbd>esc</kbd></div>` +
    `<div class="cmdk-results" id="cmdk-results" role="listbox" aria-label="Commands"></div>` +
    `<div class="cmdk-footer"><span><kbd>↑↓</kbd> navigate</span><span><kbd>tab</kbd> move</span><span><kbd>↵</kbd> execute</span><span><kbd>esc</kbd> close</span></div></div>`;
  panel = overlay.querySelector(".cmdk-panel");
  search = overlay.querySelector("#editor-cmdk-search");
  results = overlay.querySelector(".cmdk-results");
}

function allCommands() {
  return commandItems();
}

function available() {
  const engine = ctx.editor.engines.commands;
  return allCommands().filter((c) => {
    const meta = engine.metadata(c.id);
    // Palette entries need display metadata (icon). Bare engine primitives
    // (editor-runtime core: insertBlock, save, undo…) stay executable via
    // shortcuts/macros but never render as cards.
    if (!meta || !meta.icon) return false;
    const when = meta.when;
    if (typeof when === "function") {
      try {
        if (!when(ctx)) return false;
      } catch {
        return false;
      }
    }
    return true;
  });
}

function byId(id) {
  return available().find((c) => c.id === id) || null;
}

// Contextual suggestions: small id tables per selection state, resolved
// against the registry (unknown ids drop out — never fake entries).
function suggestedIds() {
  const ids = [];
  const selId = ctx.currentBlockId();
  const block = selId ? ctx.getBlock(selId) : null;
  let empty = false;
  try {
    empty = (ctx.topLevelOrder() || []).length === 0;
  } catch {
    empty = false;
  }
  let multi = false;
  try {
    multi = ctx.isMulti();
  } catch {
    multi = false;
  }
  if (empty) {
    ids.push("ui.showWidgets", "ui.showPatterns", "ai.generate", "document.save");
  } else if (multi) {
    ids.push("block.group", "pattern.save", "block.alignCenter", "block.duplicate", "block.delete");
  } else if (block && block.type === "image") {
    ids.push("ai.altText", "block.duplicate", "mark.link", "block.delete");
  } else if (block && block.type === "heading") {
    ids.push("ai.improve", "block.transform.paragraph", "ui.showSeo", "block.duplicate");
  } else if (block) {
    ids.push("block.duplicate", "ai.improve", "block.transform.heading", "pattern.save");
  } else {
    ids.push("ui.showWidgets", "ai.generate", "document.save", "document.preview");
  }
  const engine = ctx.editor.engines.commands;
  return ids.filter((id) => engine.has(id)).slice(0, 6);
}

// Scoring across label + id + keywords + description + category.
function score(item, rawQuery) {
  const q = rawQuery.toLowerCase().trim();
  if (!q) return 1;
  const label = item.label.toLowerCase();
  const id = String(item.id).toLowerCase();
  const keywords = (item.keywords || []).join(" ").toLowerCase();
  const desc = (item.description || "").toLowerCase();
  const cat = (item.category || "").toLowerCase();
  if (label === q || id === q) return 100;
  const words = label.split(/\s+/);
  if (words.some((w) => w === q)) return 90;
  if (label.startsWith(q)) return 70;
  if (id.startsWith(q) || id.endsWith(`.${q}`)) return 60;
  if (words.some((w) => w.startsWith(q))) return 55;
  if (keywords.split(/\s+/).some((w) => w && (w === q || w.startsWith(q)))) return 50;
  if (label.includes(q)) return 30;
  if (keywords.includes(q) || desc.includes(q)) return 25;
  if (id.includes(q) || cat.includes(q)) return 20;
  let qi = 0;
  for (const ch of label) {
    if (ch === q[qi]) qi++;
    if (qi === q.length) return 10;
  }
  return 0;
}

export function isOpen() {
  return !!overlay && !overlay.classList.contains("hidden");
}

export function open() {
  if (!overlay || isOpen()) return;
  invoker = document.activeElement;
  overlay.classList.remove("hidden");
  ctx.setOverlay("palette", true);
  query = "";
  categoryFilter = null;
  search.value = "";
  render();
  search.focus();
}

export function close(restoreFocus = true) {
  if (!overlay || !isOpen()) return false;
  overlay.classList.add("hidden");
  ctx.setOverlay("palette", false);
  if (document.activeElement === search) search.blur();
  if (restoreFocus && invoker && invoker.isConnected && typeof invoker.focus === "function") {
    try {
      suppressOpener = true;
      invoker.focus({ preventScroll: true });
    } catch {
      try {
        invoker.focus();
      } catch {
        /* invoker gone: leave focus where it is */
      }
    } finally {
      suppressOpener = false;
    }
  }
  invoker = null;
  return true;
}

export function toggle() {
  if (isOpen()) close();
  else open();
}

function sectioned() {
  const pool = available();
  const sections = [];
  if (query.trim() || categoryFilter) {
    let items = pool;
    if (categoryFilter) items = items.filter((c) => c.category === categoryFilter);
    const q = query.trim();
    items = items
      .map((item) => ({ item, s: score(item, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.item);
    sections.push({ title: categoryFilter || "Results", kind: "rows", items });
    return sections;
  }
  const pick = (ids) => ids.map(byId).filter(Boolean);
  const favs = pick(favorites);
  if (favs.length > 0) sections.push({ title: "Favorites", kind: "chips", icon: "star", items: favs });
  const recent = pick(recents.filter((id) => !favorites.includes(id))).slice(0, 6);
  if (recent.length > 0) sections.push({ title: "Recent", kind: "chips", icon: "clock-rotate-left", items: recent });
  const suggested = pick(suggestedIds().filter((id) => !favorites.includes(id) && !recents.includes(id)));
  if (suggested.length > 0) sections.push({ title: "Suggested", kind: "cards", icon: "wand-magic-sparkles", items: suggested });
  const cats = [...new Set(pool.map((c) => c.category))].sort((a, b) => categoryRank(a) - categoryRank(b) || (a < b ? -1 : 1));
  for (const cat of cats) {
    sections.push({ title: cat, kind: "grid", items: pool.filter((c) => c.category === cat) });
  }
  return sections;
}

function render() {
  const sections = sectioned();
  flatItems = [];
  const visible = sections
    .map((s) => ({ ...s, total: s.items.length, items: s.kind === "grid" ? s.items.slice(0, 6) : s.items }))
    .filter((s) => s.items.length > 0);
  if (visible.length === 0) {
    results.innerHTML = `<div class="cmdk-empty"><i class="fa-duotone fa-magnifying-glass" aria-hidden="true"></i>` +
      `<p>No results for “${escapeHtml(query || categoryFilter || "")}”.</p>` +
      `<button type="button" class="axed-btn" data-cmdk-clear2>Clear search</button></div>`;
    results.querySelector("[data-cmdk-clear2]")?.addEventListener("click", () => {
      search.value = "";
      query = "";
      categoryFilter = null;
      render();
      search.focus();
    });
    return;
  }
  results.innerHTML = visible.map((section) => {
    const start = flatItems.length;
    flatItems.push(...section.items);
    const cards = section.items.map((item, i) => {
      const global = start + i;
      return section.kind === "chips" ? chipHTML(item, global) : cardWrapHTML(item, global, section.kind === "rows");
    }).join("");
    const hidden = section.total - section.items.length;
    const showAll = section.kind === "grid" && hidden > 0
      ? `<button type="button" class="cmdk-show-all" data-show-all="${escapeHtml(section.title)}">Show all ${section.total} →</button>`
      : "";
    return `<div class="cmdk-section" role="group" aria-label="${escapeHtml(section.title)}">` +
      `<div class="cmdk-group">${section.icon ? `<i class="fa-duotone fa-${section.icon}" aria-hidden="true"></i>` : ""}${escapeHtml(section.title)}</div>` +
      `<div class="cmdk-${section.kind}">${cards}</div>${showAll}</div>`;
  }).join("");
  activeIndex = Math.min(activeIndex, Math.max(0, flatItems.length - 1));
  paintActive();
}

function chipHTML(item, index) {
  return `<button type="button" id="cmdk-item-${index}" class="cmdk-chip${index === activeIndex ? " is-active" : ""}" data-cmd-index="${index}" data-cmd-id="${escapeHtml(item.id)}" role="option" aria-selected="${index === activeIndex}">` +
    iconHTML(item) +
    `<span class="cmdk-item-label">${escapeHtml(item.label)}</span></button>`;
}

// Card + favorite toggle are siblings (a <button> may not nest inside one).
function cardWrapHTML(item, index, row) {
  const on = favorites.includes(item.id);
  return `<div class="cmdk-card-wrap">` +
    `<button type="button" id="cmdk-item-${index}" class="cmdk-card${row ? " is-row" : ""}${index === activeIndex ? " is-active" : ""}${item.danger ? " is-danger" : ""}" data-cmd-index="${index}" data-cmd-id="${escapeHtml(item.id)}" role="option" aria-selected="${index === activeIndex}">` +
    iconHTML(item) +
    `<span class="cmdk-card-text"><span class="cmdk-item-label">${escapeHtml(item.label)}</span>` +
    (row
      ? `<span class="cmdk-item-desc">${escapeHtml(item.category)}${item.description ? ` · ${escapeHtml(item.description)}` : ""}</span>`
      : (item.description ? `<span class="cmdk-item-desc">${escapeHtml(item.description)}</span>` : "")) +
    `</span>` +
    (item.shortcut ? `<kbd class="cmdk-item-hint">${escapeHtml(item.shortcut)}</kbd>` : "") +
    `</button>` +
    `<button type="button" class="cmdk-fav${on ? " is-fav" : ""}" data-fav="${escapeHtml(item.id)}" aria-label="${on ? "Remove from" : "Add to"} favorites" aria-pressed="${on}" title="Favorite"><i class="fa-${on ? "solid" : "regular"} fa-star" aria-hidden="true"></i></button></div>`;
}

function iconHTML(item) {
  return `<span class="cmdk-card-icon"><i class="fa-duotone fa-${escapeHtml(item.icon || "cube")}" aria-hidden="true"></i></span>`;
}

function paintActive() {
  results.querySelectorAll("[data-cmd-index]").forEach((el) => {
    const on = Number(el.getAttribute("data-cmd-index")) === activeIndex;
    el.classList.toggle("is-active", on);
    el.setAttribute("aria-selected", String(on));
  });
  const active = results.querySelector("[data-cmd-index].is-active");
  active?.scrollIntoView?.({ block: "nearest" });
  search.setAttribute("aria-activedescendant", active?.getAttribute("id") || "");
}

function move(delta) {
  if (flatItems.length === 0) return;
  activeIndex = (activeIndex + delta + flatItems.length) % flatItems.length;
  paintActive();
  results.querySelector("[data-cmd-index].is-active")?.focus({ preventScroll: true });
}

function jump(index) {
  if (flatItems.length === 0) return;
  activeIndex = Math.max(0, Math.min(flatItems.length - 1, index));
  paintActive();
  results.querySelector("[data-cmd-index].is-active")?.focus({ preventScroll: true });
}

function choose() {
  const item = flatItems[activeIndex];
  if (!item) return;
  pushRecent(item.id);
  close();
  try {
    const out = item.run();
    if (item.id === "block.delete") ctx.toast("Deleted — press Ctrl+Z to undo", "info");
    if (out && typeof out.then === "function") out.catch((err) => ctx.toast(err.message || "Command failed", "error"));
  } catch (err) {
    ctx.toast(err.message || "Command failed", "error");
  }
}

function pushRecent(id) {
  recents = [id, ...recents.filter((r) => r !== id)].slice(0, RECENT_CAP);
  saveList(RECENTS_KEY, recents);
}

function toggleFavorite(id) {
  favorites = favorites.includes(id)
    ? favorites.filter((f) => f !== id)
    : [id, ...favorites].slice(0, FAVORITE_CAP);
  saveList(FAVORITES_KEY, favorites);
  render();
  search.focus();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default { initPalette, isOpen, open, close, toggle };
