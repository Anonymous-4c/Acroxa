// acrx/assets/js/editor/app/panels/patterns.js
//
// Patterns panel on #sidebar-left-panel-patterns: search, categories, live
// preview, insertion with fresh IDs, and save-selection-as-pattern state.
// Patterns come from the editor data endpoint (real database data); the panel
// shows an honest empty state when none exist. Foreign node shapes convert
// defensively — unconvertible nodes become "unresolved" blocks that preserve
// their payload (never invented content, never silent drops).

import { CATALOG_BY_TYPE, SLUG_TO_TYPE } from "../core/model.js";

let ctx = null;
let panel = null;
let query = "";
let patterns = [];
let favPatterns = [];
let recentPatterns = [];

try {
  favPatterns = JSON.parse(localStorage.getItem("acrx-editor-fav-patterns") || "[]");
} catch { favPatterns = []; }

try {
  recentPatterns = JSON.parse(localStorage.getItem("acrx-editor-recent-patterns") || "[]");
} catch { recentPatterns = []; }

function persistPatternState() {
  try {
    localStorage.setItem("acrx-editor-fav-patterns", JSON.stringify(favPatterns));
    localStorage.setItem("acrx-editor-recent-patterns", JSON.stringify(recentPatterns));
  } catch { /* private mode */ }
}

function patternId(p) {
  return String(p._id || p.id || p.slug || "");
}

export function initPatterns(shared) {
  ctx = shared;
  panel = document.getElementById("sidebar-left-panel-patterns");
  if (!panel) return;
  panel.addEventListener("input", (event) => {
    if (event.target.classList.contains("patterns-search")) {
      query = event.target.value.toLowerCase();
      refresh();
    }
  });
  panel.addEventListener("click", (event) => {
    const fav = event.target.closest("[data-fav-pattern]");
    if (fav) {
      event.stopPropagation();
      const id = fav.getAttribute("data-fav-pattern");
      favPatterns = favPatterns.includes(id) ? favPatterns.filter((f) => f !== id) : [...favPatterns, id];
      persistPatternState();
      refresh();
      return;
    }
    const preview = event.target.closest("[data-pattern-preview-toggle]");
    if (preview) {
      const card = preview.closest(".pattern-card");
      card?.classList.toggle("show-preview");
      const expanded = card?.classList.contains("show-preview");
      preview.setAttribute("aria-expanded", expanded ? "true" : "false");
      return;
    }
    const item = event.target.closest("[data-pattern-id]");
    if (item) {
      insertPatternById(item.getAttribute("data-pattern-id"));
      return;
    }
    if (event.target.closest("[data-action='save-pattern']")) {
      ctx.saveSelectionAsPattern();
    }
  });
  panel.addEventListener("keydown", (event) => {
    if (event.target.closest && event.target.closest("[data-fav-pattern],[data-pattern-preview-toggle]")) return;
    const item = event.target.closest ? event.target.closest("[data-pattern-id]") : null;
    if (!item) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      insertPatternById(item.getAttribute("data-pattern-id"));
    }
  });
}

function insertPatternById(id) {
  ctx.insertPattern(id);
  recentPatterns = [id, ...recentPatterns.filter((r) => r !== id)].slice(0, 10);
  persistPatternState();
}

export function setPatterns(list) {
  patterns = Array.isArray(list) ? list : [];
  if (panel) refresh();
}

