// src/view.js — DOM projection (model → DOM only)

import { isText, nodeTextLength } from "./model.js";

// ─── Host block renderers ────────────────────────────────────────────────────
//
// The engine knows how to project its built-in text structures (paragraphs,
// lists, tables…). Hosts register renderers for their own block types —
// image cards, heroes, buttons, embeds — so the canvas shows a real preview
// instead of an anonymous <div>.
//
// A host renderer receives (node, schema) and returns the INNER element for
// the block. The projection wrapper (data-node-type / data-path, children)
// is still applied here, so selection mapping keeps working unchanged.
const HOST_RENDERERS = new Map();

export function setHostBlockRenderer(type, fn) {
  if (typeof fn === "function") HOST_RENDERERS.set(type, fn);
  else HOST_RENDERERS.delete(type);
}

export function hasHostBlockRenderer(type) {
  return HOST_RENDERERS.has(type);
}

// Map mark types to tag names
const MARK_TAGS = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strikethrough: "s",
  code: "code",
  link: "a",
};

// Create a DOM element for a single AST node
// blockIndex and textIndex are used to add data-path attributes
export function renderNode(node, schema, path = []) {
  if (!node) return document.createTextNode("");

  if (node.type === "text") {
    return renderTextNode(node, path);
  }

  return renderBlock(node, schema, path);
}

// Render a text node
function renderTextNode(node, path) {
  if (!node.text) {
    // Empty text node — render a zero-width space for visibility
    const span = document.createElement("span");
    span.setAttribute("data-empty-text", "true");
    span.setAttribute("data-path", JSON.stringify(path));
    span.textContent = "\u200B";
    return span;
  }

  if (!node.marks || node.marks.length === 0) {
    const textNode = document.createTextNode(node.text);
    // We can't add data-path to a text node directly, so we wrap it
    if (path.length > 0) {
      const span = document.createElement("span");
      span.setAttribute("data-path", JSON.stringify(path));
      span.appendChild(textNode);
      return span;
    }
    return textNode;
  }

  // Wrap with mark elements
  let el = document.createTextNode(node.text);
  for (const mark of node.marks) {
    const tag = MARK_TAGS[mark.type] || "span";
    const wrapper = document.createElement(tag);
    if (mark.type === "link" && mark.attrs?.href) {
      wrapper.setAttribute("href", mark.attrs.href);
    }
    wrapper.setAttribute("data-mark", mark.type);
    wrapper.appendChild(el);
    el = wrapper;
  }

  // Add data-path to the outermost wrapper
  if (path.length > 0) {
    el.setAttribute("data-path", JSON.stringify(path));
  }
  return el;
}

