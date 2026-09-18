// acrx/assets/js/scheduler.js — batched rendering scheduler (admin runtime).
// Batches synchronous state bursts into one coherent pass (spec §19).
// Priority: micro (default, fastest) → frame (rAF, paint-aligned) → idle.
// Real counters only (no fake stats): scheduled / coalesced / flushed.

(function SchedulerModule() {
  'use strict';

  const queues = { micro: new Set(), frame: new Set(), idle: new Set() };
  const stats = { scheduled: 0, coalesced: 0, flushed: 0 };
  let microQueued = false;
  let frameQueued = false;
  let idleQueued = false;

  function _flushSet(set) {
    const fns = [...set];
    set.clear();
    for (const fn of fns) {
      try {
        fn();
        stats.flushed++;
      } catch (e) {
        console.error('[AcroxaScheduler] task failed:', e);
      }
    }
  }

  function _flushMicro() {
    microQueued = false;
    _flushSet(queues.micro);
  }

  function _flushFrame() {
    frameQueued = false;
    // Micro tasks first so frame work sees settled state.
    if (queues.micro.size) _flushSet(queues.micro);
    _flushSet(queues.frame);
  }

  function _flushIdle() {
    idleQueued = false;
    if (queues.micro.size) _flushSet(queues.micro);
    _flushSet(queues.idle);
  }

  /**
   * Schedule fn. Same fn reference scheduled twice before flush coalesces.
   * Returns a cancel function.
   */
  function schedule(fn, opts) {
    if (typeof fn !== 'function') throw new Error('[AcroxaScheduler] schedule requires a function');
    const priority = (opts && opts.priority) || 'micro';
    const q = queues[priority] || queues.micro;
    stats.scheduled++;
    if (q.has(fn)) {
      stats.coalesced++;
      return () => q.delete(fn);
    }
    q.add(fn);
    if (priority === 'frame') {
      if (!frameQueued) {
        frameQueued = true;
        (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(_flushFrame, 16);
      }
    } else if (priority === 'idle') {
      if (!idleQueued) {
        idleQueued = true;
        if (typeof requestIdleCallback === 'function') requestIdleCallback(_flushIdle, { timeout: 200 });
        else setTimeout(_flushIdle, 32);
      }
    } else {
      if (!microQueued) {
        microQueued = true;
        Promise.resolve().then(_flushMicro);
      }
    }
    return () => q.delete(fn);
  }

  /** Run fn with micro-task batching (mirrors State.batch for non-state work). */
  function batch(fn) {
    let result;
    let depth = 0;
    depth++;
    try {
      result = fn();
    } finally {
      depth--;
      if (depth === 0 && queues.micro.size && !microQueued) {
        microQueued = true;
        Promise.resolve().then(_flushMicro);
      }
    }
    return result;
  }

  function getStats() {
    return {
      scheduled: stats.scheduled,
      coalesced: stats.coalesced,
      flushed: stats.flushed,
      pending: queues.micro.size + queues.frame.size + queues.idle.size,
    };
  }

  const api = { schedule, batch, getStats };
  if (typeof window !== 'undefined') window.AcroxaScheduler = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
