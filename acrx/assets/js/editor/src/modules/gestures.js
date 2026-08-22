// src/modules/gestures.js — Optional pointer gestures (spec Section 12).
//
// Emits `gesture` events; it never changes content itself. The core must work
// with this module absent — nothing in the engine depends on it.

const DEFAULTS = {
  longPress: true,
  doubleClick: true,
  tripleClick: true,
  longPressMs: 500,
  moveTolerance: 8,   // px of drift still counted as a press, not a drag
};

export function gestures(options = {}) {
  return {
    name: "gestures",
    settings: { ...DEFAULTS, ...options },

    commands: {
      // Let hosts query/adjust thresholds at runtime.
      getGestureSettings() { return { ...this.settings }; },
    },

    onEnable(editor) {
      const el = editor.element;
      let timer = null;
      let downAt = null;
      let fired = false;

      const emit = (type, x, y) => {
        editor.emit("gesture", {
          type,
          x, y,
          selection: editor.utils.getSelection(),
        });
      };

      const clearTimer = () => {
        if (timer) { clearTimeout(timer); timer = null; }
      };

      this._onDown = (e) => {
        if (e.button !== 0) return;
        downAt = { x: e.clientX, y: e.clientY };
        fired = false;

        if (this.settings.longPress) {
          clearTimer();
          timer = setTimeout(() => {
            fired = true;
            emit("longPress", downAt.x, downAt.y);
          }, this.settings.longPressMs);
        }
      };

      this._onMove = (e) => {
        if (!downAt || !timer) return;
        const dx = Math.abs(e.clientX - downAt.x);
        const dy = Math.abs(e.clientY - downAt.y);
        // Moving past the tolerance means this is a drag, not a long press.
        if (dx > this.settings.moveTolerance || dy > this.settings.moveTolerance) {
          clearTimer();
        }
      };

      this._onUp = () => { clearTimer(); downAt = null; };

      this._onClick = (e) => {
        if (fired) return;                       // long press already handled it
        if (e.detail === 2 && this.settings.doubleClick) {
          emit("doubleClick", e.clientX, e.clientY);
        } else if (e.detail === 3 && this.settings.tripleClick) {
          emit("tripleClick", e.clientX, e.clientY);
        }
      };

      // Touch equivalents so the module is useful on mobile hosts too.
      this._onTouchStart = (e) => {
        const t = e.touches?.[0];
        if (!t) return;
        downAt = { x: t.clientX, y: t.clientY };
        fired = false;
        if (this.settings.longPress) {
          clearTimer();
          timer = setTimeout(() => {
            fired = true;
            emit("longPress", downAt.x, downAt.y);
          }, this.settings.longPressMs);
        }
      };
      this._onTouchEnd = () => { clearTimer(); downAt = null; };

      el.addEventListener("mousedown", this._onDown);
      el.addEventListener("mousemove", this._onMove);
      el.addEventListener("mouseup", this._onUp);
      el.addEventListener("click", this._onClick);
      el.addEventListener("touchstart", this._onTouchStart, { passive: true });
      el.addEventListener("touchend", this._onTouchEnd, { passive: true });

      this._clearTimer = clearTimer;
    },

    onDisable(editor) {
      const el = editor.element;
      if (this._clearTimer) this._clearTimer();
      if (this._onDown) {
        el.removeEventListener("mousedown", this._onDown);
        el.removeEventListener("mousemove", this._onMove);
        el.removeEventListener("mouseup", this._onUp);
        el.removeEventListener("click", this._onClick);
        el.removeEventListener("touchstart", this._onTouchStart);
        el.removeEventListener("touchend", this._onTouchEnd);
        this._onDown = this._onMove = this._onUp = null;
        this._onClick = this._onTouchStart = this._onTouchEnd = null;
      }
    },

    onDestroy(editor) { this.onDisable(editor); },
  };
}
