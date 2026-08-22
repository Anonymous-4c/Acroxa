// ./acrx/assets/js/mediapicker/index.js
//
// Reusable Media Picker popup for Acroxa admin.
// Uses framework.js primitives only. No third-party libs, no build step.

import { el, icon, Input, escapeHTML } from '../framework.js';

// ─────────────────────────────────────────────────────────────────────────
// Category / MIME helpers
// ─────────────────────────────────────────────────────────────────────────

const CATEGORY_MATCHERS = {
  image: (mime) => mime.startsWith('image/'),
  video: (mime) => mime.startsWith('video/'),
  audio: (mime) => mime.startsWith('audio/'),
  document: (mime) => [
    'application/pdf', 'text/plain', 'text/html', 'text/css',
    'text/javascript', 'application/json', 'text/csv', 'application/xml',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
  ].includes(mime),
  archive: (mime) => [
    'application/zip', 'application/vnd.rar', 'application/x-7z-compressed',
    'application/x-tar', 'application/gzip',
  ].includes(mime),
};

function getCategory(mime = '') {
  for (const [cat, test] of Object.entries(CATEGORY_MATCHERS)) {
    if (test(mime)) return cat;
  }
  return 'other';
}

function matchesFilter(mime, filter) {
  if (!filter || !filter.length || filter.includes('*')) return true;
  return filter.includes(getCategory(mime));
}

function matchesAccept(mimeOrFile, accept) {
  if (!accept || !accept.length || accept.includes('*')) return true;
  const mime = typeof mimeOrFile === 'string' ? mimeOrFile : mimeOrFile.type;
  return accept.some((pattern) => {
    if (pattern.endsWith('/*')) {
      return mime.startsWith(pattern.slice(0, -1));
    }
    return mime === pattern;
  });
}

