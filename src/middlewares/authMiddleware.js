/* ../src/middlewares/authMiddleware.js */
const jwt = require("jsonwebtoken");
const { ensureSecret } = require("../core/secrets");
const SECRET = ensureSecret("JWT_SECRET", 32);
const { renderPage_401, renderPage_403, renderPage_404 } = require("../pages.js");
const { LOGIN_PATH } = require("../../config/generated-paths");
const { getResourceById } = require("../core/resourceResolver");
const rateMap = new Map(); // simple in-memory rate limiter (upgrade to Redis later)
const loginAttempts = new Map();
let _forceSignOutAt = null; // cached force-sign-out timestamp
let _settingsCache = null;  // cached settings for middleware reads
let _settingsCacheAt = 0;
const SETTINGS_CACHE_TTL = 30_000; // 30s

// Refresh the cached force-sign-out timestamp from DB (called periodically)
async function refreshForceSignOutTimestamp() {
  try {
    const { connectDB } = require("../core/connect-db");
    const models = await connectDB();
    const settings = await models.Settings.getSettings();
    _forceSignOutAt = settings?.security?.forceSignOutAt || null;
    _settingsCache = settings;
    _settingsCacheAt = Date.now();
  } catch (_) {}
}
// Refresh on startup and every 60 seconds
refreshForceSignOutTimestamp();
setInterval(refreshForceSignOutTimestamp, 60000);

async function getSettingsCached() {
  if (_settingsCache && Date.now() - _settingsCacheAt < SETTINGS_CACHE_TTL) {
    return _settingsCache;
  }
  try {
    const { connectDB } = require("../core/connect-db");
    const models = await connectDB();
    _settingsCache = await models.Settings.getSettings();
    _settingsCacheAt = Date.now();
  } catch (_) {}
  return _settingsCache;
}

