// src/core/runtime/render/scheduler.js
// AcroxaJS render scheduler (Phase 7 — stale-patch protection, §35).
// Per-page render fence: begin(pageId) issues a monotonically increasing
// token; commit(pageId, token, commitFn) applies ONLY when the token is
// the newest begun seq for that page. Two renders of the same page that
// finish out of order can never overwrite — the newest valid state wins:
//   render v44 starts → render v45 starts → v45 commits → v44 DROPPED.
// begin→commit is synchronous (no await between them), so the fence is
// race-free within a tick; concurrent async renders interleave only before
// begin, which is exactly the out-of-order case the fence exists for.

"use strict";

const seqs = new Map(); // pageId → latest begun seq
const dropped = new Map(); // pageId → dropped count (diagnostics)

function begin(pageId) {
  const key = String(pageId || "/");
  const s = (seqs.get(key) || 0) + 1;
  seqs.set(key, s);
  return { pageId: key, seq: s };
}

/**
 * Commit through the fence. commitFn runs only when the token is current.
 * Returns { committed, stale, snapshot? } — stale results carry no snapshot
 * and never touch the store.
 */
function commit(pageId, token, commitFn) {
  const key = String(pageId || "/");
  const cur = seqs.get(key) || 0;
  if (!token || token.seq !== cur) {
    dropped.set(key, (dropped.get(key) || 0) + 1);
    return { committed: false, stale: true };
  }
  const snapshot = commitFn();
  return { committed: true, stale: false, snapshot };
}

/** Diagnostics: how many stale renders were fenced per page. */
function stats() {
  const out = { pages: seqs.size, dropped: {} };
  for (const [k, v] of dropped) out.dropped[k] = v;
  return out;
}

module.exports = { begin, commit, stats };
