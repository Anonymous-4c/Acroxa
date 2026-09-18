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
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
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
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
  }
}

/**
 * GET /acr/api/runtime/sync?since=rev — public minimal resync.
 * Returns current rev + recent invalidation history so a reconnected
 * client can reconcile instead of blindly trusting stale state.
 */
function sync(req, res) {
  const dbg = (() => { try { return require("../core/runtime/debug"); } catch (_) { return null; } })();
  try {
    const revision = require("../core/runtime/revision");
    const since = parseInt(req.query.since, 10);
    const snap = revision.snapshot();
    // History lives in the global slot; expose slice after `since`.
    const slot = global.__acroxa_runtime_rev__ || { history: [] };
    const history = Array.isArray(slot.history) ? slot.history : [];
    const missed = Number.isFinite(since) ? history.filter((h) => h.rev > since).slice(-50) : history.slice(-20);
    if (dbg) dbg.log("sync", `since=${Number.isFinite(since) ? since : "n/a"} rev=${snap.rev} missed=${missed.length} needsFull=${Number.isFinite(since) && missed.length >= 50}`);
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
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
  }
}

/**
 * POST /acr/api/runtime/fragment — targeted render (no full page).
 * Public for pure widget echo ({ type: widget-node|widget-doc, node|doc });
 * template rendering (needs server data) requires verifyAPIToken at route level.
 * Body is validated; never executes client-supplied functions.
 */
