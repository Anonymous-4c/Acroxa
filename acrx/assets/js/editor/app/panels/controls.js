// acrx/assets/js/editor/app/panels/controls.js
//
// Reusable editor controls on the Acroxa design tokens. The custom dropdown
// (button + popover, full keyboard support) replaces every native <select>
// in editor UI: native pickers cannot render consistently across themes and
// clip inside sidebars. No new dependencies; no parallel component system.

export function createDropdown(opts = {}) {
  const options = Array.isArray(opts.options) ? opts.options : [];
  const onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};
  let value = opts.value;
  let open = false;
  let activeIndex = Math.max(0, options.findIndex((o) => String(o.value ?? o) === String(value)));
  let typeBuffer = "";
  let typeTimer = 0;

  const root = document.createElement("div");
  root.className = "acrx-select";
  const label = currentLabel();
  root.innerHTML =
    `<button type="button" class="acrx-select-trigger" aria-haspopup="listbox" aria-expanded="false"${opts.ariaLabel ? ` aria-label="${escapeHtml(opts.ariaLabel)}"` : ""}>` +
    `<span class="acrx-select-value">${escapeHtml(label)}</span>` +
    `<i class="fa-duotone fa-chevron-down acrx-select-chevron"></i></button>` +
    `<div class="acrx-select-pop" role="listbox" hidden></div>`;
  const trigger = root.querySelector(".acrx-select-trigger");
  const pop = root.querySelector(".acrx-select-pop");

  function norm(opt) {
    return typeof opt === "object" && opt !== null
      ? { value: String(opt.value), label: String(opt.label ?? opt.value) }
      : { value: String(opt), label: String(opt) };
  }

  function currentLabel() {
    const found = options.map(norm).find((o) => o.value === String(value));
    if (found) return found.label;
    if (String(value ?? "") === "") return "Select…";
    return String(value ?? "");
  }

  function paint() {
    trigger.querySelector(".acrx-select-value").textContent = currentLabel();
    trigger.setAttribute("aria-expanded", String(open));
    pop.hidden = !open;
    if (!open) return;
    pop.innerHTML = options.map(norm).map((o, i) =>
      `<button type="button" class="acrx-select-option${o.value === String(value) ? " is-selected" : ""}${i === activeIndex ? " is-active" : ""}" ` +
      `role="option" aria-selected="${o.value === String(value)}" data-dd-index="${i}">${escapeHtml(o.label)}` +
      (o.value === String(value) ? `<i class="fa-duotone fa-check acrx-select-check"></i>` : "") + `</button>`
    ).join("");
    pop.querySelector(".acrx-select-option.is-active")?.scrollIntoView?.({ block: "nearest" });
  }

  function place() {
    const rect = trigger.getBoundingClientRect();
    const popH = Math.min(260, 34 * options.length + 8);
    const roomBelow = window.innerHeight - rect.bottom - 8;
    pop.style.position = "fixed";
    pop.style.minWidth = `${Math.max(rect.width, 140)}px`;
    pop.style.maxHeight = "260px";
    pop.style.left = `${Math.min(rect.left, window.innerWidth - Math.max(rect.width, 140) - 8)}px`;
    if (roomBelow >= Math.min(popH, 160)) {
      pop.style.top = `${rect.bottom + 4}px`;
      pop.style.bottom = "auto";
    } else {
      pop.style.top = "auto";
      pop.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    }
  }

  function setOpen(next) {
    open = next;
    if (open) {
      activeIndex = Math.max(0, options.map(norm).findIndex((o) => o.value === String(value)));
      paint();
      place();
    } else {
      paint();
    }
  }

  function commit(index) {
    const opt = options.map(norm)[index];
    if (!opt) return;
    value = opt.value;
    setOpen(false);
    trigger.focus({ preventScroll: true });
    paint();
    onChange(value);
  }

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!open);
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      if (!open) {
        event.preventDefault();
        setOpen(true);
      }
    }
  });

  pop.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-dd-index]");
    if (btn) commit(Number(btn.getAttribute("data-dd-index")));
  });

  pop.addEventListener("mousemove", (event) => {
    const btn = event.target.closest("[data-dd-index]");
    if (btn) {
      const i = Number(btn.getAttribute("data-dd-index"));
      if (i !== activeIndex) {
        activeIndex = i;
        paint();
      }
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (open && !root.contains(event.target)) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.focus({ preventScroll: true });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const n = options.length;
      activeIndex = (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + n) % n;
      paint();
    } else if (event.key === "Home") {
      event.preventDefault();
      activeIndex = 0;
      paint();
    } else if (event.key === "End") {
      event.preventDefault();
      activeIndex = options.length - 1;
      paint();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key.length === 1) {
      clearTimeout(typeTimer);
      typeBuffer += event.key.toLowerCase();
      typeTimer = setTimeout(() => { typeBuffer = ""; }, 500);
      const idx = options.map(norm).findIndex((o) => o.label.toLowerCase().startsWith(typeBuffer));
      if (idx >= 0) {
        activeIndex = idx;
        paint();
      }
    }
  });

  window.addEventListener("resize", () => { if (open) place(); });

  paint();

  return {
    el: root,
    getValue: () => value,
    setValue(next, silent) {
      value = next;
      activeIndex = Math.max(0, options.map(norm).findIndex((o) => o.value === String(value)));
      paint();
      if (!silent) onChange(value);
    },
    destroy() {
      root.remove();
    },
  };
}

