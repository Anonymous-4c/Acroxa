// src/controllers/runtimeController.js
// Real runtime diagnostics (spec §36, §50). Every field reflects live state —
// no fake counters, no mocked registries. Admin-only; mounted at
// GET /acr/api/system/runtime via settingsRoutes.

"use strict";

const perf = (() => { try { return require("../core/runtime/perf"); } catch (_) { return null; } })();
function _timed(stage, fn) {
  if (perf && typeof perf.measure === "function") return perf.measure(stage, fn);
  return fn();
}

function getSnapshot(req, res) {
  try {
    const shell = require("../core/runtime/shell");
    const apiRegistry = require("../core/runtime/apiRegistry");
    const hookBus = require("../core/runtime/hookBus");
    const runtimeCache = require("../core/runtime/cache");

    const base = typeof shell.snapshot === "function" ? shell.snapshot() : {};

    return res.json({
      success: true,
      bootedAt: base.bootedAt || null,
      uptimeMs: base.uptimeMs || 0,
      revision: base.revision || null,
      registry: base.registry || null,
      events: base.events || null,
      layout: base.layout || null,
      sse: base.sse || null,
      graph: base.graph || null,
      targets: base.targets || null,
      logs: base.logs || null,
      apis: apiRegistry.stats(),
      hooks: hookBus.stats(),
      caches: runtimeCache.stats(),
      perf: perf && typeof perf.stats === "function" ? perf.stats() : { stages: {} },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /acr/api/runtime/ping — public, minimal, cache-free.
 * Lets the client determine "am I synchronized?" without auth.
 */
function ping(req, res) {
  try {
    const revision = require("../core/runtime/revision");
    const { getSettingsCached } = require("../middlewares/authMiddleware");
    res.setHeader("Cache-Control", "no-store");
    Promise.resolve()
      .then(() => getSettingsCached().catch(() => null))
      .then((settings) => {
        const maintenance = !!(settings?.system?.maintenanceMode || settings?.maintenance?.enabled);
        return res.json({
          success: true,
          rev: revision.get(),
          bootId: revision.bootId(),
          maintenance,
          at: Date.now(),
        });
      })
      .catch(() => {
        return res.json({ success: true, rev: revision.get(), bootId: revision.bootId(), maintenance: false, at: Date.now() });
      });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /acr/api/runtime/sync?since=rev — public minimal resync.
 * Returns current rev + recent invalidation history so a reconnected
 * client can reconcile instead of blindly trusting stale state.
 */
function sync(req, res) {
  try {
    const revision = require("../core/runtime/revision");
    const since = parseInt(req.query.since, 10);
    const snap = revision.snapshot();
    // History lives in the global slot; expose slice after `since`.
    const slot = global.__acroxa_runtime_rev__ || { history: [] };
    const history = Array.isArray(slot.history) ? slot.history : [];
    const missed = Number.isFinite(since) ? history.filter((h) => h.rev > since).slice(-50) : history.slice(-20);
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      success: true,
      rev: snap.rev,
      bootId: snap.bootId,
      missed,
      needsFull: Number.isFinite(since) && missed.length >= 50,
      at: Date.now(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /acr/api/runtime/fragment — targeted render (no full page).
 * Public for pure widget echo ({ type: widget-node|widget-doc, node|doc });
 * template rendering (needs server data) requires verifyAPIToken at route level.
 * Body is validated; never executes client-supplied functions.
 */
function fragment(req, res) {
  try {
    const body = req.body || {};
    const type = String(body.type || "");
    const revision = require("../core/runtime/revision");
    const fail = (code, message) => res.status(code).json({ success: false, message });

    if (type === "widget-node") {
      if (!body.node || typeof body.node !== "object") return fail(400, "node object required");
      const t = String(body.node.type || "");
      if (!/^[a-z0-9-]+$/i.test(t) || t.length > 64) return fail(400, "invalid node.type");
      const { renderNode } = require("../layouts/framework/widgetRenderer");
      const html = _timed("fragment:widget-node", () => renderNode(body.node, { runtime: true }));
      return res.json({ success: true, html, rev: revision.get(), strategy: "fragment-replace" });
    }
    if (type === "widget-doc") {
      if (!body.doc || typeof body.doc !== "object") return fail(400, "doc object required");
      const { renderDocument, responsiveCSSForDocument } = require("../layouts/framework/widgetRenderer");
      const html = _timed("fragment:widget-doc", () => renderDocument(body.doc, { runtime: true }));
      const css = responsiveCSSForDocument(body.doc);
      return res.json({ success: true, html, css, rev: revision.get(), strategy: "fragment-replace" });
    }
    if (type === "template") {
      const key = String(body.template || "");
      if (!/^[a-z0-9_-]+$/i.test(key) || key.length > 64) return fail(400, "invalid template");
      const engine = require("../core/publicAPI").getLiveEngine?.() || global.currentLayoutEngine;
      if (!engine || typeof engine.render !== "function") return fail(503, "no live engine");
      const params = body.params && typeof body.params === "object" ? body.params : {};
      // Only scalar params cross the boundary (no functions/closures).
      const safe = {};
      for (const [k, v] of Object.entries(params).slice(0, 30)) {
        if (/^[a-zA-Z0-9_]+$/.test(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) safe[k] = v;
      }
      const html = _timed("fragment:template", () => engine.render(key, safe));
      return res.json({ success: true, html, rev: revision.get(), strategy: "fragment-replace" });
    }
    if (type === "target") {
      const target = String(body.target || "");
      if (!/^[a-z0-9_-]+:[a-z0-9_-]+:[a-zA-Z0-9_.-]+$/i.test(target) || target.length > 192) return fail(400, "invalid target");
      const cache = require("../core/runtime/cache").getCache("fragments", { ttlMs: 30_000 });
      const rev = revision.get();
      const key = `target:${target}@${rev}`;
      const hit = cache.get(key);
      if (hit) return res.json({ success: true, html: hit.html, target, rev, strategy: "fragment-replace", cached: true });
      const entry = require("../core/runtime/targets").get(target);
      if (!entry || !entry.node) return fail(404, "unknown target (page may need reload)");
      const { renderNode } = require("../layouts/framework/widgetRenderer");
      const html = _timed("fragment:target", () => renderNode(entry.node, { runtime: true }));
      cache.set(key, { html }, [target, "widget:*"]);
      return res.json({ success: true, html, target, rev, strategy: "fragment-replace" });
    }
    return fail(400, "unknown fragment type (widget-node|widget-doc|template)");
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /acr/api/runtime/manifest — public runtime manifest (spec §30).
 * Minimal, cache-free discovery for initial sync + recovery: revision,
 * transports, capabilities, hook names (no callbacks), and aggregate
 * counts. Never exposes file paths, callbacks, secrets, or user data.
 */
function manifest(req, res) {
  try {
    const revision = require("../core/runtime/revision");
    const snap = revision.snapshot();
    let strategies = [];
    try { strategies = [...require("../core/runtime/planner").STRATEGIES]; } catch (_) {}
    let hooks = [];
    try { hooks = Object.keys(require("../core/runtime/hookBus").list()); } catch (_) {}
    let registry = { total: 0, byType: {} };
    try { registry = require("../core/runtime/registry").stats(); } catch (_) {}
    let graph = { resources: 0, edges: 0 };
    try { graph = require("../core/runtime/graph").stats(); } catch (_) {}
    let targets = { targets: 0 };
    try { targets = require("../core/runtime/targets").stats(); } catch (_) {}
    let perfStats = { stages: {} };
    if (perf && typeof perf.stats === "function") {
      try { perfStats = perf.stats(); } catch (_) {}
    }
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      success: true,
      runtime: "acroxajs/1",
      rev: snap.rev,
      bootId: snap.bootId,
      at: Date.now(),
      transports: [{ name: "sse", url: "/acr/api/runtime/sse" }],
      capabilities: {
        fragmentTypes: ["widget-node", "widget-doc", "template", "target"],
        strategies,
      },
      hooks,
      registry,
      graph,
      targets,
      perf: perfStats,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getSnapshot, ping, sync, fragment, manifest };



