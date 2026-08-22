// src/engine.js — Main editor engine (clean architecture)

import {
  cloneNode,
  text,
  paragraph,
  doc,
  resolve,
  nodeTextLength,
  isText,
  isBlock,
  pathsEqual,
  comparePaths,
} from "./model.js";
import { Schema } from "./schema.js";
import { Transaction, mapSelection, mapPosition } from "./transaction.js";
import { normalizeDoc, touchedBlocks } from "./normalize.js";
import { Events } from "./events.js";
import {
  cursor,
  range,
  isCollapsed,
  getStart,
  getEnd,
  saveSelection,
  restoreSelection,
  getBlockInfo,
  getBlockPath,
} from "./selection.js";
import {
  breakBlock,
  breakAtStart,
  breakAtEnd,
  breakInEmptyBlock,
  mergeBlocks,
  deleteAcross,
  applyMark,
  removeMark,
  insertText,
  deleteText,
} from "./editing.js";
import { syncView, ensureEmptyBlockHeight, invalidateView } from "./view.js";
import { getDomSelection, setDomSelection, domToModelPosition, modelToDomPosition } from "./dom-utils.js";
import { History } from "./history.js";
import { parseHtmlToAst } from "./modules/paste.js";
import {
  resolveBlock,
  splitPath,
  closest,
  closestOf,
  sameBlock,
  charOffsetIn,
  positionAt,
  sliceInline,
  blockTextLength,
  ancestors,
} from "./paths.js";

// Built-in module registry
const BUILTIN_MODULES = new Map();

export function registerBuiltinModule(name, factory) {
  BUILTIN_MODULES.set(name, factory);
}

// ─── Atomic block registry ───────────────────────────────────────────────────
//
// Atomic blocks are self-contained structures the user edits through their
// attributes (images, heroes, buttons…) rather than by typing inline. The
// caret may sit ON one but never INSIDE it:
//   • Enter inserts a paragraph after it instead of breaking it
//   • Backspace/Delete removes the whole block
//   • Typing redirects into a fresh paragraph below
const ATOMIC_TYPES = new Set();

export function registerAtomicTypes(types) {
  for (const t of types || []) {
    if (typeof t === "string") ATOMIC_TYPES.add(t);
  }
}

function isAtomicType(type) {
  return ATOMIC_TYPES.has(type);
}

