/**
 * menusBuilder.js
 * Boots the menu management tool and wires UI modules together.
 */

import { MenusState } from './menusState.js';
import { MenusApi } from './menusApi.js';
import { MenusSidebar } from './menusSidebar.js';
import { MenusTree } from './menusTree.js';
import { MenusInspector } from './menusInspector.js';
import { MenusPreview } from './menusPreview.js';
import { MenusDragDrop } from './menusDragDrop.js';
import { MenusKeyboard } from './menusKeyboard.js';

const AUTO_SAVE_DELAY = 500;
let autoSaveTimer = null;
let currentAddMode = 'root';
let currentParentId = null;
let currentDrawerTab = 'posts';
let isDrawerOpen = false;

function debounce(fn, wait = AUTO_SAVE_DELAY) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

async function saveActiveMenu(silent = true) {
  const state = MenusState.get();
  if (!state.activeMenuId || !state.activeMenu) return null;
  MenusState.setSaving(true);
  const payload = { items: state.activeMenu.items || [] };
  const result = await MenusApi.updateMenu(state.activeMenuId, payload, { silent });
  MenusState.setSaving(false);
  if (result) {
    MenusState.markClean();
  }
  return result;
}

const autoSave = debounce(() => saveActiveMenu(true), AUTO_SAVE_DELAY);

function markDirtyAndAutosave() {
  MenusState.markDirty();
  autoSave();
}

function findNodeContainer() {
  return document.querySelector('#mn-tree') || document.querySelector('.mn-tree');
}

function findInspectorContainer() {
  return document.querySelector('#mn-inspector') || document.querySelector('.mn-inspector');
}

function findSidebarContainer() {
  return document.querySelector('#mn-sidebar') || document.querySelector('.mn-sidebar');
}

function findPreviewContainer() {
  return document.querySelector('#mn-preview') || document.querySelector('.mn-preview') || document.querySelector('#mn-preview-dock');
}

function findToolbarContainer() {
  return document.querySelector('.mn-canvas-toolbar') || document.querySelector('.ms-tree-toolbar');
}

function buildSlotDropdown() {
  const selector = document.querySelector('#mn-slot-selector');
  if (!selector) return;
  const slotMenu = selector.querySelector('.wrap-menu-dp');
  if (!slotMenu) return;
  const slots = MenusState.get().slots || [];
  slotMenu.innerHTML = slots.map(slot => `
    <button type="button" class="dropdown-item" data-slot="${slot}">${slot}</button>
  `).join('');
}

function getDropdownValue(wrapperId) {
  const wrapper = document.querySelector(`#${wrapperId}`);
  if (!wrapper) return '';
  const active = wrapper.querySelector('.dropdown-item[data-active="true"]');
  return active ? active.dataset.value : '';
}

function setDropdownText(wrapperId, value, label) {
  const wrapper = document.querySelector(`#${wrapperId}`);
  if (!wrapper) return;
  const toggle = wrapper.querySelector('.dropdown-toggle');
  if (toggle) {
    const icon = toggle.querySelector('i, .icon');
    [...toggle.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).forEach(n => n.remove());
    const textNode = document.createTextNode((label || value) + ' ');
    if (icon) toggle.insertBefore(textNode, icon);
    else toggle.prepend(textNode);
  }
  wrapper.querySelectorAll('.dropdown-item').forEach(item => {
    if (item.dataset.value === value) {
      item.setAttribute('data-active', 'true');
    } else {
      item.removeAttribute('data-active');
    }
  });
}

function syncSlotSelection() {
  const selector = document.querySelector('#mn-slot-selector');
  if (!selector) return;
  const button = selector.querySelector('.dropdown-toggle');
  if (!button) return;
  const assignment = MenusState.get().slotAssignments;
  const activeId = MenusState.get().activeMenuId;
  const assignedSlot = Object.keys(assignment).find(slot => (assignment[slot]?.id || assignment[slot]?._id) === activeId);
  button.textContent = assignedSlot ? `Slot: ${assignedSlot}` : 'Assign Slot';
}

