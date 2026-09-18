// acrx/assets/js/editor/app/panels/widgets.js
//
// Widgets panel on #sidebar-left-panel-widgets: search + categorized,
// capability-annotated catalog from BLOCK_CATALOG, click-to-insert,
// drag-to-canvas, recently-used ordering. Database widgets from the editor
// data endpoint appear in their own section when the API returns any.

import { INSERTER_CATALOG, CATEGORIES, CATALOG_BY_TYPE } from "../core/model.js";

let ctx = null;
let panel = null;
let query = "";
let dbWidgets = [];
let recents = [];
let favorites = [];

try {
  recents = JSON.parse(localStorage.getItem("acrx-editor-recent-widgets") || "[]");
} catch { recents = []; }

try {
  favorites = JSON.parse(localStorage.getItem("acrx-editor-fav-widgets") || "[]");
} catch { favorites = []; }

function persistFavorites() {
  try { localStorage.setItem("acrx-editor-fav-widgets", JSON.stringify(favorites)); } catch { /* private mode */ }
}

export function initWidgets(shared) {
  ctx = shared;
  panel = document.getElementById("sidebar-left-panel-widgets");
  if (!panel) return;
  panel.addEventListener("input", (event) => {
    if (event.target.classList.contains("widgets-search")) {
      query = event.target.value.toLowerCase();
      refresh();
    }
  });
  panel.addEventListener("click", (event) => {
    const fav = event.target.closest("[data-fav-widget]");
    if (fav) {
      event.stopPropagation();
      const type = fav.getAttribute("data-fav-widget");
      favorites = favorites.includes(type) ? favorites.filter((f) => f !== type) : [...favorites, type];
      persistFavorites();
      refresh();
      return;
    }
    const item = event.target.closest("[data-widget-type]");
    if (item) {
      ctx.insertAtSelection(item.getAttribute("data-widget-type"));
      pushRecent(item.getAttribute("data-widget-type"));
      return;
    }
    const db = event.target.closest("[data-db-widget]");
    if (db) {
      ctx.insertDbWidget(db.getAttribute("data-db-widget"));
    }
  });
  panel.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-widget-type]");
    if (!item) return;
    event.dataTransfer.setData("text/acrx-widget", item.getAttribute("data-widget-type"));
    event.dataTransfer.effectAllowed = "copy";
  });
  panel.addEventListener("keydown", (event) => {
    // Favorite toggles are native buttons — leave their activation alone.
    if (event.target.closest && event.target.closest("[data-fav-widget]")) return;
    const item = event.target.closest ? event.target.closest("[data-widget-type],[data-db-widget]") : null;
    if (!item) return;
    const tiles = [...panel.querySelectorAll("[data-widget-type],[data-db-widget]")];
    const idx = tiles.indexOf(item);
    const cols = 3;
    if (event.key === "ArrowRight") { event.preventDefault(); tiles[idx + 1]?.focus(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); tiles[idx - 1]?.focus(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); (tiles[idx + cols] || tiles[idx])?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); (tiles[idx - cols] || tiles[idx])?.focus(); }
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      item.click();
    }
  });
}

export function setDbWidgets(list) {
  dbWidgets = Array.isArray(list) ? list : [];
  if (panel) refresh();
}

function pushRecent(type) {
  recents = [type, ...recents.filter((r) => r !== type)].slice(0, 6);
  try { localStorage.setItem("acrx-editor-recent-widgets", JSON.stringify(recents)); } catch { /* private mode */ }
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function widgetTag(def) {
  // One meaningful tag max, pinned to the tile corner (never beside the name).
  if (recents.includes(def.type)) return `<span class="widget-tag">Recent</span>`;
  if (def.category === "Marketing") return `<span class="widget-tag widget-tag-accent">Popular</span>`;
  return "";
}

function card(def) {
  const fav = favorites.includes(def.type);
  return `<div class="widget-tile" data-widget-type="${def.type}" draggable="true" role="button" tabindex="0" ` +
    `aria-label="Insert ${esc(def.label)}. ${esc(def.description)}" data-title="Click or drag to insert">` +
    `<button type="button" class="widget-fav${fav ? " is-fav" : ""}" data-fav-widget="${def.type}" ` +
    `aria-label="${fav ? "Remove from" : "Add to"} favorites" aria-pressed="${fav ? "true" : "false"}" title="Favorite">` +
    `<i class="fa-${fav ? "solid" : "regular"} fa-star"></i></button>` +
    `<span class="widget-tile-icon"><i class="fa-duotone fa-${def.icon}"></i></span>` +
    `<span class="widget-tile-name">${esc(def.label)}</span>` +
    `<span class="widget-tile-cat">${esc(def.category)}</span>` +
    widgetTag(def) + `</div>`;
}

export function refresh() {
  if (!panel || !ctx) return;
  const matches = (def) =>
    !query || def.label.toLowerCase().includes(query) || def.type.includes(query) ||
    (def.description || "").toLowerCase().includes(query);
  const ordered = [...INSERTER_CATALOG].sort((a, b) => {
    const ar = recents.indexOf(a.type);
    const br = recents.indexOf(b.type);
    if (ar >= 0 && br < 0) return -1;
    if (br >= 0 && ar < 0) return 1;
    return 0;
  });
  let html = `<div class="widgets-search-wrap"><input type="text" class="widgets-search" placeholder="Search blocks..." value="${esc(query)}" aria-label="Search blocks"></div>`;
  const favDefs = ordered.filter((d) => favorites.includes(d.type) && matches(d));
  if (favDefs.length > 0 && !query) {
    html += `<div class="widgets-category"><div class="widgets-category-title">Favorites</div>` +
      `<div class="widgets-grid tiles">${favDefs.map(card).join("")}</div></div>`;
  }
  for (const category of CATEGORIES) {
    const items = ordered.filter((d) => d.category === category && matches(d));
    if (items.length === 0) continue;
    html += `<div class="widgets-category"><div class="widgets-category-title">${esc(category)}</div>` +
      `<div class="widgets-grid tiles">${items.map(card).join("")}</div></div>`;
  }
  if (ordered.filter(matches).length === 0) {
    html += `<div class="insp-empty"><p class="insp-empty-title">No blocks match</p><p class="insp-empty-text">Try a different search.</p></div>`;
  }
  if (dbWidgets.length > 0) {
    html += `<div class="widgets-category"><div class="widgets-category-title">Library</div><div class="widgets-grid tiles">` +
      dbWidgets.map((w) => {
        const id = w._id || w.id || w.slug;
        return `<div class="widget-tile widget-db" data-db-widget="${esc(id)}" role="button" tabindex="0" aria-label="Insert ${esc(w.name || w.slug)}">` +
          `<span class="widget-tile-icon"><i class="fa-duotone fa-${esc(w.icon || "cube")}"></i></span>` +
          `<span class="widget-tile-name">${esc(w.name || w.slug)}</span></div>`;
      }).join("") + `</div></div>`;
  } else {
    html += `<div class="widgets-library-empty">Custom library widgets appear here once saved in the CMS.</div>`;
  }
  panel.innerHTML = html;
  const search = panel.querySelector(".widgets-search");
  if (search && query) {
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }
}

export function dbWidgetById(id) {
  return dbWidgets.find((w) => (w._id || w.id || w.slug) === id) || null;
}

export default { initWidgets, refresh, setDbWidgets, dbWidgetById };
