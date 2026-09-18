// acrx/assets/js/editor/engines/table-engine.js
//
// ENGINE 39 — Table Engine (headless).
// Structured table model — never arbitrary HTML strings: rows, columns,
// cells with spans, insertion/deletion, merge/split, rectangular selection,
// navigation helpers, validation and serialization.

export const TABLE_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "table";

function tableError(operation, code, message) {
  const err = new Error(message);
  err.name = "TableError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function cell(content = "", attrs = {}) {
  return { content, colSpan: 1, rowSpan: 1, covered: false, attrs: { ...attrs } };
}

function cloneTable(t) {
  return JSON.parse(JSON.stringify(t));
}

function assertTable(t, operation) {
  if (!t || typeof t !== "object" || !Array.isArray(t.cells)) {
    throw tableError(operation, "INVALID_TABLE", "Table must contain a cells grid.");
  }
}

function gridSize(t) {
  const rows = t.cells.length;
  const cols = rows > 0 ? Math.max(...t.cells.map((r) => r.length)) : 0;
  return { rows, cols };
}

export function createTable(rows = 2, cols = 2, fill = "") {
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
    throw tableError("createTable", "INVALID_SIZE", "Table needs at least 1 row and 1 column.");
  }
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push(cell(typeof fill === "function" ? fill(r, c) : fill));
    cells.push(row);
  }
  return { rows, cols, cells, attrs: {} };
}

export function getCell(t, row, col) {
  assertTable(t, "getCell");
  if (!t.cells[row] || !t.cells[row][col]) {
    throw tableError("getCell", "OUT_OF_BOUNDS", `Cell (${row}, ${col}) is out of bounds.`);
  }
  return JSON.parse(JSON.stringify(t.cells[row][col]));
}

function masterOf(t, row, col) {
  // Resolve covered cells to their spanning master.
  for (let r = row; r >= 0; r--) {
    for (let c = (r === row ? col : t.cells[r].length - 1); c >= 0; c--) {
      const cand = t.cells[r] && t.cells[r][c];
      if (cand && !cand.covered && r + (cand.rowSpan || 1) > row && c + (cand.colSpan || 1) > col) {
        return { row: r, col: c, cell: cand };
      }
    }
  }
  return { row, col, cell: t.cells[row][col] };
}

export function setCell(t, row, col, patch) {
  assertTable(t, "setCell");
  const target = masterOf(t, row, col);
  const next = cloneTable(t);
  next.cells[target.row][target.col] = {
    ...next.cells[target.row][target.col],
    ...JSON.parse(JSON.stringify(patch || {})),
    covered: false,
  };
  return next;
}

export function insertRow(t, index, fill = "") {
  assertTable(t, "insertRow");
  const { rows, cols } = gridSize(t);
  if (index === undefined || index === null) index = rows;
  if (!Number.isInteger(index) || index < 0 || index > rows) throw tableError("insertRow", "OUT_OF_BOUNDS", `Row index ${index} out of bounds.`);
  const next = cloneTable(t);
  // Extend rowSpans crossing the insertion line instead of breaking them.
  for (let r = 0; r < index; r++) {
    for (let c = 0; c < next.cells[r].length; c++) {
      const cd = next.cells[r][c];
      if (!cd.covered && r + cd.rowSpan > index) cd.rowSpan += 1;
    }
  }
  const row = [];
  for (let c = 0; c < cols; c++) row.push(cell(typeof fill === "function" ? fill(index, c) : fill));
  next.cells.splice(index, 0, row);
  next.rows = next.cells.length;
  return normalizeTable(next);
}

export function deleteRow(t, index) {
  assertTable(t, "deleteRow");
  const { rows } = gridSize(t);
  if (!Number.isInteger(index) || index < 0 || index >= rows) throw tableError("deleteRow", "OUT_OF_BOUNDS", `Row index ${index} out of bounds.`);
  if (rows === 1) throw tableError("deleteRow", "LAST_ROW", "A table must keep at least one row.");
  const next = cloneTable(t);
  next.cells.splice(index, 1);
  for (let r = 0; r < next.cells.length; r++) {
    for (const cd of next.cells[r]) {
      if (!cd.covered && r < index && r + cd.rowSpan > index) cd.rowSpan = Math.max(1, cd.rowSpan - 1);
    }
  }
  next.rows = next.cells.length;
  return normalizeTable(next);
}

export function insertColumn(t, index, fill = "") {
  assertTable(t, "insertColumn");
  const { rows, cols } = gridSize(t);
  if (index === undefined || index === null) index = cols;
  if (!Number.isInteger(index) || index < 0 || index > cols) throw tableError("insertColumn", "OUT_OF_BOUNDS", `Column index ${index} out of bounds.`);
  const next = cloneTable(t);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < index; c++) {
      const cd = next.cells[r][c];
      if (cd && !cd.covered && c + cd.colSpan > index) cd.colSpan += 1;
    }
    next.cells[r].splice(index, 0, cell(typeof fill === "function" ? fill(r, index) : fill));
  }
  next.cols = Math.max(...next.cells.map((row) => row.length));
  return normalizeTable(next);
}

export function deleteColumn(t, index) {
  assertTable(t, "deleteColumn");
  const { rows, cols } = gridSize(t);
  if (!Number.isInteger(index) || index < 0 || index >= cols) throw tableError("deleteColumn", "OUT_OF_BOUNDS", `Column index ${index} out of bounds.`);
  if (cols === 1) throw tableError("deleteColumn", "LAST_COLUMN", "A table must keep at least one column.");
  const next = cloneTable(t);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < index; c++) {
      const cd = next.cells[r][c];
      if (cd && !cd.covered && c + cd.colSpan > index) cd.colSpan = Math.max(1, cd.colSpan - 1);
    }
    next.cells[r].splice(index, 1);
  }
  next.cols = Math.max(...next.cells.map((row) => row.length));
  return normalizeTable(next);
}

