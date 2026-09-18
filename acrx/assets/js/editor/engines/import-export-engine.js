// acrx/assets/js/editor/engines/import-export-engine.js
//
// ENGINE 24 — Import/Export Engine (headless, extensible).
// Conversion pipelines between document JSON and external formats: format
// detection, registered importer/exporter pipelines, sanitization of foreign
// input and migration hooks. HTML/Markdown/RTE/text pipelines are built in;
// hosts register more via registerImporter/registerExporter.

export const IMPORT_EXPORT_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "import-export";

function ieError(operation, code, message) {
  const err = new Error(message);
  err.name = "ImportExportError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

import { fromInlineHTML, plainText as richPlainText } from "./rich-text-engine.js";
import { sanitizeHTML } from "./clipboard-engine.js";

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#([0-9]+);?/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&nbsp;/gi, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'");
}

function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]*>/g, "")).trim();
}

let nodeCounter = 0;
function cuid(prefix) {
  return `${prefix}_${(++nodeCounter).toString(36)}`;
}

// HTML import: tolerant block walk over sanitized markup. Block map
// (h1-6→heading+level, p/div→paragraph, li→items, img→image+alt,
// table→table rows, pre→codeblock+language, blockquote, hr→divider) plus
// the inline map (strong/b, em/i, u, s/strike/del→strikethrough, code,
// a→link+href, br) shared with the rich-text engine. Unknown structure
// unwraps to its text — characters are never dropped.
const IMPORT_BLOCK_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "blockquote", "pre",
  "ul", "ol", "li", "table", "tr", "td", "th", "thead", "tbody", "tfoot",
  "hr", "img", "section", "article", "header", "footer", "figure", "figcaption",
]);

function attrOf(attrStr, name) {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrStr || "");
  return m ? decodeEntities(m[2] || m[3] || m[4] || "") : "";
}

function codeLanguage(attrStr) {
  const cls = attrOf(attrStr, "class");
  const m = /(?:language|lang)-([\w+-]+)/i.exec(cls) || /([\w+-]+)/.exec(attrOf(attrStr, "data-language"));
  return m ? m[1].toLowerCase() : "";
}

