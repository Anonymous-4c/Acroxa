// src/core/sseHub.js
//
// Server-Sent Events hub for the customizer's live reload system.
// The customizer subscribes to GET /acrx/api/layouts/sse and receives
// named events when content, settings, or layouts change.
//
//   const sseHub = require('../core/sseHub');
//   sseHub.broadcast('layout.updated', { layoutId: 'nova-nexus' });
//   sseHub.broadcast('page.updated',   { slug: 'about' });
//   sseHub.broadcast('settings.updated', { section: 'homepage' });

const clients = new Set();

// ── MIDDLEWARE: establish SSE connection ──────────────────────────────────────

const MAX_CLIENTS = 200;
const EVENT_RE = /^[a-z0-9.:_-]+$/i;

function sseHandler(req, res) {
  if (clients.size >= MAX_CLIENTS) {
    try { res.status(429).json({ success: false, message: "too many runtime listeners" }); } catch (_) {}
    return;
  }
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx: disable buffering
  try { req.setTimeout(65000); } catch (_) {}

  let rev = 0;
  let bootId = null;
  try {
    const revision = require("./runtime/revision");
    rev = revision.get();
    bootId = revision.bootId();
  } catch (_) {}

  // Named connected event carries rev so clients can resync immediately.
  res.write(`event: connected\ndata: ${JSON.stringify({ rev, bootId, at: Date.now() })}\n\n`);

  const client = { res, id: Date.now() + Math.random(), connectedAt: Date.now() };
  clients.add(client);
  try { require("./runtime/debug").log("sse", `client connected (${clients.size} total) rev=${rev}`); } catch (_) {}

  // Visible heartbeat every 25 s (client resets its stale timer on ping).
  const ping = setInterval(() => {
    try {
      let r = 0;
      let b = null;
      try {
        const revision = require("./runtime/revision");
        r = revision.get();
        b = revision.bootId();
      } catch (_) {}
      res.write(`event: ping\ndata: ${JSON.stringify({ rev: r, bootId: b, at: Date.now() })}\n\n`);
    } catch (_) { _remove(client); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    _remove(client);
  });
}

// ── BROADCAST ─────────────────────────────────────────────────────────────────

function broadcast(eventName, data = {}) {
  if (!clients.size) {
    try { require("./runtime/debug").log("sse", `broadcast ${eventName} dropped (0 clients)`); } catch (_) {}
    return;
  }
  if (typeof eventName !== "string" || !EVENT_RE.test(eventName) || eventName.length > 64) return;
  try {
    const dbg = require("./runtime/debug");
    const extra = data && typeof data.v === "number" ? ` v${data.v}` : "";
    const tg = Array.isArray(data && data.targets) ? ` ${(data.targets || []).length} target(s)` : "";
    dbg.log("sse", `broadcast ${eventName}${extra}${tg} -> ${clients.size} client(s)`);
  } catch (_) {}

  let payload;
  try {
    payload = `event: ${eventName}\ndata: ${JSON.stringify(data).slice(0, 50000)}\n\n`;
  } catch (_) { return; }

  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch (_) {
      _remove(client);
    }
  }
}

function _remove(client) {
  clients.delete(client);
}

// ── STATUS ────────────────────────────────────────────────────────────────────

function status() {
  let rev = 0;
  let bootId = null;
  try {
    const revision = require("./runtime/revision");
    rev = revision.get();
    bootId = revision.bootId();
  } catch (_) {}
  return { connections: clients.size, rev, bootId };
}

module.exports = { sseHandler, broadcast, status };