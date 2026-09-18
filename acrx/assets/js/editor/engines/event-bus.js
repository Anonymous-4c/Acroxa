// acrx/assets/js/editor/engines/event-bus.js
//
// ENGINE 44 — Event Bus Engine (headless foundation).
// Central, UI-free pub/sub for all engines: subscribe, unsubscribe, emit,
// namespaces (colon-separated), single-segment wildcards ("doc:*"), once,
// cancelable guards (shouldRun), isolated listener errors.

export const EVENT_BUS_VERSION = "1.0.0";
export const ENGINE_ID = "event-bus";

function matchPattern(pattern, event) {
  if (pattern === event) return true;
  const p = pattern.split(":");
  const e = event.split(":");
  if (p.length !== e.length) return false;
  for (let i = 0; i < p.length; i++) {
    if (p[i] !== "*" && p[i] !== e[i]) return false;
  }
  return true;
}

export function createEventBus(options = {}) {
  const maxListeners = options.maxListeners || 0; // 0 = unlimited
  const subs = new Map(); // pattern -> Array<{cb, once}>
  let onError = null;
  let destroyed = false;

  function assertLive(operation) {
    if (destroyed) throw engineError(operation, "Event bus is destroyed.");
  }

  function engineError(operation, message) {
    const err = new Error(message);
    err.name = "EventBusError";
    err.code = "EVENT_BUS_ERROR";
    err.engine = ENGINE_ID;
    err.operation = operation;
    return err;
  }

  function report(pattern, err) {
    if (typeof onError === "function") {
      try { onError({ pattern, error: err }); } catch { /* never propagate */ }
      return;
    }
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error(`[event-bus] listener for "${pattern}" threw:`, err);
    }
  }

  const bus = {
    get engine() { return ENGINE_ID; },
    get version() { return EVENT_BUS_VERSION; },

    on(pattern, callback, opts = {}) {
      assertLive("on");
      if (typeof pattern !== "string" || pattern === "") {
        throw engineError("on", "Event pattern must be a non-empty string.");
      }
      if (typeof callback !== "function") throw engineError("on", "Listener must be a function.");
      let list = subs.get(pattern);
      if (!list) { list = []; subs.set(pattern, list); }
      if (maxListeners > 0 && list.length >= maxListeners) {
        throw engineError("on", `Max listeners (${maxListeners}) exceeded for "${pattern}".`);
      }
      list.push({ cb: callback, once: !!opts.once });
      return () => bus.off(pattern, callback);
    },

    once(pattern, callback) {
      return bus.on(pattern, callback, { once: true });
    },

    off(pattern, callback) {
      if (pattern === undefined) { subs.clear(); return; }
      const list = subs.get(pattern);
      if (!list) return;
      if (!callback) { subs.delete(pattern); return; }
      const idx = list.findIndex((s) => s.cb === callback);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) subs.delete(pattern);
    },

    emit(event, payload = {}) {
      assertLive("emit");
      if (typeof event !== "string" || event === "") {
        throw engineError("emit", "Event name must be a non-empty string.");
      }
      const ctx = {
        engine: ENGINE_ID,
        event,
        prevented: false,
        propagationStopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        ...payload,
      };
      // Snapshot matches first: listeners may subscribe/unsubscribe mid-emit.
      const matched = [];
      for (const [pattern, list] of subs) {
        if (matchPattern(pattern, event)) {
          for (const sub of [...list]) matched.push({ pattern, sub });
        }
      }
      for (const { pattern, sub } of matched) {
        if (ctx.propagationStopped) break;
        if (sub.once) bus.off(pattern, sub.cb);
        try {
          sub.cb(ctx);
        } catch (err) {
          report(pattern, err);
        }
      }
      return ctx;
    },

    // Cancelable guard: true when no listener called preventDefault().
    shouldRun(event, payload = {}) {
      return !bus.emit(event, payload).prevented;
    },

    waitFor(event, opts = {}) {
      assertLive("waitFor");
      const timeout = opts.timeout || 0;
      return new Promise((resolve, reject) => {
        let timer = null;
        const off = bus.on(event, (ctx) => {
          if (timer) clearTimeout(timer);
          off();
          resolve(ctx);
        });
        if (timeout > 0) {
          timer = setTimeout(() => {
            off();
            const err = engineError("waitFor", `Timed out waiting for "${event}".`);
            err.code = "EVENT_TIMEOUT";
            reject(err);
          }, timeout);
        }
      });
    },

    listenerCount(pattern) {
      if (pattern === undefined) {
        let n = 0;
        for (const list of subs.values()) n += list.length;
        return n;
      }
      return subs.get(pattern) ? subs.get(pattern).length : 0;
    },

    eventNames() {
      return [...subs.keys()];
    },

    setErrorHandler(fn) {
      onError = typeof fn === "function" ? fn : null;
    },

    clear() {
      subs.clear();
    },

    destroy() {
      subs.clear();
      onError = null;
      destroyed = true;
    },
  };

  return bus;
}

export default createEventBus;