function wireSlotClicks() {
  const selector = document.querySelector('#mn-slot-selector');
  if (!selector) return;
  selector.addEventListener('click', async event => {
    const target = event.target.closest('[data-slot]');
    if (!target) return;
    const slot = target.dataset.slot;
    const activeId = MenusState.get().activeMenuId;
    if (!activeId) return;
    await MenusApi.assignMenuToSlot(slot, activeId);
    buildSlotDropdown();
    syncSlotSelection();
  });
}

function bindHeaderActions() {
  document.querySelector('#mn-btn-create')?.addEventListener('click', () => MenuActions.createMenu());
  document.querySelector('#mn-btn-save-all')?.addEventListener('click', async () => { await saveActiveMenu(false); });
  document.querySelector('#mn-btn-preview')?.addEventListener('click', () => {
    document.querySelector('#mn-preview-dock')?.classList.toggle('mn-preview-dock--hidden');
  });
}

function bindCanvasActions() {
  document.querySelector('#mn-btn-add-item')?.addEventListener('click', async () => {
    currentAddMode = 'root';
    currentParentId = null;
    await openDrawer('pages');
  });
  document.querySelector('#mn-btn-empty-create')?.addEventListener('click', MenuActions.createMenu);
  document.querySelector('#mn-btn-empty-import')?.addEventListener('click', MenuActions.importMenu);
  document.querySelector('#mn-btn-expand-all')?.addEventListener('click', () => MenusState.expandAll());
  document.querySelector('#mn-btn-collapse-all')?.addEventListener('click', () => MenusState.collapseAll());
}

function bindViewModeSelection() {
  const wrapper = document.querySelector('#mn-view-mode');
  if (!wrapper) return;
  wrapper.addEventListener('click', event => {
    const item = event.target.closest('.dropdown-item');
    if (!item) return;
    const value = item.dataset.value;
    if (!value) return;
    setDropdownText('mn-view-mode', value, item.textContent.trim());
    MenusState.setViewMode(value);
  });
}

function bindDrawer() {
  const drawer = document.querySelector('.mn-drawer');
  const overlay = document.querySelector('#mn-drawer-overlay');
  if (!drawer || !overlay) {
    console.warn('[MenusBuilder] Drawer or overlay not found in DOM');
    return;
  }

  overlay.addEventListener('click', async event => {
    if (event.target === overlay) {
      await closeDrawer();
    }
  });

  drawer.querySelectorAll('.mn-drawer-tab').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      if (tab) switchDrawerTab(tab);
    });
  });

  const searchInput = drawer.querySelector('#mn-drawer-search');
  if (searchInput) {
    searchInput.addEventListener('input', renderActiveDrawerTab);
  }

  const closeBtn = drawer.querySelector('#mn-btn-close-drawer');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      await closeDrawer();
    });
  }

  const addCustomBtn = drawer.querySelector('#mn-btn-add-custom-item');
  if (addCustomBtn) {
    addCustomBtn.addEventListener('click', addCustomItem);
  }
}

async function openDrawer(tab = 'pages') {
  const drawer = document.querySelector('.mn-drawer');
  const overlay = document.querySelector('#mn-drawer-overlay');
  if (!drawer || !overlay) return;
  
  isDrawerOpen = true;
  switchDrawerTab(tab);
  
  // Preload data for the selected tab
  if (tab === 'pages') {
    await MenusApi.getPages();
  } else if (tab === 'posts') {
    await MenusApi.getPosts();
  } else if (tab === 'categories') {
    await MenusApi.getCategories();
  }
  
  // Render content after preloading
  renderActiveDrawerTab();
  
  // Show overlay and drawer with smooth transition
  overlay.classList.add('mn-drawer-overlay--open');
  drawer.classList.add('mn-drawer--open', 'mn-drawer--modal');
}

async function closeDrawer() {
  const drawer = document.querySelector('.mn-drawer');
  const overlay = document.querySelector('#mn-drawer-overlay');
  if (!drawer || !overlay) return;
  
  isDrawerOpen = false;
  overlay.classList.remove('mn-drawer-overlay--open');
  drawer.classList.remove('mn-drawer--open', 'mn-drawer--modal');
  
  // Wait for CSS transition to complete
  await new Promise(resolve => setTimeout(resolve, 350));
}