export function htmlToNodes(html) {
  const clean = sanitizeHTML(String(html || ""));
  const nodes = [];
  const push = (type, data) => nodes.push({ id: cuid("imp"), type, parentId: null, children: [], data });
  const pushInlineBlock = (type, extra, buf) => {
    const content = fromInlineHTML(buf);
    if (!richPlainText(content)) return;
    push(type, { ...extra, content });
  };

  // Stack frames. Inline HTML accumulates in the nearest buf-holder
  // (block / cell / root) or the open list item; lists and tables collect
  // structured rows. Tags inside <pre> vanish so code stays literal.
  const root = { kind: "root", buf: "" };
  const stack = [root];
  const routeInline = (str) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i];
      if (f.kind === "pre") return;
      if (f.kind === "item" && f.list) { f.list.current += str; return; }
      if (f.kind === "cell" || f.kind === "block" || f.kind === "root") { f.buf += str; return; }
    }
    root.buf += str;
  };
  const holder = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i];
      if ((f.kind === "block" || f.kind === "cell" || f.kind === "root") && f.buf !== undefined) return f;
    }
    return root;
  };
  const flushBlock = (frame) => {
    const buf = frame.buf;
    frame.buf = "";
    const tag = frame.tag;
    if (tag === "pre") {
      const text = decodeEntities(stripTags(buf));
      if (text) push("codeblock", { content: [{ type: "text", text, marks: [] }], language: codeLanguage(frame.codeAttrs || frame.attrs) });
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      pushInlineBlock("heading", { level: Number(tag[1]) }, buf);
    } else if (tag === "blockquote") {
      pushInlineBlock("blockquote", {}, buf);
    } else {
      pushInlineBlock("paragraph", {}, buf);
    }
  };
  const flushItem = (list) => {
    if (!list) return;
    const text = stripTags(String(list.current || "").replace(/<br\s*\/?>/gi, " "));
    list.current = "";
    if (text) list.items.push(text);
  };

  const token = /<\/?([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?\/?>|([^<>]+)/g;
  let m;
  while ((m = token.exec(clean)) !== null) {
    if (m[3] !== undefined) {
      const top = stack[stack.length - 1];
      if (top.kind === "pre") top.buf += m[3];
      else routeInline(m[3]);
      continue;
    }
    const tag = m[1].toLowerCase();
    const closing = m[0][1] === "/";
    const attrs = m[2] || "";
    const selfClosing = /\/\s*>$/.test(m[0]) || tag === "img" || tag === "br" || tag === "hr";
    const top = stack[stack.length - 1];

    if (tag === "img" && !closing) {
      const h = holder();
      if (h.kind === "block" && stripTags(h.buf)) { flushBlock(h); }
      else if (h.kind !== "block") {
        const content = fromInlineHTML(h.buf || "");
        if (richPlainText(content)) {
          if (h.kind === "item") { const l = stack.find((f) => f.kind === "list"); flushItem(l); }
          else { push("paragraph", { content }); }
        }
        h.buf = "";
      }
      const src = attrOf(attrs, "src");
      if (src) push("image", { src, alt: attrOf(attrs, "alt") });
      continue;
    }
    if (tag === "hr" && !closing) {
      const h = holder();
      if (h.kind === "block") flushBlock(h);
      else if (stripTags(h.buf || "")) { push("paragraph", { content: fromInlineHTML(h.buf) }); h.buf = ""; }
      push("divider", {});
      continue;
    }
    if (tag === "br" && !closing) { routeInline("<br>"); continue; }
    if (tag === "pre" && !closing) { stack.push({ kind: "pre", tag, attrs, buf: "" }); continue; }
    if (tag === "pre" && closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === "pre") { const [pre] = stack.splice(i, 1); flushBlock(pre); break; }
      }
      continue;
    }
    if ((tag === "ul" || tag === "ol") && !closing) {
      // Flush any open item text first (a nested list starts after it),
      // then join the enclosing list (flattened, depth-counted) or flush
      // the surrounding block and open a fresh list.
      let enclosing = null;
      for (let i = stack.length - 1; i >= 0; i--) {
        const f = stack[i];
        if (f.kind === "item" && f.list) { flushItem(f.list); enclosing = f.list; break; }
        if (f.kind === "list") { enclosing = f; break; }
        if (f.kind === "table" || f.kind === "block") break;
      }
      if (!enclosing) {
        const h = holder();
        if (h.kind === "block" && stripTags(h.buf)) flushBlock(h);
        else if (stripTags(h.buf || "")) {
          for (const chunk of String(h.buf).split(/\n\s*\n/)) {
            const content = fromInlineHTML(chunk);
            if (richPlainText(content)) push("paragraph", { content });
          }
          h.buf = "";
        }
      }
      if (enclosing) {
        flushItem(enclosing);
        enclosing.depth = (enclosing.depth || 0) + 1;
      } else {
        stack.push({ kind: "list", ordered: tag === "ol", items: [], current: "", depth: 0 });
      }
      continue;
    }
    if ((tag === "ul" || tag === "ol") && closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === "list") {
          const list = stack[i];
          if ((list.depth || 0) > 0) { flushItem(list); list.depth--; }
          else {
            stack.splice(i, 1);
            flushItem(list);
            if (list.items.length > 0) push(list.ordered ? "orderedList" : "bulletList", { items: list.items });
          }
          break;
        }
      }
      continue;
    }
    if (tag === "li" && !closing) {
      let list = [...stack].reverse().find((f) => f.kind === "list");
      if (!list) { list = { kind: "list", ordered: false, items: [], current: "", fresh: false }; stack.push(list); }
      if (list.current && stripTags(list.current)) flushItem(list);
      list.current = "";
      list.inItem = true;
      stack.push({ kind: "item", list });
      continue;
    }
    if (tag === "li" && closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === "item") {
          const [item] = stack.splice(i, 1);
          if (item.list) flushItem(item.list);
          break;
        }
      }
      continue;
    }
    if (tag === "table" && !closing) {
      const h = holder();
      if (h.kind === "block" && stripTags(h.buf)) flushBlock(h);
      stack.push({ kind: "table", rows: [], hasHeader: false });
      continue;
    }
    if (tag === "table" && closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === "table") {
          const [table] = stack.splice(i, 1);
          const rows = table.rows.filter((r) => r.length > 0);
          if (rows.length > 0) push("table", { rows, hasHeader: table.hasHeader });
          break;
        }
      }
      continue;
    }
    if (tag === "tr" && !closing) { stack.push({ kind: "row", cells: [] }); continue; }
    if (tag === "tr" && closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === "row") {
          const [row] = stack.splice(i, 1);
          const table = [...stack].reverse().find((f) => f.kind === "table");
          if (table && row.cells.length > 0) table.rows.push(row.cells);
          break;
        }
      }
      continue;
    }
    if ((tag === "td" || tag === "th") && !closing) {
      const table = [...stack].reverse().find((f) => f.kind === "table");
      if (table && tag === "th" && table.rows.length === 0) table.hasHeader = true;
      stack.push({ kind: "cell", buf: "" });
      continue;
    }
    if ((tag === "td" || tag === "th") && closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === "cell") {
          const [cell] = stack.splice(i, 1);
          const row = [...stack].reverse().find((f) => f.kind === "row");
          if (row) row.cells.push(stripTags(cell.buf));
          break;
        }
      }
      continue;
    }
    if (IMPORT_BLOCK_TAGS.has(tag) && !closing) {
      stack.push({ kind: "block", tag, attrs, buf: "" });
      continue;
    }
    if (IMPORT_BLOCK_TAGS.has(tag) && closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === "block" && stack[i].tag === tag) {
          const [frame] = stack.splice(i, 1);
          flushBlock(frame);
          break;
        }
      }
      continue;
    }
    // Inline or unknown tags ride into the nearest buffer; the inline
    // parser unwraps what it does not know. A <code> class inside <pre>
    // carries the fence language.
    const peek = stack[stack.length - 1];
    if (peek.kind === "pre" && !closing) peek.codeAttrs = peek.codeAttrs || attrs;
    routeInline(m[0]);
  }
  // Drain anything left open (truncated clipboard HTML is common).
  for (let i = stack.length - 1; i >= 0; i--) {
    const f = stack[i];
    if (f.kind === "block" || f.kind === "pre") flushBlock(f);
    else if (f.kind === "item" && f.list) flushItem(f.list);
    else if (f.kind === "cell") {
      const row = stack.find((x) => x.kind === "row");
      if (row) row.cells.push(stripTags(f.buf));
    }
  }
  for (const f of stack) {
    if (f.kind === "list") {
      if (f.items.length > 0) {
        const last = nodes[nodes.length - 1];
        if (last && ((f.ordered && last.type === "orderedList") || (!f.ordered && last.type === "bulletList"))) last.data.items.push(...f.items);
        else push(f.ordered ? "orderedList" : "bulletList", { items: f.items });
      }
    } else if (f.kind === "row") {
      const rows = f.cells.length > 0 ? [f.cells] : [];
      if (rows.length > 0) push("table", { rows, hasHeader: false });
    } else if (f.kind === "table") {
      const rows = f.rows.filter((r) => r.length > 0);
      if (rows.length > 0) push("table", { rows, hasHeader: f.hasHeader });
    }
  }
  if (stripTags(root.buf || "")) {
    for (const chunk of String(root.buf).split(/\n\s*\n/)) {
      const content = fromInlineHTML(chunk);
      if (richPlainText(content)) push("paragraph", { content });
    }
  }
  if (nodes.length === 0 && stripTags(clean)) push("paragraph", { content: fromInlineHTML(clean) });
  return nodes;
}

