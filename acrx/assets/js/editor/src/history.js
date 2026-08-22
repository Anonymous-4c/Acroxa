// src/history.js — Undo/Redo system

const DEFAULT_MAX_HISTORY = 100;

export class History {
  constructor(options = {}) {
    this.maxSize = options.maxSize || DEFAULT_MAX_HISTORY;
    this.undoStack = [];
    this.redoStack = [];
    this.currentDoc = null;
  }

  // Begin grouping: every transaction recorded until endGroup() collapses
  // into ONE undo entry. Used where a single user gesture legitimately needs
  // several commands (e.g. typing over a selection = delete + insert), which
  // must still take exactly one undo to reverse.
  beginGroup() {
    this._groupDepth = (this._groupDepth || 0) + 1;
    if (this._groupDepth === 1) this._groupMark = this.undoStack.length;
    return this._groupDepth;
  }

  endGroup() {
    if (!this._groupDepth) return;
    this._groupDepth--;
    if (this._groupDepth > 0) return;

    const from = this._groupMark ?? this.undoStack.length;
    const entries = this.undoStack.splice(from);
    if (entries.length <= 1) {
      this.undoStack.push(...entries);
      return;
    }
    // Concatenate forward steps in order; inverse steps in reverse order.
    this.undoStack.push({
      steps: entries.flatMap((e) => e.steps),
      inverseSteps: entries.slice().reverse().flatMap((e) => e.inverseSteps),
      beforeSelection: entries[0].beforeSelection,
      afterSelection: entries[entries.length - 1].afterSelection,
    });
  }

  // Record a transaction in history
  record(transactionResult) {
    if (!transactionResult.steps || transactionResult.steps.length === 0) return;

    this.undoStack.push({
      steps: transactionResult.steps,
      inverseSteps: transactionResult.inverseSteps,
      beforeSelection: transactionResult.beforeSelection,
      afterSelection: transactionResult.afterSelection,
    });

    // Clear redo stack on new action
    this.redoStack = [];

    // Trim undo stack if it exceeds max size
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  // Undo the last transaction
  undo(currentDoc) {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    // Apply inverse steps
    const tr = {
      steps: entry.inverseSteps,
      inverseSteps: entry.steps,
      beforeSelection: entry.afterSelection,
      afterSelection: entry.beforeSelection,
    };

    this.redoStack.push(entry);
    return tr;
  }

  // Redo the last undone transaction
  redo(currentDoc) {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    this.undoStack.push(entry);
    return {
      steps: entry.steps,
      inverseSteps: entry.inverseSteps,
      beforeSelection: entry.beforeSelection,
      afterSelection: entry.afterSelection,
    };
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  get size() {
    return this.undoStack.length;
  }
}
