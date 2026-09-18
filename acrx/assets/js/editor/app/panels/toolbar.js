// acrx/assets/js/editor/app/panels/toolbar.js
//
// Wires the existing server-rendered toolbar (#editor-toolbar buttons) as a
// presentation/command layer over the current text selection. Buttons stay
// exactly as rendered; this module adds behavior + active states only.

import { activeMarks } from "../canvas/text.js";
import { canApplyMark } from "../../engines/index.js";

let ctx = null;

const MARK_BUTTONS = [
  ["#toolbar-bold", "bold"],
  ["#toolbar-italic", "italic"],
  ["#toolbar-underline", "underline"],
  ["#toolbar-strike", "strikethrough"],
  ["#toolbar-inline-code", "code"],
];

const ALIGN_BUTTONS = [
  ["#toolbar-align-left", "left"],
  ["#toolbar-align-center", "center"],
  ["#toolbar-align-right", "right"],
  ["#toolbar-align-justify", "justify"],
];

export function initToolbar(shared) {
  ctx = shared;

  // Real browsers move focus (and collapse the text selection) on mousedown.
  // Preventing the default on toolbar presses keeps the editable focused so
  // mark commands still see the user's selection.
  document.getElementById("editor-toolbar")?.addEventListener("mousedown", (event) => {
    if (event.target.closest("button")) event.preventDefault();
  });
  initOverflow();

  for (const [selector, mark] of MARK_BUTTONS) {
    document.querySelector(selector)?.addEventListener("click", () => {
      const id = ctx.currentBlockId();
      if (!id) { ctx.toast("Select a text block first", "info"); return; }
      if (!canApplyMark(activeMarks(id), mark)) {
        ctx.toast("Remove code formatting first — code can't mix with rich marks", "info");
        return;
      }
      ctx.toggleMark(id, mark);
      refresh();
    });
  }

  // Link is a mark, but it opens a URL editor instead of toggling directly.
  // Same command as the palette entry (mark.link → ctx.promptLink).
  document.querySelector("#toolbar-link")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (!id) { ctx.toast("Select a text block first", "info"); return; }
    ctx.promptLink(id);
    refresh();
  });

  document.querySelector("#toolbar-blockquote")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (!id) return;
    const block = ctx.getBlock(id);
    ctx.transformBlock(id, block && block.type === "blockquote" ? "paragraph" : "blockquote");
  });

  for (const [selector, align] of ALIGN_BUTTONS) {
    document.querySelector(selector)?.addEventListener("click", () => {
      const id = ctx.currentBlockId();
      if (!id) { ctx.toast("Select a block first", "info"); return; }
      ctx.setBlockAttrs(id, { align });
      refresh();
    });
  }

  document.querySelector("#toolbar-codeblock")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (id) ctx.transformBlock(id, "codeblock");
    else ctx.insertAtSelection("codeblock");
  });

  document.querySelector("#toolbar-table")?.addEventListener("click", (e) => {
    openTableGrid(e.currentTarget);
  });

  document.querySelector("#toolbar-ul")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (id) ctx.transformBlock(id, "bulletList");
    else ctx.insertAtSelection("bulletList");
  });

  document.querySelector("#toolbar-ol")?.addEventListener("click", () => {
    const id = ctx.currentBlockId();
    if (id) ctx.transformBlock(id, "orderedList");
    else ctx.insertAtSelection("orderedList");
  });

  document.addEventListener("selectionchange", () => {
    if (ctx.isActive()) { refreshSoon(); positionTableBubble(); }
  });
  document.getElementById("editor-canvas")?.addEventListener("click", () => setTimeout(positionTableBubble, 30));
  document.getElementById("editor-canvas")?.addEventListener("keyup", () => positionTableBubble());
  initTableBubble();
}

