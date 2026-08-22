// src/modules/paste.js — Paste pipeline (spec §9.3 / §10.7)
//
// Pipeline order, exactly as specified:
//   1. Determine currently enabled modules + schema (read LIVE, never cached)
//   2. Read clipboard: prefer text/html, fall back to text/plain
//   3. Parse candidate rich content into a provisional AST
//   4. Run every node/mark through the schema + module check
//   5. Anything disallowed -> unwrap to plain text / allowed ancestor.
//      Text content is NEVER dropped, only disallowed structure is stripped.
//   6. Insert via the NORMAL transaction system (no paste bypass), so undo
//      history and selection mapping stay correct.
//
// This is the ONLY sanitizer. There is deliberately no second, looser path.

import { text, paragraph } from "../model.js";

export function paste(options = {}) {
  return {
    name: "paste",
    settings: { ...options },

    onEnable(editor) {
      this._onPaste = (e) => {
        // Step 6 precondition: we own this entirely, the browser never inserts.
        e.preventDefault();
        e.stopPropagation();

        const cd = e.clipboardData || window.clipboardData;
        if (!cd) return;

        // Step 2: prefer HTML, fall back to plain text.
        const html = cd.getData("text/html");
        const plain = cd.getData("text/plain");

        // Step 3: parse into a provisional AST.
        let provisional;
        if (html) {
          provisional = parseHtmlToAst(html);
        } else if (plain) {
          provisional = parsePlainToAst(plain);
        } else {
          return;
        }

        // Steps 4+5: sanitize against the LIVE schema and LIVE module set.
        // moduleGate() is what makes "disabled module = literally cannot
        // appear" true for paste as well as for commands.
        const gated = applyModuleGate(provisional, editor);
        let sanitized = editor.schema.filterNode(gated);

        // Let the host inspect/modify the parsed result before insertion.
        const ctx = editor.emit("paste", {
          event: e,
          content: sanitized,
          html,
          text: plain,
        });
        if (ctx.prevented) return;
        if (ctx.content) sanitized = editor.schema.filterNode(ctx.content);

        const blocks = (sanitized.content || []).filter(Boolean);
        if (blocks.length === 0) return;

        // Step 6: single transaction => single undo step for the whole paste.
        insertBlocks(editor, blocks);
      };

      editor.element.addEventListener("paste", this._onPaste, true);
    },

    onDisable(editor) {
      if (this._onPaste) {
        editor.element.removeEventListener("paste", this._onPaste, true);
        this._onPaste = null;
      }
    },

    onDestroy(editor) {
      this.onDisable(editor);
    },
  };
}

// ── Step 4/5: module-aware gating ────────────────────────────────────────────
// A node type may be structurally known to the parser (e.g. "table") but its
// owning module may be disabled right now. In that case we must unwrap it to
// plain text rather than emit it. Text is always preserved.
// Uses editor.canUseNode / editor.canUseMark — the SAME gate that commands and
// markdown shortcuts use. This is what makes "disabled module = literally
// cannot appear" true for paste too. There is no second, looser sanitizer.
function applyModuleGate(node, editor) {
  if (!node) return null;

  if (node.type === "text") {
    const marks = (node.marks || []).filter((m) => editor.canUseMark(m.type));
    return { type: "text", text: node.text, marks };
  }

  const content = (node.content || [])
    .map((c) => applyModuleGate(c, editor))
    .filter(Boolean);

  if (node.type === "doc") {
    return { type: "doc", content };
  }

  if (!editor.canUseNode(node.type)) {
    // Not usable right now: unwrap to a paragraph carrying the plain text.
    // Structure is stripped; text is never dropped (spec §9.3 step 5).
    return { type: "paragraph", attrs: {}, content: flattenToText(content) };
  }

  return { type: node.type, attrs: { ...(node.attrs || {}) }, content };
}

// Collect all text from a subtree as flat, mark-stripped text nodes.
function flattenToText(nodes) {
  const out = [];
  for (const n of nodes) {
    if (!n) continue;
    if (n.type === "text") {
      out.push({ type: "text", text: n.text, marks: [] });
    } else {
      out.push(...flattenToText(n.content || []));
    }
  }
  // Merge into a single text node so we don't emit noise.
  const joined = out.map((t) => t.text).join("");
  return joined ? [{ type: "text", text: joined, marks: [] }] : [];
}

