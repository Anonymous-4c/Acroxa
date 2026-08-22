// src/routes/usersRoutes.js

const express = require("express");
const router = express.Router();

const { verifyAPIToken, requireRoles } = require("../middlewares/authMiddleware");

const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  bulkUpdateUsers,
  forceLogout,
  toggleStatus
} = require("../controllers/usersController.js");

const adminOnly = [verifyAPIToken, requireRoles("admin")];

// ── LIST + CREATE ───────────────────────────────

router.get("/", adminOnly, getUsers);
router.post("/", adminOnly, createUser);

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

module.exports.extendRouter = extendRouter;
module.exports = router;
module.exports.PREFIX = "/users";