export function createEditor(options = {}) {
  const {
    element,
    schema: schemaConfig = {},
    content = { type: "doc", content: [] },
    enabled,
    disabled,
    modules: modulesOption,
  } = options;

  // ─── State ───────────────────────────────────────────────────────────────
  const editor = {
    element,
    schema: new Schema(schemaConfig),
    doc: editor_schemaFilter(cloneNode(content), new Schema(schemaConfig)),
    modules: new Map(),
    moduleOrder: [],
    moduleSettings: new Map(),
    disabledModules: new Set(),
    _compositionActive: false,
    _compositionText: "",
    _contextOptions: [],
    _iconLibrary: null,
    _iconTag: "i",
    selection: null,
  };

  const events = new Events();
  const history = new History();

  // Single place errors from host-supplied code are surfaced. Hosts can
  // observe them via editor.onError(fn) — the engine never swallows an error
  // silently, but it also never lets one escape into a DOM event handler and
  // leave the editor unusable.
  function reportError(kind, name, err) {
    const info = { kind, name, error: err };
    if (editor._onError) {
      try { editor._onError(info); return; } catch (_) { /* fall through */ }
    }
    if (typeof console !== "undefined") {
      console.error(`[editor] ${kind}${name ? ` "${name}"` : ""} threw:`, err);
    }
  }

  editor.onError = (fn) => { editor._onError = fn; };
  events.setErrorHandler((eventName, err) =>
    reportError("event listener", eventName, err));

  // ─── Internal: apply a transaction ───────────────────────────────────────

  // explicitSelection (optional): a selection that is already valid for the
  // POST-transaction document and must be restored verbatim, without being
  // mapped through the steps. Used by undo/redo, which store selections that
  // were captured against the exact state they are restoring.
  function applyTransaction(tr, explicitSelection = undefined) {
    // Capture selection before
    const beforeSel = saveSelection(editor.selection);
    tr.beforeSelection = restoreSelection(beforeSel);

    // Apply the transaction (mutates editor.doc in place)
    const result = tr.apply();

    // Normalize only the blocks this transaction actually touched.
    // Full-document normalization was O(document) on every keystroke, which
    // dominated typing latency on long documents.
    editor.doc = normalizeDoc(editor.doc, editor.schema,
      touchedBlocks(result.steps));

    if (explicitSelection !== undefined) {
      editor.selection = restoreSelection(explicitSelection);
      result.afterSelection = editor.selection;
    } else {
      // Update selection from the mapped afterSelection
      editor.selection = result.afterSelection || restoreSelection(beforeSel);
    }

    // Final safety net: a command may leave the caret pointing at a node that
    // no longer exists (e.g. deleteRow removing the row the caret was in).
    // A dangling selection makes every subsequent command a silent no-op, so
    // clamp it back to the nearest valid position.
    editor.selection = clampSelection(editor.doc, editor.selection);

    return result;
  }

  // ─── Internal: execute a command ─────────────────────────────────────────

  // Spec Section 6 requires semantic lifecycle events in addition to the
  // generic command ones. Map each command onto its before/after pair so
  // hosts can hook "a break is about to happen" without knowing the command
  // name the engine happens to use internally.
  const LIFECYCLE = {
    break:          ["beforeBreak",  "afterBreak"],
    split:          ["beforeBreak",  "afterBreak"],
    insertText:     ["beforeInsert", "afterInsert"],
    insertNode:     ["beforeInsert", "afterInsert"],
    deleteAcross:   ["beforeDelete", "afterDelete"],
    deleteNode:     ["beforeDelete", "afterDelete"],
    deleteBackward: ["beforeDelete", "afterDelete"],
    deleteForward:  ["beforeDelete", "afterDelete"],
    mergeBlocks:    ["beforeDelete", "afterDelete"],
  };

  // Commands that only move the caret or read state are still allowed while
  // read-only; everything that mutates the document is not.
  const READONLY_ALLOWED = new Set(["setJSON", "setJSON:empty"]);

  function executeCommand(commandName, fn) {
    // Read-only is enforced HERE, at the single mutation choke point, rather
    // than by removing commands — so no code path can bypass it.
    if (editor._editable === false && !READONLY_ALLOWED.has(commandName)) {
      return null;
    }

    // Fire beforeCommand events
    if (!events.shouldRun("beforeCommand", { editor, commandName })) return null;
    if (!events.shouldRun(`before:${commandName}`, { editor, commandName })) return null;

    // Semantic "before" hook — cancelable, exactly like beforeCommand.
    const lifecycle = LIFECYCLE[commandName];
    if (lifecycle && !events.shouldRun(lifecycle[0], {
      editor, commandName, selection: saveSelection(editor.selection),
    })) return null;

    // Build transaction
    const tr = new Transaction(editor.doc, editor.selection);

    // Let the command function add steps.
    //
    // Steps are only COLLECTED here, not applied, so a throw at this stage
    // leaves the document completely untouched — this is what makes a failed
    // command atomic (spec Section 4: "no partial mutation is ever left
    // behind"). Report and abort rather than propagate into a key handler.
    try {
      fn(tr);
    } catch (err) {
      reportError("command", commandName, err);
      return null;
    }

    // Skip if no steps
    if (tr.steps.length === 0) return null;

    // Apply the transaction
    const result = applyTransaction(tr);

    // Operations that re-split text nodes (mark apply/remove) invalidate
    // path-based positions. Those commands record the selection as absolute
    // character offsets, which survive any regrouping — re-resolve here,
    // after normalization has merged adjacent identical-mark nodes.
    if (result.meta?.marksTouched && result.meta.selectionSpan) {
      const span = result.meta.selectionSpan;
      const anchor = absToPos(editor.doc, span.anchor);
      const head = absToPos(editor.doc, span.head);
      if (anchor && head) {
        editor.selection = { anchor, head };
        // Write it back into the result BEFORE history records the entry.
        // Mark commands leave afterSelection undefined (they resolve their
        // selection here instead), so history stored `undefined` and redo
        // then restored it verbatim — nulling the selection. Undo hid the
        // bug because it uses beforeSelection.
        result.afterSelection = saveSelection(editor.selection);
      }
    }

    // Any command that finished without naming an after-selection still needs
    // one recorded, or redoing it will clear the user's selection.
    if (!result.afterSelection && editor.selection) {
      result.afterSelection = saveSelection(editor.selection);
    }

    // Record in history
    if (commandName !== "undo" && commandName !== "redo") {
      history.record(result);
    }

    // Any applied transaction means unsaved changes.
    editor._dirty = true;

    // Sync view from model
    syncViewFromModel();

    // Set browser selection from model
    setDomSelection(editor.element, editor.selection);

    // Semantic "after" hook.
    if (lifecycle) {
      events.emit(lifecycle[1], {
        editor, commandName, result,
        selection: saveSelection(editor.selection),
      });
    }

    // Node-level create/delete, derived from what the transaction actually
    // did rather than from the command's name — so any code path that adds
    // or removes a node reports it, with no special-casing.
    for (const step of result.steps) {
      if (step.type === "insert_node" || step.type === "splice_nodes") {
        const made = step.type === "insert_node" ? [step.data.node] : step.data.nodes;
        for (const node of made) {
          events.emit("create", { editor, node, commandName });
        }
      }
      if (step.type === "delete_node") {
        events.emit("delete", { editor, commandName, path: [...step.parentPath, step.index] });
      }
    }

    // Fire after events
    events.emit(`after:${commandName}`, { editor, commandName, result });
    events.emit("afterCommand", { editor, commandName, result });
    events.emit("transaction", { editor, transaction: result });

    return result;
  }

  // ─── Internal: sync DOM from model ──────────────────────────────────────

  function syncViewFromModel() {
    syncView(editor.element, editor.doc, editor.schema);
    ensureEmptyBlockHeight(editor.element);
  }

  // ─── Internal: insert text at the caret ─────────────────────────────────
  //
  // Handles the case an empty block presents: `content` is [], so there is no
  // text node at the cursor's index and an insert_text step would target a
  // node that does not exist and silently do nothing. In that case we create
  // the text node instead. This path is shared by typing and by IME commit,
  // so both behave identically.
  function insertTextAtCursor(str, commandName = "insertText") {
    if (!str || !editor.selection) return null;

    const pos = editor.selection.anchor;

    // Resolve the LEAF BLOCK that owns the caret. Using a top-level path here
    // let text nodes be inserted straight into a list or a table, producing
    // structurally invalid documents ("text" directly inside a list). The
    // fuzzer hit this within two operations.
    const r = resolveBlock(editor.doc, pos);
    if (!r || !Array.isArray(r.block.content)) return null;

    let { blockPath, block } = r;

    // Typing while the caret rests on an ATOMIC block (image, hero…) must not
    // push text into that structure — redirect into a fresh paragraph below.
    if (isAtomicType(block.type)) {
      const { containerPath, index } = r;
      const at = index + 1;
      executeCommand("insertNode", (tr) => {
        tr.insertNode(containerPath, at, paragraph());
        tr.setResolvedSelection(cursor([...containerPath, "content", at, "content", 0], 0));
      });
      const nextPos = editor.selection?.anchor;
      const next = nextPos ? resolveBlock(editor.doc, nextPos) : null;
      if (!next || isAtomicType(next.block.type)) return null;
      blockPath = next.blockPath;
      block = next.block;
    }

    // Re-read the caret: it may have been redirected off an atomic block.
    const charAt = charOffsetIn(editor.doc,
      isAtomicType(r.block.type) ? editor.selection.anchor : pos);

    return executeCommand(commandName, (tr) => {
      const kids = block.content || [];
      // Find the text node containing charAt, if any.
      let acc = 0, target = -1, within = 0;
      for (let i = 0; i < kids.length; i++) {
        if (kids[i]?.type !== "text") continue;
        const len = kids[i].text.length;
        if (charAt <= acc + len) { target = i; within = charAt - acc; break; }
        acc += len;
      }

      if (target >= 0) {
        tr.insertText(blockPath, target, within, str);
        tr.setResolvedSelection(
          cursor([...blockPath, "content", target], within + str.length));
      } else {
        // Empty block, or caret past the last text node: append a text node
        // INSIDE the leaf block (never into its container).
        const at = kids.length;
        tr.insertNode(blockPath, at, text(str));
        tr.setResolvedSelection(
          cursor([...blockPath, "content", at], str.length));
      }
    });
  }

  // Replace a (possibly non-collapsed) selection with literal text.
  //
  // Delete + insert must be ONE undo step. Running deleteAcross() and then
  // insertTextAtCursor() would queue two separate commands, so the user would
  // need two undos to get their text back. Instead this builds the surviving
  // block content directly and emits a single transaction.
  function replaceSelectionWithText(str) {
    if (!str || !editor.selection) return null;

    if (isCollapsed(editor.selection)) {
      return insertTextAtCursor(str, "insertText");
    }

    // Reuse the one correct deletion implementation rather than duplicating
    // its container logic here, then insert at the resulting caret.
    // deleteAcross + insert are two commands, so collapse them into a single
    // history entry to keep "type over a selection" one undo step.
    const merged = history.beginGroup();
    editor.utils.deleteAcross();
    const res = insertTextAtCursor(str, "insertText");
    history.endGroup(merged);
    return res;
  }

  // ─── Internal: read browser selection to model ──────────────────────────

  function readDomSelection() {
    const sel = getDomSelection(editor.doc, editor.element);
    if (sel) {
      editor.selection = sel;
    }
    return sel;
  }

  // ─── Public API: utils ──────────────────────────────────────────────────

  editor.utils = {
    getCursor() {
      if (!editor.selection) return null;
      return {
        path: [...editor.selection.anchor.path],
        offset: editor.selection.anchor.offset,
        node: resolve(editor.doc, editor.selection.anchor.path),
      };
    },

    getSelection() {
      return saveSelection(editor.selection);
    },

    setSelection(sel) {
      editor.selection = restoreSelection(sel);
      setDomSelection(editor.element, editor.selection);
    },

    saveSelection() {
      return saveSelection(editor.selection);
    },

    restoreSelection(saved) {
      editor.selection = restoreSelection(saved);
      setDomSelection(editor.element, editor.selection);
    },

    removeSelection() {
      editor.selection = null;
    },

    hasSelection() {
      return !!editor.selection;
    },

    selectionIsEmpty() {
      return !editor.selection || isCollapsed(editor.selection);
    },

    // Split the block at the caret.
    //
    // Container-generic: the new block is inserted into whatever holds the
    // current block (doc, listItem, tableCell), never assumed to be the doc.
    // The previous version hard-coded ["content", blockIndex] and threw
    // "Cannot read properties of undefined" the moment Enter was pressed
    // inside a list item or a table cell.
    break(position) {
      executeCommand("break", (tr) => {
        const pos = position || editor.selection?.anchor;
        if (!pos) return;

        const r = resolveBlock(editor.doc, pos);
        if (!r || !Array.isArray(r.block.content)) return;

        const { blockPath, block, textIndex, containerPath, index } = r;
        const textNode = block.content[textIndex] || null;
        const charAt = charOffsetIn(editor.doc, pos);
        const total = blockTextLength(editor.doc, blockPath);

        // A list item is split into a SIBLING ITEM, not a sibling paragraph,
        // otherwise Enter would break out of the list.
        const item = closest(editor.doc, pos.path, "listItem");
        const inListItem = item &&
          item.path.join("/") === containerPath.join("/");

        const makeSibling = (content) => inListItem
          ? { type: "listItem", attrs: {},
              content: [{ type: "paragraph", attrs: {}, content }] }
          : { type: block.type === "heading" ? "paragraph" : block.type,
              attrs: block.type === "heading" ? {} : { ...(block.attrs || {}) },
              content };

        // Where the sibling actually goes, and the path of its text.
        const targetPath = inListItem ? item.path.slice(0, -2) : containerPath;
        const targetIndex = inListItem ? item.path[item.path.length - 1] : index;
        const landingPath = (i) => inListItem
          ? [...targetPath, "content", i, "content", 0, "content", 0]
          : [...targetPath, "content", i, "content", 0];

        const isEmpty = total === 0;
        const atStart = charAt === 0;
        const atEnd = charAt >= total;

        if (isEmpty && inListItem) {
          // Enter on an EMPTY list item exits the list — the universal
          // convention (Word, Docs, Notion). Without this the user is trapped:
          // Enter just kept adding empty items with no way out.
          const listPath = item.path.slice(0, -2);
          const list = resolve(editor.doc, listPath);
          const itemIndex = item.path[item.path.length - 1];
          const { parentPath: listParent, index: listIndex } = splitPath(listPath);
          if (!list) return;

          const before = (list.content || []).slice(0, itemIndex).map(cloneNode);
          const after = (list.content || []).slice(itemIndex + 1).map(cloneNode);

          // Rebuild as: [list before] [paragraph] [list after]
          tr.deleteNode(listParent, listIndex);
          let at = listIndex;
          if (before.length) {
            tr.insertNode(listParent, at++,
              { type: list.type, attrs: { ...(list.attrs || {}) }, content: before });
          }
          const paraIndex = at;
          tr.insertNode(listParent, at++, { type: "paragraph", attrs: {}, content: [] });
          if (after.length) {
            tr.insertNode(listParent, at++,
              { type: list.type, attrs: { ...(list.attrs || {}) }, content: after });
          }
          tr.setResolvedSelection(cursor([...listParent, "content", paraIndex], 0));
        } else if (isEmpty) {
          // Locked policy: keep the original empty block, add one below.
          tr.insertNode(targetPath, targetIndex + 1, makeSibling([]));
          tr.setResolvedSelection(cursor(landingPath(targetIndex + 1), 0));
        } else if (atStart) {
          // New empty block ABOVE; caret stays with the original text.
          tr.insertNode(targetPath, targetIndex, makeSibling([]));
          tr.setResolvedSelection(cursor(landingPath(targetIndex + 1), 0));
        } else if (atEnd) {
          // New empty block BELOW; caret moves into it.
          tr.insertNode(targetPath, targetIndex + 1, makeSibling([]));
          tr.setResolvedSelection(cursor(landingPath(targetIndex + 1), 0));
        } else {
          // Mid-text split: head stays, tail moves to the new sibling.
          const head = sliceInline(editor.doc, blockPath, 0, charAt);
          const tail = sliceInline(editor.doc, blockPath, charAt, Infinity);

          for (let i = block.content.length - 1; i >= 0; i--) {
            tr.deleteNode(blockPath, i);
          }
          head.forEach((nd, i) => tr.insertNode(blockPath, i, nd));

          tr.insertNode(targetPath, targetIndex + 1, makeSibling(tail));
          tr.setResolvedSelection(cursor(landingPath(targetIndex + 1), 0));
        }
      });
    },

    split(position) {
      executeCommand("split", (tr) => {
        if (!position) return;
        const blockInfo = getBlockInfo(editor.doc, position);
        if (!blockInfo) return;
        const { blockIndex } = blockInfo;
        const blockPath = ["content", blockIndex];
        const blockNode = resolve(editor.doc, blockPath);
        const textNode = resolve(editor.doc, position.path);
        if (!textNode || textNode.type !== "text") return;

        const textIndex = position.path[3];
        const beforeText = textNode.text.slice(0, position.offset);
        const afterText = textNode.text.slice(position.offset);

        tr.replaceNode(blockPath, textIndex, text(beforeText, textNode.marks));

        const newBlock = paragraph();
        if (afterText.length > 0) {
          newBlock.content.push(text(afterText, textNode.marks));
        }
        for (let i = textIndex + 1; i < blockNode.content.length; i++) {
          newBlock.content.push(cloneNode(blockNode.content[i]));
        }
        for (let i = blockNode.content.length - 1; i > textIndex; i--) {
          tr.deleteNode(blockPath, i);
        }
        tr.insertNode([], blockIndex + 1, newBlock);
        tr.setResolvedSelection(cursor(["content", blockIndex + 1, "content", 0], 0));
      });
    },

    // Merge the caret's block into the preceding sibling.
    //
    // Container-generic and boundary-aware:
    //  - inside a list, merging item N into item N-1 also re-parents any
    //    sublist so nested children are not orphaned;
    //  - a table CELL is a hard boundary. Backspace at the start of a cell
    //    must never pull the previous cell's text in, or merge cells.
    mergeBlocks(direction = "backward") {
      if (direction !== "backward") return;

      const pos = editor.selection?.anchor;
      if (!pos) return;
      const r = resolveBlock(editor.doc, pos);
      if (!r) return;

      const { blockPath, block, containerPath, index } = r;

      // Are we at the first block of a table cell? Then stop: no merge, and
      // no cursor movement out of the cell.
      const cell = closest(editor.doc, pos.path, "tableCell");
      if (cell && index === 0 &&
          containerPath.join("/") === cell.path.join("/")) {
        return;
      }

      // In a list, the unit that merges is the ITEM, not the paragraph.
      const item = closest(editor.doc, pos.path, "listItem");
      const inItemHead = item && index === 0 &&
        containerPath.join("/") === item.path.join("/");

      if (inItemHead) {
        const listPath = item.path.slice(0, -2);
        const itemIndex = item.path[item.path.length - 1];

        // First item of a top-level list: lift it out to a paragraph.
        if (itemIndex === 0) {
          const list = resolve(editor.doc, listPath);
          if (!list) return;
          const { parentPath: listParent, index: listIndex } = splitPath(listPath);
          const inline = sliceInline(editor.doc, blockPath, 0, Infinity);
          const rest = (list.content || []).slice(1).map(cloneNode);

          executeCommand("mergeBlocks", (tr) => {
            tr.deleteNode(listParent, listIndex);
            tr.insertNode(listParent, listIndex,
              { type: "paragraph", attrs: {}, content: inline });
            if (rest.length) {
              tr.insertNode(listParent, listIndex + 1,
                { type: list.type, attrs: { ...(list.attrs || {}) }, content: rest });
            }
            tr.setResolvedSelection(cursor(
              [...listParent, "content", listIndex, "content", 0], 0));
          });
          return;
        }

        // Otherwise append our text to the previous item's last leaf block.
        const prevItemPath = [...listPath, "content", itemIndex - 1];
        const prevItem = resolve(editor.doc, prevItemPath);
        if (!prevItem) return;

        const prevLeafIdx = (prevItem.content || [])
          .map((c, i) => (isLeafBlockType(c?.type) ? i : -1))
          .filter((i) => i >= 0).pop();
        if (prevLeafIdx === undefined) return;

        const prevLeafPath = [...prevItemPath, "content", prevLeafIdx];
        const joinAt = blockTextLength(editor.doc, prevLeafPath);
        const moving = sliceInline(editor.doc, blockPath, 0, Infinity);
        // Our own sublist (if any) must survive the merge.
        const ourSub = (block && (resolve(editor.doc, item.path)?.content || []))
          .filter((c) => ["bulletList", "orderedList", "taskList"].includes(c?.type))
          .map(cloneNode);

        executeCommand("mergeBlocks", (tr) => {
          const base = resolve(editor.doc, prevLeafPath).content?.length ?? 0;
          moving.forEach((nd, i) => tr.insertNode(prevLeafPath, base + i, nd));
          ourSub.forEach((sub, i) =>
            tr.insertNode(prevItemPath, (prevItem.content?.length ?? 0) + i, sub));
          tr.deleteNode(listPath, itemIndex);
          tr.setResolvedSelection(asRange(positionAt(editor.doc, prevLeafPath, joinAt)) || cursor(prevLeafPath, 0));
        });
        return;
      }

      // Plain sibling-block merge within any container.
      if (index <= 0) return;
      const prevPath = [...containerPath, "content", index - 1];
      const prev = resolve(editor.doc, prevPath);
      if (!prev) return;

      // Only leaf blocks merge. A different structural type (table, list)
      // is a boundary: move the caret to its end, delete nothing (spec 10.3).
      if (!isLeafBlockType(prev.type) || !isLeafBlockType(block.type)) {
        const end = blockTextLength(editor.doc, prevPath);
        const p = positionAt(editor.doc, prevPath, end);
        if (p) editor.utils.setSelection({ anchor: p, head: p });
        return;
      }

      const joinAt = blockTextLength(editor.doc, prevPath);
      const moving = sliceInline(editor.doc, blockPath, 0, Infinity);

      executeCommand("mergeBlocks", (tr) => {
        const base = prev.content?.length ?? 0;
        moving.forEach((nd, i) => tr.insertNode(prevPath, base + i, nd));
        tr.deleteNode(containerPath, index);
        tr.setResolvedSelection(asRange(positionAt(editor.doc, prevPath, joinAt)) || cursor(prevPath, 0));
      });
    },

    // Delete everything inside the selection.
    //
    // Container-generic. Three cases, in order of increasing scope:
    //   1. both ends in the SAME leaf block  -> splice that block's inline run
    //   2. both ends share a container       -> join the two remainders,
    //                                           drop the blocks between them
    //   3. ends in different containers      -> clamp to the common ancestor
    //                                           and clear each side separately
    //
    // Case 3 is what protects tables and lists: a selection running from one
    // table cell into another must not delete the rows, and a selection over
    // two list items must leave the list itself intact. The previous version
    // always did tr.deleteNode([], i), which erased top-level structure and
    // left `{"type":"table","content":[]}`.
    deleteAcross() {
      const sel = editor.selection;
      if (!sel || isCollapsed(sel)) return;

      const start = getStart(sel);
      const end = getEnd(sel);
      const rs = resolveBlock(editor.doc, start);
      const re = resolveBlock(editor.doc, end);
      if (!rs || !re) return;

      const startChar = charOffsetIn(editor.doc, start);
      const endChar = charOffsetIn(editor.doc, end);

      // ── 1. same leaf block ────────────────────────────────────────────
      if (rs.blockPath.join("/") === re.blockPath.join("/")) {
        const keep = [
          ...sliceInline(editor.doc, rs.blockPath, 0, startChar),
          ...sliceInline(editor.doc, rs.blockPath, endChar, Infinity),
        ];
        executeCommand("deleteAcross", (tr) => {
          for (let i = (rs.block.content || []).length - 1; i >= 0; i--) {
            tr.deleteNode(rs.blockPath, i);
          }
          keep.forEach((nd, i) => tr.insertNode(rs.blockPath, i, nd));
          tr.setResolvedSelection(
            asRange(positionAt(editor.doc, rs.blockPath, startChar)) ||
            cursor(rs.blockPath, 0));
        });
        return;
      }

      const headKeep = sliceInline(editor.doc, rs.blockPath, 0, startChar);
      const tailKeep = sliceInline(editor.doc, re.blockPath, endChar, Infinity);

      // ── 2. same container: join the remainders ────────────────────────
      if (rs.containerPath.join("/") === re.containerPath.join("/")) {
        const container = rs.containerPath;
        executeCommand("deleteAcross", (tr) => {
          // Rebuild the start block as head+tail.
          for (let i = (rs.block.content || []).length - 1; i >= 0; i--) {
            tr.deleteNode(rs.blockPath, i);
          }
          [...headKeep, ...tailKeep].forEach((nd, i) =>
            tr.insertNode(rs.blockPath, i, nd));
          // Drop every block after it up to and including the end block.
          for (let i = re.index; i > rs.index; i--) {
            tr.deleteNode(container, i);
          }
          tr.setResolvedSelection(
            asRange(positionAt(editor.doc, rs.blockPath, startChar)) ||
            cursor(rs.blockPath, 0));
        });
        return;
      }

      // ── 3. different containers (cell->cell, item->item) ──────────────
      // Never restructure across the boundary. Clear the tail of the start
      // block and the head of the end block, and leave everything in
      // between structurally untouched.
      executeCommand("deleteAcross", (tr) => {
        for (let i = (re.block.content || []).length - 1; i >= 0; i--) {
          tr.deleteNode(re.blockPath, i);
        }
        tailKeep.forEach((nd, i) => tr.insertNode(re.blockPath, i, nd));

        for (let i = (rs.block.content || []).length - 1; i >= 0; i--) {
          tr.deleteNode(rs.blockPath, i);
        }
        headKeep.forEach((nd, i) => tr.insertNode(rs.blockPath, i, nd));

        tr.setResolvedSelection(
          asRange(positionAt(editor.doc, rs.blockPath, startChar)) ||
          cursor(rs.blockPath, 0));
      });
    },

    insertNode(node, position) {
      executeCommand("insertNode", (tr) => {
        const pos = position || editor.selection?.anchor;
        if (!pos) return;
        const parentPath = pos.path.slice(0, -1);
        const index = pos.path[pos.path.length - 1];
        tr.insertNode(parentPath, index, node);
      });
    },

    deleteNode(path) {
      executeCommand("deleteNode", (tr) => {
        const { parentPath, index } = splitNodePath(path);
        if (index === null) return;
        tr.deleteNode(parentPath, index);
      });
    },

    replaceNode(path, newNode) {
      executeCommand("replaceNode", (tr) => {
        const { parentPath, index } = splitNodePath(path);
        if (index === null) return;
        tr.replaceNode(parentPath, index, newNode);
      });
    },

    getNode(path) {
      return resolve(editor.doc, path);
    },

    setNodeAttrs(path, attrs) {
      executeCommand("setNodeAttrs", (tr) => {
        const { parentPath, index } = splitNodePath(path);
        if (index === null) return;
        tr.setAttrs(parentPath, index, attrs);
      });
    },

    updateNodeAttrs(path, partialAttrs) {
      const node = resolve(editor.doc, path);
      if (!node) return;
      const newAttrs = { ...(node.attrs || {}), ...partialAttrs };
      editor.utils.setNodeAttrs(path, newAttrs);
    },

    getJSON() {
      return cloneNode(editor.doc);
    },

    // Replace the whole document.
    //
    // This is expressed as real transaction steps (delete every existing
    // block, insert every new one) rather than by assigning editor.doc.
    // A bare assignment produced a transaction with ZERO steps, so
    // executeCommand() short-circuited and never synced the view — the model
    // changed while the DOM kept showing the old document, and the change was
    // also absent from undo history.
    setJSON(ast) {
      // Accept anything and coerce it to a valid doc. Hosts pass in stale
      // caches, partial API payloads and hand-written fixtures; none of that
      // may throw. A non-doc root is wrapped, junk is dropped, text survives.
      let input = ast;
      if (!input || typeof input !== "object") {
        input = { type: "doc", content: [] };
      } else if (input.type !== "doc") {
        input = { type: "doc", content: [input] };
      } else if (!Array.isArray(input.content)) {
        input = { type: "doc", content: [] };
      }

      let next;
      try {
        next = editor.schema.filterNode(cloneNode(input));
      } catch (err) {
        reportError("setJSON", null, err);
        next = { type: "doc", content: [] };
      }
      const blocks = (next && Array.isArray(next.content)) ? next.content : [];

      executeCommand("setJSON", (tr) => {
        const old = (editor.doc.content || []).length;
        for (let i = old - 1; i >= 0; i--) tr.deleteNode([], i);
        blocks.forEach((b, i) => tr.insertNode([], i, b));

        // Park the caret at the start of the new document.
        tr.setResolvedSelection(
          blocks.length
            ? cursor(["content", 0, "content", 0], 0)
            : null
        );
      });

      // A document that is replaced by an identical one produces steps too,
      // so the view always re-syncs. If the new doc is empty we still need a
      // valid caret target, so guarantee at least one block exists.
      if (!blocks.length) {
        executeCommand("setJSON:empty", (tr) => {
          tr.insertNode([], 0, paragraph());
          tr.setResolvedSelection(cursor(["content", 0, "content", 0], 0));
        });
      }
    },

    // Plain text of the whole document.
    //
    // Walks the tree recursively — the previous version only looked one level
    // deep, so any text inside a list item or table cell was invisible and
    // getText() returned "" for a document made entirely of lists.
    getText() {
      const lines = [];
      const walk = (node) => {
        if (!node) return;
        if (node.type === "text") return;
        const inline = (node.content || []).filter((c) => c && c.type === "text");
        if (inline.length) {
          lines.push(inline.map((c) => c.text).join(""));
        }
        for (const child of node.content || []) {
          if (child && child.type !== "text") walk(child);
        }
        // An empty leaf block still occupies a line.
        if (!inline.length &&
            isLeafBlockType(node.type) &&
            (node.content || []).length === 0) {
          lines.push("");
        }
      };
      for (const block of editor.doc.content || []) walk(block);
      return lines.join("\n");
    },

    isEmpty() {
      return !editor.doc.content || editor.doc.content.length === 0;
    },

    focus() { editor.element.focus(); },
    blur() { editor.element.blur(); },
    isFocused() { return document.activeElement === editor.element; },

    findPath(node) {
      function find(doc, target, path) {
        if (doc === target) return path;
        if (!doc || !doc.content) return null;
        for (let i = 0; i < doc.content.length; i++) {
          const result = find(doc.content[i], target, [...path, "content", i]);
          if (result) return result;
        }
        return null;
      }
      return find(editor.doc, node, []);
    },

    resolvePath(path) { return resolve(editor.doc, path); },

    mapPosition(position, steps) {
      return mapPosition(position, steps, editor.doc);
    },

    // ── Absolute-offset selection ──────────────────────────────────────
    //
    // Path+offset positions are fragile across operations that RESTRUCTURE
    // text nodes (applying a mark splits one node into three). Step-by-step
    // position mapping cannot express "the node you pointed at no longer
    // exists in that shape", which made repeated Ctrl+B walk the head
    // forward one node per press.
    //
    // A character offset counted from the start of the block is stable under
    // any regrouping of text nodes that preserves the text, so mark commands
    // capture the span before and restore it after.
    getSelectionSpan() {
      const sel = editor.selection;
      if (!sel) return null;
      return {
        anchor: posToAbs(editor.doc, sel.anchor),
        head: posToAbs(editor.doc, sel.head),
      };
    },

    setSelectionSpan(span) {
      if (!span) return;
      const anchor = absToPos(editor.doc, span.anchor);
      const head = absToPos(editor.doc, span.head);
      if (!anchor || !head) return;
      editor.selection = { anchor, head };
      setDomSelection(editor.element, editor.selection);
    },

    transaction(fn) {
      return executeCommand("transaction", fn);
    },

    forceUpdate() {
      invalidateView(editor.element);
      syncViewFromModel();
      setDomSelection(editor.element, editor.selection);
    },

    // Spec Section 8 lists this on utils as well as on the editor.
    getContextMenu(event) {
      return editor.getContextMenu(event);
    },

    // ── Selection convenience ──────────────────────────────────────────

    // Select the entire document.
    selectAll() {
      const leaves = allLeafBlocks(editor.doc);
      if (!leaves.length) return;
      const first = leaves[0];
      const last = leaves[leaves.length - 1];
      const anchor = positionAt(editor.doc, first, 0);
      const head = positionAt(editor.doc, last, blockTextLength(editor.doc, last));
      if (anchor && head) {
        editor.selection = { anchor, head };
        setDomSelection(editor.element, editor.selection);
      }
    },

    // Plain text covered by the current selection ("" when collapsed).
    getSelectedText() {
      const sel = editor.selection;
      if (!sel || isCollapsed(sel)) return "";
      const start = getStart(sel);
      const end = getEnd(sel);
      const rs = resolveBlock(editor.doc, start);
      const re = resolveBlock(editor.doc, end);
      if (!rs || !re) return "";

      const sChar = charOffsetIn(editor.doc, start);
      const eChar = charOffsetIn(editor.doc, end);
      const join = (nodes) => nodes.map((n) => n.text).join("");

      if (rs.blockPath.join("/") === re.blockPath.join("/")) {
        return join(sliceInline(editor.doc, rs.blockPath, sChar, eChar));
      }

      // Multi-block: head of the first, every block between, tail of the last.
      const all = allLeafBlocks(editor.doc);
      const key = (p) => p.join("/");
      const si = all.findIndex((p) => key(p) === key(rs.blockPath));
      const ei = all.findIndex((p) => key(p) === key(re.blockPath));
      if (si < 0 || ei < 0) return "";

      const parts = [join(sliceInline(editor.doc, all[si], sChar, Infinity))];
      for (let i = si + 1; i < ei; i++) {
        parts.push(join(sliceInline(editor.doc, all[i], 0, Infinity)));
      }
      parts.push(join(sliceInline(editor.doc, all[ei], 0, eChar)));
      return parts.join("\n");
    },

    // The marks active at a position (defaults to the caret).
    getMarksAt(position) {
      const pos = position || editor.selection?.anchor;
      if (!pos) return [];
      const node = resolve(editor.doc, pos.path);
      if (!node || node.type !== "text") return [];
      return (node.marks || []).map((m) => ({ ...m }));
    },

    // Scroll the caret into view. The engine owns the editable element, so
    // hosts should not have to reimplement this.
    scrollSelectionIntoView(opts) {
      const sel = editor.selection;
      if (!sel) return;
      const r = resolveBlock(editor.doc, sel.anchor);
      if (!r) return;
      const target = findElementForPath(editor.element, r.blockPath);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView(opts || { block: "nearest", inline: "nearest" });
      }
    },

    // ── Content convenience ────────────────────────────────────────────

    // Insert literal text at the caret, replacing any selection.
    insertText(str) {
      return replaceSelectionWithText(String(str ?? ""));
    },

    // Delete the current selection (no-op when collapsed).
    deleteSelection() {
      if (!editor.selection || isCollapsed(editor.selection)) return;
      editor.utils.deleteAcross();
    },

    // Top-level blocks, as a copy.
    getBlocks() {
      return (editor.doc.content || []).map(cloneNode);
    },

    getBlockAt(index) {
      const b = (editor.doc.content || [])[index];
      return b ? cloneNode(b) : null;
    },

    blockCount() {
      return (editor.doc.content || []).length;
    },

    // Serialise the current projection. Read-only: the model stays the
    // source of truth, this is for export/preview only.
    getHTML() {
      return editor.element.innerHTML;
    },

    // Parse HTML through the SAME sanitiser the paste pipeline uses, so
    // setHTML can never introduce content setJSON would reject.
    setHTML(html) {
      const parsed = parseHtmlToAst(String(html ?? ""));
      editor.utils.setJSON(parsed);
    },

    // Minimal Markdown export for the built-in block types.
    getMarkdown() {
      const inline = (node) => (node.content || []).map((c) => {
        if (c.type !== "text") return "";
        let t = c.text;
        const has = (k) => (c.marks || []).some((m) => m.type === k);
        if (has("code")) t = "`" + t + "`";
        if (has("bold")) t = "**" + t + "**";
        if (has("italic")) t = "*" + t + "*";
        if (has("strikethrough")) t = "~~" + t + "~~";
        const link = (c.marks || []).find((m) => m.type === "link");
        if (link?.attrs?.href) t = `[${t}](${link.attrs.href})`;
        return t;
      }).join("");

      const block = (node, depth = 0) => {
        const pad = "  ".repeat(depth);
        switch (node.type) {
          case "heading":
            return "#".repeat(node.attrs?.level || 1) + " " + inline(node);
          case "blockquote": return "> " + inline(node);
          case "codeblock":  return "```\n" + inline(node) + "\n```";
          case "bulletList":
          case "orderedList":
          case "taskList":
            return (node.content || []).map((item, i) => {
              const bullet = node.type === "orderedList" ? `${i + 1}.`
                : node.type === "taskList"
                  ? (item.attrs?.checked ? "- [x]" : "- [ ]")
                  : "-";
              const own = (item.content || [])
                .filter((c) => !["bulletList","orderedList","taskList"].includes(c.type))
                .map((c) => inline(c)).join(" ");
              const subs = (item.content || [])
                .filter((c) => ["bulletList","orderedList","taskList"].includes(c.type))
                .map((c) => block(c, depth + 1)).join("\n");
              return `${pad}${bullet} ${own}` + (subs ? "\n" + subs : "");
            }).join("\n");
          case "table":
            return (node.content || []).map((row, ri) => {
              const cells = (row.content || []).map((cell) =>
                (cell.content || []).map(inline).join(" ").trim());
              const line = "| " + cells.join(" | ") + " |";
              return ri === 0
                ? line + "\n| " + cells.map(() => "---").join(" | ") + " |"
                : line;
            }).join("\n");
          default: return inline(node);
        }
      };
      return (editor.doc.content || []).map((b) => block(b)).join("\n\n");
    },

    // ── Metrics ────────────────────────────────────────────────────────

    charCount() { return editor.utils.getText().length; },

    wordCount() {
      const t = editor.utils.getText().trim();
      return t ? t.split(/\s+/).length : 0;
    },

    // ── Container-generic path helpers ─────────────────────────────────
    // Exposed so modules resolve positions the same way the core does,
    // instead of re-deriving ["content", blockIndex] and breaking inside
    // tables and lists.
    resolveBlockAt(position) {
      return resolveBlock(editor.doc, position || editor.selection?.anchor);
    },

    charOffsetAt(position) {
      return charOffsetIn(editor.doc, position || editor.selection?.anchor);
    },

    sliceBlockInline(blockPath, from, to) {
      return sliceInline(editor.doc, blockPath, from, to);
    },
  };

  // ─── Capability gate (the single choke point, spec §7) ──────────────────
  //
  // A node/mark type is usable ONLY if the host schema allows it AND the
  // module that owns it is currently enabled. Every content-creating path
  // (commands, markdown shortcuts, paste, context menu) asks this — there is
  // deliberately no side door. Both halves are read live, never cached, so
  // enable()/disable() take effect on the very next keystroke.

  const NODE_OWNER = {
    table: "tables", tableRow: "tables", tableCell: "tables",
    bulletList: "lists", orderedList: "lists", listItem: "lists",
    taskList: "lists", taskItem: "lists",
  };

  const MARK_OWNER = {
    bold: "basicMarks", italic: "basicMarks", underline: "basicMarks",
    strikethrough: "basicMarks", code: "basicMarks",
    link: "link",
  };

  editor.canUseNode = (type) => {
    if (!editor.schema.allowsNode(type)) return false;
    const owner = NODE_OWNER[type];
    return !owner || editor.modules.has(owner);
  };

  editor.canUseMark = (type) => {
    if (!editor.schema.allowsMark(type)) return false;
    const owner = MARK_OWNER[type];
    return !owner || editor.modules.has(owner);
  };

  // ─── Direct API (spec requires these on editor directly) ────────────────

  editor.getJSON = () => editor.utils.getJSON();
  editor.setJSON = (ast) => editor.utils.setJSON(ast);
  editor.setContent = (ast) => editor.utils.setJSON(ast);   // familiar alias
  editor.getText = () => editor.utils.getText();

  // ─── History state ──────────────────────────────────────────────────────
  // Hosts need these to enable/disable undo buttons.
  editor.canUndo = () => history.canUndo();
  editor.canRedo = () => history.canRedo();
  editor.clearHistory = () => { history.clear(); editor._dirty = false; };
  editor.historySize = () => history.size;

  // ─── Dirty tracking ─────────────────────────────────────────────────────
  // "Has the document changed since the last save?" — needed for unsaved-work
  // prompts. markClean() is called by the host after a successful save.
  editor._dirty = false;
  editor.isDirty = () => editor._dirty;
  editor.markClean = () => { editor._dirty = false; };

  // ─── Read-only mode ─────────────────────────────────────────────────────
  // A real requirement (published view, permissions, review mode). Blocks
  // every mutation path, not just the visual affordance.
  editor._editable = true;
  editor.isEditable = () => editor._editable;
  editor.setEditable = (on) => {
    editor._editable = !!on;
    editor.element.setAttribute("contenteditable", String(!!on));
    editor.element.setAttribute("aria-readonly", String(!on));
  };

  // ─── onChange shorthand ─────────────────────────────────────────────────
  // The single most common host need: "tell me when the document changed".
  // Returns an unsubscribe function.
  editor.onChange = (fn) => {
    const handler = (ctx) => fn(editor.getJSON(), ctx.transaction);
    events.on("transaction", null, handler);
    return () => events.off("transaction", null, handler);
  };

  editor.version = "1.0.0";

  // ─── Event system ────────────────────────────────────────────────────────

  editor.onEvent = (eventName, nodeType, callback) => {
    events.on(eventName, nodeType, callback);
  };

  editor.offEvent = (eventName, nodeType, callback) => {
    events.off(eventName, nodeType, callback);
  };

  editor.emit = (eventName, ctx) => {
    return events.emit(eventName, { editor, ...ctx });
  };

  // ─── Module system ───────────────────────────────────────────────────────

  function loadModule(name) {
    if (editor.modules.has(name)) return editor.modules.get(name);

    const factory = BUILTIN_MODULES.get(name);
    if (!factory) throw new Error(`Unknown module: ${name}`);

    const settings = editor.moduleSettings.get(name) || {};
    const mod = factory(settings);
    mod.name = name;
    mod.settings = settings;
    mod.enabled = true;
    mod.editor = editor;

    // Check command name collisions
    if (mod.commands) {
      for (const cmdName of Object.keys(mod.commands)) {
        if (editor[cmdName] !== undefined) {
          throw new Error(`Command name collision: "${cmdName}" from module "${name}"`);
        }
      }
    }

    // Register commands
    if (mod.commands) {
      for (const [cmdName, cmdFn] of Object.entries(mod.commands)) {
        editor[cmdName] = wrapCommand(mod, cmdName, cmdFn);
      }
    }

    // Register events
    if (mod.events) {
      for (const [eventName, handler] of Object.entries(mod.events)) {
        events.on(eventName, null, handler.bind(mod));
      }
    }

    if (mod.onEnable) mod.onEnable(editor);

    editor.modules.set(name, mod);
    editor.moduleOrder.push(name);
    return mod;
  }

  // Bind a module command with error containment. Commands run on hot paths
  // like keydown; an escaping exception would wedge the editor, so a module
  // bug is reported to the host instead of propagating.
  function wrapCommand(mod, cmdName, cmdFn) {
    const bound = cmdFn.bind(mod);
    return (...args) => {
      try { return bound(...args); }
      catch (err) { reportError("command", cmdName, err); return undefined; }
    };
  }

  // Load a module instance directly (from the modules option)
  function loadModuleInstance(mod) {
    const name = mod.name || "unknown";

    // Check for command name collisions
    if (mod.commands) {
      for (const cmdName of Object.keys(mod.commands)) {
        if (editor[cmdName] !== undefined) {
          throw new Error(`Command name collision: "${cmdName}" from module "${name}"`);
        }
      }
    }

    // Register commands
    if (mod.commands) {
      for (const [cmdName, cmdFn] of Object.entries(mod.commands)) {
        editor[cmdName] = wrapCommand(mod, cmdName, cmdFn);
      }
    }

    // Register events
    if (mod.events) {
      for (const [eventName, handler] of Object.entries(mod.events)) {
        events.on(eventName, null, handler.bind(mod));
      }
    }

    mod.editor = editor;
    if (mod.onEnable) mod.onEnable(editor);

    editor.modules.set(name, mod);
    editor.moduleOrder.push(name);
    return mod;
  }

  function unloadModule(name) {
    const mod = editor.modules.get(name);
    if (!mod) return;

    if (mod.onDisable) mod.onDisable(editor);

    if (mod.commands) {
      for (const cmdName of Object.keys(mod.commands)) {
        delete editor[cmdName];
      }
    }

    if (mod.events) {
      for (const eventName of Object.keys(mod.events)) {
        events.off(eventName);
      }
    }

    editor.modules.delete(name);
    editor.moduleOrder = editor.moduleOrder.filter((n) => n !== name);
  }

  editor.enable = (name) => {
    editor.disabledModules.delete(name);
    loadModule(name);
  };

  editor.disable = (name) => {
    editor.disabledModules.add(name);
    unloadModule(name);
  };

  // ─── Initialize modules ──────────────────────────────────────────────────

  if (modulesOption) {
    // Explicit modules array — highest priority, use verbatim
    for (const m of modulesOption) {
      if (typeof m === "string") {
        if (BUILTIN_MODULES.has(m)) loadModule(m);
      } else {
        // m is a module instance
        loadModuleInstance(m);
      }
    }
  } else if (enabled) {
    for (const name of Object.keys(enabled)) {
      if (BUILTIN_MODULES.has(name)) loadModule(name);
    }
  } else if (disabled) {
    for (const name of [...BUILTIN_MODULES.keys()]) {
      if (!disabled[name]) loadModule(name);
    }
  } else {
    // Default: load history + basicMarks
    if (BUILTIN_MODULES.has("history")) loadModule("history");
    if (BUILTIN_MODULES.has("basicMarks")) loadModule("basicMarks");
  }

  // ─── Initialize view ─────────────────────────────────────────────────────

  editor.element.setAttribute("contenteditable", "true");
  editor.element.setAttribute("data-headless-editor", "true");

  // Accessibility baseline. The engine owns no UI, but it DOES own this
  // element, and a contenteditable without these is unusable with a screen
  // reader. Hosts can override any of them afterwards.
  //   role=textbox + aria-multiline: announces it as a multi-line text field
  //   spellcheck: left to the host's config
  if (!editor.element.hasAttribute("role")) {
    editor.element.setAttribute("role", "textbox");
  }
  if (!editor.element.hasAttribute("aria-multiline")) {
    editor.element.setAttribute("aria-multiline", "true");
  }
  if (options.ariaLabel) {
    editor.element.setAttribute("aria-label", options.ariaLabel);
  }
  if (options.spellcheck !== undefined) {
    editor.element.setAttribute("spellcheck", String(!!options.spellcheck));
  }

  syncViewFromModel();

  // Set initial selection to start of first block
  if (editor.doc.content.length > 0) {
    editor.selection = cursor(["content", 0, "content", 0], 0);
    setDomSelection(editor.element, editor.selection);
  }

  // ─── Key handling ────────────────────────────────────────────────────────

  function handleKeyDown(e) {
    if (editor._compositionActive) return;

    switch (e.key) {
      case "Enter":
        if (!e.shiftKey) {
          e.preventDefault();
          if (!editor.selection) readDomSelection();
          if (!editor.selection) return;
          // Atomic block: Enter opens a paragraph BELOW instead of breaking it.
          const anchorBlock = resolveBlock(editor.doc, editor.selection.anchor);
          if (anchorBlock && isAtomicType(anchorBlock.block.type)) {
            const { containerPath, index } = anchorBlock;
            executeCommand("break", (tr) => {
              tr.insertNode(containerPath, index + 1, paragraph());
              tr.setResolvedSelection(
                cursor([...containerPath, "content", index + 1, "content", 0], 0));
            });
            return;
          }
          editor.utils.break();
        }
        break;
      case "Backspace":
        e.preventDefault();
        if (!editor.selection) readDomSelection();
        if (!editor.selection) return;
        if (!isCollapsed(editor.selection)) {
          editor.utils.deleteAcross();
        } else {
          const pos = editor.selection.anchor;
          // Caret parked ON an atomic block: remove the whole block.
          if (pos.path.length === 2 && typeof pos.path[1] === "number") {
            const node = resolve(editor.doc, pos.path);
            if (node && isAtomicType(node.type)) {
              const delIdx = pos.path[1];
              const remaining = (editor.doc.content?.length ?? 1) - 1;
              const nextIdx = Math.max(0, Math.min(delIdx, remaining - 1));
              executeCommand("deleteNode", (tr) => {
                tr.deleteNode([], delIdx);
                tr.setResolvedSelection(cursor(["content", nextIdx], 0));
              });
              return;
            }
          }
          const blockInfo = getBlockInfo(editor.doc, pos);
          if (!blockInfo) return;
          if (pos.path[3] === 0 && pos.offset === 0) {
            editor.utils.mergeBlocks("backward");
          } else {
            executeCommand("deleteBackward", (tr) => {
              const blockPath = getBlockPath(pos);
              const textIndex = pos.path[3];
              tr.deleteText(blockPath, textIndex, pos.offset - 1, 1);
              tr.setSelection(cursor(pos.path, pos.offset - 1));
            });
          }
        }
        break;
      case "Delete":
        e.preventDefault();
        if (!editor.selection) readDomSelection();
        if (!editor.selection) return;
        if (!isCollapsed(editor.selection)) {
          editor.utils.deleteAcross();
        } else {
          const pos = editor.selection.anchor;
          // Symmetric forward removal of an atomic block.
          if (pos.path.length === 2 && typeof pos.path[1] === "number") {
            const node = resolve(editor.doc, pos.path);
            if (node && isAtomicType(node.type)) {
              const delIdx = pos.path[1];
              const remaining = (editor.doc.content?.length ?? 1) - 1;
              const nextIdx = Math.max(0, Math.min(delIdx, remaining - 1));
              executeCommand("deleteNode", (tr) => {
                tr.deleteNode([], delIdx);
                tr.setResolvedSelection(cursor(["content", nextIdx], 0));
              });
              return;
            }
          }
          const textNode = resolve(editor.doc, pos.path);
          if (textNode && textNode.type === "text" && pos.offset < textNode.text.length) {
            executeCommand("deleteForward", (tr) => {
              const blockPath = getBlockPath(pos);
              const textIndex = pos.path[3];
              tr.deleteText(blockPath, textIndex, pos.offset, 1);
            });
          }
        }
        break;
      case "z":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) editor.redo();
          else editor.undo();
        }
        break;
      case "y":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          editor.redo();
        }
        break;
    }
  }

  function handleInput(e) {
    if (editor._compositionActive) return;

    if (e.inputType === "insertText" && e.data) {
      e.preventDefault();
      if (!editor.selection) readDomSelection();
      if (!editor.selection) return;
      // Typing over a selection must REPLACE it. Without this the selected
      // text survived and the new character was merely inserted at the
      // anchor, silently duplicating content.
      replaceSelectionWithText(e.data);
    }
  }

  function handleCompositionStart(e) {
    editor._compositionActive = true;
    editor._compositionText = "";
    events.emit("compositionStart", { editor, data: e.data });
  }

  function handleCompositionUpdate(e) {
    editor._compositionText = e.data || "";
    events.emit("compositionUpdate", { editor, data: e.data });
  }

  function handleCompositionEnd(e) {
    editor._compositionActive = false;
    const composedText = e.data || editor._compositionText;
    events.emit("compositionEnd", { editor, data: e.data });
    if (composedText && editor.selection) {
      // Same rule as typing: an IME commit over a selection replaces it.
      replaceSelectionWithText(composedText);
    }
  }

  function handleSelectionChange() {
    if (editor._compositionActive) return;
    const sel = getDomSelection(editor.doc, editor.element);
    if (sel) {
      editor.selection = sel;
      events.emit("selectionChange", { editor, selection: sel });
    }
  }

  function handleFocus() { events.emit("focus", { editor }); }
  function handleBlur() { events.emit("blur", { editor }); }

  // ─── Event listeners ─────────────────────────────────────────────────────

  editor.element.addEventListener("keydown", handleKeyDown);
  editor.element.addEventListener("input", handleInput);
  editor.element.addEventListener("compositionstart", handleCompositionStart);
  editor.element.addEventListener("compositionupdate", handleCompositionUpdate);
  editor.element.addEventListener("compositionend", handleCompositionEnd);
  editor.element.addEventListener("focus", handleFocus);
  editor.element.addEventListener("blur", handleBlur);
  document.addEventListener("selectionchange", handleSelectionChange);

  // ─── Undo/Redo ───────────────────────────────────────────────────────────

  // history.undo() already returns a ready-to-apply unit:
  //   .steps          = the inverted steps to apply now
  //   .afterSelection = the selection to restore (the pre-transaction selection)
  // Do NOT re-invert here — that was the double-inversion bug.
  editor.undo = () => {
    const entry = history.undo(editor.doc);
    if (!entry) return;
    const tr = new Transaction(editor.doc, editor.selection);
    for (const step of entry.steps) {
      tr.steps.push(step);
    }
    // Selection is restored verbatim (already valid for the reverted document),
    // so it must not be mapped through the inverse steps again.
    const result = applyTransaction(tr, entry.afterSelection);
    syncViewFromModel();
    setDomSelection(editor.element, editor.selection);
    events.emit("undo", { editor, result });
    events.emit("transaction", { editor, transaction: result });
  };

  editor.redo = () => {
    const entry = history.redo(editor.doc);
    if (!entry) return;
    const tr = new Transaction(editor.doc, editor.selection);
    for (const step of entry.steps) {
      tr.steps.push(step);
    }
    // Fall back to the current selection rather than restoring `undefined`
    // and wiping it — redo must never leave the user with no cursor.
    const target = entry.afterSelection ?? saveSelection(editor.selection);
    const result = applyTransaction(tr, target);
    syncViewFromModel();
    setDomSelection(editor.element, editor.selection);
    events.emit("redo", { editor, result });
    events.emit("transaction", { editor, transaction: result });
  };

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  // Tear the editor down completely.
  //
  // Must release EVERY reference the engine holds, or a host that mounts and
  // unmounts editors (a tabbed app, a virtualised list) leaks a document plus
  // its history on each cycle. Destroy is also idempotent: hosts frequently
  // call it from both an explicit teardown and a framework unmount hook.
  editor.destroy = () => {
    if (editor._destroyed) return;
    editor._destroyed = true;

    editor.element.removeEventListener("keydown", handleKeyDown);
    editor.element.removeEventListener("input", handleInput);
    editor.element.removeEventListener("compositionstart", handleCompositionStart);
    editor.element.removeEventListener("compositionupdate", handleCompositionUpdate);
    editor.element.removeEventListener("compositionend", handleCompositionEnd);
    editor.element.removeEventListener("focus", handleFocus);
    editor.element.removeEventListener("blur", handleBlur);
    document.removeEventListener("selectionchange", handleSelectionChange);

    // Modules get BOTH hooks: onDisable to detach, then onDestroy for
    // permanent cleanup. Previously only onDisable ran, so a module holding
    // a timer or observer released in onDestroy leaked (spec Section 3).
    for (const name of [...editor.moduleOrder]) {
      const mod = editor.modules.get(name);
      unloadModule(name);
      try { mod?.onDestroy?.(editor); }
      catch (err) { reportError("module.onDestroy", name, err); }
    }

    events.clear();
    history.clear();

    // Drop large references so the document can be collected even if the
    // host keeps the editor object around.
    editor.doc = { type: "doc", content: [] };
    editor.selection = null;
    editor._contextOptions = [];
    editor._iconLibrary = null;
    invalidateView(editor.element);
    editor.element.removeAttribute("contenteditable");
  };

  // ─── Context menu ────────────────────────────────────────────────────────

  editor.getContextMenu = (event) => generateContextMenu(editor, event, events);
  editor.registerContextOption = (option) => { editor._contextOptions.push(option); };
  editor.removeContextOption = (id) => {
    editor._contextOptions = editor._contextOptions.filter((o) => o.id !== id);
  };
  // Host fully overrides the icon-name mapping (Font Awesome, Lucide, custom).
  editor.setIconLibrary = (map) => { editor._iconLibrary = { ...map }; };
  // Tag name the host should wrap icons in (default "i", spec §8).
  editor.setIconTag = (tag) => { editor._iconTag = tag; };

  // ─── Settings ────────────────────────────────────────────────────────────

  editor.setModuleSetting = (moduleName, key, value) => {
    const mod = editor.modules.get(moduleName);
    if (mod) mod.settings[key] = value;
    if (!editor.moduleSettings.has(moduleName)) editor.moduleSettings.set(moduleName, {});
    editor.moduleSettings.get(moduleName)[key] = value;
  };

  editor.getModuleSetting = (moduleName, key) => {
    const settings = editor.moduleSettings.get(moduleName);
    return settings ? settings[key] : undefined;
  };

  return editor;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function editor_schemaFilter(node, schema) {
  return schema.filterNode(node);
}