function switchDrawerTab(tab) {
  currentDrawerTab = tab;
  document.querySelectorAll('.mn-drawer-tab').forEach(button => {
    button.classList.toggle('mn-drawer-tab--active', button.dataset.tab === tab);
  });
  document.querySelectorAll('.mn-drawer-panel').forEach(panel => {
    panel.classList.toggle('mn-drawer-panel--active', panel.id === `mn-panel-${tab}`);
  });
  renderActiveDrawerTab();
}

function renderActiveDrawerTab() {
  const query = document.querySelector('#mn-drawer-search')?.value.trim().toLowerCase() || '';
  if (currentDrawerTab === 'pages') renderContentPanel('pages', query);
  if (currentDrawerTab === 'posts') renderContentPanel('posts', query);
  if (currentDrawerTab === 'categories') renderContentPanel('categories', query);
  if (currentDrawerTab === 'custom') renderCustomPanel();
  if (currentDrawerTab === 'dynamic') renderDynamicPanel();
}

function renderDynamicPanel() {
  const container = document.querySelector('#mn-panel-dynamic');
  if (!container) return;
  container.innerHTML = `
    <div class="mn-drawer-panel__empty">
      <h3>Dynamic Content</h3>
      <p>Dynamic menu sources will be available here soon.</p>
    </div>
  `;
}

function renderContentPanel(type, query) {
  const container = document.querySelector(`#mn-panel-${type}`);
  if (!container) return;
  let items = [];
  if (type === 'pages') items = MenusState.get().pages;
  if (type === 'posts') items = MenusState.get().posts;
  if (type === 'categories') items = MenusState.get().categories;

  const filtered = items.filter(item => {
    const text = [item.title, item.name, item.slug, item.status, item.category, item.type].filter(Boolean).join(' ').toLowerCase();
    return !query || text.includes(query);
  });

  container.innerHTML = `
    <div class="mn-drawer-panel__toolbar">
      <button type="button" class="acr-btn acr-btn--primary" id="mn-add-selected-${type}">Add Selected</button>
      <span class="mn-drawer-panel__count">${filtered.length} ${type}</span>
    </div>
    <div class="mn-drawer-panel__list" id="mn-drawer-${type}-list">
      ${filtered.length ? filtered.map(item => renderDrawerItem(type, item)).join('') : `
        <div class="mn-drawer-panel__empty">
          <h3>No ${type} found</h3>
          <p>Try a different search or add content in the CMS.</p>
        </div>
      `}
    </div>
  `;

  container.querySelectorAll('.mn-drawer-item-add').forEach(button => {
    button.addEventListener('click', () => insertEntity(type, button.dataset.id));
  });
  container.querySelector(`#mn-add-selected-${type}`)?.addEventListener('click', () => addSelectedEntities(type));
}

function renderDrawerItem(type, item) {
  const title = item.title || item.name || item.slug || item.label || 'Untitled';
  const subtitle = type === 'categories' ? (item.description || '') : (item.status || item.url || '');
  const id = item._id || item.id || item.slug || title;
  const iconClass = item.icon ||
    (type === 'pages' ? 'fa-duotone fa-file' :
    type === 'posts' ? 'fa-duotone fa-file-lines' :
    type === 'categories' ? 'fa-duotone fa-layer-group' :
    'fa-duotone fa-link');

  return `
    <label class="mn-drawer-item" title="${title}">
      <input type="checkbox" class="mn-drawer-item__checkbox" data-item-id="${id}" data-item-type="${type}" />
      <span class="mn-drawer-item__icon"><i class="${iconClass}"></i></span>
      <div class="mn-drawer-item__content">
        <strong>${title}</strong>
        <span>${subtitle || ''}</span>
      </div>
      <button type="button" class="acr-btn acr-btn--ghost mn-drawer-item-add" data-id="${id}" title="Add item">Add</button>
    </label>
  `;
}

