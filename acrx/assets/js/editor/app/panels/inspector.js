// acrx/assets/js/editor/app/panels/inspector.js
//
// Block inspector on #sidebar-right-panel-settings. Schema-driven from the
// catalog: sections/fields render per selected-block capabilities, never a
// universal form. Responsive-aware style keys edit the active device
// breakpoint; everything commits through controller mutations (undoable).

import { CATALOG_BY_TYPE, settingValue, inspectorSections, RESPONSIVE_ATTR_KEYS, inlinePlainText as plainInline } from "../core/model.js";
import { hydrateDropdowns, dropdownMountHTML, toggleHTML } from "./controls.js";

let ctx = null;
let panel = null;
let device = "desktop";
let openSections = new Set(["Content", "Layout"]);

export function initInspector(shared) {
  ctx = shared;
  panel = document.getElementById("sidebar-right-panel-settings");
  if (!panel) return;
  panel.addEventListener("input", onInput);
  panel.addEventListener("change", onInput);
  panel.addEventListener("click", onClick);
}

function onInput(event) {
  if (commitListField(event.target)) return;
  if (commitSpacingField(event.target)) return;
  if (commitKeyValueField(event.target)) return;
  const field = event.target.closest("[data-field-key]");
  if (!field || !panelBlockId()) return;
  const key = field.getAttribute("data-field-key");
  const control = field.getAttribute("data-control");
  if (control === "media" || control === "media-list") return; // handled via picker buttons
  if (control === "icon") {
    const preview = field.parentElement?.querySelector("[data-icon-preview]");
    if (preview) preview.innerHTML = `<i class="fa-duotone fa-${field.value.trim().replace(/[^a-z0-9-]/gi, "") || "circle"}"></i>`;
  }
  commitField(key, readControl(field, control), control);
}

// Linked 4-side spacing inputs commit individual style keys.
function commitSpacingField(target) {
  const input = target.closest ? target.closest("[data-spacing-key]") : null;
  if (!input || !panelBlockId()) return false;
  const key = input.getAttribute("data-spacing-key");
  const group = input.closest("[data-spacing]");
  const linked = group && group.getAttribute("data-linked") === "1";
  if (linked) {
    const mode = group.getAttribute("data-spacing");
    const prefix = mode === "margin" ? "margin" : "padding";
    const value = input.value;
    group.querySelectorAll("[data-spacing-key]").forEach((el) => { el.value = value; });
    const id = panelBlockId();
    clearTimeout(commitTimer);
    pendingBatch = {
      id,
      patch: {
        [prefix + "Top"]: value, [prefix + "Right"]: value,
        [prefix + "Bottom"]: value, [prefix + "Left"]: value,
      },
    };
    commitTimer = setTimeout(flushBatch, 600);
    return true;
  }
  commitField(key, input.value, "text");
  return true;
}

// Data-attribute key/value rows commit as one object.
function commitKeyValueField(target) {
  if (!panelBlockId()) return false;
  const row = target.closest ? target.closest(".insp-kv") : null;
  if (!row) return false;
  if (!target.matches("[data-kv-key],[data-kv-value]")) return false;
  const obj = {};
  row.querySelectorAll(".insp-kv-row").forEach((r) => {
    const k = r.querySelector("[data-kv-key]")?.value.trim() || "";
    const v = r.querySelector("[data-kv-value]")?.value || "";
    if (/^[a-zA-Z][\w.-]*$/.test(k)) obj[k] = v;
  });
  commitField("dataAttrs", obj, "keyvalue");
  return true;
}

