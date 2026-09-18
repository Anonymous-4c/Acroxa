// acrx/assets/js/editor/engines/constraint-engine.js
//
// ENGINE 20 — Constraint Engine (headless).
// Answers capability questions for every structural mutation:
// canInsert / canMove / canNest / canDelete / canEdit. Rules derive from
// widget definitions (allowedParents/allowedChildren, capabilities, lock
// flags) plus caller-registered custom rules. Pure data in, verdict out.

export const CONSTRAINT_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "constraint";

function verdict(allowed, reasons = []) {
  return { allowed, reasons: [...reasons] };
}

export function createConstraintEngine(options = {}) {
  // definitions: duck-typed { get(type) -> def | null } (widget-definition engine).
  let definitions = options.definitions || null;
  const customRules = new Map(); // kind -> Array<fn>

  function ruleError(operation, message) {
    const err = new Error(message);
    err.name = "ConstraintError";
    err.engine = ENGINE_ID;
    err.operation = operation;
    return err;
  }

  function defOf(type) {
    if (!definitions || !type) return null;
    try {
      return definitions.get(type) || null;
    } catch {
      return null;
    }
  }

  function runCustom(kind, ctx) {
    const reasons = [];
    let allowed = true;
    for (const fn of customRules.get(kind) || []) {
      let out;
      try {
        out = fn(ctx);
      } catch (err) {
        allowed = false;
        reasons.push(`Custom ${kind} rule threw: ${err && err.message ? err.message : String(err)}.`);
        continue;
      }
      if (out === false || (out && out.allowed === false)) {
        allowed = false;
        reasons.push((out && out.reason) || `Custom ${kind} rule denied the operation.`);
      } else if (out && out.reason) {
        reasons.push(out.reason);
      }
    }
    return { allowed, reasons };
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return CONSTRAINT_ENGINE_VERSION; },

    setDefinitions(defs) {
      definitions = defs || null;
    },

    addRule(kind, fn) {
      if (typeof fn !== "function") throw ruleError("addRule", "Rule handler must be a function.");
      if (!customRules.has(kind)) customRules.set(kind, []);
      customRules.get(kind).push(fn);
      return () => engine.removeRule(kind, fn);
    },

    removeRule(kind, fn) {
      const list = customRules.get(kind);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },

    canInsert({ parentType, childType, index, childCount } = {}) {
      const reasons = [];
      if (!childType) return verdict(false, ["Child widget type is required."]);
      const child = defOf(childType);
      const parent = parentType ? defOf(parentType) : null;
      if (child && child.allowedParents && child.allowedParents.length > 0 && parentType) {
        if (!child.allowedParents.includes(parentType)) {
          reasons.push(`"${childType}" is not allowed inside "${parentType}".`);
        }
      }
      if (parent && parent.allowedChildren && parent.allowedChildren.length > 0) {
        if (!parent.allowedChildren.includes(childType)) {
          reasons.push(`"${parentType}" does not accept "${childType}" children.`);
        }
      }
      if (parent && parent.constraints && typeof parent.constraints.maxChildren === "number" && typeof childCount === "number") {
        if (childCount >= parent.constraints.maxChildren) {
          reasons.push(`"${parentType}" allows at most ${parent.constraints.maxChildren} children.`);
        }
      }
      if (index !== undefined && (!Number.isInteger(index) || index < 0)) {
        reasons.push("Insert index must be a non-negative integer.");
      }
      const custom = runCustom("insert", { parentType, childType, index, childCount });
      return verdict(reasons.length === 0 && custom.allowed, [...reasons, ...custom.reasons]);
    },

    canMove({ nodeType, fromParentType, toParentType, index } = {}) {
      const reasons = [];
      const def = defOf(nodeType);
      if (def && def.capabilities && def.capabilities.draggable === false) {
        reasons.push(`"${nodeType}" is not draggable.`);
      }
      const asInsert = engine.canInsert({ parentType: toParentType, childType: nodeType, index });
      const custom = runCustom("move", { nodeType, fromParentType, toParentType, index });
      return verdict(reasons.length === 0 && asInsert.allowed && custom.allowed,
        [...reasons, ...asInsert.reasons, ...custom.reasons]);
    },

    canNest({ parentType, childType } = {}) {
      const reasons = [];
      const parent = defOf(parentType);
      if (parent && parent.capabilities && parent.capabilities.nestable === false) {
        reasons.push(`"${parentType}" cannot contain nested widgets.`);
      }
      const asInsert = engine.canInsert({ parentType, childType });
      const custom = runCustom("nest", { parentType, childType });
      return verdict(reasons.length === 0 && asInsert.allowed && custom.allowed,
        [...reasons, ...asInsert.reasons, ...custom.reasons]);
    },

    canDelete({ nodeType, locked, childCount } = {}) {
      const reasons = [];
      if (locked) reasons.push("Locked widgets cannot be deleted.");
      const def = defOf(nodeType);
      if (def && def.capabilities && def.capabilities.deletable === false) {
        reasons.push(`"${nodeType}" cannot be deleted.`);
      }
      if (childCount > 0 && def && def.constraints && def.constraints.protectChildren) {
        reasons.push(`"${nodeType}" still contains children.`);
      }
      const custom = runCustom("delete", { nodeType, locked, childCount });
      return verdict(reasons.length === 0 && custom.allowed, [...reasons, ...custom.reasons]);
    },

    canEdit({ nodeType, locked } = {}) {
      const reasons = [];
      if (locked) reasons.push("Locked widgets cannot be edited.");
      const def = defOf(nodeType);
      if (def && def.capabilities && def.capabilities.editable === false) {
        reasons.push(`"${nodeType}" is not editable.`);
      }
      const custom = runCustom("edit", { nodeType, locked });
      return verdict(reasons.length === 0 && custom.allowed, [...reasons, ...custom.reasons]);
    },

    capability(nodeType, name) {
      const def = defOf(nodeType);
      if (!def || !def.capabilities) return false;
      return def.capabilities[name] === true;
    },

    clearRules() {
      customRules.clear();
    },
  };

  return engine;
}

export default createConstraintEngine;
