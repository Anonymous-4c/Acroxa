// src/routes/api.js
//
// Mounts the hot-reloadable API router proxy ONCE.
// Re-exports reloadRoutes() so an admin controller can trigger it.

const express = require("express");
const router  = express.Router();

const { loadRoutes, reloadRoutes } = require("../core/loadRoutes");

// Mount the proxy router once — all hot-reload logic lives inside loadRoutes.js
router.use("/", loadRoutes());

// Re-export reloadRoutes so other modules (e.g. an admin API endpoint) can call it.
// Usage in an admin route:
//
//   const { reloadRoutes } = require("../routes/api");
//   router.post("/admin/reload-routes", verifyAPIToken, requireRoles(["admin"]), (req, res) => {
//     const result = reloadRoutes();
//     res.json(result);
//   });
//
module.exports = router;
module.exports.reloadRoutes = reloadRoutes;