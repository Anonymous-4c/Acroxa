// acrx/assets/js/editor/app/services/persistence.js
//
// Load/save against the existing editor endpoints (no new backend):
//   GET  /acr/api/editor/:id/data     (document + widgets + patterns + SEO)
//   GET  /acr/api/editor/:id/content  (content only, fallback)
//   POST /acr/api/editor/:id/content  (content.json + title/status/meta/seo)
// Revisions are created server-side on save. Autosave: debounced 8s while
// dirty + on visibility loss. Retries with backoff; offline-aware footer.

import { State } from "../core/store.js";
import { blueprintToNodes, fromEngineNode } from "../core/model.js";

let ctx = null;
let saveTimer = 0;
let saveQueue = Promise.resolve();
let retryCount = 0;

export function initPersistence(shared) {
  ctx = shared;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveSoon(true);
  });
  window.addEventListener("online", () => {
    if (State.value("editor.isDirty")) saveSoon(true);
  });
}

export function documentIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const direct = params.get("id") || params.get("postId") || params.get("post");
  if (direct) return direct;
  const m = window.location.pathname.match(/\/editor\/([^\/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Single-flight draft creation (U-09): exactly one post/page per fresh
// session no matter how many saves race it.
let creatingDraft = null;
export function ensureDraftDocument() {
  const editor = State.get("editor") || {};
  if (editor.documentId) return Promise.resolve(editor.documentId);
  if (!creatingDraft) {
    creatingDraft = createDraftDocument().finally(() => { creatingDraft = null; });
  }
  return creatingDraft;
}

async function createDraftDocument() {
  const editor = State.get("editor") || {};
  const type = editor.postType || "post";
  const endpoint = type === "page" ? "/acr/api/pages" : "/acr/api/posts";
  const rand = Math.random().toString(36).slice(2, 6);
  // Unique slug per draft so repeated "Untitled" creates never collide (400);
  // titles stay clean ("Untitled Post") — server ensureUniqueSlug is the
  // backstop, this avoids the conflict path entirely on the happy path.
  const title = type === "page" ? "Untitled Page" : "Untitled Post";
  const slug = `${type === "page" ? "untitled-page" : "untitled-post"}-${rand}${Date.now().toString(36).slice(-4)}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, slug, status: "draft", content: { json: null, html: "", raw: "" } }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || `Draft creation failed (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  const doc = data.post || data.page || data.document || {};
  const newId = doc.id || doc._id;
  if (!newId) throw new Error("Draft creation returned no id");
  State.patch("editor", { documentId: String(newId) });
  try {
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/\/editor(\/[^/?#]*)?$/, `/editor/${newId}`);
    url.searchParams.set("type", type);
    window.history.replaceState(null, "", url.toString());
  } catch { /* URL stays; saves still target the new id */ }
  return String(newId);
}

export async function loadInitial() {
  const id = documentIdFromUrl();
  const type = new URLSearchParams(window.location.search).get("type") || "post";
  if (!id || id === "new") {
    ctx.newDocument(type);
    State.patch("editor", { postType: type });
    // Pre-create the post/page server-side (U-09): the fresh canvas gets a
    // real autosave target and URL up front instead of an unsavable draft.
    ensureDraftDocument().then(
      () => ctx.toast("Draft created — autosave is on", "success"),
      (err) => {
        State.patch("editor", { saveError: err.message });
        ctx.updateFooter();
        ctx.toast(`Could not create draft (${err.message}) — will retry on save`, "error");
      }
    );
    return { fresh: true };
  }
  State.patch("editor", { documentId: id, postType: type, isSaving: true });
  ctx.updateFooter();
  try {
    const res = await fetch(`/acr/api/editor/${encodeURIComponent(id)}/data?type=${encodeURIComponent(type)}`);
    if (!res.ok) throw new Error(`Load failed (${res.status})`);
    const payload = await res.json();
    const document = payload.data?.document || payload.document;
    if (!document) throw new Error("No document in response");
    applyLoadedDocument(document, type, id);
    return {
      fresh: false,
      widgets: payload.data?.widgets || [],
      patterns: payload.data?.patterns || [],
      seoReport: payload.data?.seoReport || null,
    };
  } catch (err) {
    State.patch("editor", { isSaving: false, saveError: err.message });
    ctx.updateFooter();
    throw err;
  }
}

function applyLoadedDocument(document, type, id) {
  const json = document.content?.json || null;
  if (json) ctx.loadBlueprint(json);
  else ctx.newDocument(type);
  State.batch(() => {
    State.patch("editor", {
      documentId: document.id || id,
      postType: type,
      title: document.title || "",
      status: document.status || "draft",
      isSaving: false,
      saveError: null,
    });
    const meta = document.meta || {};
    State.patch("post", {
      title: document.title || "",
      slug: document.slug || "",
      status: document.status || "draft",
      author: meta.author || document.author || null,
      publishDate: meta.publishDate || document.publishDate || null,
      featuredImage: meta.featuredImage || document.featuredImage || "",
      featuredImageAlt: meta.featuredImageAlt || "",
      excerpt: meta.excerpt || document.excerpt || "",
      categories: meta.categories || [],
      tags: meta.tags || document.tags || [],
      template: meta.template || "default",
      allowComments: meta.allowComments !== false,
    });
    const s = document.seo || {};
    State.patch("seo", {
      metaTitle: s.metaTitle || document.metaTitle || "",
      metaDescription: s.metaDescription || document.metaDescription || "",
      focusKeyword: s.focusKeyword || document.focusKeyword || "",
      keywords: s.keywords || document.keywords || [],
      canonicalUrl: s.canonicalUrl || document.canonicalUrl || "",
      noIndex: !!(s.noIndex ?? document.noIndex),
      noFollow: !!(s.noFollow ?? document.noFollow),
      ogTitle: s.ogTitle || document.ogTitle || "",
      ogDescription: s.ogDescription || document.ogDescription || "",
      ogImage: s.ogImage || document.ogImage || null,
    });
  });
  ctx.updateFooter();
}

export function buildSavePayload() {
  const editor = State.get("editor") || {};
  const post = State.get("post") || {};
  const seo = State.get("seo") || {};
  const { html, raw } = ctx.renderExport();
  return {
    content: {
      json: ctx.blueprint(),
      html,
      raw,
      conditionalJS: null,
    },
    title: post.title || editor.title,
    status: post.status || editor.status || "draft",
    postType: editor.postType,
    meta: {
      slug: post.slug,
      excerpt: post.excerpt,
      featuredImage: post.featuredImage,
      featuredImageAlt: post.featuredImageAlt,
      categories: post.categories,
      tags: post.tags,
      publishDate: post.publishDate,
      allowComments: post.allowComments,
      template: post.template,
    },
    seo: {
      metaTitle: seo.metaTitle,
      metaDescription: seo.metaDescription,
      focusKeyword: seo.focusKeyword,
      keywords: seo.keywords,
      canonicalUrl: seo.canonicalUrl,
      noIndex: seo.noIndex,
      noFollow: seo.noFollow,
      ogTitle: seo.ogTitle,
      ogDescription: seo.ogDescription,
      ogImage: seo.ogImage,
    },
  };
}

export function saveSoon(immediate = false) {
  clearTimeout(saveTimer);
  const editor = State.get("editor") || {};
  if (!editor.autosaveEnabled && !immediate) return;
  if (!editor.isDirty) return;
  saveTimer = setTimeout(() => saveNow().catch(() => {}), immediate ? 400 : 8000);
}

export function saveNow() {
  clearTimeout(saveTimer);
  const run = saveQueue.then(() => doSave());
  saveQueue = run.catch(() => {});
  return run;
}

async function doSave() {
  let editor = State.get("editor") || {};
  if (!editor.documentId) {
    // Create-on-first-save fallback: if the pre-create never ran or failed
    // (offline at boot), mint the draft now instead of dropping the save.
    try {
      await ensureDraftDocument();
    } catch (err) {
      ctx.toast(`Save failed: ${err.message}`, "error");
      return;
    }
    editor = State.get("editor") || {};
    if (!editor.documentId) {
      ctx.toast("No document id — open the editor from a post or page", "error");
      return;
    }
  }
  if (!navigator.onLine) {
    State.patch("editor", { saveError: "Offline — will retry" });
    ctx.updateFooter();
    saveSoon(true);
    return;
  }
  State.patch("editor", { isSaving: true, saveError: null });
  ctx.updateFooter();
  try {
    const res = await fetch(`/acr/api/editor/${encodeURIComponent(editor.documentId)}/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSavePayload()),
    });
    if (!res.ok) throw new Error(`Save failed (${res.status})`);
    const data = await res.json();
    if (data && data.success === false) throw new Error(data.message || "Save rejected");
    retryCount = 0;
    State.patch("editor", { isSaving: false, isDirty: false, lastSavedAt: new Date().toISOString(), saveError: null });
    ctx.markSaved();
    ctx.toast("Saved", "success");
  } catch (err) {
    retryCount += 1;
    State.patch("editor", { isSaving: false, saveError: err.message });
    ctx.toast(`Save failed: ${err.message}`, "error");
    if (retryCount <= 3) {
      setTimeout(() => saveNow().catch(() => {}), retryCount * 5000);
    }
  } finally {
    ctx.updateFooter();
  }
}

export { blueprintToNodes, fromEngineNode };
export default { initPersistence, loadInitial, saveSoon, saveNow, buildSavePayload, documentIdFromUrl, ensureDraftDocument };
