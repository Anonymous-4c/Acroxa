/* ../src/middlewares/firstUserRedirect.js */
const { getConnection } = require("../core/connect-db");
const conn = getConnection();

const User = conn.models?.User || conn.User;

async function firstUserRedirect(req, res, next) {
  try {
    const anyUser = await User.exists({});
    // If no user exists, redirect to first-time registration page
    if (!anyUser && req.path !== "/acr/api/setup-first-user" && !req.path.startsWith("/acrx/assets/") && !req.path.startsWith("/acr/api")) {
      return res.redirect("/acr/api/setup-first-user");
    }
    next();
  } catch (err) {
    console.error("FirstUserRedirect Error:", err);
    next();
  }
}

module.exports = firstUserRedirect;
