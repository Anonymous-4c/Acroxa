// acrx/assets/js/editor/app/core/controller.js
//
// EditorController: boots the runtime + UI modules, owns the shared ctx
// facade, serializes mutations through transactions+history, and keeps
// canvas/panels/footer/stores synchronized. The runtime engines own data;
// State stores mirror it for reactive UI; the DOM renders it.

import { initStores, getEditor, syncFromEditor, updateCounts, State } from "./store.js";
import {
  BLOCK_CATALOG, CATALOG_BY_TYPE, TEXT_TYPES, CONTAINER_TYPES,
  createBlockData, fromEngineNode, toEngineNode, snapshotToBlueprint,
  blueprintToNodes, inlineToText, blockText, withSetting, RESPONSIVE_ATTR_KEYS,
  normalizeInline as normalizeInlineModel, inlinePlainText as inlinePlainModel,
} from "./model.js";
import { renderCanvas, renderExportHTML } from "../canvas/rendering.js";
import { initText, domToInline, handleInput, toggleMark as toggleMarkText, activeMarks as activeMarksText, setCaret, syncCanvasEmptyStates, syncEmptyState, normalizeEmptyEditable, tryInlinePaste } from "../canvas/text.js";
import { canApplyMark, normalizeUrl, classifyLink } from "../../engines/index.js";
import { initSelection, bindCanvasSelection, paintSelection } from "../canvas/selection-ui.js";
import { initKeyboard, bindKeyboard, focusEditable } from "../canvas/keyboard.js";
import { initCommands } from "./commands.js";
import { initSlashMenu, handleSlashTrigger, closeIfOpen as closeSlash } from "../menus/slashMenu.js";
import { initPalette, toggle as togglePaletteFn, close as closePalette, isOpen as paletteOpen } from "../menus/palette.js";
import { initToolbar, refresh as refreshToolbar } from "../panels/toolbar.js";
import { initBlockActions, refresh as refreshBlockActions } from "../panels/blockActions.js";
import { initLayers, refresh as refreshLayers, reveal as revealLayer } from "../panels/layers.js";
import { initInspector, refresh as refreshInspector } from "../panels/inspector.js";
import { initPostPanel, refresh as refreshPost } from "../panels/postPanel.js";
import { initSeoPanel, refresh as refreshSeo, refreshAnalysis } from "../panels/seoPanel.js";
import { initWidgets, refresh as refreshWidgets, setDbWidgets } from "../panels/widgets.js";
import { initPatterns, refresh as refreshPatterns, setPatterns, convertPattern, patternById, convertNode } from "../panels/patterns.js";
import { dbWidgetById } from "../panels/widgets.js";
import { initInsertion, insertBlock as insertBlockAt, insertAfter as insertAfterAt, insertPatternNodes } from "../canvas/insertion.js";
import { initDragDrop } from "../canvas/dragdrop.js";
import { initClipboard } from "../canvas/clipboard-ui.js";
import { initPersistence, loadInitial, saveSoon, saveNow, buildSavePayload } from "../services/persistence.js";
import { initResponsive, setDevice as setDeviceMode, deviceMode as getDeviceMode, apply as applyResponsive } from "../panels/responsive-ui.js";
import { initMedia, pickForBlock, pickForPost, pickForSeo } from "../panels/media-ui.js";
import { initCodeEditor, openCodeEditor, closeEditor as closeCodeEditor, isOpen as isCodeEditorOpen } from "../panels/codeEditor.js";
import { initAi, transformBlock as aiTransform, seoFill, altTextFor } from "../services/ai.js";
import { toast } from "../services/toasts.js";
import { initContextMenu, open as openMenu, close as closeMenu, isOpen as menuOpen, blockMenuItems } from "../menus/contextMenu.js";
import { initSuggest, showFor as showSuggestionsFor } from "../menus/suggest.js";
import { initTopbar } from "../panels/topbar.js";
import { initFooter, refreshBreadcrumbs, refreshStatus } from "../panels/footer.js";
import { initOnboarding, maybeShowOnboarding } from "../services/onboarding.js";

let editor = null;
let canvas = null;
let booted = false;
const skipIds = new Set();
let focusSnapshot = null;
let lastCtrlA = { id: null, at: 0 };

function widgetDefs() {
  return BLOCK_CATALOG.map((def) => ({
    type: def.type,
    category: def.category,
    label: def.label,
    icon: def.icon,
    description: def.description || "",
    version: 1,
    kind: def.capabilities.container ? "container" : def.capabilities.atomic ? "atomic" : "content",
    capabilities: {
      editable: !!def.capabilities.editable,
      draggable: def.capabilities.draggable !== false,
      resizable: false,
      nestable: !!def.capabilities.container,
      deletable: true,
      duplicable: def.capabilities.duplicable !== false,
    },
    allowedParents: def.type === "column" ? ["columns"] : [],
    allowedChildren: def.type === "columns" ? ["column"] : [],
    defaults: {},
    settingsSchema: null,
    renderer: "",
  }));
}

// ─── Mutation helper (mirrors the runtime path for custom operations) ──
function mutate(label, fn, meta = {}) {
  const selection = editor.engines.selection;
  const entry = editor.engines.transactions.run({ label, ...meta }, fn);
  entry.label = label;
  entry.meta = { ...(entry.meta || {}), selectionBefore: meta.selectionBefore || selection.serialize(), selectionAfter: selection.serialize() };
  editor.engines.history.record(entry);
  editor.engines.editorState.refreshHistory();
  return entry;
}

function engineDataPatch(id, patch) {
  // patch: blueprint-level { content?, attrs?, styles?, responsive?, locked?,
  // hidden?, customClasses?, customId?, customCSS?, tag?, ariaLabel?,
  // dataAttrs?, data? } or flat settings keys. Returns a complete engine-data
  // object for updateNode.
  const node = editor.document.getNode(id);
  if (!node) return null;
  const data = JSON.parse(JSON.stringify(node.data || {}));
  for (const [key, value] of Object.entries(patch)) {
    if (["content", "attrs", "styles", "responsive", "locked", "hidden", "customClasses", "customId", "customCSS", "tag", "ariaLabel", "dataAttrs", "customAttributes"].includes(key)) {
      data[key] = value;
    } else if (key === "data" && value && typeof value === "object") {
      data.settings = { ...(data.settings || {}), ...JSON.parse(JSON.stringify(value)) };
    } else {
      data.settings = data.settings || {};
      data.settings[key] = value;
    }
  }
  return data;
}

// ─── Lossless transform matrix (P0-07) ────────────────────────────────
// Types whose words live in `content[]` (marks included).
const CONTENT_CARRY_TYPES = new Set(["paragraph", "heading", "blockquote", "codeblock", "alert", "link", "testimonial"]);
const LIST_CARRY_TYPES = new Set(["bulletList", "orderedList"]);
// Widget text slots harvested (default-skipped, so pristine defaults never phantom-carry).
const WIDGET_TEXT_KEYS = ["title", "text", "description", "caption", "cite", "author", "role", "badge", "eyebrow", "subtitle", "buttonText", "secondaryText", "alt"];

function pushLines(out, value) {
  if (typeof value !== "string" || value === "") return;
  for (const l of value.split("\n")) if (l !== "") out.push(l);
}

// Pristine catalog defaults are not user words (e.g. link's "Link", list's
// "First item"): skip values untouched from defaults so transforms don't
// carry phantom text into targets that lack the slot.
function seedDefaults(type) {
  try {
    const def = CATALOG_BY_TYPE[type];
    const flat = def && typeof def.defaults === "function" ? def.defaults() : {};
    return flat || {};
  } catch { return {}; }
}
function isPristine(type, key, value) {
  const def = seedDefaults(type);
  if (!(key in def)) return false;
  try { return JSON.stringify(def[key]) === JSON.stringify(value); }
  catch { return false; }
}

// Every user word a block holds, as plain lines: `content[]` plus every
// settings surface (items, rows, widget text slots, structured collections).
// Pristine catalog defaults are skipped so untouched defaults (link's "Link",
// list's "First item") never phantom-duplicate into targets that lack the
// slot — while any user-edited value, including secondary text like alert
// titles or testimonial authors, is always carried.
function blockTextLines(block) {
  const lines = [];
  for (const n of block.content || []) {
    if (n?.type === "text" && n.text) pushLines(lines, String(n.text));
  }
  harvestSettingsLines(block.type, block.data || {}, lines);
  return lines;
}

// Settings-surface words only (no `content[]`): lets the carry keep marks on
// the fast path exactly when there is no secondary text to lose.
function blockSettingsLines(block) {
  const lines = [];
  harvestSettingsLines(block.type, block.data || {}, lines);
  return lines;
}

function harvestSettingsLines(type, d, lines) {
  if (Array.isArray(d.items) && !isPristine(type, "items", d.items)) {
    for (const item of d.items) {
      if (typeof item === "string") pushLines(lines, item);
      else if (Array.isArray(item)) pushLines(lines, inlinePlainModel(item));
      else if (item && typeof item === "object") { pushLines(lines, item.q); pushLines(lines, item.a); }
    }
  }
  if (Array.isArray(d.rows) && !isPristine(type, "rows", d.rows)) {
    for (const row of d.rows) {
      const cells = (Array.isArray(row) ? row : [row])
        .map((c) => (typeof c === "string" ? c : inlinePlainModel(c)))
        .map((c) => String(c ?? "")).filter((c) => c !== "");
      if (cells.length) lines.push(cells.join(" "));
    }
  }
  for (const key of WIDGET_TEXT_KEYS) {
    if (typeof d[key] === "string" && d[key] !== "" && !isPristine(type, key, d[key])) {
      pushLines(lines, d[key]);
    }
  }
  if (Array.isArray(d.plans)) {
    for (const p of d.plans) {
      if (!p || typeof p !== "object") continue;
      pushLines(lines, p.name); pushLines(lines, p.price); pushLines(lines, p.period);
      pushLines(lines, p.description); pushLines(lines, p.ctaText);
      if (Array.isArray(p.features)) for (const f of p.features) pushLines(lines, f);
    }
  }
  if (Array.isArray(d.tabs)) {
    for (const t of d.tabs) {
      if (!t || typeof t !== "object") continue;
      pushLines(lines, t.label); pushLines(lines, t.content);
    }
  }
  if (Array.isArray(d.stats)) {
    for (const s of d.stats) {
      if (!s || typeof s !== "object") continue;
      pushLines(lines, s.value); pushLines(lines, s.label);
    }
  }
  if (Array.isArray(d.events)) {
    for (const e of d.events) {
      if (!e || typeof e !== "object") continue;
      pushLines(lines, e.date); pushLines(lines, e.title); pushLines(lines, e.text);
    }
  }
  if (Array.isArray(d.features)) {
    for (const f of d.features) {
      if (!f || typeof f !== "object") continue;
      pushLines(lines, f.title); pushLines(lines, f.text);
    }
  }
  return lines;
}