function addSelectedEntities(type) {
  const container = document.querySelector(`#mn-panel-${type}`);
  const checked = Array.from(container?.querySelectorAll('.mn-drawer-item__checkbox:checked') || []);
  if (!checked.length) {
    window.System?.showToast?.('Select at least one item to add', 'info');
    return;
  }
  const ids = checked.map(input => input.dataset.itemId).filter(Boolean);
  ids.forEach(id => insertEntity(type, id));
}

function insertEntity(type, entityId) {
  const entity = getEntityByType(type, entityId);
  if (!entity) return;
  const item = createItemFromEntity(type, entity);
  insertItemIntoTree(item, currentParentId);
}

function getEntityByType(type, entityId) {
  const list = type === 'pages' ? MenusState.get().pages
    : type === 'posts' ? MenusState.get().posts
    : type === 'categories' ? MenusState.get().categories
    : [];
  return list.find(entity => String(entity._id || entity.id || entity.slug || entity.name) === entityId);
}

function addCustomItem() {
  const label = document.querySelector('#mn-custom-label')?.value.trim();
  const url = document.querySelector('#mn-custom-url')?.value.trim();
  const icon = document.querySelector('#mn-custom-icon');
  if (!label || !url) {
    window.System?.showToast?.('Custom item needs label and URL', 'error');
    return;
  }
  const item = {
    id: MenusState.generateId(),
    label,
    url,
    icon: icon?.value || '',
    children: [],
  };
  insertItemIntoTree(item, currentParentId);
  if (icon) icon.value = '';
  const customLabelEl = document.querySelector('#mn-custom-label');
  if (customLabelEl) customLabelEl.value = '';
  const customUrlEl = document.querySelector('#mn-custom-url');
  if (customUrlEl) customUrlEl.value = '';
  window.System?.showToast?.('Custom item added', 'success');
}

function createItemFromEntity(type, entity) {
  const base = {
    id: MenusState.generateId(),
    label: entity.title || entity.name || entity.slug || 'Untitled',
    icon: type === 'pages' ? 'fa-duotone fa-file' : type === 'posts' ? 'fa-duotone fa-file-lines' : 'fa-duotone fa-layer-group',
    children: [],
  };
  if (type === 'pages') base.url = entity.slug ? `/${entity.slug}` : entity.url || '#';
  if (type === 'posts') base.url = entity.slug ? `/${entity.slug}` : entity.url || '#';
  if (type === 'categories') base.url = entity.slug ? `/category/${entity.slug}` : entity.url || '#';
  return base;
}

function insertItemIntoTree(item, parentId) {
  if (!MenusState.get().activeMenuId) {
    window.System?.showToast?.('Select or create a menu before adding items', 'error');
    return;
  }

  const inserted = MenusTree.mutate(items => {
    if (!parentId) {
      items.push(item);
      return true;
    }
    const parent = MenusState.findItemById(items, parentId);
    if (!parent) return false;
    parent.children = parent.children || [];
    const ancestors = MenusState.findAncestors(items, parentId) || [];
    if (ancestors.length >= 2) return false;
    parent.children.push(item);
    MenusState.setExpanded(parentId);
    return true;
  }, 'Insert item');

  if (inserted) {
    markDirtyAndAutosave();
    closeDrawer();
  }
}

function bindDrawerTabHandlers() {
  const drawer = document.querySelector('.mn-drawer');
  if (!drawer) return;
  const search = drawer.querySelector('#mn-drawer-search');
  search?.addEventListener('input', renderActiveDrawerTab);
}

function updateCreateModalSlots() {
  const slotDropdown = document.querySelector('#mn-create-slot');
  if (!slotDropdown) return;
  const menu = MenusState.get().slots || [];
  const menuHtml = ['<button type="button" class="dropdown-item" data-value="">None</button>', ...menu.map(slot => `
    <button type="button" class="dropdown-item" data-value="${slot}">${slot}</button>
  `)].join('');
  const wrap = slotDropdown.querySelector('.wrap-menu-dp');
  if (wrap) wrap.innerHTML = menuHtml;
}

