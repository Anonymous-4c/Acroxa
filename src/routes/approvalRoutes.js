// src/routes/approvalRoutes.js

const express = require("express");
const router = express.Router();

const { verifyAPIToken, requireRoles } = require("../middlewares/authMiddleware");
const { createApproval, getPendingApprovals, reviewApproval, getAllApprovals } = require("../controllers/approvalController");

// ==================== DEFINE PREFIX ====================
const PREFIX = "/approvals";     // ← This is what you asked for

// Public: Anyone logged in can create approval request
router.post("/create", verifyAPIToken, createApproval);

// Admin only
router.get("/all", verifyAPIToken, requireRoles(["admin"]), getAllApprovals);
router.get("/pending", verifyAPIToken, requireRoles(["admin"]), getPendingApprovals);
router.post("/review", verifyAPIToken, requireRoles(["admin"]), reviewApproval);

module.exports = router;
module.exports.PREFIX = PREFIX;   // ← Important: Export the PREFIX