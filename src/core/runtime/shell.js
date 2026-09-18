// src/core/runtime/shell.js
//
// Persistent Acroxa runtime shell. Coordinates boot/registries/lifecycle/
// hooks/events/navigation/maintenance/errors/diagnostics WITHOUT becoming
// a god-object — each concern lives in its own module; shell only wires them.
//
//   const shell = require("./shell");
//   shell.init(global.acrx);   // idempotent, called once from index.js
//   shell.snapshot();          // diagnostics (real state only)
//   await shell.shutdown();    // deterministic teardown (tests/shutdown)

"use strict";

const registry = require("./registry");
const events = require("./events");
const lifecycle = require("./lifecycle");

let _inited = false;
let _bootedAt = null;
let _acrx = null;

function init(acrx) {
  if (_inited) return get();
  _acrx = acrx || null;
  _bootedAt = Date.now();
  _inited = true;

  registry.register({
    type: "module", owner: "core", name: "runtime-shell",
    version: "1.0.0", meta: { bootedAt: _bootedAt },
    dispose: null,
  });

  events.emit("module:loaded", { id: "core:runtime-shell", at: _bootedAt });
  return get();
}

function get() {
  return { inited: _inited, bootedAt: _bootedAt, acrx: _acrx, registry, events, lifecycle };
}

/**
 * Real runtime diagnostics snapshot. Every number comes from live state —
 * no fake counters (spec §50).
 */
function snapshot() {
  let layoutMeta = {};
  let changeId = 0;
  let activeLayout = null;
  try {
    const Layout = require("../layoutHelpers");
    activeLayout = Layout.getActiveLayout();
    layoutMeta = Layout.getActiveLayoutMeta() || {};
    changeId = (Layout.getState && Layout.getState().changeId) || 0;
  } catch (_) {}
  let sse = { connections: 0 };
  try { sse = require("../sseHub").status(); } catch (_) {}
  let runtime = { rev: 0, bootId: null, last: null };
  try { runtime = require("./revision").snapshot(); } catch (_) {}
  let graph = { resources: 0, edges: 0 };
  try { graph = require("./graph").stats(); } catch (_) {}
  let targets = { targets: 0 };
  try { targets = require("./targets").stats(); } catch (_) {}
  let logs = { enabled: false, connectedClients: 0, logsStored: 0 };
  try { logs = require("../logStream").status(); } catch (_) {}
  let perf = { stages: {} };
  try { perf = require("./perf").stats(); } catch (_) {}
  let extensions = { total: 0, enabled: 0, conflicts: 0 };
  let conflicts = [];
  try { extensions = require("./extensions").stats(); } catch (_) {}
  try { conflicts = require("./extensions").detectConflicts().slice(0, 20); } catch (_) {}
  // AcroxaJS Phase 10: render snapshot stats (live page/version/bytes).
  let snapshots = { pages: 0, versions: 0, bytes: 0 };
  try { snapshots = require("./render/snapshot").stats(); } catch (_) {}
  return {
    bootedAt: _bootedAt,
    uptimeMs: _bootedAt ? Date.now() - _bootedAt : 0,
    revision: runtime,
    registry: registry.stats(),
    events: events.stats(),
    layout: { active: activeLayout, changeId, hasMeta: !!Object.keys(layoutMeta).length },
    sse,
    graph,
    targets,
    logs,
    perf,
    extensions,
    conflicts,
    snapshots,
  };
}

async function shutdown() {
  events.emit("module:disposed", { id: "core:runtime-shell" });
  _inited = false;
  _bootedAt = null;
  _acrx = null;
}

module.exports = { init, get, snapshot, shutdown };