// Minimal Markdown import: headings, fences, lists, quotes, paragraphs.
export function markdownToNodes(markdown) {
  const nodes = [];
  const push = (type, data) => nodes.push({ id: cuid("imp"), type, parentId: null, children: [], data });
  const lines = String(markdown || "").split(/\r?\n/);
  let para = [];
  let fence = null;
  let list = null;
  const flushPara = () => {
    const text = para.join(" ").trim();
    para = [];
    if (text) push("paragraph", { text });
  };
  const flushList = () => {
    if (list && list.items.length > 0) push(list.ordered ? "orderedList" : "bulletList", { items: list.items });
    list = null;
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (fence) { push("codeblock", { text: fence.join("\n"), language: "" }); fence = null; }
      else { flushPara(); flushList(); fence = []; }
      continue;
    }
    if (fence) { fence.push(line); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); push("heading", { level: h[1].length, text: h[2].trim() }); continue; }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const ordered = /^\d/.test(li[1]);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(li[2].trim());
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) { flushPara(); flushList(); push("blockquote", { text: quote[1].trim() }); continue; }
    if (/^\s*---+\s*$/.test(line)) { flushPara(); flushList(); push("divider", {}); continue; }
    if (line.trim() === "") { flushPara(); flushList(); continue; }
    para.push(line.trim());
  }
  if (fence) push("codeblock", { text: fence.join("\n"), language: "" });
  flushPara();
  flushList();
  return nodes;
}

