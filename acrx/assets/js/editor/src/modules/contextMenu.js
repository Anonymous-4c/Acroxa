// src/modules/contextMenu.js — Context menu module

export function contextMenu(options = {}) {
  return {
    name: "contextMenu",
    settings: { showIcons: false, iconTag: "i", ...options },
    contextMenu: [],
    commands: {
      getContextMenu(event) {
        const editor = this.editor;
        return editor.getContextMenu(event);
      },
    },
    onEnable(editor) {
      // Register default context options
    },
  };
}

// Default icon mapping
export const DEFAULT_ICONS = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikethrough: "strikethrough",
  code: "code",
  link: "link",
  copy: "copy",
  cut: "cut",
  paste: "paste",
  "select-all": "select-all",
  undo: "undo",
  redo: "redo",
};
