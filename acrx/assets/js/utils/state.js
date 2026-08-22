/**
 * state.js — Acroxa Pure State Engine
 *
 * 100% UI-agnostic reactive state engine.
 * No DOM, no CSS, no event listeners, no editor logic.
 * Reusable for any module across the application.
 *
 * Usage:
 *   import { State } from './utils/state.js';
 *   import State from './utils/state.js';        // default also works
 */

// ─── Internal Storage ─────────────────────────────────────────────────────────

const _stores  = new Map();       // name → state object
const _watchers = new Map();      // path → Set<callback>
let   _batchDepth = 0;
let   _pendingNotifications = new Set();

// ─── Path Utilities ───────────────────────────────────────────────────────────

function _splitPath(path) {
  return path.split('.');
}

function _getAt(obj, segments) {
  let cursor = obj;
  for (const seg of segments) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = cursor[seg];
  }
  return cursor;
}

function _setAt(obj, segments, value) {
  if (segments.length === 0) return value;
  const [head, ...tail] = segments;
  const base = (obj != null && typeof obj === 'object') ? obj : {};
  return { ...base, [head]: _setAt(base[head], tail, value) };
}

function _diffPaths(prev, next, prefix = '') {
  const changed = new Set();
  const allKeys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const a = prev?.[key];
    const b = next?.[key];

    if (a !== b) {
      changed.add(path);
      if (a && b && typeof a === 'object' && typeof b === 'object') {
        for (const sub of _diffPaths(a, b, path)) changed.add(sub);
      }
    }
  }

  return changed;
}

// ─── Notification Engine ──────────────────────────────────────────────────────

function _resolveValue(path) {
  const [name, ...rest] = _splitPath(path);
  const store = _stores.get(name);
  if (!store) return undefined;
  return rest.length === 0 ? store : _getAt(store, rest);
}

function _flush(paths) {
  for (const path of paths) {
    const callbacks = _watchers.get(path);
    if (!callbacks) continue;
    const value = _resolveValue(path);
    for (const cb of callbacks) {
      try { cb(value, path); } catch (e) { console.error('[State] watcher error:', e); }
    }
  }
}

function _queueNotify(path) {
  if (_batchDepth > 0) {
    _pendingNotifications.add(path);
  } else {
    _flush(new Set([path]));
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a named state store with an initial state object.
 */
export function create(name, initialState = {}) {
  if (_stores.has(name)) {
    throw new Error(`[State] store "${name}" already exists. Use patch() to update.`);
  }
  _stores.set(name, { ...initialState });
  return State;
}

/**
 * Return a shallow copy of the raw state object for a store.
 */
export function get(name) {
  const store = _stores.get(name);
  return store ? { ...store } : undefined;
}

/**
 * Read a value at a dot-path: State.value("editor.leftSidebar")
 */
export function value(path) {
  return _resolveValue(path);
}

/**
 * Set a value at a dot-path: State.set("editor.leftSidebar", true)
 */
export function set(path, val) {
  const [name, ...rest] = _splitPath(path);

  if (!_stores.has(name)) {
    throw new Error(`[State] store "${name}" does not exist.`);
  }

  const prev = _stores.get(name);

  _stores.set(name, rest.length === 0 ? { ...val } : _setAt(prev, rest, val));

  // Notify the exact path and all ancestor paths
  _queueNotify(path);
  let ancestor = name;
  _queueNotify(ancestor);
  for (const seg of rest.slice(0, -1)) {
    ancestor += `.${seg}`;
    _queueNotify(ancestor);
  }

  return State;
}

/**
 * Shallow-merge values into a named store.
 * State.patch("editor", { leftSidebar: true, rightSidebar: false })
 */
export function patch(name, values = {}) {
  if (!_stores.has(name)) {
    throw new Error(`[State] store "${name}" does not exist.`);
  }

  const prev = _stores.get(name);
  const next = { ...prev, ...values };
  _stores.set(name, next);

  _queueNotify(name);
  for (const p of _diffPaths(prev, next, name)) _queueNotify(p);

  return State;
}

/**
 * Subscribe to changes at a dot-path.
 * Callback receives (newValue, path).
 * Returns an unsubscribe function.
 *
 *   const off = State.watch("editor.leftSidebar", val => console.log(val));
 *   off(); // unsubscribe
 */
export function watch(path, callback) {
  if (typeof callback !== 'function') {
    throw new Error('[State] watch() requires a callback function.');
  }
  if (!_watchers.has(path)) _watchers.set(path, new Set());
  _watchers.get(path).add(callback);
  return () => unwatch(path, callback);
}

/**
 * Remove a specific watcher, or all watchers for a path.
 */
export function unwatch(path, callback) {
  if (!_watchers.has(path)) return State;
  if (callback) {
    _watchers.get(path).delete(callback);
  } else {
    _watchers.delete(path);
  }
  return State;
}

/**
 * Delete a store and all its watchers.
 */
export function remove(name) {
  _stores.delete(name);
  for (const path of _watchers.keys()) {
    if (path === name || path.startsWith(`${name}.`)) _watchers.delete(path);
  }
  return State;
}

/**
 * Check if a named store exists.
 */
export function has(name) {
  return _stores.has(name);
}

/**
 * Batch multiple updates so watchers fire once after the block.
 *
 *   State.batch(() => {
 *     State.set("editor.leftSidebar", true);
 *     State.set("editor.leftPanel", "layers");
 *   });
 */
export function batch(fn) {
  _batchDepth++;
  try {
    fn();
  } finally {
    _batchDepth--;
    if (_batchDepth === 0 && _pendingNotifications.size > 0) {
      const pending = new Set(_pendingNotifications);
      _pendingNotifications.clear();
      _flush(pending);
    }
  }
  return State;
}

// ─── Namespace object (for default import) ────────────────────────────────────

const State = { create, get, value, set, patch, watch, unwatch, remove, has, batch };

export default State;