// Carry every word of `block` into `base` (fresh createBlockData for the
// target type). Mutates base. Returns { ok:true }, or { ok:false, chars }
// (refuse: toast + no-op), or { ok:false, kids } (nested blocks stranded).
function carryTransformContent(block, newType, base) {
  const kids = block.children || [];
  if (kids.length > 0 && !CONTAINER_TYPES.has(newType)) {
    return { ok: false, kids: kids.length, chars: 0 };
  }
  const lines = blockTextLines(block);
  const chars = lines.join("\n").length;
  const textNodes = (block.content || []).filter((n) => n?.type === "text" && n.text);
  // Mark-preserving fast path only when content is the WHOLE story; any
  // secondary settings text (quote citation, alert title, link label…)
  // falls through to the plain-lines path so words win over formatting.
  const secondary = blockSettingsLines(block);
  if (secondary.length === 0 && CONTENT_CARRY_TYPES.has(block.type) && CONTENT_CARRY_TYPES.has(newType) && textNodes.length > 0) {
    base.content = textNodes.map((n) => ({ type: "text", text: n.text, marks: n.marks || [] }));
  } else if (CONTENT_CARRY_TYPES.has(newType)) {
    base.content = lines.length ? [{ type: "text", text: lines.join("\n"), marks: [] }] : [];
  } else if (LIST_CARRY_TYPES.has(newType)) {
    // List-to-list keeps the inline arrays (marks included); every other
    // source lands one line per item as fresh inline nodes.
    if (LIST_CARRY_TYPES.has(block.type) && Array.isArray(block.data.items) && block.data.items.length > 0) {
      base.settings.items = block.data.items.map((item) => normalizeInlineModel(item));
    } else {
      base.settings.items = lines.length
        ? lines.map((l) => [{ type: "text", text: l, marks: [] }])
        : [[]];
    }
  } else if (newType === "table") {
    base.settings.rows = lines.length
      ? lines.map((l) => [[{ type: "text", text: l, marks: [] }]])
      : [[[]]];
  } else if (newType === "button") {
    if (base.settings.text === undefined) return chars ? { ok: false, chars } : { ok: true };
    if (lines.length) base.settings.text = lines.join(" ");
  } else if (newType === "hero" || newType === "cta" || newType === "card") {
    // Fill title-like slots in order; homeless remainder folds into the last
    // slot with newlines (words stay visible) rather than dropping.
    const slots = ["title", "description", "subtitle", "caption", "text"].filter((k) => base.settings[k] !== undefined);
    if (!slots.length) return chars ? { ok: false, chars } : { ok: true };
    if (lines.length) base.settings[slots[0]] = lines[0];
    if (lines.length > 1) {
      const rest = lines.slice(1).join("\n");
      if (slots[1]) base.settings[slots[1]] = rest;
      else base.settings[slots[0]] = `${lines[0]}\n${rest}`;
    }
  } else if (newType === "image") {
    if (base.settings.caption === undefined) return chars ? { ok: false, chars } : { ok: true };
    if (lines.length) base.settings.caption = lines.join("\n");
  } else if (chars > 0) {
    return { ok: false, chars };
  }
  // Portable settings survive any successful transform.
  if (block.data?.level && newType === "heading") base.settings.level = block.data.level;
  if (typeof block.data?.href === "string" && block.data.href && base.settings.href !== undefined) {
    base.settings.href = block.data.href;
  }
  return { ok: true };
}

// Multi-block insertion in ONE transaction + ONE render + ONE history entry
// (P1-10/P1-26): paste/pattern drops of N blocks undo in a single step with
// no intermediate flashes. Caps at PASTE_BLOCK_CAP with a loud toast —
// never a silent truncation.
const PASTE_BLOCK_CAP = 500;
function insertNodesAfter(entries, anchorId, label) {
  const total = entries.length;
  if (total === 0) return null;
  const take = entries.slice(0, PASTE_BLOCK_CAP);
  const doc = editor.document;
  const anchor = anchorId ? doc.getNode(anchorId) : null;
  const parentId = anchor ? anchor.parentId || doc.rootId : doc.rootId;
  const siblings = parentId === doc.rootId ? ctx.topLevelOrder() : doc.childrenOf(parentId).map((c) => c.id);
  let index = anchor ? siblings.indexOf(anchorId) + 1 : siblings.length;
  if (index < 0) index = siblings.length;
  const ids = [];
  const types = [];
  mutate(label || "Insert blocks", (tx) => {
    for (const entry of take) {
      const def = CATALOG_BY_TYPE[entry.type];
      if (!def) continue;
      const node = ctx.editor.engines.blocks.createBlock(entry.type, { data: entry.data });
      tx.add({ op: "insert", args: { parentId, node, index: index++ } });
      ids.push(node.id);
      types.push(entry.type);
      // Declared shells (e.g. columns -> column children) travel atomically.
      const shells = typeof def.insertChildren === "function" ? def.insertChildren({}) : null;
      let shellIndex = 0;
      for (const shell of shells || []) {
        if (!shell?.type || !CATALOG_BY_TYPE[shell.type]) continue;
        const cnode = ctx.editor.engines.blocks.createBlock(shell.type, { data: shell.data });
        tx.add({ op: "insert", args: { parentId: node.id, node: cnode, index: shellIndex++ } });
      }
    }
  });
  const last = ids[ids.length - 1] || null;
  if (last) {
    ctx.afterStructuralChange({ select: last });
    const lastType = types[types.length - 1];
    if (CONTENT_CARRY_TYPES.has(lastType) || LIST_CARRY_TYPES.has(lastType)) {
      focusEditable(last, 0);
    }
  }
  if (total > PASTE_BLOCK_CAP) {
    toast(`Pasted ${PASTE_BLOCK_CAP} of ${total} blocks — the rest was truncated.`, "warning");
  } else if (ids.length > 0) {
    toast(`Pasted ${ids.length} block${ids.length === 1 ? "" : "s"}`, "success");
  }
  return last;
}