function handleCreateModal() {
  const modal = document.querySelector('#mn-modal-create');
  const slotDropdown = document.querySelector('#mn-create-slot');

  document.querySelector('#mn-btn-confirm-create')?.addEventListener('click', async () => {
    const name = document.querySelector('#mn-create-name')?.value.trim();
    if (!name) return window.System?.showToast?.('Menu name is required', 'error');
    const selectedSlot = getDropdownValue('mn-create-slot');
    const payload = {
      name,
      items: [],
      places: selectedSlot ? [selectedSlot] : [],
      layoutId: MenusState.get().activeLayoutId,
    };
    const menu = await MenusApi.createMenu(payload);
    if (menu) {
      if (menu._id || menu.id) {
        MenusState.setActiveMenu(menu);
        MenusState.pushHistory(menu.items || [], 'Create menu');
      }
      modal?.classList.remove('open');
    }
  });

  document.querySelector('#mn-btn-cancel-create')?.addEventListener('click', () => {
    modal?.classList.remove('open');
  });
  document.querySelector('#mn-modal-close')?.addEventListener('click', () => {
    modal?.classList.remove('open');
  });
  modal?.addEventListener('click', event => {
    if (event.target === event.currentTarget) {
      modal.classList.remove('open');
    }
  });

  slotDropdown?.addEventListener('click', event => {
    const item = event.target.closest('.dropdown-item');
    if (!item) return;
    setDropdownText('mn-create-slot', item.dataset.value, item.textContent.trim());
  });
}

function showCreateMenuModal() {
  updateCreateModalSlots();
  const modal = document.querySelector('#mn-modal-create');
  if (!modal) return;
  modal.classList.add('open');
  modal.querySelector('#mn-create-name')?.focus();
}

const MenuActions = {
  createMenu: showCreateMenuModal,
  saveMenu: () => saveActiveMenu(false),
  createItem: () => {
    currentAddMode = 'root';
    currentParentId = null;
    openDrawer('pages');
  },
  duplicateItem: () => {
    const id = MenusState.get().activeItemId;
    if (!id) return;
    MenusTree.duplicateItem(id);
    markDirtyAndAutosave();
  },
  deleteItem: () => {
    const id = MenusState.get().activeItemId;
    if (!id) return;
    MenusTree.deleteItem(id);
    markDirtyAndAutosave();
  },
  deleteMenu: async () => {
    const activeId = MenusState.get().activeMenuId;
    if (!activeId) return;
    const success = await MenusApi.deleteMenu(activeId);
    if (success) {
      const menus = MenusState.get().menus || [];
      if (!MenusState.get().activeMenuId && menus.length) {
        MenusState.setActiveMenu(menus[0]);
        MenusState.pushHistory(menus[0].items || [], 'Activate next menu');
      }
    }
  },
  renameItem: () => {
    const id = MenusState.get().activeItemId;
    if (!id) return;
    MenusTree.inlineRename(id);
  },
  toggleExpand: () => {
    const id = MenusState.get().activeItemId;
    if (!id) return;
    MenusState.toggleExpand(id);
  },
  undo: () => {
    const items = MenusState.undo();
    if (items) {
      MenusState.updateActiveMenuItems(items);
      markDirtyAndAutosave();
    }
  },
  redo: () => {
    const items = MenusState.redo();
    if (items) {
      MenusState.updateActiveMenuItems(items);
      markDirtyAndAutosave();
    }
  },
  moveItem: direction => {
    const id = MenusState.get().activeItemId;
    if (!id) return;
    if (direction === 'up') MenusTree.moveItem(id, -1);
    if (direction === 'down') MenusTree.moveItem(id, +1);
    markDirtyAndAutosave();
  },
  outdentItem: () => {
    const id = MenusState.get().activeItemId;
    if (!id) return;
    MenusTree.outdentItem(id);
    markDirtyAndAutosave();
  },
  indentItem: () => {
    const id = MenusState.get().activeItemId;
    if (!id) return;
    MenusTree.indentItem(id);
    markDirtyAndAutosave();
  },
  expandItem: () => {
    const id = MenusState.get().activeItemId;
    if (!id) return;
    MenusState.setExpanded(id);
  },
  collapseItem: () => {
    const id = MenusState.get().activeItemId;
    if (!id) return;
    MenusState.setCollapsed(id);
  },
  focusTreeSearch: () => {
    document.querySelector('#mn-drawer-search')?.focus();
  },
  exportMenu: () => {
    const menu = MenusState.get().activeMenu;
    if (!menu) return;
    const json = MenusApi.exportMenu(menu);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${menu.name || 'menu'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  },
  importMenu: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const payload = MenusApi.importMenu(text);
      if (!payload || !payload.menu) return;
      const menu = payload.menu;
      const payloadToCreate = {
        name: menu.name || `Imported Menu ${new Date().toISOString()}`,
        items: MenusState.normalizeItemIds(menu.items || []),
        places: Array.isArray(menu.places) ? menu.places : [],
        layoutId: MenusState.get().activeLayoutId,
      };
      const created = await MenusApi.createMenu(payloadToCreate);
      if (created) {
        MenusState.setActiveMenu(created);
        MenusState.pushHistory(created.items || [], 'Import menu');
      }
    });
    input.click();
  },
  openMenu: menu => {
    if (!menu) return;
    MenusState.setActiveMenu(menu);
    MenusState.pushHistory(menu.items || [], 'Open menu');
  },
  selectItem: id => {
    MenusState.selectItem(id, 'single');
    MenusState.emit('item:inspect', id);
  },
  insertItems: (type, items) => {
    (items || []).forEach(entity => {
      const item = createItemFromEntity(type, entity);
      insertItemIntoTree(item, currentParentId);
    });
  },
  assignSlot: async slot => {
    const activeId = MenusState.get().activeMenuId;
    if (!activeId) return;
    await MenusApi.assignMenuToSlot(slot, activeId);
    buildSlotDropdown();
    syncSlotSelection();
  },
};

