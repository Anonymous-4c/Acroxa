// src/core/runtime/render/snapshot.js
// AcroxaJS versioned render snapshots (Phase 2).
// Per-page monotonic version + content hash + recorded tree. Global-slot
// backed (survives re-require, consistent with revision.js/graph.js).
//
// Snapshot shape:
//   { page, version, hash, bytes, root, deps, owners, cacheMeta, at, ms }
//   root = serialized tree (context-recorded) or { type:"html", html }
//          when no tree was recorded (e.g. output-cache render path).
//
// History: last HISTORY_CAP versions per page serve `get(page, v)` and
// `since(page, v)` — the resync protocol (Phase 5/6) reconciles from these
// instead of corrupting the DOM. Capped, never unbounded.

"use strict";

const crypto = require("node:crypto");
const tree = require("./tree");

const GLOBAL_KEY = "__acroxa_snapshots__";
const HISTORY_CAP = 20;

function _slot() {
  if (!global[GLOBAL_KEY]) global[GLOBAL_KEY] = { pages: new Map() };
  return global[GLOBAL_KEY];
}

function _pageEntry(s, key) {
  if (!s.pages.has(key)) {
    s.pages.set(key, { version: 0, snapshot: null, history: [], stale: false });
  }
  return s.pages.get(key);
}

function _hash(html) {
  const h = crypto.createHash("sha1").update(String(html || "")).digest("hex");
  return h.slice(0, 16);
}

/**
 * Commit a new snapshot for `page`. Overwrites `latest`, keeps history.
 * opts: { tree (flat recorded nodes), html, deps[], owners[], cacheMeta, ms }
 * Returns the committed snapshot.
 */
function commit(page, opts = {}) {
  const s = _slot();
  const key = String(page || "/");
  const html = String(opts.html || "");
  const entry = _pageEntry(s, key);
  const version = entry.version + 1;

  let root = null;
  if (opts.root && typeof opts.root === "object") {
    // Prebuilt serialized root (callers that already built the tree for
    // diffing — commit never rebuilds what it can reuse).
    root = opts.root;
  } else if (Array.isArray(opts.tree) && opts.tree.length) {
    const built = tree.build(opts.tree);
    root = built.roots.length === 1
      ? tree.serialize(built.roots[0])
      : { type: "fragment", id: "page-root", children: built.roots.map((r) => tree.serialize(r)) };
  } else {
    root = { type: "html", id: "page-root", html };
  }

  const owners = new Set(opts.owners || []);
  const snap = {
    page: key,
    version,
    hash: _hash(html),
    bytes: Buffer.byteLength(html),
    root,
    deps: [...new Set(opts.deps || [])],
    owners: [...owners],
    cacheMeta: opts.cacheMeta && typeof opts.cacheMeta === "object" ? { ...opts.cacheMeta } : null,
    at: Date.now(),
    ms: Number.isFinite(opts.ms) ? opts.ms : null,
  };

  const history = entry.history || [];
  if (entry.snapshot) history.push(entry.snapshot);
  while (history.length > HISTORY_CAP) history.shift();

  entry.version = version;
  entry.snapshot = snap;
  entry.history = history;
  entry.stale = false;

  // Lifecycle hook (Phase 9): fired at the real commit point.
  try { require("../hookBus").run("render:afterSnapshot", { page: key, version, hash: snap.hash }); } catch (_) {}

  return snap;
}

/** Latest snapshot for a page or null. */
function latest(page) {
  const entry = _slot().pages.get(String(page || "/"));
  return entry ? entry.snapshot : null;
}

/** Mark a page's snapshots stale (cache validity) — history KEPT for diffing
 * and resync. This is what invalidation does; it never destroys the diff
 * source. */
function markStale(page) {
  const entry = _slot().pages.get(String(page || "/"));
  if (!entry) return false;
  entry.stale = true;
  return true;
}

function isStale(page) {
  const entry = _slot().pages.get(String(page || "/"));
  return entry ? entry.stale === true : false;
}

/** Specific version from history (resync) or null. */
function get(page, version) {
  const entry = _slot().pages.get(String(page || "/"));
  if (!entry) return null;
  if (entry.version === version) return entry.snapshot;
  const found = entry.history.find((h) => h.version === version);
  return found || null;
}

/**
 * Resync view: is the client's version current, stale-but-recoverable, or
 * too old (needsFull)? Returns { current, missed[], from, needsFull }.
 */
function since(page, version) {
  const entry = _slot().pages.get(String(page || "/"));
  const cur = entry ? entry.version : 0;
  const v = Number(version);
  if (!entry || !Number.isFinite(v) || v > cur) {
    return { current: false, missed: [], from: cur, needsFull: true };
  }
  if (v === cur) return { current: true, missed: [], from: cur, needsFull: false };
  // Stale: recoverable only if every missing version is still in history.
  const missing = [];
  for (let i = v + 1; i <= cur; i++) missing.push(i);
  const inHistory = entry.history.some((h) => h.version === v);
  return {
    current: false,
    missed: missing,
    from: cur,
    needsFull: !inHistory && missing.length > 0,
  };
}

/** Drop one page entirely (unlink/dead pages only — invalidation uses
 * markStale so the diff source survives). Or everything only when asked. */
function drop(page) {
  const s = _slot();
  if (page == null) { s.pages.clear(); return true; }
  return s.pages.delete(String(page));
}

function stats() {
  const s = _slot();
  let versions = 0;
  let bytes = 0;
  for (const entry of s.pages.values()) {
    versions += 1 + entry.history.length;
    bytes += entry.snapshot.bytes || 0;
  }
  return { pages: s.pages.size, versions, bytes, historyCap: HISTORY_CAP };
}

module.exports = { commit, latest, get, since, markStale, isStale, drop, stats, HISTORY_CAP };
