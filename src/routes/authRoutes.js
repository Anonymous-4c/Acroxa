// src/routes/authRoutes.js
const express = require("express");
const router = express.Router();

const {
  login,
  logoutUser,
  verifySession,
  register,
  createUser,
  sendEmailCode,
  renderSetupFirstUser,
  requestPasswordReset,
  resetPassword,
  firstUserSetupHandler,
  upload,
  handleControlEntry,
  handleControlVerify,
  registerPasskey,
  createPasskeyWithPassword,
  createRecoverySecret
} = require("../controllers/authController");

const { verifyAPIToken, firewallMiddleware, requireControlSession } = require("../middlewares/authMiddleware");

// ─────────────────────────────────────────────────────────────────────────────
// Multer error handler
// ─────────────────────────────────────────────────────────────────────────────
const handleMulterError = (err, req, res, next) => {
  if (err) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "File size too large. Maximum size is 5MB." });
    }
    return res.status(400).json({ success: false, message: err.message || "File upload error" });
  }
  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// ── V2 CONTROL ACCESS ROUTES ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// Step 1 — Visit control entry point (serves the passkey / secret challenge UI)
router.get("/control/:controlKey", handleControlEntry);

// Step 2 — Submit either a WebAuthn assertion OR a recovery secret
router.post("/control/verify", handleControlVerify);

// Register an additional passkey (requires existing auth + control session)
router.post("/control/register-passkey", verifyAPIToken, requireControlSession, registerPasskey);

// Bootstrap a first passkey using username + password (no control session needed —
// gated purely on the password, same trust level as /login)
router.post("/control/passkey/create-with-password", createPasskeyWithPassword);

// Generate/rotate a recovery secret for the logged-in user (returned once)
router.post("/control/recovery-secret/create", verifyAPIToken, createRecoverySecret);

// ─────────────────────────────────────────────────────────────────────────────
// ── AUTH API ROUTES ───────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

router.post("/login", firewallMiddleware, requireControlSession, login);

router.post("/logout", logoutUser);
router.post("/register", register);

router.post("/create-user", verifyAPIToken, createUser);
router.get("/create-user", verifyAPIToken, (req, res) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).send("Forbidden");
  }
  const { renderCreateUser } = require("../views/createUser");
  res.send(renderCreateUser());
});

// Force sign out all users by rotating the JWT secret
router.post("/force-signout-all", verifyAPIToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    // Store a force-sign-out timestamp in settings
    const { connectDB } = require("../core/connect-db");
    const models = await connectDB();
    const current = await models.Settings.getSettings();
    const security = current.security || {};
    security.forceSignOutAt = new Date().toISOString();
    await models.Settings.updateSettings({ security });

    // Refresh the cached timestamp in the auth middleware
    try {
      const authMiddleware = require("../../middlewares/authMiddleware");
      if (typeof authMiddleware.refreshForceSignOutTimestamp === "function") {
        await authMiddleware.refreshForceSignOutTimestamp();
      }
    } catch (_) {}

    return res.json({ success: true, message: "All sessions invalidated. Users must log in again." });
  } catch (err) {
    console.error("[Auth] force-signout-all:", err);
    return res.status(500).json({ success: false, message: "Failed to force sign out" });
  }
});

router.post("/send-email-code", sendEmailCode);
router.get("/verify", verifyAPIToken, verifySession);

// GET /auth/session-data — Returns current user session info for continuous polling
router.get("/session-data", verifyAPIToken, async (req, res) => {
  try {
    const { connectDB } = require("../core/connect-db");
    const models = await connectDB();
    const User = models.User;

    // Find user by ID from the decoded JWT
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const user = await User.findById(userId).select("-password -__v -resetPasswordToken -resetPasswordExpires -emailVerificationCode");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({
      success: true,
      data: {
        userId: user._id || user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture || "",
        fullName: user.fullName || "",
        lastLogin: user.lastLogin || null,
        sessionId: req.user.jti || req.user.sessionId || null,
        activePage: req.query.page || "/",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[Auth] session-data:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch session data" });
  }
});

router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);

router.post(
  "/firstuser-setup",
  upload.fields([
    { name: "profilePicFile", maxCount: 1 },
    { name: "siteIconFile",   maxCount: 1 },
    { name: "siteLogoFile",   maxCount: 1 }
  ]),
  handleMulterError,
  firstUserSetupHandler
);

// ─────────────────────────────────────────────────────────────────────────────
// ── PAGE ROUTES ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

router.get("/setup-first-user", (req, res) => {
  res.send(renderSetupFirstUser());
});

module.exports = router;