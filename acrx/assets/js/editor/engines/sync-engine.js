// acrx/assets/js/editor/engines/sync-engine.js
//
// Collaboration/Sync Engine (headless transport-agnostic core).
// Operation-based sync primitive: site-stamped operations, vector clocks,
// per-site sequence gaps buffered and released in order, dedupe and state
// snapshots. Applies nothing itself — the host applies released ops to the
// document (e.g. via the Transaction Engine) and feeds local ops back in.

export const SYNC_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "sync";

function syncError(operation, code, message) {
  const err = new Error(message);
  err.name = "SyncError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

export function createSyncEngine(options = {}) {
  const siteId = options.siteId || `site_${Math.random().toString(36).slice(2, 8)}`;
  let seq = 0;
  const clock = { [siteId]: 0 };
  const seen = new Set(); // "site:seq"
  const pending = new Map(); // site -> Map(seq -> op)
  const expected = new Map(); // site -> next expected seq
  const applied = [];

  function stamp(op) {
    seq += 1;
    clock[siteId] = seq;
    return { ...JSON.parse(JSON.stringify(op)), site: siteId, seq, clock: { ...clock } };
  }

  function mergeClock(remote) {
    for (const [site, value] of Object.entries(remote || {})) {
      clock[site] = Math.max(clock[site] || 0, value);
    }
  }

  function release(site) {
    const released = [];
    const queue = pending.get(site);
    if (!queue) return released;
    let next = expected.get(site) || 1;
    while (queue.has(next)) {
      const op = queue.get(next);
      queue.delete(next);
      released.push(op);
      applied.push(op);
      next += 1;
    }
    expected.set(site, next);
    if (queue.size === 0) pending.delete(site);
    return released;
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return SYNC_ENGINE_VERSION; },
    get siteId() { return siteId; },

    clock() {
      return { ...clock };
    },

    // Stamp local operations for broadcast. Returns stamped ops.
    submitLocal(ops) {
      const list = Array.isArray(ops) ? ops : [ops];
      if (list.length === 0) throw syncError("submitLocal", "INVALID_OPS", "Provide at least one operation.");
      const stamped = list.map((op) => {
        if (!op || typeof op !== "object" || typeof op.op !== "string") {
          throw syncError("submitLocal", "INVALID_OPS", "Operations require an op name.");
        }
        const s = stamp(op);
        seen.add(`${s.site}:${s.seq}`);
        applied.push(s);
        return s;
      });
      return stamped;
    },

    // Accept remote stamped ops. Returns { applicable, buffered } — applicable
    // ops are new and gap-free (apply now, in order); buffered wait for gaps.
    receiveRemote(ops) {
      const list = Array.isArray(ops) ? ops : [ops];
      const applicable = [];
      let buffered = 0;
      for (const raw of list) {
        if (!raw || typeof raw.site !== "string" || !Number.isInteger(raw.seq) || raw.seq < 1) {
          throw syncError("receiveRemote", "INVALID_OPS", "Remote operations require site and positive integer seq.");
        }
        const key = `${raw.site}:${raw.seq}`;
        if (seen.has(key)) continue; // dedupe retransmissions
        seen.add(key);
        mergeClock(raw.clock);
        if (!pending.has(raw.site)) pending.set(raw.site, new Map());
        pending.get(raw.site).set(raw.seq, JSON.parse(JSON.stringify(raw)));
        const released = release(raw.site);
        applicable.push(...released);
        buffered = engine.pendingCount();
      }
      return { applicable, buffered };
    },

    pendingCount() {
      let n = 0;
      for (const queue of pending.values()) n += queue.size;
      return n;
    },

    appliedOps() {
      return applied.map((op) => JSON.parse(JSON.stringify(op)));
    },

    status() {
      return { site: siteId, seq, clock: { ...clock }, applied: applied.length, pending: engine.pendingCount() };
    },

    serialize() {
      return {
        site: siteId, seq, clock: { ...clock },
        expected: [...expected.entries()],
        applied: applied.map((op) => JSON.parse(JSON.stringify(op))),
      };
    },

    restore(data) {
      if (!data || typeof data !== "object") throw syncError("restore", "INVALID_DATA", "Sync data must be an object.");
      seq = data.seq || 0;
      for (const [k, v] of Object.entries(data.clock || {})) clock[k] = v;
      if (!clock[siteId]) clock[siteId] = 0;
      expected.clear();
      for (const [site, next] of data.expected || []) expected.set(site, next);
      applied.length = 0;
      for (const op of data.applied || []) {
        applied.push(JSON.parse(JSON.stringify(op)));
        seen.add(`${op.site}:${op.seq}`);
      }
      pending.clear();
      return engine.status();
    },

    reset() {
      seq = 0;
      for (const k of Object.keys(clock)) delete clock[k];
      clock[siteId] = 0;
      seen.clear();
      pending.clear();
      expected.clear();
      applied.length = 0;
    },
  };

  return engine;
}

export default createSyncEngine;
