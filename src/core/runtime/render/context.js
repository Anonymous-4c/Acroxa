// src/core/runtime/render/context.js
// AcroxaJS render context (Phase 1 — framework foundation).
// Threaded via AsyncLocalStorage so synchronous string rendering (el()) and
// awaited renders inside it share one context. Existing el()/div() signatures
// are unchanged; when a context is active, el() additionally records nodes
// and views/services can record dependencies.
//
// Dep flush policy: accumulated deps are declared into graph.js ONLY on
// successful render (overwrite semantics — the last successful render's
// deps win). A failed render keeps the previous successful deps so
// invalidation never loses coverage mid-recovery.
//
// Bounds: nodeCap/depCap drop silently when exceeded (lean, never throws).
// Server-only data (request, source paths) stays server-side — recordNode
// stores scalar metadata only; nothing here is ever serialized to visitors.

"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

const NODE_CAP = 5000;
const DEP_CAP = 500;

class RenderContext {
  constructor(opts = {}) {
    this.id = opts.id || `rc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.route = typeof opts.route === "string" ? opts.route : null;
    this.env = opts.env === "production" ? "production" : "development";
    this.pageId = typeof opts.pageId === "string" ? opts.pageId : null;
    this.ownerId = typeof opts.ownerId === "string" ? opts.ownerId : null;
    this.component = typeof opts.component === "string" ? opts.component : null;
    this.cachePolicy = opts.cachePolicy && typeof opts.cachePolicy === "object" ? opts.cachePolicy : null;
    this.deps = new Set();
    this.nodes = [];
    this.startedAt = Date.now();
    this.dropped = 0;
  }

  /** Record a scalar-safe node (from el()/h() when a context is active). */
  recordNode(node) {
    if (this.nodes.length >= NODE_CAP) { this.dropped++; return null; }
    const clean = {
      tag: typeof node.tag === "string" ? node.tag : null,
      key: node.key == null ? null : String(node.key),
      id: node.id == null ? null : String(node.id),
      attrs: null,
      owner: node.owner == null ? null : String(node.owner),
      component: node.component == null ? null : String(node.component),
      html: typeof node.html === "string" ? node.html : null,
      children: [],
    };
    if (node.attrs && typeof node.attrs === "object") {
      const attrs = {};
      for (const [k, v] of Object.entries(node.attrs)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          attrs[k] = v;
        }
      }
      clean.attrs = attrs;
    }
    this.nodes.push(clean);
    return clean;
  }

  /** Record a data/service dependency for this render (dedup, capped). */
  depend(dep) {
    const d = String(dep || "").trim();
    if (!d) return false;
    if (this.deps.size >= DEP_CAP) { this.dropped++; return false; }
    this.deps.add(d);
    return true;
  }

  /** Context metadata for diagnostics (plain JSON, transport-safe). */
  meta() {
    return {
      id: this.id,
      route: this.route,
      env: this.env,
      pageId: this.pageId,
      ownerId: this.ownerId,
      component: this.component,
      nodes: this.nodes.length,
      deps: [...this.deps],
      dropped: this.dropped,
      ms: Date.now() - this.startedAt,
    };
  }
}

const storage = new AsyncLocalStorage();

/**
 * Run `fn` inside a new render context. Returns fn's return value.
 * Deps flush to graph.js on success only (see header). Never throws from
 * context machinery itself — render errors propagate untouched.
 */
function withRenderContext(opts, fn) {
  const ctx = new RenderContext(opts || {});
  return storage.run(ctx, () => {
    let result;
    let ok = true;
    try {
      result = fn(ctx);
      if (result && typeof result.then === "function") {
        return result.then(
          (v) => { _flush(ctx, true); return v; },
          (err) => { _flush(ctx, false); throw err; }
        );
      }
    } catch (err) {
      ok = false;
      _flush(ctx, false);
      throw err;
    }
    if (ok) _flush(ctx, true);
    return result;
  });
}

function _flush(ctx, ok) {
  if (!ok) return;
  if (!ctx.pageId || !ctx.deps.size) return;
  try {
    const graph = require("../graph");
    graph.depend(ctx.pageId, [...ctx.deps]);
  } catch (_) {}
}

/** Current active context or null (never throws). */
function current() {
  return storage.getStore() || null;
}

/** Record a dep into the current context if one is active. */
function depend(dep) {
  const ctx = current();
  if (!ctx) return false;
  try { return ctx.depend(dep); } catch (_) { return false; }
}

/** Record a node into the current context if one is active. */
function record(node) {
  const ctx = current();
  if (!ctx) return null;
  try { return ctx.recordNode(node); } catch (_) { return null; }
}

module.exports = { withRenderContext, current, depend, record, RenderContext, NODE_CAP, DEP_CAP };