function getFileIcon(mime = '') {
  const cat = getCategory(mime);
  switch (cat) {
    case 'image': return 'image';
    case 'video': return 'film';
    case 'audio': return 'music';
    case 'archive': return 'file-zipper';
    case 'document':
      if (mime.includes('pdf')) return 'file-pdf';
      if (mime.includes('word') || mime.includes('wordprocessing')) return 'file-word';
      if (mime.includes('sheet') || mime.includes('excel')) return 'file-excel';
      if (mime.includes('presentation') || mime.includes('powerpoint')) return 'file-powerpoint';
      return 'file-lines';
    default: return 'file';
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Default config
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_ENDPOINTS = {
  list: '/acr/api/media/files',
  upload: '/acr/api/media/upload',
  rename: '/acr/api/media/rename-file',
  delete: '/acr/api/media/delete-file',
  content: '/acr/api/system/content',
};

const DEFAULT_OPTIONS = {
  title: 'Select Media',
  multiple: false,
  filter: ['*'],
  accept: ['*'],
  allowUpload: true,
  allowDelete: true,
  allowRename: true,
  allowDragDrop: true,
  showSearch: true,
  showRefresh: true,
  folder: null,
  maxSelection: null,
  initialSelection: [],
  endpoints: DEFAULT_ENDPOINTS,
  onSelect: null,
  onCancel: null,
};

// ─────────────────────────────────────────────────────────────────────────
// MediaPicker instance
// ─────────────────────────────────────────────────────────────────────────

class MediaPickerInstance {
  constructor(options) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      endpoints: { ...DEFAULT_ENDPOINTS, ...(options.endpoints || {}) },
    };

    this.state = {
      files: [],
      filteredFiles: [],
      selected: [],
      loading: false,
      uploading: false,
      dragActive: false,
      search: '',
      folder: this.options.folder,
      focusedIndex: -1,
      renamingName: null,
      uploadConfig: null,
    };

    this.root = null;
    this.gridEl = null;
    this.footerCountEl = null;
    this.searchInputEl = null;
    this.fileInputEl = null;

    this._resolvePromise = null;
    this._rejectPromise = null;
    this._boundKeydown = this._onKeydown.bind(this);
    this._lastPointerWasTouch = false;
  }

  // ── Public open/close ───────────────────────────────────────────────

  open() {
    const promise = new Promise((resolve, reject) => {
      this._resolvePromise = resolve;
      this._rejectPromise = reject;
    });

    this._render();
    document.body.appendChild(this.root);
    document.addEventListener('keydown', this._boundKeydown, true);

    // seed initial selection
    if (this.options.initialSelection?.length) {
      this.state.selected = [...this.options.initialSelection];
    }

    this._loadMedia();

    // fire and forget - load upload config for later use
    this._loadUploadConfig();

    requestAnimationFrame(() => {
      this.root.classList.add('mp-open');
      if (this.options.showSearch) this.searchInputEl?.focus();
    });

    return promise;
  }

  _close(result, cancelled) {
    document.removeEventListener('keydown', this._boundKeydown, true);
    this.root?.classList.remove('mp-open');

    const cleanup = () => {
      this.root?.remove();
      this.root = null;
    };

    setTimeout(cleanup, 150);

    if (cancelled) {
      this.options.onCancel?.();
      this._rejectPromise?.(new Error('cancelled'));
    } else {
      this.options.onSelect?.(result);
      this._resolvePromise?.(result);
    }
  }

  // ── Data loading ────────────────────────────────────────────────────

  async _loadUploadConfig() {
    try {
      const res = await fetch(this.options.endpoints.content);
      const data = await res.json();
      if (data?.success) {
        this.state.uploadConfig = data.data;
      }
    } catch (_) {
      this.state.uploadConfig = null;
    }
  }

  async _loadMedia() {
    this.state.loading = true;
    this._renderGrid();

    try {
      const url = new URL(this.options.endpoints.list, window.location.origin);
      if (this.state.folder) url.searchParams.set('folder', this.state.folder);

      const res = await fetch(url.toString());
      const data = await res.json();

      this.state.files = data?.success ? (data.files || []) : [];
    } catch (err) {
      this.state.files = [];
    } finally {
      this.state.loading = false;
      this._applyFilters();
    }
  }

  _applyFilters() {
    const { filter } = this.options;
    const search = this.state.search.trim().toLowerCase();

    this.state.filteredFiles = this.state.files.filter((f) => {
      if (!matchesFilter(f.type, filter)) return false;
      if (search) {
        const name = (f.originalName || f.name || '').toLowerCase();
        if (!name.includes(search)) return false;
      }
      return true;
    });

    this.state.focusedIndex = this.state.filteredFiles.length ? 0 : -1;
    this._renderGrid();
    this._updateFooter();
  }

  // ── Selection logic ─────────────────────────────────────────────────

  _isSelected(file) {
    return this.state.selected.some((s) => s.name === file.name);
  }

  _toggleSelect(file, { additive = false, range = false } = {}) {
    const { multiple, maxSelection } = this.options;

    if (!multiple) {
      this.state.selected = this._isSelected(file) ? [] : [file];
      this._renderGrid();
      this._updateFooter();
      return;
    }

    if (range && this.state.lastClickedIndex != null) {
      const idx = this.state.filteredFiles.findIndex((f) => f.name === file.name);
      const start = Math.min(idx, this.state.lastClickedIndex);
      const end = Math.max(idx, this.state.lastClickedIndex);
      const rangeFiles = this.state.filteredFiles.slice(start, end + 1);
      const merged = [...this.state.selected];
      rangeFiles.forEach((f) => {
        if (!merged.some((s) => s.name === f.name)) merged.push(f);
      });
      this.state.selected = maxSelection ? merged.slice(0, maxSelection) : merged;
    } else if (additive) {
      if (this._isSelected(file)) {
        this.state.selected = this.state.selected.filter((s) => s.name !== file.name);
      } else {
        if (maxSelection && this.state.selected.length >= maxSelection) return;
        this.state.selected = [...this.state.selected, file];
      }
    } else {
      this.state.selected = this._isSelected(file) ? [] : [file];
    }

    const idx = this.state.filteredFiles.findIndex((f) => f.name === file.name);
    if (idx !== -1) this.state.lastClickedIndex = idx;

    this._renderGrid();
    this._updateFooter();
  }

  _selectAll() {
    if (!this.options.multiple) return;
    const { maxSelection } = this.options;
    const all = maxSelection
      ? this.state.filteredFiles.slice(0, maxSelection)
      : [...this.state.filteredFiles];
    this.state.selected = all;
    this._renderGrid();
    this._updateFooter();
  }

  // ── Upload ──────────────────────────────────────────────────────────

  async _handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const { accept } = this.options;
    const valid = files.filter((f) => matchesAccept(f, accept));

    if (!valid.length) {
      this._flash('No files matched the accepted types.');
      return;
    }

    this.state.uploading = true;
    this._renderToolbar();

    try {
      const formData = new FormData();
      valid.forEach((f) => {
        // Explicitly pass the filename as the 3rd arg. Files picked via
        // <input> resolve f.name automatically, but dropped files (drag &
        // drop) don't always carry a reliable name through FormData without
        // this being explicit — some drag sources hand over Blob-like
        // objects with an empty/garbled name, which the backend needs a
        // real filename for (see _applyNaming / getAvailableFilename).
        const filename = f.name && f.name.trim() ? f.name : `upload_${Date.now()}`;
        formData.append('media', f, filename);
      });

      const cfg = this.state.uploadConfig;
      const headers = {};
      if (cfg?.mediaNaming) headers['x-media-naming'] = cfg.mediaNaming;
      if (cfg?.uploadStrategy) headers['x-upload-type'] = cfg.uploadStrategy;

      const url = new URL(this.options.endpoints.upload, window.location.origin);
      if (cfg?.uploadStrategy) url.searchParams.set('uploadtype', cfg.uploadStrategy);

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        this._flash(`Upload failed (${res.status}).`);
        return;
      }

      const data = await res.json();

      if (!data?.success) {
        this._flash(data?.message || 'Upload failed.');
      }
    } catch (err) {
      this._flash('Upload failed. Check your connection.');
    } finally {
      // Always reset uploading state and re-enable the button, whether the
      // upload succeeded, failed, or threw — this must never stay stuck.
      this.state.uploading = false;
      this._renderToolbar();
      await this._loadMedia();
    }
  }

  // ── Rename ──────────────────────────────────────────────────────────

  _startRename(file) {
    if (!this.options.allowRename) return;
    this.state.renamingName = file.name;
    this._renderGrid();

    requestAnimationFrame(() => {
      const input = this.gridEl?.querySelector('.mp-rename-input');
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  async _commitRename(file, newName) {
    this.state.renamingName = null;

    const trimmed = (newName || '').trim();
    if (!trimmed || trimmed === file.name) {
      this._renderGrid();
      return;
    }

    try {
      const res = await fetch(this.options.endpoints.rename, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: file.name, newName: trimmed }),
      });
      const data = await res.json();
      if (!data?.success) this._flash(data?.message || 'Rename failed.');
    } catch (err) {
      this._flash('Rename failed.');
    } finally {
      await this._loadMedia();
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────

  async _deleteSelected() {
    if (!this.options.allowDelete || !this.state.selected.length) return;

    const targets = [...this.state.selected];
    this.state.selected = [];

    for (const file of targets) {
      try {
        const res = await fetch(this.options.endpoints.delete, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        });
        const data = await res.json();
        if (!data?.success) this._flash(data?.message || `Failed to delete ${file.name}`);
      } catch (err) {
        this._flash(`Failed to delete ${file.name}`);
      }
    }

    await this._loadMedia();
  }

  _flash(message) {
    if (!this.root) return;
    let toast = this.root.querySelector('.mp-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'mp-toast';
      this.root.querySelector('.mp-window')?.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('mp-toast-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('mp-toast-visible'), 2500);
  }

  // ── Resolve ─────────────────────────────────────────────────────────

  _confirmSelection() {
    if (!this.state.selected.length) return;
    this._close([...this.state.selected], false);
  }

  // ── Keyboard ────────────────────────────────────────────────────────

  _onKeydown(e) {
    if (!this.root) return;

    const isRenaming = this.state.renamingName != null;
    const target = e.target;
    const isSearchFocused = target === this.searchInputEl;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (isRenaming) {
        this.state.renamingName = null;
        this._renderGrid();
        return;
      }
      this._close(null, true);
      return;
    }

    if (isRenaming) return;

    if (e.key === 'Enter' && !isSearchFocused) {
      e.preventDefault();
      this._confirmSelection();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (isSearchFocused) return;
      e.preventDefault();
      this._deleteSelected();
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this._selectAll();
        return;
      }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.searchInputEl?.focus();
        return;
      }
    }

    if (e.key === 'F2') {
      e.preventDefault();
      const focused = this.state.filteredFiles[this.state.focusedIndex];
      if (focused) this._startRename(focused);
      return;
    }

    if (isSearchFocused) return;

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      this._navigateGrid(e.key);
      return;
    }

    if (e.key === ' ') {
      e.preventDefault();
      // Preview hook - no heavy preview by design, reserved for future use.
    }
  }

  _navigateGrid(key) {
    const total = this.state.filteredFiles.length;
    if (!total) return;

    const cols = this._computeColumns();
    let idx = this.state.focusedIndex === -1 ? 0 : this.state.focusedIndex;

    if (key === 'ArrowRight') idx = Math.min(idx + 1, total - 1);
    if (key === 'ArrowLeft') idx = Math.max(idx - 1, 0);
    if (key === 'ArrowDown') idx = Math.min(idx + cols, total - 1);
    if (key === 'ArrowUp') idx = Math.max(idx - cols, 0);

    this.state.focusedIndex = idx;
    this._renderGrid();

    const el = this.gridEl?.querySelector(`[data-index="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }

  _computeColumns() {
    if (!this.gridEl) return 4;
    const itemWidth = 120;
    return Math.max(1, Math.floor(this.gridEl.clientWidth / itemWidth));
  }

  // ── Rendering ────────────────────────────────────────────────────────

  _render() {
    const { title, showSearch, showRefresh, allowUpload, multiple } = this.options;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const wrapper = document.createElement('div');
    wrapper.className = 'mp-overlay';
    wrapper.innerHTML = el('div', { class: 'mp-backdrop' }) +
      el('div', { class: 'mp-window', role: 'dialog', ariaModal: 'true' },
        // Header
        el('div', { class: 'mp-header' },
          el('h2', { class: 'mp-title' }, escapeHTML(title)),
          multiple ? el('span', { class: 'mp-multi-hint', title: isTouch
              ? 'Tap to select, tap again to add more'
              : 'Hold Ctrl (or Cmd) and click to select multiple, or Shift-click for a range' },
            icon('circle-info', 'solid', 'mp-multi-hint-icon'),
            el('span', { class: 'mp-multi-hint-text' },
              isTouch ? 'Tap items to select multiple' : 'Hold Ctrl / Cmd to select multiple'
            )
          ) : null,
          el('button', { class: 'mp-close-btn', type: 'button', dataAction: 'close' },
            icon('xmark', 'solid')
          )
        ),
        // Toolbar
        el('div', { class: 'mp-toolbar' },
          showSearch ? el('div', { class: 'mp-search-wrap' },
            icon('magnifying-glass', 'solid', 'mp-search-icon'),
            el('input', {
              type: 'text',
              class: 'mp-search-input',
              placeholder: 'Search media...',
              dataRole: 'search',
            })
          ) : null,
          el('div', { class: 'mp-toolbar-actions' },
            allowUpload ? el('button', { class: 'mp-btn mp-upload-btn', type: 'button', dataAction: 'upload' },
              icon('upload', 'solid'), ' Upload'
            ) : null,
            showRefresh ? el('button', { class: 'mp-btn mp-refresh-btn', type: 'button', dataAction: 'refresh' },
              icon('rotate', 'solid')
            ) : null
          ),
          allowUpload ? el('input', {
            type: 'file', multiple: true, hidden: true, class: 'mp-file-input',
          }) : null
        ),
        // Grid area
        el('div', { class: 'mp-grid-area' },
          el('div', { class: 'mp-grid', dataRole: 'grid' }),
          el('div', { class: 'mp-drop-overlay', dataRole: 'drop-overlay' },
            el('div', { class: 'mp-drop-message' },
              icon('cloud-arrow-up', 'solid'),
              el('span', {}, 'Drop files to upload')
            )
          )
        ),
        // Footer
        el('div', { class: 'mp-footer' },
          el('button', { class: 'mp-btn mp-btn-secondary', type: 'button', dataAction: 'cancel' }, 'Cancel'),
          el('span', { class: 'mp-selected-count', dataRole: 'count' }, '0 selected'),
          el('button', { class: 'mp-btn mp-btn-primary', type: 'button', dataAction: 'select', disabled: true }, 'Select')
        )
      );

    this.root = wrapper;
    this.gridEl = wrapper.querySelector('[data-role="grid"]');
    this.searchInputEl = wrapper.querySelector('[data-role="search"]');
    this.fileInputEl = wrapper.querySelector('.mp-file-input');
    this.footerCountEl = wrapper.querySelector('[data-role="count"]');
    this.selectBtnEl = wrapper.querySelector('[data-action="select"]');
    this.dropOverlayEl = wrapper.querySelector('[data-role="drop-overlay"]');

    this._bindEvents();
  }

  _bindEvents() {
    const root = this.root;

    root.addEventListener('pointerdown', (e) => {
      this._lastPointerWasTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    });

    root.addEventListener('click', (e) => {
      const backdrop = e.target.closest('.mp-backdrop');
      if (backdrop) {
        this._close(null, true);
        return;
      }

      const actionEl = e.target.closest('[data-action]');
      if (actionEl) {
        const action = actionEl.dataset.action;
        if (action === 'close' || action === 'cancel') this._close(null, true);
        if (action === 'upload') this.fileInputEl?.click();
        if (action === 'refresh') this._loadMedia();
        if (action === 'select') this._confirmSelection();
        return;
      }

      const item = e.target.closest('.mp-media-item');
      if (item) {
        const name = item.dataset.name;
        const file = this.state.filteredFiles.find((f) => f.name === name);
        if (!file) return;

        if (e.target.closest('[data-role="rename-trigger"]')) {
          this._startRename(file);
          return;
        }

        // On touch devices there's no Ctrl/Cmd modifier available, so a plain
        // tap behaves additively when multiple selection is enabled — matches
        // the hint text shown in the header for touch users.
        const additive = e.ctrlKey || e.metaKey || (this.options.multiple && this._lastPointerWasTouch);
        this._toggleSelect(file, { additive, range: e.shiftKey });
      }
    });

    root.addEventListener('dblclick', (e) => {
      const item = e.target.closest('.mp-media-item');
      if (!item) return;
      const name = item.dataset.name;
      const file = this.state.filteredFiles.find((f) => f.name === name);
      if (!file) return;
      this.state.selected = [file];
      this._confirmSelection();
    });

    if (this.searchInputEl) {
      this.searchInputEl.addEventListener('input', (e) => {
        this.state.search = e.target.value;
        this._applyFilters();
      });
    }

    if (this.fileInputEl) {
      this.fileInputEl.addEventListener('change', (e) => {
        this._handleFiles(e.target.files);
        e.target.value = '';
      });
    }

    if (this.options.allowDragDrop) {
      const win = root.querySelector('.mp-window');
      let dragCounter = 0;

      win.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        this.state.dragActive = true;
        this.dropOverlayEl?.classList.add('mp-drop-active');
      });

      win.addEventListener('dragover', (e) => e.preventDefault());

      win.addEventListener('dragleave', (e) => {
        dragCounter = Math.max(0, dragCounter - 1);
        if (dragCounter === 0) {
          this.state.dragActive = false;
          this.dropOverlayEl?.classList.remove('mp-drop-active');
        }
      });

      win.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        this.state.dragActive = false;
        this.dropOverlayEl?.classList.remove('mp-drop-active');
        this._handleFiles(e.dataTransfer.files);
      });
    }
  }

  _renderToolbar() {
    if (!this.root) return;
    const uploadBtn = this.root.querySelector('.mp-upload-btn');
    if (uploadBtn) {
      uploadBtn.disabled = this.state.uploading;
      uploadBtn.classList.toggle('mp-loading', this.state.uploading);
    }
  }

  _renderGrid() {
    if (!this.gridEl) return;

    if (this.state.loading) {
      this.gridEl.innerHTML = this._renderSkeletons();
      return;
    }

    if (!this.state.filteredFiles.length) {
      this.gridEl.innerHTML = el('div', { class: 'mp-empty-state' },
        icon('photo-film', 'solid', 'mp-empty-icon'),
        el('p', { class: 'mp-empty-text' }, this.state.search ? 'No matching files' : 'No media yet')
      );
      return;
    }

    this.gridEl.innerHTML = this.state.filteredFiles
      .map((file, index) => this._renderItem(file, index))
      .join('');

    if (this.state.renamingName) {
      const input = this.gridEl.querySelector('.mp-rename-input');
      if (input) {
        input.addEventListener('blur', () => {
          const file = this.state.filteredFiles.find((f) => f.name === this.state.renamingName);
          if (file) this._commitRename(file, input.value);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.stopPropagation();
            input.blur();
          }
        });
        input.addEventListener('click', (e) => e.stopPropagation());
      }
    }
  }

  _renderSkeletons() {
    return Array.from({ length: 12 }).map(() =>
      el('div', { class: 'mp-skeleton-item' },
        el('div', { class: 'mp-skeleton-thumb' }),
        el('div', { class: 'mp-skeleton-text' })
      )
    ).join('');
  }

  _renderItem(file, index) {
    const selected = this._isSelected(file);
    const focused = index === this.state.focusedIndex;
    const isRenaming = this.state.renamingName === file.name;
    const cat = getCategory(file.type);

    const thumbSrc = cat === 'image' ? file.thumb || file.url
      : cat === 'video' ? file.thumb
      : cat === 'audio' ? (file.album_art_url || file.thumb)
      : null;

    const classes = ['mp-media-item'];
    if (selected) classes.push('mp-item-selected');
    if (focused) classes.push('mp-item-focused');

    return el('div', {
      class: classes.join(' '),
      dataName: file.name,
      dataIndex: index,
      tabIndex: -1,
    },
      el('div', { class: 'mp-item-thumb' },
        thumbSrc
          ? el('img', { src: thumbSrc, loading: 'lazy', alt: file.originalName || file.name, class: 'mp-thumb-img' })
          : el('div', { class: 'mp-generic-icon' }, icon(getFileIcon(file.type), 'solid')),
        el('div', { class: 'mp-item-checkbox' }, icon('check', 'solid'))
      ),
      el('div', { class: 'mp-item-info' },
        isRenaming
          ? el('input', { type: 'text', class: 'mp-rename-input', value: escapeHTML(file.name) })
          : el('span', { class: 'mp-item-name', dataRole: 'rename-trigger', title: file.originalName || file.name },
              escapeHTML(file.originalName || file.name)
            ),
        el('span', { class: 'mp-item-size' }, formatBytes(file.size))
      )
    );
  }

  _updateFooter() {
    const count = this.state.selected.length;
    if (this.footerCountEl) {
      this.footerCountEl.textContent = `${count} selected`;
    }
    if (this.selectBtnEl) {
      this.selectBtnEl.disabled = count === 0;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

const MediaPicker = {
  open(options = {}) {
    const instance = new MediaPickerInstance(options);
    const promise = instance.open();

    // Support callback style alongside Promise style.
    if (typeof options.onSelect === 'function' || typeof options.onCancel === 'function') {
      promise.catch(() => {}); // swallow rejection on cancel when using callbacks
    }

    return promise;
  },
};

export default MediaPicker;
export { MediaPicker };