// src/routes/backupRoutes.js

const express = require("express");
const router  = express.Router();

const { verifyAPIToken, requireRoles } = require("../middlewares/authMiddleware");
const {
  exportBackup,
  importBackup,
  getBackupHistory,
  deleteBackup,
  downloadSavedBackup,
  getPolicy,
  updatePolicy,
  triggerManualBackup,

  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,

  listJobs,
  createJob,
  updateJob,
  deleteJob,
} = require("../controllers/backupController");

const PREFIX = "/system/backups";

const adminOnly = [verifyAPIToken, requireRoles("admin")];

// ── History & file management ─────────────────────────────────────────────────
router.get    ("/",                    adminOnly, getBackupHistory);
router.get    ("/export",              adminOnly, exportBackup);           // live export + download
router.get    ("/download/:filename",  adminOnly, downloadSavedBackup);    // re-download saved file
router.delete ("/:filename",           adminOnly, deleteBackup);

// ── Restore ───────────────────────────────────────────────────────────────────
// Expects: Content-Type: application/json  (raw backup JSON body)
router.post   ("/import",              adminOnly, importBackup);

// ── Manual trigger ────────────────────────────────────────────────────────────
// Body: { targets: ["local", "git", "cloud"] }
router.post   ("/run",                 adminOnly, triggerManualBackup);

// ── Backup policy (schedule / targets / git) ─────────────────────────────────
router.get    ("/policy",              adminOnly, getPolicy);
router.patch  ("/policy",              adminOnly, updatePolicy);

// ── Cloud connections CRUD ────────────────────────────────────────────────────
router.get    ("/connections",         adminOnly, listConnections);
router.post   ("/connections",         adminOnly, createConnection);
router.patch  ("/connections/:id",     adminOnly, updateConnection);
router.delete ("/connections/:id",     adminOnly, deleteConnection);
router.post   ("/connections/test",    adminOnly, testConnection);

// ── Cloud backup jobs CRUD ────────────────────────────────────────────────────
router.get    ("/jobs",                adminOnly, listJobs);
router.post   ("/jobs",                adminOnly, createJob);
router.patch  ("/jobs/:id",            adminOnly, updateJob);
router.delete ("/jobs/:id",            adminOnly, deleteJob);

module.exports = router;
module.exports.PREFIX = PREFIX;
