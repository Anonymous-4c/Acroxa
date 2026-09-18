// src/core/runtime/debug.js
// Staged server debug for the AcroxaJS runtime pipeline. Every stage of
// change detection -> render -> broadcast -> request handling logs one
// compact line, so a file-save can be traced end to end in the dev console:
//
//   [Acroxa:WATCH] change src/views/dashboard.js
//   [Acroxa:CLASSIFY] dashboard.js -> kind=view scope=view owner=core:views
//   [Acroxa:PLAN] view/view -> strategy=fragment-replace
//   [Acroxa:REBUILD] pages router ok (34 routes)
//   [Acroxa:INVALIDATE] v43 view src/views/dashboard.js (1 targets) strategy=fragment-replace
//   [Acroxa:SSE] broadcast runtime.invalidated v43 -> 2 client(s)
//   [Acroxa:RC] target=n/a file=dashboard.js -> REPLACE (1 affected, 2ms)
//
// Enablement: ACRX_DEBUG='*' (all) or comma list (watch,classify,plan,
// rebuild,invalidate,sse,rc,rr,rt,fragment,sync,ping,manifest,extensions).
// Dev default: ON (compact). Production default: OFF unless ACRX_DEBUG set.
// Never logs secrets, tokens, cookies, or full HTML (lengths only).

"use strict";

const STAGES = Object.freeze([
  "watch", "classify", "plan", "cache", "rebuild", "invalidate",
  "sse", "rc", "rr", "rt", "fragment", "sync", "ping", "manifest",
  "extensions", "graph", "error",
]);

let _allow = null; // null = not yet resolved

function _resolve() {
  if (_allow !== null) return _allow;
  const raw = process.env.ACRX_DEBUG;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const v = String(raw).trim().toLowerCase();
    if (v === "*" || v === "1" || v === "all" || v === "true") {
      _allow = new Set(STAGES);
    } else if (v === "0" || v === "off" || v === "false") {
      _allow = new Set();
    } else {
      _allow = new Set(v.split(",").map((s) => s.trim()).filter(Boolean));
    }
  } else if (process.env.NODE_ENV === "production") {
    _allow = new Set();
  } else {
    _allow = new Set(STAGES); // dev default: everything, compact
  }
  return _allow;
}

function on(stage) {
  try {
    return _resolve().has(String(stage || "").toLowerCase());
  } catch (_) {
    return false;
  }
}

// Test/dev hook: force a stage set without env restarts.
function _set(stages) {
  _allow = stages === null ? null : new Set(stages);
}

function _safe(v, max = 160) {
  let s;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch (_) {
    s = String(v);
  }
  if (s === undefined) return "?";
  s = String(s).replace(/[\r\n]+/g, " ");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// Redact anything credential-shaped from debug data.
function _scrub(obj) {
  try {
    const raw = JSON.stringify(obj);
    const clean = raw.replace(/("(?:password|passwd|secret|token|api[_-]?key|cookie|authorization|jwt)"\s*:\s*)"[^"]*"/gi, '$1"[redacted]"');
    return JSON.parse(clean);
  } catch (_) {
    return obj;
  }
}

function log(stage, msg, data) {
  if (!on(stage)) return;
  try {
    const tag = `[Acroxa:${String(stage).toUpperCase()}]`;
    if (data === undefined) console.log(tag, msg);
    else console.log(tag, msg, _safe(_scrub(data)));
  } catch (_) {}
}

// Time an async/sync step and log "<label> <ms>ms". Returns fn's result.
function timed(stage, label, fn) {
  const t0 = Date.now();
  const done = (extra) => {
    try {
      const ms = Date.now() - t0;
      log(stage, `${label} ${ms}ms${extra ? " " + extra : ""}`);
    } catch (_) {}
  };
  let out;
  try {
    out = fn();
  } catch (err) {
    done("ERROR " + ((err && err.message) || err));
    throw err;
  }
  if (out && typeof out.then === "function") {
    return out.then(
      (v) => { done(); return v; },
      (err) => { done("ERROR " + ((err && err.message) || err)); throw err; }
    );
  }
  done();
  return out;
}

module.exports = { STAGES, on, log, timed, _set, _resolve };
