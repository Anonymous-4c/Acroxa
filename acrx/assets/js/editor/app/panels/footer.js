// acrx/assets/js/editor/app/panels/footer.js
//
// Footer wiring on existing hooks: breadcrumbs (#editor-breadcrumbs) from the
// selection ancestry, save status (.footer-status-item), word/character
// counts and block stats in the footer center. Device switcher is added
// additively into the footer right (no existing element is altered).

import { CATALOG_BY_TYPE } from "../core/model.js";
import { State } from "../core/store.js";

let ctx = null;

export function initFooter(shared) {
  ctx = shared;
  const crumbs = document.getElementById("editor-breadcrumbs");
  crumbs?.addEventListener("click", (event) => {
    const item = event.target.closest("[data-crumb]");
    if (!item) return;
    const id = item.getAttribute("data-crumb");
    if (id === "__root") ctx.clearSelection();
    else ctx.selectBlock(id, { focus: false });
  });

  // Additive device switcher (existing footer children untouched).
  const right = document.getElementById("editor-footer-right");
  if (right && !right.querySelector(".footer-devices")) {
    const devices = document.createElement("div");
    devices.className = "footer-devices";
    devices.setAttribute("role", "group");
    devices.setAttribute("aria-label", "Preview device");
    devices.innerHTML = ["desktop", "tablet", "mobile"].map((d) =>
      `<button type="button" class="footer-device${d === "desktop" ? " is-active" : ""}" data-device="${d}" data-title="${d[0].toUpperCase() + d.slice(1)} preview" aria-label="${d} preview">` +
      `<i class="fa-duotone fa-${d === "desktop" ? "display" : d === "tablet" ? "tablet" : "mobile"}"></i></button>`
    ).join("");
    devices.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-device]");
      if (btn) ctx.setDevice(btn.getAttribute("data-device"));
    });
    right.insertBefore(devices, right.firstChild);
  }
  document.addEventListener("selectionchange", () => {
    clearTimeout(refreshCaretPosition._t);
    refreshCaretPosition._t = setTimeout(refreshCaretPosition, 150);
  });
}

export function refreshBreadcrumbs() {
  const host = document.getElementById("editor-breadcrumbs");
  if (!host) return;
  const inner = host.querySelector(".breadcrumbs") || host;
  const id = ctx.currentBlockId();
  const crumbs = [{ id: "__root", label: "Root" }];
  if (id) {
    const chain = [];
    let node = ctx.editor.document.getNode(id);
    while (node && node.parentId) {
      chain.unshift(node);
      node = ctx.editor.document.getNode(node.parentId);
    }
    for (const n of chain) {
      const def = CATALOG_BY_TYPE[n.type];
      crumbs.push({ id: n.id, label: def ? def.label : n.type });
    }
  }
  inner.innerHTML = crumbs.map((c, i) =>
    (i > 0 ? `<button type="button" class="breadcrumb-sep" aria-hidden="true"><i class="fa-duotone fa-angle-right"></i></button>` : "") +
    `<button type="button" class="breadcrumb-item" data-crumb="${c.id}">${escapeHtml(c.label)}</button>`
  ).join("");
}

export function refreshStatus() {
  const editor = State.get("editor") || {};
  const item = document.querySelector(".footer-status-item");
  if (item) {
    let icon = "circle-check";
    let text = "Saved";
    if (editor.isSaving) { icon = "circle-notch"; text = "Saving…"; }
    else if (editor.saveError) { icon = "triangle-exclamation"; text = "Save failed"; }
    else if (editor.isDirty) { icon = "circle"; text = "Unsaved changes"; }
    item.innerHTML = `<i class="fa-duotone fa-${icon}"></i>${text}`;
    item.classList.toggle("is-error", !!editor.saveError);
    item.classList.toggle("is-dirty", !!editor.isDirty && !editor.isSaving);
  }
  const center = document.getElementById("editor-footer-center");
  if (center && !center.querySelector(".footer-stats")) {
    const stats = document.createElement("span");
    stats.className = "footer-stats";
    center.appendChild(stats);
  }
  const stats = center?.querySelector(".footer-stats");
  if (stats) {
    stats.textContent = `${editor.wordCount || 0} words · ${editor.blockCount || 0} blocks`;
  }
  document.querySelectorAll(".footer-device").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-device") === editor.deviceMode);
  });
  refreshCaretPosition();
}

// Live caret position: block line + text offset replace the shell's static
// demo values ("Line 42", "Col 7") as soon as the editor boots.
export function refreshCaretPosition() {
  const lineEl = document.querySelector(".footer-line-num");
  const colEl = document.querySelector(".footer-col-num");
  if (!lineEl && !colEl) return;
  let line = "–";
  let col = "–";
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      const editable = anchor?.closest?.("[contenteditable='true']");
      const wrap = anchor?.closest?.(".block-wrap");
      if (editable && wrap) {
        const canvas = document.getElementById("editor-canvas");
        const topWraps = [...canvas.querySelectorAll(":scope > .block-wrap")];
        const idx = topWraps.indexOf(wrap.closest(":scope > .block-wrap") || wrap);
        line = idx >= 0 ? String(idx + 1) : "–";
        const pre = document.createRange();
        pre.selectNodeContents(editable);
        pre.setEnd(sel.anchorNode, sel.anchorOffset);
        col = String(pre.toString().length + 1);
      }
    }
  } catch { /* caret readout is best-effort */ }
  if (lineEl) lineEl.innerHTML = `<i class="fa-duotone fa-hashtag"></i>Ln ${line}`;
  if (colEl) colEl.innerHTML = `<i class="fa-duotone fa-hashtag"></i>Col ${col}`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default { initFooter, refreshBreadcrumbs, refreshStatus, refreshCaretPosition };
