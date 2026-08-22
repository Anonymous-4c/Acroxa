/**
 * menusKeyboard.js
 * Keyboard shortcuts, command palette, and tree navigation.
 */

import { MenusState } from './menusState.js';

const KEYMAP = {
  save: ['Control', 's'],
  commandPalette: ['Control', 'p'],
  newMenu: ['Control', 'Alt', 'n'],
  newItem: ['Control', 'Shift', 'Alt', 'N'],
  duplicateItem: ['Control', 'd'],
  undo: ['Control', 'z'],
  redo: ['Control', 'Shift', 'Z'],
  deleteItem: ['Delete'],
  deleteMenu: ['Shift', 'Delete'],
  escape: ['Escape'],
  rename: ['F2'],
  toggleExpand: [' '],
};

let paletteRoot = null;
let paletteInput = null;
let paletteList = null;
let commands = [];
let paletteItems = [];
let activeCommandIndex = 0;
let isOpen = false;
let handlers = {};
const COMMAND_ICONS = {
  'create-menu': 'fa-solid fa-folder-plus',
  'new-item': 'fa-solid fa-plus',
  'save-menu': 'fa-solid fa-floppy-disk',
  'expand-all': 'fa-solid fa-arrows-up-down',
  'collapse-all': 'fa-solid fa-compress',
  'focus-search': 'fa-solid fa-magnifying-glass',
  'import-menu': 'fa-solid fa-file-import',
  'export-menu': 'fa-solid fa-file-export',
  'duplicate-menu': 'fa-solid fa-copy',
  'delete-menu': 'fa-solid fa-trash',
};

const ENTITY_ICONS = {
  menu: 'fa-solid fa-folder',
  item: 'fa-solid fa-link',
  page: 'fa-solid fa-file',
  post: 'fa-solid fa-newspaper',
  category: 'fa-solid fa-tags',
  slot: 'fa-solid fa-plug'
};

const SHORTCUTS = {
  'create-menu': 'Ctrl+N',
  'new-item': 'Ctrl+Shift+N',
  'save-menu': 'Ctrl+S',
  'duplicate-menu': 'Ctrl+D',
  'delete-menu': 'Shift+Delete'
};
function normalizeKey(event) {
  const keys = [];
  if (event.ctrlKey || event.metaKey) keys.push('Control');
  if (event.shiftKey) keys.push('Shift');
  if (event.altKey) keys.push('Alt');
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) keys.push(key);
  return keys.join('+');
}

function buildPalette() {
  if (paletteRoot) return;

  paletteRoot = document.createElement('div');
  paletteRoot.className = 'ms-command-palette-overlay';
  paletteRoot.innerHTML = `
    <div class="ms-command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <div class="ms-command-palette__header">
        <span>Command Palette</span>
        <button class="ms-command-palette__close" type="button" aria-label="Close command palette">×</button>
      </div>
      <div class="ms-command-palette__body">
        <input class="ms-command-palette__input" type="search" placeholder="Type a command or search..." aria-label="Command palette search" />
        <div class="ms-command-palette__list" role="listbox"></div>
      </div>
    </div>
  `;

  document.body.appendChild(paletteRoot);
  paletteInput = paletteRoot.querySelector('.ms-command-palette__input');
  paletteList = paletteRoot.querySelector('.ms-command-palette__list');

  paletteRoot.querySelector('.ms-command-palette__close').addEventListener('click', closePalette);
  paletteRoot.addEventListener('click', e => { if (e.target === paletteRoot) closePalette(); });
  paletteInput.addEventListener('input', onPaletteInput);
  paletteInput.addEventListener('keydown', onPaletteKeydown);
}

function openPalette() {
  buildPalette();
  updateCommands();
  isOpen = true;
  paletteRoot.classList.add('ms-command-palette-overlay--open');
  paletteInput.value = '';
  paletteInput.focus();
  paletteInput.select();
  renderPaletteResults('');
  MenusState.setCommandPaletteState(true, '');
}

function closePalette() {
  if (!paletteRoot) return;
  isOpen = false;
  paletteRoot.classList.remove('ms-command-palette-overlay--open');
  MenusState.setCommandPaletteState(false, '');
}

function onPaletteInput(event) {
  const query = event.target.value || '';
  MenusState.setCommandPaletteState(true, query);
  renderPaletteResults(query);
}

function onPaletteKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveActive(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveActive(-1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    executeActiveCommand();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closePalette();
  }
}