function fragment(req, res) {
  const t0 = Date.now();
  const dbg = (() => { try { return require("../core/runtime/debug"); } catch (_) { return null; } })();
  try {
    const body = req.body || {};
    const type = String(body.type || "");
    const revision = require("../core/runtime/revision");
    const fail = (code, message) => {
      if (dbg) dbg.log("fragment", `${type || "?"} -> ${code} ${message} (${Date.now() - t0}ms)`);
      return res.status(code).json({ success: false, message });
    };
    if (dbg) dbg.log("fragment", `request type=${type || "n/a"} target=${body.target || "n/a"}`);
    const done = (label) => { if (dbg) dbg.log("fragment", `${type} ok ${label} rev=${revision.get()} (${Date.now() - t0}ms)`); };

    if (type === "widget-node") {
      if (!body.node || typeof body.node !== "object") return fail(400, "node object required");
      let rawLen = 0;
      try { rawLen = JSON.stringify(body.node).length; } catch (_) { return fail(400, "node object required"); }
      if (rawLen > 200_000) return fail(413, "node payload too large");
      const t = String(body.node.type || "");
      if (!/^[a-z0-9-]{1,64}$/i.test(t) || t.length > 64) return fail(400, "invalid node.type");
      const { renderNode } = require("../layouts/framework/widgetRenderer");
      const html = _timed("fragment:widget-node", () => renderNode(body.node, { runtime: true }));
      done(`bytes=${Buffer.byteLength(html, "utf8")}`);
      return res.json({ success: true, html, rev: revision.get(), strategy: "fragment-replace" });
    }
    if (type === "widget-doc") {
      if (!body.doc || typeof body.doc !== "object") return fail(400, "doc object required");
      let docLen = 0;
      try { docLen = JSON.stringify(body.doc).length; } catch (_) { return fail(400, "doc object required"); }
      if (docLen > 200_000) return fail(413, "doc payload too large");
      const { renderDocument, responsiveCSSForDocument } = require("../layouts/framework/widgetRenderer");
      const html = _timed("fragment:widget-doc", () => renderDocument(body.doc, { runtime: true }));
      const css = responsiveCSSForDocument(body.doc);
      done(`bytes=${Buffer.byteLength(html, "utf8")}`);
      return res.json({ success: true, html, css, rev: revision.get(), strategy: "fragment-replace" });
    }
    if (type === "template") {
      const key = String(body.template || "");
      if (!/^[a-z0-9_-]{1,64}$/i.test(key) || key.length > 64) return fail(400, "invalid template");
      const engine = require("../core/publicAPI").getLiveEngine?.() || global.currentLayoutEngine;
      if (!engine || typeof engine.render !== "function") return fail(503, "no live engine");
      const params = body.params && typeof body.params === "object" ? body.params : {};
      // Only scalar params cross the boundary (no functions/closures).
      const safe = {};
      for (const [k, v] of Object.entries(params).slice(0, 30)) {
        if (typeof k !== "string" || k.length === 0 || k.length > 64) continue;
        if (!/^[a-zA-Z0-9_]+$/.test(k)) continue;
        if (typeof v === "string") safe[k] = v.slice(0, 5000);
        else if (typeof v === "number" && Number.isFinite(v)) safe[k] = v;
        else if (typeof v === "boolean") safe[k] = v;
      }
      const html = _timed("fragment:template", () => engine.render(key, safe));
      done(`template=${key} bytes=${Buffer.byteLength(html, "utf8")}`);
      return res.json({ success: true, html, rev: revision.get(), strategy: "fragment-replace" });
    }
    if (type === "target") {
      const target = String(body.target || "");
      let validTarget = false;
      try { validTarget = require("../core/runtime/identity").isValidTargetId(target); }
      catch (_) { validTarget = /^[a-z0-9_-]+:[a-z0-9_-]+:[a-zA-Z0-9_.-]+$/.test(target); }
      if (!validTarget || target.length < 5 || target.length > 192) return fail(400, "invalid target");
      const cache = require("../core/runtime/cache").getCache("fragments", { ttlMs: 30_000 });
      const rev = revision.get();
      const key = `target:${target}@${rev}`;
      const hit = cache.get(key);
      if (hit) {
        done(`target=${target} cached bytes=${Buffer.byteLength(hit.html, "utf8")}`);
        return res.json({ success: true, html: hit.html, target, selector: _selectorFor(target), assets: _entryAssets(require("../core/runtime/targets").get(target)), strategy: "rerender", rev, cached: true });
      }
      const entry = require("../core/runtime/targets").get(target);
      if (!entry || !entry.node) return fail(404, "unknown target (page may need reload)");
      const { renderNode } = require("../layouts/framework/widgetRenderer");
      const html = _timed("fragment:target", () => renderNode(entry.node, { runtime: true }));
      cache.set(key, { html }, [target, "widget:*"]);
      done(`target=${target} bytes=${Buffer.byteLength(html, "utf8")}`);
      return res.json({ success: true, html, target, selector: _selectorFor(target), assets: _entryAssets(entry), strategy: "rerender", rev });
    }
    return fail(400, "unknown fragment type (widget-node|widget-doc|template|target)");
  } catch (err) {
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
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
    let extensions = { total: 0, enabled: 0, conflicts: 0 };
    try { extensions = require("../core/runtime/extensions").stats(); } catch (_) {}
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      success: true,
      runtime: "acroxajs/2",
      rev: snap.rev,
      bootId: snap.bootId,
      generation: snap.rev,
      at: Date.now(),
      transports: [{ name: "sse", url: "/acr/api/runtime/sse" }, { name: "poll", url: "/acr/api/runtime/sync" }],
      endpoints: {
        rc: "/acr/api/runtime/rc",
        rr: "/acr/api/runtime/rr",
        rt: "/acr/api/runtime/rt",
      },
      capabilities: {
        fragmentTypes: ["widget-node", "widget-doc", "template", "target"],
        strategies,
        ops: ["patch", "replace", "insert", "remove", "module-update", "module-reload", "hydrate", "style-update", "controlled-refresh", "full-refresh", "rollback", "error"],
      },
      hooks,
      registry,
      graph,
      targets,
      extensions,
      perf: perfStats,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
  }
}

module.exports = { getSnapshot, ping, sync, fragment, manifest, target, targetDeps, targetPlan, rc, rr, rt };