function nodeInlineText(d) {
  if (Array.isArray(d.content)) {
    return d.content.filter((c) => c?.type === "text").map((c) => c.text || "").join("");
  }
  return "";
}

export function nodesToMarkdown(nodes) {
  const out = [];
  for (const node of nodes || []) {
    const d = node.data || {};
    const text = nodeInlineText(d) || d.text || "";
    switch (node.type) {
      case "heading": out.push(`${"#".repeat(Math.min(6, Math.max(1, d.level || 2)))} ${text}`); break;
      case "paragraph": if (text) out.push(text); break;
      case "blockquote": if (text) out.push(`> ${text}`); break;
      case "codeblock": out.push(`\`\`\`${d.language || ""}\n${text}\n\`\`\``); break;
      case "bulletList": for (const item of d.items || []) out.push(`- ${item}`); break;
      case "orderedList": (d.items || []).forEach((item, i) => out.push(`${i + 1}. ${item}`)); break;
      case "image": out.push(`![${d.alt || ""}](${d.src || ""})`); break;
      case "divider": out.push("---"); break;
      default:
        if (text) out.push(text);
        break;
    }
  }
  return out.join("\n\n");
}

export function nodesToText(nodes) {
  const parts = [];
  for (const node of nodes || []) {
    const d = node.data || {};
    if (typeof d.text === "string" && d.text) parts.push(d.text);
    else if (Array.isArray(d.items)) parts.push(d.items.join("\n"));
    else if (Array.isArray(d.content)) {
      parts.push(d.content.filter((c) => c?.type === "text").map((c) => c.text).join(""));
    }
  }
  return parts.join("\n\n");
}

