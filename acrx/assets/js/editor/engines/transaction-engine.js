// acrx/assets/js/editor/engines/transaction-engine.js
//
// ENGINE 09 — Transaction Engine (headless).
// The layer between commands and document mutation: atomic operation lists
// with before/after snapshots, metadata, events and rollback. Either every
// operation in a transaction applies, or the document is restored verbatim.
//
// Model: Command -> Transaction -> Operations -> Document. Operations are
// data ({ op, args }), executed against the bound document. History and
// collaboration build on the committed entries this engine produces.

export const TRANSACTION_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "transaction";

let txCounter = 0;

function txError(operation, code, message) {
  const err = new Error(message);
  err.name = "TransactionError";
  err.code = code;
  err.engine = ENGINE_ID;
  err.operation = operation;
  return err;
}

const SUPPORTED_OPS = new Set(["insert", "remove", "move", "update", "replace"]);

export function createTransactionEngine(options = {}) {
  if (!options.document) throw txError("create", "NO_DOCUMENT", "Transaction engine requires a document instance.");
  const doc = options.document;
  const listeners = new Map();
  let active = null;

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try { cb({ engine: ENGINE_ID, event, ...payload }); } catch (err) {
        if (typeof console !== "undefined") console.error(`[transaction] listener for "${event}" threw:`, err);
      }
    }
  }

  function applyOp(op) {
    if (!op || typeof op !== "object" || !SUPPORTED_OPS.has(op.op)) {
      throw txError("apply", "INVALID_OP", `Unsupported operation ${JSON.stringify(op && op.op)}.`);
    }
    const a = op.args || {};
    switch (op.op) {
      case "insert": return doc.insertNode(a.parentId, a.node, a.index);
      case "remove": return doc.removeNode(a.nodeId, a.opts || {});
      case "move": return doc.moveNode(a.nodeId, a.newParentId, a.index);
      case "update": return doc.updateNode(a.nodeId, a.patch || {});
      case "replace": return doc.replaceNode(a.nodeId, a.node);
      default: throw txError("apply", "INVALID_OP", `Unsupported operation "${op.op}".`);
    }
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return TRANSACTION_ENGINE_VERSION; },
    get document() { return doc; },
    get active() { return active ? { id: active.id, ops: active.ops.length } : null; },

    begin(meta = {}) {
      if (active) throw txError("begin", "NESTED_TRANSACTION", "A transaction is already active; nested transactions are not supported.");
      active = {
        id: meta.id || `tx_${(++txCounter).toString(36)}_${Date.now().toString(36)}`,
        meta: { ...meta },
        ops: [],
        before: doc.snapshot(),
        startedRev: doc.rev,
      };
      emit("transaction:started", { id: active.id, meta: { ...active.meta } });
      return active.id;
    },

    add(op) {
      if (!active) throw txError("add", "NO_ACTIVE_TRANSACTION", "No active transaction; call begin() first.");
      const recorded = JSON.parse(JSON.stringify({ op: op.op, args: op.args || {} }));
      const result = applyOp(recorded); // throws -> caller decides rollback
      active.ops.push(recorded);
      return result;
    },

    commit() {
      if (!active) throw txError("commit", "NO_ACTIVE_TRANSACTION", "No active transaction to commit.");
      const entry = {
        id: active.id,
        ops: active.ops.map((o) => JSON.parse(JSON.stringify(o))),
        before: active.before,
        after: doc.snapshot(),
        meta: { ...active.meta },
      };
      active = null;
      emit("transaction:committed", { id: entry.id, ops: entry.ops.length, meta: { ...entry.meta } });
      return entry;
    },

    rollback(reason) {
      if (!active) throw txError("rollback", "NO_ACTIVE_TRANSACTION", "No active transaction to roll back.");
      doc.restore(JSON.parse(JSON.stringify(active.before)));
      const id = active.id;
      active = null;
      emit("transaction:rolledback", { id, reason: reason || null });
      return id;
    },

    // Run fn(tx) with an active transaction; commit on success, restore and
    // rethrow on failure. Returns the committed entry.
    run(meta, fn) {
      if (typeof meta === "function") { fn = meta; meta = {}; }
      const id = engine.begin(meta);
      try {
        const api = {
          id,
          add: (op) => engine.add(op),
          insert: (parentId, node, index) => engine.add({ op: "insert", args: { parentId, node, index } }),
          remove: (nodeId, opts) => engine.add({ op: "remove", args: { nodeId, opts } }),
          move: (nodeId, newParentId, index) => engine.add({ op: "move", args: { nodeId, newParentId, index } }),
          update: (nodeId, patch) => engine.add({ op: "update", args: { nodeId, patch } }),
          replace: (nodeId, node) => engine.add({ op: "replace", args: { nodeId, node } }),
        };
        const result = fn(api);
        const entry = engine.commit();
        entry.result = result === undefined ? null : result;
        return entry;
      } catch (err) {
        engine.rollback(err && err.message ? err.message : String(err));
        throw err;
      }
    },

    on(event, cb) {
      if (typeof cb !== "function") throw txError("on", "INVALID_LISTENER", "Listener must be a function.");
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => engine.off(event, cb);
    },

    off(event, cb) {
      const set = listeners.get(event);
      if (!set) return;
      if (cb) { set.delete(cb); if (set.size === 0) listeners.delete(event); }
      else listeners.delete(event);
    },

    destroy() {
      if (active) {
        try { engine.rollback("destroy"); } catch { /* already inconsistent; drop */ }
      }
      listeners.clear();
    },
  };

  return engine;
}

export default createTransactionEngine;