// Visual grid picker (TipTap TableTrigger parity): hover to choose rows×cols,
// click inserts a sized table instead of a fixed 2×2.
function openTableGrid(anchor) {
  closeTableGrid();
  const pop = document.createElement("div");
  pop.className = "toolbar-overflow-menu open acrx-table-picker-pop";
  pop.setAttribute("role", "menu");
  pop.innerHTML = `<div class="toolbar-overflow-label">Insert table <span data-grid-label>2 × 2</span></div><div class="acrx-table-grid-picker"></div><div class="toolbar-overflow-label">Tip: Tab moves between cells</div>`;
  const grid = pop.querySelector(".acrx-table-grid-picker");
  const label = pop.querySelector("[data-grid-label]");
  let rows = 2, cols = 2;
  const paint = (r, c) => {
    rows = r; cols = c;
    label.textContent = `${r} × ${c}`;
    grid.querySelectorAll("button").forEach((b) => {
      const br = Number(b.dataset.r), bc = Number(b.dataset.c);
      b.classList.toggle("is-on", br <= r && bc <= c);
    });
  };
  for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.r = r; b.dataset.c = c;
    b.setAttribute("aria-label", `${r} by ${c} table`);
    b.addEventListener("mouseenter", () => paint(r, c));
    b.addEventListener("click", () => {
      const dataRows = Array.from({ length: r }, () => Array.from({ length: c }, () => []));
      const id = ctx.currentBlockId();
      if (id) {
        const block = ctx.getBlock(id);
        if (block && (block.type === "paragraph") && !(block.content || []).length) ctx.transformBlock(id, "table");
        else ctx.insertAtSelection("table");
        // Resize the freshly inserted/transformed table to the picked size.
        const targetId = ctx.currentBlockId() || id;
        const tb = ctx.getBlock(targetId);
        if (tb && tb.type === "table") ctx.setBlockData(targetId, { rows: dataRows, hasHeader: true }, { record: true, label: `Insert ${r}×${c} table` });
        ctx.render();
      } else ctx.insertAtSelection("table");
      closeTableGrid();
    });
    grid.appendChild(b);
  }
  paint(2, 2);
  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  pop.style.position = "fixed";
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 240, rect.left))}px`;
  pop.style.top = `${rect.bottom + window.scrollY + 6}px`;
  setTimeout(() => document.addEventListener("click", closeTableGrid, { once: true }), 0);
}
function closeTableGrid() { document.querySelector(".acrx-table-picker-pop")?.remove(); }

// Floating table toolbar (row/col add/delete, header toggle): appears above
// the active table, live-commits without losing caret.
function initTableBubble() {
  if (document.querySelector(".acrx-table-bubble")) return;
  const bar = document.createElement("div");
  bar.className = "acrx-table-bubble";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Table tools");
  bar.innerHTML =
    `<button type="button" data-t="row-before" title="Add row above">+Row ↑</button>` +
    `<button type="button" data-t="row-after" title="Add row below">+Row ↓</button>` +
    `<button type="button" data-t="col-before" title="Add column left">+Col ←</button>` +
    `<button type="button" data-t="col-after" title="Add column right">+Col →</button>` +
    `<button type="button" data-t="del-row" title="Delete row">Del row</button>` +
    `<button type="button" data-t="del-col" title="Delete column">Del col</button>` +
    `<button type="button" data-t="header" title="Toggle header row">Header</button>`;
  document.body.appendChild(bar);
  bar.addEventListener("mousedown", (e) => e.preventDefault());
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-t]");
    if (!btn) return;
    const active = document.activeElement?.closest?.("[data-row]");
    const wrap = document.activeElement?.closest?.(".block-wrap");
    const id = wrap?.getAttribute("data-for-block-id") || ctx.currentBlockId();
    if (!id) return;
    const op = btn.getAttribute("data-t");
    if (op === "row-before") ctx.tableAddRow(id, active, "before");
    else if (op === "row-after") ctx.tableAddRow(id, active, "after");
    else if (op === "col-before") ctx.tableAddCol(id, active, "before");
    else if (op === "col-after") ctx.tableAddCol(id, active, "after");
    else if (op === "del-row") ctx.tableDeleteRow(id, active);
    else if (op === "del-col") ctx.tableDeleteCol(id, active);
    else if (op === "header") ctx.tableToggleHeader(id);
    setTimeout(positionTableBubble, 50);
  });
}
function positionTableBubble() {
  const bar = document.querySelector(".acrx-table-bubble");
  if (!bar) return;
  const ae = document.activeElement;
  const cell = ae?.closest?.("[data-row]");
  const wrap = ae?.closest?.(".block-wrap");
  const block = wrap ? ctx.getBlock(wrap.getAttribute("data-for-block-id")) : null;
  if (!cell || !block || block.type !== "table") { bar.classList.remove("open"); return; }
  const rect = wrap.getBoundingClientRect();
  bar.classList.add("open");
  bar.style.left = `${Math.max(8, Math.min(window.innerWidth - bar.offsetWidth - 8, rect.left + window.scrollX))}px`;
  bar.style.top = `${Math.max(8, rect.top + window.scrollY - bar.offsetHeight - 8)}px`;
}

let refreshTimer = 0;
function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 120);
}

// Responsive overflow: when the bar is too narrow (small screens), collapse
// trailing controls into a "More" dropdown grouped by Format / Align /
// Insert — one icon shows, opening reveals the rest. Keeps every command
// reachable without horizontal scrolling.
function initOverflow() {
  const bar = document.getElementById("editor-toolbar");
  if (!bar || bar.querySelector(".toolbar-overflow-wrap")) return;
  const wrap = document.createElement("div");
  wrap.className = "toolbar-overflow-wrap";
  wrap.innerHTML = `<button type="button" class="toolbar-btn" id="toolbar-overflow-btn" aria-label="More formatting" data-title="More"><i class="fa-solid fa-ellipsis"></i></button><div class="toolbar-overflow-menu" role="menu" aria-label="More formatting"></div>`;
  bar.appendChild(wrap);
  const btn = wrap.querySelector("#toolbar-overflow-btn");
  const menu = wrap.querySelector(".toolbar-overflow-menu");
  btn.addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("open"); });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) menu.classList.remove("open"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.classList.remove("open"); });
  let movedNodes = [];
  const relayout = () => {
    const overflow = bar.scrollWidth > bar.clientWidth + 8 || window.innerWidth <= 900;
    bar.classList.toggle("is-overflowing", overflow);
    wrap.style.display = overflow ? "" : "none";
    if (!overflow && movedNodes.length) {
      const order = ["#toolbar-bold", "#toolbar-italic", "#toolbar-underline", "#toolbar-strike", "#toolbar-inline-code", "#toolbar-link", "#toolbar-blockquote", "#toolbar-align-left", "#toolbar-align-center", "#toolbar-align-right", "#toolbar-align-justify", "#toolbar-codeblock", "#toolbar-table", "#toolbar-ul", "#toolbar-ol"];
      const groupFor = (id) => (id.startsWith("#toolbar-align") ? ".toolbar-align" : (["#toolbar-codeblock", "#toolbar-table", "#toolbar-ul", "#toolbar-ol"].includes(id) ? ".toolbar-advanced" : ".toolbar-format"));
      order.forEach((sel) => {
        const node = movedNodes.find((n) => `#${n.id}` === sel);
        if (node) bar.querySelector(groupFor(sel))?.appendChild(node);
      });
      movedNodes = [];
      menu.innerHTML = "";
      return;
    }
    if (!overflow) return;
    if (movedNodes.length) return; // already consolidated
    menu.innerHTML = "";
    const keepInline = new Set(["toolbar-bold", "toolbar-italic", "toolbar-align-left", "toolbar-ul"]);
    const defs = [["Format", ".toolbar-format"], ["Align", ".toolbar-align"], ["Insert", ".toolbar-advanced"]];
    defs.forEach(([label, groupSel]) => {
      const group = bar.querySelector(groupSel);
      if (!group) return;
      const btns = [...group.querySelectorAll(".toolbar-btn")].filter((b) => !keepInline.has(b.id));
      if (!btns.length) return;
      const lab = document.createElement("div");
      lab.className = "toolbar-overflow-label";
      lab.textContent = label;
      menu.appendChild(lab);
      btns.forEach((b) => { movedNodes.push(b); menu.appendChild(b); });
    });
  };
  new ResizeObserver(() => relayout()).observe(bar);
  window.addEventListener("resize", relayout);
  setTimeout(relayout, 50);
  setTimeout(relayout, 500);
}

export function refresh() {
  const id = ctx.currentBlockId();
  const marks = id ? activeMarks(id) : [];
  for (const [selector, mark] of MARK_BUTTONS) {
    const btn = document.querySelector(selector);
    if (!btn) continue;
    btn.classList.toggle("is-active", marks.includes(mark));
    // Disabled is guidance only; the command layer (compat matrix in the
    // rich-text engine) enforces the rule for keyboard/palette/paste paths.
    const blocked = !canApplyMark(marks, mark);
    btn.classList.toggle("is-disabled", blocked);
    if (blocked) btn.setAttribute("aria-disabled", "true");
    else btn.removeAttribute("aria-disabled");
  }
  const linkBtn = document.querySelector("#toolbar-link");
  if (linkBtn) linkBtn.classList.toggle("is-active", marks.includes("link"));
  const block = id ? ctx.getBlock(id) : null;
  const align = block?.attrs?.align || (block?.data?.align) || "left";
  for (const [selector, value] of ALIGN_BUTTONS) {
    document.querySelector(selector)?.classList.toggle("is-active", align === value);
  }
}

export default { initToolbar, refresh };