export function createImportExportEngine(options = {}) {
  const importers = new Map();
  const exporters = new Map();
  const renderer = options.renderer || null; // duck-typed renderer for HTML export

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return IMPORT_EXPORT_ENGINE_VERSION; },

    detectFormat(payload) {
      if (payload === null || payload === undefined) return "unknown";
      if (typeof payload === "object" && !Array.isArray(payload)) {
        if (payload.format === "acroxa-envelope" && payload.payload) return "acroxa-json";
        if (Array.isArray(payload.nodes) && typeof payload.rootId === "string") return "acroxa-json";
        if (payload.type === "doc" && Array.isArray(payload.content)) return "rte-doc";
      }
      if (typeof payload === "string") {
        const t = payload.trim();
        if (t === "") return "unknown";
        if (/^\s*[{[]/.test(t)) {
          try {
            const parsed = JSON.parse(t);
            return engine.detectFormat(parsed);
          } catch { return "unknown"; }
        }
        if (/<(p|h[1-6]|div|ul|ol|img|blockquote|pre|table)[\s>]/i.test(t)) return "html";
        return "markdown";
      }
      return "unknown";
    },

    registerImporter(format, fn) {
      if (typeof fn !== "function") throw ieError("registerImporter", "INVALID_CONVERTER", "Importer must be a function.");
      importers.set(format, fn);
    },

    registerExporter(format, fn) {
      if (typeof fn !== "function") throw ieError("registerExporter", "INVALID_CONVERTER", "Exporter must be a function.");
      exporters.set(format, fn);
    },

    // Import foreign content -> canonical node list [{ id, type, data }].
    importData(format, payload, opts = {}) {
      const fmt = format === "auto" ? engine.detectFormat(payload) : format;
      const fn = importers.get(fmt);
      if (!fn) throw ieError("importData", "UNSUPPORTED_FORMAT", `No importer registered for format "${fmt}".`);
      const nodes = fn(payload, opts);
      if (!Array.isArray(nodes)) throw ieError("importData", "BAD_IMPORT", `Importer for "${fmt}" must return a node array.`);
      return { format: fmt, nodes };
    },

    exportData(format, nodes, opts = {}) {
      const fn = exporters.get(format);
      if (!fn) throw ieError("exportData", "UNSUPPORTED_FORMAT", `No exporter registered for format "${format}".`);
      return fn(nodes, opts);
    },

    formats() {
      return {
        import: [...importers.keys()].sort(),
        export: [...exporters.keys()].sort(),
      };
    },
  };

  engine.registerImporter("html", (payload) => htmlToNodes(typeof payload === "string" ? payload : String(payload.html || "")));
  engine.registerImporter("markdown", (payload) => markdownToNodes(String(payload)));
  engine.registerImporter("acroxa-json", (payload) => {
    const doc = typeof payload === "string" ? JSON.parse(payload) : payload;
    const envelope = doc.format === "acroxa-envelope" ? doc.payload : doc;
    if (!envelope || !Array.isArray(envelope.nodes)) {
      throw ieError("importData", "BAD_IMPORT", "Acroxa JSON requires a nodes array.");
    }
    return envelope.nodes.map((n) => ({ id: n.id, type: n.type, data: n.data || {} }));
  });
  engine.registerImporter("rte-doc", (payload) => {
    const ast = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (!ast || ast.type !== "doc" || !Array.isArray(ast.content)) {
      throw ieError("importData", "BAD_IMPORT", "RTE document requires { type: 'doc', content: [] }.");
    }
    return ast.content.map((b) => ({
      id: cuid("imp"),
      type: b.type === "codeblock" ? "codeblock" : b.type,
      data: { ...(b.attrs || {}), content: b.content || [], text: (b.content || []).filter((c) => c?.type === "text").map((c) => c.text).join("") },
    }));
  });

  engine.registerExporter("markdown", (nodes) => nodesToMarkdown(nodes));
  engine.registerExporter("text", (nodes) => nodesToText(nodes));
  engine.registerExporter("acroxa-json", (nodes, opts = {}) => JSON.stringify({
    schemaVersion: opts.schemaVersion || 1,
    rootId: opts.rootId || "root",
    nodes: (nodes || []).map((n) => ({ id: n.id, type: n.type, parentId: n.parentId ?? null, children: n.children || [], data: n.data || {} })),
  }));
  engine.registerExporter("html", (nodes, opts = {}) => {
    if (!renderer || typeof renderer.renderNode !== "function") {
      throw ieError("exportData", "NO_RENDERER", "HTML export requires a renderer.");
    }
    return (nodes || []).map((n) => renderer.renderNode(
      { id: n.id, type: n.type, data: n.data || {} },
      { mode: "export", ...(opts.renderOpts || {}) }
    )).join("\n");
  });

  return engine;
}

export default createImportExportEngine;
