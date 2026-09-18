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
const { instance: activityCache } = require("../core/activityCache");

// ─────────────────────────────────────────────────────────────────────────────
// SSE (Server-Sent Events) — real-time activity broadcast
// ─────────────────────────────────────────────────────────────────────────────
const sseClients = new Set();

function broadcastActivity(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  let sent = 0;
  for (const client of sseClients) {
    try { 
      client.write(payload); 
      sent++;
    } catch (_) { 
      sseClients.delete(client); 
    }
  }
  // Also update in-memory cache for instant controller reads
  if (data.type === "activity" && data.userId) {
    activityCache.set(data.userId, data);
  }
}

// GET /auth/activity-stream — SSE endpoint for real-time activity
router.get("/activity-stream", verifyAPIToken, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`);

  sseClients.add(res);
  req.on("close", () => {
    sseClients.delete(res);
  });
});

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

// POST /auth/session-data — Returns current user session info for continuous polling
router.all("/session-data", verifyAPIToken, async (req, res) => {
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

    // Store rich activity in SessionActivity collection
    if (models.SessionActivity) {
      try {
        const forwarded = req.headers["x-forwarded-for"];
        const ip = (typeof forwarded === "string" ? forwarded.split(",")[0] : req.socket?.remoteAddress) || "";
        const activePage = req.body?.page || req.body?.activePage || req.query.page || req.query.activePage || "/";
        const isCloseEvent = (req.body?.event || req.query.event) === "close";

        if (isCloseEvent) {
          // Page unload — close the last page visit
          await models.SessionActivity.closePageVisit(user._id || user.id, activePage);
          await models.SessionActivity.markOffline(user._id || user.id);
          broadcastActivity({
            type: "activity",
            userId: user._id || user.id,
            username: user.username,
            avatar: user.avatar || "",
            role: user.role,
            activePage: "",
            isActive: false,
            lastSeen: new Date().toISOString(),
            ip: ip.replace("::ffff:", "")
          });
        } else {
          const updated = await models.SessionActivity.upsertActivity({
            userId: user._id || user.id,
            username: user.username,
            avatar: user.avatar || "",
            role: user.role || "user",
            activePage,
            ip: ip.replace("::ffff:", ""),
            userAgent: req.headers["user-agent"] || "",
            sessionId: req.user.jti || req.user.sessionId || null
          });

          // If page changed, also record page view for navigation tracking
          if (models.SessionActivity.recordPageView) {
            try { await models.SessionActivity.recordPageView(user._id || user.id, activePage); } catch (_) {}
          }

          // Build full activity payload from the freshly-updated doc
          const act = updated ? {
            todayVisits: updated.todayVisits || 0,
            actionsToday: updated.actionsToday || 0,
            pagesViewedToday: updated.pagesViewedToday || 0,
            totalTimeOnline: updated.totalTimeOnline || 0,
            totalVisits: updated.totalVisits || 0,
            pagesVisited: updated.pagesVisited || [],
            connectedAt: updated.connectedAt || new Date().toISOString(),
          } : {};

          broadcastActivity({
            type: "activity",
            userId: user._id || user.id,
            username: user.username,
            avatar: user.avatar || "",
            role: user.role,
            activePage,
            isActive: true,
            lastSeen: new Date().toISOString(),
            ip: ip.replace("::ffff:", ""),
            ...act
          });
        }
      } catch (e) {
        console.error('[session-data] Error upserting activity:', e.message);
      }
    }

    return res.json({
      success: true,
      data: {
        userId: user._id || user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture || user.avatar || "",
        fullName: user.fullName || "",
        lastLogin: user.lastLogin || null,
        sessionId: req.user.jti || req.user.sessionId || null,
        activePage: req.body?.page || req.query?.page || "/",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[Auth] session-data:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch session data" });
  }
});

// POST /auth/keep-alive — Keep session alive, return session duration and stats
router.post("/keep-alive", verifyAPIToken, async (req, res) => {
  try {
    const { connectDB } = require("../core/connect-db");
    const models = await connectDB();
    const User = models.User;

    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const user = await User.findById(userId).select("-password -__v -resetPasswordToken -resetPasswordExpires -emailVerificationCode");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let sessionInfo = { isActive: true, lastSeen: new Date().toISOString() };
    
    if (models.SessionActivity) {
      try {
        const activity = await models.SessionActivity.findOne({ userId: user._id || user.id })
          .select('sessionStart totalTimeOnline todayVisits actionsToday pagesViewedToday lastSeen')
          .lean();
        
        if (activity) {
          const sessionStart = activity.sessionStart ? new Date(activity.sessionStart) : null;
          const now = new Date();
          const sessionDuration = sessionStart ? now - sessionStart : (activity.totalTimeOnline || 0);
          
          sessionInfo = {
            isActive: activity.isActive !== false,
            lastSeen: activity.lastSeen,
            sessionDuration,
            sessionDurationHuman: formatDuration(sessionDuration),
            todayVisits: activity.todayVisits || 0,
            actionsToday: activity.actionsToday || 0,
            pagesViewedToday: activity.pagesViewedToday || 0,
            totalTimeOnline: activity.totalTimeOnline || 0,
            sessionStart: activity.sessionStart
          };
        }
      } catch (_) {}
    }

    return res.json({
      success: true,
      data: {
        userId: user._id || user.id,
        username: user.username,
        ...sessionInfo,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[Auth] keep-alive:", err);
    return res.status(500).json({ success: false, message: "Failed to keep alive" });
  }
});

function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

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