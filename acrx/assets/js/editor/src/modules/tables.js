// src/modules/tables.js — Tables with real merge/split via colspan/rowspan.
//
// Structure:
//   table   attrs: { headerRow?, headerCol? }
//     └─ tableRow
//          └─ tableCell  attrs: { colspan?, rowspan?, align?, header? }
//               └─ paragraph…
//
// Merge/split use a grid map that expands spans into occupied slots, which is
// the only reliable way to reason about a table where earlier merges already
// shifted the column geometry.

import { paragraph, cloneNode } from "../model.js";

function emptyCell(attrs = {}) {
  return { type: "tableCell", attrs: { ...attrs }, content: [paragraph([])] };
}

function makeRow(cols) {
  return {
    type: "tableRow",
    attrs: {},
    content: Array.from({ length: cols }, () => emptyCell()),
  };
}

export function createTable(rows = 3, cols = 3) {
  return {
    type: "table",
    attrs: {},
    content: Array.from({ length: rows }, () => makeRow(cols)),
  };
}

const span = (cell, key) => Math.max(1, cell?.attrs?.[key] ?? 1);

// Build a grid where every physical slot points at its owning cell. Cells with
// colspan/rowspan occupy several slots, so `grid[r][c]` is always defined and
// merges computed against it stay correct on an already-merged table.
function buildGrid(table) {
  const grid = [];
  const rows = table.content || [];

  rows.forEach((row, r) => {
    if (!grid[r]) grid[r] = [];
    let c = 0;
    (row.content || []).forEach((cell, cellIndex) => {
      while (grid[r][c]) c++; // skip slots claimed by a rowspan above
      const cs = span(cell, "colspan");
      const rs = span(cell, "rowspan");
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          if (!grid[r + dr]) grid[r + dr] = [];
          grid[r + dr][c + dc] = {
            cell, row: r, col: c, cellIndex,
            isAnchor: dr === 0 && dc === 0,
          };
        }
      }
      c += cs;
    });
  });

  const width = grid.reduce((m, row) => Math.max(m, row.length), 0);
  return { grid, width, height: grid.length };
}

// Locate the table containing the cursor, plus the cell it sits in.
function findTableContext(editor, position) {
  const pos = position || editor.selection?.anchor;
  if (!pos) return null;

  let tablePath = null;
  for (let i = 2; i <= pos.path.length; i += 2) {
    const node = editor.utils.getNode(pos.path.slice(0, i));
    if (node && node.type === "table") { tablePath = pos.path.slice(0, i); break; }
  }
  if (!tablePath) return null;

  const table = editor.utils.getNode(tablePath);
  if (!table) return null;

  const rowIndex = pos.path[tablePath.length + 1];
  const cellIndex = pos.path[tablePath.length + 3];
  if (typeof rowIndex !== "number" || typeof cellIndex !== "number") return null;

  const rowPath = [...tablePath, "content", rowIndex];
  const cellPath = [...rowPath, "content", cellIndex];
  const cell = editor.utils.getNode(cellPath);
  if (!cell) return null;

  const { grid, width, height } = buildGrid(table);
  let gridCol = 0;
  const rowSlots = grid[rowIndex] || [];
  for (let c = 0; c < rowSlots.length; c++) {
    const slot = rowSlots[c];
    if (slot && slot.isAnchor && slot.cellIndex === cellIndex) { gridCol = c; break; }
  }

  return {
    tablePath, table, rowIndex, cellIndex, rowPath, cellPath, cell,
    grid, width, height, gridCol,
    tableIndex: tablePath[tablePath.length - 1],
  };
}