// Render a block node
function renderBlock(node, schema, path) {
  const host = HOST_RENDERERS.get(node.type);
  if (host) {
    // Host-rendered block: the wrapper still carries identity attributes so
    // dom-utils can map DOM → model for selection and scrolling.
    let inner;
    try {
      inner = host(node, schema);
    } catch (err) {
      inner = document.createElement("div");
      inner.className = "acrx-block-render-error";
      inner.textContent = `Render error: ${node.type}`;
    }
    const wrap = document.createElement("div");
    wrap.setAttribute("data-node-type", node.type);
    if (path.length > 0) {
      wrap.setAttribute("data-path", JSON.stringify(path));
    }
    if (inner) {
      wrap.appendChild(inner);
      // Container hosts declare their child mount point; the engine fills it
      // so nested blocks keep full text-editing + selection behavior.
      const slot = inner.matches?.("[data-children-slot]")
        ? inner
        : inner.querySelector?.(":scope > [data-children-slot]");
      if (slot) {
        const kids = node.content || [];
        for (let i = 0; i < kids.length; i++) {
          slot.appendChild(renderNode(kids[i], schema, [...path, "content", i]));
        }
        delete slot.dataset.childrenSlot;
        slot.removeAttribute("data-children-slot");
      }
    }
    return wrap;
  }

  let el;

  switch (node.type) {
    case "heading": {
      const tag = `h${node.attrs?.level || 1}`;
      el = document.createElement(tag);
      break;
    }
    case "paragraph":
      el = document.createElement("p");
      break;
    case "blockquote":
      el = document.createElement("blockquote");
      break;
    case "codeblock":
      el = document.createElement("pre");
      break;
    case "bulletList":
    case "orderedList":
    case "taskList":
      el = document.createElement(node.type === "orderedList" ? "ol" : "ul");
      if (node.type === "taskList") el.setAttribute("data-task-list", "true");
      // Marker style is a model attr, projected to CSS.
      if (node.attrs?.markerStyle) {
        el.style.listStyleType = node.attrs.markerStyle;
      }
      break;
    case "listItem":
    case "taskItem": {
      el = document.createElement("li");
      // Task items render a checkbox reflecting attrs.checked. It is
      // contenteditable=false so the caret never lands inside it.
      if (typeof node.attrs?.checked === "boolean") {
        el.setAttribute("data-checked", String(node.attrs.checked));
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = node.attrs.checked;
        box.setAttribute("contenteditable", "false");
        box.setAttribute("data-task-checkbox", "true");
        el.appendChild(box);
      }
      break;
    }
    case "table":
      el = document.createElement("table");
      if (node.attrs?.headerRow) el.setAttribute("data-header-row", "true");
      if (node.attrs?.headerCol) el.setAttribute("data-header-col", "true");
      break;
    case "tableRow":
      el = document.createElement("tr");
      break;
    case "tableCell": {
      // Header cells become <th> so the projection matches the model.
      el = document.createElement(node.attrs?.header ? "th" : "td");
      // `scope` is what lets a screen reader associate data cells with their
      // header; a bare <th> is not enough.
      if (node.attrs?.header) {
        el.setAttribute("scope", node.attrs.headerCol ? "row" : "col");
      }
      // colspan/rowspan are load-bearing for merged cells — without these the
      // merge exists in the model but is invisible in the DOM.
      const cs = node.attrs?.colspan;
      const rs = node.attrs?.rowspan;
      if (cs && cs > 1) el.setAttribute("colspan", String(cs));
      if (rs && rs > 1) el.setAttribute("rowspan", String(rs));
      if (node.attrs?.align) el.style.textAlign = node.attrs.align;
      break;
    }
    default:
      el = document.createElement("div");
      break;
  }

  el.setAttribute("data-node-type", node.type);
  if (path.length > 0) {
    el.setAttribute("data-path", JSON.stringify(path));
  }

  for (let i = 0; i < (node.content || []).length; i++) {
    const child = node.content[i];
    const childPath = [...path, "content", i];
    el.appendChild(renderNode(child, schema, childPath));
  }

  // Ensure empty blocks have height
  if (!node.content || node.content.length === 0) {
    el.innerHTML = "<br>";
  }

  return el;
}

// Render a full document into a DocumentFragment
export function renderDocument(doc, schema) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < (doc.content || []).length; i++) {
    fragment.appendChild(renderNode(doc.content[i], schema, ["content", i]));
  }
  return fragment;
}

// Sync the editor's content element with the model.
//
// Incremental reconciliation. A full innerHTML rebuild costs O(document) on
// EVERY keystroke, which measured 169ms on a 2000-block document — far past
// the 16ms frame budget, so typing visibly stalled. Blocks are compared
// against a cached signature and only the ones that actually changed are
// re-rendered, making a keystroke O(changed blocks) instead.
//
// The model remains the single source of truth: this only decides how much
// of the projection to recompute, never what it contains.
export function syncView(contentEl, doc, schema) {
  const blocks = doc.content || [];
  const prev = contentEl.__sig || [];
  const next = blocks.map(signature);

  // Structural change (block added/removed) — rebuild wholesale.
  if (prev.length !== blocks.length) {
    contentEl.innerHTML = "";
    contentEl.appendChild(renderDocument(doc, schema));
    contentEl.__sig = next;
    return contentEl;
  }

  // Same block count: replace only the blocks whose signature changed.
  for (let i = 0; i < blocks.length; i++) {
    if (prev[i] === next[i]) continue;
    const fresh = renderNode(blocks[i], schema, ["content", i]);
    const existing = contentEl.children[i];
    if (existing) contentEl.replaceChild(fresh, existing);
    else contentEl.appendChild(fresh);
  }
  contentEl.__sig = next;
  return contentEl;
}

// Cheap structural fingerprint of a block. Any change to type, attrs, text or
// marks produces a different string, so equality means "safe to keep".
function signature(node) {
  if (!node) return "";
  if (node.type === "text") {
    const m = (node.marks || []).map((k) =>
      k.type + (k.attrs ? JSON.stringify(k.attrs) : "")).join(",");
    return `t:${node.text}|${m}`;
  }
  const attrs = node.attrs && Object.keys(node.attrs).length
    ? JSON.stringify(node.attrs) : "";
  const kids = (node.content || []).map(signature).join("\u0001");
  return `${node.type}${attrs}(${kids})`;
}

// Drop the cache — forces the next sync to rebuild everything.
export function invalidateView(contentEl) {
  if (contentEl) contentEl.__sig = null;
}

// Empty blocks already get their <br> during renderBlock(), so this is a
// no-op kept for API compatibility. It used to run querySelectorAll over the
// whole document on every sync, which was O(document) per keystroke.
export function ensureEmptyBlockHeight(el) {
  return el;
}