function updateCommands() {
  const state = MenusState.get();
  const slots = state.slots || [];
  const hasMenu = Boolean(state.activeMenuId);

  const slotCommands = slots.map(slot => ({
    id: `assign-slot:${slot}`,
    label: `Assign active menu to ${slot}`,
    category: 'Slots',
    icon: 'fa-solid fa-plug',
    action: () => handlers.assignSlot && handlers.assignSlot(slot),
  }));

commands = [
  {
    id: 'create-menu',
    label: 'Create Menu',
    icon: 'fa-solid fa-folder-plus',
    shortcut: 'Ctrl + Alt + N',
    category: 'Actions',
    action: () => handlers.createMenu?.()
  },

  {
    id: 'new-item',
    label: 'Create New Item',
    icon: 'fa-solid fa-plus',
    shortcut: 'Ctrl + Alt + Shift + N',
    category: 'Actions',
    action: () => handlers.createItem?.()
  },

  {
    id: 'save-menu',
    label: 'Save Menu',
    icon: 'fa-solid fa-floppy-disk',
    shortcut: 'Ctrl+S',
    category: 'Actions',
    action: () => handlers.saveMenu?.()
  },

  {
    id: 'expand-all',
    label: 'Expand All',
    icon: 'fa-solid fa-expand',
    category: 'Tree',
    action: () => handlers.expandAll?.()
  },

  {
    id: 'collapse-all',
    label: 'Collapse All',
    icon: 'fa-solid fa-compress',
    category: 'Tree',
    action: () => handlers.collapseAll?.()
  },

  {
    id: 'focus-search',
    label: 'Focus Tree Search',
    icon: 'fa-solid fa-magnifying-glass',
    shortcut: '/',
    category: 'Navigation',
    action: () => handlers.focusTreeSearch?.()
  },

  {
    id: 'import-menu',
    label: 'Import Menu',
    icon: 'fa-solid fa-file-import',
    category: 'Advanced',
    action: () => handlers.importMenu?.()
  },

  {
    id: 'export-menu',
    label: 'Export Menu',
    icon: 'fa-solid fa-file-export',
    category: 'Advanced',
    action: () => handlers.exportMenu?.()
  },

  ...(hasMenu
    ? [
        {
          id: 'duplicate-menu',
          label: 'Duplicate Menu',
          icon: 'fa-solid fa-copy',
          shortcut: 'Ctrl+D',
          category: 'Menus',
          action: () => handlers.duplicateMenu?.()
        },

        {
          id: 'delete-menu',
          label: 'Delete Active Menu',
          icon: 'fa-solid fa-trash',
          shortcut: 'Shift+Delete',
          category: 'Menus',
          action: () => handlers.deleteMenu?.()
        }
      ]
    : []),

  ...slotCommands
];
}

function renderPaletteResults(query) {
  const normalized = String(query || '').toLowerCase().trim();
  const state = MenusState.get();
  const items = [];

  const addCommandMatches = () => {
    commands.forEach(command => {
      const match = command.label.toLowerCase().includes(normalized);
      if (!normalized || match) items.push(command);
    });
  };

  const addEntityMatches = () => {
    const addResults = (collection, type, labelFn, actionFn) => {
      if (!normalized) return;
      (collection || []).forEach(entity => {
        const label = labelFn(entity);
        if (label.toLowerCase().includes(normalized)) {
          items.push({
            id: `${type}:${entity.id || entity._id || label}`,
            label: `${label} — ${type}`,
            category: type.charAt(0).toUpperCase() + type.slice(1),
            icon: ENTITY_ICONS[type] || 'fa-solid fa-circle',
            action: () => actionFn(entity),
          });
        }
      });
    };
    addResults(state.menus, 'menu', menu => menu.name || 'Untitled Menu', menu => handlers.openMenu?.(menu));
    addResults(state.activeMenu?.items || [], 'item', item => item.label || '(No label)', item => handlers.selectItem?.(item.id));
    addResults(state.pages, 'page', page => page.title || page.name || 'Page', page => handlers.insertItems?.('page', [page]));
    addResults(state.posts, 'post', post => post.title || 'Post', post => handlers.insertItems?.('post', [post]));
    addResults(state.categories, 'category', cat => cat.name || 'Category', cat => handlers.insertItems?.('category', [cat]));
    addResults(state.slots, 'slot', slot => slot, slot => handlers.assignSlot?.(slot));
  };

  addCommandMatches();
  addEntityMatches();

  paletteItems = items;
  if (items.length === 0) {
    paletteList.innerHTML = `<div class="ms-command-palette__empty">No commands found.</div>`;
    activeCommandIndex = -1;
    return;
  }

paletteList.innerHTML = items.map((item, index) => `
  <button
    class="ms-command-palette__item${index === 0 ? ' active' : ''}"
    type="button"
    data-index="${index}"
    role="option"
  >

    <span class="ms-command-palette__item-main">

      <i class="${item.icon || 'fa-solid fa-circle'}"></i>

      <span class="ms-command-palette__item-label">
        ${item.label}
      </span>

    </span>

    <span class="ms-command-palette__item-meta">

      <span class="ms-command-palette__item-category">
        ${item.category}
      </span>

      ${
        SHORTCUTS[item.id]
          ? `<kbd class="ms-command-palette__shortcut">${SHORTCUTS[item.id]}</kbd>`
          : ''
      }

    </span>

  </button>
`).join('');

  activeCommandIndex = 0;
  paletteList.querySelectorAll('.ms-command-palette__item').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      activeCommandIndex = index;
      executeActiveCommand(items);
    });
  });
}