// ── Step 6: insert through the normal transaction system ─────────────────────
//
// Container-generic: pasted blocks go into whatever holds the caret's block
// (doc, listItem, tableCell). The previous version addressed everything as
// ["content", pos.path[1]], so pasting inside a table cell or list item
// targeted the wrong container and the content was silently dropped.
function insertBlocks(editor, blocks) {
  const pos = editor.selection?.anchor;

  editor.utils.transaction((tr) => {
    if (!pos) {
      const at = (editor.doc.content || []).length;
      blocks.forEach((b, i) => tr.insertNode([], at + i, b));
      const last = Math.max(0, at + blocks.length - 1);
      tr.setResolvedSelection({
        anchor: { path: ["content", last], offset: 0 },
        head: { path: ["content", last], offset: 0 },
      });
      return;
    }

    const r = editor.utils.resolveBlockAt(pos);
    if (!r) return;
    const { blockPath, block, containerPath, index } = r;
    const charAt = editor.utils.charOffsetAt(pos);

    // Single plain paragraph => inline insert, so pasting a word mid-sentence
    // does not split the block.
    if (blocks.length === 1) {
      const only = blocks[0];
      const plain = only.type === "paragraph" &&
        (only.content || []).every((c) =>
          c.type === "text" && (!c.marks || c.marks.length === 0));
      if (plain) {
        const str = (only.content || []).map((c) => c.text).join("");
        if (!str) return;
        const head = editor.utils.sliceBlockInline(blockPath, 0, charAt);
        const tail = editor.utils.sliceBlockInline(blockPath, charAt, Infinity);
        const merged = [...head, { type: "text", text: str, marks: [] }, ...tail];

        for (let i = (block.content || []).length - 1; i >= 0; i--) {
          tr.deleteNode(blockPath, i);
        }
        merged.forEach((nd, i) => tr.insertNode(blockPath, i, nd));
        tr.setResolvedSelection({
          anchor: { path: [...blockPath, "content", head.length], offset: str.length },
          head:   { path: [...blockPath, "content", head.length], offset: str.length },
        });
        return;
      }
    }

    // Multi-block: insert as siblings of the caret's block, inside the SAME
    // container, so a table cell keeps its structure.
    blocks.forEach((b, i) => tr.insertNode(containerPath, index + 1 + i, b));
    const landing = index + blocks.length;
    tr.setResolvedSelection({
      anchor: { path: [...containerPath, "content", landing], offset: 0 },
      head:   { path: [...containerPath, "content", landing], offset: 0 },
    });
  });
}

// ── Step 3: HTML -> provisional AST ──────────────────────────────────────────
export function parseHtmlToAst(html) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");

  // Strip the well-known Word / Google Docs garbage before we look at anything.
  scrubDirtyHtml(parsed.body);

  const content = [];
  for (const child of Array.from(parsed.body.childNodes)) {
    collectBlocks(child, content);
  }

  if (content.length === 0) {
    const t = (parsed.body.textContent || "").trim();
    if (t) content.push({ type: "paragraph", attrs: {}, content: [text(t)] });
  }

  return { type: "doc", content };
}

// Remove Word/Docs cruft: <o:p>, mso-* styles, conditional comments,
// style/meta/script tags, and all inline style attributes.
function scrubDirtyHtml(root) {
  // Drop non-content elements entirely.
  for (const el of Array.from(root.querySelectorAll("style, meta, script, link, title"))) {
    el.remove();
  }
  // Drop Word's <o:p> and any namespaced junk.
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag.includes(":")) {
      // Unwrap: keep text, drop the element.
      while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
      el.remove();
      continue;
    }
    // Inline styles are never trusted — the model owns all formatting.
    el.removeAttribute("style");
    el.removeAttribute("class");
    el.removeAttribute("lang");
  }
  // Remove comment nodes (Word conditional comments live here).
  const walker = [root];
  while (walker.length) {
    const n = walker.pop();
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 8 /* COMMENT_NODE */) c.remove();
      else walker.push(c);
    }
  }
}

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "pre", "ul", "ol", "li", "table", "tr", "td", "th",
  "tbody", "thead", "section", "article",
]);