const LEAF_BLOCK_TYPES = new Set(["paragraph", "heading", "blockquote", "codeblock"]);
function isLeafBlockType(t) { return LEAF_BLOCK_TYPES.has(t); }

// positionAt() yields a single position; selections need {anchor, head}.
function asRange(pos) {
  return pos ? { anchor: pos, head: pos } : null;
}

// Locate the rendered element for a model path (used for scrollIntoView).
function findElementForPath(root, path) {
  let el = root;
  for (let i = 0; i < path.length; i += 2) {
    if (path[i] !== "content") return null;
    const idx = path[i + 1];
    if (typeof idx !== "number" || !el.children || idx >= el.children.length) return null;
    el = el.children[idx];
  }
  return el;
}

// Depth-first list of every leaf-block path in the document, in order.
function allLeafBlocks(doc, path = [], out = []) {
  const node = path.length ? resolve(doc, path) : doc;
  if (!node) return out;
  const kids = node.content || [];
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    if (!child || child.type === "text") continue;
    const childPath = [...path, "content", i];
    if (isLeafBlockType(child.type)) out.push(childPath);
    else allLeafBlocks(doc, childPath, out);
  }
  return out;
}

// Force a selection to point at real nodes. Anything unresolvable is snapped
// to the nearest surviving leaf block, so the editor can never end up in a
// state where commands silently do nothing.
function clampSelection(doc, sel) {
  if (!sel) return sel;

  const fix = (pos) => {
    if (!pos || !Array.isArray(pos.path)) return null;
    const node = resolve(doc, pos.path);

    // Text node: clamp the offset into range.
    if (node && node.type === "text") {
      return { path: pos.path, offset: Math.min(pos.offset | 0, node.text.length) };
    }
    // Block-level caret in a real (empty) block: legal, keep it.
    if (node && (isLeafBlockType(node.type) || isAtomicType(node.type))) {
      return { path: pos.path, offset: 0 };
    }

    // A path one level deeper than an existing EMPTY leaf block is legal —
    // it means "the caret is in this block, which has no text node yet".
    // Snapping it away here made Enter-at-end leave the caret in the old
    // block instead of the newly created one.
    if (pos.path.length >= 4) {
      const owner = resolve(doc, pos.path.slice(0, -2));
      if (owner && isLeafBlockType(owner.type) &&
          (owner.content || []).length === 0) {
        return { path: pos.path.slice(0, -2), offset: 0 };
      }
    }

    // Unresolvable: walk up to the closest surviving ancestor, then take its
    // first leaf block. Falls back to the document's first leaf block.
    for (let i = pos.path.length - 2; i >= 2; i -= 2) {
      const anc = resolve(doc, pos.path.slice(0, i));
      if (!anc) continue;
      const leaves = allLeafBlocks(doc, pos.path.slice(0, i));
      if (leaves.length) return { path: leaves[0], offset: 0 };
    }
    const all = allLeafBlocks(doc);
    return all.length ? { path: all[0], offset: 0 } : null;
  };

  const anchor = fix(sel.anchor);
  const head = fix(sel.head);
  if (!anchor || !head) return null;
  return { anchor, head };
}