function moveActive(delta) {
  const buttons = paletteList?.querySelectorAll('.ms-command-palette__item') || [];
  if (!buttons.length) return;
  buttons[activeCommandIndex]?.classList.remove('active');
  activeCommandIndex = (activeCommandIndex + delta + buttons.length) % buttons.length;
  buttons[activeCommandIndex]?.classList.add('active');
  buttons[activeCommandIndex]?.scrollIntoView({ block: 'nearest' });
}

function executeActiveCommand(resultItems) {
  const items = Array.isArray(resultItems) ? resultItems : paletteItems;
  const target = items[activeCommandIndex] || items[0];
  if (!target) return;

  if (target && typeof target.action === 'function') {
    closePalette();
    target.action();
  }
}

function handleKeyboard(event) {
  if (event.target.closest('input, textarea, select')) return;

  const combination = normalizeKey(event);

  if (combination === 'Control+P') {
    event.preventDefault();
    openPalette();
    return;
  }
  if (combination === 'Control+S') {
    event.preventDefault();
    handlers.saveMenu?.();
    return;
  }
  if (combination === 'Control+Shift+Alt+N') {
    event.preventDefault();
    handlers.createItem?.();
    return;
  }
  if (combination === 'Control+Alt+N') {
    event.preventDefault();
    handlers.createMenu?.();
    return;
  }
  if (combination === 'Control+D') {
    event.preventDefault();
    handlers.duplicateItem?.();
    return;
  }
  if (combination === 'Delete') {
    event.preventDefault();
    handlers.deleteItem?.();
    return;
  }
  if (combination === 'Shift+Delete') {
    event.preventDefault();
    handlers.deleteMenu?.();
    return;
  }
  if (combination === 'Escape') {
    event.preventDefault();
    if (isOpen) closePalette(); else handlers.clearSelection?.();
    return;
  }
  if (combination === 'F2') {
    event.preventDefault();
    handlers.renameItem?.();
    return;
  }
  if (combination === ' ') {
    event.preventDefault();
    handlers.toggleExpand?.();
    return;
  }
  if (combination === 'Control+Z') {
    event.preventDefault();
    handlers.undo?.();
    return;
  }
  if (combination === 'Control+Shift+Z') {
    event.preventDefault();
    handlers.redo?.();
    return;
  }
  if (event.key === 'ArrowUp' && event.shiftKey) {
    event.preventDefault();
    handlers.moveItem?.('up');
    return;
  }
  if (event.key === 'ArrowDown' && event.shiftKey) {
    event.preventDefault();
    handlers.moveItem?.('down');
    return;
  }
  if (event.key === 'ArrowLeft' && event.altKey) {
    event.preventDefault();
    handlers.outdentItem?.();
    return;
  }
  if (event.key === 'ArrowRight' && event.altKey) {
    event.preventDefault();
    handlers.indentItem?.();
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    handlers.collapseItem?.();
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    handlers.expandItem?.();
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    handlers.navigateItem?.('previous');
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    handlers.navigateItem?.('next');
    return;
  }
}

function findActiveItemIndex() {
  const items = flattenTree(MenusState.get().activeMenu?.items || []);
  const activeId = MenusState.get().activeItemId;
  return items.findIndex(item => item.id === activeId);
}

function flattenTree(items, depth = 0) {
  const output = [];
  if (!Array.isArray(items)) return output;
  items.forEach(item => {
    output.push({ ...item, _depth: depth });
    if (item.children?.length) output.push(...flattenTree(item.children, depth + 1));
  });
  return output;
}

function initBindings(options = {}) {
  handlers = {
    saveMenu: options.saveMenu,
    createMenu: options.createMenu,
    createItem: options.createItem,
    duplicateItem: options.duplicateItem,
    deleteItem: options.deleteItem,
    deleteMenu: options.deleteMenu,
    renameItem: options.renameItem,
    toggleExpand: options.toggleExpand,
    undo: options.undo,
    redo: options.redo,
    moveItem: direction => options.moveItem?.(direction),
    outdentItem: options.outdentItem,
    indentItem: options.indentItem,
    expandItem: options.expandItem,
    collapseItem: options.collapseItem,
    navigateItem: direction => {
      const items = flattenTree(MenusState.get().activeMenu?.items || []);
      const active = MenusState.get().activeItemId;
      const idx = items.findIndex(item => item.id === active);
      if (idx === -1) return;
      const next = direction === 'previous' ? items[idx - 1] : items[idx + 1];
      if (next) options.selectItem?.(next.id);
    },
    focusTreeSearch: options.focusTreeSearch,
    exportMenu: options.exportMenu,
    importMenu: options.importMenu,
    duplicateMenu: options.duplicateMenu,
    openMenu: options.openMenu,
    openItem: options.openItem,
    selectItem: options.selectItem,
    insertItems: options.insertItems,
    assignSlot: options.assignSlot,
  };

  document.addEventListener('keydown', handleKeyboard);
}

export const MenusKeyboard = {
  init: initBindings,
  openPalette,
  closePalette,
};
