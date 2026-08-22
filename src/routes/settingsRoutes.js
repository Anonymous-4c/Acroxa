// src/routes/settingsRoutes.js
// Mounted at /acr/api/system via loadRoutes.js (PREFIX = "/system")

const express = require("express");
const router  = express.Router();

const { verifyAPIToken, requireRoles } = require("../middlewares/authMiddleware");
const {
  getSettings,
  getSection,
  updateSection,
  bulkUpdate,
  resetSettings,
  toggleMaintenance,
  testAIConnection,
  getAIModels,
  switchAIProvider,
  testEmailConnection,
  sendTestEmail,
  flushCache,
} = require("../controllers/settingsController");
const logStream = require("../core/logStream.js");
const PREFIX = "/system";


const adminOnly = [verifyAPIToken, requireRoles("admin")];

// ── Specific named routes BEFORE /:section wildcard ──────────────────────────

// POST  /acr/api/system/reset
router.post("/reset", adminOnly, resetSettings);

// POST  /acr/api/system/maintenance   body: { enabled: bool }
router.post("/maintenance", adminOnly, toggleMaintenance);

// POST  /acr/api/system/ai/test              body: { provider }
router.post("/ai/test", adminOnly, testAIConnection);

// GET   /acr/api/system/ai/models?provider=X
router.get("/ai/models", adminOnly, getAIModels);

// PATCH /acr/api/system/ai/provider          body: { provider }
router.patch("/ai/provider", adminOnly, switchAIProvider);

// POST  /acr/api/system/email/test            body: {}
router.post("/email/test", adminOnly, testEmailConnection);

// POST  /acr/api/system/email/send-test       body: { to: "email@..." }
router.post("/email/send-test", adminOnly, sendTestEmail);

// POST  /acr/api/system/cache/flush
router.post("/cache/flush", adminOnly, flushCache);

// ── Generic section routes ────────────────────────────────────────────────────
// SSE live stream
router.get(
    "/logs/live",
    adminOnly,
    (req, res) => logStream.createStream(req, res)
);

// Enable streaming
router.post(
    "/logs/enable",
    adminOnly,
    (req, res) => {

        logStream.enable();

        res.json({
            success: true,
            message: "Log streaming enabled"
        });
    }
);

// Disable streaming
router.post(
    "/logs/disable",
    adminOnly,
    (req, res) => {

        logStream.disable();

        res.json({
            success: true,
            message: "Log streaming disabled"
        });
    }
);

// Clear buffer
router.delete(
    "/logs",
    adminOnly,
    (req, res) => {

        logStream.clear();

        res.json({
            success: true
        });
    }
);

// Status
router.get(
    "/logs/status",
    adminOnly,
    (req, res) => {

        res.json(
            logStream.status()
        );
    }
);
// GET   /acr/api/system           → full settings object
router.get("/", adminOnly, getSettings);

// GET   /acr/api/system/:section  → single section
router.get("/:section", adminOnly, getSection);

// PATCH /acr/api/system           → bulk update
router.patch("/", adminOnly, bulkUpdate);

// PATCH /acr/api/system/:section  → single section update
router.patch("/:section", adminOnly, updateSection);

// ── Extension hook ────────────────────────────────────────────────────────────
const extendRouter = (fn) => fn(router);
module.exports.extendRouter = extendRouter;

module.exports = router;
module.exports.PREFIX = PREFIX;
