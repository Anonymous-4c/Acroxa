// acrx/assets/js/editor/engines/rich-text-engine.js
//
// ENGINE 06 — Rich Text Engine (headless).
// The existing DOM-bound RTE (editor/src/) remains the reference runtime for
// live editing. This engine is its headless complement: a pure inline-content
// model (text nodes + marks) with commands-as-data — formatting, splitting,
// joining, HTML/Markdown conversion — so paste, import/export, SEO and AI
// layers can operate on rich text without a browser.
//
// Model: content = [{ type: "text", text, marks: [{ type, attrs? }] }]
// Offsets are absolute character offsets across the concatenated text.

export const RICH_TEXT_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "rich-text";

export const MARKS = Object.freeze({
  BOLD: "bold", ITALIC: "italic", UNDERLINE: "underline",
  STRIKE: "strikethrough", CODE: "code", LINK: "link",
});

const MARK_TAGS = { bold: "strong", italic: "em", underline: "u", strikethrough: "s", code: "code", link: "a" };
const TAG_MARKS = { strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline", s: "strikethrough", strike: "strikethrough", del: "strikethrough", code: "code" };
// Legacy aliases healed on read: canvas/app once wrote "strike" and "inlineCode".
// Canonical vocabulary is "strikethrough" / "code" (P0-01).
const MARK_ALIASES = Object.freeze({ strike: "strikethrough", inlineCode: "code" });
function canonMarkType(t) {
  return MARK_ALIASES[t] || t;
}

// ─── Mark compatibility (explicit, deterministic) ─────────────────────
// Inline `code` is mutually exclusive with rich emphasis marks: code spans
// render literally, so bold/italic/underline/strikethrough inside code would
// be invisible semantics and corrupt copy/paste fidelity. `link` coexists
// with every mark (code links and formatted links are both valid).
// Rule ("last mark wins", enforced in applyMark so every entry point —
// toolbar, keyboard, palette, slash, paste, import — behaves identically):
//   applying `code` strips bold/italic/underline/strikethrough in range.
//   applying bold/italic/underline/strikethrough strips `code` in range.
// UI layers should additionally disable the displaced buttons (see
// toolbar.js) as guidance, but the model never depends on button state.
const RICH_MARKS = Object.freeze(["bold", "italic", "underline", "strikethrough"]);
export const MARK_COMPAT = Object.freeze({
  code: Object.freeze({ excludes: Object.freeze([...RICH_MARKS]) }),
  bold: Object.freeze({ excludes: Object.freeze(["code"]) }),
  italic: Object.freeze({ excludes: Object.freeze(["code"]) }),
  underline: Object.freeze({ excludes: Object.freeze(["code"]) }),
  strikethrough: Object.freeze({ excludes: Object.freeze(["code"]) }),
  link: Object.freeze({ excludes: Object.freeze([]) }),
});

export function conflictingMarks(markType) {
  const canon = canonMarkType(markType);
  const rule = MARK_COMPAT[canon];
  return rule ? [...rule.excludes] : [];
}

// True when `markType` can be applied given the mark types already present.
// Used by toolbars to derive disabled state; the model itself resolves via
// resolveMarkSet (last wins) so headless/paste paths stay consistent.
export function canApplyMark(existingTypes, markType) {
  const canon = canonMarkType(markType);
  if (!MARK_TAGS[canon]) return false;
  const present = new Set((existingTypes || []).map(canonMarkType));
  if (canon === "code") return !RICH_MARKS.some((m) => present.has(m));
  if (RICH_MARKS.includes(canon)) return !present.has("code");
  return true;
}

// Merge `incoming` into an existing mark-type list per the compat rule.
function resolveMarkSet(existing, incoming) {
  const canon = canonMarkType(incoming.type);
  const drop = new Set(conflictingMarks(canon));
  const kept = (existing || []).filter((m) => !drop.has(canonMarkType(m.type)));
  return normMarks([...kept, incoming]);
}

function rtError(operation, code, message) {
  const err = new Error(message);
  err.name = "RichTextError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function normMarks(marks) {
  if (!Array.isArray(marks)) return [];
  const seen = new Set();
  const out = [];
  for (const m of marks) {
    if (!m || typeof m.type !== "string") continue;
    const type = canonMarkType(m.type);
    if (!MARK_TAGS[type] || seen.has(type)) continue;
    seen.add(type);
    out.push(m.attrs ? { type, attrs: { ...m.attrs } } : { type });
  }
  return out.sort((a, b) => (a.type < b.type ? -1 : 1));
}

function marksEqual(a, b) {
  const na = normMarks(a); const nb = normMarks(b);
  if (na.length !== nb.length) return false;
  return na.every((m, i) => m.type === nb[i].type && JSON.stringify(m.attrs || null) === JSON.stringify(nb[i].attrs || null));
}

export function textNode(text = "", marks = []) {
  return { type: "text", text: String(text), marks: normMarks(marks) };
}

export function normalizeContent(content) {
  if (!Array.isArray(content)) throw rtError("normalizeContent", "INVALID_CONTENT", "Content must be an array of inline nodes.");
  const out = [];
  for (const node of content) {
    if (!node || node.type !== "text" || !node.text) continue;
    const last = out[out.length - 1];
    const marks = normMarks(node.marks);
    if (last && marksEqual(last.marks, marks)) last.text += node.text;
    else out.push({ type: "text", text: node.text, marks });
  }
  return out;
}

export function plainLength(content) {
  return normalizeContent(content).reduce((n, node) => n + node.text.length, 0);
}

export function plainText(content) {
  return normalizeContent(content).map((n) => n.text).join("");
}

// Locate { nodeIndex, inner } for an absolute offset (clamped).
function locate(content, offset) {
  const nodes = normalizeContent(content);
  const total = nodes.reduce((n, x) => n + x.text.length, 0);
  const at = Math.max(0, Math.min(offset, total));
  let acc = 0;
  for (let i = 0; i < nodes.length; i++) {
    const len = nodes[i].text.length;
    if (at <= acc + len) return { nodes, index: i, inner: at - acc, total };
    acc += len;
  }
  return { nodes, index: nodes.length, inner: 0, total };
}

export function slice(content, from, to) {
  const nodes = normalizeContent(content);
  const total = nodes.reduce((n, x) => n + x.text.length, 0);
  const a = Math.max(0, Math.min(from, total));
  const b = Math.max(0, Math.min(to === undefined ? total : to, total));
  const out = [];
  let acc = 0;
  for (const node of nodes) {
    const start = acc; const end = acc + node.text.length;
    if (end > a && start < b) {
      out.push({ type: "text", text: node.text.slice(Math.max(0, a - start), Math.max(0, b - start)), marks: node.marks });
    }
    acc = end;
  }
  return normalizeContent(out);
}

export function insertTextAt(content, offset, text, marks = []) {
  const { nodes, index, inner } = locate(content, offset);
  const out = nodes.map((n) => ({ ...n, marks: [...n.marks] }));
  const piece = textNode(text, marks);
  if (index >= out.length) {
    out.push(piece);
  } else {
    const target = out[index];
    const head = target.text.slice(0, inner);
    const tail = target.text.slice(inner);
    const replacement = [];
    if (head) replacement.push({ type: "text", text: head, marks: target.marks });
    if (piece.text) replacement.push(piece);
    if (tail) replacement.push({ type: "text", text: tail, marks: target.marks });
    out.splice(index, 1, ...replacement);
  }
  return normalizeContent(out);
}

export function deleteRange(content, from, to) {
  const total = plainLength(content);
  const a = Math.max(0, Math.min(from, total));
  const b = Math.max(0, Math.min(to === undefined ? total : to, total));
  if (b <= a) return normalizeContent(content);
  return normalizeContent([...slice(content, 0, a), ...slice(content, b, total)]);
}

export function applyMark(content, from, to, mark) {
  const canon = mark && typeof mark.type === "string" ? canonMarkType(mark.type) : mark && mark.type;
  if (!mark || !MARK_TAGS[canon]) throw rtError("applyMark", "UNKNOWN_MARK", `Unknown mark "${mark && mark.type}".`);
  const total = plainLength(content);
  const a = Math.max(0, Math.min(from, total));
  const b = Math.max(0, Math.min(to, total));
  if (b <= a) return normalizeContent(content);
  const nodes = normalizeContent(content);
  const out = [];
  let acc = 0;
  for (const node of nodes) {
    const start = acc; const end = acc + node.text.length;
    if (end <= a || start >= b) {
      out.push(node);
    } else {
      const head = node.text.slice(0, Math.max(0, a - start));
      const mid = node.text.slice(Math.max(0, a - start), Math.max(0, b - start));
      const tail = node.text.slice(Math.max(0, b - start));
      if (head) out.push({ type: "text", text: head, marks: node.marks });
      if (mid) {
        const merged = resolveMarkSet(node.marks, { type: canon, ...(mark.attrs ? { attrs: mark.attrs } : {}) });
        out.push({ type: "text", text: mid, marks: merged });
      }
      if (tail) out.push({ type: "text", text: tail, marks: node.marks });
    }
    acc = end;
  }
  return normalizeContent(out);
}

export function removeMark(content, from, to, markType) {
  const canon = typeof markType === "string" ? canonMarkType(markType) : markType;
  const total = plainLength(content);
  const a = Math.max(0, Math.min(from, total));
  const b = Math.max(0, Math.min(to === undefined ? total : to, total));
  if (b <= a) return normalizeContent(content);
  const out = [];
  let acc = 0;
  for (const node of normalizeContent(content)) {
    const start = acc; const end = acc + node.text.length;
    if (end <= a || start >= b) {
      out.push(node);
    } else {
      const cut = (t, keep) => (t ? [{ type: "text", text: t, marks: keep }] : []);
      const head = node.text.slice(0, Math.max(0, a - start));
      const mid = node.text.slice(Math.max(0, a - start), Math.max(0, b - start));
      const tail = node.text.slice(Math.max(0, b - start));
      out.push(...cut(head, node.marks));
      out.push(...cut(mid, normMarks(node.marks.filter((m) => m.type !== canon))));
      out.push(...cut(tail, node.marks));
    }
    acc = end;
  }
  return normalizeContent(out);
}

export function marksAt(content, offset) {
  const { nodes, index, inner } = locate(content, offset);
  if (index >= nodes.length) return [];
  const node = nodes[index];
  if (inner >= node.text.length && index + 1 < nodes.length) return [...nodes[index + 1].marks];
  return [...node.marks];
}

export function splitAt(content, offset) {
  return [slice(content, 0, offset), slice(content, offset, plainLength(content))];
}

export function toHTML(content) {
  return normalizeContent(content).map((node) => {
    let html = escapeHtml(node.text);
    const marks = [...node.marks].sort((a, b) => (a.type === "link" ? 1 : b.type === "link" ? -1 : 0));
    for (const mark of marks) {
      const tag = MARK_TAGS[mark.type];
      if (!tag) continue;
      if (mark.type === "link") html = `<a href="${escapeAttr((mark.attrs && mark.attrs.href) || "#")}">` + html + "</a>";
      else html = `<${tag}>` + html + `</${tag}>`;
    }
    return html;
  }).join("");
}

// Minimal inline-HTML reader (strong/b/em/i/u/s/del/code/a/br). Block-level
// parsing belongs to import/export; unknown tags unwrap to their text.
export function fromInlineHTML(html) {
  const out = [];
  const stack = [[]];
  const token = /<\/?([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?\/?>|([^<>]+)/g;
  let m;
  const hrefOf = (attrStr) => {
    const h = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrStr || "");
    return h ? h[2] || h[3] || h[4] || "" : "";
  };
  while ((m = token.exec(String(html || ""))) !== null) {
    if (m[3] !== undefined) {
      const text = m[3].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'");
      if (text) out.push(textNode(text, stack._marks || []));
    } else {
      const tag = m[1].toLowerCase();
      const closing = m[0][1] === "/";
      if (!stack._marks) stack._marks = [];
      if (tag === "br" && !closing) {
        out.push(textNode("\n", stack._marks));
      } else if (TAG_MARKS[tag] && !closing) {
        const incoming = { type: TAG_MARKS[tag] };
        // Pasted HTML obeys the same compat rule: e.g. <code><b> keeps code.
        stack._marks = resolveMarkSet(stack._marks, incoming);
      } else if (tag === "a" && !closing) {
        // An anchor whose href was stripped (e.g. unsafe protocol) degrades
        // to plain text rather than a link mark pointing nowhere.
        const href = hrefOf(m[2]);
        if (href) stack._marks.push({ type: "link", attrs: { href } });
        else stack._marks.push(null);
      } else if (closing) {
        stack._marks.pop();
      }
    }
  }
  return normalizeContent(out);
}

export function toMarkdown(content) {
  return normalizeContent(content).map((node) => {
    let t = node.text;
    const has = (k) => node.marks.some((x) => x.type === k);
    if (has("code")) t = "`" + t + "`";
    if (has("bold")) t = "**" + t + "**";
    if (has("italic")) t = "*" + t + "*";
    if (has("strikethrough")) t = "~~" + t + "~~";
    const link = node.marks.find((x) => x.type === "link");
    if (link && link.attrs && link.attrs.href) t = `[${t}](${link.attrs.href})`;
    return t;
  }).join("");
}

export function createRichTextEngine() {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return RICH_TEXT_ENGINE_VERSION; },
    textNode, normalizeContent, plainText, plainLength, slice,
    insertTextAt, deleteRange, applyMark, removeMark, marksAt, splitAt,
    toHTML, fromInlineHTML, toMarkdown,
    MARK_COMPAT, conflictingMarks, canApplyMark,
    commands: {
      bold: (c, a) => applyMark(c, a.from, a.to, { type: "bold" }),
      italic: (c, a) => applyMark(c, a.from, a.to, { type: "italic" }),
      underline: (c, a) => applyMark(c, a.from, a.to, { type: "underline" }),
      strike: (c, a) => applyMark(c, a.from, a.to, { type: "strikethrough" }),
      code: (c, a) => applyMark(c, a.from, a.to, { type: "code" }),
      link: (c, a) => applyMark(c, a.from, a.to, { type: "link", attrs: { href: a.href } }),
      unlink: (c, a) => removeMark(c, a.from, a.to, "link"),
      clearMarks: (c, a) => {
        let out = c;
        for (const t of Object.values(MARKS)) out = removeMark(out, a.from, a.to, t);
        return out;
      },
    },
  };
}

export default createRichTextEngine;
