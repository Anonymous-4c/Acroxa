// acrx/assets/js/editor/app/panels/topbar.js
//
// Top-bar audit: every control must act on real state. Wires the existing
// shell buttons (back, autosave, save dropdown, more actions) and adds
// undo/redo buttons additively. Save/publish flow through persistence;
// revisions, export and shortcuts use real endpoints and real document data.

import { State } from "../core/store.js";
import { open as openMenu } from "../menus/contextMenu.js";

let ctx = null;

export function initTopbar(shared) {
  ctx = shared;
  wireBack();
  wireAutosave();
  wireSave();
  wireMore();
  addHistoryButtons();
}

function wireBack() {
  document.getElementById("editor-back-btn")?.addEventListener("click", () => {
    const dirty = State.value("editor.isDirty");
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/acrx/posts";
  });
}

function wireAutosave() {
  const toggle = document.getElementById("editor-autosave-toggle");
  if (!toggle) return;
  toggle.checked = State.value("editor.autosaveEnabled") !== false;
  toggle.addEventListener("change", () => {
    State.patch("editor", { autosaveEnabled: toggle.checked });
    ctx.toast(toggle.checked ? "Autosave on" : "Autosave off", "info");
  });
}

function setStatusAndSave(status) {
  ctx.setPost({ status });
  import("./postPanel.js").then((m) => m.refresh());
  ctx.saveNow();
}

function wireSave() {
  document.getElementById("editor-save-dropdown-action")?.addEventListener("click", () => {
    ctx.saveNow();
  });
  document.getElementById("editor-save-dropdown-toggle")?.addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelector("#editor-save-dropdown .dropdown-menu")?.classList.toggle("active");
  });
  document.querySelectorAll("#editor-save-dropdown .dropdown-item").forEach((item) => {
    item.addEventListener("click", () => {
      document.querySelector("#editor-save-dropdown .dropdown-menu")?.classList.remove("active");
      const value = item.getAttribute("data-value");
      if (value === "publish") setStatusAndSave("published");
      else if (value === "schedule") setStatusAndSave("scheduled");
      else setStatusAndSave("draft");
    });
  });
  document.addEventListener("click", () => {
    document.querySelector("#editor-save-dropdown .dropdown-menu")?.classList.remove("active");
  });
}

function addHistoryButtons() {
  // Buttons render in SSR on the left, after autosave; adopt them here and
  // only build as a fallback so disabled state always tracks real history.
  const left = document.querySelector(".acrx-editor-header-left");
  if (!left) return;
  const mk = (id, icon, title, fn) => {
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = "header-btn";
    btn.setAttribute("data-title", title);
    btn.setAttribute("aria-label", title);
    btn.innerHTML = `<i class="fa-duotone fa-${icon}"></i>`;
    btn.addEventListener("click", fn);
    return btn;
  };
  if (!document.getElementById("editor-undo-btn") || !document.getElementById("editor-redo-btn")) {
    if (!left.querySelector(".header-sep")) {
      const sep = document.createElement("span");
      sep.className = "header-sep";
      left.append(sep);
    }
    if (!document.getElementById("editor-undo-btn")) {
      left.append(mk("editor-undo-btn", "rotate-left", "Undo (Ctrl+Z)", () => ctx.undo()));
    }
    if (!document.getElementById("editor-redo-btn")) {
      left.append(mk("editor-redo-btn", "rotate-right", "Redo (Ctrl+Shift+Z)", () => ctx.redo()));
    }
  }
  const refresh = () => {
    const h = ctx.editor.engines.history.status();
    document.getElementById("editor-undo-btn")?.toggleAttribute("disabled", !h.canUndo);
    document.getElementById("editor-redo-btn")?.toggleAttribute("disabled", !h.canRedo);
  };
  ctx.editor.engines.history.on("history:recorded", refresh);
  ctx.editor.engines.history.on("history:undone", refresh);
  ctx.editor.engines.history.on("history:redone", refresh);
  ctx.editor.engines.history.on("history:cleared", refresh);
  refresh();
}

function download(filename, text, mime) {
  try {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      ctx.toast("Downloads are unavailable in this browser", "error");
      return;
    }
    const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 500);
  } catch (err) {
    ctx.toast(err.message || "Download failed", "error");
  }
}

function slug() {
  return (State.value("post.slug") || State.value("editor.title") || "document").toLowerCase().replace(/[^\w-]+/g, "-").replace(/--+/g, "-") || "document";
}

function wireMore() {
  document.getElementById("editor-more-actions")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    openMenu([
      { id: "save", label: "Save now", icon: "floppy-disk", hint: "Ctrl+S" },
      { id: "preview", label: "Preview", icon: "eye" },
      { separator: true },
      { id: "exp-html", label: "Export HTML", icon: "code" },
      { id: "exp-json", label: "Export JSON", icon: "brackets" },
      { id: "exp-md", label: "Export Markdown", icon: "markdown" },
      { separator: true },
      { id: "revisions", label: "Revision history", icon: "clock-rotate-left" },
      { id: "shortcuts", label: "Keyboard shortcuts", icon: "keyboard" },
    ], rect.right + window.scrollX - 220, rect.bottom + window.scrollY + 6, onMore);
  });
}

