// acrx/assets/js/editor/engines/search-engine.js
//
// ENGINE 35 — Find/Search Engine (headless).
// Central editor search over document JSON: text, widgets, metadata,
// settings, type, id and attribute queries. Returns navigable result sets;
// replacements are edit descriptors the caller applies via transactions.

export const SEARCH_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "search";

function searchError(operation, code, message) {
  const err = new Error(message);
  err.name = "SearchError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textOfNode(node) {
  const data = (node && node.data) || {};
  const parts = [];
  if (typeof data.text === "string" && data.text) parts.push({ field: "data.text", text: data.text });
  if (typeof data.title === "string" && data.title) parts.push({ field: "data.title", text: data.title });
  if (Array.isArray(data.content)) {
    const inline = data.content.filter((n) => n && n.type === "text").map((n) => n.text).join("");
    if (inline) parts.push({ field: "data.content", text: inline });
  }
  return parts;
}

function excerptAround(text, index, length, radius = 24) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function allNodes(doc) {
  if (!doc) throw searchError("search", "INVALID_DOCUMENT", "Search requires a document.");
  if (typeof doc.traverse === "function") {
    const out = [];
    doc.traverse((n) => out.push(n));
    return out;
  }
  if (Array.isArray(doc.nodes)) return doc.nodes.map((n) => JSON.parse(JSON.stringify(n)));
  throw searchError("search", "INVALID_DOCUMENT", "Document must expose traverse() or a nodes array.");
}

export function createSearchEngine() {
  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return SEARCH_ENGINE_VERSION; },

    searchText(doc, query, opts = {}) {
      if (typeof query !== "string" || query === "") {
        throw searchError("searchText", "INVALID_QUERY", "Text query must be a non-empty string.");
      }
      const flags = opts.caseSensitive ? "g" : "gi";
      const pattern = opts.wholeWord ? new RegExp(`\\b${escapeRegExp(query)}\\b`, flags) : new RegExp(escapeRegExp(query), flags);
      const results = [];
      for (const node of allNodes(doc)) {
        for (const { field, text } of textOfNode(node)) {
          pattern.lastIndex = 0;
          let m;
          while ((m = pattern.exec(text)) !== null) {
            results.push({
              nodeId: node.id, nodeType: node.type, field,
              index: m.index, length: m[0].length, match: m[0],
              excerpt: excerptAround(text, m.index, m[0].length, opts.excerptRadius || 24),
            });
            if (m[0].length === 0) pattern.lastIndex += 1;
            if (results.length >= (opts.limit || 500)) return results;
          }
        }
      }
      return results;
    },

    searchByType(doc, type) {
      if (!type) throw searchError("searchByType", "INVALID_QUERY", "Widget type is required.");
      return allNodes(doc)
        .filter((n) => n.type === type)
        .map((n) => ({ nodeId: n.id, nodeType: n.type }));
    },

    searchById(doc, id) {
      const node = allNodes(doc).find((n) => n.id === id);
      return node ? [{ nodeId: node.id, nodeType: node.type }] : [];
    },

    searchByAttribute(doc, path, value) {
      if (!path) throw searchError("searchByAttribute", "INVALID_QUERY", "Attribute path is required.");
      const segs = String(path).split(".");
      const read = (obj) => segs.reduce((acc, s) => (acc && typeof acc === "object" ? acc[s] : undefined), obj);
      return allNodes(doc)
        .filter((n) => {
          const actual = read(n);
          return value instanceof RegExp ? typeof actual === "string" && value.test(actual) : actual === value;
        })
        .map((n) => ({ nodeId: n.id, nodeType: n.type, path, value: read(n) }));
    },

    search(doc, criteria = {}) {
      let pool = allNodes(doc).map((n) => ({ nodeId: n.id, nodeType: n.type }));
      if (criteria.type) pool = pool.filter((r) => r.nodeType === criteria.type);
      if (criteria.id) pool = pool.filter((r) => r.nodeId === criteria.id);
      if (criteria.text) {
        const hits = new Set(engine.searchText(doc, criteria.text, criteria).map((r) => `${r.nodeId}:${r.field}`));
        pool = pool.filter((r) => [...hits].some((h) => h.startsWith(`${r.nodeId}:`)));
      }
      if (criteria.attribute) {
        const hits = new Set(engine.searchByAttribute(doc, criteria.attribute.path, criteria.attribute.value).map((r) => r.nodeId));
        pool = pool.filter((r) => hits.has(r.nodeId));
      }
      if (typeof criteria.predicate === "function") {
        const byId = new Map(allNodes(doc).map((n) => [n.id, n]));
        pool = pool.filter((r) => { try { return !!criteria.predicate(byId.get(r.nodeId)); } catch { return false; } });
      }
      return pool;
    },

    // Replace producing edit descriptors [{ nodeId, patch }]; the caller
    // applies them (e.g. inside one transaction = one undo step).
    replaceAll(doc, search, replacement, opts = {}) {
      if (typeof search !== "string" || search === "") {
        throw searchError("replaceAll", "INVALID_QUERY", "Search string must be non-empty.");
      }
      const rep = replacement === undefined ? "" : String(replacement);
      const flags = opts.caseSensitive ? "g" : "gi";
      const pattern = new RegExp(escapeRegExp(search), flags);
      const edits = [];
      for (const node of allNodes(doc)) {
        const data = { ...(node.data || {}) };
        let changed = false;
        for (const field of ["text", "title"]) {
          if (typeof data[field] === "string" && pattern.test(data[field])) {
            pattern.lastIndex = 0;
            data[field] = data[field].replace(pattern, rep);
            changed = true;
          }
        }
        if (Array.isArray(data.content)) {
          const next = data.content.map((inline) => {
            if (inline && inline.type === "text" && typeof inline.text === "string" && pattern.test(inline.text)) {
              pattern.lastIndex = 0;
              changed = true;
              return { ...inline, text: inline.text.replace(pattern, rep) };
            }
            return inline;
          });
          if (changed) data.content = next;
        }
        if (changed) edits.push({ nodeId: node.id, patch: { data } });
      }
      return edits;
    },

    // Navigable session over a result list.
    createSession(results = []) {
      const list = [...results];
      let index = list.length > 0 ? 0 : -1;
      return {
        get size() { return list.length; },
        get index() { return index; },
        current() { return index >= 0 ? list[index] : null; },
        next() {
          if (list.length === 0) return null;
          index = (index + 1) % list.length;
          return list[index];
        },
        prev() {
          if (list.length === 0) return null;
          index = (index - 1 + list.length) % list.length;
          return list[index];
        },
        all() { return [...list]; },
      };
    },
  };

  return engine;
}

export default createSearchEngine;
