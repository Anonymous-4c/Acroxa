// acrx/assets/js/editor/engines/html-export-engine.js
//
// ENGINE 25 — HTML Export Engine (headless).
// Clean production HTML — a separate representation from editor DOM: no
// editor attributes, selection markers, resize handles or editor metadata.
// Semantic HTML via widget renderers, optional minification, full-document
// output with derived <head> metadata.

export const HTML_EXPORT_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "html-export";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function exportError(operation, code, message) {
  const err = new Error(message);
  err.name = "HtmlExportError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

const EDITOR_ONLY_PATTERNS = [
  /data-block-id="[^"]*"/g,
  /data-for-block-id="[^"]*"/g,
  /\sclass="[^"]*\b(block-wrap|block-handle|block-check|is-selected|is-focused|resize-handle|selection-marker)\b[^"]*"/g,
  /contenteditable="[^"]*"/g,
  /data-placeholder="[^"]*"/g,
];

export function stripEditorArtifacts(html) {
  let out = String(html || "");
  for (const pattern of EDITOR_ONLY_PATTERNS) out = out.replace(pattern, "");
  out = out.replace(/<(\w+)([^>]*)\s+class="\s*"/g, "<$1$2");
  // Tidy tags only (never text): collapse gap runs, drop trailing space.
  out = out.replace(/<[a-zA-Z][^<>]*>/g, (tag) => tag.replace(/\s{2,}/g, " ").replace(/\s+>$/, ">"));
  return out;
}

export function minifyHtml(html) {
  return String(html || "")
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function createHtmlExportEngine(options = {}) {
  if (!options.renderer) throw exportError("create", "NO_RENDERER", "HTML export requires a renderer.");
  const renderer = options.renderer;
  const headTagsFor = typeof options.headTagsFor === "function" ? options.headTagsFor : null;

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return HTML_EXPORT_ENGINE_VERSION; },

    exportNode(node, opts = {}) {
      if (!node || typeof node !== "object") throw exportError("exportNode", "INVALID_NODE", "Export requires a node.");
      let html = renderer.renderNode(node, { mode: "export", ...(opts.renderOpts || {}) });
      html = stripEditorArtifacts(html);
      if (opts.minify) html = minifyHtml(html);
      return html;
    },

    exportFragment(nodes, opts = {}) {
      return (nodes || []).map((n) => engine.exportNode(n, opts)).join(opts.minify ? "" : "\n");
    },

    exportDocument(doc, opts = {}) {
      if (!doc || typeof doc.getNode !== "function") {
        throw exportError("exportDocument", "INVALID_DOCUMENT", "Export requires a document with getNode().");
      }
      const body = stripEditorArtifacts(renderer.renderDocument(doc, { mode: "export", ...(opts.renderOpts || {}) }));
      if (opts.fragment) {
        return opts.minify ? minifyHtml(body) : body;
      }
      const meta = opts.metadata || {};
      const lang = esc(meta.language || "en");
      const title = esc(meta.title || meta.metaTitle || "Untitled");
      const head = [];
      head.push("<meta charset=\"utf-8\">");
      head.push("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
      head.push(`<title>${title}</title>`);
      if (headTagsFor) {
        for (const tag of headTagsFor(meta)) head.push(tag);
      } else {
        if (meta.description || meta.metaDescription) head.push(`<meta name="description" content="${esc(meta.description || meta.metaDescription)}">`);
        if (meta.canonical || meta.canonicalUrl) head.push(`<link rel="canonical" href="${esc(meta.canonical || meta.canonicalUrl)}">`);
      }
      let html = `<!DOCTYPE html>\n<html lang="${lang}">\n<head>\n${head.join("\n")}\n</head>\n<body>\n${body}\n</body>\n</html>`;
      if (opts.minify) html = minifyHtml(html);
      return html;
    },

    stripEditorArtifacts,
    minify: minifyHtml,
  };

  return engine;
}

export default createHtmlExportEngine;