// Compound list editors (FAQ items, pricing plans) commit as one value.
function commitListField(target) {
  if (!panelBlockId()) return false;
  if (target.closest("[data-list-item]")) {
    // Items are inline-model arrays (P0-02): show plain text, and keep the
    // stored nodes of items whose text the user did not touch (marks kept).
    const prev = ctx.getBlock(panelBlockId())?.data?.items || [];
    const items = [...panel.querySelectorAll("[data-list-item]")].map((el, i) => {
      const text = el.value;
      const was = prev[i];
      if (Array.isArray(was) && plainInline(was) === text) return was;
      if (typeof was === "string" && was === text) return was;
      return text === "" ? [] : [{ type: "text", text, marks: [] }];
    });
    commitField("items", items, "textarea");
    return true;
  }
  if (target.closest("[data-stat-value]") || target.closest("[data-stat-label]")) {
    const stats = [...panel.querySelectorAll(".insp-stats .insp-plan")].map((row, i) => {
      const prev = ctx.getBlock(panelBlockId())?.data?.stats?.[i] || {};
      return {
        id: prev.id || `stat_${i}`,
        value: row.querySelector("[data-stat-value]")?.value || "",
        label: row.querySelector("[data-stat-label]")?.value || "",
      };
    });
    commitField("stats", stats, "textarea");
    return true;
  }
  if (target.closest("[data-faq-q]") || target.closest("[data-faq-a]")) {
    const items = [...panel.querySelectorAll(".insp-faq-item")].map((row) => ({
      q: row.querySelector("[data-faq-q]")?.value || "",
      a: row.querySelector("[data-faq-a]")?.value || "",
    }));
    commitField("items", items, "textarea");
    return true;
  }
  if (target.closest("[data-tab-label]") || target.closest("[data-tab-content]")) {
    const tabs = [...panel.querySelectorAll(".insp-faq-item")].map((row, i) => {
      const prev = ctx.getBlock(panelBlockId())?.data?.tabs?.[i] || {};
      return {
        id: prev.id || `tab_${i}`,
        label: row.querySelector("[data-tab-label]")?.value || "",
        content: row.querySelector("[data-tab-content]")?.value || "",
      };
    });
    commitField("tabs", tabs, "textarea");
    return true;
  }
  if (target.closest("[data-ev-date]") || target.closest("[data-ev-title]") || target.closest("[data-ev-text]")) {
    const events = [...panel.querySelectorAll(".insp-faq-item")].map((row, i) => {
      const prev = ctx.getBlock(panelBlockId())?.data?.events?.[i] || {};
      return {
        id: prev.id || `ev_${i}`,
        date: row.querySelector("[data-ev-date]")?.value || "",
        title: row.querySelector("[data-ev-title]")?.value || "",
        text: row.querySelector("[data-ev-text]")?.value || "",
      };
    });
    commitField("events", events, "textarea");
    return true;
  }
  if (target.closest("[data-feat-icon]") || target.closest("[data-feat-title]") || target.closest("[data-feat-text]")) {
    const features = [...panel.querySelectorAll(".insp-faq-item")].map((row, i) => {
      const prev = ctx.getBlock(panelBlockId())?.data?.features?.[i] || {};
      return {
        id: prev.id || `feat_${i}`,
        icon: row.querySelector("[data-feat-icon]")?.value.trim() || "star",
        title: row.querySelector("[data-feat-title]")?.value || "",
        text: row.querySelector("[data-feat-text]")?.value || "",
      };
    });
    commitField("features", features, "textarea");
    return true;
  }
  if (target.closest("[data-plan-name]") || target.closest("[data-plan-price]") || target.closest("[data-plan-features]") || target.closest("[data-plan-period]") || target.closest("[data-plan-cta]") || target.closest("[data-plan-highlight]")) {
    const plans = [...panel.querySelectorAll(".insp-plan")].map((row) => ({
      name: row.querySelector("[data-plan-name]")?.value || "",
      price: row.querySelector("[data-plan-price]")?.value || "",
      period: row.querySelector("[data-plan-period]")?.value || "",
      features: (row.querySelector("[data-plan-features]")?.value || "").split("\n").map((s) => s.trim()).filter(Boolean),
      ctaText: row.querySelector("[data-plan-cta]")?.value || "",
      highlight: row.querySelector("[data-plan-highlight]")?.checked === true,
    }));
    commitField("plans", plans, "textarea");
    return true;
  }
  return false;
}

