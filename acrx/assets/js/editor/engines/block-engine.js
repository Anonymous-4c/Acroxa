// acrx/assets/js/editor/engines/block-engine.js
//
// ENGINE 02 — Block Engine (headless).
// Understands structural editing units: block CRUD over the Document Engine,
// parent/child compatibility, allowed children, atomic vs container vs content
// kinds, capabilities, IDs and structural queries. Visual appearance belongs
// to widget definitions + rendering, never here.

import { createConstraintEngine } from "./constraint-engine.js";

export const BLOCK_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "block";

// Structural kinds:
//   container — holds child blocks (columns, group, list)
//   content   — holds editable inline content (paragraph, heading)
//   atomic    — self-contained leaf edited via attributes (image, button)
export function kindOf(definition, node) {
  if (definition && definition.kind) return definition.kind;
  const kids = node && Array.isArray(node.children) ? node.children.length : 0;
  if (kids > 0) return "container";
  return "content";
}

function blockError(operation, code, message) {
  const err = new Error(message);
  err.name = "BlockError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

export function createBlockEngine(options = {}) {
  if (!options.document) throw blockError("create", "NO_DOCUMENT", "Block engine requires a document instance.");
  const doc = options.document;
  // Duck-typed collaborators (set directly or via setters; never imported to
  // avoid upward dependencies): definitions, constraints.
  let definitions = options.definitions || null;
  const constraints = options.constraints || createConstraintEngine({ definitions });

  function defOf(type) {
    if (!definitions) return null;
    try {
      return definitions.get(type) || null;
    } catch {
      return null;
    }
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return BLOCK_ENGINE_VERSION; },
    get document() { return doc; },

    setDefinitions(defs) {
      definitions = defs || null;
      if (constraints && typeof constraints.setDefinitions === "function") constraints.setDefinitions(definitions);
    },

    setConstraints(c) {
      if (c) {
        // Rebind internal reference by delegation.
        for (const k of ["canInsert", "canMove", "canNest", "canDelete", "canEdit", "capability"]) {
          if (typeof c[k] === "function") engine[k] = c[k].bind(c);
        }
      }
    },

    canInsert(p, c, extra) { return constraints.canInsert({ parentType: p, childType: c, ...(extra || {}) }); },
    canMove(m) { return constraints.canMove(m); },
    canNest(p, c) { return constraints.canNest({ parentType: p, childType: c }); },
    canDelete(m) { return constraints.canDelete(m); },
    canEdit(m) { return constraints.canEdit(m); },

    createBlock(type, opts = {}) {
      if (typeof type !== "string" || type === "") throw blockError("createBlock", "INVALID_TYPE", "Block type must be a non-empty string.");
      const def = defOf(type);
      if (definitions && !def && !opts.allowUnknown) {
        throw blockError("createBlock", "UNKNOWN_TYPE", `Unknown block type "${type}".`);
      }
      const data = { ...(def && def.defaults ? JSON.parse(JSON.stringify(def.defaults)) : {}), ...(opts.data || {}) };
      if (opts.settings !== undefined) data.settings = JSON.parse(JSON.stringify(opts.settings));
      return { id: opts.id || doc.generateId(), type, parentId: null, children: [], data };
    },

    insertBlock(parentId, typeOrNode, opts = {}) {
      const parent = doc.getNode(parentId);
      if (!parent) throw blockError("insertBlock", "PARENT_NOT_FOUND", `Parent "${parentId}" does not exist.`);
      const node = typeof typeOrNode === "string" ? engine.createBlock(typeOrNode, opts) : { ...typeOrNode };
      const check = constraints.canInsert({
        parentType: parent.type, childType: node.type, index: opts.index, childCount: parent.children.length,
      });
      if (!check.allowed && !opts.force) {
        throw blockError("insertBlock", "CONSTRAINT", `Cannot insert "${node.type}" into "${parent.type}": ${check.reasons.join(" ")}`);
      }
      return doc.insertNode(parentId, node, opts.index);
    },

    removeBlock(blockId, opts = {}) {
      const node = doc.getNode(blockId);
      if (!node) throw blockError("removeBlock", "NOT_FOUND", `Block "${blockId}" does not exist.`);
      const check = constraints.canDelete({ nodeType: node.type, locked: !!node.data.locked, childCount: node.children.length });
      if (!check.allowed && !opts.force) {
        throw blockError("removeBlock", "CONSTRAINT", `Cannot delete "${node.type}": ${check.reasons.join(" ")}`);
      }
      return doc.removeNode(blockId, opts);
    },

    moveBlock(blockId, newParentId, index, opts = {}) {
      const node = doc.getNode(blockId);
      if (!node) throw blockError("moveBlock", "NOT_FOUND", `Block "${blockId}" does not exist.`);
      const parent = doc.getNode(newParentId);
      if (!parent) throw blockError("moveBlock", "PARENT_NOT_FOUND", `Parent "${newParentId}" does not exist.`);
      const check = constraints.canMove({ nodeType: node.type, fromParentType: doc.getNode(node.parentId)?.type || null, toParentType: parent.type, index });
      if (!check.allowed && !opts.force) {
        throw blockError("moveBlock", "CONSTRAINT", `Cannot move block: ${check.reasons.join(" ")}`);
      }
      return doc.moveNode(blockId, newParentId, index);
    },

    updateBlock(blockId, patch) {
      return doc.updateNode(blockId, patch);
    },

    getBlock(blockId) {
      return doc.getNode(blockId);
    },

    blockInfo(blockId) {
      const node = doc.getNode(blockId);
      if (!node) return null;
      const def = defOf(node.type);
      return {
        id: node.id,
        type: node.type,
        parentId: node.parentId,
        children: [...node.children],
        kind: kindOf(def, node),
        capabilities: def && def.capabilities ? { ...def.capabilities } : {},
        data: JSON.parse(JSON.stringify(node.data)),
      };
    },

    allowedChildrenOf(parentType) {
      const def = defOf(parentType);
      if (def && Array.isArray(def.allowedChildren) && def.allowedChildren.length > 0) return [...def.allowedChildren];
      if (!definitions || typeof definitions.list !== "function") return [];
      // Fall back: every type whose allowedParents is empty or includes parentType.
      return definitions.list()
        .map((d) => definitions.get(d.type, d.version))
        .filter((d) => !d.allowedParents || d.allowedParents.length === 0 || d.allowedParents.includes(parentType))
        .map((d) => d.type);
    },

    isContainer(blockIdOrType) {
      const def = typeof blockIdOrType === "string" && !doc.hasNode(blockIdOrType) ? defOf(blockIdOrType) : defOf(doc.getNode(blockIdOrType)?.type);
      if (def && def.kind) return def.kind === "container";
      const node = doc.hasNode(blockIdOrType) ? doc.getNode(blockIdOrType) : null;
      return node ? node.children.length > 0 : false;
    },

    isAtomic(type) {
      const def = defOf(type);
      return !!(def && (def.kind === "atomic" || def.capabilities?.editable === false));
    },

    queryByType(type) {
      return doc.findByType(type).map((n) => engine.blockInfo(n.id));
    },

    duplicateBlock(blockId, newParentId, index) {
      const node = doc.getNode(blockId);
      if (!node) throw blockError("duplicateBlock", "NOT_FOUND", `Block "${blockId}" does not exist.`);
      const parentId = newParentId || node.parentId;
      const parent = parentId ? doc.getNode(parentId) : null;
      const at = index !== undefined ? index : (parent ? parent.children.indexOf(blockId) + 1 : 0);
      const cloneSubtree = (srcId) => {
        const src = doc.getNode(srcId);
        return {
          ...JSON.parse(JSON.stringify(src)),
          id: doc.generateId(),
          children: src.children.map((cid) => cloneSubtree(cid)),
        };
      };
      // cloneSubtree nests children as objects; insertNode adopts object children.
      const draft = cloneSubtree(blockId);
      return doc.insertNode(parentId, draft, at);
    },

    siblingBlocks(blockId) {
      const node = doc.getNode(blockId);
      if (!node || node.parentId === null) return [];
      return doc.childrenOf(node.parentId);
    },
  };

  return engine;
}

export default createBlockEngine;
