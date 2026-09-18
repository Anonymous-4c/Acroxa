// acrx/assets/js/editor/app/services/onboarding.js
//
// Multi-step first-visit flow for /acrx/editor with no document context
// (no ?id and no /editor/<id>):
//
//   Step 1 â€” Type:    Page / Post (+ recent drafts shortcut)
//   Step 2 â€” Details: title, slug (auto, editable), excerpt (optional)
//   Step 3 â€” AI draft (skippable): brief -> generate -> preview/use/discard
//   Step 4 â€” Review:  summary -> single explicit Create & open
//
// Creation uses the real CMS endpoints and navigates into the editor with
// the new id, so load/autosave/revisions/SEO work unchanged from edit one.
// Nothing is saved without the explicit Create click.
//
// State: versioned localStorage flag only
// (acroxa:editor:onboarding:v1 {completed, version}). First visit shows the
// full welcome; later no-context visits show the same wizard compact.
// Visits WITH a document context never trigger onboarding.

import { State } from "../core/store.js";

let ctx = null;

const STORE_KEY = "acroxa:editor:onboarding:v1";
const STORE_VERSION = 1;

export function initOnboarding(shared) {
  ctx = shared;
}

export function onboardingCompleted() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!(parsed && parsed.completed === true && parsed.version === STORE_VERSION);
  } catch {
    return false;
  }
}

function markCompleted() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ completed: true, version: STORE_VERSION }));
  } catch {
    // Storage unavailable (private mode etc.): onboarding simply shows again.
  }
}

// Called from boot after a fresh (id-less) load. Returns true when shown.
export async function maybeShowOnboarding(loaded) {
  if (!loaded || loaded.fresh !== true) return false;
  if (State.value("editor.documentId")) return false;
  openOnboarding(onboardingCompleted());
  return true;
}