// ─── ctx facade ──────────────────────────────────────────────────────────
const ctx = {
  editor: null,
  toast: (msg, type) => toast(msg, type),
  canvas: () => canvas,
  isActive: () => booted && !!canvas && document.contains(canvas),

  getBlock(id) {
    if (!id) return null;
    const node = editor.document.getNode(id);
    return node ? fromEngineNode(node) : null;
  },

  topLevelOrder() {
    const doc = editor.document;
    return (doc.childrenOf(doc.rootId) || []).map((c) => c.id);
  },

  parentOf(id) {
    const node = id ? editor.document.getNode(id) : null;
    return node ? node.parentId || editor.document.rootId : editor.document.rootId;
  },

  indexOf(id) {
    const doc = editor.document;
    const node = id ? doc.getNode(id) : null;
    if (!node) return -1;
    const parentId = node.parentId || doc.rootId;
    const siblings = parentId === doc.rootId ? ctx.topLevelOrder() : doc.childrenOf(parentId).map((c) => c.id);
    return siblings.indexOf(id);
  },

  currentBlockId() {
    const sel = editor.engines.selection.get();
    if (sel.mode === "none") return null;
    return sel.anchorId;
  },

  multiSelectedIds() {
    const sel = editor.engines.selection.get();
    if (sel.mode === "blocks") return [...sel.blockIds];
    if (sel.mode !== "none" && sel.anchorId) return [sel.anchorId];
    return [];
  },

  isMulti() {
    return editor.engines.selection.get().mode === "blocks";
  },

  selectBlock(id, opts = {}) {
    if (!id || !editor.document.getNode(id)) return;
    editor.engines.selection.setCaret(id, 0);
    ctx.afterSelectionChange(opts.focus === false ? null : id);
    // The inspector follows canvas selection (panels track the active tab).
    if (!opts.keepPanel) ctx.showPanel("right", "block");
  },

  focusBlock(id, offset = 0) {
    if (!id || !editor.document.getNode(id)) return;
    focusEditable(id, offset);
  },

  toggleMultiSelect(id) {
    editor.engines.selection.toggleBlock(id);
    ctx.afterSelectionChange(null);
  },

  clearSelection() {
    editor.engines.selection.clear();
    ctx.afterSelectionChange(null);
  },

  afterSelectionChange(focusId) {
    syncFromEditor(true);
    paintSelection();
    refreshLayers();
    refreshInspector();
    refreshBlockActions();
    refreshToolbar();
    refreshBreadcrumbs();
    if (focusId) revealLayer(focusId);
  },

  afterStructuralChange(opts = {}) {
    syncFromEditor(true);
    ctx.render();
    refreshLayers();
    refreshInspector();
    refreshBlockActions();
    refreshToolbar();
    refreshBreadcrumbs();
    ctx.updateFooter();
    saveSoon();
    if (opts.select) ctx.selectBlock(opts.select, { focus: false });
    if (opts.focus) focusEditable(opts.focus, 0);
    if (opts.analyzeSeo) refreshAnalysis();
  },

  render() {
    if (!canvas) return;
    // Protect the live editable from rebuilds.
    skipIds.clear();
    const ae = document.activeElement;
    if (ae && ae.isContentEditable && canvas.contains(ae)) {
      const wrap = ae.closest(".block-wrap");
      const id = ae.getAttribute("data-block-id") || (wrap ? wrap.getAttribute("data-for-block-id") : null);
      if (id) skipIds.add(id);
    }
    const sel = editor.engines.selection;
    const selectedIds = new Set(sel.selectedBlockIds());
    const multiIds = sel.get().mode === "blocks" ? new Set(sel.get().blockIds) : new Set();
    renderCanvas(canvas, State.get("document"), {
      deviceMode: getDeviceMode(),
      selectedIds,
      multiIds,
      skipIds,
    });
    paintSelection();
    // Placeholders follow document state (render-time classes cover fresh
    // markup; this covers moved/live DOM the reconciler preserved).
    syncCanvasEmptyStates(canvas);
  },

  renderBlock() {
    ctx.render();
  },

  // Immediate State-mirror sync (recorded commits already sync; direct
  // engine calls from consoles/tests need an explicit sync point).
  sync() {
    syncFromEditor(true);
    return State.get("document");
  },

  setBlockData(id, patch, opts = {}) {
    if (!id || !editor.document.getNode(id)) return false;
    const data = engineDataPatch(id, patch);
    if (!data) return false;
    if (opts.record) {
      mutate(opts.label || "Edit block", (tx) => {
        tx.update(id, { data });
      });
    } else {
      editor.document.updateNode(id, { data });
    }
    if (opts.sync !== false) syncFromEditor(!!opts.record);
    if (opts.refresh !== false && !opts.light) {
      refreshLayers();
      refreshInspector();
      ctx.updateFooter();
      if (opts.record) saveSoon();
    } else if (opts.refresh !== false) {
      // Light path (typing): footer + counts only, panels keep their state.
      ctx.updateFooter();
      if (opts.record) saveSoon();
    }
    return true;
  },

  setBlockAttrs(id, attrs) {
    const block = ctx.getBlock(id);
    if (!block) return false;
    return ctx.setBlockData(id, { attrs: { ...(block.attrs || {}), ...attrs } }, { record: true, label: "Block alignment" });
  },

  setInspectorValue(id, key, value, device) {
    const block = ctx.getBlock(id);
    if (!block) return;
    if (key.startsWith("styles.") && device && device !== "desktop") {
      const prop = key.slice(7);
      const responsive = JSON.parse(JSON.stringify(block.responsive || { mobile: {}, tablet: {}, desktop: {} }));
      responsive[device] = responsive[device] || {};
      responsive[device].styles = { ...(responsive[device].styles || {}), [prop]: value };
      ctx.setBlockData(id, { responsive }, { record: true, label: "Style" });
      ctx.render();
      refreshInspector();
      return;
    }
    if (device && device !== "desktop" && RESPONSIVE_ATTR_KEYS.has(key)) {
      const responsive = JSON.parse(JSON.stringify(block.responsive || { mobile: {}, tablet: {}, desktop: {} }));
      responsive[device] = responsive[device] || {};
      responsive[device].attrs = { ...(responsive[device].attrs || {}), [key]: value };
      ctx.setBlockData(id, { responsive }, { record: true, label: "Responsive" });
      ctx.render();
      refreshInspector();
      return;
    }
    if (key === "level") {
      ctx.setBlockData(id, { level: Number(value) || 2 }, { record: true, label: "Heading level" });
      ctx.render();
      return;
    }
    if (key === "items" || key === "plans" || key === "rows" || key === "images" || key === "stats" || key === "tabs" || key === "events" || key === "features") {
      ctx.setBlockData(id, { [key]: value }, { record: true, label: "Content" });
      ctx.render();
      return;
    }
    if (key.startsWith("data-")) {
      ctx.setBlockData(id, { [key]: value }, { record: true, label: "Setting" });
      return;
    }
    const next = withSetting(block, key, value);
    const patch = {};
    if (JSON.stringify(next.attrs) !== JSON.stringify(block.attrs)) patch.attrs = next.attrs;
    if (JSON.stringify(next.styles) !== JSON.stringify(block.styles)) patch.styles = next.styles;
    if (JSON.stringify(next.data) !== JSON.stringify(block.data)) {
      patch.data = next.data;
    }
    for (const top of ["locked", "hidden", "customClasses", "customId", "customCSS", "tag", "ariaLabel", "dataAttrs"]) {
      if (JSON.stringify(next[top]) !== JSON.stringify(block[top])) patch[top] = next[top];
    }
    if (next.content !== block.content && JSON.stringify(next.content) !== JSON.stringify(block.content)) patch.content = next.content;
    ctx.setBlockData(id, patch, { record: true, label: "Setting" });
    ctx.render();
    refreshInspector();
  },

  // Batch style commit (linked spacing): one history entry for many keys.
  setInspectorStyleBatch(id, stylePatch, device, label = "Setting") {
    const block = ctx.getBlock(id);
    if (!block) return;
    if (device && device !== "desktop") {
      const responsive = JSON.parse(JSON.stringify(block.responsive || { mobile: {}, tablet: {}, desktop: {} }));
      responsive[device] = responsive[device] || {};
      responsive[device].styles = { ...(responsive[device].styles || {}), ...stylePatch };
      ctx.setBlockData(id, { responsive }, { record: true, label });
    } else {
      ctx.setBlockData(id, { styles: { ...(block.styles || {}), ...stylePatch } }, { record: true, label });
    }
    ctx.render();
    refreshInspector();
  },

  // ── Structural operations ──
  insertAtSelection(type) {
    return insertBlockAt(type, {});
  },

  insertAfterBlock(afterId, type) {
    return insertAfterAt(afterId, type, {});
  },

  insertWidgetAt(type, target) {
    if (!target) return insertBlockAt(type, {});
    return insertBlockAt(type, { parentId: target.parentId, index: target.index });
  },

  insertDbWidget(refId) {
    const widget = dbWidgetById(refId);
    if (!widget) {
      ctx.toast("Library widget not found", "error");
      return null;
    }
    // Real widget JSON converts to blocks when it carries a recognizable
    // tree; otherwise the payload is preserved in an unresolved block.
    const json = widget.content?.json ?? widget.content ?? null;
    const converted = [];
    if (json && typeof json === "object") {
      if (Array.isArray(json.nodes)) {
        for (const n of json.nodes) {
          const c = convertNode(n);
          if (c) converted.push(c);
        }
      } else if (json.type) {
        const c = convertNode(json);
        if (c) converted.push(c);
      } else if (json.blocks && typeof json.blocks === "object") {
        for (const b of Object.values(json.blocks)) {
          const c = convertNode({ type: b.type, ...(b.data || {}), children: [] });
          if (c) converted.push(c);
        }
      }
    }
    if (converted.length === 0) {
      converted.push({
        type: "unresolved",
        data: { originalType: widget.type || widget.slug || "widget", payload: { ref: widget.slug || refId } },
        children: [],
      });
      ctx.toast(`“${widget.name || widget.slug}” has no convertible content — kept as reference`, "info");
    }
    const afterId = ctx.currentBlockId();
    const ids = insertPatternNodes({ nodes: converted, total: converted.length, skipped: 0 }, afterId);
    try {
      fetch(`/acr/api/widgets/${encodeURIComponent(widget.slug || refId)}/usage`, { method: "POST" }).catch(() => {});
    } catch { /* usage tracking is best-effort */ }
    return ids[0] || null;
  },

  insertPattern(patternId) {
    const pattern = patternById(patternId);
    if (!pattern) {
      ctx.toast("Pattern not found", "error");
      return [];
    }
    return insertPatternNodes(convertPattern(pattern), ctx.currentBlockId());
  },

  saveSelectionAsPattern() {
    const ids = ctx.multiSelectedIds();
    if (ids.length === 0) {
      ctx.toast("Select blocks first, then save as pattern", "info");
      return;
    }
    const nodes = ids.map((id) => editor.document.getNode(id)).filter(Boolean);
    const json = JSON.stringify({ nodes }, null, 2);
    const done = (text) => ctx.toast(text, "success");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json).then(
        () => done("Pattern JSON copied — save it under Content → Patterns"),
        () => ctx.toast("Could not access clipboard", "error")
      );
    } else {
      ctx.toast("Clipboard unavailable in this browser", "error");
    }
  },

  deleteBlock(id, opts = {}) {
    id = id || ctx.currentBlockId();
    if (!id) return false;
    const block = ctx.getBlock(id);
    if (!block) return false;
    if (block.locked && !opts.force) {
      ctx.toast("Block is locked", "info");
      return false;
    }
    const order = ctx.topLevelOrder();
    const idx = order.indexOf(id);
    const res = editor.execute("removeBlock", { id });
    if (!res.ok) {
      ctx.toast(res.error?.message || "Cannot delete block", "error");
      return false;
    }
    if (!opts.silent) {
      ctx.afterStructuralChange({});
      ctx.toast("Block deleted — undo to restore", "success");
    }
    if (opts.focusPrev && idx > 0) {
      const prevId = ctx.topLevelOrder()[Math.max(0, idx - 1)];
      if (prevId) {
        ctx.selectBlock(prevId, { focus: false });
        focusEditable(prevId);
      }
    }
    return true;
  },

  duplicateBlock(id) {
    id = id || ctx.currentBlockId();
    if (!id) return null;
    const res = editor.execute("duplicateBlock", { id });
    if (!res.ok) {
      ctx.toast(res.error?.message || "Cannot duplicate block", "error");
      return null;
    }
    ctx.afterStructuralChange({ select: res.result.id });
    return res.result.id;
  },

  moveBlock(id, dir) {
    id = id || ctx.currentBlockId();
    if (!id) return false;
    const order = ctx.topLevelOrder();
    const idx = order.indexOf(id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= order.length) return false;
    const res = editor.execute("moveBlock", { id, newParentId: editor.document.rootId, index: to });
    if (!res.ok) {
      ctx.toast(res.error?.message || "Cannot move block", "error");
      return false;
    }
    ctx.afterStructuralChange({ select: id, focus: false });
    return true;
  },

  moveBlockTo(sourceId, target) {
    if (!sourceId || !target) return false;
    if (sourceId === target.parentId) return false;
    const res = editor.execute("moveBlock", { id: sourceId, newParentId: target.parentId, index: target.index });
    if (!res.ok) {
      ctx.toast(res.error?.message || "Cannot move here", "error");
      return false;
    }
    ctx.afterStructuralChange({ select: sourceId, focus: false });
    return true;
  },

  moveLayer(sourceId, targetId, position) {
    try {
      const descriptor = editor.engines.layers.moveDescriptor(editor.document, sourceId, targetId, position);
      return ctx.moveBlockTo(descriptor.nodeId, { parentId: descriptor.newParentId, index: descriptor.index });
    } catch (err) {
      ctx.toast(err.message || "Cannot move layer", "error");
      return false;
    }
  },

  // ─── Lossless transforms (P0-07) ─────────────────────────────────────
  // A transform must be lossless-or-refused: every word the source holds
  // lands in the target's text slot(s), or the transform refuses loudly
  // (toast + no-op) instead of silently dropping text.
  transformBlock(id, newType) {
    id = id || ctx.currentBlockId();
    if (!id) return false;
    const block = ctx.getBlock(id);
    if (!block || block.type === newType) return false;
    if (block.locked) {
      ctx.toast("Block is locked", "info");
      return false;
    }
    if (!CATALOG_BY_TYPE[newType]) {
      ctx.toast(`Unknown block type "${newType}"`, "error");
      return false;
    }
    const base = createBlockData(newType);
    // Lossless-or-refused: carry every word across, or toast + no-op (P0-07).
    const carried = carryTransformContent(block, newType, base);
    if (!carried.ok) {
      if (carried.kids) {
        ctx.toast(`Cannot convert: block holds ${carried.kids} nested block(s). Move them out first.`, "error");
      } else {
        ctx.toast(`Cannot convert to ${newType}: would drop ${carried.chars} character(s).`, "error");
      }
      return false;
    }
    mutate("Transform block", (tx) => {
      tx.replace(id, { ...toEngineNode(block), type: newType, data: base });
    });
    ctx.afterStructuralChange({ select: id, focus: false });
    return true;
  },

  toggleLock(id) {
    id = id || ctx.currentBlockId();
    if (!id) return;
    const block = ctx.getBlock(id);
    ctx.setBlockData(id, { locked: !block.locked }, { record: true, label: block.locked ? "Unlock block" : "Lock block" });
    ctx.afterStructuralChange({ select: id, focus: false });
  },

  toggleHide(id) {
    id = id || ctx.currentBlockId();
    if (!id) return;
    const block = ctx.getBlock(id);
    ctx.setBlockData(id, { hidden: !block.hidden }, { record: true, label: block.hidden ? "Show block" : "Hide block" });
    ctx.afterStructuralChange({ select: id, focus: false });
  },

  resetBlock(id) {
    const block = ctx.getBlock(id);
    if (!block) return;
    ctx.setBlockData(id, createBlockData(block.type), { record: true, label: "Reset block" });
    ctx.afterStructuralChange({ select: id, focus: false });
  },

  // ── Text editing pipeline ──
  commitEditable(id, editable, recorded) {
    if (!id || !editable || !editable.isConnected) return;
    handleInput(id, editable);
    if (recorded) {
      // Coalesced by focus/blur snapshots; direct commit path stays unrecorded.
    }
    updateCountsFromDoc();
    refreshStatusSoon();
    scheduleLayersRefresh();
  },

  clearSlashTrigger(blockId, editable) {
    const id = blockId || ctx.currentBlockId();
    const block = id ? ctx.getBlock(id) : null;
    if (!block || !block.content) return;
    const text = (block.content[0]?.text || "").replace(/^\//, "");
    ctx.setBlockData(id, { content: [{ type: "text", text, marks: [] }] }, { record: false, sync: true, light: true });
    if (editable && editable.isConnected && editable.textContent.startsWith("/")) {
      editable.textContent = editable.textContent.slice(1);
    }
  },

  extraTextOf(block, editable) {
    if (!block) return "";
    if (block.type === "bulletList" || block.type === "orderedList") {
      const i = Number(editable.getAttribute("data-item-index") || 0);
      return inlinePlainModel((block.data.items || [])[i]);
    }
    return "";
  },

  splitListItemSmart(id, editable) {
    const block = ctx.getBlock(id);
    if (!block) return;
    const i = Number(editable.getAttribute("data-item-index") || 0);
    const items = block.data.items || [];
    const cur = items[i];
    const text = Array.isArray(cur) ? cur.map((n) => n.text || "").join("") : String(cur || "");
    // Empty item + Enter exits the list (Notion behavior): drop the empty
    // item and insert a paragraph after the list instead of spawning blanks.
    if (!text.trim()) {
      const next = [...items];
      next.splice(i, 1);
      if (next.length === 0) {
        ctx.transformBlock(id, "paragraph");
        return;
      }
      mutate("Exit list", (tx) => {
        tx.update(id, { data: engineDataPatch(id, { items: next }) });
      });
      insertAfterAt(id, "paragraph", {});
      return;
    }
    splitListItem(block, editable);
  },

  splitBlock(id, editable) {
    const block = ctx.getBlock(id);
    if (!block) return;
    if (block.type === "bulletList" || block.type === "orderedList") {
      splitListItem(block, editable);
      return;
    }
    if (!(block.type === "paragraph" || block.type === "heading" || block.type === "blockquote" || block.type === "codeblock" || block.type === "alert")) {
      insertAfterAt(id, "paragraph", {});
      return;
    }
    const sel = window.getSelection();
    let offset = inlineLength(block);
    if (sel && sel.rangeCount > 0 && editable.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const pre = document.createRange();
      pre.selectNodeContents(editable);
      pre.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
      offset = pre.toString().length;
    }
    const head = sliceInline(block.content || [], 0, offset);
    const tail = sliceInline(block.content || [], offset, Infinity);
    const parentId = block.parent;
    const siblings = parentId === editor.document.rootId ? ctx.topLevelOrder() : editor.document.childrenOf(parentId).map((c) => c.id);
    const index = siblings.indexOf(id) + 1;
    let newId = null;
    mutate("Split block", (tx) => {
      tx.update(id, { data: engineDataPatchMerge(id, { content: head }) });
      const node = ctx.editor.engines.blocks.createBlock(block.type, { data: engineDataFor(block, { content: tail }) });
      tx.add({ op: "insert", args: { parentId, node, index } });
      newId = node.id;
    });
    ctx.afterStructuralChange({});
    if (newId) {
      ctx.selectBlock(newId, { focus: false });
      focusEditable(newId, 0);
    }
  },

  mergeBlockInto(id, prevId) {
    const block = ctx.getBlock(id);
    const prev = ctx.getBlock(prevId);
    if (!block || !prev) return;
    const prevLen = inlineLength(prev);
    const merged = [...(prev.content || []), ...(block.content || [])];
    mutate("Merge blocks", (tx) => {
      tx.update(prevId, { data: engineDataPatchMerge(prevId, { content: merged }) });
      tx.remove(id, {});
    });
    ctx.afterStructuralChange({});
    ctx.selectBlock(prevId, { focus: false });
    focusEditable(prevId, prevLen);
  },

  indentList(id, editable, dir) {
    const block = ctx.getBlock(id);
    if (!block) return;
    const i = Number(editable.getAttribute("data-item-index") || 0);
    const items = [...(block.data.items || [])];
    // Inline-aware (P0-02): pad/strip leading spaces on the first text node
    // so marks elsewhere in the item survive the indent.
    const cur = normalizeInlineModel(items[i]);
    if (cur.length === 0) {
      items[i] = dir > 0 ? [{ type: "text", text: "  ", marks: [] }] : [];
    } else {
      const [head, ...tail] = cur;
      const text = dir > 0 ? `  ${head.text || ""}` : (head.text || "").replace(/^ {1,2}/, "");
      items[i] = [{ ...head, text }, ...tail].filter((n) => (n.text || "") !== "");
    }
    ctx.setBlockData(id, { items }, { record: true, label: "Indent list" });
    ctx.render();
    focusEditable(id);
  },

  // ── Table operations (ProseMirror/TipTap parity: live, explicit, guided)
  tableCellPos(editable) {
    if (!editable) return null;
    const row = Number(editable.getAttribute("data-row"));
    const col = Number(editable.getAttribute("data-col"));
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
    return { row, col };
  },
  tableAddRow(id, editable, where = "after") {
    const block = ctx.getBlock(id);
    if (!block || block.type !== "table") return;
    const rows = (block.data.rows || []).map((r) => [...r]);
    const pos = ctx.tableCellPos(editable);
    const at = pos ? pos.row + (where === "before" ? 0 : 1) : rows.length;
    const cols = Math.max(1, ...rows.map((r) => r.length));
    rows.splice(at, 0, Array.from({ length: cols }, () => []));
    ctx.setBlockData(id, { rows }, { record: true, label: `Add table row ${where}` });
    ctx.render();
    requestAnimationFrame(() => {
      canvas.querySelector(`[data-child-id="${CSS.escape(id)}-c${at}-0"]`)?.focus();
    });
  },
  tableAddCol(id, editable, where = "after") {
    const block = ctx.getBlock(id);
    if (!block || block.type !== "table") return;
    const rows = (block.data.rows || []).map((r) => [...r]);
    const pos = ctx.tableCellPos(editable);
    const at = pos ? pos.col + (where === "before" ? 0 : 1) : (rows[0]?.length || 0);
    rows.forEach((r) => r.splice(Math.min(at, r.length), 0, []));
    ctx.setBlockData(id, { rows }, { record: true, label: `Add table column ${where}` });
    ctx.render();
  },
  tableDeleteRow(id, editable) {
    const block = ctx.getBlock(id);
    if (!block || block.type !== "table") return;
    const rows = (block.data.rows || []).map((r) => [...r]);
    const pos = ctx.tableCellPos(editable);
    if (rows.length <= 1) { ctx.toast("A table needs at least one row — delete the block instead", "info"); return; }
    rows.splice(pos ? pos.row : rows.length - 1, 1);
    ctx.setBlockData(id, { rows }, { record: true, label: "Delete table row" });
    ctx.render();
  },
  tableDeleteCol(id, editable) {
    const block = ctx.getBlock(id);
    if (!block || block.type !== "table") return;
    const rows = (block.data.rows || []).map((r) => [...r]);
    const cols = Math.max(...rows.map((r) => r.length));
    if (cols <= 1) { ctx.toast("A table needs at least one column — delete the block instead", "info"); return; }
    const pos = ctx.tableCellPos(editable);
    const at = pos ? pos.col : cols - 1;
    rows.forEach((r) => r.splice(Math.min(at, r.length - 1), 1));
    ctx.setBlockData(id, { rows }, { record: true, label: "Delete table column" });
    ctx.render();
  },
  tableToggleHeader(id) {
    const block = ctx.getBlock(id);
    if (!block || block.type !== "table") return;
    ctx.setBlockData(id, { hasHeader: !(block.data.hasHeader !== false) }, { record: true, label: "Toggle table header" });
    ctx.render();
  },
  tableNextCell(id, editable, dir = 1) {
    const cells = [...canvas.querySelectorAll(`.block-wrap[data-for-block-id="${CSS.escape(id)}"] [data-row]`)];
    const idx = cells.indexOf(editable);
    const target = cells[idx + dir];
    if (target) { target.focus(); return true; }
    return false;
  },

  arrowNavigate(id, editable, dir) {
    const editables = [...canvas.querySelectorAll("[contenteditable='true']")].filter((el) => el.offsetParent !== null);
    const idx = editables.indexOf(editable);
    if (dir < 0 && !atFirstLine(editable)) return false;
    if (dir > 0 && !atLastLine(editable)) return false;
    const target = editables[idx + dir];
    if (!target) return false;
    const wrap = target.closest(".block-wrap");
    if (wrap) ctx.selectBlock(wrap.getAttribute("data-for-block-id"), { focus: false });
    target.focus();
    return true;
  },

  selectAllBlocks(editable) {
    const wrap = editable.closest(".block-wrap");
    const id = wrap?.getAttribute("data-for-block-id");
    const now = Date.now();
    if (lastCtrlA.id === id && now - lastCtrlA.at < 800) {
      editor.engines.selection.selectBlocks(ctx.topLevelOrder());
      ctx.afterSelectionChange(null);
      lastCtrlA = { id: null, at: 0 };
      return true;
    }
    lastCtrlA = { id, at: now };
    return false; // let native selection happen
  },

  insertFromMainInput(input) {
    const text = (input.textContent || "").trim();
    input.textContent = "";
    syncEmptyState(input);
    if (!text) {
      const id = insertBlockAt("paragraph", {});
      if (id) focusEditable(id, 0);
      return;
    }
    const id = insertBlockAt("paragraph", { parentId: editor.document.rootId, index: ctx.topLevelOrder().length });
    if (id) {
      ctx.setBlockData(id, { content: [{ type: "text", text, marks: [] }] }, { record: false, sync: false });
      ctx.afterStructuralChange({});
      focusEditable(id, text.length);
    }
  },

  // ── Marks / links ──
  // Single choke point for every UI entry (toolbar, keyboard, palette,
  // context menu): the compat rule is enforced here so all paths refuse
  // identically with feedback. Paste/import resolve via the engine instead.
  toggleMark(id, mark) {
    id = id || ctx.currentBlockId();
    if (!id) {
      toast("Select a text block first", "info");
      return false;
    }
    if (mark !== "link" && !canApplyMark(activeMarksText(id), mark)) {
      toast("Remove code formatting first — code can't mix with rich marks", "info");
      return false;
    }
    skipIds.add(id);
    const out = toggleMarkText(id, mark);
    setTimeout(() => skipIds.delete(id), 50);
    saveSoon();
    return out;
  },

  promptLink(id) {
    id = id || ctx.currentBlockId();
    if (!id) return;
    closeMenu();
    const existing = document.querySelector(".acrx-link-pop");
    existing?.remove();
    const pop = document.createElement("div");
    pop.className = "acrx-link-pop";
    pop.innerHTML = `<input type="url" placeholder="https://…" aria-label="Link URL"><div class="acrx-link-pop-actions">` +
      `<button type="button" data-link-save>Apply</button><button type="button" data-link-remove>Remove</button></div>`;
    document.body.appendChild(pop);
    const rect = canvas.querySelector(`.block-wrap[data-for-block-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
    pop.style.top = `${(rect ? rect.top : 120) + window.scrollY}px`;
    pop.style.left = `${Math.min(window.innerWidth - 300, (rect ? rect.left : 120) + window.scrollX)}px`;
    const input = pop.querySelector("input");
    // Prefill when the caret/selection is inside an existing link so the
    // popup edits rather than blindly replacing.
    import("../canvas/text.js").then(({ linkHrefAt }) => {
      try {
        const href = linkHrefAt(id);
        if (href) input.value = href;
      } catch { /* prefill is best-effort */ }
    });
    input.focus();
    input.select?.();
    const applyUrl = () => {
      const raw = input.value.trim();
      if (!raw) { pop.remove(); return; }
      // Validate through the link engine: normalize (bare domains gain
      // https://), then reject empty/unsafe/invalid before any mutation.
      const href = normalizeUrl(raw);
      const kind = classifyLink(href).kind;
      if (kind === "empty" || kind === "invalid" || kind === "unsafe") {
        toast(kind === "unsafe" ? "That URL uses a disallowed protocol" : "Enter a valid URL", "error");
        input.focus();
        input.select?.();
        return;
      }
      pop.remove();
      skipIds.add(id);
      import("../canvas/text.js").then(({ insertLink }) => {
        insertLink(id, href);
        setTimeout(() => skipIds.delete(id), 50);
      });
    };
    pop.querySelector("[data-link-save]").addEventListener("click", applyUrl);
    pop.querySelector("[data-link-remove]").addEventListener("click", () => {
      pop.remove();
      import("../canvas/text.js").then(({ removeLink }) => removeLink(id));
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") pop.querySelector("[data-link-save]").click();
      if (e.key === "Escape") pop.remove();
    });
  },

  // ── Grouping (multi-selection → container, and back) ──
  groupSelection(kind = "group") {
    const sel = editor.engines.selection.get();
    if (sel.mode !== "blocks" || sel.blockIds.length < 2) {
      toast("Select two or more blocks to group", "info");
      return null;
    }
    const doc = editor.document;
    const nodes = sel.blockIds.map((id) => doc.getNode(id)).filter(Boolean);
    if (nodes.length < 2) return null;
    const parentId = nodes[0].parentId || doc.rootId;
    if (!nodes.every((n) => (n.parentId || doc.rootId) === parentId)) {
      toast("Group needs blocks with the same parent", "info");
      return null;
    }
    if (!["group", "container", "stack", "row"].includes(kind)) kind = "group";
    let groupId = null;
    mutate(`Group ${nodes.length} blocks`, (tx) => {
      const node = editor.engines.blocks.createBlock(kind, {});
      const siblings = parentId === doc.rootId
        ? doc.childrenOf(doc.rootId).map((c) => c.id)
        : doc.childrenOf(parentId).map((c) => c.id);
      const at = Math.min(...nodes.map((n) => siblings.indexOf(n.id)).filter((i) => i >= 0));
      tx.add({ op: "insert", args: { parentId, node, index: at < 0 ? siblings.length : at } });
      groupId = node.id;
      for (const n of nodes) {
        tx.add({ op: "move", args: { nodeId: n.id, newParentId: node.id, index: doc.getNode(node.id).children.length } });
      }
    });
    ctx.afterStructuralChange({ select: groupId, focus: false });
    return groupId;
  },

  ungroup(id) {
    id = id || ctx.currentBlockId();
    const node = id ? editor.document.getNode(id) : null;
    if (!node || !(node.children || []).length) {
      toast("Select a container with children to ungroup", "info");
      return false;
    }
    const doc = editor.document;
    const parentId = node.parentId || doc.rootId;
    const siblings = parentId === doc.rootId ? ctx.topLevelOrder() : doc.childrenOf(parentId).map((c) => c.id);
    const at = siblings.indexOf(id);
    const kids = [...node.children];
    mutate("Ungroup", (tx) => {
      kids.forEach((cid, i) => {
        tx.add({ op: "move", args: { nodeId: cid, newParentId: parentId, index: (at < 0 ? siblings.length : at) + i } });
      });
      tx.add({ op: "remove", args: { nodeId: id } });
    });
    ctx.afterStructuralChange({ select: kids[0] || null, focus: false });
    return true;
  },

  // Wrap one block in a new container (smart-insertion helper).
  wrapIn(blockId, containerType = "group") {
    const node = blockId ? editor.document.getNode(blockId) : null;
    if (!node) {
      toast("Select a block to wrap", "info");
      return null;
    }
    const doc = editor.document;
    const parentId = node.parentId || doc.rootId;
    const siblings = parentId === doc.rootId ? ctx.topLevelOrder() : doc.childrenOf(parentId).map((c) => c.id);
    const at = siblings.indexOf(blockId);
    let wrapId = null;
    mutate(`Wrap in ${containerType}`, (tx) => {
      const wrapper = editor.engines.blocks.createBlock(containerType, {});
      wrapId = wrapper.id;
      tx.add({ op: "insert", args: { parentId, node: wrapper, index: at < 0 ? siblings.length : at } });
      tx.add({ op: "move", args: { nodeId: blockId, newParentId: wrapper.id, index: 0 } });
    });
    ctx.afterStructuralChange({ select: wrapId, focus: false });
    return wrapId;
  },

  // Append a widget as the last child of a container.
  appendTo(containerId, type) {
    const node = containerId ? editor.document.getNode(containerId) : null;
    if (!node) return null;
    return insertBlockAt(type, { parentId: node.id, index: (node.children || []).length });
  },

  faqAddItem(faqId) {
    const block = faqId ? ctx.getBlock(faqId) : null;
    if (!block) return;
    ctx.setBlockData(faqId, { items: [...(block.data.items || []), { q: "", a: "" }] }, { record: true, label: "Add question" });
    ctx.afterStructuralChange({ select: faqId, focus: false });
  },

  alignBlocks(ids, align) {
    const list = Array.isArray(ids) && ids.length > 0 ? ids : ctx.multiSelectedIds();
    if (list.length === 0) {
      toast("Select blocks to align", "info");
      return false;
    }
    mutate(`Align ${list.length} blocks`, (tx) => {
      for (const bid of list) {
        const node = editor.document.getNode(bid);
        if (!node) continue;
        const data = JSON.parse(JSON.stringify(node.data || {}));
        data.attrs = { ...(data.attrs || {}), align };
        tx.update(bid, { data });
      }
    });
    ctx.afterStructuralChange({});
    return true;
  },

  deleteBlocks(ids) {    const list = (Array.isArray(ids) ? ids : []).filter((bid) => {
      const n = editor.document.getNode(bid);
      return n && !n.data?.locked;
    });
    if (list.length === 0) {
      toast("Nothing deletable selected", "info");
      return false;
    }
    mutate(`Delete ${list.length} blocks`, (tx) => {
      for (const bid of list) tx.remove(bid, {});
    });
    ctx.afterStructuralChange({});
    toast(`Deleted ${list.length} blocks — undo to restore`, "success");
    return true;
  },

  // ── Clipboard ops ──
  copyBlocks(id) {    const ids = id ? [id] : ctx.multiSelectedIds();
    if (ids.length === 0) {
      toast("Nothing to copy", "info");
      return;
    }
    const trees = ids.map((bid) => editor.document.getNode(bid)).filter(Boolean);
    editor.engines.clipboard.copy(trees, "blocks");
    toast(`Copied ${trees.length} block${trees.length === 1 ? "" : "s"}`, "success");
  },

  pasteBlocks() {
    const clip = editor.engines.clipboard.getInternal();
    if (!clip) {
      toast("Clipboard is empty", "info");
      return;
    }
    ctx.pasteNodes(clip.data);
  },

  pasteNodes(data) {
    if (!Array.isArray(data) || data.length === 0) return;
    const nested = data.map(engineNodeToNested).filter(Boolean);
    const anchor = ctx.currentBlockId();
    const ids = insertPatternNodes({ nodes: nested, total: nested.length, skipped: 0 }, anchor);
    if (ids.length > 0) toast(`Pasted ${ids.length} block${ids.length === 1 ? "" : "s"}`, "success");
  },

  pasteHtml(html) {
    let nodes;
    try {
      nodes = editor.engines.importExport.importData("html", html)?.nodes || [];
    } catch (err) {
      toast(err.message || "Paste failed", "error");
      return;
    }
    if (nodes.length === 0) {
      toast("Nothing to paste", "info");
      return;
    }
    const entries = nodes.map((node) => {
      const type = node.type in CATALOG_BY_TYPE_MAP ? node.type : "paragraph";
      return { type, data: incomingData(type, node.data || {}) };
    });
    insertNodesAfter(entries, ctx.currentBlockId(), "Paste");
  },

  pasteText(text) {
    // Blank lines split blocks; single newlines stay inline breaks (P1-11 —
    // the model already round-trips \n through domToInline).
    const chunks = String(text || "")
      .split(/\n\s*\n/)
      .map((s) => s.replace(/^\s+|\s+$/g, ""))
      .filter(Boolean);
    if (chunks.length === 0) return;
    insertNodesAfter(
      chunks.map((chunk) => ({
        type: "paragraph",
        data: incomingData("paragraph", { content: [{ type: "text", text: chunk, marks: [] }] }),
      })),
      ctx.currentBlockId(),
      "Paste"
    );
  },

  // Inline paste at the caret (P0-03): single-paragraph payloads land inside
  // the focused editable via text.js; anything else returns false so the
  // caller escalates to block-level insertion.
  pasteInline(blockId, editable, html, text) {
    return tryInlinePaste(blockId, editable, html, text);
  },

  // ── History / persistence ──
  undo() {
    const res = editor.execute("undo");
    if (!res.ok) {
      toast("Nothing to undo", "info");
      return;
    }
    ctx.afterStructuralChange({});
  },

  redo() {
    const res = editor.execute("redo");
    if (!res.ok) {
      toast("Nothing to redo", "info");
      return;
    }
    ctx.afterStructuralChange({});
  },

  saveNow() {
    return saveNow();
  },

  markDirty() {
    syncFromEditor(true);
    State.patch("editor", { isDirty: true });
    refreshStatus();
    saveSoon();
  },

  markSaved() {
    refreshStatus();
  },

  updateTitle(title) {
    State.patch("editor", { title });
  },

  updateFooter() {
    updateCountsFromDoc();
    refreshStatus();
  },

  analyzeSeo() {
    const seoState = State.get("seo") || {};
    const post = State.get("post") || {};
    return editor.engines.seo.analyze({
      document: editor.document,
      metadata: {
        ...seoState,
        slug: post.slug || seoState.slug,
        title: post.title,
        url: seoState.canonicalUrl,
        report: undefined,
      },
    });
  },

  // Pixel-accurate title/description measurement (canvas.measureText) with a
  // character fallback outside browsers. Returns { px, chars }.
  measureSeoText(text, font) {
    const chars = (text || "").length;
    try {
      if (typeof document === "undefined") return { px: null, chars };
      measureSeoText._ctx = measureSeoText._ctx || document.createElement("canvas").getContext("2d");
      if (!measureSeoText._ctx || typeof measureSeoText._ctx.measureText !== "function") return { px: null, chars };
      measureSeoText._ctx.font = font;
      return { px: Math.round(measureSeoText._ctx.measureText(text || "").width), chars };
    } catch {
      return { px: null, chars };
    }
  },

  firstContentImage() {
    let found = null;
    editor.document.traverse((n) => {
      if (found) return false;
      const d = n.data || {};
      if ((n.type === "image" || n.type === "card" || n.type === "hero") && d.src) { found = d.src; return false; }
      if (n.type === "gallery" && Array.isArray(d.images) && d.images[0]) {
        found = typeof d.images[0] === "string" ? d.images[0] : d.images[0].url;
        return false;
      }
      return undefined;
    });
    return found;
  },

  seoPreviewHTML() {
    const seoState = State.get("seo") || {};
    const post = State.get("post") || {};
    const title = seoState.metaTitle || post.title || "Untitled";
    const desc = seoState.metaDescription || "";
    const canonical = seoState.canonicalUrl || "";
    const domain = (() => {
      try {
        return canonical ? new URL(canonical).hostname.replace(/^www\./, "") : (window.location?.hostname || "example.com");
      } catch { return "example.com"; }
    })();
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const titleM = ctx.measureSeoText(title, "20px Arial");
    const descM = ctx.measureSeoText(desc, "14px Arial");
    const meter = (m, max) => {
      if (m.px === null) return `<span class="seo-meter-text">${m.chars} chars</span>`;
      const ok = m.px <= max;
      return `<span class="seo-meter-text${ok ? " is-ok" : ""}">${m.px}px / ${max}px · ${m.chars} chars</span>`;
    };
    const google =
      `<div class="seo-google-card">` +
      `<div class="seo-google-site"><span class="seo-favicon">${esc((post.title || domain)[0] || "A")}</span>` +
      `<span class="seo-google-name">${esc(post.title || domain)}</span></div>` +
      `<div class="seo-google-title">${esc(title)}</div>` +
      `<div class="seo-google-url">${esc(domain)}${post.slug ? ` › ${esc(post.slug)}` : ""}</div>` +
      `<div class="seo-google-desc">${esc(desc) || "<span class='seo-empty-note'>Add a meta description…</span>"}</div>` +
      `<div class="seo-google-meters">${meter(titleM, 580)}${meter(descM, 920)}</div></div>`;
    const image = seoState.ogImage || post.featuredImage || ctx.firstContentImage();
    const socialTitle = seoState.ogTitle || title;
    const socialDesc = seoState.ogDescription || desc;
    const imgBlock = image
      ? `<img src="${esc(image)}" alt="" loading="lazy">`
      : `<div class="seo-social-noimg"><span>${esc(domain[0]?.toUpperCase() || "A")}</span><button type="button" class="insp-link" data-seo-pick-image>Set image</button></div>`;
    const xCard =
      `<div class="seo-x-card"><div class="seo-x-head"><i class="fa-brands fa-x-twitter"></i><span>Post preview</span></div>` +
      `<div class="seo-x-img">${imgBlock}</div>` +
      `<div class="seo-x-body"><div class="seo-x-t">${esc(socialTitle)}</div>` +
      `<div class="seo-x-d">${esc(socialDesc) || "<span class='seo-empty-note'>Add a description…</span>"}</div>` +
      `<div class="seo-x-u">${esc(domain)}</div></div></div>`;
    const ogCard =
      `<div class="seo-og-card"><div class="seo-og-head"><i class="fa-brands fa-facebook"></i><span>Facebook / LinkedIn</span></div>` +
      `<div class="seo-og-img">${imgBlock}</div>` +
      `<div class="seo-og-body"><div class="seo-og-u">${esc(domain.toUpperCase())}</div>` +
      `<div class="seo-og-t">${esc(socialTitle)}</div>` +
      `<div class="seo-og-d">${esc(socialDesc) || "<span class='seo-empty-note'>Add a description…</span>"}</div></div></div>`;
    return `<div class="seo-preview-stack">${google}${xCard}${ogCard}</div>`;
  },

  openPreview() {
    const id = State.value("editor.documentId");
    const postType = State.value("editor.postType") || "post";
    if (!id) {
      toast("Save the document first to preview", "info");
      return;
    }
    // Customizer-parity preview: flush unsaved work, then embed the real
    // layout pipeline (GET .../preview/page → text/html) in an iframe modal
    // with device switching. Falls back to the POST JSON preview only when
    // the save itself fails.
    const openIframe = (cacheBuster) => {
      const overlay = document.createElement("div");
      overlay.className = "acrx-modal-overlay acrx-preview-overlay";
      const src = (device) => `/acr/api/editor/${encodeURIComponent(id)}/preview/page?type=${encodeURIComponent(postType)}&device=${device}&t=${cacheBuster}`;
      overlay.innerHTML =
        `<div class="acrx-modal acrx-preview-modal" role="dialog" aria-label="Preview">` +
        `<div class="acrx-modal-head"><span>Preview</span>` +
        `<span class="acrx-preview-devices" role="group" aria-label="Preview device">` +
        `<button type="button" data-preview-device="desktop" class="is-active">Desktop</button>` +
        `<button type="button" data-preview-device="tablet">Tablet</button>` +
        `<button type="button" data-preview-device="mobile">Mobile</button></span>` +
        `<span class="acrx-preview-actions"><button type="button" class="btn-act" data-preview-reload>Reload</button>` +
        `<button type="button" class="btn-act" data-preview-open>Open in tab</button>` +
        `<button type="button" class="btn-act" data-modal-close aria-label="Close">×</button></span></div>` +
        `<div class="acrx-modal-body acrx-preview-body"><div class="acrx-loading">Rendering preview…</div>` +
        `<iframe title="Preview" sandbox="allow-same-origin allow-scripts allow-forms" style="width:100%;height:100%;border:0;display:none"></iframe></div></div>`;
      document.body.appendChild(overlay);
      const iframe = overlay.querySelector("iframe");
      const loading = overlay.querySelector(".acrx-loading");
      let device = "desktop";
      const widths = { desktop: "100%", tablet: "768px", mobile: "390px" };
      const load = () => {
        loading.style.display = "";
        iframe.style.display = "none";
        iframe.style.maxWidth = widths[device] || "100%";
        iframe.style.margin = device === "desktop" ? "0" : "0 auto";
        iframe.src = src(device);
      };
      iframe.addEventListener("load", () => { loading.style.display = "none"; iframe.style.display = ""; });
      overlay.querySelectorAll("[data-preview-device]").forEach((b) => b.addEventListener("click", () => {
        device = b.getAttribute("data-preview-device");
        overlay.querySelectorAll("[data-preview-device]").forEach((x) => x.classList.toggle("is-active", x === b));
        load();
      }));
      overlay.querySelector("[data-preview-reload]")?.addEventListener("click", load);
      overlay.querySelector("[data-preview-open]")?.addEventListener("click", () => window.open(src(device), "_blank", "noopener"));
      overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target.closest("[data-modal-close]")) overlay.remove(); });
      const esc = (e) => { if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", esc); } };
      document.addEventListener("keydown", esc);
      load();
    };
    const openLegacyBlob = () => {
      // Preview contract (P0-06): POST the full unsaved draft (content +
      // title/meta/seo/postType, never content alone) and expect JSON { html }.
      const payload = buildSavePayload();
      toast("Opening preview…", "info");
      fetch(`/acr/api/editor/${encodeURIComponent(id)}/preview?type=${encodeURIComponent(postType)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: payload.content, title: payload.title, postType, meta: payload.meta, seo: payload.seo }),
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        const html = data.html || data.preview || null;
        if (html) {
          const blob = new Blob([html], { type: "text/html" });
          window.open(URL.createObjectURL(blob), "_blank", "noopener");
        } else toast(data.message || "Preview unavailable", "error");
      }).catch(() => toast("Preview unavailable", "error"));
    };
    toast("Saving before preview…", "info");
    Promise.resolve()
      .then(() => ctx.saveNow())
      .catch(() => {})
      .then(() => openIframe(Date.now()))
      .catch(openLegacyBlob);
  },

  // ── Panels / chrome ──
  showPanel(side, panelName) {
    const map = {
      left: { layers: ["#sidebar-left-btn-layers", "#sidebar-left-panel-layers"], widgets: ["#sidebar-left-btn-widgets", "#sidebar-left-panel-widgets"], patterns: ["#sidebar-left-btn-patterns", "#sidebar-left-panel-patterns"] },
      right: { post: ["#sidebar-right-btn-post", "#sidebar-right-panel-post"], seo: ["#sidebar-right-btn-seo", "#sidebar-right-panel-seo"], block: ["#sidebar-right-btn-settings", "#sidebar-right-panel-settings"] },
    };
    const entry = map[side]?.[panelName];
    if (!entry) return;
    const [btnSel, panelSel] = entry;
    const bar = side === "left" ? "#editor-left-sidebar" : "#editor-right-sidebar";
    document.querySelectorAll(`${bar} .sidebar-tab`).forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(`${bar} .sidebar-panel`).forEach((p) => p.classList.remove("active"));
    document.querySelector(btnSel)?.classList.add("active");
    document.querySelector(panelSel)?.classList.add("active");
    document.querySelector(".acrx-editor-body")?.classList.add(side === "left" ? "sdb-left" : "sdb-right");
    syncSidebarAria();
    State.patch("editor", side === "left" ? { leftActivePanel: panelName } : { rightActivePanel: panelName });
    if (side === "right" && panelName === "seo") refreshAnalysis();
  },

  toggleSidebar(side) {
    const cls = side === "left" ? "sdb-left" : "sdb-right";
    document.querySelector(".acrx-editor-body")?.classList.toggle(cls);
  },

  setDevice(mode) {
    setDeviceMode(mode);
  },

  setOverlay(name, on) {
    if (name === "palette") State.patch("editor", { commandPaletteOpen: on });
    if (name === "slash") State.patch("editor", { slashMenuOpen: on });
  },

  closeTopmost() {
    if (isCodeEditorOpen()) { closeCodeEditor(true); return true; }
    if (menuOpen()) { closeMenu(); return true; }
    if (document.querySelector(".acrx-link-pop")) { document.querySelector(".acrx-link-pop").remove(); return true; }
    if (closeSlash()) return true;
    if (paletteOpen() && closePalette()) return true;
    if (!document.querySelector(".transform-block-dropdown")?.classList.contains("hidden")) {
      document.querySelector(".transform-block-dropdown")?.classList.add("hidden");
      return true;
    }
    return false;
  },

  togglePalette() {
    togglePaletteFn();
  },

  openShortcuts() {
    import("../panels/topbar.js").then((m) => m.openShortcuts());
  },

  openRevisions() {
    import("../panels/topbar.js").then((m) => m.openRevisions());
  },

  exportDocument(format) {
    import("../panels/topbar.js").then((m) => m.exportDocument(format));
  },

  openBlockMenu(id) {
    id = id || ctx.currentBlockId();
    const block = id ? ctx.getBlock(id) : null;
    if (!block && !ctx.isMulti()) {
      toast("Select a block first", "info");
      return;
    }
    const wrap = id ? canvas.querySelector(`.block-wrap[data-for-block-id="${CSS.escape(id)}"]`) : null;
    const rect = wrap?.getBoundingClientRect() || { right: 200, top: 200 };
    const items = [];
    if (ctx.isMulti()) {
      items.push(
        { id: "group", label: `Group ${ctx.multiSelectedIds().length} blocks`, icon: "object-group" },
        { id: "alignLeft", label: "Align left", icon: "align-left" },
        { id: "alignCenter", label: "Align center", icon: "align-center" },
        { id: "alignRight", label: "Align right", icon: "align-right" },
        { id: "deleteMulti", label: "Delete selected", icon: "trash", danger: true },
        { separator: true },
      );
    }
    items.push(...blockMenuItems(block || { locked: false, hidden: false }));
    if (block && ["paragraph", "heading", "blockquote", "alert"].includes(block.type)) {
      items.push(
        { separator: true },
        { id: "ai-improve", label: "AI · Improve", icon: "sparkles" },
        { id: "ai-shorten", label: "AI · Shorten", icon: "compress" },
        { id: "ai-expand", label: "AI · Expand", icon: "expand" },
      );
    }
    openMenu(items, rect.right + window.scrollX - 8, rect.top + window.scrollY + 24, (action) => {
      if (action === "group") { ctx.groupSelection("group"); return; }
      if (action === "alignLeft") { ctx.alignBlocks(null, "left"); return; }
      if (action === "alignCenter") { ctx.alignBlocks(null, "center"); return; }
      if (action === "alignRight") { ctx.alignBlocks(null, "right"); return; }
      if (action === "deleteMulti") { ctx.deleteBlocks(ctx.multiSelectedIds()); return; }
      if (!id) return;
      if (action === "duplicate") ctx.duplicateBlock(id);
      else if (action === "delete") ctx.deleteBlock(id);
      else if (action === "copy") ctx.copyBlocks(id);
      else if (action === "cut") { ctx.copyBlocks(id); ctx.deleteBlock(id); }
      else if (action === "paste") ctx.pasteBlocks();
      else if (action === "moveUp") ctx.moveBlock(id, -1);
      else if (action === "moveDown") ctx.moveBlock(id, 1);
      else if (action === "lock") ctx.toggleLock(id);
      else if (action === "hide") ctx.toggleHide(id);
      else       if (action === "settings") ctx.showPanel("right", "block");
      else if (action === "select") ctx.selectBlock(id, { focus: false });
      else if (action === "ai-improve" || action === "ai-shorten" || action === "ai-expand") {
        import("../services/ai.js").then((m) => m.transformBlock(id, action === "ai-improve" ? "improve" : action === "ai-shorten" ? "shorten" : "expand"));
      }
    });
  },

  openLayerMenu(id, x, y) {
    const block = ctx.getBlock(id);
    if (!block) return;
    ctx.selectBlock(id, { focus: false });
    openMenu(blockMenuItems(block), x, y, (action) => {
      if (action === "duplicate") ctx.duplicateBlock(id);
      else if (action === "delete") ctx.deleteBlock(id);
      else if (action === "copy") ctx.copyBlocks(id);
      else if (action === "moveUp") ctx.moveBlock(id, -1);
      else if (action === "moveDown") ctx.moveBlock(id, 1);
      else if (action === "lock") ctx.toggleLock(id);
      else if (action === "hide") ctx.toggleHide(id);
      else if (action === "settings") ctx.showPanel("right", "block");
    });
  },

  pickMediaFor(blockId, key, kind) {
    return pickForBlock(blockId, key, kind, key === "images");
  },

  pickMediaForPost() {
    return pickForPost();
  },

  pickMediaForSeo() {
    return pickForSeo().then(() => {
      import("../panels/seoPanel.js").then((m) => m.refresh());
    });
  },

  aiSeoFill(kind) {
    return seoFill(kind).then(() => {
      import("../panels/seoPanel.js").then((m) => m.refresh());
    });
  },

  setPost(patch) {
    State.patch("post", patch);
    ctx.markDirty();
    import("../panels/postPanel.js").then((m) => m.refresh());
  },

  setSeo(patch) {
    State.patch("seo", patch);
    ctx.markDirty();
  },

  // ── Document IO ──
  blueprint() {
    return snapshotToBlueprint(editor.document.snapshot());
  },

  showSuggestions(type, afterId) {
    try {
      showSuggestionsFor(type, afterId);
    } catch { /* suggestions never break editing */ }
  },

  renderExport() {
    const docState = State.get("document") || { blocks: {}, blockOrder: [] };
    const html = renderExportHTML(docState, { deviceMode: "desktop" });
    const raw = ctx.documentText();
    return { html, raw };
  },

  exportFullHtml(fragment) {
    // Full document from the SAME app views as the canvas (not a parallel
    // renderer), wrapped with real head metadata from the metadata engine.
    const post = State.get("post") || {};
    const seo = State.get("seo") || {};
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const head = [
      "<meta charset=\"utf-8\">",
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
      ...editor.engines.metadata.toHeadTags({
        title: post.title, description: post.excerpt, canonical: seo.canonicalUrl, language: "en",
        ...seo,
      }),
    ];
    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n${head.join("\n")}\n</head>\n<body>\n${fragment}\n</body>\n</html>`;
  },

  async reload() {
    const { loadInitial } = await import("../services/persistence.js");
    const loaded = await loadInitial();
    if (loaded && !loaded.fresh) {
      const { setDbWidgets } = await import("../panels/widgets.js");
      const { setPatterns } = await import("../panels/patterns.js");
      setDbWidgets(loaded.widgets || []);
      setPatterns(loaded.patterns || []);
    }
    syncFromEditor(true);
    ctx.render();
    refreshLayers();
    refreshInspector();
    refreshPost();
    refreshSeo();
    refreshWidgets();
    refreshPatterns();
    refreshBlockActions();
    refreshToolbar();
    refreshBreadcrumbs();
    ctx.updateFooter();
  },

  documentText() {
    const parts = [];
    editor.document.traverse((n) => {
      const d = n.data || {};
      if (typeof d.text === "string" && d.text.trim()) parts.push(d.text.trim());
      if (typeof d.title === "string" && d.title.trim()) parts.push(d.title.trim());
      if (Array.isArray(d.content)) {
        const t = d.content.filter((c) => c?.type === "text").map((c) => c.text).join("").trim();
        if (t) parts.push(t);
      }
      if (Array.isArray(d.items)) parts.push(d.items.filter(Boolean).join(" "));
    });
    return parts.join("\n");
  },

  postTitle() {
    return State.value("post.title") || State.value("editor.title") || "";
  },

  loadBlueprint(json) {
    const nodes = blueprintToNodes(json);
    if (!nodes) throw new Error("Unrecognized document JSON");
    // A fresh tree must not retain history/selection from a previous document:
    // those snapshots reference the old id tree and would clobber this one on
    // undo, and a stale caret id would point at a now-missing node.
    editor.engines.history.clear();
    editor.engines.selection.clear();
    editor.document.restore({
      id: json.id || editor.document.id,
      schemaVersion: json.version || json.schemaVersion || 1,
      rootId: json.rootId,
      rev: 0,
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, parentId: n.parentId, children: n.children, data: n.data })),
    });
    const check = editor.document.validateStructure();
    if (!check.valid) throw new Error(check.errors[0]?.message || "Invalid document structure");
  },

  newDocument() {
    const rootId = "block_root";
    // Replacing the tree invalidates every prior snapshot and selection id —
    // clear history + selection so a later undo()/redo() or stale caret can
    // never restore a snapshot referring to deleted node ids.
    editor.engines.history.clear();
    editor.engines.selection.clear();
    editor.document.restore({
      id: null, schemaVersion: 1, rootId, rev: 0,
      nodes: [{ id: rootId, type: "document", parentId: null, children: [], data: {} }],
    });
    editor.engines.editorState.markClean();
  },
};

function engineNodeToNested(node) {
  const block = fromEngineNode(node);
  const doc = editor.document;
  return {
    type: block.type,
    data: nestedData(block),
    children: (node.children || []).map((cid) => {
      const child = doc.getNode(cid);
      return child ? engineNodeToNested(child) : null;
    }).filter(Boolean),
  };
}

function nestedData(block) {
  return {
    content: block.content,
    attrs: block.attrs,
    styles: block.styles,
    responsive: block.responsive,
    locked: block.locked,
    hidden: block.hidden,
    customClasses: block.customClasses,
    customId: block.customId,
    customAttributes: block.customAttributes,
    ...(block.data || {}),
  };
}

function incomingData(type, flat) {
  const base = createBlockData(type);
  const reserved = ["content", "attrs", "styles", "responsive", "locked", "hidden", "customClasses", "customId", "customCSS", "tag", "ariaLabel", "dataAttrs", "customAttributes"];
  for (const [key, value] of Object.entries(flat || {})) {
    if (reserved.includes(key)) base[key] = value;
    else base.settings[key] = value;
  }
  if (flat.text && (!base.content || base.content.length === 0) &&
    (type === "paragraph" || type === "heading" || type === "blockquote" || type === "codeblock" || type === "alert")) {
    base.content = [{ type: "text", text: flat.text, marks: [] }];
  }
  // Imported/pasted list items and table cells arrive as plain strings;
  // promote them to the inline model (P0-02) at the boundary.
  if ((type === "bulletList" || type === "orderedList") && Array.isArray(base.settings.items)) {
    base.settings.items = base.settings.items.map((item) =>
      item && typeof item === "object" && !Array.isArray(item) ? item : normalizeInlineModel(item));
  }
  if (type === "table" && Array.isArray(base.settings.rows)) {
    base.settings.rows = base.settings.rows.map((row) =>
      (Array.isArray(row) ? row : [row]).map((cell) => normalizeInlineModel(cell)));
  }
  return base;
}

function engineDataPatchMerge(id, patch) {
  const node = editor.document.getNode(id);
  const data = JSON.parse(JSON.stringify(node.data || {}));
  for (const [key, value] of Object.entries(patch)) data[key] = value;
  return data;
}

// Typable surface of a block: every model slot the canvas input path can
// mutate without recording (P0-09). Typing commits to `content` for
// text-family blocks but to settings slots for lists (items), tables (rows)
// and buttons (text); the blur-coalesced undo snapshot must compare all of
// them, or edits outside `content` are silently un-undoable.
const SURFACE_TEXT_KEYS = ["items", "rows", "text", "title", "description", "caption"];
function editableSurface(block) {
  if (!block) return null;
  const surf = { content: block.content ?? null };
  const d = block.data || {};
  for (const key of SURFACE_TEXT_KEYS) {
    if (d[key] !== undefined) surf[key] = d[key];
  }
  return surf;
}

function engineDataFor(block, overrides) {
  const node = toEngineNode({ ...block, ...(overrides || {}) });
  return node.data;
}

function inlineLength(block) {
  return (block.content || []).filter((n) => n.type === "text").reduce((n, x) => n + (x.text || "").length, 0);
}

function sliceInline(content, from, to) {
  const total = content.filter((n) => n.type === "text").reduce((n, x) => n + (x.text || "").length, 0);
  const a = Math.max(0, Math.min(from, total));
  const b = to === Infinity ? total : Math.max(0, Math.min(to, total));
  const out = [];
  let acc = 0;
  for (const node of content) {
    if (node.type !== "text") continue;
    const start = acc;
    const end = acc + (node.text || "").length;
    if (end > a && start < b) {
      out.push({ ...node, text: node.text.slice(Math.max(0, a - start), Math.max(0, b - start)) });
    }
    acc = end;
  }
  return out.filter((n) => n.text !== "");
}

function splitListItem(block, editable) {
  const i = Number(editable.getAttribute("data-item-index") || 0);
  const items = [...(block.data.items || [""])];
  // Inline-aware (P0-02): split the item's nodes so marks survive on both
  // halves. The patch goes through engineDataPatch (settings home) — the old
  // top-level Merge wrote items where the reader never looks.
  const current = normalizeInlineModel(items[i]);
  const total = current.reduce((n, x) => n + (x.text || "").length, 0);
  const sel = window.getSelection();
  let offset = total;
  if (sel && sel.rangeCount > 0 && editable.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    const pre = document.createRange();
    pre.selectNodeContents(editable);
    pre.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    offset = Math.max(0, Math.min(pre.toString().length, total));
  }
  const head = [];
  const tail = [];
  let acc = 0;
  for (const node of current) {
    const len = (node.text || "").length;
    const start = acc;
    const end = acc + len;
    if (end <= offset) head.push(node);
    else if (start >= offset) tail.push(node);
    else {
      const cut = offset - start;
      if (node.text.slice(0, cut)) head.push({ ...node, text: node.text.slice(0, cut) });
      if (node.text.slice(cut)) tail.push({ ...node, text: node.text.slice(cut) });
    }
    acc = end;
  }
  items.splice(i, 1, head, tail);
  mutate("Split list item", (tx) => {
    tx.update(block.id, { data: engineDataPatch(block.id, { items }) });
  });
  ctx.afterStructuralChange({});
  requestAnimationFrame(() => {
    const el = canvas.querySelector(`[data-child-id="${CSS.escape(block.id)}-li${i + 1}"]`);
    if (el) {
      el.focus();
      setCaret(el, 0);
    }
  });
}

function atFirstLine(editable) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const caret = range.getBoundingClientRect();
  const first = firstLineRect(editable);
  if (!caret || !first) return true;
  return caret.top < first.bottom - 1;
}

function atLastLine(editable) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const caret = range.getBoundingClientRect();
  const last = lastLineRect(editable);
  if (!caret || !last) return true;
  return caret.bottom > last.top + 1;
}

function firstLineRect(editable) {
  const range = document.createRange();
  range.selectNodeContents(editable);
  const rects = range.getClientRects();
  return rects[0] || null;
}

function lastLineRect(editable) {
  const range = document.createRange();
  range.selectNodeContents(editable);
  const rects = range.getClientRects();
  return rects[rects.length - 1] || null;
}

function updateCountsFromDoc() {
  const text = ctx.documentText();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  updateCounts(words, text.length);
}

let statusTimer = 0;
function refreshStatusSoon() {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => import("../panels/footer.js").then((m) => m.refreshStatus()), 200);
}

let layersTimer = 0;
function scheduleLayersRefresh() {
  clearTimeout(layersTimer);
  layersTimer = setTimeout(() => refreshLayers(), 800);
}

const CATALOG_BY_TYPE_MAP = Object.fromEntries(BLOCK_CATALOG.map((d) => [d.type, true]));

// Global widget styles (studio → editor sync): reads Settings → Content
// widgetStyles + active layout colors, applies --wdg-* to :root. Non-blocking;
// failures leave CSS defaults intact.
async function loadWidgetStyles() {
  try {
    const [contentRes, activeRes] = await Promise.all([
      fetch("/acr/api/system/content").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/acr/api/layouts/get/active").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);
    const content = contentRes.data || contentRes || {};
    const styles = content.widgetStyles || {};
    const customCSS = content.widgetCustomCSS || "";
    const activeId = activeRes.id || activeRes.active || null;
    const aid = typeof activeId === "object" ? activeId.id : activeId;
    if (aid) {
      try {
        const cfg = await fetch(`/acr/api/layouts/${encodeURIComponent(aid)}/config`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
        const c = cfg.config?.layout?.colors || cfg.config?.colors || {};
        if (c.primary) document.documentElement.style.setProperty("--layout-color-primary", c.primary);
        if (c.secondary) document.documentElement.style.setProperty("--layout-color-secondary", c.secondary);
      } catch {}
    }
    const root = document.documentElement;
    Object.entries(styles).forEach(([k, v]) => {
      if (v === "" || v == null) return;
      if (k === "--wdg-table-cell-pad-y" || k === "--wdg-table-cell-pad-x") return;
      root.style.setProperty(k, /radius|width|pad/.test(k) && typeof v === "number" ? `${v}px` : String(v));
    });
    if (styles["--wdg-table-cell-pad-y"] != null || styles["--wdg-table-cell-pad-x"] != null) {
      root.style.setProperty("--wdg-table-cell-pad", `${styles["--wdg-table-cell-pad-y"] ?? 10}px ${styles["--wdg-table-cell-pad-x"] ?? 14}px`);
    }
    if (customCSS && !document.getElementById("wdg-global-custom")) {
      const tag = document.createElement("style");
      tag.id = "wdg-global-custom";
      tag.textContent = customCSS;
      document.head.appendChild(tag);
    }
  } catch {}
}

// ─── Boot ────────────────────────────────────────────────────────────────
export async function boot() {
  initStores();
  editor = getEditor();
  ctx.editor = editor;

  // Register catalog widget definitions (extras beyond runtime core set).
  for (const def of BLOCK_CATALOG) {
    if (!editor.engines.definitions.has(def.type)) {
      editor.engines.definitions.register({
        type: def.type,
        category: def.category,
        label: def.label,
        icon: def.icon,
        description: def.description || "",
        version: 1,
        kind: def.capabilities.container ? "container" : def.capabilities.atomic ? "atomic" : "content",
        capabilities: {
          editable: !!def.capabilities.editable,
          draggable: def.capabilities.draggable !== false,
          resizable: false,
          nestable: !!def.capabilities.container,
          deletable: true,
          duplicable: def.capabilities.duplicable !== false,
        },
        allowedParents: def.type === "column" ? ["columns"] : [],
        allowedChildren: def.type === "columns" ? ["column"] : [],
        defaults: {},
        settingsSchema: null,
        renderer: "",
      });
    }
  }

  canvas = document.getElementById("editor-canvas");
  if (!canvas) throw new Error("Editor canvas not found");

  // Module wiring (order: state-safe initializers first).
  initText(ctx);
  initSelection(ctx);
  initKeyboard(ctx);
  initCommands(ctx);
  initSlashMenu(ctx);
  initPalette(ctx);
  initToolbar(ctx);
  initBlockActions(ctx);
  initLayers(ctx);
  initInspector(ctx);
  initPostPanel(ctx);
  initSeoPanel(ctx);
  initWidgets(ctx);
  initPatterns(ctx);
  initInsertion(ctx);
  initDragDrop(ctx);
  initClipboard(ctx);
  initPersistence(ctx);
  initResponsive(ctx);
  initMedia(ctx);
  initCodeEditor(ctx);
  initAi(ctx);
  initContextMenu(ctx);
  initSuggest(ctx);
  initTopbar(ctx);
  initFooter(ctx);
  initOnboarding(ctx);

  bindCanvasSelection();
  bindKeyboard();
  bindCanvasInput();
  bindSidebarTabs();
  applyResponsive();

  // Expose pattern lookup for the late binding above.
  const { patternById } = await import("../panels/patterns.js");
  window.__acrxPatternById = patternById;

  // Load document + libraries.
  State.patch("editor", { isSaving: true });
  refreshStatus();
  let initialLoad = null;
  try {
    const loaded = await loadInitial();
    initialLoad = loaded;
    if (loaded && !loaded.fresh) {
      setDbWidgets(loaded.widgets || []);
      setPatterns(loaded.patterns || []);
      if (loaded.seoReport) {
        State.patch("seo", { report: null });
      }
    }
  } catch (err) {
    showLoadError(err);
    return;
  } finally {
    State.patch("editor", { isSaving: false });
  }

  syncFromEditor(true);
  ctx.render();
  loadWidgetStyles().catch(() => {});
  refreshLayers();
  refreshInspector();
  refreshPost();
  refreshSeo();
  refreshWidgets();
  refreshPatterns();
  refreshBlockActions();
  refreshToolbar();
  refreshBreadcrumbs();
  updateCountsFromDoc();
  refreshStatus();
  // Boot/load leaves a pristine state: restore() events mark dirty, but
  // nothing has actually changed yet.
  editor.engines.editorState.markClean();
  State.patch("editor", { isDirty: false });
  refreshStatus();
  syncSidebarAria();
  booted = true;
  // No document context (direct /acrx/editor visit): offer the creation
  // flow instead of a dead-end empty canvas. Never blocks real documents.
  if (initialLoad && initialLoad.fresh) {
    maybeShowOnboarding(initialLoad).catch(() => {});
  }
}

// Sidebar tabs own visibility (shell behavior); the app refreshes panel
// content when its tab activates so panels always match the active tab.
function bindSidebarTabs() {
  const mapping = {
    "sidebar-left-btn-layers": () => refreshLayers(),
    "sidebar-left-btn-widgets": () => refreshWidgetsSafe(),
    "sidebar-left-btn-patterns": () => refreshPatternsSafe(),
    "sidebar-right-btn-post": () => refreshPost(),
    "sidebar-right-btn-seo": () => { refreshSeo(); refreshAnalysis(); },
    "sidebar-right-btn-settings": () => refreshInspector(),
  };
  document.addEventListener("click", (event) => {
    const tab = event.target.closest ? event.target.closest(".sidebar-tab") : null;
    if (!tab || !tab.id) return;
    // ARIA follows whichever handler owns the class flip (shell tabs or
    // ctx.showPanel) so tab and panel state can never disagree for AT.
    requestAnimationFrame(() => {
      syncSidebarAria();
      try { mapping[tab.id]?.(); } catch (err) {
        toast(err.message || "Panel refresh failed", "error");
      }
    });
  });
}

function refreshWidgetsSafe() {
  import("../panels/widgets.js").then((m) => m.refresh());
}

// Single source of truth for tab/panel agreement: every `.sidebar-tab`
// declares its panel via aria-controls, so active tab and visible panel
// can never disagree — this syncs selection state for assistive tech and
// repairs any bypass (programmatic opens, shell handler races).
function syncSidebarAria() {
  document.querySelectorAll(".sidebar-tab").forEach((tab) => {
    const active = tab.classList.contains("active");
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.setAttribute("tabindex", active ? "0" : "-1");
    const panelId = tab.getAttribute("aria-controls") || (tab.id ? tab.id.replace("btn-", "panel-") : null);
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel && panel.classList.contains("sidebar-panel")) {
      // A panel is visible exactly when its tab is active — enforce it.
      panel.classList.toggle("active", active);
    }
  });
}

function refreshPatternsSafe() {
  import("../panels/patterns.js").then((m) => m.refresh());
}
// Markdown input shortcuts: when the whole text of an empty paragraph is
// exactly a trigger ("# "…"###### ", "> ", "- "/"* ", "1. ", "```"),
// replace it with the canonical block via transform commands. One history
// step per shortcut; caret lands at the start of the new block.
function tryMarkdownShortcut(blockId, editable) {
  const block = ctx.getBlock(blockId);
  if (!block || block.type !== "paragraph") return false;
  // Browsers materialize a trailing typed space as U+00A0 (and leave ZWSP
  // residue), so match against normalized text — never the raw DOM string.
  const text = (editable.textContent || "").replace(/[\u200B\uFEFF]/g, "").replace(/\u00A0/g, " ");
  let type = null;
  let level = 0;
  let m = text.match(/^(#{1,6}) $/);
  if (m) { type = "heading"; level = m[1].length; }
  else if (/^> $/.test(text)) type = "blockquote";
  else if (/^(-|\*) $/.test(text)) type = "bulletList";
  else if (/^1\. $/.test(text)) type = "orderedList";
  else if (/^```(\w*) ?$/.test(text)) type = "codeblock";
  if (!type) return false;
  // Model still holds the pre-trigger content (uncommitted "# " lives only
  // in the DOM): drop focus first so the blur commit and the live-editable
  // skip guard can't resurrect the trigger text or protect stale markup.
  skipIds.delete(blockId);
  if (editable.isConnected) editable.textContent = "";
  if (document.activeElement === editable) editable.blur();
  if (!ctx.transformBlock(blockId, type)) return false;
  // Fold type extras into the same undo step's neighborhood without
  // recording extra steps: unrecorded patches, immediate mirror, repaint.
  if (type === "heading" && level) {
    ctx.setBlockData(blockId, { level }, { record: false, sync: false, refresh: false });
  }
  if (type === "bulletList" || type === "orderedList") {
    ctx.setBlockData(blockId, { items: [""] }, { record: false, sync: false, refresh: false });
  }
  ctx.sync();
  ctx.render();
  refreshInspector();
  focusEditable(blockId, 0);
  return true;
}

function bindCanvasInput() {
  canvas.addEventListener("input", (event) => {
    const editable = event.target.closest ? event.target.closest("[contenteditable='true']") : null;
    if (!editable || editable.id === "canvas-main-input") return;
    const wrap = editable.closest(".block-wrap");
    const blockId = wrap?.getAttribute("data-for-block-id") || editable.getAttribute("data-block-id");
    if (!blockId) return;
    // Markdown input shortcuts (typed in an empty paragraph) translate to
    // canonical transforms — never raw markdown in the model.
    if (tryMarkdownShortcut(blockId, editable)) {
      saveSoon();
      return;
    }
    skipIds.add(blockId);
    handleInput(blockId, editable);
    // Slash trigger detection for text blocks.
    if (editable.textContent === "/" || editable.textContent?.startsWith("/")) {
      handleSlashTrigger(blockId, editable, "/");
    }
    saveSoon();
  });

  canvas.addEventListener("focusin", (event) => {
    const editable = event.target.closest ? event.target.closest("[contenteditable='true']") : null;
    if (!editable || editable.id === "canvas-main-input") return;
    const wrap = editable.closest(".block-wrap");
    const blockId = wrap?.getAttribute("data-for-block-id") || editable.getAttribute("data-block-id");
    if (!blockId) return;
    focusSnapshot = { id: blockId, json: JSON.stringify(editableSurface(ctx.getBlock(blockId))) };
  });

  canvas.addEventListener("focusout", (event) => {
    const editable = event.target.closest ? event.target.closest("[contenteditable='true']") : null;
    if (!editable) return;
    const wrap = editable.closest(".block-wrap");
    const blockId = wrap?.getAttribute("data-for-block-id") || editable.getAttribute("data-block-id");
    if (!blockId) return;
    handleInput(blockId, editable);
    skipIds.delete(blockId);
    // Blur normalizes whitespace-only residue so the placeholder state is
    // truthful the next time this block renders or focuses.
    normalizeEmptyEditable(editable);
    // One undo step per editing session when anything on the typable surface
    // actually changed: revert the live (unrecorded) edits, then run one
    // recorded transaction. The patch goes through engineDataPatch (not the
    // top-level Merge) so items/rows/text land in their settings home.
    if (focusSnapshot && focusSnapshot.id === blockId) {
      const now = JSON.stringify(editableSurface(ctx.getBlock(blockId)));
      if (now !== focusSnapshot.json) {
        const prev = JSON.parse(focusSnapshot.json);
        const next = editableSurface(ctx.getBlock(blockId));
        if (prev && next) {
          const sel = editor.engines.selection.serialize();
          editor.document.updateNode(blockId, { data: engineDataPatch(blockId, prev) });
          mutate("Edit text", (tx) => {
            tx.update(blockId, { data: engineDataPatch(blockId, next) });
          }, { selectionBefore: sel });
        }
      }
      focusSnapshot = null;
    }
    saveSoon();
  });

  // Insert-zone + empty-state actions (delegated).
  canvas.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const name = action.getAttribute("data-action");
    if (name === "insert-here") {
      // Empty-state primary action: insert immediately and focus.
      if (action.closest(".canvas-empty-state")) {
        const id = insertBlockAt("paragraph", {});
        if (id) focusEditable(id, 0);
        return;
      }
      // Between-block zones open the insertion menu at exactly this
      // position (shared insertion model: prepend when afterId is "").
      const afterId = action.getAttribute("data-after") || "";
      import("../menus/slashMenu.js").then((m) => {
        if (!m.openForInsertion(afterId, action.getBoundingClientRect())) {
          const id = afterId ? insertAfterAt(afterId, "paragraph", {}) : insertBlockAt("paragraph", { parentId: editor.document.rootId, index: 0 });
          if (id) focusEditable(id, 0);
        }
      });
      return;
    }
    if (name === "browse-widgets") {
      ctx.showPanel("left", "widgets");
      refreshWidgetsSafe();
      return;
    }
    if (name === "layout-columns" || name === "layout-grid" || name === "layout-hero") {
      const type = name === "layout-columns" ? "columns" : name === "layout-grid" ? "grid" : "hero";
      insertBlockAt(type, {});
      return;
    }
    if (name === "ai-generate") {
      import("../services/ai.js").then((m) => m.openGenerateDialog());
      return;
    }
  });

  // Media-empty blocks carry data-action="pick-media".
  canvas.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-action='edit-code']");
    if (editBtn) {
      const wrap = editBtn.closest(".block-wrap");
      const blockId = wrap?.getAttribute("data-for-block-id");
      if (blockId) openCodeEditor(blockId);
      return;
    }
    const copyBtn = event.target.closest("[data-action='copy-code']");
    if (copyBtn) {
      const wrap = copyBtn.closest(".block-wrap");
      const codeEl = wrap?.querySelector("code [contenteditable='true']") || wrap?.querySelector("code");
      const text = codeEl ? codeEl.textContent || "" : "";
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
          () => toast("Code copied", "success"),
          () => toast("Copy failed", "error")
        );
      } else {
        toast("Clipboard unavailable", "error");
      }
      return;
    }
    const dismiss = event.target.closest("[data-action='dismiss-alert']");
    if (dismiss) {
      // Editor preview of dismiss behavior; the model is untouched.
      dismiss.closest(".acrx-alert")?.classList.toggle("is-dismissed");
      return;
    }
    const tabBtn = event.target.closest("[data-tab-index]");
    if (tabBtn) {
      // Canvas preview of tab switching (editor-only); the model default
      // stays untouched — persistence keeps the author's active tab.
      const root = tabBtn.closest(".acrx-tabs");
      const idx = Number(tabBtn.getAttribute("data-tab-index"));
      root?.querySelectorAll(".acrx-tab-btn").forEach((b, i) => {
        b.classList.toggle("is-active", i === idx);
        b.setAttribute("aria-selected", i === idx ? "true" : "false");
      });
      root?.querySelectorAll(".acrx-tab-pane").forEach((p, i) => {
        p.classList.toggle("is-active", i === idx);
        if (i === idx) p.removeAttribute("hidden");
        else p.setAttribute("hidden", "");
      });
      return;
    }
    const pick = event.target.closest("[data-action='pick-media']");
    if (!pick) return;
    const wrap = pick.closest(".block-wrap");
    const blockId = wrap?.getAttribute("data-for-block-id");
    if (!blockId) return;
    const block = ctx.getBlock(blockId);
    if (block.type === "gallery") pickForBlock(blockId, "images", "image", true);
    else if (block.type === "video") pickForBlock(blockId, "src", "video");
    else if (block.type === "audio") pickForBlock(blockId, "src", "audio");
    else pickForBlock(blockId, "src", "image");
  });

  // Double-click a Code Block opens the code editor for that block.
  canvas.addEventListener("dblclick", (event) => {
    const wrap = event.target.closest ? event.target.closest(".block-wrap") : null;
    const blockId = wrap?.getAttribute("data-for-block-id");
    const block = blockId ? ctx.getBlock(blockId) : null;
    if (block && block.type === "codeblock") {
      // Let a text-selection dblclick inside the editable behave natively;
      // dblclick on the code chrome (bar, gutter, line numbers) edits.
      if (event.target.closest && event.target.closest("code [contenteditable='true']")) return;
      event.preventDefault();
      openCodeEditor(blockId);
    }
  });

  // Code blocks: Tab inserts two spaces instead of leaving the editor.
  canvas.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const editable = event.target.closest ? event.target.closest("[contenteditable='true']") : null;
    if (!editable) return;
    const wrap = editable.closest(".block-wrap");
    const blockId = wrap?.getAttribute("data-for-block-id");
    const block = blockId ? ctx.getBlock(blockId) : null;
    if (!block || block.type !== "codeblock") return;
    event.preventDefault();
    document.execCommand("insertText", false, "  ");
  });

  // Main input: Enter creates the first block.
  document.getElementById("canvas-main-input")?.addEventListener("input", (event) => syncEmptyState(event.target));
  document.getElementById("canvas-main-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      ctx.insertFromMainInput(event.target);
    }
  });
}

function showLoadError(err) {
  State.patch("editor", { isSaving: false, saveError: err.message });
  canvas.insertAdjacentHTML("afterbegin",
    `<div class="canvas-load-error"><i class="fa-duotone fa-triangle-exclamation"></i>` +
    `<p class="canvas-load-title">Could not load this document</p>` +
    `<p class="canvas-load-text">${String(err.message || err).replace(/</g, "&lt;")}</p>` +
    `<button type="button" class="axed-btn axed-primary" data-action="retry-load">Retry</button></div>`);
  canvas.querySelector("[data-action='retry-load']")?.addEventListener("click", () => {
    canvas.querySelector(".canvas-load-error")?.remove();
    boot().catch(() => {});
  });
  refreshStatus();
}

export function getCtx() {
  return ctx;
}

// Headless-test seam for the lossless-transform matrix (P0-07).
export { blockTextLines, carryTransformContent };

// Public debug/testing handle (read-only facade, no new capabilities).
if (typeof window !== "undefined") {
  window.AcroxaEditor = {
    get ctx() { return ctx; },
    get editor() { return editor; },
    get booted() { return booted; },
  };
}

export default { boot, getCtx };
