// src/routes/profileRoutes.js
const express = require("express");
const router = express.Router();

const {
  getUserProfile,
  updateUserProfile,
  changePassword,
  getUserActivity,
  getAllUsers,
  deleteUserAccount
} = require("../controllers/profileController");

const verifyAPIToken = require("../middlewares/authMiddleware").verifyAPIToken;

// All routes are protected with JWT verification
// ───────────────────────────────────────────────
const PREFIX = "/user";
// GET /api/profile          →  Get user profile + dashboard stats
router.get("/profile", verifyAPIToken, async (req, res) => {
  try {
    const data = await getUserProfile(req);
    return res.status(200).json(data);
  } catch (error) {
    console.error("GET /profile error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch profile"
    });
  }
});
router.get("/profile/all", verifyAPIToken, async (req, res) => {
  try {
    const data = await getAllUsers(req);
    return res.status(200).json(data);
  } catch (error) {
    console.error("GET /profile/all error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch all users"
    });
  }
});
router.delete("/profile/:id", verifyAPIToken, async (req, res) => {
  try {
    const result = await deleteUserAccount(req);
    return res.status(200).json(result);
  } catch (error) {
    console.error("DELETE /profile/:id error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to delete user account"
    });
  }
});

// PATCH /api/profile        →  Update profile fields (bio, avatar, etc.)
router.patch("/profile", verifyAPIToken, async (req, res) => {
  try {
    const result = await updateUserProfile(req);
    return res.status(200).json(result);
  } catch (error) {
    console.error("PATCH /profile error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update profile"
    });
  }
});

// POST /api/profile/password  →  Change password
router.post("/profile/password", verifyAPIToken, async (req, res) => {
  try {
    const result = await changePassword(req);
    return res.status(200).json(result);
  } catch (error) {
    console.error("POST /profile/password error:", error);
    const status = error.message.includes("incorrect") ? 401 : 400;
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to change password"
    });
  }
});

// GET /api/profile/activity   →  Get recent activity + login info
router.get("/profile/activity", verifyAPIToken, async (req, res) => {
  try {
    const data = await getUserActivity(req);
    return res.status(200).json(data);
  } catch (error) {
    console.error("GET /profile/activity error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch activity"
    });
  }
});

module.exports = router;
module.exports.PREFIX = PREFIX;
