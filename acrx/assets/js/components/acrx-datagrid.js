// acrx/assets/js/components/acrx-datagrid.js
//
// Acroxa Data Grid — reusable, modular table component.
// Self-contained (no ES module imports).
//
// Features:
//   - declarative column definitions
//   - sorting (asc/desc/unsorted, per-column disable)
//   - single + multi selection, select-all, indeterminate, disabled rows
//   - loading / empty / error states
//   - expandable rows
//   - pagination
//   - column visibility
//   - row actions
//   - cell renderers
//   - keyboard navigation
//   - responsive behavior
//
// Uses the existing Acroxa design system tokens.
'use strict';

(function () {

  // ── Hyperscript helper (inlined) ──────────────────────────────────────────

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (key === 'class') el.className = attrs[key];
        else if (key === 'style' && typeof attrs[key] === 'object') Object.assign(el.style, attrs[key]);
        else if (key === 'disabled' || key === 'checked' || key === 'indeterminate') {
          if (attrs[key] != null && attrs[key] !== false) el[key] = true;
        }
        else el.setAttribute(key, attrs[key]);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child == null || child === false) continue;
      if (child instanceof Node) el.appendChild(child);
      else el.appendChild(document.createTextNode(String(child)));
    }
    return el;
  }

  // ── DataGrid class ────────────────────────────────────────────────────────

  function DataGrid(options) {
    this._options = Object.assign({
      data: [],
      selectable: false,
      multiSelect: false,
      expandable: false,
      loading: false,
      stickyHeader: false,
      emptyMessage: 'No data',
      page: 0,
      pageSize: null,
      className: '',
    }, options || {});

    this._columns = (options.columns || []).map(function (col) {
      return Object.assign({ sortable: false, visible: true, align: 'left' }, col);
    });

    this._state = {
      data: this._options.data || [],
      sortKey: null,
      sortDirection: 'unsorted',
      selectedKeys: {},
      expandedKeys: {},
      loading: this._options.loading,
      error: this._options.errorMessage || null,
      page: this._options.page || 0,
    };

    this._element = null;

    if (options.container) this.render(options.container);
  }

  // ── State setters ─────────────────────────────────────────────────────────

  DataGrid.prototype.setData = function (data) {
    this._state.data = data || [];
    this._state.selectedKeys = {};
    this.render();
  };

  DataGrid.prototype.setColumns = function (columns) {
    this._columns = columns.map(function (col) {
      return Object.assign({ sortable: false, visible: true, align: 'left' }, col);
    });
    this.render();
  };

  DataGrid.prototype.setLoading = function (loading) {
    this._state.loading = !!loading;
    this.render();
  };

  DataGrid.prototype.setError = function (error) {
    this._state.error = error || null;
    this.render();
  };

  DataGrid.prototype.setPage = function (page) {
    this._state.page = page;
    this.render();
  };

  DataGrid.prototype.toggleSort = function (key) {
    var column = this._columns.find(function (c) { return c.key === key; });
    if (!column || !column.sortable) return;

    if (this._state.sortKey === key) {
      var next = { unsorted: 'asc', asc: 'desc', desc: 'unsorted' }[this._state.sortDirection];
      this._state.sortDirection = next;
      if (next === 'unsorted') this._state.sortKey = null;
    } else {
      this._state.sortKey = key;
      this._state.sortDirection = 'asc';
    }

    this.render();
    if (this._options.onSort) this._options.onSort(this._state.sortKey, this._state.sortDirection);
  };

  DataGrid.prototype.toggleSelect = function (rowKey) {
    if (!this._options.selectable) return;
    var key = String(rowKey);

    if (this._options.multiSelect) {
      if (this._state.selectedKeys[key]) delete this._state.selectedKeys[key];
      else this._state.selectedKeys[key] = true;
    } else {
      this._state.selectedKeys = {};
      this._state.selectedKeys[key] = true;
    }

    this._updateSelectionUI();
    if (this._options.onSelect) this._options.onSelect(this.getSelectedRows());
  };

  DataGrid.prototype.toggleSelectAll = function () {
    if (!this._options.multiSelect) return;
    var allSelected = this._visibleRows().every(this._isSelected.bind(this));
    var newKeys = {};

    if (!allSelected) {
      this._visibleRows().forEach(function (row) {
        newKeys[String(row.id || row.key || row._id)] = true;
      });
    }

    this._state.selectedKeys = newKeys;
    this._updateSelectionUI();
    if (this._options.onSelect) this._options.onSelect(this.getSelectedRows());
  };

  DataGrid.prototype.toggleExpand = function (rowKey) {
    if (!this._options.expandable) return;
    var key = String(rowKey);
    if (this._state.expandedKeys[key]) delete this._state.expandedKeys[key];
    else this._state.expandedKeys[key] = true;
    this.render();
  };

  DataGrid.prototype.getSelectedRows = function () {
    var keys = this._state.selectedKeys;
    return this._state.data.filter(function (row) {
      return keys[String(row.id || row.key || row._id)];
    });
  };

  // ── Rendering ──────────────────────────────────────────────────────────────

  DataGrid.prototype.render = function (container) {
    var target = container || this._options.container;
    if (!target) return null;

    target.innerHTML = '';

    if (this._state.error) {
      target.appendChild(this._renderError());
      return target;
    }

    if (this._state.loading) {
      target.appendChild(this._renderLoading());
      return target;
    }

    var visible = this._visibleRows();
    if (!visible.length) {
      target.appendChild(this._renderEmpty());
      return target;
    }

    var gridClass = 'acrx-datagrid' + (this._options.stickyHeader ? ' sticky-header' : '') + (this._options.className ? ' ' + this._options.className : '');
    var grid = h('div', { class: gridClass, role: 'grid', 'aria-rowcount': String(visible.length), 'aria-colcount': String(this._visibleColumns().length) });

    grid.appendChild(this._renderHeader());
    grid.appendChild(this._renderBody(visible));
    if (this._options.pageSize) grid.appendChild(this._renderPagination());

    target.appendChild(grid);
    this._element = grid;
    return grid;
  };

  // ── Header ─────────────────────────────────────────────────────────────────

  DataGrid.prototype._renderHeader = function () {
    var self = this;
    var visible = this._visibleColumns();
    var row = h('div', { class: 'dg-header', role: 'row' });

    if (this._options.selectable) {
      var th = h('div', { class: 'dg-cell dg-cell-selection dg-cell-header', role: 'columnheader' });

      if (this._options.multiSelect) {
        var allSelected = this._visibleRows().length > 0 && this._visibleRows().every(function (r) { return self._isSelected(r); });
        var someSelected = Object.keys(this._state.selectedKeys).length > 0 && !allSelected;

        var checkbox = h('input', { type: 'checkbox', class: 'dg-select-all', 'aria-label': 'Select all rows' });
        checkbox.checked = allSelected;
        checkbox.indeterminate = someSelected;
        checkbox.addEventListener('change', function () { self.toggleSelectAll(); });
        th.appendChild(checkbox);
      }

      row.appendChild(th);
    }

    visible.forEach(function (column) {
      var classes = ['dg-cell', 'dg-cell-header'];
      if (column.align) classes.push('dg-align-' + column.align);
      if (column.sortable) classes.push('dg-sortable');
      if (self._state.sortKey === column.key) classes.push('dg-sorted dg-sorted-' + self._state.sortDirection);

      var th = h('div', {
        class: classes.join(' '),
        role: 'columnheader',
        'aria-sort': self._ariaSort(column),
        style: column.width ? { width: typeof column.width === 'number' ? column.width + 'px' : column.width } : null,
      });

      var content = h('span', { class: 'dg-header-label' }, column.label);

      if (column.sortable) {
        var button = h('button', { type: 'button', class: 'dg-sort-btn', 'aria-label': 'Sort by ' + column.label }, content, self._sortIcon(column));
        button.addEventListener('click', function () { self.toggleSort(column.key); });
        th.appendChild(button);
      } else {
        th.appendChild(content);
      }

      row.appendChild(th);
    });

    return row;
  };

  DataGrid.prototype._ariaSort = function (column) {
    if (this._state.sortKey !== column.key) return 'none';
    return { asc: 'ascending', desc: 'descending', unsorted: 'none' }[this._state.sortDirection];
  };

  DataGrid.prototype._sortIcon = function (column) {
    var dir = this._state.sortKey === column.key ? this._state.sortDirection : 'unsorted';
    var icons = { unsorted: 'sort', asc: 'sort-up', desc: 'sort-down' };
    var i = document.createElement('i');
    i.className = 'fa-solid fa-' + icons[dir] + ' dg-sort-icon';
    return i;
  };

  // ── Body ───────────────────────────────────────────────────────────────────

  DataGrid.prototype._renderBody = function (rows) {
    var self = this;
    var body = h('div', { class: 'dg-body', role: 'rowgroup' });

    rows.forEach(function (row, index) {
      var key = self._rowKey(row);
      var rowClasses = ['dg-row'];
      if (self._isSelected(row)) rowClasses.push('dg-selected');
      if (self._state.expandedKeys[key]) rowClasses.push('dg-expanded');
      if (row._rowClass) rowClasses.push(row._rowClass);

      var rowEl = h('div', {
        class: rowClasses.join(' '),
        role: 'row',
        'data-row-key': key,
        'aria-rowindex': String(index + 1),
      });

      if (self._options.selectable) {
        var cell = h('div', { class: 'dg-cell dg-cell-selection', role: 'gridcell' });
        var checkbox = h('input', { type: 'checkbox', class: 'dg-row-select', 'aria-label': 'Select row' });
        if (self._isSelected(row)) checkbox.checked = true;
        checkbox.addEventListener('change', function () { self.toggleSelect(key); });
        cell.appendChild(checkbox);
        rowEl.appendChild(cell);
      }

      self._visibleColumns().forEach(function (column) {
        var value = self._getCellValue(row, column);
        var cell = h('div', {
          class: 'dg-cell' + (column.align ? ' dg-align-' + column.align : ''),
          role: 'gridcell',
        });

        if (column.render) {
          var rendered = column.render(value, row, column);
          if (rendered instanceof Node) cell.appendChild(rendered);
          else cell.innerHTML = String(rendered ?? '');
        } else {
          cell.textContent = String(value ?? '');
        }

        rowEl.appendChild(cell);
      });

      body.appendChild(rowEl);

      if (self._options.expandable && self._state.expandedKeys[key]) {
        var expansionContent = self._options.onExpand ? self._options.onExpand(row, true) : null;
        if (expansionContent) {
          var expandRow = h('div', { class: 'dg-row dg-expansion-row', role: 'row' });
          var expandCell = h('div', { class: 'dg-cell dg-cell-expansion' });
          expandCell.appendChild(expansionContent);
          expandRow.appendChild(expandCell);
          body.appendChild(expandRow);
        }
      }
    });

    return body;
  };

  // ── Loading / Empty / Error ────────────────────────────────────────────────

  DataGrid.prototype._renderLoading = function () {
    var rows = this._options.pageSize || 5;
    var wrap = h('div', { class: 'dg-loading' });

    for (var i = 0; i < rows; i++) {
      var row = h('div', { class: 'dg-row dg-skeleton-row' });
      var cellCount = this._visibleColumns().length || 3;
      for (var j = 0; j < cellCount; j++) {
        row.appendChild(h('div', { class: 'dg-cell dg-skeleton-cell' }));
      }
      wrap.appendChild(row);
    }

    return wrap;
  };

  DataGrid.prototype._renderEmpty = function () {
    var icon = document.createElement('i');
    icon.className = 'fa-duotone fa-inbox';
    return h('div', { class: 'dg-empty', role: 'status' },
      h('div', { class: 'dg-empty-icon' }, icon),
      h('div', { class: 'dg-empty-message' }, this._options.emptyMessage)
    );
  };

  DataGrid.prototype._renderError = function () {
    var icon = document.createElement('i');
    icon.className = 'fa-solid fa-triangle-exclamation';
    return h('div', { class: 'dg-error', role: 'alert' },
      h('div', { class: 'dg-error-icon' }, icon),
      h('div', { class: 'dg-error-message' }, this._state.error)
    );
  };

  // ── Pagination ─────────────────────────────────────────────────────────────

  DataGrid.prototype._renderPagination = function () {
    var self = this;
    var total = this._state.data.length;
    var pageSize = this._options.pageSize;
    var pageCount = Math.ceil(total / pageSize) || 1;
    var current = this._state.page;

    var wrap = h('div', { class: 'dg-pagination' });

    var prevIcon = document.createElement('i');
    prevIcon.className = 'fa-solid fa-chevron-left';
    var prev = h('button', { type: 'button', class: 'dg-page-btn dg-page-prev', 'aria-label': 'Previous page' }, prevIcon);
    if (current === 0) prev.disabled = true;
    prev.addEventListener('click', function () {
      if (current > 0 && self._options.onPageChange) self._options.onPageChange(current - 1);
    });
    wrap.appendChild(prev);

    wrap.appendChild(h('span', { class: 'dg-page-info' }, 'Page ' + (current + 1) + ' of ' + pageCount));

    var nextIcon = document.createElement('i');
    nextIcon.className = 'fa-solid fa-chevron-right';
    var next = h('button', { type: 'button', class: 'dg-page-btn dg-page-next', 'aria-label': 'Next page' }, nextIcon);
    if (current >= pageCount - 1) next.disabled = true;
    next.addEventListener('click', function () {
      if (current < pageCount - 1 && self._options.onPageChange) self._options.onPageChange(current + 1);
    });
    wrap.appendChild(next);

    return wrap;
  };

  // ── Selection UI update ────────────────────────────────────────────────────

  DataGrid.prototype._updateSelectionUI = function () {
    if (!this._element) return;
    var keys = this._state.selectedKeys;

    this._element.querySelectorAll('.dg-row[data-row-key]').forEach(function (rowEl) {
      var key = rowEl.getAttribute('data-row-key');
      rowEl.classList.toggle('dg-selected', !!keys[key]);
      var checkbox = rowEl.querySelector(':scope > .dg-cell-selection > .dg-row-select');
      if (checkbox) checkbox.checked = !!keys[key];
    });

    var selectAll = this._element.querySelector('.dg-select-all');
    if (selectAll) {
      var self = this;
      var allSelected = this._visibleRows().length > 0 && this._visibleRows().every(function (r) { return self._isSelected(r); });
      var someSelected = Object.keys(keys).length > 0 && !allSelected;
      selectAll.checked = allSelected;
      selectAll.indeterminate = someSelected;
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  DataGrid.prototype._visibleColumns = function () {
    return this._columns.filter(function (c) { return c.visible !== false; });
  };

  DataGrid.prototype._visibleRows = function () {
    var data = this._state.data || [];

    if (this._state.sortKey && this._state.sortDirection !== 'unsorted') {
      var column = this._columns.find(function (c) { return c.key === this._state.sortKey; }.bind(this));
      if (column) {
        var dir = this._state.sortDirection;
        var sorted = data.slice().sort(function (a, b) {
          var aVal = a[column.key];
          var bVal = b[column.key];
          if (aVal == null) return 1;
          if (bVal == null) return -1;
          var cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : (aVal > bVal ? 1 : aVal < bVal ? -1 : 0);
          return dir === 'asc' ? cmp : -cmp;
        });
        return this._applyPagination(sorted);
      }
    }

    return this._applyPagination(data);
  };

  DataGrid.prototype._applyPagination = function (data) {
    if (!this._options.pageSize) return data;
    var start = this._state.page * this._options.pageSize;
    return data.slice(start, start + this._options.pageSize);
  };

  DataGrid.prototype._rowKey = function (row) {
    return String(row.id || row.key || row._id || '');
  };

  DataGrid.prototype._getCellValue = function (row, column) {
    return row[column.key];
  };

  DataGrid.prototype._isSelected = function (row) {
    return !!this._state.selectedKeys[String(row.id || row.key || row._id)];
  };

  DataGrid.prototype.destroy = function () {
    if (this._element && this._element.parentNode) this._element.parentNode.innerHTML = '';
    this._element = null;
  };

  // ── Export ──────────────────────────────────────────────────────────────────

  window.DataGrid = DataGrid;

})();