function collectBlocks(node, out) {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    const t = node.textContent;
    if (t && t.trim()) {
      out.push({ type: "paragraph", attrs: {}, content: [text(t)] });
    }
    return;
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return;

  const tag = node.tagName.toLowerCase();
  const block = parseBlockElement(node, tag);
  if (block) {
    out.push(block);
    return;
  }

  // Not a recognized block: descend, or treat inline run as a paragraph.
  const hasBlockChild = Array.from(node.childNodes).some(
    (c) => c.nodeType === 1 && BLOCK_TAGS.has(c.tagName.toLowerCase())
  );
  if (hasBlockChild) {
    for (const c of Array.from(node.childNodes)) collectBlocks(c, out);
  } else {
    const inline = parseInline(node);
    if (inline.length) out.push({ type: "paragraph", attrs: {}, content: inline });
  }
}

function parseBlockElement(node, tag) {
  switch (tag) {
    case "p":
    case "div":
    case "section":
    case "article":
      return { type: "paragraph", attrs: {}, content: parseInline(node) };
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      return { type: "heading", attrs: { level: Number(tag[1]) }, content: parseInline(node) };
    case "blockquote":
      return { type: "blockquote", attrs: {}, content: parseInline(node) };
    case "pre":
      return { type: "codeblock", attrs: {}, content: [text(node.textContent || "")] };
    case "ul":
    case "ol":
      return parseList(node, tag === "ol" ? "orderedList" : "bulletList");
    case "table":
      return parseTable(node);
    default:
      return null;
  }
}

function parseList(node, type) {
  const items = [];
  for (const li of Array.from(node.children)) {
    if (li.tagName.toLowerCase() !== "li") continue;
    items.push({
      type: "listItem",
      attrs: {},
      content: [{ type: "paragraph", attrs: {}, content: parseInline(li) }],
    });
  }
  return { type, attrs: {}, content: items };
}

function parseTable(tableEl) {
  const rows = [];
  for (const tr of Array.from(tableEl.querySelectorAll("tr"))) {
    const cells = [];
    for (const td of Array.from(tr.children)) {
      const t = td.tagName.toLowerCase();
      if (t !== "td" && t !== "th") continue;
      cells.push({
        type: "tableCell",
        attrs: t === "th" ? { header: true } : {},
        content: [{ type: "paragraph", attrs: {}, content: parseInline(td) }],
      });
    }
    if (cells.length) rows.push({ type: "tableRow", attrs: {}, content: cells });
  }
  return { type: "table", attrs: {}, content: rows };
}

function marksForTag(tag, el) {
  switch (tag) {
    case "b": case "strong": return [{ type: "bold" }];
    case "i": case "em":     return [{ type: "italic" }];
    case "u":                return [{ type: "underline" }];
    case "s": case "strike": case "del": return [{ type: "strikethrough" }];
    case "code":             return [{ type: "code" }];
    case "a": {
      const href = el.getAttribute("href");
      return href ? [{ type: "link", attrs: { href } }] : [];
    }
    default: return [];
  }
}

function parseInline(node, inherited = []) {
  const out = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3 /* TEXT */) {
      const t = child.textContent;
      if (t) out.push(text(t, inherited));
    } else if (child.nodeType === 1 /* ELEMENT */) {
      const tag = child.tagName.toLowerCase();
      if (tag === "br") {
        out.push(text("\n", inherited));
        continue;
      }
      const marks = [...inherited, ...marksForTag(tag, child)];
      out.push(...parseInline(child, marks));
    }
  }
  return out;
}

// ── Step 3 fallback: plain text -> AST ───────────────────────────────────────
export function parsePlainToAst(str) {
  const lines = String(str).split(/\r\n|\r|\n/);
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      attrs: {},
      content: line ? [text(line)] : [],
    })),
  };
}