// ── Maintenance mode page ──────────────────────────────────────────────
function renderMaintenancePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maintenance Mode · Acroxa CMS</title>
  <link rel="stylesheet" href="/acrx/assets/css/root.css">
  <link rel="stylesheet" href="/acrx/assets/css/all.css">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: var(--color-primary-100); font-family: 'Outfit', system-ui, sans-serif; padding: 2rem;
    }
    .card {
      max-width: 480px; width: 100%; text-align: center;
      background: linear-gradient(135deg, var(--accent-100) 0%, var(--color-primary-200) 100%);
      border-radius: 20px; padding: 3rem 2rem;
      border: 1px solid var(--color-primary-300); box-shadow: 0 12px 40px rgba(0,0,0,0.08);
    }
    .icon { width: 72px; height: 72px; margin: 0 auto 1.5rem; background: var(--accent-500);
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 32px; color: #fff; }
    h1 { font-size: 1.6rem; font-weight: 700; color: var(--color-primary-800); margin-bottom: 0.5rem; }
    p { font-size: 0.95rem; color: var(--color-primary-600); line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon"><i class="fa-solid fa-wrench"></i></div>
    <h1>We'll Be Right Back</h1>
    <p>This site is currently undergoing scheduled maintenance. Please check back soon.</p>
  </div>
</body>
</html>`;
}

// Get login path from config
const login = LOGIN_PATH || "/acroxa/login";

// ------------------- Inject Script -------------------
const injectTokenScript = `
<script class="auth-middleware">
  (async () => {
    // Skip check on public pages
    if (document.documentElement.hasAttribute("data-no-auth-redirect") ||
        document.getElementById("no-ref")) {
      document.body.classList.remove("hidden");
      return;
    }

    try {
      const res = await fetch("/acr/api/verify", {
        method: "GET",
        credentials: "include",           // sends auth_token cookie
        headers: {
          "Accept": "application/json"
        }
      });

      if (!res.ok) throw new Error("Not ok");

      const data = await res.json();

      if (data?.success === true) {
        document.body.classList.remove("hidden");
      } else {
        throw new Error("Success false");
      }
    } catch (err) {
      const returnUrl = encodeURIComponent(
        location.pathname + location.search + location.hash
      );
      const loginUrl = "${login}?acrx=" + returnUrl;

      location.href = loginUrl;
      // Optional: location.replace(loginUrl); // no history entry
    }
  })();
</script>
`;
// ------------------- 1️⃣ Page-level middleware -------------------

async function firewallMiddleware(req, res, next) {
  try {
    const rawIp =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      "unknown";

    const ip = rawIp.trim();
    const now = Date.now();

    const isLoginRoute = req.path.includes("login");
    const attemptKey = `${ip}:login`;

    // ─────────────────────────────
    // RATE LIMIT (settings-aware)
    // ─────────────────────────────
    const windowMs = 60 * 1000;
    const maxRequests = await getEffectiveRateLimit(isLoginRoute);

    if (!rateMap.has(ip)) rateMap.set(ip, []);

    const timestamps = rateMap.get(ip);
    const recent = timestamps.filter(t => now - t < windowMs);

    recent.push(now);
    rateMap.set(ip, recent);

    if (recent.length > maxRequests) {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please wait."
      });
    }

    // ─────────────────────────────
    // LOGIN ATTEMPT TRACKING
    // ─────────────────────────────
    if (isLoginRoute) {
      const attempts = loginAttempts.get(attemptKey) || 0;
      loginAttempts.set(attemptKey, attempts + 1);
    }

    const attempts = loginAttempts.get(attemptKey) || 0;

    // ─────────────────────────────
    // SCORING SYSTEM
    // ─────────────────────────────
    const userAgent = req.headers["user-agent"] || "";
    let score = 100;

    if (!req.headers["accept"]) score -= 5;
    if (!req.headers["accept-language"]) score -= 5;
    if (!userAgent) score -= 10;

    if (/bot|crawler|spider|curl|wget/i.test(userAgent)) {
      score -= 30;
    }

    if (recent.length > 8) score -= 10;

    // progressive login strictness
    if (isLoginRoute) {
      score += 10;

      if (attempts > 3) score -= 10;
      if (attempts > 5) score -= 20;
      if (attempts > 8) score -= 40;
    }

    // ─────────────────────────────
    // DECISION ENGINE
    // ─────────────────────────────
    if (score < 30 || (isLoginRoute && attempts > 10)) {
      return res.status(403).json({
        success: false,
        message: "Security lock triggered"
      });
    }

    if (score < 55) {
      req.firewallPassed = false;
      req.firewallScore = score;
      req.loginAttempts = attempts;

      return res.status(429).json({
        success: false,
        message: "Verification required"
      });
    }

    req.firewallPassed = true;
    req.firewallScore = score;
    req.clientIp = ip;
    req.loginAttempts = attempts;

    next();

  } catch (err) {
    console.error("Firewall error:", err);

    return res.status(500).json({
      success: false,
      message: "Firewall error"
    });
  }
}


function attachAuthScript(req, res, next) {
  res.locals.injectTokenScript = injectTokenScript;
  next();
}
/**
 * Gate a route on the caller's role.
 *
 * Accepts either form so existing call sites keep working:
 *   requireRoles(["admin", "editor"])   preferred
 *   requireRoles("admin", "editor")     varargs
 *
 * Previously a varargs call made `allowedRoles` the STRING "admin", so the
 * check became `"admin".includes(role)` — a substring test that silently
 * rejected every other role (and would wrongly admit a role like "min").
 * Normalising here fixes every call site at once.
 */
function requireRoles(...args) {
  const allowedRoles = Array.isArray(args[0]) ? args[0] : args.filter(Boolean);

  return (req, res, next) => {
    if (allowedRoles.length === 0) return next();

    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).send(renderPage_403());
    }
    next();
  };
}

function checkOwnership(resourceKey = "post", idParam = "id") {
  return async (req, res, next) => {
    try {
      if (req.user.role !== "author") return next();

      const id = req.params[idParam];

      const resource = await getResourceById(resourceKey, id);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: "Not found",
        });
      }

      const authorId =
        resource.author?.id ||
        resource.author?._id ||
        resource.author;

      if (String(authorId) !== String(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: not your resource",
        });
      }

      req.resource = resource; // reuse later
      next();
    } catch (err) {
      console.error("Ownership error:", err);
      res.status(500).json({
        success: false,
        message: "Ownership check failed",
      });
    }
  };
}

// ------------------- 2️⃣ API-level protection -------------------
function verifyAPIToken(req, res, next) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }

  const tokenMatch = cookieHeader.match(/auth_token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }

  try {
    const decoded = jwt.verify(token, SECRET);

    // Check if this token was issued before a force-sign-out event
    if (decoded.iat && _forceSignOutAt && decoded.iat * 1000 < new Date(_forceSignOutAt).getTime()) {
      return res.status(401).json({ success: false, message: "Session invalidated. Please log in again." });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}
function attachAuthId(req, res, next) {
  const cookieHeader = req.headers.cookie;

  let authId = null;

  if (cookieHeader) {
    const tokenMatch = cookieHeader.match(/auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (token) {
      try {
        const decoded = jwt.verify(token, SECRET);
        authId = decoded.id || decoded._id || null;
        req.user = decoded; 
      } catch {
        authId = null;
      }
    }
  }

  req.authId = authId; 
  next();
}
const verifyToken = (req) => {
  try {
    const cookieHeader = req.headers.cookie;

    if (!cookieHeader) {
      const error = new Error("No authentication cookie found");
      error.status = 401;
      throw error;
    }

    const tokenMatch = cookieHeader.match(/auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) {
      const error = new Error("No auth_token found in cookies");
      error.status = 401;
      throw error;
    }

    const decoded = jwt.verify(token, SECRET);
    return decoded;

  } catch (err) {
    console.error("verifyToken error:", err.message);

    if (err.name === "TokenExpiredError") {
      const error = new Error("Session expired. Please login again.");
      error.status = 401;
      throw error;
    }

    if (err.name === "JsonWebTokenError") {
      const error = new Error("Invalid token");
      error.status = 403;
      throw error;
    }

    // Re-throw with status
    if (!err.status) err.status = 401;
    throw err;
  }
};

// ------------------- 3️⃣ V2 Control Session -------------------
/**
 * requireControlSession
 *
 * Guards the /acr/api/login route (Step 4 of the V2 auth flow).
 * Validates the HttpOnly control_session cookie that was set after
 * a successful WebAuthn passkey verification in Step 2.
 *
 * Returns 404 on any failure — not 401 — so the login endpoint
 * reveals nothing about its own existence to unauthenticated callers.
 */
function requireControlSession(req, res, next) {
  const cookieHeader = req.headers.cookie || "";

  const match = cookieHeader.match(/control_session=([^;]+)/);
  const token = match ? match[1] : null;

  if (!token) {
    return res.status(404).send(global.currentLayoutEngine.render404() || `<h1>404 Page Not Found</h1>`);
  }

  try {
    const decoded = jwt.verify(token, SECRET);

    // Must be the correct token type
    if (decoded.type !== "control_session") {
      return res.status(404).send(global.currentLayoutEngine.render404() || `<h1>404 Page Not Found</h1>`);
    }

    // Attach so login() can read it if needed
    req.controlSessionValid = true;
    req.controlUserId = decoded.userId;

    next();
  } catch {
    // Expired or tampered — still 404
    return res.status(404).send(global.currentLayoutEngine.render404() || `<h1>404 Page Not Found</h1>`);
  }
}

// ── 4️⃣ Maintenance Mode Middleware ─────────────────────────────────────
// Blocks public/visitor pages when maintenance mode is enabled.
// Admin panel (/acrx/*), API routes, assets, and setup routes are always allowed.
async function maintenanceMiddleware(req, res, next) {
  try {
    const settings = await getSettingsCached();
    if (!settings?.system?.maintenanceMode) return next();

    const url = req.originalUrl || req.url;

    // Always allow: API, assets, admin panel, setup, login, control pages
    if (
      url.startsWith("/acr/api/") ||
      url.startsWith("/acrx/") ||
      url.startsWith("/acrx") ||
      url.startsWith("/acroxa/") ||
      url.startsWith("/acrx/assets/") ||
      url.startsWith("/uploads/") ||
      url.startsWith("/layouts/")
    ) {
      return next();
    }

    // Non-admin: show maintenance page for public-facing routes
    return res.status(503).send(renderMaintenancePage());
  } catch (_) {
    next();
  }
}

// ── 5️⃣ CORS Middleware ────────────────────────────────────────────────
// Applies CORS headers based on settings.security.corsOrigins
async function corsMiddleware(req, res, next) {
  try {
    const settings = await getSettingsCached();
    const origins = settings?.security?.corsOrigins;

    if (!origins || (Array.isArray(origins) && origins.length === 0)) {
      return next();
    }

    const origin = req.headers.origin;
    const allowed = Array.isArray(origins) ? origins : String(origins).split(",").map(s => s.trim());

    if (allowed.includes("*") || allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin || "*");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      res.setHeader("Access-Control-Max-Age", "86400");

      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
    }
  } catch (_) {}
  next();
}

// ── 6️⃣ Rate Limiter (settings-aware) ──────────────────────────────────
// Overrides the hardcoded rate limit with the value from settings
async function getEffectiveRateLimit(isLoginRoute) {
  try {
    const settings = await getSettingsCached();
    const configured = parseInt(settings?.api?.apiRateLimit) || 100;
    return isLoginRoute ? 20 : configured;
  } catch (_) {
    return isLoginRoute ? 20 : 10;
  }
}

module.exports = {
  attachAuthScript,
  verifyAPIToken,
  verifyToken,
  requireRoles,
  checkOwnership,
  attachAuthId,
  firewallMiddleware,
  requireControlSession,
  refreshForceSignOutTimestamp,
  maintenanceMiddleware,
  corsMiddleware,
  getEffectiveRateLimit,
  getSettingsCached,
};