// src/routes/landingPageRoutes.js

const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/landingPageController");
const { verifyAPIToken, requireRoles, attachAuthId } = require("../middlewares/authMiddleware");

const PREFIX = "/landing-pages";

const editorUp = [verifyAPIToken, requireRoles(["editor", "admin"])];
const authorUp = [verifyAPIToken, requireRoles(["author", "editor", "admin"])];

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get("/",          attachAuthId, ctrl.getLandingPages);
router.get("/:id",       attachAuthId, ctrl.getLandingPage);
router.post("/",         authorUp,     ctrl.createLandingPage);
router.put("/:id",       authorUp,     ctrl.updateLandingPage);
router.delete("/:id",    editorUp,     ctrl.deleteLandingPage);

// ── PUBLISH / DUPLICATE ───────────────────────────────────────────────────────
router.post("/:id/publish",   editorUp, ctrl.publishLandingPage);
router.post("/:id/duplicate", authorUp, ctrl.duplicateLandingPage);

// ── SECTION BLOCKS ────────────────────────────────────────────────────────────
router.post("/:id/sections",                authorUp, ctrl.addSection);
router.put("/:id/sections/reorder",         authorUp, ctrl.reorderSections);
router.put("/:id/sections/:blockId",        authorUp, ctrl.updateSection);
router.delete("/:id/sections/:blockId",     authorUp, ctrl.deleteSection);

// ── A/B TESTING ───────────────────────────────────────────────────────────────
router.put("/:id/ab-test", editorUp, ctrl.updateABTest);

// ── STATS ─────────────────────────────────────────────────────────────────────
router.get("/:id/stats",           attachAuthId, ctrl.getStats);
// These are called client-side from the landing page itself (no auth needed)
router.post("/:id/stats/view",       ctrl.recordView);
router.post("/:id/stats/conversion", ctrl.recordConversion);

module.exports = router;
module.exports.PREFIX = PREFIX;