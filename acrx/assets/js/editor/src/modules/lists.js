// src/modules/lists.js — Bullet / ordered / task lists, with real nesting.
//
// Structure:
//   bulletList | orderedList | taskList
//     └─ listItem            attrs: { checked?: boolean }
//          ├─ paragraph      (the item's own text — always content[0])
//          └─ bulletList…    (optional nested sublist — always last)
//
// Nesting is modelled as a sublist INSIDE the preceding sibling item, which is
// how HTML nests <ul> and is what makes indent/outdent reversible.

import { text, paragraph, cloneNode } from "../model.js";

const LIST_TYPES = ["bulletList", "orderedList", "taskList"];
const MARKER_STYLES = ["disc", "circle", "square", "decimal", "roman"];

function isListType(t) {
  return LIST_TYPES.includes(t);
}

// Walk the selection path and find the innermost listItem, returning the full
// chain so indent/outdent know their surroundings. Model-only, no DOM.
function findListContext(editor) {
  const pos = editor.selection?.anchor;
  if (!pos) return null;

  const path = pos.path;
  let itemPath = null;
  let listPath = null;

  // Scan ancestor prefixes; the deepest listItem wins (innermost nesting).
  for (let i = 2; i <= path.length; i += 2) {
    const prefix = path.slice(0, i);
    const node = editor.utils.getNode(prefix);
    if (!node) continue;
    if (node.type === "listItem") {
      itemPath = prefix;
      listPath = prefix.slice(0, -2);
    }
  }
  if (!itemPath) return null;

  const list = editor.utils.getNode(listPath);
  const item = editor.utils.getNode(itemPath);
  if (!list || !item) return null;

  return {
    listPath,
    list,
    listType: list.type,
    itemPath,
    item,
    itemIndex: itemPath[itemPath.length - 1],
    // Depth = how many list ancestors are above us.
    depth: countListAncestors(editor, itemPath),
  };
}

function countListAncestors(editor, itemPath) {
  let depth = 0;
  for (let i = 2; i <= itemPath.length; i += 2) {
    const node = editor.utils.getNode(itemPath.slice(0, i));
    if (node && isListType(node.type)) depth++;
  }
  return depth;
}

// The block the cursor sits in, whether or not it is inside a list.
function findBlockContext(editor) {
  const pos = editor.selection?.anchor;
  if (!pos) return null;
  if (pos.path.length < 2) return null;
  const blockPath = ["content", pos.path[1]];
  const blockNode = editor.utils.getNode(blockPath);
  if (!blockNode) return null;
  return { blockPath, blockNode, blockIndex: pos.path[1] };
}

// A listItem's trailing sublist, if it has one.
function getSublist(item) {
  if (!item?.content?.length) return null;
  const last = item.content[item.content.length - 1];
  return last && isListType(last.type) ? last : null;
}

function makeItem(contentBlocks, attrs = {}) {
  return { type: "listItem", attrs: { ...attrs }, content: contentBlocks.map(cloneNode) };
}

function makeList(type, items, attrs = {}) {
  return { type, attrs: { ...attrs }, content: items.map(cloneNode) };
}

// Convert a plain block into a single-item list of the given type.
function blockToList(block, listType) {
  const inner = block.type === "paragraph" || block.type === "heading"
    ? paragraph(block.content || [])
    : cloneNode(block);
  return makeList(listType, [makeItem([inner])]);
}

// Flatten a list (and its sublists) back into standalone paragraphs.
function listToBlocks(list, out = []) {
  for (const item of list.content || []) {
    if (item.type !== "listItem") continue;
    for (const child of item.content || []) {
      if (isListType(child.type)) listToBlocks(child, out);
      else out.push(cloneNode(child));
    }
  }
  return out;
}

