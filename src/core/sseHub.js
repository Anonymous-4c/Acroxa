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

function sseHandler(req, res) {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx: disable buffering

  // Send initial heartbeat so client knows connection is open
  res.write("event: connected\ndata: {}\n\n");

  const client = { res, id: Date.now() + Math.random() };
  clients.add(client);

  // Keep-alive ping every 25 s
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch (_) { _remove(client); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    _remove(client);
  });
}

// ── BROADCAST ─────────────────────────────────────────────────────────────────

function broadcast(eventName, data = {}) {
  if (!clients.size) return;

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

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
  return { connections: clients.size };
}

module.exports = { sseHandler, broadcast, status };