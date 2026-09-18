// src/core/runtime/events.js
//
// Scoped, disposable event bus. Replaces ad-hoc global string events.
// Event names MUST be namespaced `domain:action` (e.g. `layout:changed`).
// Every `on()` returns a disposer; `disposeOwner()` removes all of an owner.

"use strict";

const listeners = new Map(); // event -> Set<{owner, cb, once}>
const byOwner = new Map();   // owner -> Set<{event, record}>

const NAME_RE = /^[a-z0-9_-]+:[a-z0-9_-]+$/i;

function _check(name) {
  if (!NAME_RE.test(name)) {
    throw new Error(`[events] event name must be "domain:action", got "${name}"`);
  }
}

function on(event, cb, owner = "core") {
  _check(event);
  if (typeof cb !== "function") throw new Error("[events] on() requires a callback");
  const record = { owner, cb, once: false };
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(record);
  if (!byOwner.has(owner)) byOwner.set(owner, new Set());
  byOwner.get(owner).add({ event, record });
  return () => off(event, cb);
}

function once(event, cb, owner = "core") {
  _check(event);
  if (typeof cb !== "function") throw new Error("[events] once() requires a callback");
  const record = { owner, cb, once: true };
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(record);
  if (!byOwner.has(owner)) byOwner.set(owner, new Set());
  byOwner.get(owner).add({ event, record });
  return () => off(event, cb);
}

function off(event, cb) {
  const set = listeners.get(event);
  if (!set) return false;
  let removed = false;
  for (const r of [...set]) {
    if (!cb || r.cb === cb) {
      set.delete(r);
      removed = true;
      const owned = byOwner.get(r.owner);
      if (owned) {
        for (const o of [...owned]) {
          if (o.event === event && o.record === r) owned.delete(o);
        }
        if (!owned.size) byOwner.delete(r.owner);
      }
    }
  }
  if (!set.size) listeners.delete(event);
  return removed;
}

function emit(event, payload) {
  _check(event);
  const set = listeners.get(event);
  if (!set || !set.size) return 0;
  let called = 0;
  for (const r of [...set]) {
    try {
      r.cb(payload, event);
      called++;
    } catch (err) {
      console.error(`[events] listener failed ${event} [${r.owner}]:`, err.message);
    }
    if (r.once) off(event, r.cb);
  }
  return called;
}

function disposeOwner(owner) {
  const owned = byOwner.get(owner);
  if (!owned) return 0;
  let n = 0;
  for (const { event, record } of [...owned]) {
    const set = listeners.get(event);
    if (set && set.delete(record)) n++;
    if (set && !set.size) listeners.delete(event);
  }
  byOwner.delete(owner);
  return n;
}

function stats() {
  const out = { events: listeners.size, listeners: 0, byEvent: {} };
  for (const [e, s] of listeners) {
    out.listeners += s.size;
    out.byEvent[e] = s.size;
  }
  return out;
}

module.exports = { on, once, off, emit, disposeOwner, stats };
