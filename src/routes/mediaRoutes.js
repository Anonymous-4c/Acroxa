// src/routes/mediaRoutes.js
// CHANGES: All font routes added (search, list, download, delete, inject, uninject).
// All original media routes preserved exactly.

const express = require("express");
const router  = express.Router();
const { verifyAPIToken } = require("../middlewares/authMiddleware");

const {
  multerInstance,
  handleUpload,
  listMedia,
  handleThumbnailUpload,
  regenerateThumbs,
  handleRename,
  handleDelete,
} = require("../controllers/mediaController");

const {
  searchFonts,
  getFonts,
  downloadFont,
  deleteFont,
  injectFont,
  uninjectFont,
} = require("../controllers/fontController");

const PREFIX = "/media";
module.exports.PREFIX = PREFIX;

// ─── Media routes (unchanged) ─────────────────────────────────────────────
router.get("/files",         verifyAPIToken, listMedia);
router.get("/regenerate-thumbs",         verifyAPIToken, regenerateThumbs);
router.post("/upload",       verifyAPIToken, multerInstance.array("media"), handleUpload);
router.post("/upload-thumb", multerInstance.single("thumbnail"), handleThumbnailUpload);

router.post("/rename-file", verifyAPIToken, async (req, res) => {
  const userRole = req.user?.role;
  if (userRole === "admin" || userRole === "editor") return await handleRename(req, res);
  return await createApprovalRequest(req, res, "rename");
});

router.post("/delete-file", verifyAPIToken, async (req, res) => {
  const userRole = req.user?.role;
  if (userRole === "admin") return await handleDelete(req, res);
  return await createApprovalRequest(req, res, "delete");
});

// ─── Font routes ──────────────────────────────────────────────────────────

// Search Google Fonts (proxied — no API key required on client)
router.get("/fonts/search", verifyAPIToken, searchFonts);

// List all downloaded fonts with inject state
router.get("/fonts", verifyAPIToken, getFonts);

// Download a font family to /uploads/fonts/<slug>/
router.post("/fonts/download", verifyAPIToken, downloadFont);

// Delete a downloaded font (removes files + uninjects)
router.delete("/fonts/:slug", verifyAPIToken, deleteFont);

// Inject a font's CSS into the public site (via pluginAPI)
router.post("/fonts/:slug/inject", verifyAPIToken, injectFont);

// Remove a font's CSS injection from the public site
router.post("/fonts/:slug/uninject", verifyAPIToken, uninjectFont);

// ─── Approval helper ─────────────────────────────────────────────────────
async function createApprovalRequest(req, res, type) {
  const { oldName, newName, filename } = req.body;
  const actionApi = type === "rename" ? "/acr/api/media/rename-file" : "/acr/api/media/delete-file";
  try {
    const approvalController = require("../controllers/approvalController");
    return await approvalController.createApproval({
      body: {
        type,
        fileName:  type === "rename" ? oldName : filename,
        oldName:   type === "rename" ? oldName : undefined,
        newName:   type === "rename" ? newName : undefined,
        actionApi,
      },
      user: req.user,
    }, res);
  } catch (err) {
    console.error("[Media] Approval request failed:", err);
    return res.status(500).json({ success: false, message: "Failed to create approval request" });
  }
}

module.exports = router;