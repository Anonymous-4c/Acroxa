// acrx/assets/js/editor/app/panels/postPanel.js
//
// Post panel on #sidebar-right-panel-post: publishing, content, taxonomy,
// featured media, author and advanced — bound to the real post model via the
// State "post" store and the persistence save payload. No invented fields.

import { State } from "../core/store.js";
import { hydrateDropdowns, dropdownMountHTML } from "./controls.js";
import { hydrateDatetimes, datetimeMountHTML } from "./datetime.js";
import { toggleHTML } from "./controls.js";

let ctx = null;
let panel = null;
let categories = []; // fetched from /acr/api/categories when available

export function initPostPanel(shared) {
  ctx = shared;
  panel = document.getElementById("sidebar-right-panel-post");
  if (!panel) return;
  panel.addEventListener("input", onEdit);
  panel.addEventListener("change", onEdit);
  panel.addEventListener("click", onClick);
  loadCategories();
}

async function loadCategories() {
  try {
    const res = await fetch("/acr/api/categories");
    const data = await res.json();
    if (data && Array.isArray(data.categories)) {
      categories = data.categories;
      if (panel && panel.getAttribute("data-ready") === "1") paintCategories();
    }
  } catch {
    categories = [];
  }
}

function post() {
  return State.get("post") || {};
}

function set(patch) {
  State.patch("post", patch);
  ctx.markDirty();
  ctx.updateFooter();
}

function onEdit(event) {
  const field = event.target.closest("[data-post-field]");
  if (!field) return;
  const key = field.getAttribute("data-post-field");
  if (key === "categories") {
    const selected = [...panel.querySelectorAll("[data-post-field='categories']:checked")].map((c) => c.value);
    set({ categories: selected });
    return;
  }
  if (key === "tags") {
    set({ tags: field.value.split(",").map((t) => t.trim()).filter(Boolean) });
    return;
  }
  if (field.type === "checkbox") {
    set({ [key]: field.checked });
    return;
  }
  set({ [key]: field.value });
  if (key === "title") {
    // Live slug suggestion only while the slug still follows the title.
    const slugEl = panel.querySelector("[data-post-field='slug']");
    if (slugEl && (slugEl.value === "" || slugEl.getAttribute("data-auto") === "1")) {
      slugEl.value = slugify(field.value);
      slugEl.setAttribute("data-auto", "1");
      State.patch("post", { slug: slugEl.value });
    }
    ctx.updateTitle(field.value);
  }
}

function onClick(event) {
  if (event.target.closest("[data-post-field='slug']") && event.target.value !== undefined) {
    event.target.setAttribute("data-auto", "0");
  }
  const mediaBtn = event.target.closest("[data-action='featured-image']");
  if (mediaBtn) {
    ctx.pickMediaForPost();
    return;
  }
  const removeImg = event.target.closest("[data-action='remove-featured']");
  if (removeImg) {
    set({ featuredImage: "", featuredImageAlt: "" });
    refresh();
  }
}

function slugify(text) {
  return String(text || "").toLowerCase().trim()
    .replace(/\s+/g, "-").replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-").replace(/^-+|-+$/g, "");
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function paintCategories() {
  const host = panel.querySelector("[data-categories-host]");
  if (!host) return;
  const selected = new Set(post().categories || []);
  if (categories.length === 0) {
    host.innerHTML = `<span class="insp-hint">No categories yet — manage them under Content → Categories.</span>`;
    return;
  }
  host.innerHTML = categories.map((cat) => {
    const id = cat._id || cat.id;
    const name = cat.name || cat.slug;
    return toggleHTML({ label: name, checked: selected.has(String(id)), attrs: `data-post-field="categories" value="${esc(id)}"` });
  }).join("");
}

export function refresh() {
  if (!panel || !ctx) return;
  const p = post();
  panel.setAttribute("data-ready", "1");
  panel.innerHTML =
    `<div class="insp-group"><div class="insp-group-title">Publishing</div>` +
    `<div class="insp-field"><label class="insp-label">Status</label>` +
    dropdownMountHTML({ key: "status", value: p.status || "draft", options: ["draft", "published", "scheduled", "archived"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), label: "Status" }) +
    `</div>` +
    `<div class="insp-field"><label class="insp-label">Publish date</label>` +
    datetimeMountHTML({ key: "publishDate", value: (p.publishDate || "").slice(0, 16), label: "Publish date" }) +
    `<span class="insp-help">Local time — stored exactly as shown, no timezone shift.</span></div>` +
    `<div class="insp-field"><label class="insp-label">Comments</label>` +
    toggleHTML({ label: "Allow comments", checked: p.allowComments !== false, attrs: `data-post-field="allowComments"` }) + `</div></div>` +

    `<div class="insp-group"><div class="insp-group-title">Content</div>` +
    `<div class="insp-field"><label class="insp-label">Title</label>` +
    `<input type="text" class="insp-input" data-post-field="title" value="${esc(p.title)}"></div>` +
    `<div class="insp-field"><label class="insp-label">Slug</label>` +
    `<input type="text" class="insp-input" data-post-field="slug" value="${esc(p.slug)}" data-auto="1"><span class="insp-help">/…/${esc(p.slug || "slug")}</span></div>` +
    `<div class="insp-field"><label class="insp-label">Excerpt</label>` +
    `<textarea class="insp-textarea" data-post-field="excerpt" rows="3" maxlength="300">${esc(p.excerpt)}</textarea>` +
    `<span class="insp-help">${(p.excerpt || "").length}/300</span></div></div>` +

    `<div class="insp-group"><div class="insp-group-title">Taxonomy</div>` +
    `<div class="insp-field"><label class="insp-label">Categories</label><div data-categories-host></div></div>` +
    `<div class="insp-field"><label class="insp-label">Tags</label>` +
    `<input type="text" class="insp-input" data-post-field="tags" value="${esc((p.tags || []).join(", "))}" placeholder="Comma separated"></div></div>` +

    `<div class="insp-group"><div class="insp-group-title">Featured media</div>` +
    (p.featuredImage
      ? `<div class="insp-media"><img src="${esc(p.featuredImage)}" alt=""><button type="button" class="axed-btn" data-action="featured-image">Replace</button>` +
        `<button type="button" class="axed-btn axed-icon axed-xs" data-action="remove-featured" aria-label="Remove featured image">×</button></div>` +
        `<div class="insp-field"><label class="insp-label">Alt text</label><input type="text" class="insp-input" data-post-field="featuredImageAlt" value="${esc(p.featuredImageAlt)}"></div>`
      : `<button type="button" class="axed-btn" data-action="featured-image"><i class="fa-duotone fa-image"></i> Set featured image</button>`) +
    `</div>` +

    `<div class="insp-group"><div class="insp-group-title">Advanced</div>` +
    `<div class="insp-field"><label class="insp-label">Author</label><span class="insp-static">${esc(p.author?.username || p.author?.fullName || p.author || "—")}</span></div>` +
    `<div class="insp-field"><label class="insp-label">Template</label>` +
    dropdownMountHTML({ key: "template", value: p.template || "default", options: ["default", "fullwidth", "landing"], label: "Template" }) +
    `</div></div>`;

  paintCategories();
  hydrateDropdowns(panel, (key, value) => set({ [key]: value }));
  hydrateDatetimes(panel, (key, value) => set({ [key]: value }));
}

export default { initPostPanel, refresh };
