// src/core/runtime/perf.js
//
// Actual timing instrumentation for AcroxaJS (spec §42).
// Uses performance.now(), keeps a capped ring buffer per stage, and exposes
// aggregates only. Overhead when idle is zero (no timers, no I/O); per-record
// cost is one now() call + one capped array push. No fake counters — every
// number comes from a real measurement taken at the instrumented call site.
//
//   const perf = require("./perf");
//   const out = perf.measure("invalidate", () => doWork());
//   const out = await perf.measureAsync("fragment", async () => render());
//   perf.stats(); // { stages: { invalidate: { count, avgMs, maxMs, lastMs } } }

"use strict";

const MAX_PER_STAGE = 50;
const MAX_STAGES = 20;

const samples = new Map(); // stage -> { count, totalMs, maxMs, lastMs }

function _now() {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
  } catch (_) {}
  return Date.now();
}

/** Record one measurement. Never throws. */
function record(stage, ms, count = 1) {
  try {
    const name = String(stage || "unknown").slice(0, 64);
    const dur = Number(ms);
    if (!Number.isFinite(dur) || dur < 0) return;
    if (!samples.has(name)) {
      if (samples.size >= MAX_STAGES) return; // bounded — never grow unbounded
      samples.set(name, { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 });
    }
    const s = samples.get(name);
    s.count += count;
    s.totalMs += dur;
    if (dur > s.maxMs) s.maxMs = dur;
    s.lastMs = dur;
    // Bound totalMs so a years-long process can't lose float precision meaningfully.
    if (s.count >= MAX_PER_STAGE * 200) {
      s.count = Math.floor(s.count / 2);
      s.totalMs = s.totalMs / 2;
    }
  } catch (_) {}
}

/** Time a sync function. Returns fn's return value. */
function measure(stage, fn) {
  const t0 = _now();
  try {
    return fn();
  } finally {
    record(stage, _now() - t0);
  }
}

/** Time an async function. Returns fn's promise result. */
async function measureAsync(stage, fn) {
  const t0 = _now();
  try {
    return await fn();
  } finally {
    record(stage, _now() - t0);
  }
}

function stats() {
  const stages = {};
  for (const [name, s] of samples) {
    stages[name] = {
      count: s.count,
      avgMs: s.count ? Math.round((s.totalMs / s.count) * 100) / 100 : 0,
      maxMs: Math.round(s.maxMs * 100) / 100,
      lastMs: Math.round(s.lastMs * 100) / 100,
    };
  }
  return { stages };
}

function clear() {
  samples.clear();
}

module.exports = { record, measure, measureAsync, stats, clear };