async function onMore(action) {
  if (action === "save") return ctx.saveNow();
  if (action === "preview") return ctx.openPreview();
  if (action === "exp-html") return exportDocument("html");
  if (action === "exp-json") return exportDocument("json");
  if (action === "exp-md") return exportDocument("md");
  if (action === "revisions") return openRevisions();
  if (action === "shortcuts") return openShortcuts();
}

// Palette bridges (same handlers as the More menu — no parallel paths).
export async function exportDocument(format) {
  if (format === "html") {
    const { html } = ctx.renderExport();
    download(`${slug()}.html`, ctx.exportFullHtml ? ctx.exportFullHtml(html) : html, "text/html");
    return;
  }
  if (format === "json") {
    download(`${slug()}.json`, JSON.stringify(ctx.blueprint(), null, 2), "application/json");
    return;
  }
  if (format === "md") {
    const { nodesToMarkdown } = await import("../../engines/index.js");
    const bp = ctx.blueprint();
    const nodes = Object.values(bp.blocks).map((b) => ({ type: b.type, data: { text: (b.content || []).map((n) => n.text || "").join(""), ...(b.data || {}) } }));
    download(`${slug()}.md`, nodesToMarkdown(nodes), "text/markdown");
    return;
  }
  throw new Error(`Unknown export format "${format}"`);
}

export { openRevisions, openShortcuts };

function modalShell(title) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "acrx-modal-overlay";
  overlay.innerHTML = `<div class="acrx-modal" role="dialog" aria-label="${title}">` +
    `<div class="acrx-modal-head"><span>${title}</span>` +
    `<button type="button" class="btn-act" data-modal-close aria-label="Close">×</button></div>` +
    `<div class="acrx-modal-body"></div></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-modal-close]")) closeModal();
  });
  document.addEventListener("keydown", escClose);
  return overlay.querySelector(".acrx-modal-body");
}

function escClose(event) {
  if (event.key === "Escape") closeModal();
}

function closeModal() {
  document.querySelector(".acrx-modal-overlay")?.remove();
  document.removeEventListener("keydown", escClose);
}

async function openRevisions() {
  const id = State.value("editor.documentId");
  const type = State.value("editor.postType") || "post";
  const body = modalShell("Revision history");
  body.innerHTML = `<div class="acrx-loading">Loading revisions…</div>`;
  if (!id) {
    body.innerHTML = `<div class="insp-empty"><p class="insp-empty-title">Not saved yet</p><p class="insp-empty-text">Save the document first to build revision history.</p></div>`;
    return;
  }
  try {
    const res = await fetch(`/acr/api/editor/${encodeURIComponent(id)}/revisions?type=${encodeURIComponent(type)}`);
    const data = await res.json();
    const list = data.revisions || [];
    if (list.length === 0) {
      body.innerHTML = `<div class="insp-empty"><p class="insp-empty-title">No revisions yet</p><p class="insp-empty-text">Revisions are created automatically on save.</p></div>`;
      return;
    }
    body.innerHTML = list.map((r) => {
      const rid = r._id || r.id;
      const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : "";
      return `<div class="acrx-rev-row"><span class="acrx-rev-num">#${r.revisionNumber ?? "–"}</span>` +
        `<span class="acrx-rev-meta">${r.title || ""} · ${when}</span>` +
        `<button type="button" class="btn-act" data-rev-restore="${rid}">Restore</button></div>`;
    }).join("");
    body.querySelectorAll("[data-rev-restore]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.confirm("Restore this revision? Current unsaved changes will be lost.")) return;
        try {
          const rr = await fetch(`/acr/api/editor/${encodeURIComponent(id)}/revisions/${encodeURIComponent(btn.getAttribute("data-rev-restore"))}/restore?type=${encodeURIComponent(type)}`, { method: "POST" });
          const dd = await rr.json();
          if (dd && dd.success === false) throw new Error(dd.message || "Restore rejected");
          closeModal();
          await ctx.reload();
          ctx.toast("Revision restored", "success");
        } catch (err) {
          ctx.toast(err.message || "Restore failed", "error");
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="insp-empty"><p class="insp-empty-title">Could not load revisions</p><p class="insp-empty-text">${String(err.message || err).replace(/</g, "&lt;")}</p></div>`;
  }
}

function openShortcuts() {
  const body = modalShell("Keyboard shortcuts");
  const rows = [
    ["Ctrl/⌘ + S", "Save"], ["Ctrl/⌘ + Z", "Undo"], ["Ctrl/⌘ + Shift + Z", "Redo"],
    ["Ctrl/⌘ + K", "Command palette"], ["/", "Insert block menu"], ["Ctrl/⌘ + D", "Duplicate block"],
    ["Ctrl/⌘ + G", "Group selected"], ["Ctrl/⌘ + Shift + G", "Ungroup"], ["Delete", "Delete selected blocks"],
    ["Ctrl/⌘ + B / I / U", "Bold / italic / underline"], ["Enter", "Split block"], ["Esc", "Close / deselect"],
    ["Ctrl/⌘ + \\", "Toggle left sidebar"], ["Ctrl/⌘ + 1 · 2 · 3", "Layers · Widgets · Patterns"],
  ];
  body.innerHTML = `<div class="acrx-shortcuts">` + rows.map(([k, v]) =>
    `<div class="acrx-shortcut-row"><span>${v}</span><kbd>${k}</kbd></div>`).join("") + `</div>`;
}

export default { initTopbar };