function onClick(event) {
  const picker = event.target.closest("[data-media-pick]");
  if (picker) {
    ctx.pickMediaFor(panelBlockId(), picker.getAttribute("data-media-pick"), picker.getAttribute("data-media-kind") || "image");
    return;
  }
  const sectionHead = event.target.closest("[data-section-toggle]");
  if (sectionHead) {
    event.preventDefault(); // explicit state owns the toggle (native would double-flip)
    const name = sectionHead.getAttribute("data-section-toggle");
    openSections.has(name) ? openSections.delete(name) : openSections.add(name);
    refresh();
    return;
  }
  const deviceBtn = event.target.closest("[data-device]");
  if (deviceBtn) {
    device = deviceBtn.getAttribute("data-device");
    refresh();
    return;
  }
  const reset = event.target.closest("[data-action='reset-block']");
  if (reset && panelBlockId()) {
    ctx.resetBlock(panelBlockId());
    return;
  }
  const faqAdd = event.target.closest("[data-faq-add]");
  if (faqAdd && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const items = [...(block.data.items || []), { q: "", a: "" }];
    ctx.setBlockData(panelBlockId(), { items }, { record: true, label: "Add FAQ item" });
    return;
  }
  const tabAdd = event.target.closest("[data-tab-add]");
  if (tabAdd && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const tabs = [...(block.data.tabs || []), { id: `tab_${Date.now().toString(36)}`, label: "", content: "" }];
    ctx.setBlockData(panelBlockId(), { tabs }, { record: true, label: "Add tab" });
    return;
  }
  const evAdd = event.target.closest("[data-ev-add]");
  if (evAdd && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const events = [...(block.data.events || []), { id: `ev_${Date.now().toString(36)}`, date: "", title: "", text: "" }];
    ctx.setBlockData(panelBlockId(), { events }, { record: true, label: "Add event" });
    return;
  }
  const featAdd = event.target.closest("[data-feat-add]");
  if (featAdd && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const features = [...(block.data.features || []), { id: `feat_${Date.now().toString(36)}`, icon: "star", title: "", text: "" }];
    ctx.setBlockData(panelBlockId(), { features }, { record: true, label: "Add feature" });
    return;
  }
  const planAdd = event.target.closest("[data-plan-add]");
  if (planAdd && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const plans = [...(block.data.plans || []), { name: "", price: "", features: [] }];
    ctx.setBlockData(panelBlockId(), { plans }, { record: true, label: "Add plan" });
    return;
  }
  const mediaRemove = event.target.closest("[data-media-remove]");
  if (mediaRemove && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const images = [...(block.data.images || [])];
    images.splice(Number(mediaRemove.getAttribute("data-media-remove")), 1);
    ctx.setBlockData(panelBlockId(), { images }, { record: true, label: "Remove image" });
    return;
  }
  const addRow = event.target.closest("[data-table-add-row]");
  if (addRow && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const rows = [...(block.data.rows || [[]])];
    const cols = rows[0]?.length || 1;
    rows.push(Array(cols).fill(""));
    ctx.setBlockData(panelBlockId(), { rows }, { record: true, label: "Add table row" });
    return;
  }
  const addCol = event.target.closest("[data-table-add-col]");
  if (addCol && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const rows = (block.data.rows || [[]]).map((r) => [...r, ""]);
    ctx.setBlockData(panelBlockId(), { rows }, { record: true, label: "Add table column" });
    return;
  }
  const listAdd = event.target.closest("[data-list-add]");
  if (listAdd && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    ctx.setBlockData(panelBlockId(), { items: [...(block.data.items || []), ""] }, { record: true, label: "Add list item" });
    return;
  }
  const listRemove = event.target.closest("[data-list-remove]");
  if (listRemove && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const items = [...(block.data.items || [])];
    items.splice(Number(listRemove.getAttribute("data-list-remove")), 1);
    ctx.setBlockData(panelBlockId(), { items: items.length > 0 ? items : [""] }, { record: true, label: "Remove list item" });
    return;
  }
  const statAdd = event.target.closest("[data-stat-add]");
  if (statAdd && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const stats = [...(block.data.stats || []), { id: `stat_${Date.now().toString(36)}`, value: "", label: "" }];
    ctx.setBlockData(panelBlockId(), { stats }, { record: true, label: "Add stat" });
    return;
  }
  const statRemove = event.target.closest("[data-stat-remove]");
  if (statRemove && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const stats = [...(block.data.stats || [])];
    stats.splice(Number(statRemove.getAttribute("data-stat-remove")), 1);
    ctx.setBlockData(panelBlockId(), { stats: stats.length > 0 ? stats : [{ id: "stat_a", value: "", label: "" }] }, { record: true, label: "Remove stat" });
    return;
  }
  const seg = event.target.closest(".insp-seg");
  if (seg && panelBlockId()) {
    commitField(seg.getAttribute("data-field-key"), seg.getAttribute("data-value"), "segmented");
    return;
  }
  const linkBtn = event.target.closest("[data-spacing-link]");
  if (linkBtn) {
    const group = linkBtn.closest("[data-spacing]");
    const on = group.getAttribute("data-linked") === "1";
    group.setAttribute("data-linked", on ? "0" : "1");
    linkBtn.classList.toggle("is-linked", !on);
    return;
  }
  const kvAdd = event.target.closest("[data-kv-add]");
  if (kvAdd && panelBlockId()) {
    const host = kvAdd.parentElement;
    const row = document.createElement("div");
    row.className = "insp-kv-row";
    row.innerHTML = `<input type="text" class="insp-input" data-kv-key value="" placeholder="key">` +
      `<input type="text" class="insp-input" data-kv-value value="" placeholder="value">` +
      `<button type="button" class="axed-btn axed-icon axed-xs" data-kv-remove aria-label="Remove">×</button>`;
    host.insertBefore(row, kvAdd);
    row.querySelector("[data-kv-key]").focus();
    return;
  }
  const kvRemove = event.target.closest("[data-kv-remove]");
  if (kvRemove && panelBlockId()) {
    const kv = kvRemove.closest(".insp-kv");
    kvRemove.closest(".insp-kv-row")?.remove();
    // Recommit remaining rows.
    const obj = {};
    kv.querySelectorAll(".insp-kv-row").forEach((r) => {
      const k = r.querySelector("[data-kv-key]")?.value.trim() || "";
      const v = r.querySelector("[data-kv-value]")?.value || "";
      if (/^[a-zA-Z][\w.-]*$/.test(k)) obj[k] = v;
    });
    ctx.setInspectorValue(panelBlockId(), "dataAttrs", obj, device);
    return;
  }
  const faqRemove = event.target.closest("[data-faq-remove]");
  if (faqRemove && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const items = [...(block.data.items || [])];
    items.splice(Number(faqRemove.getAttribute("data-faq-remove")), 1);
    ctx.setBlockData(panelBlockId(), { items }, { record: true, label: "Remove FAQ item" });
    return;
  }
  const tabRemove = event.target.closest("[data-tab-remove]");
  if (tabRemove && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const tabs = [...(block.data.tabs || [])];
    tabs.splice(Number(tabRemove.getAttribute("data-tab-remove")), 1);
    ctx.setBlockData(panelBlockId(), { tabs: tabs.length > 0 ? tabs : [{ id: "tab_a", label: "", content: "" }] }, { record: true, label: "Remove tab" });
    return;
  }
  const evRemove = event.target.closest("[data-ev-remove]");
  if (evRemove && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const events = [...(block.data.events || [])];
    events.splice(Number(evRemove.getAttribute("data-ev-remove")), 1);
    ctx.setBlockData(panelBlockId(), { events: events.length > 0 ? events : [{ id: "ev_a", date: "", title: "", text: "" }] }, { record: true, label: "Remove event" });
    return;
  }
  const featRemove = event.target.closest("[data-feat-remove]");
  if (featRemove && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const features = [...(block.data.features || [])];
    features.splice(Number(featRemove.getAttribute("data-feat-remove")), 1);
    ctx.setBlockData(panelBlockId(), { features: features.length > 0 ? features : [{ id: "feat_a", icon: "star", title: "", text: "" }] }, { record: true, label: "Remove feature" });
    return;
  }
  const planRemove = event.target.closest("[data-plan-remove]");
  if (planRemove && panelBlockId()) {
    const block = ctx.getBlock(panelBlockId());
    const plans = [...(block.data.plans || [])];
    plans.splice(Number(planRemove.getAttribute("data-plan-remove")), 1);
    ctx.setBlockData(panelBlockId(), { plans }, { record: true, label: "Remove plan" });
    return;
  }
}

