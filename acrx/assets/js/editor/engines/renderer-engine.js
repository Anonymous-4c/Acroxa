// acrx/assets/js/editor/engines/renderer-engine.js
//
// ENGINE 14 — Renderer Engine (headless).
// Converts document/widget state into HTML strings: Document -> Renderer ->
// Editor DOM | Preview DOM | Export HTML. String output (no live DOM) keeps
// it deterministic and testable. Element construction mirrors the Acroxa
// framework el()/div() helpers (same escaping, void-element and attribute
// semantics); the eventual DOM layer parses/inserts these strings.

import { toHTML as inlineToHTML } from "./rich-text-engine.js";
import { styleToCSSProperties } from "./style-engine.js";
import { layoutToCSSProperties } from "./layout-engine.js";
import { resolveTree } from "./responsive-engine.js";

export const RENDERER_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "renderer";

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function escapeAttrValue(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtmlText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const toKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function normalizeAttrName(key) {
  if (key.startsWith("data") && key.length > 4 && /[A-Z]/.test(key[4])) return "data-" + toKebab(key.slice(4));
  if (key.startsWith("aria") && key.length > 4 && /[A-Z]/.test(key[4])) return "aria-" + toKebab(key.slice(4));
  if (/[A-Z]/.test(key)) return toKebab(key);
  return key;
}

// Framework-compatible element builder: el(tag, attrs, ...children) -> string.
export function el(tag, attrs = {}, ...children) {
  const name = String(tag).toLowerCase().trim();
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    const err = new Error(`Invalid element tag "${tag}".`);
    err.name = "RendererError"; err.code = "BAD_TAG"; err.engine = ENGINE_ID; err.operation = "el";
    throw err;
  }
  let html = `<${name}`;
  for (const [rawKey, value] of Object.entries(attrs || {})) {
    const attrKey = normalizeAttrName(rawKey);
    if (value === true) html += ` ${attrKey}`;
    else if (value !== null && value !== undefined && value !== false) html += ` ${attrKey}="${escapeAttrValue(value)}"`;
  }
  if (VOID_ELEMENTS.has(name)) return html + " />";
  html += ">";
  for (const child of children) {
    if (child === null || child === undefined) continue;
    html += String(child);
  }
  return html + `</${name}>`;
}

export function escapeHtml(value) {
  return escapeHtmlText(value);
}

const SEMANTIC_TAGS = {
  paragraph: "p", blockquote: "blockquote", codeblock: "pre", divider: "hr",
  image: "img", columns: "div", column: "div", container: "div", group: "div",
  button: "a", list: "ul", bulletList: "ul", orderedList: "ol", listItem: "li",
  table: "table", embed: "div", hero: "section", alert: "div", heading: "h2",
};

function headingTag(level) {
  const n = Math.max(1, Math.min(6, Number(level) || 2));
  return `h${n}`;
}

function renderError(operation, code, message) {
  const err = new Error(message);
  err.name = "RendererError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function cssPropsToString(props) {
  return Object.keys(props).sort().map((k) => `${k}:${props[k]}`).join(";");
}

