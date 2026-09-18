// acrx/assets/js/editor/app/panels/datetime.js
//
// Acroxa custom date/time picker on the design tokens. Replaces the native
// `<input type="datetime-local">` in editor UI: calendar grid with month/year
// navigation, hour/minute + AM/PM (or 24-hour per locale), full keyboard
// support, Escape/outside-click dismissal, min/max/disabled dates, clear,
// and proper focus management.
//
// Canonical value: local "YYYY-MM-DDTHH:mm" (or ""). No timezone conversion
// ever happens — the stored string is wall-clock time, exactly what the
// existing post model persists, so no TZ bugs are introduced.

const PAD = (n) => String(n).padStart(2, "0");

// ─── Pure helpers (no DOM; unit-tested) ──────────────────────────────

export function isValidParts(y, m, day, h, min) {
  if (![y, m, day, h, min].every((n) => Number.isInteger(n))) return false;
  if (m < 1 || m > 12 || day < 1 || day > 31 || h < 0 || h > 23 || min < 0 || min > 59) return false;
  return day <= daysInMonth(y, m);
}

export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

// Parse canonical local value -> { y, m, d, h, min } | null.
export function parseLocal(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ""));
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0)];
  return isValidParts(...parts)
    ? { y: parts[0], m: parts[1], d: parts[2], h: parts[3], min: parts[4] }
    : null;
}

export function toLocalValue(y, m, d, h = 0, min = 0) {
  if (!isValidParts(y, m, d, h, min)) return "";
  return `${y}-${PAD(m)}-${PAD(d)}T${PAD(h)}:${PAD(min)}`;
}

export function toDayValue(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return "";
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return "";
  return `${y}-${PAD(m)}-${PAD(d)}`;
}

// Monday-first grid cells for a month view: [{ y, m, d, outside }].
export function monthGrid(y, m) {
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const cells = [];
  const start = new Date(y, m - 1, 1 - lead);
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      y: dt.getFullYear(),
      m: dt.getMonth() + 1,
      d: dt.getDate(),
      outside: dt.getMonth() !== m - 1,
    });
  }
  // Trim to 5 rows when the month fits (keeps the popover compact).
  return cells[35] && cells.slice(35).every((c) => c.outside) ? cells.slice(0, 35) : cells;
}

export function shiftMonth(y, m, delta) {
  const dt = new Date(y, m - 1 + delta, 1);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1 };
}

export function formatDisplay(value, hour12 = prefersHour12()) {
  const p = parseLocal(value);
  if (!p) return "";
  const dt = new Date(p.y, p.m - 1, p.d, p.h, p.min);
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      hour12,
    }).format(dt);
  } catch {
    return String(value).replace("T", " ");
  }
}

export function prefersHour12() {
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    return resolved.hour12 ?? true;
  } catch {
    return true;
  }
}

export function inRange(dayValue, minDay, maxDay) {
  if (minDay && dayValue < minDay) return false;
  if (maxDay && dayValue > maxDay) return false;
  return true;
}

// ─── Control (DOM) ───────────────────────────────────────────────────

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function datetimeMountHTML({ key, value, label = "", min = "", max = "" }) {
  return `<div data-dt-mount data-dt-key="${esc(key)}" data-dt-value="${esc(value ?? "")}" ` +
    `data-dt-label="${esc(label)}" data-dt-min="${esc(min)}" data-dt-max="${esc(max)}"></div>`;
}

export function hydrateDatetimes(root, onPick) {
  root.querySelectorAll("[data-dt-mount]").forEach((mount) => {
    if (mount.getAttribute("data-dt-ready") === "1") return;
    mount.setAttribute("data-dt-ready", "1");
    const control = createDatetime({
      key: mount.getAttribute("data-dt-key") || "",
      value: mount.getAttribute("data-dt-value") ?? "",
      label: mount.getAttribute("data-dt-label") || "",
      min: mount.getAttribute("data-dt-min") || "",
      max: mount.getAttribute("data-dt-max") || "",
      onChange: (value) => onPick(mount.getAttribute("data-dt-key") || "", value),
    });
    mount.replaceWith(control.el);
  });
}