export function patternById(id) {
  return patterns.find((p) => (p._id || p.id || p.slug) === id) || null;
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function patternNodes(pattern) {
  const content = pattern.content || {};
  if (Array.isArray(content.nodes)) return content.nodes;
  if (Array.isArray(content)) return content;
  if (content.json && Array.isArray(content.json.nodes)) return content.json.nodes;
  return [];
}

// Convert one foreign node into { type, data, children }. Returns null only
// when there is nothing at all to preserve (null input); otherwise always
// produces a block, falling back to "unresolved" with the payload intact.
export function convertNode(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rawType = String(raw.type || raw.widget || raw.slug || "container");
  const type = SLUG_TO_TYPE[rawType] || (CATALOG_BY_TYPE[rawType] ? rawType : null);
  const kids = Array.isArray(raw.children) ? raw.children.map(convertNode).filter(Boolean) : [];
  const bag = { ...(raw.attrs || {}), ...(raw.props || {}), ...(raw.settings || {}), ...(raw.attributes || {}) };
  if (typeof raw.content === "string" && !bag.text) bag.text = raw.content;
  if (Array.isArray(raw.content) && !bag.content) bag.content = raw.content;
  if (raw.text && !bag.text) bag.text = raw.text;
  if (raw.title && !bag.title) bag.title = raw.title;
  if (raw.src && !bag.src) bag.src = raw.src;
  if (raw.href && !bag.href) bag.href = raw.href;
  if (raw.url && !bag.href) bag.href = raw.url;
  if (raw.level && !bag.level) bag.level = raw.level;
  if (raw.items && !bag.items) bag.items = raw.items;
  if (raw.key && !bag.key) bag.key = raw.key;
  if (!type) {
    return { type: "unresolved", data: { originalType: rawType, payload: raw }, children: kids };
  }
  return { type, data: bag, children: kids };
}

export function convertPattern(pattern) {
  const nodes = patternNodes(pattern);
  const converted = nodes.map(convertNode).filter(Boolean);
  const skipped = nodes.length - converted.length;
  return { nodes: converted, total: nodes.length, skipped };
}

export function refresh() {
  if (!panel || !ctx) return;
  const matches = (p) =>
    !query || (p.name || "").toLowerCase().includes(query) ||
    (p.description || "").toLowerCase().includes(query) ||
    (p.category || "").toLowerCase().includes(query);
  const list = patterns.filter(matches);
  const groups = new Map();
  for (const p of list) {
    const cat = p.category || "General";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(p);
  }
  let html = `<div class="patterns-search-wrap"><input type="text" class="patterns-search" placeholder="Search patterns..." value="${esc(query)}" aria-label="Search patterns"></div>`;
  html += `<button type="button" class="axed-btn patterns-save" data-action="save-pattern" data-title="Save current selection as a pattern"><i class="fa-duotone fa-bookmark"></i> Save selection as pattern</button>`;
  if (list.length === 0) {
    html += patterns.length === 0
      ? `<div class="insp-empty"><i class="fa-duotone fa-diamonds-4"></i><p class="insp-empty-title">No patterns yet</p><p class="insp-empty-text">Reusable layouts you save will appear here. Select blocks in the canvas, then “Save selection as pattern”.</p></div>`
      : `<div class="insp-empty"><p class="insp-empty-title">No patterns match</p></div>`;
  }
  for (const [cat, items] of groups) {
    html += `<div class="widgets-category"><div class="widgets-category-title">${esc(cat)}</div><div class="patterns-grid">`;
    for (const p of items) {
      const id = patternId(p);
      const count = patternNodes(p).length;
      const fav = favPatterns.includes(id);
      const tags = [];
      if (p.featured) tags.push("Featured");
      else if (p.badge) tags.push(String(p.badge));
      else if (Array.isArray(p.tags) && p.tags[0]) tags.push(String(p.tags[0]));
      else if (recentPatterns.includes(id)) tags.push("Recent");
      else if (p.mode) tags.push(String(p.mode));
      html += `<div class="pattern-card" data-pattern-id="${esc(id)}" role="button" tabindex="0" aria-label="Insert pattern ${esc(p.name || p.slug)}">` +
        (p.previewImage ? `<img class="pattern-preview-img" src="${esc(p.previewImage)}" alt="" loading="lazy">` : "") +
        `<div class="pattern-card-head"><span class="pattern-card-name">${esc(p.name || p.slug)}</span>` +
        `<button type="button" class="widget-fav${fav ? " is-fav" : ""}" data-fav-pattern="${esc(id)}" ` +
        `aria-label="${fav ? "Remove from" : "Add to"} favorites" aria-pressed="${fav ? "true" : "false"}" title="Favorite">` +
        `<i class="fa-${fav ? "solid" : "regular"} fa-star"></i></button></div>` +
        (p.description ? `<div class="pattern-card-desc">${esc(p.description)}</div>` : "") +
        `<div class="pattern-card-meta"><span class="pattern-count">${count} block${count === 1 ? "" : "s"}</span>` +
        (tags[0] ? `<span class="widget-tag">${esc(tags[0])}</span>` : "") + `</div>` +
        `<div class="pattern-card-actions">` +
        `<button type="button" class="axed-btn" data-pattern-preview-toggle aria-expanded="false"><i class="fa-duotone fa-eye"></i> Preview</button>` +
        `</div></div>`;
    }
    html += `</div></div>`;
  }
  panel.innerHTML = html;
}

export default { initPatterns, refresh, setPatterns, patternById, convertPattern, convertNode };
