// src/routes/runtimeRoutes.js
// AcroxaJS runtime transport routes (mounted at / via loadRoutes, absolute paths).
// Public: ping/sync/widget-fragment (safe echo render, validated).
// Privileged: template fragment (needs server data) + invalidate (admin only).

const express = require("express");
const router = express.Router();

const { verifyAPIToken, requireRoles } = require("../middlewares/authMiddleware");
const runtime = require("../controllers/runtimeController");
const sseHub = require("../core/sseHub");

const adminOnly = [verifyAPIToken, requireRoles("admin")];

// Public runtime rate limit: 120 req/min per IP across read endpoints.
// Shared bucket (fail-open on error, never blocks admin invalidation).
const _buckets = new Map();
function publicRateLimit(req, res, next) {
  try {
    const ip = (req.ip || req.headers["x-forwarded-for"] || "anon").toString().slice(0, 64);
    const now = Date.now();
    const windowMs = 60_000;
    const max = 120;
    let bucket = _buckets.get(ip);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      _buckets.set(ip, bucket);
      if (_buckets.size > 2000) {
        const oldest = [..._buckets.keys()].slice(0, 500);
        for (const k of oldest) _buckets.delete(k);
      }
    }
    bucket.count++;
    if (bucket.count > max) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ success: false, message: "rate limited — retry in 60s" });
    }
    return next();
  } catch (_) {
    return next();
  }
}

// GET /acr/api/runtime/ping — public heartbeat (rev + maintenance, no-store)
router.get("/runtime/ping", publicRateLimit, (req, res) => runtime.ping(req, res));

// GET /acr/api/runtime/sync?since=rev — public resync
router.get("/runtime/sync", publicRateLimit, (req, res) => runtime.sync(req, res));

// GET /acr/api/runtime/manifest — public runtime manifest (rev + capabilities, no-store)
router.get("/runtime/manifest", publicRateLimit, (req, res) => runtime.manifest(req, res));

// GET /acr/api/runtime/sse — runtime invalidation stream (public read, event names only)
router.get("/runtime/sse", sseHub.sseHandler);

// GET /acr/api/runtime/target?target=<id> — API 2: get the targeted element
// (selector + metadata + fresh HTML). Public: render nodes carry no secrets.
router.get("/runtime/target", publicRateLimit, (req, res) => runtime.target(req, res));

// GET /acr/api/runtime/target-deps?target=<id> — API 3: dependencies and
// required JS/CSS files for a target (eject/inject list). Public, read-only.
router.get("/runtime/target-deps", publicRateLimit, (req, res) => runtime.targetDeps(req, res));

// POST /acr/api/runtime/target-plan — API 1: rerender or eject+inject?
// Body { target?, changedFile? }. Public, read-only decision + asset URLs.
router.post("/runtime/target-plan", publicRateLimit, (req, res) => runtime.targetPlan(req, res));

// AcroxaJS v2: RC/RR/RT — documented versioned aliases over the same logic.
// RC=check (target-plan core + WHY), RR=render (fragment/target + verify
// envelope), RT=trigger (validates an execution op; browser applies).
// Public read-only like their legacy counterparts; template RR requires
// auth exactly as the fragment endpoint does.
router.post("/runtime/rc", publicRateLimit, (req, res) => runtime.rc(req, res));
router.post("/runtime/rr", publicRateLimit, (req, res, next) => {
  const t = req.body && req.body.type;
  if (t === "template") return verifyAPIToken(req, res, next);
  return next();
}, (req, res) => runtime.rr(req, res));
router.post("/runtime/rt", publicRateLimit, (req, res) => runtime.rt(req, res));

// POST /acr/api/runtime/fragment — widget echo (public, validated); template needs auth
router.post("/runtime/fragment", (req, res, next) => {
  const t = req.body && req.body.type;
  if (t === "template") return verifyAPIToken(req, res, next);
  return next();
}, (req, res) => runtime.fragment(req, res));

// POST /acr/api/runtime/invalidate — admin-only explicit invalidation
// Bounded: allowlisted type/scope/strategy, capped targets + reason length,
// so one call cannot amplify into an SSE fan-out storm (P1).
const INVALIDATE_TYPES = new Set(["module", "view", "page", "layout", "widget", "component", "asset", "stylesheet", "route", "api", "bundle"]);
const INVALIDATE_SCOPES = new Set(["global", "application", "page", "layout", "view", "widget", "component", "element", "asset", "stylesheet", "module"]);
router.post("/runtime/invalidate", adminOnly, (req, res) => {
  try {
    const { type = "module", id, scope = "global", reason = "manual", targets = [], strategy = null } = req.body || {};
    if (!id || typeof id !== "string" || id.length > 512) {
      return res.status(400).json({ success: false, message: "id string required" });
    }
    if (!INVALIDATE_TYPES.has(String(type))) {
      return res.status(400).json({ success: false, message: "invalid type" });
    }
    if (!INVALIDATE_SCOPES.has(String(scope))) {
      return res.status(400).json({ success: false, message: "invalid scope" });
    }
    if (strategy !== null && strategy !== undefined) {
      try {
        const { STRATEGIES } = require("../core/runtime/planner");
        if (!STRATEGIES.has(String(strategy))) {
          return res.status(400).json({ success: false, message: "invalid strategy" });
        }
      } catch (_) {}
    }
    const safeReason = String(reason || "manual").slice(0, 128);
    if (!/^[\w .:()/-]{1,128}$/.test(safeReason)) {
      return res.status(400).json({ success: false, message: "invalid reason" });
    }
    const safeTargets = Array.isArray(targets) ? targets.filter((t) => typeof t === "string" && t.length <= 256).slice(0, 20) : [];
    const inv = require("../core/runtime/invalidate").invalidate({ type: String(type), id, scope: String(scope), reason: safeReason, targets: safeTargets, strategy: strategy || null });
    return res.json({ success: true, invalidation: inv });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /acr/api/runtime/capabilities — admin-only discovery (hooks/routes/registry/graph/extensions)
router.get("/runtime/capabilities", adminOnly, (req, res) => {
  try {
    const hookBus = require("../core/runtime/hookBus");
    const apiRegistry = require("../core/runtime/apiRegistry");
    const registry = require("../core/runtime/registry");
    const graph = require("../core/runtime/graph");
    const revision = require("../core/runtime/revision");
    let extensions = { total: 0, enabled: 0, conflicts: 0 };
    let conflicts = [];
    try { extensions = require("../core/runtime/extensions").stats(); } catch (_) {}
    try { conflicts = require("../core/runtime/extensions").detectConflicts().slice(0, 50); } catch (_) {}
    return res.json({
      success: true,
      rev: revision.get(),
      bootId: revision.bootId(),
      hooks: hookBus.list(),
      hookDefinitions: hookBus.describe(),
      apis: apiRegistry.list().slice(0, 200),
      registry: registry.stats(),
      graph: graph.stats(),
      extensions,
      conflicts,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /acr/api/runtime/snapshot?page= — admin-only render snapshot fetch.
// The resync source (full snapshot incl. tree) + inspector data source.
router.get("/runtime/snapshot", adminOnly, (req, res) => {
  try {
    const snapshots = require("../core/runtime/render/snapshot");
    const page = String(req.query.page || "/");
    const version = req.query.version != null ? parseInt(req.query.version, 10) : undefined;
    const snap = version !== undefined
      ? snapshots.get(page, version)
      : snapshots.latest(page);
    if (!snap) {
      return res.status(404).json({ success: false, message: "no snapshot for page" });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, snapshot: snap, resync: snapshots.since(page, version ?? snap.version) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.PREFIX = "/";