function refreshCanvasEmptyState() {
  const empty = document.querySelector('#mn-canvas-empty');
  if (!empty) return;
  const activeMenu = MenusState.get().activeMenu;
  const hasItems = activeMenu && Array.isArray(activeMenu.items) && activeMenu.items.length > 0;
  empty.style.display = hasItems ? 'none' : '';
}

function handleGlobalEvents() {
  MenusState.on('tree:changed', () => {
    markDirtyAndAutosave();
    syncSlotSelection();
    MenusState.saveSession();
    refreshCanvasEmptyState();
  });
  MenusState.on('menu:changed', () => {
    syncSlotSelection();
    MenusState.saveSession();
    refreshCanvasEmptyState();
  });
  MenusState.on('slots:changed', () => {
    buildSlotDropdown();
    syncSlotSelection();
    MenusState.saveSession();
  });
  MenusState.on('dirty:changed', isDirty => {
    document.documentElement.dataset.menusDirty = isDirty ? 'true' : 'false';
  });
  MenusState.on('item:changed', () => {
    MenusState.saveSession();
    refreshCanvasEmptyState();
  });
  MenusState.on('search:changed', () => MenusState.saveSession());
  MenusState.on('sidebar-search:changed', () => MenusState.saveSession());
  MenusState.on('viewmode:changed', () => MenusState.saveSession());
  MenusState.on('device-preview:changed', () => MenusState.saveSession());
}