// Character offset of a position within its own block.
export function absCharIn(doc, pos) {
  const block = doc.content?.[pos.path[1]];
  if (!block) return 0;
  const textIndex = pos.path[3];
  if (typeof textIndex !== "number") return 0;
  let n = 0;
  const kids = block.content || [];
  for (let i = 0; i < textIndex && i < kids.length; i++) n += kids[i]?.text?.length ?? 0;
  return n + pos.offset;
}

// Text nodes of a block between two character offsets, marks preserved.
// Used by deleteAcross to build the surviving content in one pass.
export function sliceBlock(doc, blockIndex, from, to) {
  const block = doc.content?.[blockIndex];
  if (!block) return [];
  const out = [];
  let cursorAt = 0;
  for (const node of block.content || []) {
    if (!node || node.type !== "text") { cursorAt += 0; continue; }
    const len = node.text.length;
    const nodeStart = cursorAt;
    const nodeEnd = cursorAt + len;
    cursorAt = nodeEnd;

    const a = Math.max(from, nodeStart);
    const b = Math.min(to, nodeEnd);
    if (b <= a) continue;

    const piece = node.text.slice(a - nodeStart, b - nodeStart);
    if (piece) out.push({ type: "text", text: piece, marks: [...(node.marks || [])] });
  }
  return out;
}