export function closeOnboarding() {
  document.querySelector(".acrx-onboarding-overlay")?.remove();
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const STEPS = ["Type", "Details", "AI draft", "Review"];

function openOnboarding(compact) {
  closeOnboarding();
  const overlay = document.createElement("div");
  overlay.className = "acrx-modal-overlay acrx-onboarding-overlay";
  overlay.innerHTML =
    `<div class="acrx-modal acrx-onboarding-modal" role="dialog" aria-label="Create a document">` +
    `<div class="acrx-modal-head"><span data-ob-head>${compact ? "New document" : "Let's create something."}</span>` +
    `<button type="button" class="btn-act" data-ob-dismiss aria-label="Close">Ã—</button></div>` +
    `<div class="acrx-modal-body" data-ob-body></div></div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector("[data-ob-body]");

  const state = {
    step: 0,
    type: "page",
    template: "blank",
    title: "",
    slug: "",
    slugTouched: false,
    excerpt: "",
    aiBrief: "",
    aiChunks: [],
    aiBusy: false,
    busy: false,
    error: "",
  };

  const dismiss = () => {
    if (state.busy || state.aiBusy) return;
    markCompleted();
    closeOnboarding();
  };

  overlay.querySelector("[data-ob-dismiss]").addEventListener("click", dismiss);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) dismiss();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dismiss();
  });

  function stepsBar() {
    return `<ol class="acrx-ob-steps" aria-label="Progress">` + STEPS.map((label, i) =>
      `<li class="acrx-ob-step${i === state.step ? " is-current" : ""}${i < state.step ? " is-done" : ""}" aria-current="${i === state.step ? "step" : "false"}">` +
      `<span class="acrx-ob-dot">${i < state.step ? "âœ“" : String(i + 1)}</span><span>${label}</span></li>`
    ).join("") + `</ol>`;
  }

  function navRow({ back = true, nextLabel = "Continue", nextAction = "next", nextPrimary = true } = {}) {
    return `<div class="acrx-modal-actions acrx-ob-nav">` +
      (back ? `<button type="button" class="axed-btn" data-ob-back>Back</button>` : `<span></span>`) +
      `<button type="button" class="axed-btn${nextPrimary ? " axed-primary" : ""}" data-ob-${nextAction}>${nextLabel}</button></div>` +
      (state.error ? `<p class="acrx-ob-error" role="alert">${esc(state.error)}</p>` : "");
  }

  function wireNav() {
    body.querySelector("[data-ob-back]")?.addEventListener("click", () => {
      state.error = "";
      state.step = Math.max(0, state.step - 1);
      render();
    });
    body.querySelector("[data-ob-next]")?.addEventListener("click", () => {
      state.error = "";
      if (state.step === 1 && !state.title.trim()) {
        state.title = state.type === "page" ? "Untitled Page" : "Untitled Post";
      }
      state.step = Math.min(STEPS.length - 1, state.step + 1);
      render();
    });
    body.querySelector("[data-ob-skip]")?.addEventListener("click", () => {
      state.error = "";
      state.step = STEPS.length - 1;
      render();
    });
    body.querySelector("[data-ob-create]")?.addEventListener("click", create);
  }

  function defaultTitle() {
    return state.title.trim() || (state.type === "page" ? "Untitled Page" : "Untitled Post");
  }

  function effectiveSlug() {
    const base = state.slug.trim() || slugify(defaultTitle()) || "untitled";
    return state.slugTouched ? base : `${base}-${Date.now().toString(36).slice(-4)}`;
  }

  function renderType() {
    const card = (kind, icon, name, desc) =>
      `<button type="button" class="acrx-ob-type${state.type === kind ? " is-active" : ""}" data-ob-pick="${kind}" aria-pressed="${state.type === kind}">` +
      `<span class="acrx-ob-type-icon"><i class="fa-duotone fa-${icon}"></i></span>` +
      `<span class="slash-menu-item-text"><span class="slash-menu-item-label">${name}</span>` +
      `<span class="slash-menu-item-desc">${desc}</span></span></button>`;
    body.innerHTML = stepsBar() +
      `<p class="acrx-onboarding-sub">${compact ? "What are we making?" : "What are we making today?"}</p>` +
      `<div class="acrx-ob-types">` +
      card("page", "file-lines", "Page", "Standalone content — home, about, landing.") +
      card("post", "pen", "Post", "Dated entry for the blog or news feed.") +
      `</div>` +
      `<p class="acrx-onboarding-sub" style="margin-top:12px">Start from a template</p>` +
      `<div class="acrx-ob-types">` +
      ["blank|square|Blank|Empty canvas", "article|newspaper|Article|Heading + text + quote", "table-report|table|Table report|Heading + table + notes"].map((s) => { const [id, icon, name, desc] = s.split("|"); return `<button type="button" class="acrx-ob-type${state.template === id ? " is-active" : ""}" data-ob-tpl="${id}" aria-pressed="${state.template === id}">` + `<span class="acrx-ob-type-icon"><i class="fa-duotone fa-${icon}"></i></span>` + `<span class="slash-menu-item-text"><span class="slash-menu-item-label">${name}</span><span class="slash-menu-item-desc">${desc}</span></span></button>`; }).join("") +
      `</div>` +
      `<p class="acrx-onboarding-sub" style="margin-top:12px">Start from a template</p>` +
      navRow({ back: false, nextLabel: "Continue" });
    body.querySelectorAll("[data-ob-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.type = btn.getAttribute("data-ob-pick") === "post" ? "post" : "page";
        if (!state.slugTouched) state.slug = "";
        render();
      });
    });
    body.querySelectorAll("[data-ob-tpl]").forEach((btn) => {
      btn.addEventListener("click", () => { state.template = btn.getAttribute("data-ob-tpl"); render(); });
    });
    wireNav();
    void loadRecents(body);
  }

  function renderDetails() {
    body.innerHTML = stepsBar() +
      `<div class="insp-field"><label class="insp-label" for="acrx-ob-title">Title</label>` +
      `<input id="acrx-ob-title" type="text" class="insp-input" placeholder="Untitledâ€¦" autocomplete="off" value="${esc(state.title)}">` +
      `<p class="insp-hint">Shown in the editor, listings and the browser tab.</p></div>` +
      `<div class="insp-field"><label class="insp-label" for="acrx-ob-slug">Slug</label>` +
      `<input id="acrx-ob-slug" type="text" class="insp-input" autocomplete="off" value="${esc(state.slug || slugify(state.title))}" placeholder="${esc(slugify(defaultTitle()) || "untitled")}">` +
      `<p class="insp-hint">URL-safe address, generated from the title until you edit it.</p></div>` +
      `<div class="insp-field"><label class="insp-label" for="acrx-ob-excerpt">Excerpt <span class="insp-hint">optional</span></label>` +
      `<textarea id="acrx-ob-excerpt" class="insp-textarea" rows="2" placeholder="One-line summary for listings and SEOâ€¦">${esc(state.excerpt)}</textarea></div>` +
      navRow({ nextLabel: "Continue" });
    const titleInput = body.querySelector("#acrx-ob-title");
    const slugInput = body.querySelector("#acrx-ob-slug");
    const excerptInput = body.querySelector("#acrx-ob-excerpt");
    titleInput.addEventListener("input", () => {
      state.title = titleInput.value;
      if (!state.slugTouched) slugInput.value = slugify(state.title);
    });
    slugInput.addEventListener("input", () => {
      state.slug = slugInput.value;
      state.slugTouched = true;
    });
    excerptInput.addEventListener("input", () => { state.excerpt = excerptInput.value; });
    titleInput.focus();
    wireNav();
  }

  function renderAi() {
    const preview = state.aiChunks.length > 0
      ? `<div class="acrx-ob-ai-preview">` + state.aiChunks.slice(0, 4).map((c) => `<p>${esc(c.length > 180 ? c.slice(0, 177) + "â€¦" : c)}</p>`).join("") +
        (state.aiChunks.length > 4 ? `<p class="insp-hint">+ ${state.aiChunks.length - 4} more paragraphs</p>` : "") + `</div>`
      : "";
    body.innerHTML = stepsBar() +
      `<p class="acrx-onboarding-sub">Start from an AI first draft â€” or skip and write it yourself.</p>` +
      `<div class="insp-field"><label class="insp-label" for="acrx-ob-brief">What is this about?</label>` +
      `<textarea id="acrx-ob-brief" class="insp-textarea" rows="3" placeholder="e.g. A short intro for a bakery landing page">${esc(state.aiBrief)}</textarea></div>` +
      (state.aiBusy ? `<p class="acrx-ai-status">Generatingâ€¦</p>` : "") +
      preview +
      `<div class="acrx-modal-actions acrx-ob-nav">` +
      `<button type="button" class="axed-btn" data-ob-back>Back</button>` +
      `<span class="acrx-ob-ai-actions">` +
      (state.aiChunks.length > 0 ? `<button type="button" class="axed-btn" data-ob-discard-ai>Discard</button>` : "") +
      `<button type="button" class="axed-btn" data-ob-generate ${state.aiBusy ? "disabled" : ""}><i class="fa-duotone fa-sparkles"></i> ${state.aiChunks.length > 0 ? "Regenerate" : "Generate"}</button>` +
      `<button type="button" class="axed-btn axed-primary" data-ob-skip-next>${state.aiChunks.length > 0 ? "Keep draft & continue" : "Skip"}</button>` +
      `</span></div>` +
      (state.error ? `<p class="acrx-ob-error" role="alert">${esc(state.error)}</p>` : "");
    const brief = body.querySelector("#acrx-ob-brief");
    brief.addEventListener("input", () => { state.aiBrief = brief.value; });
    body.querySelector("[data-ob-back]")?.addEventListener("click", () => { state.error = ""; state.step = 1; render(); });
    body.querySelector("[data-ob-skip-next]")?.addEventListener("click", () => { state.error = ""; state.step = 3; render(); });
    body.querySelector("[data-ob-discard-ai]")?.addEventListener("click", () => { state.aiChunks = []; state.error = ""; render(); });
    body.querySelector("[data-ob-generate]")?.addEventListener("click", async () => {
      const prompt = brief.value.trim() || state.title.trim();
      if (!prompt) {
        state.error = "Describe the piece first â€” or skip this step.";
        render();
        return;
      }
      state.aiBusy = true;
      state.error = "";
      render();
      try {
        const res = await fetch("/acr/api/ai/content/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: `Draft ${state.type} copy titled "${defaultTitle()}": ${prompt}` }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.success === false) throw new Error((data && data.message) || `AI request failed (${res.status})`);
        const text = (data.text || "").trim();
        if (!text) throw new Error("Empty AI response");
        state.aiChunks = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
        if (state.aiChunks.length === 0) throw new Error("Empty AI response");
      } catch (err) {
        state.error = err.message || "Generation failed. Skip and write manually instead.";
      } finally {
        state.aiBusy = false;
        if (body.isConnected) render();
      }
    });
    if (!state.aiBusy) brief.focus();
  }

  function renderReview() {
    const rows = [
      ["Type", state.type === "page" ? "Page" : "Post"],
      ["Title", defaultTitle()],
      ["Slug", `/${effectiveSlug()}`],
      ["Excerpt", state.excerpt.trim() || "â€”"],
      ["Content", state.aiChunks.length > 0 ? `AI draft Â· ${state.aiChunks.length} paragraph${state.aiChunks.length === 1 ? "" : "s"}` : "Blank canvas"],
    ];
    body.innerHTML = stepsBar() +
      `<p class="acrx-onboarding-sub">One click creates the real draft and opens it. Nothing is saved before that.</p>` +
      `<dl class="acrx-ob-review">` + rows.map(([k, v]) =>
        `<div class="acrx-ob-row"><dt>${k}</dt><dd>${esc(v)}</dd></div>`
      ).join("") + `</dl>` +
      `<div class="acrx-modal-actions acrx-ob-nav">` +
      `<button type="button" class="axed-btn" data-ob-back ${state.busy ? "disabled" : ""}>Back</button>` +
      `<button type="button" class="axed-btn axed-primary" data-ob-create ${state.busy ? "disabled" : ""}>${state.busy ? "Creatingâ€¦" : "Create & open"}</button></div>` +
      (state.error ? `<p class="acrx-ob-error" role="alert">${esc(state.error)}</p>` : "");
    body.querySelector("[data-ob-back]")?.addEventListener("click", () => { state.error = ""; state.step = 2; render(); });
    body.querySelector("[data-ob-create]")?.addEventListener("click", create);
  }

  async function create() {
    if (state.busy) return;
    state.busy = true;
    state.error = "";
    render();
    try {
      const id = await createDocument(state.type, {
        title: defaultTitle(),
        slug: effectiveSlug(),
        excerpt: state.excerpt.trim(),
        paragraphs: state.aiChunks,
        template: state.template || "blank",
      });
      markCompleted();
      window.location.href = `/acrx/editor/?id=${encodeURIComponent(id)}&type=${encodeURIComponent(state.type)}`;
    } catch (err) {
      state.busy = false;
      state.error = err.message || "Could not create the document";
      if (body.isConnected) render();
      else ctx.toast(state.error, "error");
    }
  }

  function render() {
    if (!body.isConnected) return;
    if (state.step === 0) renderType();
    else if (state.step === 1) renderDetails();
    else if (state.step === 2) renderAi();
    else renderReview();
  }

  render();
}

function rid() {
  try {
    if (crypto?.randomUUID) return "block_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  } catch { /* fall through */ }
  return "block_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Empty-doc blueprint; AI paragraphs seed real paragraph nodes when used.
// Templates pre-shape the canvas (article/table-report) so new users see
// structure instead of a blank page.
function seededBlueprint(paragraphs, template = "blank") {
  const empty = { mobile: {}, tablet: {}, desktop: {} };
  const blocks = {};
  const order = [];
  const add = (type, extra = {}) => {
    const id = rid();
    blocks[id] = {
      id, type, content: [{ type: "text", text: "", marks: [] }],
      attrs: {}, styles: {}, responsive: { ...empty }, children: [], parent: "block_root",
      locked: false, hidden: false, customClasses: "", customId: "", customCSS: "",
      tag: "", ariaLabel: "", dataAttrs: {}, customAttributes: {}, data: { ...extra },
    };
    order.push(id);
    return id;
  };
  for (const text of paragraphs) {
    const id = rid();
    blocks[id] = {
      id, type: "paragraph", content: [{ type: "text", text, marks: [] }],
      attrs: {}, styles: {}, responsive: { ...empty }, children: [], parent: "block_root",
      locked: false, hidden: false, customClasses: "", customId: "", customCSS: "",
      tag: "", ariaLabel: "", dataAttrs: {}, customAttributes: {}, data: {},
    };
    order.push(id);
  }
  if (order.length === 0) {
    if (template === "article") {
      const h = rid();
      blocks[h] = { id: h, type: "heading", content: [{ type: "text", text: "Start with a clear headline", marks: [] }], attrs: { level: 1 }, styles: {}, responsive: { ...empty }, children: [], parent: "block_root", locked: false, hidden: false, customClasses: "", customId: "", customCSS: "", tag: "", ariaLabel: "", dataAttrs: {}, customAttributes: {}, data: {} };
      order.push(h);
      add("paragraph");
      add("blockquote");
    } else if (template === "table-report") {
      const h = rid();
      blocks[h] = { id: h, type: "heading", content: [{ type: "text", text: "Monthly report", marks: [] }], attrs: { level: 2 }, styles: {}, responsive: { ...empty }, children: [], parent: "block_root", locked: false, hidden: false, customClasses: "", customId: "", customCSS: "", tag: "", ariaLabel: "", dataAttrs: {}, customAttributes: {}, data: {} };
      order.push(h);
      add("table", { rows: [[[{ type: "text", text: "Metric", marks: [{ type: "bold" }] }], [{ type: "text", text: "Value", marks: [{ type: "bold" }] }]], [[{ type: "text", text: "Revenue", marks: [] }], [{ type: "text", text: "$0", marks: [] }]]], hasHeader: true });
      add("paragraph");
    }
  }
  blocks.block_root = {
    id: "block_root", type: "document", content: [], attrs: {}, styles: {},
    responsive: { ...empty }, children: order, parent: null,
    locked: false, hidden: false, customClasses: "", customId: "", customCSS: "",
    tag: "", ariaLabel: "", dataAttrs: {}, customAttributes: {}, data: {},
  };
  return { version: 1, blocks, blockOrder: order, rootId: "block_root" };
}

// Real CMS record first: the editor then opens it through the normal
// load path, so autosave, revisions and SEO all work from edit one.
async function createDocument(type, { title, slug, excerpt, paragraphs, template }) {
  const endpoint = type === "page" ? "/acr/api/pages" : "/acr/api/posts";
  const chunks = (paragraphs || []).map((s) => String(s || "").trim()).filter(Boolean).slice(0, 20);
  const blueprint = seededBlueprint(chunks, template || "blank");
  const hasBlocks = blueprint.blockOrder.length > 0;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      slug,
      excerpt: excerpt || "",
      content: hasBlocks
        ? { json: blueprint, html: "", raw: chunks.join("\n\n") }
        : { json: null, html: "", raw: "" },
      status: "draft",
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.success === false) {
    throw new Error((data && data.message) || `Create failed (${res.status})`);
  }
  const doc = data.page || data.post;
  const id = doc && (doc._id || doc.id);
  if (!id) throw new Error("Server did not return a document id");
  return String(id);
}

async function loadRecents(scope) {
  let items = [];
  try {
    const [postsRes, pagesRes] = await Promise.all([
      fetch("/acr/api/posts?status=draft&limit=5").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/acr/api/pages").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    for (const p of ((postsRes && postsRes.posts) || []).slice(0, 5)) {
      const id = p._id || p.id;
      if (id) items.push({ id: String(id), title: p.title || "Untitled", kind: "post" });
    }
    for (const g of ((pagesRes && pagesRes.pages) || []).slice(0, 5)) {
      const id = g._id || g.id;
      if (id) items.push({ id: String(id), title: g.title || "Untitled", kind: "page" });
    }
  } catch {
    items = [];
  }
  if (!scope.isConnected || items.length === 0) return;
  const host = scope.querySelector("[data-ob-recents]");
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `<div class="insp-group-title">Recent drafts</div>` + items.slice(0, 6).map((r) =>
    `<button type="button" class="slash-menu-item" data-ob-open="${esc(r.id)}" data-ob-kind="${esc(r.kind)}">` +
    `<span class="slash-menu-item-icon"><i class="fa-duotone fa-${r.kind === "page" ? "file-lines" : "pen"}"></i></span>` +
    `<span class="slash-menu-item-text"><span class="slash-menu-item-label">${esc(r.title)}</span>` +
    `<span class="slash-menu-item-desc">${r.kind === "page" ? "Page" : "Post"} Â· draft</span></span></button>`
  ).join("");
  host.querySelectorAll("[data-ob-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      markCompleted();
      window.location.href = `/acrx/editor/?id=${encodeURIComponent(btn.getAttribute("data-ob-open"))}&type=${encodeURIComponent(btn.getAttribute("data-ob-kind") || "post")}`;
    });
  });
}

export default { initOnboarding, maybeShowOnboarding, closeOnboarding, onboardingCompleted };