export function createRenderer(options = {}) {
  const h = options.h || el;
  const registry = options.registry || null; // widget-renderer-registry (duck-typed)
  const hooks = new Map();

  function emitHook(event, payload) {
    const set = hooks.get(event);
    if (!set) return payload.html;
    let html = payload.html;
    for (const cb of [...set]) {
      try {
        const out = cb({ engine: ENGINE_ID, event, node: payload.node, ctx: payload.ctx, html });
        if (typeof out === "string") html = out;
      } catch (err) {
        if (typeof console !== "undefined") console.error(`[renderer] hook for "${event}" threw:`, err);
      }
    }
    return html;
  }

  function nodeStyle(node, breakpoint) {
    const data = (node && node.data) || {};
    const styleTree = data.style && typeof data.style === "object" ? data.style : {};
    const layoutTree = data.layout && typeof data.layout === "object" ? data.layout : {};
    const style = resolveTree(styleTree, breakpoint);
    const layout = resolveTree(layoutTree, breakpoint);
    const props = { ...layoutToCSSProperties(layout), ...styleToCSSProperties(style) };
    if (data.hidden === true) props.display = "none";
    return cssPropsToString(props);
  }

  function defaultRender(node, ctx) {
    const data = (node && node.data) || {};
    const tag = node.type === "heading" ? headingTag(data.level) : (SEMANTIC_TAGS[node.type] || "div");
    const attrs = {};
    if (ctx.mode !== "export") {
      attrs["data-block-id"] = node.id;
      attrs.id = `block-${node.id}`;
    }
    if (data.customId) attrs.id = data.customId;
    const cls = ["acrx-block", `acrx-${node.type}`, data.customClasses || ""].filter(Boolean).join(" ").trim();
    if (cls) attrs.class = cls;
    const style = nodeStyle(node, ctx.breakpoint);
    if (style) attrs.style = style;
    if (tag === "img") {
      if (data.src) attrs.src = data.src;
      attrs.alt = data.alt || "";
      return h("img", attrs);
    }
    if (tag === "hr") return h("hr", attrs);
    if (tag === "a") {
      if (data.href) attrs.href = data.href;
      const label = data.text !== undefined ? escapeHtmlText(data.text) : ctx.childrenHtml;
      return h("a", attrs, label);
    }
    let inner = ctx.childrenHtml || "";
    if (!inner) {
      if (Array.isArray(data.content)) inner = inlineToHTML(data.content);
      else if (data.text !== undefined) inner = escapeHtmlText(data.text);
      else if (data.html !== undefined && ctx.trustedHtml) inner = String(data.html);
      else if (data.html !== undefined) inner = escapeHtmlText(String(data.html).replace(/<[^>]*>/g, ""));
    }
    return h(tag, attrs, inner);
  }

  const renderer = {
    get engine() { return ENGINE_ID; },
    get version() { return RENDERER_ENGINE_VERSION; },
    el: h,
    escapeHtml,

    renderNode(node, opts = {}) {
      if (!node || typeof node !== "object" || !node.id || !node.type) {
        throw renderError("renderNode", "INVALID_NODE", "Renderer requires a node with id and type.");
      }
      const ctx = {
        mode: opts.mode || "editor",
        breakpoint: opts.breakpoint || "desktop",
        childrenHtml: opts.childrenHtml || "",
        trustedHtml: !!opts.trustedHtml,
      };
      let entry = null;
      if (registry && typeof registry.resolve === "function") {
        try { entry = registry.resolve(node.type, ctx.mode) || registry.resolve(node.type); } catch { entry = null; }
      }
      let html;
      if (entry && typeof entry.render === "function") {
        try {
          html = entry.render(JSON.parse(JSON.stringify(node)), { ...ctx, h, defaultRender: (n, o) => defaultRender(n, { ...ctx, ...(o || {}) }) });
        } catch (err) {
          throw renderError("renderNode", "RENDER_FAILED", `Renderer for "${node.type}" failed: ${err.message}.`);
        }
        if (typeof html !== "string") {
          throw renderError("renderNode", "BAD_RENDER_OUTPUT", `Renderer for "${node.type}" must return an HTML string.`);
        }
      } else if (registry && typeof registry.getFallback === "function" && registry.getFallback()) {
        const fb = registry.getFallback().render;
        html = fb(JSON.parse(JSON.stringify(node)), { ...ctx, h, defaultRender: (n, o) => defaultRender(n, { ...ctx, ...(o || {}) }) });
      } else if (registry) {
        throw renderError("renderNode", "NO_RENDERER", `No renderer registered for "${node.type}" and no fallback set.`);
      } else {
        html = defaultRender(node, ctx);
      }
      return emitHook("render:node", { node, ctx, html });
    },

    // Duck-typed document: { rootId, getNode(id), childrenOf(id) }.
    renderDocument(doc, opts = {}) {
      if (!doc || typeof doc.getNode !== "function") {
        throw renderError("renderDocument", "INVALID_DOCUMENT", "Renderer requires a document with getNode().");
      }
      const ctx = { mode: opts.mode || "editor", breakpoint: opts.breakpoint || "desktop", trustedHtml: !!opts.trustedHtml };
      const renderSubtree = (nodeId) => {
        const node = doc.getNode(nodeId);
        if (!node) return "";
        const kids = typeof doc.childrenOf === "function" ? doc.childrenOf(node.id) : [];
        const childrenHtml = kids.map((k) => renderSubtree(k.id)).join("");
        return renderer.renderNode(node, { ...ctx, childrenHtml });
      };
      const root = doc.getNode(doc.rootId);
      if (!root) throw renderError("renderDocument", "NO_ROOT", "Document has no resolvable root.");
      const kids = typeof doc.childrenOf === "function" ? doc.childrenOf(root.id) : [];
      const html = kids.map((k) => renderSubtree(k.id)).join("");
      return emitHook("render:document", { node: root, ctx, html });
    },

    domIdFor(blockId) {
      return `block-${blockId}`;
    },

    blockIdFromDomId(domId) {
      const m = /^block-(.+)$/.exec(String(domId || ""));
      return m ? m[1] : null;
    },

    on(event, cb) {
      if (!["render:node", "render:document"].includes(event)) {
        throw renderError("on", "INVALID_EVENT", `Unknown renderer event "${event}".`);
      }
      if (typeof cb !== "function") throw renderError("on", "INVALID_LISTENER", "Listener must be a function.");
      if (!hooks.has(event)) hooks.set(event, new Set());
      hooks.get(event).add(cb);
      return () => renderer.off(event, cb);
    },

    off(event, cb) {
      const set = hooks.get(event);
      if (!set) return;
      if (cb) { set.delete(cb); if (set.size === 0) hooks.delete(event); }
      else hooks.delete(event);
    },
  };

  return renderer;
}

export default createRenderer;