/* ── Targeted-update helpers (4-API setup) ───────────────────────────────
   API 1 (target-plan): decide rerender vs eject+inject.
   API 2 (target):      resolve + return the targeted element's fresh HTML.
   API 3 (target-deps): dependencies + required JS/CSS for a target.
   API 4 is the fragment endpoint above (now with selector/assets) plus the
   AcroxaTargeted client that injects/reinjects files and patches the DOM. */

function _validTarget(target) {
  try { if (require("../core/runtime/identity").isValidTargetId(target)) return true; }
  catch (_) {}
  if (typeof target !== "string") return false;
  if (/^[a-z0-9_-]+:[a-z0-9_-]+:[a-zA-Z0-9_.-]+$/.test(target)) return true;
  // Page targets (page:/acrx/posts, incl. :param dynamic routes) are the
  // established invalidation convention — routable even though they are not
  // registry element ids.
  if (target.indexOf("page:") === 0 && target.length > 5 && target.length <= 192) return true;
  return false;
}

function _normFile(f) {
  return String(f || "").replace(/\\/g, "/");
}

function _selectorFor(target) {
  return `[data-acrx-id="${String(target).replace(/"/g, "")}"]`;
}

function _entryAssets(entry) {
  const out = { js: [], css: [] };
  try {
    if (entry && entry.assets && typeof entry.assets === "object") {
      for (const k of ["js", "css"]) {
        if (Array.isArray(entry.assets[k])) {
          out[k] = entry.assets[k].filter((u) => typeof u === "string").slice(0, 20);
        }
      }
    }
  } catch (_) {}
  return out;
}

// Map a changed source file to its servable public URL (for eject+inject).
// Only files under a static mount qualify; anything else returns null and
// the planner falls back to a DOM-only strategy.
function _fileToAssetUrl(file) {
  const norm = _normFile(file);
  const lower = norm.toLowerCase();
  let idx = norm.indexOf("acrx/assets/");
  if (idx !== -1) return "/acrx/" + norm.slice(idx + "acrx/".length);
  idx = lower.indexOf("public/assets/");
  if (idx !== -1) return "/assets/" + norm.slice(idx + "public/assets/".length);
  return null;
}

function _classifyFile(file) {
  try { return require("../core/runtime/pipeline").classify(file); }
  catch (_) {
    const lower = _normFile(file).toLowerCase();
    if (lower.endsWith(".css")) return { kind: "css", scope: "stylesheet" };
    if (lower.endsWith(".js") && (lower.includes("acrx/assets/js") || lower.includes("public/assets"))) {
      return { kind: "frontend", scope: "component" };
    }
    return { kind: "backend", scope: "module" };
  }
}

function _targetMeta(entry) {
  if (!entry) return null;
  return { type: entry.type || null, owner: entry.owner || null, component: entry.component || null, hydrate: entry.hydrate || null, strategy: entry.strategy || null };
}

/**
 * GET /acr/api/runtime/target?target=<id> — API 2: get the targeted element.
 * Resolves a registered render target to its selector, metadata, required
 * assets, and freshly rendered HTML. Public: render nodes carry no secrets
 * (same trust as the widget fragment endpoints).
 */