// Hydrate declarative mounts: <div data-dd-mount data-dd-key="…" …>
// Reads options from data-dd-options (JSON) and wires onPick callback.
export function hydrateDropdowns(root, onPick) {
  root.querySelectorAll("[data-dd-mount]").forEach((mount) => {
    if (mount.getAttribute("data-dd-ready") === "1") return;
    mount.setAttribute("data-dd-ready", "1");
    let options = [];
    try {
      options = JSON.parse(mount.getAttribute("data-dd-options") || "[]");
    } catch { options = []; }
    const key = mount.getAttribute("data-dd-key") || "";
    const control = mount.getAttribute("data-dd-control") || "select";
    const label = mount.getAttribute("data-dd-label") || "";
    const dd = createDropdown({
      value: mount.getAttribute("data-dd-value") ?? "",
      options,
      ariaLabel: label,
      onChange: (value) => onPick(key, value, control, mount),
    });
    dd.el.setAttribute("data-dd-key", key);
    mount.replaceWith(dd.el);
  });
}

export function dropdownMountHTML({ key, value, options, control = "select", label = "" }) {
  return `<div data-dd-mount data-dd-key="${escapeHtml(key)}" data-dd-value="${escapeHtml(value ?? "")}" ` +
    `data-dd-control="${escapeHtml(control)}" data-dd-label="${escapeHtml(label)}" ` +
    `data-dd-options='${escapeHtml(JSON.stringify(options || []))}'></div>`;
}

// Framework toggle switch (framework.js Toggle contract): a real checkbox
// input in framework clothes. Data attributes ride on the input itself, so
// panel handlers that read input.checked / type === "checkbox" keep working
// unchanged. Styling comes from ad-st.css + ad-ed.css — never duplicated.
let toggleSeq = 0;
export function toggleHTML({ id, label = "", checked = false, disabled = false, attrs = "" }) {
  const tid = id || `acrx-toggle-${++toggleSeq}-${Date.now().toString(36)}`;
  return `<div class="toggle-field form-toggle">` +
    `<label class="toggle-wrap" for="${escapeHtml(tid)}">` +
    `<input type="checkbox" id="${escapeHtml(tid)}" class="toggle-input"${checked ? " checked" : ""}${disabled ? " disabled" : ""}${attrs ? ` ${attrs}` : ""}>` +
    `<span class="toggle-track"><span class="toggle-thumb"></span></span>` +
    (label ? `<span class="toggle-label">${escapeHtml(label)}</span>` : "") +
    `</label></div>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default { createDropdown, hydrateDropdowns, dropdownMountHTML, toggleHTML };
