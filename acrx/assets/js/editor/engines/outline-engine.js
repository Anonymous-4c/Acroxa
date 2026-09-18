// acrx/assets/js/editor/engines/outline-engine.js
//
// ENGINE 34 — Document Outline Engine (headless).
// Structured outlines from document JSON: heading hierarchy, sections and
// semantic regions, navigation-ready trees, block-hierarchy outline and
// outline validation. Returns JSON for future UI renderers.

export const OUTLINE_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "outline";

function outlineError(operation, code, message) {
  const err = new Error(message);
  err.name = "OutlineError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function headingText(node) {
  const data = (node && node.data) || {};
  if (typeof data.text === "string" && data.text.trim()) return data.text.trim();
  if (Array.isArray(data.content)) {
    const t = data.content.filter((n) => n && n.type === "text").map((n) => n.text).join("").trim();
    if (t) return t;
  }
  return "";
}

function headingLevel(node) {
  const data = (node && node.data) || {};
  const level = Number(data.level);
  if (Number.isInteger(level) && level >= 1 && level <= 6) return level;
  return 2;
}

function allNodes(doc) {
  if (!doc) throw outlineError("outline", "INVALID_DOCUMENT", "Outline requires a document.");
  if (typeof doc.traverse === "function") {
    const out = [];
    doc.traverse((n) => out.push(n));
    return out;
  }
  if (Array.isArray(doc.nodes)) return doc.nodes.map((n) => JSON.parse(JSON.stringify(n)));
  throw outlineError("outline", "INVALID_DOCUMENT", "Document must expose traverse() or a nodes array.");
}

export function createOutlineEngine() {
  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return OUTLINE_ENGINE_VERSION; },

    // Nested heading tree. `flat` preserves document order for linear UIs.
    headings(doc) {
      const items = allNodes(doc)
        .filter((n) => n.type === "heading")
        .map((n) => ({ id: n.id, level: headingLevel(n), text: headingText(n), children: [] }));
      const roots = [];
      const stack = [];
      for (const item of items) {
        while (stack.length > 0 && stack[stack.length - 1].level >= item.level) stack.pop();
        if (stack.length === 0) roots.push(item);
        else stack[stack.length - 1].children.push(item);
        stack.push(item);
      }
      return {
        tree: roots,
        flat: items.map(({ id, level, text }) => ({ id, level, text })),
        count: items.length,
      };
    },

    // Sections: container-ish nodes carrying an explicit region/role marker.
    sections(doc) {
      return allNodes(doc)
        .filter((n) => n.data && (n.data.region || n.data.role || n.type === "section"))
        .map((n) => ({
          id: n.id,
          type: n.type,
          region: n.data.region || n.data.role || n.type,
          label: headingText(n) || n.data.title || n.type,
        }));
    },

    // Block-hierarchy outline (every node, depth-annotated, text-skimmable).
    blocks(doc) {
      const out = [];
      const walk = (nodes, id, depth) => {
        const node = nodes.get(id);
        if (!node) return;
        out.push({ id: node.id, type: node.type, depth, text: headingText(node), children: [...(node.children || [])] });
        for (const cid of node.children || []) walk(nodes, cid, depth + 1);
      };
      const nodes = new Map(allNodes(doc).map((n) => [n.id, n]));
      const rootId = doc.rootId || (doc.nodes && doc.nodes[0] && doc.nodes[0].id);
      const root = nodes.get(rootId);
      if (root) for (const cid of root.children || []) walk(nodes, cid, 0);
      return out;
    },

    validate(doc) {
      const errors = [];
      const warnings = [];
      const { flat } = engine.headings(doc);
      if (flat.length === 0) {
        warnings.push({ code: "NO_HEADINGS", path: "", message: "Document contains no headings.", severity: "warning" });
        return { valid: true, errors, warnings };
      }
      if (flat[0].level !== 1) {
        warnings.push({ code: "FIRST_NOT_H1", path: flat[0].id, message: "The first heading is not a level-1 heading.", severity: "warning" });
      }
      for (let i = 1; i < flat.length; i++) {
        if (flat[i].level > flat[i - 1].level + 1) {
          errors.push({
            code: "SKIPPED_LEVEL", path: flat[i].id,
            message: `Heading jumps from level ${flat[i - 1].level} to ${flat[i].level}.`, severity: "error",
          });
        }
      }
      for (const h of flat) {
        if (!h.text) warnings.push({ code: "EMPTY_HEADING", path: h.id, message: "Heading has no text.", severity: "warning" });
      }
      const h1s = flat.filter((h) => h.level === 1);
      if (h1s.length > 1) {
        warnings.push({ code: "MULTIPLE_H1", path: "", message: `Document has ${h1s.length} level-1 headings.`, severity: "warning" });
      }
      return { valid: errors.length === 0, errors, warnings };
    },
  };

  return engine;
}

export default createOutlineEngine;
