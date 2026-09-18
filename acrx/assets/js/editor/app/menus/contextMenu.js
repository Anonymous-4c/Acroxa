// acrx/assets/js/editor/app/menus/contextMenu.js
//
// One floating menu builder for canvas block menus and layer menus.
// Capability-aware items, keyboard navigable, closes on outside click,
// Escape or scroll. No permanent chrome — contextual only.

let ctx = null;
let menuEl = null;

export function initContextMenu(shared) {
  ctx = shared;
  document.addEventListener("click", (event) => {
    if (menuEl && !menuEl.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuEl) close();
    if (menuEl && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
    }
  }, true);
  window.addEventListener("scroll", () => close(), true);
  window.addEventListener("resize", () => close());
}

function moveFocus(delta) {
  const items = [...menuEl.querySelectorAll(".ctx-item:not(:disabled)")];
  if (items.length === 0) return;
  const idx = items.indexOf(document.activeElement);
  const next = items[(idx + delta + items.length) % items.length];
  next.focus();
}

export function close() {
  menuEl?.remove();
  menuEl = null;
}

export function isOpen() {
  return !!menuEl;
}

// items: [{ id, label, icon?, danger?, disabled?, hint? }]
// onPick(id) executes the action.
export function open(items, x, y, onPick) {
  close();
  menuEl = document.createElement("div");
  menuEl.className = "acrx-context-menu";
  menuEl.setAttribute("role", "menu");
  menuEl.innerHTML = items.map((item) =>
    item.separator
      ? `<div class="ctx-separator"></div>`
      : `<button type="button" class="ctx-item${item.danger ? " is-danger" : ""}" role="menuitem" data-ctx-id="${item.id}"${item.disabled ? " disabled" : ""}>` +
        (item.icon ? `<i class="fa-duotone fa-${item.icon}"></i>` : "") +
        `<span>${item.label}</span>` +
        (item.hint ? `<kbd>${item.hint}</kbd>` : "") + `</button>`
  ).join("");
  document.body.appendChild(menuEl);
  const rect = menuEl.getBoundingClientRect();
  menuEl.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menuEl.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
  menuEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-ctx-id]");
    if (!btn || btn.disabled) return;
    const id = btn.getAttribute("data-ctx-id");
    close();
    onPick(id);
  });
  menuEl.querySelector(".ctx-item:not(:disabled)")?.focus();
}

export function blockMenuItems(block) {
  if (!block) return [];
  const locked = !!block.locked;
  return [
    { id: "select", label: "Select", icon: "arrow-pointer" },
    { id: "duplicate", label: "Duplicate", icon: "clone", hint: "Ctrl+Shift+D", disabled: locked },
    { id: "copy", label: "Copy", icon: "copy" },
    { id: "cut", label: "Cut", icon: "scissors", disabled: locked },
    { id: "paste", label: "Paste after", icon: "paste" },
    { separator: true },
    { id: "moveUp", label: "Move up", icon: "arrow-up", disabled: locked },
    { id: "moveDown", label: "Move down", icon: "arrow-down", disabled: locked },
    { id: "lock", label: locked ? "Unlock" : "Lock", icon: locked ? "lock-keyhole-open" : "lock" },
    { id: "hide", label: block.hidden ? "Show" : "Hide", icon: block.hidden ? "eye" : "eye-slash" },
    { separator: true },
    { id: "settings", label: "Block settings", icon: "cog" },
    { id: "delete", label: "Delete", icon: "trash", danger: true, disabled: locked },
  ];
}

export default { initContextMenu, open, close, isOpen, blockMenuItems };
