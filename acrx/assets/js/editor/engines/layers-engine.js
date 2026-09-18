// acrx/assets/js/editor/engines/layers-engine.js
//
// ENGINE 13 — Layers Engine (headless).
// Document JSON in, layer-tree JSON out: hierarchy, labels, icons, nesting,
// visibility/lock/selection/expand state, layer<->document mapping and layer
// commands as move descriptors the Block Engine executes. No panel UI here.

export const LAYERS_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "layers";

function layersError(operation, code, message) {
  const err = new Error(message);
  err.name = "LayersError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function defaultLabel(node) {
  const data = (node && node.data) || {};
  const base = String(node.type || "block");
  const pretty = base.charAt(0).toUpperCase() + base.slice(1);
  let snippet = "";
  if (typeof data.text === "string" && data.text.trim()) snippet = data.text.trim();
  else if (typeof data.title === "string" && data.title.trim()) snippet = data.title.trim();
  else if (Array.isArray(data.content)) {
    snippet = data.content.filter((n) => n && n.type === "text").map((n) => n.text).join("").trim();
  }
  if (snippet.length > 32) snippet = snippet.slice(0, 31) + "…";
  return snippet ? `${pretty} — ${snippet}` : pretty;
}

export function createLayersEngine(options = {}) {
  const labelFor = typeof options.labelFor === "function" ? options.labelFor : defaultLabel;
  const iconFor = typeof options.iconFor === "function" ? options.iconFor : (node) => node.type || "block";
  const expanded = new Set(options.expanded || []);
  let selected = new Set(options.selected || []);

  function readDoc(doc) {
    if (!doc) throw layersError("build", "INVALID_DOCUMENT", "Layers require a document.");
    if (typeof doc.getNode === "function") {
      const root = doc.getNode(doc.rootId);
      const byId = new Map();
      doc.traverse((n) => byId.set(n.id, n));
      return { rootId: doc.rootId, get: (id) => byId.get(id), children: (id) => (byId.get(id)?.children || []) };
    }
    if (Array.isArray(doc.nodes)) {
      const byId = new Map(doc.nodes.map((n) => [n.id, n]));
      return { rootId: doc.rootId, get: (id) => byId.get(id), children: (id) => (byId.get(id)?.children || []) };
    }
    throw layersError("build", "INVALID_DOCUMENT", "Document must expose getNode()/traverse() or a nodes array.");
  }

  function buildNode(access, nodeId, depth) {
    const node = access.get(nodeId);
    if (!node) return null;
    const data = node.data || {};
    const layer = {
      id: node.id,
      type: node.type,
      label: labelFor(node),
      icon: iconFor(node),
      depth,
      visible: data.hidden !== true,
      locked: data.locked === true,
      selected: selected.has(node.id),
      expanded: expanded.has(node.id) || depth === 0,
      childCount: (node.children || []).length,
      children: [],
    };
    for (const cid of node.children || []) {
      const child = buildNode(access, cid, depth + 1);
      if (child) layer.children.push(child);
    }
    return layer;
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return LAYERS_ENGINE_VERSION; },

    // Full layer tree (root wrapper included) for the document.
    build(doc) {
      const access = readDoc(doc);
      return buildNode(access, access.rootId, 0);
    },

    // Top-level layers only (what the panel lists under the root).
    list(doc) {
      const tree = engine.build(doc);
      return tree ? tree.children : [];
    },

    flatten(doc) {
      const tree = engine.build(doc);
      const out = [];
      const walk = (layer) => {
        out.push({ ...layer, children: layer.children.map((c) => c.id) });
        for (const c of layer.children) walk(c);
      };
      if (tree) walk(tree);
      return out;
    },

    findLayer(doc, layerId) {
      const flat = engine.flatten(doc);
      return flat.find((l) => l.id === layerId) || null;
    },

    documentIdFor(layerId) {
      return layerId; // 1:1 mapping by construction
    },

    layerIdFor(documentId) {
      return documentId;
    },

    setSelected(ids) {
      selected = new Set(Array.isArray(ids) ? ids : []);
      return [...selected];
    },

    getSelected() {
      return [...selected];
    },

    setExpanded(id, open) {
      if (open === false) expanded.delete(id);
      else expanded.add(id);
      return expanded.has(id);
    },

    isExpanded(id) {
      return expanded.has(id);
    },

    expandAll(doc) {
      for (const l of engine.flatten(doc)) expanded.add(l.id);
      return expanded.size;
    },

    collapseAll(exceptRoot = true) {
      const keep = exceptRoot ? [...expanded].filter((id) => expanded.has(id) && false) : [];
      expanded.clear();
      for (const id of keep) expanded.add(id);
      return 0;
    },

    // Layer reorder intent -> descriptor the Block Engine executes via
    // moveBlock(descriptor.nodeId, descriptor.newParentId, descriptor.index).
    // position: "inside" | "before" | "after" relative to target layer.
    moveDescriptor(doc, sourceId, targetId, position = "inside") {
      const access = readDoc(doc);
      const source = access.get(sourceId);
      const target = access.get(targetId);
      if (!source) throw layersError("moveDescriptor", "NOT_FOUND", `Source layer "${sourceId}" does not exist.`);
      if (!target) throw layersError("moveDescriptor", "NOT_FOUND", `Target layer "${targetId}" does not exist.`);
      if (sourceId === targetId) throw layersError("moveDescriptor", "INVALID_MOVE", "Cannot move a layer relative to itself.");
      if (!["inside", "before", "after"].includes(position)) {
        throw layersError("moveDescriptor", "INVALID_MOVE", `Unknown drop position "${position}".`);
      }
      if (position === "inside") {
        return { nodeId: sourceId, newParentId: targetId, index: (target.children || []).length };
      }
      const parentId = target.parentId;
      if (parentId === null || parentId === undefined) {
        throw layersError("moveDescriptor", "INVALID_MOVE", "Cannot reorder relative to the root layer.");
      }
      const siblings = access.children(parentId);
      let index = siblings.indexOf(targetId);
      if (position === "after") index += 1;
      if (source.parentId === parentId) {
        const from = siblings.indexOf(sourceId);
        if (from >= 0 && from < index) index -= 1;
      }
      return { nodeId: sourceId, newParentId: parentId, index };
    },

    // Visibility/lock toggles as node patches (applied via updateNode).
    visibilityPatch(doc, layerId, visible) {
      const access = readDoc(doc);
      if (!access.get(layerId)) throw layersError("visibilityPatch", "NOT_FOUND", `Layer "${layerId}" does not exist.`);
      return { nodeId: layerId, patch: { data: { hidden: !visible } } };
    },

    lockPatch(doc, layerId, locked) {
      const access = readDoc(doc);
      if (!access.get(layerId)) throw layersError("lockPatch", "NOT_FOUND", `Layer "${layerId}" does not exist.`);
      return { nodeId: layerId, patch: { data: { locked: !!locked } } };
    },
  };

  return engine;
}

export default createLayersEngine;
