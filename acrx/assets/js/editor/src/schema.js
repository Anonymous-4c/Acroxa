// src/schema.js — Schema validator (the single choke point)

import { extractText, isText } from "./model.js";

export class Schema {
  constructor(config = {}) {
    this.nodeSet = new Set(config.allowedNodes || [
      "paragraph", "heading", "blockquote", "codeblock",
    ]);
    this.markSet = new Set(config.allowedMarks || [
      "bold", "italic", "underline", "strikethrough", "code", "link",
    ]);
  }

  allowsNode(type) {
    return this.nodeSet.has(type);
  }

  allowsMark(type) {
    return this.markSet.has(type);
  }

  // Filter marks on a single text node — remove disallowed marks.
  // Tolerates a non-array `marks` (hosts do send malformed JSON).
  filterMarks(marks) {
    if (!Array.isArray(marks)) return [];
    return marks.filter((m) => m && typeof m.type === "string" && this.markSet.has(m.type));
  }

  // Filter a whole node tree: convert disallowed nodes to paragraphs,
  // strip disallowed marks. Never silently drops text content.
  // Sanitise arbitrary input into a schema-valid tree.
  //
  // This is the ONLY boundary between host-supplied JSON and the engine, so
  // it must survive anything: nulls, wrong types, missing fields, numbers
  // where strings belong. A crash here takes the whole editor down, and hosts
  // do feed it malformed data (stale caches, bad API responses, hand-written
  // fixtures). Nothing is trusted; text is coerced, never dropped.
  filterNode(node) {
    if (!node || typeof node !== "object" || typeof node.type !== "string") {
      return null;
    }

    // Children of anything, defensively.
    const kids = () => (Array.isArray(node.content) ? node.content : [])
      .map((c) => this.filterNode(c))
      .filter(Boolean);

    if (node.type === "text") {
      // Coerce non-string text rather than discarding the node; losing user
      // content is worse than rendering "42".
      const raw = node.text;
      const str = typeof raw === "string" ? raw
                : (raw === null || raw === undefined) ? ""
                : String(raw);
      if (!str) return null;                 // empty text nodes are noise
      return { type: "text", text: str, marks: this.filterMarks(node.marks) };
    }

    if (node.type === "doc") {
      return { type: "doc", content: kids() };
    }

    if (!this.nodeSet.has(node.type)) {
      // Disallowed block: unwrap to a paragraph, keeping its text.
      return { type: "paragraph", attrs: {}, content: kids() };
    }

    const attrs = (node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs))
      ? { ...node.attrs } : {};
    return { type: node.type, attrs, content: kids() };
  }

  // Validate a node tree. Returns { valid, reason }.
  validate(node) {
    if (!node) return { valid: false, reason: "null" };
    if (node.type === "text") {
      for (const m of node.marks || []) {
        if (!this.markSet.has(m.type)) return { valid: false, reason: `mark ${m.type} not allowed` };
      }
      return { valid: true };
    }
    if (node.type === "doc") {
      for (const c of node.content || []) {
        const r = this.validate(c);
        if (!r.valid) return r;
      }
      return { valid: true };
    }
    if (!this.nodeSet.has(node.type)) return { valid: false, reason: `node ${node.type} not allowed` };
    for (const c of node.content || []) {
      const r = this.validate(c);
      if (!r.valid) return r;
    }
    return { valid: true };
  }

  // NOTE ON MODULE/SCHEMA INTERACTION
  // The host's schema is authoritative and is never widened by enabling a
  // module (spec §2: allowedNodes/allowedMarks would be meaningless otherwise).
  // Capability is an AND gate, evaluated live:
  //     usable(type) === schema.allows(type) && owningModuleEnabled(type)
  // See editor.canUseNode() / editor.canUseMark() in engine.js, which is the
  // single place that gate is computed for commands, markdown, and paste.
  //
  // These mutators exist only for hosts that genuinely want to change the
  // schema at runtime. Modules must not call them.
  addNodes(types) {
    for (const t of types) this.nodeSet.add(t);
  }

  addMarks(types) {
    for (const t of types) this.markSet.add(t);
  }

  removeNodes(types) {
    for (const t of types) this.nodeSet.delete(t);
  }

  removeMarks(types) {
    for (const t of types) this.markSet.delete(t);
  }

  // Get current allowed nodes
  getNodes() {
    return [...this.nodeSet];
  }

  // Get current allowed marks
  getMarks() {
    return [...this.markSet];
  }
}
