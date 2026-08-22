// src/routes/menuRoutes.js

const express = require("express");
const router  = express.Router();
const { verifyAPIToken } = require("../middlewares/authMiddleware");
const ctrl = require("../controllers/menuController");

const PREFIX = "/menus";

// ── Slot management (before /:id to avoid conflicts) ─────────────────────────

// GET  /acr/api/menus/slots?layoutId=nova-nexus
router.get("/slots", verifyAPIToken, ctrl.getSlots);

// POST /acr/api/menus/slots/assign   { slot, menuId, layoutId? }
router.post("/slots/assign", verifyAPIToken, ctrl.assignMenuToSlot);

// GET  /acr/api/menus/by-slot?slot=primary&layoutId=nova-nexus
router.get("/by-slot", verifyAPIToken, ctrl.getMenuBySlot);

// ── CRUD ──────────────────────────────────────────────────────────────────────

// GET  /acr/api/menus?layoutId=nova-nexus
router.get("/",    verifyAPIToken, ctrl.getMenus);

// POST /acr/api/menus
router.post("/",   verifyAPIToken, ctrl.createMenu);

// GET  /acr/api/menus/:id
router.get("/:id", verifyAPIToken, ctrl.getMenu);

// PUT  /acr/api/menus/:id
router.put("/:id", verifyAPIToken, ctrl.updateMenu);

// DELETE /acr/api/menus/:id
router.delete("/:id", verifyAPIToken, ctrl.deleteMenu);

// ── Slot assignment per menu ──────────────────────────────────────────────────

// POST /acr/api/menus/:id/assign   { slot }
router.post("/:id/assign",   verifyAPIToken, ctrl.assignSlot);

// POST /acr/api/menus/:id/unassign { slot }
router.post("/:id/unassign", verifyAPIToken, ctrl.unassignSlot);

module.exports = router;
module.exports.PREFIX = PREFIX;