// ── Absolute character positions ────────────────────────────────────────────
// { block, char } where `char` counts characters from the start of the block,
// across all of its text nodes. Stable under any re-splitting of those nodes.

export function posToAbs(doc, pos) {
  if (!pos || !Array.isArray(pos.path)) return null;
  const block = pos.path[1];
  const blockNode = doc.content?.[block];
  if (!blockNode) return null;

  const textIndex = pos.path[3];
  let char = 0;

  if (typeof textIndex === "number") {
    const kids = blockNode.content || [];
    for (let i = 0; i < textIndex && i < kids.length; i++) {
      char += kids[i]?.text?.length ?? 0;
    }
    char += pos.offset;
  }
  return { block, char };
}

export function absToPos(doc, abs) {
  if (!abs) return null;
  const blockNode = doc.content?.[abs.block];
  if (!blockNode) return null;

  const kids = blockNode.content || [];
  if (!kids.length) {
    // Empty block: the caret lives on the block itself.
    return { path: ["content", abs.block], offset: 0 };
  }

  let remaining = abs.char;
  for (let i = 0; i < kids.length; i++) {
    const len = kids[i]?.text?.length ?? 0;
    // `<=` so a position at a node's end binds to that node, not the next.
    if (remaining <= len) {
      return { path: ["content", abs.block, "content", i], offset: remaining };
    }
    remaining -= len;
  }

  const last = kids.length - 1;
  return {
    path: ["content", abs.block, "content", last],
    offset: kids[last]?.text?.length ?? 0,
  };
}

