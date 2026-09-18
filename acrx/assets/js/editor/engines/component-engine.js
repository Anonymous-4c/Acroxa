// acrx/assets/js/editor/engines/component-engine.js
//
// ENGINE 40 — Component/Symbol Engine (headless).
// Reusable components: definitions (node subtrees), instances with per-node
// overrides, shared-property updates, detaching, versioning and
// serialization. Operates on plain node trees; the document owns insertion.

export const COMPONENT_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "component";

let componentCounter = 0;
let instanceCounter = 0;

function compError(operation, code, message) {
  const err = new Error(message);
  err.name = "ComponentError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function freshTree(nodes, idMap) {
  // Deep-clone a forest, regenerating every id and recording old->new.
  const cloneNode = (node) => {
    const oldId = node.id;
    const freshId = `cmp_${(++componentCounter).toString(36)}_${oldId}`;
    idMap.set(oldId, freshId);
    return {
      ...JSON.parse(JSON.stringify(node)),
      id: freshId,
      children: (node.children || []).map((c) => (typeof c === "object" ? cloneNode(c) : c)),
    };
  };
  return nodes.map(cloneNode);
}

function applyOverridesToForest(forest, idMap, overrides) {
  // overrides keyed by TEMPLATE node id -> data patch.
  const reversed = new Map([...idMap.entries()].map(([oldId, newId]) => [newId, oldId]));
  const walk = (node) => {
    const templateId = reversed.get(node.id);
    if (templateId && overrides[templateId] && typeof overrides[templateId] === "object") {
      node.data = { ...(node.data || {}), ...JSON.parse(JSON.stringify(overrides[templateId])) };
    }
    for (const child of node.children || []) {
      if (child && typeof child === "object") walk(child);
    }
  };
  for (const root of forest) walk(root);
  return forest;
}

export function createComponentEngine() {
  const components = new Map(); // id -> { id, name, version, nodes, shared }
  const instances = new Map(); // instanceId -> { id, componentId, version, rootIds, overrides }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return COMPONENT_ENGINE_VERSION; },

    define(raw) {
      if (!raw || typeof raw !== "object") throw compError("define", "INVALID_COMPONENT", "Component definition must be an object.");
      if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
        throw compError("define", "INVALID_COMPONENT", "Component requires a non-empty nodes array.");
      }
      for (const n of raw.nodes) {
        if (!n || typeof n.id !== "string" || typeof n.type !== "string") {
          throw compError("define", "INVALID_COMPONENT", "Component nodes require string id and type.");
        }
      }
      const def = {
        id: raw.id || `component_${(++componentCounter).toString(36)}`,
        name: raw.name || "Untitled component",
        version: Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 1,
        description: raw.description || "",
        nodes: JSON.parse(JSON.stringify(raw.nodes)),
        shared: raw.shared && typeof raw.shared === "object" ? JSON.parse(JSON.stringify(raw.shared)) : {},
      };
      components.set(def.id, def);
      return JSON.parse(JSON.stringify(def));
    },

    get(id) {
      const d = components.get(id);
      return d ? JSON.parse(JSON.stringify(d)) : null;
    },

    has(id) {
      return components.has(id);
    },

    list() {
      return [...components.values()].map((d) => ({ id: d.id, name: d.name, version: d.version, description: d.description, nodeCount: d.nodes.length }));
    },

    unregister(id) {
      for (const inst of instances.values()) {
        if (inst.componentId === id) throw compError("unregister", "IN_USE", `Component "${id}" still has live instances.`);
      }
      return components.delete(id);
    },

    updateShared(id, patch) {
      const def = components.get(id);
      if (!def) throw compError("updateShared", "NOT_FOUND", `Component "${id}" does not exist.`);
      def.shared = { ...def.shared, ...JSON.parse(JSON.stringify(patch || {})) };
      def.version += 1;
      return JSON.parse(JSON.stringify(def));
    },

    instantiate(componentId, opts = {}) {
      const def = components.get(componentId);
      if (!def) throw compError("instantiate", "NOT_FOUND", `Component "${componentId}" does not exist.`);
      const overrides = opts.overrides && typeof opts.overrides === "object" ? opts.overrides : {};
      const idMap = new Map();
      const forest = applyOverridesToForest(freshTree(def.nodes, idMap), idMap, overrides);
      // Merge shared props under each root's data without clobbering overrides.
      for (const root of forest) {
        root.data = { ...JSON.parse(JSON.stringify(def.shared)), ...(root.data || {}) };
      }
      const instance = {
        id: opts.id || `inst_${(++instanceCounter).toString(36)}`,
        componentId,
        version: def.version,
        rootIds: forest.map((r) => r.id),
        overrides: JSON.parse(JSON.stringify(overrides)),
      };
      instances.set(instance.id, instance);
      return { roots: forest, instance: JSON.parse(JSON.stringify(instance)) };
    },

    instancesOf(componentId) {
      return [...instances.values()]
        .filter((i) => i.componentId === componentId)
        .map((i) => JSON.parse(JSON.stringify(i)));
    },

    getInstance(id) {
      const inst = instances.get(id);
      return inst ? JSON.parse(JSON.stringify(inst)) : null;
    },

    updateInstanceOverrides(id, overrides) {
      const inst = instances.get(id);
      if (!inst) throw compError("updateInstanceOverrides", "NOT_FOUND", `Instance "${id}" does not exist.`);
      inst.overrides = { ...(inst.overrides || {}), ...JSON.parse(JSON.stringify(overrides || {})) };
      return JSON.parse(JSON.stringify(inst));
    },

    // Detach: instance becomes independent blocks; record is dropped and the
    // caller keeps the (already overridden) tree it inserted.
    detach(id) {
      const inst = instances.get(id);
      if (!inst) throw compError("detach", "NOT_FOUND", `Instance "${id}" does not exist.`);
      instances.delete(id);
      return true;
    },

    toJSON() {
      return {
        components: [...components.values()].map((d) => JSON.parse(JSON.stringify(d))),
        instances: [...instances.values()].map((i) => JSON.parse(JSON.stringify(i))),
      };
    },

    fromJSON(data) {
      if (!data || typeof data !== "object") throw compError("fromJSON", "INVALID_DATA", "Component data must be an object.");
      components.clear();
      instances.clear();
      for (const raw of data.components || []) engine.define(raw);
      for (const inst of data.instances || []) {
        if (inst && inst.id && inst.componentId) instances.set(inst.id, JSON.parse(JSON.stringify(inst)));
      }
      return { components: components.size, instances: instances.size };
    },

    clear() {
      components.clear();
      instances.clear();
    },

    destroy() {
      components.clear();
      instances.clear();
    },
  };

  return engine;
}

export default createComponentEngine;
