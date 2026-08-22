// src/modules/history.js — History module (undo/redo wiring)

export function history(options = {}) {
  return {
    name: "history",
    settings: { ...options },
    commands: {
      undo() {
        this.editor.undo();
      },
      redo() {
        this.editor.redo();
      },
    },
    onEnable(editor) {
      // History is wired into the engine's executeCommand
    },
    onDisable(editor) {
      // Clear undo/redo stacks if needed
    },
  };
}
