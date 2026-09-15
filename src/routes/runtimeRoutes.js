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

// GET /acr/api/runtime/ping — public heartbeat (rev + maintenance, no-store)
router.get("/runtime/ping", (req, res) => runtime.ping(req, res));

// GET /acr/api/runtime/sync?since=rev — public resync
router.get("/runtime/sync", (req, res) => runtime.sync(req, res));

// GET /acr/api/runtime/manifest — public runtime manifest (rev + capabilities, no-store)
router.get("/runtime/manifest", (req, res) => runtime.manifest(req, res));

// GET /acr/api/runtime/sse — runtime invalidation stream (public read, event names only)
router.get("/runtime/sse", sseHub.sseHandler);

// POST /acr/api/runtime/fragment — widget echo (public, validated); template needs auth
router.post("/runtime/fragment", (req, res, next) => {
  const t = req.body && req.body.type;
  if (t === "template") return verifyAPIToken(req, res, next);
  return next();
}, (req, res) => runtime.fragment(req, res));

// POST /acr/api/runtime/invalidate — admin-only explicit invalidation
router.post("/runtime/invalidate", adminOnly, (req, res) => {
  try {
    const { type = "module", id, scope = "global", reason = "manual", targets = [], strategy = null } = req.body || {};
    if (!id || typeof id !== "string" || id.length > 512) {
      return res.status(400).json({ success: false, message: "id string required" });
    }
    const inv = require("../core/runtime/invalidate").invalidate({ type, id, scope, reason, targets, strategy });
    return res.json({ success: true, invalidation: inv });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /acr/api/runtime/capabilities — admin-only discovery (hooks/routes/registry/graph)
router.get("/runtime/capabilities", adminOnly, (req, res) => {
  try {
    const hookBus = require("../core/runtime/hookBus");
    const apiRegistry = require("../core/runtime/apiRegistry");
    const registry = require("../core/runtime/registry");
    const graph = require("../core/runtime/graph");
    const revision = require("../core/runtime/revision");
    return res.json({
      success: true,
      rev: revision.get(),
      bootId: revision.bootId(),
      hooks: hookBus.list(),
      hookDefinitions: hookBus.describe(),
      apis: apiRegistry.list().slice(0, 200),
      registry: registry.stats(),
      graph: graph.stats(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.PREFIX = "/";
