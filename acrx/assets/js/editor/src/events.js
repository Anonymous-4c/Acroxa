// src/events.js — Event/Hook system

export class Events {
  constructor() {
    this.handlers = new Map();
  }

  on(eventName, nodeType, callback) {
    if (typeof nodeType === "function") {
      callback = nodeType;
      nodeType = null;
    }
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName).push({ callback, nodeType });
    return this;
  }

  off(eventName, nodeType, callback) {
    if (typeof nodeType === "function") {
      callback = nodeType;
      nodeType = null;
    }
    const list = this.handlers.get(eventName);
    if (!list) return this;
    if (!callback) {
      this.handlers.delete(eventName);
      return this;
    }
    const idx = list.findIndex(
      (h) => h.callback === callback && (nodeType === null || h.nodeType === nodeType)
    );
    if (idx >= 0) list.splice(idx, 1);
    return this;
  }

  // Install a sink for errors thrown by host callbacks.
  setErrorHandler(fn) { this._onError = fn; }

  // Emit an event. Returns the ctx object. If preventDefault was called, ctx.prevented === true.
  //
  // Host callbacks are ISOLATED: one throwing listener must not abort the
  // others, and must never leave the engine mid-transaction. An exception
  // escaping here would propagate out of a keydown handler and wedge the
  // editor, so it is caught, reported, and the remaining listeners still run.
  emit(eventName, ctx = {}) {
    const list = this.handlers.get(eventName) || [];
    const result = {
      prevented: false,
      ...ctx,
    };
    result.preventDefault = () => { result.prevented = true; };
    result.stopPropagation = () => { result.propagationStopped = true; };

    // Iterate a copy: a listener may add or remove listeners while running.
    for (const { callback, nodeType } of [...list]) {
      if (nodeType && ctx.node && ctx.node.type !== nodeType) continue;
      if (result.propagationStopped) break;
      try {
        callback(result);
      } catch (err) {
        if (this._onError) this._onError(eventName, err);
        else if (typeof console !== "undefined") {
          console.error(`[editor] listener for "${eventName}" threw:`, err);
        }
      }
    }
    return result;
  }

  // Returns true if NOT prevented (i.e. default should run)
  shouldRun(eventName, ctx = {}) {
    return !this.emit(eventName, ctx).prevented;
  }

  clear() {
    this.handlers.clear();
  }
}
