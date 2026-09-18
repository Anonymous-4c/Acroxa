// src/routes/analyticsRoutes.js
// Visitor analytics: public ingestion + authorized dashboard reads.
// Auto-mounted at "/" by loadRoutes (per-route middleware below, same
// convention as cmsRoutes.js). Public collect/export surface is minimal and
// validated; everything analytical sits behind verifyAPIToken + roles.
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/analyticsController");
const { verifyAPIToken, requireRoles } = require("../middlewares/authMiddleware");

const readerRoles = ["admin", "editor", "author"];

// ── Public ingestion (untrusted input: validated + rate-limited inside) ──
router.post("/analytics/collect", ctrl.collect);
router.get("/analytics/config", ctrl.publicConfig);

// ── Authorized dashboard reads ───────────────────────────────────────────
router.get("/analytics/overview", verifyAPIToken, requireRoles(readerRoles), ctrl.overview);
router.get("/analytics/timeseries", verifyAPIToken, requireRoles(readerRoles), ctrl.timeseries);
router.get("/analytics/pages", verifyAPIToken, requireRoles(readerRoles), ctrl.pages);
router.get("/analytics/sources", verifyAPIToken, requireRoles(readerRoles), ctrl.sources);
router.get("/analytics/devices", verifyAPIToken, requireRoles(readerRoles), ctrl.devices);
router.get("/analytics/insights", verifyAPIToken, requireRoles(readerRoles), ctrl.insights);
router.post("/analytics/insights/:id/dismiss", verifyAPIToken, requireRoles(readerRoles), ctrl.dismissInsight);
router.get("/analytics/anomalies", verifyAPIToken, requireRoles(readerRoles), ctrl.anomalies);
router.get("/analytics/heatmap", verifyAPIToken, requireRoles(readerRoles), ctrl.heatmap);
router.get("/analytics/sessions", verifyAPIToken, requireRoles(readerRoles), ctrl.sessions);
router.get("/analytics/sessions/:id", verifyAPIToken, requireRoles(readerRoles), ctrl.sessionDetail);
router.get("/analytics/visitors", verifyAPIToken, requireRoles(readerRoles), ctrl.visitors);
router.get("/analytics/events", verifyAPIToken, requireRoles(readerRoles), ctrl.eventTypes);
router.get("/analytics/content", verifyAPIToken, requireRoles(readerRoles), ctrl.content);
router.get("/analytics/campaigns", verifyAPIToken, requireRoles(readerRoles), ctrl.campaigns);
router.get("/analytics/realtime", verifyAPIToken, requireRoles(readerRoles), ctrl.realtime);
router.post("/analytics/export", verifyAPIToken, requireRoles(readerRoles), ctrl.exportReport);

module.exports = router;
