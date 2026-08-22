// src/controllers/authController.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const U_ht = require("../views/setupFirstUser");

const SECRET = process.env.JWT_SECRET || "acroxa_super_secret";
const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────
async function getModels() {
  const { connectDB } = require("../core/connect-db");
  const models = await connectDB();
  if (!models || !models.User || !models.Category || !models.Post || !models.Page) {
    throw new Error("Models not available");
  }
  return models;
}

function getDbType() {
  const { getDbType } = require("../core/connect-db");
  return getDbType();
}

// ─────────────────────────────────────────────────────────────────────────────
// Session duration helpers  (Keep Me Logged In)
// ─────────────────────────────────────────────────────────────────────────────
const KEEP_ME_DURATIONS = {
  "2h":  { seconds: 2  * 60 * 60,       jwtExp: "2h"  },
  "24h": { seconds: 24 * 60 * 60,       jwtExp: "24h" },
  "7d":  { seconds: 7  * 24 * 60 * 60,  jwtExp: "7d"  },
  "14d": { seconds: 14 * 24 * 60 * 60,  jwtExp: "14d" }
};

function resolveDuration(keepMe) {
  return KEEP_ME_DURATIONS[keepMe] || KEEP_ME_DURATIONS["2h"];
}

// ─────────────────────────────────────────────────────────────────────────────
// File Upload Config
// ─────────────────────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "../../pub-dist/Setup");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + Date.now() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|ico|svg/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed!"));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Origin Protection Middleware (existing – unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGIN_PATH = "/acr/api/firstuser-setup";
router.use((req, res, next) => {
  if (!req.originalUrl.includes(ALLOWED_ORIGIN_PATH)) {
    return res.status(403).json({ success: false, message: "Unauthorized origin" });
  }
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Password / generic-secret helpers
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: these are generic scrypt hash/verify helpers — reused below for the
// recovery secret too, so it's never stored in plaintext.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      resolve(key);
    });
  });
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(storedHash, password) {
  try {
    if (!storedHash || typeof password !== "string") return false;
    const [salt, keyHex] = storedHash.split(":");
    if (!salt || !keyHex) return false;
    const storedKey = Buffer.from(keyHex, "hex");
    const derivedKey = await new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, key) => {
        if (err) reject(err);
        resolve(key);
      });
    });
    if (storedKey.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(storedKey, derivedKey);
  } catch (err) {
    console.error("verifyPassword Error:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email code store (dummy – dev only)
// ─────────────────────────────────────────────────────────────────────────────
const emailCodes = {};

async function sendEmailCode(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const code = Math.floor(100000 + Math.random() * 900000);
    emailCodes[email] = code;
    console.log(`[DUMMY EMAIL CODE] to: ${email}  code: ${code}`);

    setTimeout(() => {
      if (emailCodes[email] === code) delete emailCodes[email];
    }, 10 * 60 * 1000);

    return res.json({ success: true, message: "Verification code generated (dummy). Check server console." });
  } catch (err) {
    console.error("sendEmailCode Error:", err);
    return res.status(500).json({ success: false, message: "Failed to generate code" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// View renderer helpers
// ─────────────────────────────────────────────────────────────────────────────
function renderSetupFirstUser() {
  return U_ht.SetupFirstUserPage();
}

// ─────────────────────────────────────────────────────────────────────────────
// ── V2 CONTROL ACCESS ────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /token/control/:controlKey
 */
async function handleControlEntry(req, res) {
  try {
    const { controlKey } = req.params;

    if (!controlKey || controlKey.length !== 64) {
      return res.status(404).send("Not Found");
    }

    const models = await getModels();
    const user = await models.User.findByControlKey(controlKey);

    if (!user) {
      return res.status(404).send("Not Found");
    }

    user.lastControlAccess = new Date();
    await user.save();

    const { renderControlEntry } = require("../views/controlEntry");
    return res.send(renderControlEntry({ controlKey }));
  } catch (err) {
    console.error("handleControlEntry Error:", err);
    return res.status(404).send("Not Found");
  }
}

/**
 * POST /token/control/verify
 *
 * Step 2 – two supported verification paths, chosen by which fields are present.
 * `controlKey` is always required.
 *
 *   Path A — WebAuthn passkey:
 *     { controlKey, credentialId, clientDataJSON, authenticatorData, signature, keepMe }
 *
 *   Path B — Recovery secret (fallback when no passkey is available):
 *     { controlKey, recoverySecret, keepMe }
 */
async function handleControlVerify(req, res) {
  try {
    const {
      controlKey,
      credentialId,
      clientDataJSON,
      authenticatorData,
      signature,
      recoverySecret
    } = req.body;

    if (!controlKey) {
      return res.status(400).json({ success: false, message: "Missing control key" });
    }

    const hasWebAuthnFields = credentialId && clientDataJSON && authenticatorData && signature;
    const hasSecretField = typeof recoverySecret === "string" && recoverySecret.length > 0;

    if (!hasWebAuthnFields && !hasSecretField) {
      return res.status(400).json({
        success: false,
        message: "Provide either a passkey assertion or a recovery secret"
      });
    }

    const models = await getModels();
    const user = await models.User.findByControlKey(controlKey.trim());

    // Generic message on every failure path below — no info leakage about
    // which part (control key vs credential vs secret) was wrong.
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let verifiedVia = null;

    if (hasWebAuthnFields) {
      // ── Path A: WebAuthn passkey ──────────────────────────────────────
      const passkeys = Array.isArray(user.passkeys) ? user.passkeys : [];
      const matchedKey = passkeys.find(pk => pk.credentialId === credentialId);

      if (!matchedKey) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const verified =
        process.env.NODE_ENV !== "production" ||
        _verifyWebAuthnSignature({
          publicKey: matchedKey.publicKey,
          clientDataJSON,
          authenticatorData,
          signature
        });

      if (!verified) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      await user.updatePasskeyLastUsed(credentialId);
      verifiedVia = "passkey";

    } else {
      // ── Path B: Recovery secret ───────────────────────────────────────
      // Hashed comparison (scrypt + timingSafeEqual) against user.recoverySecretHash.
      // Never compare recovery secrets with `===` against a plaintext value.
      if (!user.recoverySecretHash) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const secretOk = await verifyPassword(user.recoverySecretHash, recoverySecret);
      if (!secretOk) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      verifiedVia = "recovery_secret";
    }

    const keepMe = req.body.keepMe || "7d";
    const duration = resolveDuration(keepMe);

    const controlSessionToken = jwt.sign(
      {
        type: "control_session",
        userId: user.id || user._id?.toString(),
        sessionVersion: user.sessionVersion
      },
      SECRET,
      { expiresIn: keepMe }
    );

    const cookieParts = [
      `control_session=${controlSessionToken}`,
      `Max-Age=${duration.seconds}`,
      `Path=/`,
      `HttpOnly`,
      `SameSite=Strict`,
      process.env.NODE_ENV === "production" ? "Secure" : ""
    ].filter(Boolean).join("; ");

    res.setHeader("Set-Cookie", cookieParts);

    return res.json({
      success: true,
      message: "Control session established",
      verifiedVia
    });

  } catch (err) {
    console.error("handleControlVerify Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

/**
 * Placeholder WebAuthn signature verifier.
 * Replace with @simplewebauthn/server or a custom crypto routine before production.
 */
function _verifyWebAuthnSignature({ publicKey, clientDataJSON, authenticatorData, signature }) {
  // TODO: implement full CBOR + COSE key verification
  console.warn("[WebAuthn] Signature verification stub — replace before production!");
  return true;
}

/**
 * POST /token/control/register-passkey
 * Requires a valid control session cookie AND a valid auth_token — for adding
 * an *additional* passkey once you're already authenticated.
 */
async function registerPasskey(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { credentialId, publicKey, transports } = req.body;

    if (!credentialId || !publicKey) {
      return res.status(400).json({ success: false, message: "credentialId and publicKey required" });
    }

    const models = await getModels();
    const dbType = getDbType();
    let user;

    if (dbType === "mongodb") {
      user = await models.User.findById(req.user.id);
    } else {
      user = await models.User.findByPk(req.user.id);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await user.addPasskey({ credentialId, publicKey, transports });

    return res.json({ success: true, message: "Passkey registered" });
  } catch (err) {
    console.error("registerPasskey Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

/**
 * POST /token/control/passkey/create-with-password
 *
 * Bootstraps a passkey using username + password instead of a control
 * session — for the case where the account has no passkey registered yet
 * (so the normal control-session-gated /register-passkey route is unreachable).
 * Guarded purely by the password, same as /login — no control key involved.
 */
async function createPasskeyWithPassword(req, res) {
  try {
    const { username, password, credentialId, publicKey, transports } = req.body;

    if (!username || !password || !credentialId || !publicKey) {
      return res.status(400).json({
        success: false,
        message: "username, password, credentialId and publicKey are required"
      });
    }

    const models = await getModels();
    const user = await models.User.findByUsername(username.trim().toLowerCase());

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const passwordOk = await verifyPassword(user.password, password);
    if (!passwordOk) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    await user.addPasskey({ credentialId, publicKey, transports });

    return res.json({ success: true, message: "Passkey registered" });
  } catch (err) {
    console.error("createPasskeyWithPassword Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

/**
 * POST /token/control/recovery-secret/create
 *
 * Generates a fresh recovery secret for the authenticated user, stores only
 * its hash, and returns the plaintext value ONCE (it can't be retrieved
 * again — only regenerated). Requires a valid auth_token (verifyAPIToken).
 */
async function createRecoverySecret(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const models = await getModels();
    const dbType = getDbType();
    let user;

    if (dbType === "mongodb") {
      user = await models.User.findById(req.user.id);
    } else {
      user = await models.User.findByPk(req.user.id);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const rawSecret = crypto.randomBytes(24).toString("base64url");
    user.recoverySecretHash = await hashPassword(rawSecret);
    await user.save();

    return res.json({
      success: true,
      message: "Recovery secret generated. Store it somewhere safe — it will not be shown again.",
      recoverySecret: rawSecret
    });
  } catch (err) {
    console.error("createRecoverySecret Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ── AUTH ─────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

async function register(req, res) {
  try {
    const models = await getModels();
    const User = models.User;

    // Check registration enabled setting
    const settings = await models.Settings.getSettings();
    if (settings?.system?.registrationEnabled === false) {
      return res.status(403).json({ success: false, message: "Registration is currently disabled" });
    }

    const adminExists = await User.existsAny();
    if (adminExists && settings?.system?.registrationEnabled !== true) {
      return res.status(403).json({ success: false, message: "Registration closed" });
    }

    const { username, email, password, confirmPassword, code } = req.body;

    if (!username || !email || !password || !confirmPassword || !code) {
      return res.status(400).json({ success: false, message: "All fields required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    if (emailCodes[email] != code) {
      return res.status(400).json({ success: false, message: "Invalid verification code" });
    }

    if (await User.findByUsername(username)) {
      return res.status(400).json({ success: false, message: "Username taken" });
    }

    if (await User.findByEmail(email)) {
      return res.status(400).json({ success: false, message: "Email already used" });
    }

    const hashedPassword = await hashPassword(password);
    const user = await User.createUser({
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: "admin"
    });

    delete emailCodes[email];

    const userId = user.id || user._id?.toString();
    const token = jwt.sign(
      { id: userId, username: user.username, role: user.role },
      SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      success: true,
      message: "User registered successfully",
      token,
      user: { username: user.username, email, role: user.role }
    });
  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
}

async function createUser(req, res) {
  try {
    const { User } = await getModels();

    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admin can create users" });
    }

    const {
      username, email, password, confirmPassword, role,
      fullName = "",
      jobTitle = "",
      phone = "",
      location = "",
      bio = "",
      department = "",
      website = "",
      skills = [],
      socialLinks = {},
      accountStatus = "active"
    } = req.body;

    if (!username || !email || !password || !confirmPassword || !role) {
      return res.status(400).json({ success: false, message: "All required fields must be filled" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    const allowedRoles = ["editor", "author", "user", "seo", "designer", "developer"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    if (await User.findByUsername(username)) {
      return res.status(400).json({ success: false, message: "Username taken" });
    }

    if (await User.findByEmail(email)) {
      return res.status(400).json({ success: false, message: "Email already used" });
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.createUser({
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role,
      fullName,
      jobTitle,
      phone,
      location,
      bio,
      department,
      website,
      skills: Array.isArray(skills) ? skills : [],
      socialLinks: typeof socialLinks === "object" ? socialLinks : {},
      isActive: accountStatus !== "suspended",
      isSuspended: accountStatus === "suspended"
    });

    return res.json({
      success: true,
      message: "User created successfully",
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        jobTitle: user.jobTitle
      }
    });
  } catch (err) {
    console.error("CreateUser Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function login(req, res) {
  try {
    if (!req.firewallPassed) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const models = await getModels();
    const User = models.User;

    let { username, password, keepMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password required" });
    }

    username = username.trim().toLowerCase();
    const user = await User.findByUsername(username);

    if (!user) {
      req.securityEvent = "login_failed_user_not_found";
      req.loginFailed = true;
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await verifyPassword(user.password, password);
    if (!isMatch) {
      req.securityEvent = "login_failed_password";
      req.loginFailed = true;
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const userId = user.id || user._id?.toString();
    const duration = resolveDuration(keepMe);

    const token = jwt.sign(
      {
        id: userId,
        username: user.username,
        role: user.role,
        sessionVersion: user.sessionVersion || 1
      },
      SECRET,
      { expiresIn: duration.jwtExp }
    );

    const authCookie = [
      `auth_token=${token}`,
      `Max-Age=${duration.seconds}`,
      `Path=/`,
      `HttpOnly`,
      `SameSite=Strict`,
      process.env.NODE_ENV === "production" ? "Secure" : ""
    ].filter(Boolean).join("; ");

    const controlSessionToken = jwt.sign(
      {
        type: "control_session",
        userId,
        sessionVersion: user.sessionVersion || 1
      },
      SECRET,
      { expiresIn: duration.jwtExp }
    );

    const controlCookie = [
      `control_session=${controlSessionToken}`,
      `Max-Age=${duration.seconds}`,
      `Path=/`,
      `HttpOnly`,
      `SameSite=Strict`,
      process.env.NODE_ENV === "production" ? "Secure" : ""
    ].filter(Boolean).join("; ");

    res.setHeader("Set-Cookie", [authCookie, controlCookie]);

    user.lastLogin = new Date();
    await user.save();

    return res.json({
      success: true,
      user: { username: user.username, role: user.role }
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function logoutUser(req, res) {
  const del = (name) => [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    process.env.NODE_ENV === "production" ? "Secure" : ""
  ].filter(Boolean).join("; ");

  res.setHeader("Set-Cookie", [del("auth_token"), del("control_session")]);

  return res.status(200).json({ success: true, message: "Logged out successfully" });
}

async function verifySession(req, res) {
  return res.json({ success: true, user: req.user });
}

async function requestPasswordReset(req, res) {
  try {
    const models = await getModels();
    const User = models.User;
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({ success: false, message: "Username or email required" });
    }

    const user = identifier.includes("@")
      ? await User.findByEmail(identifier)
      : await User.findByUsername(identifier);

    if (!user) {
      return res.status(404).json({ success: false, message: "No user found" });
    }

    const code = Math.floor(100000 + Math.random() * 900000);
    emailCodes[user.email] = code;
    console.log(`[PASSWORD RESET CODE] for ${user.email}: ${code}`);

    return res.json({ success: true, message: "Password reset code generated (check console for dev mode)." });
  } catch (err) {
    console.error("requestPasswordReset Error:", err);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
}

async function resetPassword(req, res) {
  try {
    const models = await getModels();
    const User = models.User;
    const { identifier, code, newPassword } = req.body;

    if (!identifier || !code || !newPassword) {
      return res.status(400).json({ success: false, message: "All fields required" });
    }

    const user = identifier.includes("@")
      ? await User.findByEmail(identifier)
      : await User.findByUsername(identifier);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (emailCodes[user.email] != code) {
      return res.status(400).json({ success: false, message: "Invalid or expired code" });
    }

    user.password = await hashPassword(newPassword);
    user.sessionVersion = (user.sessionVersion || 1) + 1;
    await user.save();
    delete emailCodes[user.email];

    return res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("resetPassword Error:", err);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
}

async function updateProfile(req, res) {
  try {
    const models = await getModels();
    const User = models.User;
    const dbType = getDbType();
    const { userId } = req.user;
    const { username, email, password } = req.body;

    let user;
    if (dbType === "mongodb") {
      user = await User.findById(userId);
    } else {
      user = await User.findByPk(userId);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (username && username !== user.username) {
      if (await User.findByUsername(username)) {
        return res.status(400).json({ success: false, message: "Username already taken" });
      }
      user.username = username.trim().toLowerCase();
    }

    if (email && email !== user.email) {
      if (await User.findByEmail(email)) {
        return res.status(400).json({ success: false, message: "Email already used" });
      }
      user.email = email.trim().toLowerCase();
    }

    if (password) {
      user.password = await hashPassword(password);
      user.sessionVersion = (user.sessionVersion || 1) + 1;
    }

    await user.save();

    return res.json({
      success: true,
      message: "Profile updated successfully",
      user: { username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error("Update Profile Error:", err);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
}

async function checkFirstTime(req, res, next) {
  try {
    const models = await getModels();
    const User = models.User;
    const anyUser = await User.existsAny();
    if (!anyUser) return res.redirect("/acr/api/setup-first-user");
    next();
  } catch (err) {
    console.error("checkFirstTime Error:", err);
    return res.redirect("/acr/api/setup-first-user");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default content creation (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
async function createDefaultContent(authorId, siteName) {
  const models = await getModels();
  const { Category, Post, Page } = models;
  const dbType = getDbType();
  const isSequelize = dbType !== "mongodb";

  console.log("📂 Creating default categories...");

  const categoryData = [
    { name: "Announcements", slug: "announcements", description: "Official announcements and updates from Acroxa CMS", color: "#4F46E5", deletable: false, order: 1 },
    { name: "Tutorials",     slug: "tutorials",     description: "Learn how to make the most of Acroxa CMS",            color: "#10B981", order: 2 },
    { name: "General",       slug: "general",       description: "General posts and articles",                          color: "#6B7280", order: 3 },
    { name: "Uncategorized", slug: "uncategorized", description: "Default category for uncategorized content",          color: "#9CA3AF", deletable: false, order: 4 }
  ];

  let categories = [];
  if (isSequelize) {
    categories = await Category.bulkCreate(categoryData);
  } else {
    categories = await Category.insertMany(categoryData);
  }

  const announcementCat = categories.find(c => c.slug === "announcements");
  console.log("✅ Categories created");

  console.log("📝 Creating default posts...");
  const defaultPosts = [
    {
      title: `Welcome to ${siteName} - Acroxa CMS Alpha`,
      slug: "welcome-to-acroxa-cms-alpha",
      content: {
        json: {
          version: 1,
          type: "acroxa-document",
          meta: { editor: "acroxa", schema: 1 },
          content: [
            {
              id: "blk_welcome_heading",
              type: "heading",
              attrs: { level: 1 },
              content: [
                {
                  type: "text",
                  text: "Welcome to Acroxa CMS Alpha!",
                  marks: [{ type: "bold" }],
                },
              ],
            },
            {
              id: "blk_welcome_para1",
              type: "paragraph",
              attrs: {},
              content: [
                {
                  type: "text",
                  text: "Congratulations on setting up your new Acroxa CMS installation!",
                  marks: [],
                },
              ],
            },
            {
              id: "blk_welcome_para2",
              type: "paragraph",
              attrs: {},
              content: [
                {
                  type: "text",
                  text: "This is your first post. You can edit or delete it from the admin dashboard.",
                  marks: [],
                },
              ],
            },
          ],
        },
        html: `<h1>Welcome to Acroxa CMS Alpha!</h1><p>Congratulations on setting up your new Acroxa CMS installation!</p><p>This is your first post. You can edit or delete it from the admin dashboard.</p>`,
        raw: "Welcome to Acroxa CMS Alpha! Congratulations on setting up your new Acroxa CMS installation! This is your first post. You can edit or delete it from the admin dashboard.",
        conditionalJS: null,
      },
      excerpt: `Welcome to your new ${siteName} powered by Acroxa CMS Alpha.`,
      status: "published",
      publishDate: new Date(),
      metaTitle: `Welcome to ${siteName} - Acroxa CMS`,
      metaDescription: "Get started with Acroxa CMS",
      focusKeyword: "acroxa cms",
      keywords: ["acroxa", "cms", "welcome"],
      isPillarContent: true,
      allowComments: true
    }
  ];

  for (const postData of defaultPosts) {
    if (isSequelize) postData.authorId = authorId;
    else postData.author = authorId;

    const post = await Post.create(postData);

    if (isSequelize && announcementCat) {
      await post.addCategory(announcementCat);
    } else if (announcementCat) {
      post.categories = [announcementCat._id];
      await post.save();
    }
  }
  console.log("✅ Default posts created");

  console.log("📄 Creating default pages...");
  const defaultPages = [
    {
      title: "Home",
      slug: "home",
      content: {
        json: {
          version: 1,
          type: "acroxa-document",
          meta: { editor: "acroxa", schema: 1 },
          content: [
            {
              id: "blk_home_heading",
              type: "heading",
              attrs: { level: 1 },
              content: [
                {
                  type: "text",
                  text: `Welcome to ${siteName}`,
                  marks: [{ type: "bold" }],
                },
              ],
            },
            {
              id: "blk_home_para",
              type: "paragraph",
              attrs: {},
              content: [
                {
                  type: "text",
                  text: "Powered by Acroxa CMS Alpha",
                  marks: [],
                },
              ],
            },
          ],
        },
        html: `<div style="text-align:center;padding:2rem;"><h1>Welcome to ${siteName}</h1><p>Powered by Acroxa CMS Alpha</p></div>`,
        raw: `Welcome to ${siteName} Powered by Acroxa CMS Alpha`,
        conditionalJS: null,
      },
      status: "published",
      template: "home",
      showInMenu: true,
      order: 1,
      metaTitle: `${siteName} - Home`,
      metaDescription: `Welcome to ${siteName}, powered by Acroxa CMS.`
    }
  ];

  for (const pageData of defaultPages) {
    if (isSequelize) pageData.authorId = authorId;
    else pageData.author = authorId;
    try { await Page.create(pageData); } catch (err) {
      console.warn(`⚠️  Failed to create page "${pageData.title}":`, err.message);
    }
  }
  console.log("✅ Default pages created");

  return { categories, posts: defaultPosts.length, pages: defaultPages.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// First User Setup Handler
// Flow: validate → save config → connect DB → create user → create content → return control key
// ─────────────────────────────────────────────────────────────────────────────
async function firstUserSetupHandler(req, res) {
  try {
    console.log("🚀 Starting Acroxa CMS Alpha setup...");
    const data = req.body || {};
    const files = req.files || {};

    const {
      username, email, password, confirmPassword,
      fullName = "", jobTitle = "", bio = "", phone = "", location = "",
      siteName, siteTagline = "", siteDescription = "", siteType = "blog", language = "en",
      contactEmail,
      socialFacebook = "", socialTwitter = "", socialInstagram = "", socialLinkedin = "",
      dbType, dbHost = "127.0.0.1", dbPort = "",
      dbName = "acroxa_cms", dbUser = "", dbPass = "",
      timezone = "UTC", dateFormat = "MM/DD/YYYY", postsPerPage = "10",
      enableComments = "true", enableCategories = "true",
      enableSEO = "true", enableAnalytics = "true",
      enable2FA = "false", enableBackups = "false"
    } = data;

    // ── 1. Validate ──────────────────────────────────────────────────────
    if (!username || !email || !password || !confirmPassword || !siteName || !dbType) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    // ── 2. Handle file uploads ──────────────────────────────────────────
    const saveBase64 = (str, prefix) => {
      if (!str?.startsWith("data:image")) return "";
      const base64 = str.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const filename = `${prefix}-${Date.now()}.png`;
      fs.writeFileSync(path.join(uploadDir, filename), buffer);
      return `/uploads/setup/${filename}`;
    };

    const getFilePath = (field) => files[field]?.[0]?.filename
      ? `/uploads/setup/${files[field][0].filename}`
      : "";

    const profilePicPath = getFilePath("profilePicFile") || saveBase64(data.profilePic, "profile");
    const siteIconPath   = getFilePath("siteIconFile")   || saveBase64(data.siteIcon,   "icon");
    const siteLogoPath   = getFilePath("siteLogoFile")   || saveBase64(data.siteLogo,   "logo");

    // ── 3. Save config file FIRST (before DB) ──────────────────────────
    console.log("📁 Saving config file...");
    const { saveConfig } = require("../core/configManager");
    saveConfig({
      siteName, siteTagline, siteDescription, siteType, language,
      siteIcon: siteIconPath, siteLogo: siteLogoPath,
      contactEmail: contactEmail || email,
      social: { facebook: socialFacebook, twitter: socialTwitter, instagram: socialInstagram, linkedin: socialLinkedin },
      database: { type: dbType, name: dbName },
      settings: {
        timezone, dateFormat,
        postsPerPage: parseInt(postsPerPage) || 10,
        features: {
          comments: enableComments === "true",
          categories: enableCategories === "true",
          seo: enableSEO === "true",
          analytics: enableAnalytics === "true"
        },
        security: { twoFactorAuth: enable2FA === "true", autoBackups: enableBackups === "true" }
      },
      admin: { username, email, profilePicture: profilePicPath },
      version: "1.0.0-alpha",
      setupCompleted: true,
      setupDate: new Date().toISOString(),
      integrityKey: crypto.randomBytes(32).toString("hex")
    });
    console.log("✅ Config file saved");

    // ── 4. Connect to database & create models ─────────────────────────
    console.log("🔌 Connecting to database...");
    const { connectDB } = require("../core/connect-db");
    const models = await connectDB({ db_type: dbType, db_name: dbName, db_user: dbUser, db_pass: dbPass, db_host: dbHost, db_port: dbPort });
    const User = models.User;
    console.log("✅ Database connected & models ready");

    // ── 5. Create admin user (skip if already exists) ──────────────────
    let adminUser, authorId, controlKey;

    const existingUsers = await User.existsAny();
    if (existingUsers) {
      console.log("ℹ️  Admin user already exists, skipping user creation...");
      const existing = await User.findOne({ role: "admin" });
      if (existing) {
        adminUser = existing;
        authorId = existing.id || existing._id?.toString();
        controlKey = existing.controlKey;
      }
    }

    if (!adminUser) {
      console.log("👤 Creating admin user...");
      const hashedPassword = await hashPassword(password);
      adminUser = await User.create({
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        role: "admin",
        fullName: fullName || username,
        avatar: profilePicPath,
        bio, jobTitle, phone, location
      });
      authorId = adminUser.id || adminUser._id?.toString();
      controlKey = adminUser.controlKey;
    }

    if (!authorId) throw new Error("Failed to create admin user with valid ID");
    console.log(`✅ Admin user ready (ID: ${authorId})`);

    // ── 6. Create default content ──────────────────────────────────────
    console.log("📝 Creating default content...");
    const contentStats = await createDefaultContent(authorId, siteName);
    console.log(`✅ Content created: ${contentStats.categories?.length || 0} categories, ${contentStats.posts || 0} posts, ${contentStats.pages || 0} pages`);

    // ── 7. Generate auth token ─────────────────────────────────────────
    const token = jwt.sign(
      { id: authorId, username: adminUser.username || username, role: "admin" },
      SECRET,
      { expiresIn: "7d" }
    );

    console.log("🎉 Acroxa CMS Alpha setup completed successfully!");

    return res.json({
      success: true,
      message: "Account created! Redirecting to control key page...",
      token,
      controlKey,
      controlUrl: `/acroxa/token/control/${controlKey}`,
      user: {
        username: adminUser.username || username,
        email, role: "admin",
        profile: { fullName: fullName || username, profilePicture: profilePicPath }
      },
      site: { name: siteName, icon: siteIconPath, logo: siteLogoPath },
      content: {
        categories: contentStats.categories?.length || 4,
        posts: contentStats.posts || 1,
        pages: contentStats.pages || 1
      },
      version: "1.0.0-alpha"
    });

    // Trigger server restart so all routes are properly mounted
    setTimeout(() => {
      if (global.acrx?.restartServer) {
        console.log("🔄 Triggering server restart after setup...");
        global.acrx.restartServer();
      }
    }, 2000);
  } catch (err) {
    console.error("❌ Setup Failed:", err);
    return res.status(500).json({
      success: false,
      message: "Setup failed: " + err.message,
      error: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  router,
  upload,
  sendEmailCode,
  register,
  createUser,
  login,
  logoutUser,
  verifySession,
  updateProfile,
  checkFirstTime,
  renderSetupFirstUser,
  requestPasswordReset,
  resetPassword,
  firstUserSetupHandler,
  hashPassword,
  verifyPassword,
  createDefaultContent,
  // V2 control access
  handleControlEntry,
  handleControlVerify,
  registerPasskey,
  createPasskeyWithPassword,
  createRecoverySecret
};