export function tables(options = {}) {
  return {
    name: "tables",
    settings: { defaultRows: 3, defaultCols: 3, ...options },

    commands: {
      insertTable(rows, cols) {
        const editor = this.editor;
        if (!editor.canUseNode("table")) return false;
        const r = rows ?? this.settings.defaultRows;
        const c = cols ?? this.settings.defaultCols;
        const pos = editor.selection?.anchor;
        const at = pos ? pos.path[1] + 1 : (editor.doc.content || []).length;

        editor.utils.transaction((tr) => {
          tr.insertNode([], at, createTable(r, c));
          const landing = ["content", at, "content", 0, "content", 0, "content", 0, "content", 0];
          tr.setResolvedSelection({
            anchor: { path: landing, offset: 0 },
            head: { path: landing, offset: 0 },
          });
        });
        return true;
      },

      // ── Rows / columns ───────────────────────────────────────────────
      insertRow(position = "after") {
        const editor = this.editor;
        const ctx = findTableContext(editor);
        if (!ctx) return false;
        const at = position === "before" ? ctx.rowIndex : ctx.rowIndex + 1;

        editor.utils.transaction((tr) => {
          tr.insertNode(ctx.tablePath, at, makeRow(ctx.width));
          // Any rowspan crossing the insertion line must grow by one.
          for (let c = 0; c < ctx.width; c++) {
            const slot = ctx.grid[at]?.[c];
            if (slot && !slot.isAnchor && slot.row < at) {
              const p = [...ctx.tablePath, "content", slot.row];
              tr.setAttrs(p, slot.cellIndex, {
                ...slot.cell.attrs,
                rowspan: span(slot.cell, "rowspan") + 1,
              });
            }
          }
        });
        return true;
      },

      insertColumn(position = "after") {
        const editor = this.editor;
        const ctx = findTableContext(editor);
        if (!ctx) return false;
        const at = position === "before" ? ctx.gridCol : ctx.gridCol + 1;

        editor.utils.transaction((tr) => {
          for (let r = ctx.height - 1; r >= 0; r--) {
            const slot = ctx.grid[r]?.[at];
            // A colspan straddling the insertion point widens instead.
            if (slot && !slot.isAnchor && slot.col < at) {
              const p = [...ctx.tablePath, "content", slot.row];
              tr.setAttrs(p, slot.cellIndex, {
                ...slot.cell.attrs,
                colspan: span(slot.cell, "colspan") + 1,
              });
              continue;
            }
            const rowPath = [...ctx.tablePath, "content", r];
            const insertAt = slot ? slot.cellIndex : (ctx.table.content[r]?.content?.length ?? 0);
            tr.insertNode(rowPath, insertAt, emptyCell());
          }
        });
        return true;
      },

      deleteRow() {
        const editor = this.editor;
        const ctx = findTableContext(editor);
        if (!ctx) return false;
        // Deleting the only row deletes the table.
        if (ctx.height <= 1) return editor.deleteTable();

        editor.utils.transaction((tr) => {
          for (let c = 0; c < ctx.width; c++) {
            const slot = ctx.grid[ctx.rowIndex]?.[c];
            if (!slot) continue;
            if (!slot.isAnchor && slot.row < ctx.rowIndex) {
              // Shrink a rowspan that reaches into the deleted row.
              const p = [...ctx.tablePath, "content", slot.row];
              tr.setAttrs(p, slot.cellIndex, {
                ...slot.cell.attrs,
                rowspan: Math.max(1, span(slot.cell, "rowspan") - 1),
              });
            } else if (slot.isAnchor && span(slot.cell, "rowspan") > 1) {
              // An anchor that spans downward must survive in the next row.
              const below = ctx.rowIndex + 1;
              if (below < ctx.height) {
                const survivor = cloneNode(slot.cell);
                survivor.attrs = {
                  ...survivor.attrs,
                  rowspan: span(slot.cell, "rowspan") - 1,
                };
                tr.insertNode([...ctx.tablePath, "content", below], 0, survivor);
              }
            }
          }
          tr.deleteNode(ctx.tablePath, ctx.rowIndex);
        });
        return true;
      },

      deleteColumn() {
        const editor = this.editor;
        const ctx = findTableContext(editor);
        if (!ctx) return false;
        if (ctx.width <= 1) return editor.deleteTable();

        editor.utils.transaction((tr) => {
          for (let r = ctx.height - 1; r >= 0; r--) {
            const slot = ctx.grid[r]?.[ctx.gridCol];
            if (!slot) continue;
            const rowPath = [...ctx.tablePath, "content", slot.row];
            if (span(slot.cell, "colspan") > 1) {
              tr.setAttrs(rowPath, slot.cellIndex, {
                ...slot.cell.attrs,
                colspan: span(slot.cell, "colspan") - 1,
              });
            } else if (slot.isAnchor) {
              tr.deleteNode(rowPath, slot.cellIndex);
            }
          }
        });
        return true;
      },

      deleteTable() {
        const editor = this.editor;
        const ctx = findTableContext(editor);
        if (!ctx) return false;
        editor.utils.transaction((tr) => {
          tr.deleteNode([], ctx.tableIndex);
        });
        return true;
      },

      // ── Merge / split ────────────────────────────────────────────────
      //
      // Merge consumes the rectangle covered by the current selection. With a
      // collapsed cursor there is nothing to merge, so we absorb the cell to
      // the right — the common "merge with neighbour" gesture.
      mergeCells() {
        const editor = this.editor;
        const ctx = findTableContext(editor);
        if (!ctx) return false;

        const rect = selectionRect(editor, ctx);
        if (!rect) return false;
        const { top, left, bottom, right } = rect;
        if (top === bottom && left === right) return false;

        // Gather content from every anchor inside the rectangle.
        const absorbed = [];
        const victims = [];
        for (let r = top; r <= bottom; r++) {
          for (let c = left; c <= right; c++) {
            const slot = ctx.grid[r]?.[c];
            if (!slot || !slot.isAnchor) continue;
            if (r === top && c === left) continue; // the survivor
            absorbed.push(...(slot.cell.content || []).map(cloneNode));
            victims.push({ row: slot.row, cellIndex: slot.cellIndex });
          }
        }

        const anchorSlot = ctx.grid[top]?.[left];
        if (!anchorSlot) return false;

        // A merge must never empty a row. If every cell of some row in the
        // rectangle would be consumed, the geometry is degenerate (the whole
        // row is inside the selection) — refuse rather than emit a row with
        // zero cells, which is an invalid table.
        const rowCellCount = new Map();
        for (const v of victims) {
          rowCellCount.set(v.row, (rowCellCount.get(v.row) || 0) + 1);
        }
        for (const [row, removing] of rowCellCount) {
          const total = ctx.table.content[row]?.content?.length ?? 0;
          const keepsAnchor = row === anchorSlot.row;
          if (removing >= total && !keepsAnchor) return false;
        }

        editor.utils.transaction((tr) => {
          // Append absorbed content to the survivor.
          const anchorPath = [...ctx.tablePath, "content", anchorSlot.row,
                              "content", anchorSlot.cellIndex];
          absorbed.forEach((block, i) => {
            tr.insertNode(anchorPath, (anchorSlot.cell.content?.length ?? 0) + i, block);
          });

          // Grow the survivor to cover the rectangle.
          tr.setAttrs([...ctx.tablePath, "content", anchorSlot.row], anchorSlot.cellIndex, {
            ...anchorSlot.cell.attrs,
            colspan: right - left + 1,
            rowspan: bottom - top + 1,
          });

          // Remove the consumed cells, highest index first per row so the
          // earlier deletions don't shift the later ones.
          const byRow = new Map();
          for (const v of victims) {
            if (!byRow.has(v.row)) byRow.set(v.row, []);
            byRow.get(v.row).push(v.cellIndex);
          }
          for (const [row, indices] of byRow) {
            indices.sort((a, b) => b - a);
            for (const idx of indices) {
              tr.deleteNode([...ctx.tablePath, "content", row], idx);
            }
          }
        });
        return true;
      },

      // Split restores the slots a merged cell was occupying, keeping the
      // original content in the top-left and filling the rest with empties.
      splitCell() {
        const editor = this.editor;
        const ctx = findTableContext(editor);
        if (!ctx) return false;

        const cs = span(ctx.cell, "colspan");
        const rs = span(ctx.cell, "rowspan");
        if (cs === 1 && rs === 1) return false;

        editor.utils.transaction((tr) => {
          // Reset the anchor back to a 1x1 cell.
          const attrs = { ...ctx.cell.attrs };
          delete attrs.colspan;
          delete attrs.rowspan;
          tr.setAttrs(ctx.rowPath, ctx.cellIndex, attrs);

          // Re-create the freed slots, last row first to keep indices stable.
          for (let dr = rs - 1; dr >= 0; dr--) {
            const targetRow = ctx.rowIndex + dr;
            if (targetRow >= ctx.height) continue;
            const rowPath = [...ctx.tablePath, "content", targetRow];
            const startCol = dr === 0 ? 1 : 0; // row 0 keeps the anchor
            for (let dc = cs - 1; dc >= startCol; dc--) {
              const insertAt = dr === 0 ? ctx.cellIndex + 1 : 0;
              tr.insertNode(rowPath, insertAt, emptyCell());
            }
          }
        });
        return true;
      },

      // ── Formatting ───────────────────────────────────────────────────
      setCellAlign(align) {
        const editor = this.editor;
        if (!["left", "center", "right"].includes(align)) return false;
        const ctx = findTableContext(editor);
        if (!ctx) return false;
        editor.utils.transaction((tr) => {
          tr.setAttrs(ctx.rowPath, ctx.cellIndex, { ...ctx.cell.attrs, align });
        });
        return true;
      },

      toggleHeaderRow() {
        const editor = this.editor;
        const ctx = findTableContext(editor);
        if (!ctx) return false;
        const on = ctx.table.attrs?.headerRow === true;
        editor.utils.transaction((tr) => {
          const { parentPath, index } = splitPath(ctx.tablePath);
          tr.setAttrs(parentPath, index, { ...ctx.table.attrs, headerRow: !on });
          const firstRow = ctx.table.content?.[0];
          (firstRow?.content || []).forEach((cell, i) => {
            tr.setAttrs([...ctx.tablePath, "content", 0], i,
              { ...cell.attrs, header: !on });
          });
        });
        return true;
      },

      toggleHeaderColumn() {
        const editor = this.editor;
        const ctx = findTableContext(editor);
        if (!ctx) return false;
        const on = ctx.table.attrs?.headerCol === true;
        editor.utils.transaction((tr) => {
          const { parentPath, index } = splitPath(ctx.tablePath);
          tr.setAttrs(parentPath, index, { ...ctx.table.attrs, headerCol: !on });
          (ctx.table.content || []).forEach((row, r) => {
            const first = row.content?.[0];
            if (first) {
              tr.setAttrs([...ctx.tablePath, "content", r], 0,
                { ...first.attrs, header: !on });
            }
          });
        });
        return true;
      },

      // ── Introspection ────────────────────────────────────────────────
      isInTable() { return findTableContext(this.editor) !== null; },
      getTableSize() {
        const ctx = findTableContext(this.editor);
        return ctx ? { rows: ctx.height, cols: ctx.width } : null;
      },
      getCellPosition() {
        const ctx = findTableContext(this.editor);
        return ctx ? { row: ctx.rowIndex, col: ctx.gridCol } : null;
      },
    },

    contextMenu: [
      { id: "table-row-before", label: "Insert Row Above", command: "insertRow", when: "inside-table", type: "action" },
      { id: "table-row-after", label: "Insert Row Below", command: "insertRow", when: "inside-table", type: "action" },
      { id: "table-col-before", label: "Insert Column Left", command: "insertColumn", when: "inside-table", type: "action" },
      { id: "table-col-after", label: "Insert Column Right", command: "insertColumn", when: "inside-table", type: "action" },
      { id: "table-merge", label: "Merge Cells", command: "mergeCells", when: "inside-table", type: "action" },
      { id: "table-split", label: "Split Cell", command: "splitCell", when: "inside-table", type: "action" },
      { id: "table-del-row", label: "Delete Row", command: "deleteRow", when: "inside-table", type: "action" },
      { id: "table-del-col", label: "Delete Column", command: "deleteColumn", when: "inside-table", type: "action" },
      { id: "table-delete", label: "Delete Table", command: "deleteTable", when: "inside-table", type: "action" },
    ],

    onEnable(editor) {},
    onDisable(editor) {},
    onDestroy(editor) {},
  };
}