export function lists(options = {}) {
  return {
    name: "lists",
    settings: { maxDepth: 6, ...options },

    commands: {
      // ── Toggling ─────────────────────────────────────────────────────
      toggleBulletList() { return toggleList(this.editor, "bulletList"); },
      toggleOrderedList() { return toggleList(this.editor, "orderedList"); },
      toggleTaskList() { return toggleList(this.editor, "taskList"); },

      // Cycle bullet -> ordered -> task -> plain paragraph.
      toggleListMarker() {
        const editor = this.editor;
        const ctx = findListContext(editor);
        if (!ctx) return toggleList(editor, "bulletList");

        const order = ["bulletList", "orderedList", "taskList"];
        const idx = order.indexOf(ctx.listType);
        const next = order[(idx + 1) % order.length];

        if (!editor.canUseNode(next)) return false;
        editor.utils.transaction((tr) => {
          const { parentPath, index } = splitPath(ctx.listPath);
          tr.setAttrs(parentPath, index, { ...ctx.list.attrs });
          tr.replaceNode(parentPath, index, {
            ...cloneNode(ctx.list),
            type: next,
          });
        });
        return true;
      },

      setMarkerStyle(style) {
        const editor = this.editor;
        if (!MARKER_STYLES.includes(style)) return false;
        const ctx = findListContext(editor);
        if (!ctx) return false;
        editor.utils.transaction((tr) => {
          const { parentPath, index } = splitPath(ctx.listPath);
          tr.setAttrs(parentPath, index, { ...ctx.list.attrs, markerStyle: style });
        });
        return true;
      },

      // ── Nesting ──────────────────────────────────────────────────────
      //
      // Indent moves the current item INTO the preceding sibling's sublist,
      // creating that sublist if needed. The first item of a list can never
      // indent (there is no sibling to nest under) — same rule as HTML.
      indentList() {
        const editor = this.editor;
        const ctx = findListContext(editor);
        if (!ctx) return false;
        if (ctx.itemIndex === 0) return false;
        if (ctx.depth >= (this.settings.maxDepth ?? 6)) return false;
        if (!editor.canUseNode(ctx.listType)) return false;

        const prevIndex = ctx.itemIndex - 1;
        const prevItem = ctx.list.content[prevIndex];
        if (!prevItem) return false;

        const movingItem = cloneNode(ctx.item);
        const existingSub = getSublist(prevItem);

        editor.utils.transaction((tr) => {
          // 1. Remove the item from its current position.
          tr.deleteNode(ctx.listPath, ctx.itemIndex);

          // 2. Append it to the previous sibling's sublist.
          const prevPath = [...ctx.listPath, "content", prevIndex];
          if (existingSub) {
            const subPath = [...prevPath, "content", prevItem.content.length - 1];
            tr.insertNode(subPath, existingSub.content.length, movingItem);
          } else {
            tr.insertNode(prevPath, prevItem.content.length,
              makeList(ctx.listType, [movingItem]));
          }
        });

        // Cursor follows the item into its new home.
        restoreCursorToItem(editor, ctx, "indent", prevIndex);
        return true;
      },

      // Outdent lifts the item out to its parent list, directly after the
      // ancestor item that contained it. Items that follow it in the sublist
      // become its own children, so ordering is preserved.
      outdentList() {
        const editor = this.editor;
        const ctx = findListContext(editor);
        if (!ctx) return false;
        if (ctx.depth <= 1) return false; // already top level

        // The sublist we're in lives inside a parent listItem.
        const parentItemPath = ctx.listPath.slice(0, -2);
        const parentItem = editor.utils.getNode(parentItemPath);
        if (!parentItem || parentItem.type !== "listItem") return false;

        const parentListPath = parentItemPath.slice(0, -2);
        const parentList = editor.utils.getNode(parentListPath);
        if (!parentList || !isListType(parentList.type)) return false;

        const parentItemIndex = parentItemPath[parentItemPath.length - 1];
        const movingItem = cloneNode(ctx.item);

        // Siblings after us in the sublist become our children.
        const trailing = ctx.list.content.slice(ctx.itemIndex + 1).map(cloneNode);
        if (trailing.length) {
          const ownSub = getSublist(movingItem);
          if (ownSub) {
            ownSub.content.push(...trailing);
          } else {
            movingItem.content.push(makeList(ctx.listType, trailing));
          }
        }

        editor.utils.transaction((tr) => {
          // Remove us and everything after us from the sublist.
          for (let i = ctx.list.content.length - 1; i >= ctx.itemIndex; i--) {
            tr.deleteNode(ctx.listPath, i);
          }
          // If the sublist is now empty, drop it from the parent item.
          if (ctx.itemIndex === 0) {
            const subIndex = ctx.listPath[ctx.listPath.length - 1];
            tr.deleteNode(parentItemPath, subIndex);
          }
          // Insert us into the parent list right after our old ancestor.
          tr.insertNode(parentListPath, parentItemIndex + 1, movingItem);
        });

        restoreCursorToItem(editor, ctx, "outdent", parentItemIndex);
        return true;
      },

      // ── Task lists ───────────────────────────────────────────────────
      toggleChecked() {
        const editor = this.editor;
        const ctx = findListContext(editor);
        if (!ctx) return false;
        const current = ctx.item.attrs?.checked === true;
        editor.utils.transaction((tr) => {
          const { parentPath, index } = splitPath(ctx.itemPath);
          tr.setAttrs(parentPath, index, { ...ctx.item.attrs, checked: !current });
        });
        return true;
      },

      isChecked() {
        const ctx = findListContext(this.editor);
        return ctx ? ctx.item.attrs?.checked === true : false;
      },

      // ── Introspection for hosts ──────────────────────────────────────
      getListDepth() {
        const ctx = findListContext(this.editor);
        return ctx ? ctx.depth : 0;
      },

      isInList() {
        return findListContext(this.editor) !== null;
      },

      // Splitting a list item on Enter: creates a sibling item.
      splitListItem() {
        const editor = this.editor;
        const ctx = findListContext(editor);
        if (!ctx) return false;
        editor.utils.transaction((tr) => {
          tr.insertNode(ctx.listPath, ctx.itemIndex + 1,
            makeItem([paragraph([])], {}));
        });
        const newPath = [...ctx.listPath, "content", ctx.itemIndex + 1,
                         "content", 0, "content", 0];
        editor.utils.setSelection({
          anchor: { path: newPath, offset: 0 },
          head: { path: newPath, offset: 0 },
        });
        return true;
      },
    },

    contextMenu: [
      { id: "list-bullet", label: "Bullet List", command: "toggleBulletList", when: "inside-list", type: "format" },
      { id: "list-ordered", label: "Ordered List", command: "toggleOrderedList", when: "inside-list", type: "format" },
      { id: "list-indent", label: "Indent", command: "indentList", when: "inside-list", type: "action" },
      { id: "list-outdent", label: "Outdent", command: "outdentList", when: "inside-list", type: "action" },
      { id: "list-check", label: "Toggle Checked", command: "toggleChecked", when: "inside-list", type: "action" },
    ],

    onEnable(editor) {
      // Tab / Shift+Tab drive nesting while the cursor is inside a list.
      this._onKeyDown = (e) => {
        if (editor._compositionActive) return;
        if (e.key !== "Tab") return;
        if (!findListContext(editor)) return;
        e.preventDefault();
        if (e.shiftKey) editor.outdentList();
        else editor.indentList();
      };
      editor.element.addEventListener("keydown", this._onKeyDown, true);
    },

    onDisable(editor) {
      if (this._onKeyDown) {
        editor.element.removeEventListener("keydown", this._onKeyDown, true);
        this._onKeyDown = null;
      }
    },

    onDestroy(editor) { this.onDisable(editor); },
  };
}