// Split a NODE path into the (parentPath, index) pair the transaction API
// expects. A node path always ends with ["content", <number>], and the
// transaction's parentPath must point at the OBJECT owning that array.
//
//   ["content", 1]                  -> parentPath [],                index 1
//   ["content", 0, "content", 2]    -> parentPath ["content", 0],    index 2
//
// The naive `path[path.length - 2]` returns the literal string "content" for
// top-level blocks, which silently corrupted deleteNode/replaceNode/setAttrs.
export function splitNodePath(path) {
  if (!Array.isArray(path) || path.length < 2) {
    return { parentPath: [], index: null };
  }
  const index = path[path.length - 1];
  if (typeof index !== "number") {
    return { parentPath: [], index: null };
  }
  return { parentPath: path.slice(0, -2), index };
}

// Default command -> icon-name dictionary. The engine ships names only,
// never assets. editor.setIconLibrary() replaces this mapping wholesale.
export const DEFAULT_ICON_MAP = {
  bold: "bold", italic: "italic", underline: "underline",
  strikethrough: "strikethrough", code: "code", link: "link",
  copy: "copy", cut: "scissors", paste: "clipboard",
  "select-all": "select-all", undo: "undo", redo: "redo",
};

function resolveIcon(editor, id) {
  const lib = editor._iconLibrary;
  if (lib && Object.prototype.hasOwnProperty.call(lib, id)) return lib[id];
  return DEFAULT_ICON_MAP[id] || id;
}

