// acrx/assets/js/editor/app/menus/suggest.js
//
// Contextual creation suggestions (expansion doc §18/§42). Rule-based and
// local — no network, no fake AI: after inserting certain widgets the editor
// offers the statistically obvious next step in a dismissible inline bar.
// Subtle, never modal, never blocking.

let ctx = null;
let bar = null;
let hideTimer = 0;
const dismissedSession = new Set();

const RULES = {
  heading: [
    { label: "Add paragraph", run: (c, afterId) => c.insertAfterBlock(afterId, "paragraph") },
    { label: "Add button", run: (c, afterId) => c.insertAfterBlock(afterId, "button") },
  ],
  paragraph: [
    { label: "Add heading", run: (c, afterId) => c.insertAfterBlock(afterId, "heading") },
    { label: "Add image", run: (c, afterId) => c.insertAfterBlock(afterId, "image") },
  ],
  image: [
    { label: "Add caption text", run: (c, afterId) => c.insertAfterBlock(afterId, "paragraph") },
    { label: "Wrap in columns", run: (c, afterId) => c.wrapIn(afterId, "columns") },
  ],
  button: [
    { label: "Add paragraph", run: (c, afterId) => c.insertAfterBlock(afterId, "paragraph") },
  ],
  grid: [
    { label: "Add card", run: (c, afterId) => c.appendTo(afterId, "card") },
  ],
  columns: [
    {
      label: "Add text to first column",
      run: (c, afterId) => {
        const node = c.editor.document.getNode(afterId);
        const firstCol = node?.children?.[0];
        if (!firstCol) throw new Error("Columns have no column yet");
        c.insertWidgetAt("paragraph", { parentId: firstCol, index: 0 });
      },
    },
  ],
  hero: [
    { label: "Add content section", run: (c, afterId) => c.insertAfterBlock(afterId, "container") },
  ],
  faq: [
    { label: "Add question", run: (c, afterId) => c.faqAddItem(afterId) },
  ],
};

export function initSuggest(shared) {
  ctx = shared;
}

export function suggestionsFor(type, afterId) {
  if (dismissedSession.has(`${type}:never`)) return [];
  return (RULES[type] || []).map((s) => ({ ...s, afterId }));
}

export function showFor(type, afterId) {
  hide();
  const items = suggestionsFor(type, afterId);
  if (items.length === 0) return;
  const canvas = ctx.canvas();
  bar = document.createElement("div");
  bar.className = "acrx-suggest-bar";
  bar.setAttribute("role", "status");
  bar.innerHTML = `<span class="acrx-suggest-label">Next:</span>` +
    items.map((s, i) => `<button type="button" class="acrx-suggest-btn" data-suggest="${i}">${s.label}</button>`).join("") +
    `<button type="button" class="acrx-suggest-dismiss" aria-label="Dismiss suggestions">×</button>`;
  canvas.parentElement?.appendChild(bar);
  bar.querySelectorAll("[data-suggest]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = items[Number(btn.getAttribute("data-suggest"))];
      hide();
      try {
        s.run(ctx, s.afterId);
      } catch (err) {
        ctx.toast(err.message || "Suggestion failed", "error");
      }
    });
  });
  bar.querySelector(".acrx-suggest-dismiss")?.addEventListener("click", hide);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 10000);
}

export function hide() {
  clearTimeout(hideTimer);
  bar?.remove();
  bar = null;
}

export default { initSuggest, showFor, hide, suggestionsFor };