export function createDatetime(opts = {}) {
  const key = opts.key || "";
  const label = opts.label || "Date and time";
  const minDay = (opts.min || "").slice(0, 10) || "";
  const maxDay = (opts.max || "").slice(0, 10) || "";
  const hour12 = prefersHour12();
  const onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};
  let value = opts.value || "";
  let view = { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
  const parsed = parseLocal(value);
  if (parsed) view = { y: parsed.y, m: parsed.m };
  let pop = null;
  let teardown = null;

  const root = document.createElement("div");
  root.className = "acrx-dt";
  root.innerHTML =
    `<button type="button" class="acrx-select-trigger acrx-dt-trigger" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(label)}">` +
    `<i class="fa-duotone fa-calendar-days acrx-dt-icon"></i>` +
    `<span class="acrx-select-value acrx-dt-value"></span>` +
    `<i class="fa-duotone fa-chevron-down acrx-select-chevron"></i></button>`;

  const trigger = root.querySelector(".acrx-dt-trigger");
  const valueEl = root.querySelector(".acrx-dt-value");

  function paintTrigger() {
    const display = formatDisplay(value, hour12);
    valueEl.textContent = display || "Select date & time";
    valueEl.classList.toggle("is-placeholder", !display);
    trigger.setAttribute("aria-expanded", pop ? "true" : "false");
  }

  function commit(next, { closeAfter = false } = {}) {
    value = next;
    paintTrigger();
    onChange(value);
    if (pop) paintPop();
    if (closeAfter) close();
  }

  function setTime(h, min) {
    const p = parseLocal(value) || { y: view.y, m: view.m, d: Math.min(new Date().getDate(), daysInMonth(view.y, view.m)), h: 0, min: 0 };
    commit(toLocalValue(p.y, p.m, p.d, h, min));
  }

  function pickDay(cell) {
    const day = toDayValue(cell.y, cell.m, cell.d);
    if (!inRange(day, minDay, maxDay)) return;
    const p = parseLocal(value);
    const h = p ? p.h : 9;
    const min = p ? p.min : 0;
    view = { y: cell.y, m: cell.m };
    commit(toLocalValue(cell.y, cell.m, cell.d, h, min));
  }

  function paintPop() {
    if (!pop) return;
    const p = parseLocal(value);
    const today = new Date();
    const todayDay = toDayValue(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const cells = monthGrid(view.y, view.m);
    const years = [];
    for (let y = view.y - 12; y <= view.y + 12; y++) years.push(y);

    const hour = p ? p.h : 9;
    const minute = p ? p.min : 0;
    const displayHour = hour12 ? ((hour + 11) % 12) + 1 : hour;
    const ampm = hour < 12 ? "AM" : "PM";

    pop.innerHTML =
      `<div class="acrx-dt-head">` +
      `<button type="button" class="acrx-dt-nav" data-dt-nav="-1" aria-label="Previous month"><i class="fa-duotone fa-chevron-left"></i></button>` +
      `<button type="button" class="acrx-dt-month" data-dt-today aria-label="Go to current month">${MONTH_NAMES[view.m - 1]} ${view.y}</button>` +
      `<button type="button" class="acrx-dt-nav" data-dt-nav="1" aria-label="Next month"><i class="fa-duotone fa-chevron-right"></i></button>` +
      `</div>` +
      `<div class="acrx-dt-ym">` +
      `<select class="insp-input acrx-dt-select" data-dt-month aria-label="Month">` +
      MONTH_NAMES.map((n, i) => `<option value="${i + 1}"${i + 1 === view.m ? " selected" : ""}>${n}</option>`).join("") +
      `</select>` +
      `<select class="insp-input acrx-dt-select" data-dt-year aria-label="Year">` +
      years.map((y) => `<option value="${y}"${y === view.y ? " selected" : ""}>${y}</option>`).join("") +
      `</select></div>` +
      `<div class="acrx-dt-week">${WEEKDAYS.map((w) => `<span>${w}</span>`).join("")}</div>` +
      `<div class="acrx-dt-grid" role="grid" aria-label="${MONTH_NAMES[view.m - 1]} ${view.y}">` +
      cells.map((c) => {
        const day = toDayValue(c.y, c.m, c.d);
        const selected = p && p.y === c.y && p.m === c.m && p.d === c.d;
        const disabled = !inRange(day, minDay, maxDay);
        return `<button type="button" role="gridcell" class="acrx-dt-day${c.outside ? " is-outside" : ""}` +
          `${selected ? " is-selected" : ""}${day === todayDay ? " is-today" : ""}" ` +
          `data-dt-day="${day}"${disabled ? " disabled" : ""} tabindex="${selected || (!p && day === todayDay) ? "0" : "-1"}" ` +
          `aria-selected="${selected ? "true" : "false"}" aria-label="${day}">${c.d}</button>`;
      }).join("") + `</div>` +
      `<div class="acrx-dt-time">` +
      `<i class="fa-duotone fa-clock acrx-dt-icon"></i>` +
      `<input type="number" class="insp-input acrx-dt-num" data-dt-hour min="${hour12 ? 1 : 0}" max="${hour12 ? 12 : 23}" value="${displayHour}" aria-label="Hour">` +
      `<span class="acrx-dt-colon">:</span>` +
      `<input type="number" class="insp-input acrx-dt-num" data-dt-minute min="0" max="59" value="${PAD(minute)}" aria-label="Minute">` +
      (hour12
        ? `<div class="insp-segmented acrx-dt-ampm" role="group" aria-label="AM or PM">` +
          `<button type="button" class="insp-seg${ampm === "AM" ? " is-active" : ""}" data-dt-ampm="AM">AM</button>` +
          `<button type="button" class="insp-seg${ampm === "PM" ? " is-active" : ""}" data-dt-ampm="PM">PM</button></div>`
        : "") +
      `</div>` +
      `<div class="acrx-dt-foot">` +
      `<button type="button" class="axed-btn" data-dt-clear>Clear</button>` +
      `<button type="button" class="axed-btn axed-primary" data-dt-done>Done</button>` +
      `</div>`;
  }

  function place() {
    const rect = trigger.getBoundingClientRect();
    pop.style.position = "fixed";
    pop.style.zIndex = "var(--z-dropdown)";
    const W = 288;
    pop.style.width = `${W}px`;
    pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - W - 8))}px`;
    const below = rect.bottom + 6;
    const estH = 430;
    pop.style.top = below + estH <= window.innerHeight
      ? `${below}px`
      : `${Math.max(8, rect.top - estH - 6)}px`;
  }

  function open() {
    if (pop) return;
    const p = parseLocal(value);
    if (p) view = { y: p.y, m: p.m };
    pop = document.createElement("div");
    pop.className = "acrx-dt-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", label);
    document.body.appendChild(pop);
    paintPop();
    place();
    paintTrigger();
    // Pop listeners die with the node; document/window listeners are torn
    // down explicitly (no AbortSignal dependency — keeps jsdom and older
    // browsers working alongside modern ones).
    const onDocPointer = (event) => {
      if (pop && !pop.contains(event.target) && !root.contains(event.target)) close();
    };
    const onResize = () => { if (pop) place(); };
    document.addEventListener("pointerdown", onDocPointer);
    window.addEventListener("resize", onResize);
    teardown = () => {
      document.removeEventListener("pointerdown", onDocPointer);
      window.removeEventListener("resize", onResize);
      teardown = null;
    };

    pop.addEventListener("click", (event) => {
      const nav = event.target.closest("[data-dt-nav]");
      if (nav) { view = shiftMonth(view.y, view.m, Number(nav.getAttribute("data-dt-nav"))); paintPop(); return; }
      if (event.target.closest("[data-dt-today]")) {
        const t = new Date();
        view = { y: t.getFullYear(), m: t.getMonth() + 1 };
        paintPop();
        pop.querySelector(".acrx-dt-day.is-today")?.focus();
        return;
      }
      const day = event.target.closest("[data-dt-day]");
      if (day && !day.disabled) { pickDay(dayToCell(day.getAttribute("data-dt-day"))); return; }
      const ampm = event.target.closest("[data-dt-ampm]");
      if (ampm) {
        const p0 = parseLocal(value) || { y: view.y, m: view.m, d: 1, h: 9, min: 0 };
        let h = p0.h % 12;
        if (ampm.getAttribute("data-dt-ampm") === "PM") h += 12;
        setTime(h, p0.min);
        return;
      }
      if (event.target.closest("[data-dt-clear]")) { commit(""); return; }
      if (event.target.closest("[data-dt-done]")) { close(true); return; }
    });

    pop.addEventListener("change", (event) => {
      if (event.target.matches("[data-dt-month]")) { view = { y: view.y, m: Number(event.target.value) }; paintPop(); return; }
      if (event.target.matches("[data-dt-year]")) { view = { y: Number(event.target.value), m: view.m }; paintPop(); return; }
      if (event.target.matches("[data-dt-hour]") || event.target.matches("[data-dt-minute]")) {
        let h = Number(pop.querySelector("[data-dt-hour]").value);
        let min = Math.min(59, Math.max(0, Number(pop.querySelector("[data-dt-minute]").value)));
        if (Number.isNaN(h) || Number.isNaN(min)) return;
        if (hour12) {
          h = h % 12;
          const active = pop.querySelector("[data-dt-ampm].is-active")?.getAttribute("data-dt-ampm");
          if (active === "PM") h += 12;
        } else {
          h = Math.min(23, Math.max(0, h));
        }
        setTime(h, min);
      }
    });

    pop.addEventListener("keydown", (event) => {
      const day = event.target.closest ? event.target.closest("[data-dt-day]") : null;
      if (day && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        if (event.key === "Enter" || event.key === " ") { pickDay(dayToCell(day.getAttribute("data-dt-day"))); return; }
        const days = [...pop.querySelectorAll("[data-dt-day]:not(:disabled)")];
        const idx = days.indexOf(day);
        const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -7 : 7;
        const next = days[idx + delta];
        if (next) {
          next.focus();
        } else if (Math.abs(delta) === 7 || true) {
          // Crossing a month boundary: shift the view and focus the same weekday.
          const [y, m] = day.getAttribute("data-dt-day").split("-").map(Number);
          const dt = new Date(y, m - 1, Number(day.textContent) + delta);
          view = { y: dt.getFullYear(), m: dt.getMonth() + 1 };
          paintPop();
          pop.querySelector(`[data-dt-day="${toDayValue(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())}"]`)?.focus();
        }
        return;
      }
      if (event.key === "Escape") { event.preventDefault(); close(true); }
      else if (event.key === "Enter" && event.target.matches("[data-dt-hour],[data-dt-minute]")) { close(true); }
    });

    const focusTarget = pop.querySelector(".acrx-dt-day.is-selected") || pop.querySelector(".acrx-dt-day.is-today") || pop.querySelector("[data-dt-nav]");
    focusTarget?.focus({ preventScroll: true });
  }

  function dayToCell(dayValue) {
    const [y, m, d] = dayValue.split("-").map(Number);
    return { y, m, d };
  }

  function close(refocus = false) {
    if (!pop) return;
    if (teardown) teardown();
    pop.remove();
    pop = null;
    paintTrigger();
    if (refocus) trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (pop) close();
    else open();
  });

  trigger.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " " || event.key === "ArrowDown") && !pop) {
      event.preventDefault();
      open();
    }
  });

  paintTrigger();

  return {
    el: root,
    getValue: () => value,
    setValue(next, silent) {
      value = next || "";
      paintTrigger();
      if (pop) paintPop();
      if (!silent) onChange(value);
    },
    destroy() {
      close();
      root.remove();
    },
  };
}

export default { createDatetime, hydrateDatetimes, datetimeMountHTML, parseLocal, toLocalValue, toDayValue, monthGrid, shiftMonth, formatDisplay, prefersHour12, inRange, isValidParts, daysInMonth };
