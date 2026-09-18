// src/services/schedulerService.js
// Minimal scheduled-content publisher stub (restores missing module).
// Publishes posts/pages/landing pages whose publishAt has passed.
// Safe: idempotent, error-isolated, never throws out of startScheduler.

"use strict";

let _timer = null;
let _started = false;

async function _tick() {
  try {
    const { getConnection } = require("../core/connect-db");
    // getConnection() is synchronous (returns the connection object, never
    // a Promise) — use it like every other caller (dataLoader, RouteResolver).
    let conn = null;
    try { conn = getConnection(); } catch (_) { conn = null; }
    const models = (conn && conn.models) || global.models;
    if (!models) return;
    const now = new Date();
    for (const key of ["Post", "Page", "LandingPage"]) {
      const M = models[key];
      if (!M || typeof M.updateMany !== "function") continue;
      try {
        await M.updateMany(
          { status: { $in: ["scheduled", "draft"] }, publishAt: { $lte: now } },
          { $set: { status: "published" } }
        );
      } catch (_) {
        // Sequelize shape fallback — best effort, never crash scheduler.
        try {
          await M.updateMany?.({ status: "published" }, { where: { publishAt: { lte: now } } });
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn("[scheduler] tick failed:", err.message);
  }
}

function startScheduler({ intervalMs = 60_000 } = {}) {
  if (_started) return { started: true, intervalMs };
  _started = true;
  // Run once shortly after boot, then on interval. unref so it never blocks exit.
  setTimeout(_tick, 5_000);
  _timer = setInterval(_tick, intervalMs);
  if (_timer && typeof _timer.unref === "function") _timer.unref();
  console.log("⏰ Scheduler started (publishAt publisher)");
  return { started: true, intervalMs };
}

function stopScheduler() {
  if (_timer) clearInterval(_timer);
  _timer = null;
  _started = false;
}

module.exports = { startScheduler, stopScheduler };