// Merge a rectangular range into its top-left master. Throws when the range
// overlaps an existing span partially (would corrupt the grid).
export function mergeCells(t, fromRow, fromCol, toRow, toCol) {
  assertTable(t, "mergeCells");
  const top = Math.min(fromRow, toRow); const bottom = Math.max(fromRow, toRow);
  const left = Math.min(fromCol, toCol); const right = Math.max(fromCol, toCol);
  const { rows, cols } = gridSize(t);
  if (top < 0 || bottom >= rows || left < 0 || right >= cols) throw tableError("mergeCells", "OUT_OF_BOUNDS", "Merge range is out of bounds.");
  if (top === bottom && left === right) throw tableError("mergeCells", "NO_OP", "Merging a single cell is a no-op.");
  const next = cloneTable(t);
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const cd = next.cells[r][c];
      if (cd.covered) throw tableError("mergeCells", "OVERLAP", `Cell (${r}, ${c}) is already covered by a span.`);
      if (!cd.covered && (cd.colSpan > 1 || cd.rowSpan > 1) && !(r === top && c === left)) {
        throw tableError("mergeCells", "OVERLAP", `Cell (${r}, ${c}) already spans multiple cells.`);
      }
    }
  }
  const master = next.cells[top][left];
  const texts = [];
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      if (r === top && c === left) continue;
      if (next.cells[r][c].content) texts.push(next.cells[r][c].content);
      next.cells[r][c] = { content: "", colSpan: 1, rowSpan: 1, covered: true, attrs: {} };
    }
  }
  master.colSpan = right - left + 1;
  master.rowSpan = bottom - top + 1;
  if (texts.length > 0) master.content = [master.content, ...texts].filter(Boolean).join("\n");
  return normalizeTable(next);
}

export function splitCell(t, row, col) {
  assertTable(t, "splitCell");
  const target = masterOf(t, row, col);
  if (target.cell.colSpan === 1 && target.cell.rowSpan === 1) {
    throw tableError("splitCell", "NO_OP", `Cell (${row}, ${col}) is not merged.`);
  }
  const next = cloneTable(t);
  const { row: mr, col: mc } = target;
  const m = next.cells[mr][mc];
  for (let r = mr; r < mr + m.rowSpan; r++) {
    for (let c = mc; c < mc + m.colSpan; c++) {
      next.cells[r][c] = cell("");
    }
  }
  next.cells[mr][mc].content = target.cell.content;
  return normalizeTable(next);
}

export function normalizeTable(t) {
  assertTable(t, "normalizeTable");
  const next = cloneTable(t);
  const width = Math.max(...next.cells.map((r) => r.length));
  for (const row of next.cells) {
    while (row.length < width) row.push(cell(""));
    for (const cd of row) {
      cd.colSpan = Math.max(1, cd.colSpan || 1);
      cd.rowSpan = Math.max(1, cd.rowSpan || 1);
      cd.covered = !!cd.covered;
      if (typeof cd.content !== "string") cd.content = "";
      cd.attrs = cd.attrs && typeof cd.attrs === "object" ? cd.attrs : {};
    }
  }
  next.rows = next.cells.length;
  next.cols = width;
  return next;
}

export function validateTable(t) {
  const errors = [];
  try {
    assertTable(t, "validateTable");
  } catch (err) {
    return { valid: false, errors: [{ code: "INVALID_TABLE", path: "", message: err.message, severity: "error" }], warnings: [] };
  }
  const widths = t.cells.map((r) => r.length);
  if (new Set(widths).size > 1) {
    errors.push({ code: "RAGGED", path: "", message: "Table rows have unequal column counts.", severity: "error" });
  }
  t.cells.forEach((row, r) => row.forEach((cd, c) => {
    if (!cd || typeof cd !== "object") {
      errors.push({ code: "BAD_CELL", path: `cells[${r}][${c}]`, message: "Cell must be an object.", severity: "error" });
    }
  }));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function cellRangeSelection(fromRow, fromCol, toRow, toCol) {
  const cells = [];
  for (let r = Math.min(fromRow, toRow); r <= Math.max(fromRow, toRow); r++) {
    for (let c = Math.min(fromCol, toCol); c <= Math.max(fromCol, toCol); c++) cells.push({ row: r, col: c });
  }
  return cells;
}

export function navigateCell(t, row, col, direction) {
  const { rows, cols } = gridSize(t);
  let r = row; let c = col;
  if (direction === "up") r = Math.max(0, r - 1);
  if (direction === "down") r = Math.min(rows - 1, r + 1);
  if (direction === "left") c = Math.max(0, c - 1);
  if (direction === "right") c = Math.min(cols - 1, c + 1);
  if (direction === "tab") { c += 1; if (c >= cols) { c = 0; r = Math.min(rows - 1, r + 1); } }
  return { row: r, col: c };
}

export function createTableEngine() {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return TABLE_ENGINE_VERSION; },
    createTable, getCell, setCell, insertRow, deleteRow, insertColumn, deleteColumn,
    mergeCells, splitCell, normalizeTable, validateTable, cellRangeSelection, navigateCell,
  };
}

export default createTableEngine;
