// src/routes/usersRoutes.js

const express = require("express");
const router = express.Router();

const { verifyAPIToken, requireRoles } = require("../middlewares/authMiddleware");

const {
  getUsers,
  getUser,
  getMe,
  createUser,
  updateUser,
  deleteUser,
  bulkUpdateUsers,
  forceLogout,
  toggleStatus,
  getUserActivity,
  getOnlineUsers,
  getActivityStats
} = require("../controllers/usersController.js");

const adminOnly = [verifyAPIToken, requireRoles("admin")];
const authOnly = [verifyAPIToken];

// ── LIST + CREATE ───────────────────────────────

router.get("/", adminOnly, getUsers);
router.post("/", adminOnly, createUser);

// ── CURRENT USER (me) ────────────────────────────
router.get("/me", authOnly, getMe);

// ── ACTIVITY ────────────────────────────────────

router.get("/activity", adminOnly, getUserActivity);
router.get("/online", adminOnly, getOnlineUsers);
router.get("/activity-stats", adminOnly, getActivityStats);

// ── BULK ────────────────────────────────────────

router.patch("/bulk", adminOnly, bulkUpdateUsers);

// ── SINGLE USER ────────────────────────────────

router.get("/:id", adminOnly, getUser);
router.patch("/:id", adminOnly, updateUser);
router.delete("/:id", adminOnly, deleteUser);

// ── USER CONTROL OPERATIONS ─────────────────────

router.post("/:id/logout", adminOnly, forceLogout);
router.post("/:id/status", adminOnly, toggleStatus);

// ── EXTENSION HOOK ──────────────────────────────

const extendRouter = (fn) => fn(router);

router.extendRouter = extendRouter;
router.PREFIX = "/users";
module.exports = router;