// Is the given mark present across the whole current selection?
function isMarkActive(editor, markType) {
  const sel = editor.selection;
  if (!sel) return false;
  const node = editor.utils.getNode(sel.anchor.path);
  if (!node || node.type !== "text") return false;
  return (node.marks || []).some((m) => m.type === markType);
}

// Walk the current selection's path looking for an ancestor of the given type.
// Uses the model (never DOM guesses), per spec §8.
function isInsideNodeType(editor, type) {
  const sel = editor.selection;
  if (!sel) return false;
  const path = sel.anchor.path;
  for (let i = 2; i <= path.length; i += 2) {
    const node = editor.utils.getNode(path.slice(0, i));
    if (node && node.type === type) return true;
  }
  return false;
}

function generateContextMenu(editor, event, events) {
  const items = [];
  const sel = editor.selection;
  const isSingleNode = sel && (isCollapsed(sel) || sel.anchor.path[1] === sel.head.path[1]);
  const isMultiNode = sel && !isSingleNode;

  items.push({ id: "copy", label: "Copy", command: "copy", type: "action" });
  items.push({ id: "cut", label: "Cut", command: "cut", type: "action" });
  items.push({ id: "paste", label: "Paste", command: "paste", type: "action" });
  items.push({ id: "select-all", label: "Select All", command: "selectAll", type: "action" });

  // Case A (spec §8): selection inside a SINGLE node -> formatting + transforms.
  // Case B: selection crosses nodes -> clipboard/select-all ONLY.
  // Formatting is offered only if it passes the same capability gate the
  // command itself uses, so the menu can never advertise a no-op.
  if (isSingleNode) {
    for (const m of ["bold", "italic", "underline", "strikethrough", "code"]) {
      if (editor.canUseMark(m)) {
        items.push({
          id: m,
          label: m.charAt(0).toUpperCase() + m.slice(1),
          command: m,
          type: "format",
          active: isMarkActive(editor, m),
          disabled: false,
          icon: resolveIcon(editor, m),
          iconTag: editor._iconTag || "i",
        });
      }
    }
    if (editor.canUseMark("link")) {
      items.push({
        id: "link", label: "Link", command: "setLink", type: "format",
        active: isMarkActive(editor, "link"),
        icon: resolveIcon(editor, "link"),
        iconTag: editor._iconTag || "i",
      });
    }
    // Node-level transforms / settings (Case A only).
    if (editor.canUseNode("paragraph")) {
      items.push({ id: "to-paragraph", label: "Turn into paragraph", command: "setParagraph", type: "settings" });
    }
    if (editor.canUseNode("heading")) {
      items.push({ id: "heading-level", label: "Heading level", command: "setHeading", type: "settings" });
    }
  }

  // Structure-aware contributions from modules, merged in only when the module
  // is enabled AND the selection genuinely satisfies the `when` condition.
  const inTable = isInsideNodeType(editor, "table");
  const inList = isInsideNodeType(editor, "bulletList") || isInsideNodeType(editor, "orderedList");

  for (const [name, mod] of editor.modules) {
    if (!mod.contextMenu) continue;
    for (const entry of mod.contextMenu) {
      const ok =
        entry.when === "always" ||
        (entry.when === "single-node" && isSingleNode) ||
        (entry.when === "multi-node" && isMultiNode) ||
        (entry.when === "inside-table" && inTable) ||
        (entry.when === "inside-list" && inList);
      if (ok) {
        items.push({
          ...entry,
          type: entry.type || "action",
          icon: entry.icon ? resolveIcon(editor, entry.icon) : undefined,
          iconTag: editor._iconTag || "i",
        });
      }
    }
  }

  // Add registered context options
  if (editor._contextOptions) {
    for (const opt of editor._contextOptions) {
      if (opt.when === "always" ||
          (opt.when === "single-node" && isSingleNode) ||
          (opt.when === "multi-node" && isMultiNode)) {
        items.push({
          id: opt.id,
          label: opt.label,
          icon: opt.icon,
          type: "action",
          run: opt.run,
        });
      }
    }
  }

  const ctx = events.emit("contextMenu", { editor, items, event });
  return ctx.items || items;
}