// The grid rectangle covered by the current selection. Collapsed selections
// fall back to "this cell plus the one to its right".
function selectionRect(editor, ctx) {
  const sel = editor.selection;
  if (!sel) return null;

  const headCtx = findTableContext(editor, sel.head);
  const anchorCtx = findTableContext(editor, sel.anchor);

  if (headCtx && anchorCtx &&
      (headCtx.rowIndex !== anchorCtx.rowIndex || headCtx.gridCol !== anchorCtx.gridCol)) {
    return normalizeRect(ctx,
      Math.min(anchorCtx.rowIndex, headCtx.rowIndex),
      Math.min(anchorCtx.gridCol, headCtx.gridCol),
      Math.max(anchorCtx.rowIndex, headCtx.rowIndex),
      Math.max(anchorCtx.gridCol, headCtx.gridCol));
  }

  const right = ctx.gridCol + span(ctx.cell, "colspan");
  if (right >= ctx.width) return null;
  return normalizeRect(ctx, ctx.rowIndex, ctx.gridCol,
    ctx.rowIndex + span(ctx.cell, "rowspan") - 1, right);
}

// Expand the rectangle until it contains no partially-covered spanning cell,
// so a merge can never slice a cell in half.
function normalizeRect(ctx, top, left, bottom, right) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        const slot = ctx.grid[r]?.[c];
        if (!slot) continue;
        const t = slot.row;
        const l = slot.col;
        const b = t + span(slot.cell, "rowspan") - 1;
        const rr = l + span(slot.cell, "colspan") - 1;
        if (t < top) { top = t; changed = true; }
        if (l < left) { left = l; changed = true; }
        if (b > bottom) { bottom = b; changed = true; }
        if (rr > right) { right = rr; changed = true; }
      }
    }
  }
  return { top, left, bottom, right };
}

function splitPath(path) {
  const index = path[path.length - 1];
  if (typeof index !== "number") return { parentPath: [], index: null };
  return { parentPath: path.slice(0, -2), index };
}
