// acrx/assets/js/editor/engines/clipboard-engine.js
//
// ENGINE 11 — Clipboard Engine (headless).
// Copy/cut/paste as data: internal Acroxa JSON format, HTML and plain-text
// converters (extensible pipelines), structural sanitization, paste
// transforms. Never trusts foreign HTML — it is parsed through an allowlist.

export const CLIPBOARD_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "clipboard";
export const INTERNAL_MIME = "application/x-acroxa";
export const INTERNAL_VERSION = 1;

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "del", "code", "pre",
  "a", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
  "img", "table", "thead", "tbody", "tr", "th", "td", "hr", "span", "div",
]);
const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title", "colspan", "rowspan", "class"]);
// Note: `class` is inert (no script execution; pasted <style> is stripped),
// and importers need it (e.g. <code class="language-js"> fence detection).
const BLOCKED_PROTOCOL = /^(javascript|data|vbscript|file):/i;

// Decode entities + strip ASCII control whitespace before the protocol test:
// browsers do the same, so `&#x6A;avascript:` or `java&Tab;script:` must not
// sail through (P1-15). The stored value keeps its original (safe) form.
function decodedProtocol(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#([0-9]+);?/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&(colon|tab|newline);?/gi, (_, n) => (n.toLowerCase() === "colon" ? ":" : " "))
    .replace(/[\x00-\x20]+/g, "");
}

function clipError(operation, code, message) {
  const err = new Error(message);
  err.name = "ClipboardError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

export function sanitizeHTML(html) {
  let out = String(html || "");
  out = out.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style\s*>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?\/?>/g, (full, tag, attrs) => {
    const name = tag.toLowerCase();
    const closing = full[1] === "/";
    if (!ALLOWED_TAGS.has(name)) return "";
    if (closing) return `</${name}>`;
    let kept = "";
    if (attrs) {
      const attrRe = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
      let am;
      while ((am = attrRe.exec(attrs)) !== null) {
        const an = am[1].toLowerCase();
        const av = am[3] || am[4] || am[5] || "";
        if (!ALLOWED_ATTRS.has(an)) continue;
        if ((an === "href" || an === "src") && BLOCKED_PROTOCOL.test(decodedProtocol(av).trim())) continue;
        kept += ` ${an}="${av.replace(/"/g, "&quot;")}"`;
      }
    }
    if (name === "img" || name === "br" || name === "hr") return `<${name}${kept}>`;
    return `<${name}${kept}>`;
  });
  // Drop inline event handlers that survived without quotes.
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  return out;
}

export function htmlToText(html) {
  return String(html || "")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'").replace(/&nbsp;/gi, " ")
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trimEnd()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export function createClipboardEngine() {
  const exporters = new Map(); // mime -> fn(internal) => string
  const importers = new Map(); // mime -> fn(payload) => internal-ish data
  const pasteTransforms = []; // fn(html) => html, applied in order
  let internal = null;

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return CLIPBOARD_ENGINE_VERSION; },

    copy(data, kind = "blocks") {
      internal = {
        format: INTERNAL_MIME, version: INTERNAL_VERSION, kind,
        copiedAt: new Date().toISOString(),
        data: JSON.parse(JSON.stringify(data)),
      };
      return engine.toDataTransfer();
    },

    cut(data, kind = "blocks") {
      return engine.copy(data, kind);
    },

    getInternal() {
      return internal ? JSON.parse(JSON.stringify(internal)) : null;
    },

    hasInternal() {
      return !!internal;
    },

    clear() {
      internal = null;
    },

    toDataTransfer() {
      if (!internal) throw clipError("toDataTransfer", "EMPTY", "Clipboard is empty.");
      return {
        [INTERNAL_MIME]: JSON.stringify(internal),
        "text/plain": exporters.has("text/plain")
          ? exporters.get("text/plain")(internal)
          : (typeof internal.data === "string" ? internal.data : JSON.stringify(internal.data)),
      };
    },

    // Accept a DataTransfer-like map { mime: payload }; internal format wins,
    // otherwise the importer pipeline converts foreign content.
    paste(transfer) {
      if (!transfer || typeof transfer !== "object") {
        throw clipError("paste", "INVALID_TRANSFER", "Paste requires a mime->payload map.");
      }
      if (transfer[INTERNAL_MIME]) {
        try {
          const parsed = JSON.parse(transfer[INTERNAL_MIME]);
          if (parsed.format === INTERNAL_MIME) {
            internal = parsed;
            return { kind: "internal", data: JSON.parse(JSON.stringify(parsed.data)) };
          }
        } catch { /* fall through to importers */ }
      }
      for (const [mime, fn] of importers) {
        if (transfer[mime] !== undefined) {
          let payload = transfer[mime];
          if (mime === "text/html") {
            for (const t of pasteTransforms) payload = t(payload);
            payload = sanitizeHTML(payload);
          }
          return { kind: mime, data: fn(payload) };
        }
      }
      if (transfer["text/plain"] !== undefined) {
        return { kind: "text/plain", data: String(transfer["text/plain"]) };
      }
      throw clipError("paste", "UNSUPPORTED", "No usable clipboard representation found.");
    },

    registerExporter(mime, fn) {
      if (typeof fn !== "function") throw clipError("registerExporter", "INVALID_CONVERTER", "Exporter must be a function.");
      exporters.set(mime, fn);
    },

    registerImporter(mime, fn) {
      if (typeof fn !== "function") throw clipError("registerImporter", "INVALID_CONVERTER", "Importer must be a function.");
      importers.set(mime, fn);
    },

    addPasteTransform(fn) {
      if (typeof fn !== "function") throw clipError("addPasteTransform", "INVALID_CONVERTER", "Paste transform must be a function.");
      pasteTransforms.push(fn);
      return () => {
        const i = pasteTransforms.indexOf(fn);
        if (i >= 0) pasteTransforms.splice(i, 1);
      };
    },

    sanitize: sanitizeHTML,
    toText: htmlToText,
  };

  // Built-in HTML importer: sanitized HTML -> inline-aware fragment list.
  engine.registerImporter("text/html", (sanitized) => ({ html: sanitized, text: htmlToText(sanitized) }));

  return engine;
}

export default createClipboardEngine;
