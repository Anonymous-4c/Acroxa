// src/routes/layoutRoutes.js

const express = require("express");
const router = express.Router();

const { verifyAPIToken } = require("../middlewares/authMiddleware");

const ctrl = require("../controllers/layoutController");
const sseHub = require("../core/sseHub");

const PREFIX = "/layouts";

// ─────────────────────────────────────────────────────────────────────────────
// SSE
// ─────────────────────────────────────────────────────────────────────────────

// GET /acrx/api/layouts/sse
router.get("/sse", sseHub.sseHandler);

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

router.get("/get/active", ctrl.getActiveLayout);
router.post("/get/active", verifyAPIToken, ctrl.setActiveLayout);

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

router.get("/preview", verifyAPIToken, ctrl.getPreview);

router.post("/preview/reload", verifyAPIToken, ctrl.reloadPreview);

router.post("/preview/clear", verifyAPIToken, ctrl.clearPreview);

router.get("/preview/routes", verifyAPIToken, ctrl.getPreviewRoutes);

router.get("/preview/status", verifyAPIToken, ctrl.getPreviewStatus);

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/", ctrl.getLayouts);

// IMPORTANT: Must be before "/:id"
router.post("/create", verifyAPIToken, ctrl.createLayout);

router.get("/:id", ctrl.getLayout);

router.put("/:id", verifyAPIToken, ctrl.updateLayout);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/templates", verifyAPIToken, ctrl.getTemplates);

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/config", verifyAPIToken, ctrl.getConfig);

router.patch("/:id/config", verifyAPIToken, ctrl.updateConfig);

router.delete("/:id/config", verifyAPIToken, ctrl.resetConfig);

// ─────────────────────────────────────────────────────────────────────────────
// FILES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/files", verifyAPIToken, ctrl.getFiles);

router.get("/:id/file", verifyAPIToken, ctrl.getFileContent);

router.patch("/:id/file", verifyAPIToken, ctrl.updateFile);

router.post("/:id/file", verifyAPIToken, ctrl.createFile);

router.delete("/:id/file", verifyAPIToken, ctrl.deleteFile);

router.post("/:id/file/rename", verifyAPIToken, ctrl.renameFile);

router.post("/:id/folder", verifyAPIToken, ctrl.createFolder);

module.exports = router;
module.exports.PREFIX = PREFIX;