function readControl(field, control) {
  if (control === "toggle") return field.checked;
  if (control === "number") return field.value === "" ? "" : Number(field.value);
  if (control === "segmented") return field.getAttribute("data-value");
  return field.value;
}

let commitTimer = 0;
let pendingCommit = null;
let pendingBatch = null;
function commitField(key, value, control) {
  const id = panelBlockId();
  if (!id) return;
  // Toggles/segmented/selects commit immediately; text-ish controls debounce
  // into a single undo step (color pickers included — no history spam).
  const instant = control === "toggle" || control === "segmented" || control === "select";
  pendingCommit = { id, key, value };
  clearTimeout(commitTimer);
  if (instant) {
    flushCommit();
    return;
  }
  commitTimer = setTimeout(flushCommit, 600);
}

function flushCommit() {
  if (pendingBatch) {
    const { id, patch } = pendingBatch;
    pendingBatch = null;
    ctx.setInspectorStyleBatch(id, patch, device, "Spacing");
    return;
  }
  if (!pendingCommit) return;
  const { id, key, value } = pendingCommit;
  pendingCommit = null;
  ctx.setInspectorValue(id, key, value, device);
}

function panelBlockId() {
  return panel ? panel.getAttribute("data-block-id") : null;
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function controlHTML(block, field) {
  const key = field.key;
  const value = settingValue(block, key, field.control === "toggle" ? false : "");
  const common = `data-field-key="${esc(key)}" data-control="${field.control}" aria-label="${esc(field.label)}"`;
  switch (field.control) {
    case "text":
      return `<input type="text" class="insp-input" ${common} value="${esc(value)}" placeholder="">`;
    case "textarea":
      return `<textarea class="insp-textarea" ${common} rows="3">${esc(value)}</textarea>`;
    case "number":
      return `<input type="number" class="insp-input insp-number" ${common} value="${esc(value)}"${field.min !== undefined ? ` min="${field.min}"` : ""}${field.max !== undefined ? ` max="${field.max}"` : ""}>`;
    case "select":
      return dropdownMountHTML({ key, value: String(value ?? ""), options: field.options || [], control: "select", label: field.label });
    case "color":
      return `<span class="insp-color-wrap"><input type="color" class="insp-color" ${common} value="${/^#([0-9a-f]{6})$/i.test(value) ? value : "#000000"}">` +
        `<input type="text" class="insp-input insp-color-hex" ${common} value="${esc(value)}" placeholder="#000000"></span>`;
    case "toggle":
      return toggleHTML({ checked: !!value, attrs: `${common}` });
    case "segmented": {
      const opts = field.options || [];
      const optVal = (o) => (o && typeof o === "object" ? String(o.value) : String(o));
      const optLabel = (o) => (o && typeof o === "object" ? String(o.label ?? o.value) : String(o));
      const current = field.key === "level" ? String(block.data?.level ?? value) : String(value ?? optVal(opts[0]) ?? "");
      return `<div class="insp-segmented" role="group" aria-label="${esc(field.label)}">` + opts.map((o) =>
        `<button type="button" class="insp-seg${optVal(o) === current ? " is-active" : ""}" data-field-key="${esc(key)}" data-control="segmented" data-value="${esc(optVal(o))}">${esc(optLabel(o))}</button>`).join("") + `</div>`;
    }
    case "spacing": {
      const mode = field.mode || "margin";
      const prefix = mode === "margin" ? "styles.margin" : "styles.padding";
      const sides = [["Top", "Top"], ["Right", "Right"], ["Bottom", "Bottom"], ["Left", "Left"]];
      return `<div class="insp-spacing" data-spacing="${mode}">` +
        `<button type="button" class="insp-link-btn" data-spacing-link="${mode}" data-title="Link all sides" aria-label="Link all sides"><i class="fa-duotone fa-link"></i></button>` +
        sides.map(([label, side]) => {
          const v = settingValue(block, prefix + side, "");
          return `<label class="insp-spacing-side"><span>${label[0]}</span>` +
            `<input type="text" class="insp-input" data-spacing-key="${prefix + side}" value="${esc(v)}" placeholder="0" aria-label="${esc(mode + " " + label.toLowerCase())}"></label>`;
        }).join("") + `</div>`;
    }
    case "css":
      return `<textarea class="insp-textarea insp-code" ${common} rows="4" spellcheck="false" placeholder="border: 2px dashed red">${esc(value)}</textarea>`;
    case "icon":
      return `<span class="insp-icon-wrap"><span class="insp-icon-preview" data-icon-preview><i class="fa-duotone fa-${esc(String(value || "circle").trim().replace(/[^a-z0-9-]/gi, "") || "circle")}"></i></span>` +
        `<input type="text" class="insp-input" ${common} value="${esc(value)}" placeholder="arrow-right"></span>`;
    case "keyvalue": {
      const entries = Object.entries(value && typeof value === "object" ? value : {});
      return `<div class="insp-kv">` + entries.map(([k, v]) =>
        `<div class="insp-kv-row"><input type="text" class="insp-input" data-kv-key value="${esc(k)}" placeholder="key">` +
        `<input type="text" class="insp-input" data-kv-value value="${esc(v)}" placeholder="value">` +
        `<button type="button" class="axed-btn axed-icon axed-xs" data-kv-remove aria-label="Remove">×</button></div>`).join("") +
        `<button type="button" class="axed-btn" data-kv-add><i class="fa-duotone fa-plus"></i> Add</button></div>`;
    }
    case "media":
      return `<div class="insp-media"><button type="button" class="axed-btn insp-media-btn" data-media-pick="${esc(key)}" data-media-kind="${esc(field.media || "image")}">` +
        (value ? `<img src="${esc(value)}" alt="">` : `<i class="fa-duotone fa-image"></i><span>Choose</span>`) + `</button>` +
        (value ? `<button type="button" class="axed-btn axed-icon" data-media-pick="${esc(key)}" data-media-kind="${esc(field.media || "image")}" data-repick="1" aria-label="Replace"><i class="fa-duotone fa-rotate"></i></button>` : "") + `</div>`;
    case "media-list": {
      const list = Array.isArray(value) ? value : [];
      return `<div class="insp-media-list">` + list.map((src, i) =>
        `<span class="insp-media-thumb"><img src="${esc(typeof src === "string" ? src : src.url)}" alt=""><button type="button" data-media-remove="${i}" aria-label="Remove image">×</button></span>`).join("") +
        `<button type="button" class="axed-btn" data-media-pick="${esc(key)}" data-media-kind="${esc(field.media || "image")}" data-multiple="1"><i class="fa-duotone fa-plus"></i> Add</button></div>`;
    }
    case "faq-items": {
      const items = Array.isArray(value) ? value : [];
      return `<div class="insp-faq">` + items.map((item, i) =>
        `<div class="insp-faq-item"><div class="insp-faq-head"><span>Item ${i + 1}</span><button type="button" class="axed-btn axed-icon axed-xs" data-faq-remove="${i}" aria-label="Remove item">×</button></div>` +
        `<input type="text" class="insp-input" data-faq-q="${i}" value="${esc(item.q || "")}" placeholder="Question">` +
        `<textarea class="insp-textarea" data-faq-a="${i}" rows="2" placeholder="Answer">${esc(item.a || "")}</textarea></div>`).join("") +
        `<button type="button" class="axed-btn" data-faq-add><i class="fa-duotone fa-plus"></i> Add item</button></div>`;
    }
    case "pricing-plans": {
      const plans = Array.isArray(value) ? value : [];
      return `<div class="insp-plans">` + plans.map((plan, i) =>
        `<div class="insp-plan"><div class="insp-faq-head"><span>Plan ${i + 1}</span><button type="button" class="axed-btn axed-icon axed-xs" data-plan-remove="${i}" aria-label="Remove plan">×</button></div>` +
        `<input type="text" class="insp-input" data-plan-name="${i}" value="${esc(plan.name || "")}" placeholder="Plan name">` +
        `<input type="text" class="insp-input" data-plan-price="${i}" value="${esc(plan.price || "")}" placeholder="Price">` +
        `<input type="text" class="insp-input" data-plan-period="${i}" value="${esc(plan.period || "")}" placeholder="Period, e.g. /mo">` +
        `<textarea class="insp-textarea" data-plan-features="${i}" rows="2" placeholder="One feature per line">${esc((plan.features || []).join("\n"))}</textarea>` +
        `<input type="text" class="insp-input" data-plan-cta="${i}" value="${esc(plan.ctaText || "")}" placeholder="Button label">` +
        toggleHTML({ label: "Highlighted", checked: !!plan.highlight, attrs: `data-plan-highlight="${i}"` }) + `</div>`).join("") +
        `<button type="button" class="axed-btn" data-plan-add><i class="fa-duotone fa-plus"></i> Add plan</button></div>`;
    }
    case "tabs-items": {
      const tabs = Array.isArray(value) ? value : [];
      return `<div class="insp-faq">` + tabs.map((t, i) =>
        `<div class="insp-faq-item"><div class="insp-faq-head"><span>Tab ${i + 1}</span><button type="button" class="axed-btn axed-icon axed-xs" data-tab-remove="${i}" aria-label="Remove tab">×</button></div>` +
        `<input type="text" class="insp-input" data-tab-label="${i}" value="${esc(t.label || "")}" placeholder="Tab label">` +
        `<textarea class="insp-textarea" data-tab-content="${i}" rows="2" placeholder="Panel content">${esc(t.content || "")}</textarea></div>`).join("") +
        `<button type="button" class="axed-btn" data-tab-add><i class="fa-duotone fa-plus"></i> Add tab</button></div>`;
    }
    case "timeline-items": {
      const events = Array.isArray(value) ? value : [];
      return `<div class="insp-faq">` + events.map((ev, i) =>
        `<div class="insp-faq-item"><div class="insp-faq-head"><span>Event ${i + 1}</span><button type="button" class="axed-btn axed-icon axed-xs" data-ev-remove="${i}" aria-label="Remove event">×</button></div>` +
        `<input type="text" class="insp-input" data-ev-date="${i}" value="${esc(ev.date || "")}" placeholder="Date or year">` +
        `<input type="text" class="insp-input" data-ev-title="${i}" value="${esc(ev.title || "")}" placeholder="Title">` +
        `<textarea class="insp-textarea" data-ev-text="${i}" rows="2" placeholder="Description">${esc(ev.text || "")}</textarea></div>`).join("") +
        `<button type="button" class="axed-btn" data-ev-add><i class="fa-duotone fa-plus"></i> Add event</button></div>`;
    }
    case "feature-items": {
      const features = Array.isArray(value) ? value : [];
      return `<div class="insp-faq">` + features.map((f, i) =>
        `<div class="insp-faq-item"><div class="insp-faq-head"><span>Feature ${i + 1}</span><button type="button" class="axed-btn axed-icon axed-xs" data-feat-remove="${i}" aria-label="Remove feature">×</button></div>` +
        `<input type="text" class="insp-input" data-feat-icon="${i}" value="${esc(f.icon || "")}" placeholder="Icon, e.g. star">` +
        `<input type="text" class="insp-input" data-feat-title="${i}" value="${esc(f.title || "")}" placeholder="Title">` +
        `<textarea class="insp-textarea" data-feat-text="${i}" rows="2" placeholder="Description">${esc(f.text || "")}</textarea></div>`).join("") +
        `<button type="button" class="axed-btn" data-feat-add><i class="fa-duotone fa-plus"></i> Add feature</button></div>`;
    }
    case "table-editor": {
      const rows = Array.isArray(value) ? value : [];
      return `<div class="insp-table"><div class="insp-hint">Edit cells directly in the canvas. Structure:</div>` +
        `<div class="insp-table-actions"><button type="button" class="axed-btn" data-table-add-row>Add row</button>` +
        `<button type="button" class="axed-btn" data-table-add-col>Add column</button></div>` +
        `<span class="insp-static">${rows.length} × ${rows[0]?.length || 0}</span></div>`;
    }
    case "list-items": {
      const items = Array.isArray(value) ? value : [];
      return `<div class="insp-list">` + items.map((item, i) =>
        `<div class="insp-kv-row"><span class="insp-static">${i + 1}.</span>` +
        `<input type="text" class="insp-input" data-list-item="${i}" value="${esc(plainInline(item))}" placeholder="Item text">` +
        `<button type="button" class="axed-btn axed-icon axed-xs" data-list-remove="${i}" aria-label="Remove item">×</button></div>`).join("") +
        `<button type="button" class="axed-btn" data-list-add><i class="fa-duotone fa-plus"></i> Add item</button></div>`;
    }
    case "stats-items": {
      const stats = Array.isArray(value) ? value : [];
      return `<div class="insp-stats">` + stats.map((s, i) =>
        `<div class="insp-plan"><div class="insp-faq-head"><span>Stat ${i + 1}</span><button type="button" class="axed-btn axed-icon axed-xs" data-stat-remove="${i}" aria-label="Remove stat">×</button></div>` +
        `<input type="text" class="insp-input" data-stat-value="${i}" value="${esc(s.value || "")}" placeholder="Value, e.g. 99%">` +
        `<input type="text" class="insp-input" data-stat-label="${i}" value="${esc(s.label || "")}" placeholder="Label"></div>`).join("") +
        `<button type="button" class="axed-btn" data-stat-add><i class="fa-duotone fa-plus"></i> Add stat</button></div>`;
    }
    default:
      return `<input type="text" class="insp-input" ${common} value="${esc(value)}">`;
  }
}

function captureFocus() {
  const active = document.activeElement;
  if (!active || !panel.contains(active)) return null;
  const attr = (name) => active.getAttribute(name);
  const snap = { start: active.selectionStart ?? null, end: active.selectionEnd ?? null };
  if (attr("data-field-key")) return { ...snap, find: () => panel.querySelector(`[data-field-key="${CSS.escape(attr("data-field-key"))}"]`) };
  const dd = active.closest ? active.closest(".acrx-select") : null;
  const ddKey = dd?.getAttribute("data-dd-key");
  if (ddKey) return { ...snap, start: null, end: null, find: () => panel.querySelector(`.acrx-select[data-dd-key="${CSS.escape(ddKey)}"] .acrx-select-trigger`) };
  if (attr("data-faq-q") !== null) return { ...snap, find: () => panel.querySelector(`[data-faq-q="${attr("data-faq-q")}"]`) };
  if (attr("data-faq-a") !== null) return { ...snap, find: () => panel.querySelector(`[data-faq-a="${attr("data-faq-a")}"]`) };
  if (attr("data-plan-name") !== null) return { ...snap, find: () => panel.querySelector(`[data-plan-name="${attr("data-plan-name")}"]`) };
  if (attr("data-plan-price") !== null) return { ...snap, find: () => panel.querySelector(`[data-plan-price="${attr("data-plan-price")}"]`) };
  if (attr("data-plan-features") !== null) return { ...snap, find: () => panel.querySelector(`[data-plan-features="${attr("data-plan-features")}"]`) };
  if (attr("data-tab-label") !== null) return { ...snap, find: () => panel.querySelector(`[data-tab-label="${attr("data-tab-label")}"]`) };
  if (attr("data-tab-content") !== null) return { ...snap, find: () => panel.querySelector(`[data-tab-content="${attr("data-tab-content")}"]`) };
  if (attr("data-ev-title") !== null) return { ...snap, find: () => panel.querySelector(`[data-ev-title="${attr("data-ev-title")}"]`) };
  if (attr("data-feat-title") !== null) return { ...snap, find: () => panel.querySelector(`[data-feat-title="${attr("data-feat-title")}"]`) };
  return null;
}

function restoreFocus(snap) {
  if (!snap) return;
  const el = snap.find ? snap.find() : null;
  if (!el) return;
  el.focus({ preventScroll: true });
  try {
    if (snap.start !== null && el.setSelectionRange) el.setSelectionRange(snap.start, snap.end ?? snap.start);
  } catch { /* non-text controls */ }
}

export function refresh() {
  if (!panel || !ctx) return;
  const focus = captureFocus();
  const id = ctx.currentBlockId();
  const block = id ? ctx.getBlock(id) : null;
  if (!block) {
    panel.removeAttribute("data-block-id");
    panel.innerHTML =
      `<div class="insp-empty"><i class="fa-duotone fa-cube"></i>` +
      `<p class="insp-empty-title">No block selected</p>` +
      `<p class="insp-empty-text">Select any block in the canvas or Layers to edit its settings here.</p></div>`;
    return;
  }
  panel.setAttribute("data-block-id", block.id);
  const def = CATALOG_BY_TYPE[block.type];
  if (!def) {
    panel.innerHTML = `<div class="insp-empty"><p class="insp-empty-title">Unknown block type</p></div>`;
    return;
  }
  const sections = inspectorSections(block).map((section) => {
    const open = openSections.has(section.section);
    const fields = section.fields.map((field) => {
      const responsiveNote = (field.key.startsWith("styles.") || RESPONSIVE_ATTR_KEYS.has(field.key))
        ? `<span class="insp-device-note">${deviceLabel()}</span>` : "";
      return `<div class="insp-field"><label class="insp-label">${esc(field.label)}${responsiveNote}</label>` +
        controlHTML(block, field) +
        (field.help ? `<span class="insp-help">${esc(field.help)}</span>` : "") + `</div>`;
    }).join("");
    return `<details class="insp-section"${open ? " open" : ""} data-section="${esc(section.section)}">` +
      `<summary class="insp-section-head" data-section-toggle="${esc(section.section)}">${esc(section.section)}</summary>` +
      `<div class="insp-section-body">${fields}</div></details>`;
  }).join("");

  panel.innerHTML =
    `<div class="insp-head"><span class="insp-head-icon"><i class="fa-duotone fa-${def.icon}"></i></span>` +
    `<span class="insp-head-text"><span class="insp-head-title">${esc(def.label)}</span>` +
    `<span class="insp-head-id">${esc(block.id)}</span></span>` +
    `<button type="button" class="axed-btn axed-icon" data-action="reset-block" data-title="Reset to defaults"><i class="fa-duotone fa-rotate-left"></i></button></div>` +
    `<div class="insp-devices" role="group" aria-label="Editing breakpoint">` +
    ["desktop", "tablet", "mobile"].map((d) =>
      `<button type="button" class="insp-device${d === device ? " is-active" : ""}" data-device="${d}"><i class="fa-duotone fa-${d === "desktop" ? "display" : d === "tablet" ? "tablet" : "mobile"}"></i>${d}</button>`).join("") +
    `</div>` + sections;

  // <details> natively toggles; keep openSections in sync for re-renders.
  panel.querySelectorAll("details.insp-section").forEach((details) => {
    details.addEventListener("toggle", () => {
      const name = details.getAttribute("data-section");
      details.open ? openSections.add(name) : openSections.delete(name);
    });
  });
  hydrateDropdowns(panel, (key, value, control) => commitField(key, value, control));
  restoreFocus(focus);
}

function deviceLabel() {
  return device === "desktop" ? "" : ` · ${device}`;
}

export function currentDevice() {
  return device;
}

export default { initInspector, refresh, currentDevice };