// Toggle the current block between a plain paragraph and a list of `listType`.
function toggleList(editor, listType) {
  if (!editor.canUseNode(listType)) return false;

  const ctx = findListContext(editor);

  // Already in a list of this exact type -> unwrap back to paragraphs.
  if (ctx && ctx.listType === listType && ctx.depth === 1) {
    const blocks = listToBlocks(ctx.list);
    const listIndex = ctx.listPath[ctx.listPath.length - 1];
    editor.utils.transaction((tr) => {
      tr.deleteNode([], listIndex);
      blocks.forEach((b, i) => tr.insertNode([], listIndex + i, b));
      const landing = ["content", listIndex, "content", 0];
      tr.setResolvedSelection({
        anchor: { path: landing, offset: 0 },
        head: { path: landing, offset: 0 },
      });
    });
    return true;
  }

  // In a list of a DIFFERENT type -> retype it in place, nesting preserved.
  if (ctx && ctx.depth === 1) {
    const listIndex = ctx.listPath[ctx.listPath.length - 1];
    editor.utils.transaction((tr) => {
      tr.replaceNode([], listIndex, { ...cloneNode(ctx.list), type: listType });
    });
    return true;
  }

  // Plain block -> wrap into a single-item list.
  const block = findBlockContext(editor);
  if (!block) return false;
  const list = blockToList(block.blockNode, listType);
  editor.utils.transaction((tr) => {
    tr.replaceNode([], block.blockIndex, list);
    const landing = ["content", block.blockIndex, "content", 0, "content", 0, "content", 0];
    tr.setResolvedSelection({
      anchor: { path: landing, offset: 0 },
      head: { path: landing, offset: 0 },
    });
  });
  return true;
}

// After a structural move the old path is meaningless; place the caret at the
// start of the item's first text node in its new location.
function restoreCursorToItem(editor, ctx, op, anchorIndex) {
  let target;
  if (op === "indent") {
    const prevPath = [...ctx.listPath, "content", anchorIndex];
    const prevItem = editor.utils.getNode(prevPath);
    if (!prevItem) return;
    const subIndex = prevItem.content.length - 1;
    const sub = prevItem.content[subIndex];
    if (!sub || !isListType(sub.type)) return;
    target = [...prevPath, "content", subIndex, "content", sub.content.length - 1,
              "content", 0, "content", 0];
  } else {
    const parentListPath = ctx.listPath.slice(0, -4);
    target = [...parentListPath, "content", anchorIndex + 1, "content", 0, "content", 0];
  }
  if (editor.utils.getNode(target.slice(0, -2))) {
    editor.utils.setSelection({
      anchor: { path: target, offset: 0 },
      head: { path: target, offset: 0 },
    });
  }
}

// Local copy of the (parentPath, index) split — see engine.splitNodePath().
function splitPath(path) {
  const index = path[path.length - 1];
  if (typeof index !== "number") return { parentPath: [], index: null };
  return { parentPath: path.slice(0, -2), index };
}
