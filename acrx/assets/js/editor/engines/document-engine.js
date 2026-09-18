// acrx/assets/js/editor/engines/document-engine.js
//
// ENGINE 01 — Document Engine (headless).
// Canonical structured representation of the editable document: an ID-based
// node tree ({ id, type, parentId, children, data }) — never raw HTML.
// Owns creation, loading, structural mutation, traversal, queries, versioned
// snapshots and structural validation. Zero dependencies, no DOM.

export const DOCUMENT_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "document";
export const DOCUMENT_SCHEMA_VERSION = 1;

function clone(value) {
  if (value === null || typeof value !== "object") return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function docError(operation, code, message, extra = {}) {
  const err = new Error(message);
  err.name = "DocumentError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  err.path = extra.path || null;
  return err;
}

function assertNodeShape(node, operation) {
  if (!node || typeof node !== "object") throw docError(operation, "INVALID_NODE", "Node must be an object.");
  if (typeof node.id !== "string" || node.id === "") throw docError(operation, "INVALID_NODE", "Node requires a non-empty string id.");
  if (typeof node.type !== "string" || node.type === "") throw docError(operation, "INVALID_NODE", `Node "${node.id}" requires a non-empty string type.`);
}

export function createDocument(options = {}) {
  const schemaVersion = options.schemaVersion || DOCUMENT_SCHEMA_VERSION;
  const id = options.id || null;
  let counter = 0;
  const idFactory = options.idFactory || (() => `node_${(++counter).toString(36)}_${Date.now().toString(36)}`);

  const nodes = new Map();
  let rootId = null;
  let rev = 0;
  const listeners = new Map();

  function emit(event, payload = {}) {
    const set = listeners.get(event);
    if (!set) return;
    const ctx = { engine: ENGINE_ID, event, documentId: id, rev, ...payload };
    for (const cb of [...set]) {
      try { cb(ctx); } catch (err) {
        if (typeof console !== "undefined") console.error(`[document-engine] listener for "${event}" threw:`, err);
      }
    }
  }

  function storedNode(node) {
    return {
      id: node.id,
      type: node.type,
      parentId: node.parentId === undefined ? null : node.parentId,
      children: Array.isArray(node.children) ? [...node.children] : [],
      data: node.data !== undefined ? clone(node.data) : {},
    };
  }

  function bump(event, payload) {
    rev++;
    emit(event, payload);
  }

  // Root ---------------------------------------------------------------
  const rootType = options.rootType || "document";
  const root = storedNode({ id: options.rootId || idFactory(), type: rootType, parentId: null, children: [], data: options.rootData || {} });
  nodes.set(root.id, root);
  rootId = root.id;

  const doc = {
    get engine() { return ENGINE_ID; },
    get id() { return id; },
    get schemaVersion() { return schemaVersion; },
    get rootId() { return rootId; },
    get rev() { return rev; },
    get size() { return nodes.size; },

    on(event, cb) {
      if (typeof cb !== "function") throw docError("on", "INVALID_LISTENER", "Listener must be a function.");
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => doc.off(event, cb);
    },

    off(event, cb) {
      const set = listeners.get(event);
      if (!set) return;
      if (cb) { set.delete(cb); if (set.size === 0) listeners.delete(event); }
      else listeners.delete(event);
    },

    generateId() {
      let next = idFactory();
      while (nodes.has(next)) next = idFactory();
      return next;
    },

    hasNode(nodeId) {
      return nodes.has(nodeId);
    },

    getNode(nodeId) {
      const n = nodes.get(nodeId);
      return n ? clone(n) : null;
    },

    childrenOf(nodeId) {
      const n = nodes.get(nodeId);
      if (!n) return null;
      return n.children.map((cid) => clone(nodes.get(cid))).filter(Boolean);
    },

    parentOf(nodeId) {
      const n = nodes.get(nodeId);
      if (!n || n.parentId === null) return null;
      const p = nodes.get(n.parentId);
      return p ? clone(p) : null;
    },

    ancestorsOf(nodeId) {
      const out = [];
      let cur = nodes.get(nodeId);
      const seen = new Set();
      while (cur && cur.parentId !== null && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = nodes.get(cur.parentId);
        if (cur) out.unshift(clone(cur));
      }
      return out;
    },

    descendantsOf(nodeId) {
      const out = [];
      const walk = (nid) => {
        const n = nodes.get(nid);
        if (!n) return;
        for (const cid of n.children) {
          const c = nodes.get(cid);
          if (c) { out.push(clone(c)); walk(cid); }
        }
      };
      walk(nodeId);
      return out;
    },

    pathTo(nodeId) {
      if (!nodes.has(nodeId)) return null;
      return [...doc.ancestorsOf(nodeId).map((n) => n.id), nodeId];
    },

    depthOf(nodeId) {
      if (!nodes.has(nodeId)) return -1;
      return doc.ancestorsOf(nodeId).length;
    },

    insertNode(parentId, node, index) {
      const parent = nodes.get(parentId);
      if (!parent) throw docError("insertNode", "PARENT_NOT_FOUND", `Parent "${parentId}" does not exist.`, { path: parentId });
      const draft = { ...clone(node || {}) };
      if (!draft.id) draft.id = doc.generateId();
      assertNodeShape(draft, "insertNode");
      if (nodes.has(draft.id)) throw docError("insertNode", "DUPLICATE_ID", `Node id "${draft.id}" already exists.`, { path: draft.id });
      draft.parentId = parentId;
      const stored = storedNode({ ...draft, children: [] });
      // Adopt provided children recursively when given as full node objects.
      nodes.set(stored.id, stored);
      const at = index === undefined || index === null ? parent.children.length : index;
      if (!Number.isInteger(at) || at < 0 || at > parent.children.length) {
        nodes.delete(stored.id);
        throw docError("insertNode", "INVALID_INDEX", `Insert index ${at} out of bounds for parent "${parentId}".`, { path: parentId });
      }
      parent.children.splice(at, 0, stored.id);
      if (Array.isArray(draft.children) && draft.children.length > 0 && typeof draft.children[0] === "object") {
        for (const child of draft.children) doc.insertNode(stored.id, child);
      }
      bump("node:inserted", { node: clone(stored), parentId, index: at });
      return clone(stored);
    },

    appendNode(parentId, node) {
      return doc.insertNode(parentId, node);
    },

    removeNode(nodeId, opts = {}) {
      const target = nodes.get(nodeId);
      if (!target) throw docError("removeNode", "NODE_NOT_FOUND", `Node "${nodeId}" does not exist.`, { path: nodeId });
      if (nodeId === rootId && !opts.allowRoot) {
        throw docError("removeNode", "CANNOT_REMOVE_ROOT", "The root node cannot be removed.");
      }
      const cascade = opts.cascade !== false;
      const doomed = cascade ? [nodeId, ...doc.descendantsOf(nodeId).map((n) => n.id)] : [nodeId];
      if (!cascade && target.children.length > 0) {
        throw docError("removeNode", "HAS_CHILDREN", `Node "${nodeId}" has children; use cascade removal.`, { path: nodeId });
      }
      const parent = target.parentId !== null ? nodes.get(target.parentId) : null;
      if (parent) parent.children = parent.children.filter((c) => c !== nodeId);
      const removed = [];
      for (const did of doomed) {
        const n = nodes.get(did);
        if (n) { removed.push(clone(n)); nodes.delete(did); }
      }
      bump("node:removed", { nodes: removed, parentId: parent ? parent.id : null });
      return removed;
    },

    moveNode(nodeId, newParentId, index) {
      const target = nodes.get(nodeId);
      if (!target) throw docError("moveNode", "NODE_NOT_FOUND", `Node "${nodeId}" does not exist.`, { path: nodeId });
      const newParent = nodes.get(newParentId);
      if (!newParent) throw docError("moveNode", "PARENT_NOT_FOUND", `Parent "${newParentId}" does not exist.`, { path: newParentId });
      if (nodeId === rootId) throw docError("moveNode", "CANNOT_MOVE_ROOT", "The root node cannot be moved.");
      if (nodeId === newParentId || doc.descendantsOf(nodeId).some((n) => n.id === newParentId)) {
        throw docError("moveNode", "CYCLE", `Moving "${nodeId}" under "${newParentId}" would create a cycle.`);
      }
      const oldParent = target.parentId !== null ? nodes.get(target.parentId) : null;
      const oldIndex = oldParent ? oldParent.children.indexOf(nodeId) : -1;
      if (oldParent) oldParent.children = oldParent.children.filter((c) => c !== nodeId);
      const at = index === undefined || index === null ? newParent.children.length : index;
      if (!Number.isInteger(at) || at < 0 || at > newParent.children.length) {
        if (oldParent && oldIndex >= 0) oldParent.children.splice(Math.min(oldIndex, oldParent.children.length), 0, nodeId);
        throw docError("moveNode", "INVALID_INDEX", `Move index ${at} out of bounds.`, { path: newParentId });
      }
      newParent.children.splice(at, 0, nodeId);
      target.parentId = newParentId;
      bump("node:moved", { nodeId, from: oldParent ? oldParent.id : null, oldIndex, to: newParentId, index: at });
      return clone(target);
    },

    replaceNode(nodeId, node) {
      const target = nodes.get(nodeId);
      if (!target) throw docError("replaceNode", "NODE_NOT_FOUND", `Node "${nodeId}" does not exist.`, { path: nodeId });
      if (nodeId === rootId) throw docError("replaceNode", "CANNOT_REPLACE_ROOT", "The root node cannot be replaced.");
      const draft = { ...clone(node || {}), id: nodeId, parentId: target.parentId };
      assertNodeShape(draft, "replaceNode");
      const kids = [...target.children];
      nodes.set(nodeId, storedNode({ ...draft, children: kids }));
      bump("node:replaced", { node: doc.getNode(nodeId) });
      return doc.getNode(nodeId);
    },

    updateNode(nodeId, patch = {}) {
      const target = nodes.get(nodeId);
      if (!target) throw docError("updateNode", "NODE_NOT_FOUND", `Node "${nodeId}" does not exist.`, { path: nodeId });
      if (patch.type !== undefined) {
        if (typeof patch.type !== "string" || patch.type === "") {
          throw docError("updateNode", "INVALID_NODE", "Node type must be a non-empty string.");
        }
        target.type = patch.type;
      }
      if (patch.data !== undefined) {
        if (patch.data === null || typeof patch.data !== "object" || Array.isArray(patch.data)) {
          throw docError("updateNode", "INVALID_NODE", "Node data must be a plain object.");
        }
        target.data = { ...target.data, ...clone(patch.data) };
      }
      bump("node:updated", { node: clone(target) });
      return clone(target);
    },

    find(predicate) {
      const out = [];
      for (const n of nodes.values()) {
        const snap = clone(n);
        if (predicate(snap)) out.push(snap);
      }
      return out;
    },

    findByType(type) {
      return doc.find((n) => n.type === type);
    },

    traverse(cb, opts = {}) {
      const order = opts.order || "depth";
      const visit = (nid) => {
        const n = nodes.get(nid);
        if (!n) return false;
        if (cb(clone(n)) === false) return false;
        for (const cid of n.children) {
          if (visit(cid) === false && order === "depth") return false;
        }
        return true;
      };
      if (order === "breadth") {
        const queue = [rootId];
        while (queue.length > 0) {
          const nid = queue.shift();
          const n = nodes.get(nid);
          if (!n) continue;
          if (cb(clone(n)) === false) return;
          queue.push(...n.children);
        }
        return;
      }
      visit(rootId);
    },

    // Immutable, frozen snapshot safe to persist or hand to history/AI layers.
    snapshot() {
      const snap = {
        id,
        schemaVersion,
        rootId,
        rev,
        nodes: [...nodes.values()].map((n) => clone(n)),
      };
      return Object.freeze(JSON.parse(JSON.stringify(snap)));
    },

    restore(snapshot) {
      if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.nodes)) {
        throw docError("restore", "INVALID_SNAPSHOT", "Snapshot must contain a nodes array.");
      }
      nodes.clear();
      for (const n of snapshot.nodes) {
        assertNodeShape(n, "restore");
        nodes.set(n.id, storedNode(n));
      }
      if (!snapshot.rootId || !nodes.has(snapshot.rootId)) {
        throw docError("restore", "INVALID_SNAPSHOT", "Snapshot rootId is missing or unknown.");
      }
      rootId = snapshot.rootId;
      rev = typeof snapshot.rev === "number" ? snapshot.rev : 0;
      bump("document:restored", { rootId });
      return doc.snapshot();
    },

    validateStructure() {
      const errors = [];
      const fail = (code, path, message) => errors.push({ code, path, message, severity: "error" });
      if (!rootId || !nodes.has(rootId)) {
        fail("NO_ROOT", "", "Document has no resolvable root node.");
        return { valid: false, errors, warnings: [] };
      }
      for (const n of nodes.values()) {
        if (n.parentId === null) {
          if (n.id !== rootId) fail("ORPHAN_ROOT", n.id, `Node "${n.id}" has no parent but is not the root.`);
          continue;
        }
        const parent = nodes.get(n.parentId);
        if (!parent) {
          fail("MISSING_PARENT", n.id, `Node "${n.id}" references missing parent "${n.parentId}".`);
        } else if (!parent.children.includes(n.id)) {
          fail("PARENT_CHILD_MISMATCH", n.id, `Parent "${n.parentId}" does not list child "${n.id}".`);
        }
        for (const cid of n.children) {
          const child = nodes.get(cid);
          if (!child) fail("MISSING_CHILD", n.id, `Node "${n.id}" references missing child "${cid}".`);
          else if (child.parentId !== n.id) fail("PARENT_CHILD_MISMATCH", cid, `Child "${cid}" does not point back to parent "${n.id}".`);
        }
      }
      // Cycle detection from root.
      const seen = new Set();
      const stack = [rootId];
      while (stack.length > 0) {
        const nid = stack.pop();
        if (seen.has(nid)) { fail("CYCLE", nid, `Cycle detected at node "${nid}".`); break; }
        seen.add(nid);
        const n = nodes.get(nid);
        if (n) stack.push(...n.children);
      }
      for (const nid of nodes.keys()) {
        if (!seen.has(nid)) fail("UNREACHABLE", nid, `Node "${nid}" is unreachable from the root.`);
      }
      return { valid: errors.length === 0, errors, warnings: [] };
    },

    toJSON() {
      return {
        id,
        schemaVersion,
        rootId,
        rev,
        nodes: [...nodes.values()].map((n) => clone(n)),
      };
    },
  };

  return doc;
}

export function loadDocument(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.nodes)) {
    const err = new Error("Document JSON must contain a nodes array.");
    err.name = "DocumentError"; err.code = "INVALID_DOCUMENT"; err.engine = ENGINE_ID; err.operation = "loadDocument";
    throw err;
  }
  const doc = createDocument({
    id: json.id || null,
    schemaVersion: json.schemaVersion || DOCUMENT_SCHEMA_VERSION,
    rootId: json.rootId || undefined,
    rootType: "document",
  });
  // Replace the auto-created root with the serialized tree.
  const incomingRoot = json.rootId || (json.nodes[0] && json.nodes[0].id);
  const snapshot = {
    id: json.id || null,
    schemaVersion: json.schemaVersion || DOCUMENT_SCHEMA_VERSION,
    rootId: incomingRoot,
    rev: typeof json.rev === "number" ? json.rev : 0,
    nodes: json.nodes,
  };
  doc.restore(snapshot);
  return doc;
}

export function cloneDocument(doc) {
  return loadDocument(JSON.parse(JSON.stringify(doc.toJSON())));
}

export default createDocument;