function target(req, res) {
  try {
    const targetId = String((req.query && req.query.target) || "");
    const revision = require("../core/runtime/revision");
    if (!_validTarget(targetId) || targetId.length < 5 || targetId.length > 192) {
      return res.status(400).json({ success: false, message: "invalid target" });
    }
    const entry = require("../core/runtime/targets").get(targetId);
    if (!entry || !entry.node) {
      return res.status(404).json({ success: false, message: "unknown target (page may need reload)" });
    }
    const { renderNode } = require("../layouts/framework/widgetRenderer");
    const html = _timed("target:resolve", () => renderNode(entry.node, { runtime: true }));
    return res.json({
      success: true, found: true, target: targetId,
      selector: _selectorFor(targetId), meta: _targetMeta(entry),
      assets: _entryAssets(entry), html, rev: revision.get(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
  }
}

/**
 * GET /acr/api/runtime/target-deps?target=<id> — API 3: dependencies +
 * required JS/CSS files for a target. Combines the dependency-graph edges,
 * the registry entry's own deps, and the entry's declared assets so the
 * client knows exactly which files to eject/inject before re-rendering.
 */
function targetDeps(req, res) {
  try {
    const targetId = String((req.query && req.query.target) || "");
    const revision = require("../core/runtime/revision");
    if (!_validTarget(targetId) || targetId.length < 5 || targetId.length > 192) {
      return res.status(400).json({ success: false, message: "invalid target" });
    }
    const entry = require("../core/runtime/targets").get(targetId);
    let deps = [];
    let dependents = [];
    try {
      const graph = require("../core/runtime/graph");
      deps = graph.dependenciesOf(targetId).slice(0, 100);
      dependents = graph.affectedBy(targetId, { max: 100 });
    } catch (_) {}
    let entryDeps = [];
    try {
      if (entry) {
        const reg = require("../core/runtime/registry").get(entry.component ? `widget:core:${entry.component}` : "");
        if (reg && Array.isArray(reg.deps)) entryDeps = reg.deps.slice(0, 50);
      }
    } catch (_) {}
    if (!entry && !deps.length && !dependents.length) {
      return res.status(404).json({ success: false, message: "unknown target (page may need reload)" });
    }
    // Required files: declared assets first, then any servable files found
    // among the graph edges (deduped, bounded).
    const js = [..._entryAssets(entry).js];
    const css = [..._entryAssets(entry).css];
    for (const d of [...deps, ...entryDeps]) {
      const url = _fileToAssetUrl(d);
      if (!url) continue;
      const lower = url.toLowerCase();
      if (lower.endsWith(".js") && !js.includes(url)) js.push(url);
      else if (lower.endsWith(".css") && !css.includes(url)) css.push(url);
      if (js.length + css.length >= 40) break;
    }
    return res.json({
      success: true, found: !!entry, target: targetId, meta: _targetMeta(entry),
      deps, dependents, entryDeps, js: js.slice(0, 20), css: css.slice(0, 20),
      rev: revision.get(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
  }
}

/**
 * POST /acr/api/runtime/target-plan — API 1: rerender or eject+inject?
 * Body: { target?, changedFile?, kind?, scope? } (all optional, at least one
 * of target/changedFile required). Returns the smallest safe strategy:
 *   eject-inject       — a servable frontend JS file changed: eject the stale
 *                        <script> and inject a cache-busted copy, then rehydrate.
 *   stylesheet-refresh — a CSS file changed: bump stylesheet hrefs, no DOM churn.
 *   rerender           — a registered target changed: patch that element only.
 *   fragment-replace   — page-level change: swap the content region.
 *   full-reload        — process-level change (client marks stale, never reloads).
 *   noop               — nothing to do.
 * Public and read-only: decision + asset URLs only, never file contents.
 */
function targetPlan(req, res) {
  try {
    const body = req.body || {};
    const targetId = typeof body.target === "string" ? body.target : null;
    const changedFile = typeof body.changedFile === "string" ? body.changedFile
      : (typeof body.file === "string" ? body.file : null);
    const revision = require("../core/runtime/revision");
    const rev = revision.get();
    const fail = (code, message) => res.status(code).json({ success: false, message });

    if ((!targetId || !targetId.length) && (!changedFile || !changedFile.length)) {
      return fail(400, "target or changedFile required");
    }
    if (targetId && (!_validTarget(targetId) || targetId.length > 192)) return fail(400, "invalid target");
    if (changedFile && changedFile.length > 1024) return fail(400, "changedFile too long");

    // 1) A concrete changed file decides first — it pinpoints the layer.
    if (changedFile) {
      const c = _classifyFile(changedFile);
      const url = _fileToAssetUrl(changedFile);
      if (c.kind === "css") {
        return res.json({
          success: true, strategy: "stylesheet-refresh",
          reason: `stylesheet changed (${_normFile(changedFile).split("/").pop()}): bump link href, no DOM churn`,
          target: targetId, changedFile: _normFile(changedFile),
          assets: { js: [], css: url ? [url] : [] }, selector: targetId ? _selectorFor(targetId) : null, rev,
        });
      }
      if (c.kind === "frontend") {
        if (url) {
          return res.json({
            success: true, strategy: "eject-inject",
            reason: `frontend module changed (${url}): eject stale <script>, inject cache-busted copy, rehydrate`,
            target: targetId, changedFile: _normFile(changedFile),
            assets: { js: [url], css: [] }, selector: targetId ? _selectorFor(targetId) : null, rev,
          });
        }
        return res.json({
          success: true, strategy: "fragment-replace",
          reason: "frontend file changed but is not servable as a URL — fall back to content swap",
          target: targetId, changedFile: _normFile(changedFile),
          assets: { js: [], css: [] }, selector: targetId ? _selectorFor(targetId) : null, rev,
        });
      }
      if (c.kind === "config") {
        return res.json({
          success: true, strategy: "full-reload",
          reason: "process-level dependency changed — client must mark stale (never auto-reload)",
          target: targetId, changedFile: _normFile(changedFile),
          assets: { js: [], css: [] }, selector: null, rev,
        });
      }
      // view/layout/route/api/backend with an explicit target: patch the element.
      if (targetId) {
        const entry = require("../core/runtime/targets").get(targetId);
        if (entry && entry.node) {
          return res.json({
            success: true, strategy: "rerender",
            reason: `registered target ${targetId}: patch that element only`,
            target: targetId, changedFile: _normFile(changedFile),
            assets: _entryAssets(entry), selector: _selectorFor(targetId), rev,
          });
        }
      }
      try {
        const plan = require("../core/runtime/planner").choose({ kind: c.kind, scope: c.scope || body.scope || "generic" });
        return res.json({
          success: true, strategy: plan.strategy === "module-reload" ? "fragment-replace" : plan.strategy,
          reason: plan.reason, target: targetId, changedFile: _normFile(changedFile),
          assets: { js: [], css: [] }, selector: targetId ? _selectorFor(targetId) : null, rev,
        });
      } catch (_) {}
    }

    // 2) Target only: registered element -> rerender; page:* -> content swap.
    if (targetId) {
      if (targetId.indexOf("page:") === 0) {
        return res.json({
          success: true, strategy: "fragment-replace",
          reason: `page target ${targetId}: swap the content region`,
          target: targetId, assets: { js: [], css: [] }, selector: null, rev,
        });
      }
      const entry = require("../core/runtime/targets").get(targetId);
      if (entry && entry.node) {
        return res.json({
          success: true, strategy: "rerender",
          reason: `registered target ${targetId}: patch that element only`,
          target: targetId, assets: _entryAssets(entry), selector: _selectorFor(targetId), rev,
        });
      }
      return res.status(404).json({ success: false, message: "unknown target (page may need reload)" });
    }

    return fail(400, "target or changedFile required");
  } catch (err) {
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
  }
}

/* ── AcroxaJS v2: RC / RR / RT (documented aliases over proven logic) ────
   RC (runtime check): deterministic WHAT changed → WHY this action.
   RR (runtime renderer): verified envelope for one boundary.
   RT (runtime trigger): validates an execution op (server never touches DOM;
   the browser applies after its own transaction.decide gate). */

function _rcWhy({ classification, owner, affected, plan, critical }) {
  const why = [];
  if (classification) {
    why.push(`classified as ${classification.kind}/${classification.scope}` +
      (owner ? ` (owner ${owner})` : ""));
  }
  if (plan && plan.reason) why.push(plan.reason);
  if (Array.isArray(affected) && affected.length) {
    why.push(`${affected.length} dependent(s) affected` +
      (affected[0] ? `: ${affected.slice(0, 3).join(", ")}${affected.length > 3 ? "…" : ""}` : ""));
  } else {
    why.push("no dependents in graph — change is isolated");
  }
  if (critical) why.push("critical runtime boundary — targeted update prohibited, escalated to FULL_REFRESH");
  return why;
}

/**
 * POST /acr/api/runtime/rc — Runtime Check.
 * Body { target?, changedFile?, kind?, scope? }.
 * Deterministic + explains WHY. Public read-only (decision only).
 */
function rc(req, res) {
  const t0 = Date.now();
  const dbg = (() => { try { return require("../core/runtime/debug"); } catch (_) { return null; } })();
  try {
    const rcContracts = require("../AcroxaJS/contracts/runtime-contracts");
    const body = req.body || {};
    if (dbg) dbg.log("rc", `request target=${body.target || "n/a"} file=${body.changedFile || body.file || "n/a"}`);
    const v = rcContracts.validateRcRequest(body);
    if (!v.ok) {
      if (dbg) dbg.log("rc", `reject 400: ${v.errors.join("; ")}`);
      return res.status(400).json({ success: false, message: v.errors.join("; ") });
    }
    const targetId = typeof body.target === "string" ? body.target : null;
    const changedFile = typeof body.changedFile === "string" ? body.changedFile
      : (typeof body.file === "string" ? body.file : null);
    const revision = require("../core/runtime/revision");
    const rev = revision.get();
    const bootId = revision.bootId();

    let classification = null;
    let owner = null;
    if (changedFile) {
      classification = _classifyFile(changedFile);
      try { owner = require("../core/runtime/owners").ownerOf(changedFile); } catch (_) { owner = "core"; }
    } else if (targetId) {
      const entry = require("../core/runtime/targets").get(targetId);
      classification = { kind: entry ? entry.type : "view", scope: entry ? entry.type : "view" };
      owner = (entry && entry.owner) || "core";
    }
    let affected = [];
    try {
      const graph = require("../core/runtime/graph");
      const roots = [];
      if (changedFile) roots.push(_normFile(changedFile));
      if (targetId) roots.push(targetId);
      const seen = new Set();
      for (const r of roots) {
        for (const a of graph.affectedBy(r, { max: 100 })) {
          if (!seen.has(a)) { seen.add(a); affected.push(a); }
        }
      }
      affected = affected.slice(0, 100);
    } catch (_) { affected = []; }

    let plan = { strategy: "fragment-replace", reason: "default: no narrower safe scope proven" };
    try {
      const planner = require("../core/runtime/planner");
      if (classification) {
        plan = planner.choose({ kind: classification.kind, scope: classification.scope || body.scope || "generic", resource: changedFile || targetId, owner });
      }
    } catch (_) {}

    // Mirror target-plan's asset-aware strategies (eject-inject / stylesheet-refresh)
    // so rc and target-plan never disagree on frontend/css changes.
    let strategy = plan.strategy;
    if (changedFile) {
      const url = _fileToAssetUrl(changedFile);
      if (classification && classification.kind === "css") strategy = "stylesheet-refresh";
      else if (classification && classification.kind === "frontend" && url) strategy = "eject-inject";
      else if (classification && classification.kind === "config") strategy = "full-reload";
    }
    const critical = !!(targetId && require("../AcroxaJS/contracts/runtime-contracts").isCriticalBoundary(targetId));
    const action = rcContracts.strategyToAction(strategy, { critical });
    const why = _rcWhy({ classification, owner, affected, plan: { ...plan, strategy }, critical });
    const needsHydration = ["rehydrate", "subtree-reconcile", "eject-inject", "rerender"].includes(strategy);
    const needsModuleReload = ["module-reload", "eject-inject"].includes(strategy);
    const response = {
      success: true, version: rcContracts.RC_VERSION,
      action, strategy, affected, why,
      target: targetId, changedFile: changedFile ? _normFile(changedFile) : null,
      needsHydration, needsModuleReload,
      generation: rev, rev, bootId, at: Date.now(),
    };
    const check = rcContracts.validateRcResponse(response);
    if (!check.ok) return res.status(500).json({ success: false, message: check.errors.join("; ") });
    if (dbg) dbg.log("rc", `verdict ${action} strategy=${strategy} affected=${affected.length} rev=${rev} (${Date.now() - t0}ms)`);
    return res.json(response);
  } catch (err) {
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
  }
}

/**
 * POST /acr/api/runtime/rr — Runtime Renderer.
 * Body { target } or { type: widget-node|widget-doc, node|doc } or
 * { type: template, template, params } (template requires auth at route).
 * Returns a verified envelope { boundary, html, rev, bootId, generation,
 * verify{hash,bytes}, assets, hydrate, strategy }.
 */
function rr(req, res) {
  const t0 = Date.now();
  const dbg = (() => { try { return require("../core/runtime/debug"); } catch (_) { return null; } })();
  try {
    const rcContracts = require("../AcroxaJS/contracts/runtime-contracts");
    const verify = require("../AcroxaJS/server/verify");
    const v = rcContracts.validateRrRequest(req.body || {});
    if (!v.ok) {
      if (dbg) dbg.log("rr", `reject 400: ${v.errors.join("; ")}`);
      return res.status(400).json({ success: false, message: v.errors.join("; ") });
    }
    if (dbg) dbg.log("rr", `render target=${(req.body && (req.body.target || req.body.boundary)) || "n/a"} type=${(req.body && req.body.type) || "n/a"}`);
    const body = req.body || {};
    const revision = require("../core/runtime/revision");
    const rev = revision.get();
    const bootId = revision.bootId();
    const fail = (code, message) => res.status(code).json({ success: false, message });

    const envelope = (boundary, html, extra = {}) => {
      const env = verify.verifyEnvelope({ boundary, html, rev, bootId, generation: rev });
      const out = {
        success: true, version: rcContracts.RR_VERSION,
        boundary: env.boundary, html: env.html,
        rev: env.rev, bootId: env.bootId, generation: env.generation,
        verify: env.verify, at: env.at,
        assets: extra.assets || { js: [], css: [] },
        hydrate: extra.hydrate || null,
        strategy: extra.strategy || "rerender",
        selector: boundary ? _selectorFor(boundary) : null,
      };
      const check = rcContracts.validateRrResponse(out);
      if (!check.ok) return fail(500, check.errors.join("; "));
      if (dbg) dbg.log("rr", `envelope boundary=${boundary || "echo"} bytes=${env.verify.bytes} hash=${env.verify.hash} (${Date.now() - t0}ms)`);
      return res.json(out);
    };

    // Target render (primary path): registered boundary/widget re-render.
    const targetId = typeof body.target === "string" ? body.target
      : (typeof body.boundary === "string" ? body.boundary : null);
    if (targetId) {
      if (!_validTarget(targetId)) return fail(400, "invalid target");
      const entry = require("../core/runtime/targets").get(targetId);
      if (!entry || !entry.node) return fail(404, "unknown target (page may need reload)");
      const { renderNode } = require("../layouts/framework/widgetRenderer");
      const html = renderNode(entry.node, { runtime: true });
      return envelope(targetId, html, {
        assets: _entryAssets(entry), hydrate: entry.hydrate || null, strategy: "rerender",
      });
    }
    // Echo renders (same trust as fragment endpoint).
    const type = String(body.type || "");
    if (type === "widget-node") {
      if (!body.node || typeof body.node !== "object") return fail(400, "node object required");
      const { renderNode } = require("../layouts/framework/widgetRenderer");
      const html = renderNode(body.node, { runtime: true });
      return envelope(null, html, { strategy: "fragment-replace" });
    }
    if (type === "widget-doc") {
      if (!body.doc || typeof body.doc !== "object") return fail(400, "doc object required");
      const { renderDocument } = require("../layouts/framework/widgetRenderer");
      const html = renderDocument(body.doc, { runtime: true });
      return envelope(null, html, { strategy: "fragment-replace" });
    }
    if (type === "template") {
      const key = String(body.template || "");
      if (!/^[a-z0-9_-]{1,64}$/i.test(key)) return fail(400, "invalid template");
      const engine = require("../core/publicAPI").getLiveEngine?.() || global.currentLayoutEngine;
      if (!engine || typeof engine.render !== "function") return fail(503, "no live engine");
      const html = engine.render(key, {});
      return envelope(null, html, { strategy: "fragment-replace" });
    }
    return fail(400, "target or type required");
  } catch (err) {
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
  }
}

/**
 * POST /acr/api/runtime/rt — Runtime Trigger (validation/control layer).
 * Body { op, target?, generation? }. Server validates; browser applies.
 * Stale generations (op.generation < committed target generation) are
 * rejected with 409 — the client must drop them, never apply.
 * Public read-only: returns the execution verdict, mutates nothing.
 */
function rt(req, res) {
  const t0 = Date.now();
  const dbg = (() => { try { return require("../core/runtime/debug"); } catch (_) { return null; } })();
  try {
    const rcContracts = require("../AcroxaJS/contracts/runtime-contracts");
    const body = req.body || {};
    if (dbg) dbg.log("rt", `request op=${body.op || "n/a"} target=${body.target || "n/a"} generation=${body.generation !== undefined ? body.generation : "n/a"}`);
    const v = rcContracts.validateRtRequest(body);
    if (!v.ok) {
      if (dbg) dbg.log("rt", `reject 400: ${v.errors.join("; ")}`);
      return res.status(400).json({ success: false, message: v.errors.join("; ") });
    }
    const op = String(body.op).toLowerCase();
    const targetId = typeof body.target === "string" ? body.target : null;
    const generation = Number.isInteger(body.generation) ? body.generation : null;
    const revision = require("../core/runtime/revision");
    const rev = revision.get();
    const bootId = revision.bootId();

    if (targetId && !_validTarget(targetId)) {
      return res.status(400).json({ success: false, message: "invalid target" });
    }
    // Ops that require an existing target must name a registered one.
    if (["patch", "replace", "hydrate", "remove"].includes(op)) {
      if (!targetId) return res.status(400).json({ success: false, message: `op ${op} requires target` });
      const entry = require("../core/runtime/targets").get(targetId);
      if (!entry) return res.status(404).json({ success: false, message: "unknown target (page may need reload)" });
      if (generation !== null && Number.isInteger(entry.generation) && generation < entry.generation) {
        if (dbg) dbg.log("rt", `reject 409 stale: got=${generation} committed=${entry.generation} (${Date.now() - t0}ms)`);
        return res.status(409).json({
          success: false, message: `stale generation ${generation} < committed ${entry.generation} — drop, never apply`,
          stale: true, committed: entry.generation, generation, rev, bootId,
        });
      }
    }
    // Critical boundaries escalate to controlled full refresh.
    if (targetId && rcContracts.isCriticalBoundary(targetId) && !["full-refresh", "controlled-refresh", "error"].includes(op)) {
      if (dbg) dbg.log("rt", `escalate ${op} -> full-refresh (critical ${targetId}) (${Date.now() - t0}ms)`);
      return res.json({
        success: true, version: rcContracts.RT_VERSION,
        op: "full-refresh", target: targetId, generation: generation !== null ? generation : rev,
        rev, bootId, applied: false,
        reason: "critical runtime boundary — targeted update prohibited, escalated to FULL_REFRESH",
        escalation: true, at: Date.now(),
      });
    }
    const needsTarget = !!targetId;
    if (dbg) dbg.log("rt", `verdict ${op}${targetId ? ` ${targetId}` : ""} validated (${Date.now() - t0}ms)`);
    return res.json({
      success: true, version: rcContracts.RT_VERSION,
      op, target: targetId, generation: generation !== null ? generation : rev,
      rev, bootId, applied: false,
      selector: needsTarget ? _selectorFor(targetId) : null,
      reason: `validated ${op}${targetId ? ` for ${targetId}` : ""} — browser must gate via transaction.decide before applying`,
      at: Date.now(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "internal error" : err.message });
  }
}