async function init() {
  const sidebar = findSidebarContainer();
  const tree = findNodeContainer();
  const inspector = findInspectorContainer();
  const preview = findPreviewContainer();
  const toolbar = findToolbarContainer();

  if (sidebar) MenusSidebar.init(sidebar);
  if (tree) MenusTree.init(tree, toolbar, autoSave);
  if (inspector) MenusInspector.init(inspector, autoSave);
  // live preview removed per UX request
  if (tree) MenusDragDrop.init(tree, autoSave);

  bindHeaderActions();
  bindCanvasActions();
  bindViewModeSelection();
  bindDrawer();
  wireSlotClicks();
  handleCreateModal();

  MenusState.on('pages:changed', renderActiveDrawerTab);
  MenusState.on('posts:changed', renderActiveDrawerTab);
  MenusState.on('categories:changed', renderActiveDrawerTab);

  MenusKeyboard.init({
    saveMenu: () => saveActiveMenu(false),
    createMenu: MenuActions.createMenu,
    createItem: MenuActions.createItem,
    duplicateItem: MenuActions.duplicateItem,
    deleteItem: MenuActions.deleteItem,
    deleteMenu: MenuActions.deleteMenu,
    renameItem: MenuActions.renameItem,
    toggleExpand: MenuActions.toggleExpand,
    undo: MenuActions.undo,
    redo: MenuActions.redo,
    moveItem: MenuActions.moveItem,
    outdentItem: MenuActions.outdentItem,
    indentItem: MenuActions.indentItem,
    expandItem: MenuActions.expandItem,
    collapseItem: MenuActions.collapseItem,
    focusTreeSearch: MenuActions.focusTreeSearch,
    exportMenu: MenuActions.exportMenu,
    importMenu: MenuActions.importMenu,
    duplicateMenu: MenuActions.duplicateMenu,
    openMenu: MenuActions.openMenu,
    selectItem: MenuActions.selectItem,
    insertItems: MenuActions.insertItems,
    assignSlot: MenuActions.assignSlot,
  });

  MenusState.on('modal:add-items', ({ mode, parentId }) => {
    currentAddMode = mode || 'root';
    currentParentId = parentId || null;
    openDrawer('pages');
  });

  MenusState.on('item:inspect', id => {
    if (id) {
      MenusState.setActiveItem(id);
    }
  });

  handleGlobalEvents();

  await MenusApi.getActiveLayout();
  await MenusApi.getSlots();
  await loadContentPools();
  await loadMenus();
  await loadAI();
  buildSlotDropdown();
  syncSlotSelection();
  loadSessionState();

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') MenusState.saveDraft(); });
  window.addEventListener('beforeunload', event => {
    if (MenusState.get().isDirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

async function loadContentPools() {
  await Promise.all([MenusApi.getPages(), MenusApi.getPosts(), MenusApi.getCategories()]);
}

async function loadMenus() {
  const menus = await MenusApi.getMenus();
  if (!menus.length) return;
  const activeId = MenusState.get().activeMenuId || menus[0]._id || menus[0].id;
  const menu = menus.find(m => (m._id || m.id) === activeId) || menus[0];
  if (menu) {
    MenusState.setActiveMenu(menu);
    MenusState.pushHistory(menu.items || [], 'Load menu');
  }
}

async function loadAI() {
  const aiSettings = await MenusApi.getAISettings();
  if (aiSettings?.enabled) {
    addAIButton();
  }
}

function addAIButton() {
  const header = document.querySelector('.dshb-header') || document.querySelector('.mn-app header') || document.body;
  if (!header || header.querySelector('#mn-btn-ai-assistant')) return;
  const button = document.createElement('button');
  button.id = 'mn-btn-ai-assistant';
  button.className = 'acr-btn acr-btn--ghost';
  button.type = 'button';
  button.innerHTML = '<i class="fa-duotone fa-robot"></i> AI Assist';
  button.addEventListener('click', () => {
    if (window.location) {
      window.location.href = '/acrx/system/ai';
    } else {
      window.System?.showToast?.('Open AI settings to enable menu assistant.', 'info');
    }
  });
  const target = header.querySelector('.header-actions') || header;
  target.appendChild(button);
}

function loadSessionState() {
  const session = MenusState.loadSession();
  if (!session) return;
  if (session.activeMenuId) {
    const menu = MenusState.get().menus.find(m => (m._id || m.id) === session.activeMenuId);
    if (menu) MenusState.setActiveMenu(menu);
  }
  if (session.activeItemId) MenusState.setActiveItem(session.activeItemId);
  if (session.treeSearchQuery) MenusState.setTreeSearch(session.treeSearchQuery);
}

init();
