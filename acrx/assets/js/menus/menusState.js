/**
 * menusState.js
 * Single source of truth for the Menus Management system.
 * Manages app state, undo/redo, selection, drafts, slots, and UI state.
 */

export const MenusState = (() => {
  const DRAFT_KEY   = 'acroxa_menus_draft';
  const SESSION_KEY = 'acroxa_menus_session';

  const state = {
    menus: [],
    activeMenuId: null,
    activeMenu: null,

    activeItemId: null,
    selectedItemIds: new Set(),
    multiSelectActive: false,
    lastClickedId: null,

    clipboard: null,

    isDirty: false,
    isSaving: false,
    lastSaved: null,

    expandedIds: new Set(),
    viewMode: 'desktop',
    devicePreview: 'desktop',

    treeSearchQuery: '',
    treeSearchMatches: new Set(),
    sidebarSearchQuery: '',
    commandPaletteQuery: '',

    slots: [],
    slotAssignments: {},

    pages: [],
    posts: [],
    categories: [],

    aiEnabled: false,
    aiStatus: null,

    loading: {
      menus: false,
      pages: false,
      posts: false,
      categories: false,
      slots: false,
      saving: false,
      aiSettings: false,
    },

    history: [],
    historyIndex: -1,
    maxHistory: 100,

    drag: {
      active: false,
      itemId: null,
      overItemId: null,
      position: null,
      depth: 0,
    },

    ui: {
      commandPaletteOpen: false,
      activePanel: 'tree',
      inspectorCollapsed: false,
      sidebarCollapsed: false,
    },

    analyticsCache: null,
    sessionRestored: false,
  };

  const subscribers = new Map();
  let subscriberId = 0;

  function emit(event, payload) {
    const subs = subscribers.get(event);
    if (subs) {
      subs.forEach(fn => {
        try { fn(payload); } catch (err) { console.error('[MenusState] event error', event, err); }
      });
    }
    const wildcard = subscribers.get('*');
    if (wildcard) {
      wildcard.forEach(fn => {
        try { fn({ event, payload }); } catch (err) { console.error('[MenusState] wildcard error', err); }
      });
    }
  }

  function on(event, callback) {
    if (!subscribers.has(event)) subscribers.set(event, new Map());
    const id = ++subscriberId;
    subscribers.get(event).set(id, callback);
    return () => subscribers.get(event)?.delete(id);
  }

  function get() {
    return state;
  }

  function getItemId(item) {
    if (!item || typeof item !== 'object') return '';
    return item.id || item._id || '';
  }

  function setMenus(menus) {
    state.menus = Array.isArray(menus) ? menus : [];
    emit('menus:changed', state.menus);
  }

  function normalizeItemIds(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
      const normalized = { ...item };
      normalized.id = normalized.id || normalized._id || generateId();
      if (Array.isArray(normalized.children)) {
        normalized.children = normalizeItemIds(normalized.children);
      }
      return normalized;
    });
  }

  function setActiveMenu(menu) {
    const prevId = state.activeMenuId;
    const cloned = menu ? deepClone(menu) : null;
    if (cloned && Array.isArray(cloned.items)) {
      cloned.items = normalizeItemIds(cloned.items);
    }

    state.activeMenu = cloned;
    state.activeMenuId = cloned ? (cloned._id || cloned.id || null) : null;
    state.activeItemId = null;
    state.selectedItemIds.clear();
    state.treeSearchQuery = '';
    state.treeSearchMatches.clear();
    state.expandedIds.clear();
    state.isDirty = false;
    state.analyticsCache = null;
    state.lastSaved = cloned ? Date.now() : null;
    state.history = [];
    state.historyIndex = -1;

    if (cloned && state.activeMenuId !== prevId) {
      emit('menu:changed', state.activeMenu);
      emit('selection:cleared', null);
    } else {
      emit('menu:changed', state.activeMenu);
    }
    emit('history:changed', { index: state.historyIndex, length: state.history.length });
  }

  function updateActiveMenuItems(items) {
    if (!state.activeMenu) return;
    state.activeMenu.items = deepClone(items || []);
    state.analyticsCache = null;
    emit('tree:changed', state.activeMenu.items);
  }

  function addMenuToList(menu) {
    if (!menu) return;
    state.menus = [...state.menus, menu];
    emit('menus:changed', state.menus);
  }

  function removeMenuFromList(id) {
    state.menus = state.menus.filter(menu => (menu._id || menu.id) !== id);
    if (state.activeMenuId === id) setActiveMenu(null);
    emit('menus:changed', state.menus);
  }

  function updateMenuInList(menu) {
    const id = menu?._id || menu?.id;
    if (!id) return;
    state.menus = state.menus.map(item => ((item._id || item.id) === id ? menu : item));
    if (state.activeMenuId === id) {
      const cloned = deepClone(menu);
      if (Array.isArray(cloned.items)) cloned.items = normalizeItemIds(cloned.items);
      state.activeMenu = cloned;
      emit('menu:changed', state.activeMenu);
    }
    emit('menus:changed', state.menus);
  }

  function setActiveItem(id) {
    state.activeItemId = id || null;
    emit('item:changed', state.activeItemId);
  }

  function selectItem(id, mode = 'single') {
    if (!id) {
      clearSelection();
      return;
    }

    if (mode === 'single') {
      state.selectedItemIds.clear();
      state.selectedItemIds.add(id);
      state.activeItemId = id;
      state.multiSelectActive = false;
    } else if (mode === 'toggle') {
      if (state.selectedItemIds.has(id)) {
        state.selectedItemIds.delete(id);
        if (state.activeItemId === id) state.activeItemId = [...state.selectedItemIds].slice(-1)[0] || null;
      } else {
        state.selectedItemIds.add(id);
        state.activeItemId = id;
        state.multiSelectActive = true;
      }
    } else if (mode === 'range') {
      const current = state.activeMenu?.items || [];
      const flat = flattenTree(current).map(item => item.id);
      const from = flat.indexOf(state.lastClickedId);
      const to = flat.indexOf(id);
      if (from === -1 || to === -1) {
        selectItem(id, 'single');
        return;
      }
      const [start, end] = from < to ? [from, to] : [to, from];
      for (let i = start; i <= end; i++) state.selectedItemIds.add(flat[i]);
      state.activeItemId = id;
      state.multiSelectActive = true;
    }

    state.lastClickedId = id;
    emit('selection:changed', Array.from(state.selectedItemIds));
    emit('item:changed', state.activeItemId);
  }

  function clearSelection() {
    state.selectedItemIds.clear();
    state.activeItemId = null;
    state.multiSelectActive = false;
    emit('selection:cleared', null);
    emit('item:changed', null);
  }

  function setCommandPaletteState(open, query = '') {
    state.ui.commandPaletteOpen = Boolean(open);
    state.commandPaletteQuery = query;
    emit('command-palette:changed', { open: state.ui.commandPaletteOpen, query });
  }

  function toggleCommandPalette(open) {
    setCommandPaletteState(open !== undefined ? open : !state.ui.commandPaletteOpen);
  }

  function setExpanded(id) {
    if (!id) return;
    state.expandedIds.add(id);
    emit('expand:changed', id);
  }

  function setCollapsed(id) {
    state.expandedIds.delete(id);
    emit('expand:changed', id);
  }

  function toggleExpanded(id) {
    if (!id) return;
    if (state.expandedIds.has(id)) setCollapsed(id); else setExpanded(id);
  }

  function expandAll() {
    const items = state.activeMenu?.items || [];
    walkTree(items, item => { if (item.children?.length) state.expandedIds.add(item.id); });
    emit('expand:all');
  }

  function collapseAll() {
    state.expandedIds.clear();
    emit('collapse:all');
  }

  function expandBranch(id) {
    const item = findItemById(state.activeMenu?.items || [], id);
    if (!item) return;
    walkTree([item], i => { if (i.children?.length) state.expandedIds.add(i.id); });
    emit('expand:branch', id);
  }

  function collapseBranch(id) {
    const item = findItemById(state.activeMenu?.items || [], id);
    if (!item) return;
    walkTree([item], i => state.expandedIds.delete(i.id));
    emit('collapse:branch', id);
  }

  function markDirty() {
    if (!state.isDirty) {
      state.isDirty = true;
      emit('dirty:changed', true);
    }
  }

  function markClean() {
    state.isDirty = false;
    state.lastSaved = Date.now();
    emit('dirty:changed', false);
    emit('saved', state.lastSaved);
  }

  function setSaving(value) {
    state.isSaving = Boolean(value);
    state.loading.saving = Boolean(value);
    emit('saving:changed', state.isSaving);
  }

  function pushHistory(snapshot, description = '') {
    if (!Array.isArray(snapshot)) return;
    if (state.historyIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIndex + 1);
    }
    state.history.push({ items: deepClone(snapshot), description, ts: Date.now() });
    if (state.history.length > state.maxHistory) state.history.shift();
    state.historyIndex = state.history.length - 1;
    emit('history:changed', { index: state.historyIndex, length: state.history.length });
  }

  function undo() {
    if (state.historyIndex <= 0) return null;
    state.historyIndex -= 1;
    const snapshot = state.history[state.historyIndex];
    emit('history:changed', { index: state.historyIndex, length: state.history.length });
    return deepClone(snapshot.items);
  }

  function redo() {
    if (state.historyIndex >= state.history.length - 1) return null;
    state.historyIndex += 1;
    const snapshot = state.history[state.historyIndex];
    emit('history:changed', { index: state.historyIndex, length: state.history.length });
    return deepClone(snapshot.items);
  }

  function canUndo() { return state.historyIndex > 0; }
  function canRedo() { return state.historyIndex < state.history.length - 1; }

  function setTreeSearch(query) {
    state.treeSearchQuery = String(query || '').trim();
    state.treeSearchMatches = computeSearchMatches(state.treeSearchQuery);
    emit('search:changed', { query: state.treeSearchQuery, matches: state.treeSearchMatches });
  }

  function setSidebarSearch(query) {
    state.sidebarSearchQuery = String(query || '').trim();
    emit('sidebar-search:changed', state.sidebarSearchQuery);
  }

  function computeSearchMatches(query) {
    const matches = new Set();
    if (!query || !state.activeMenu) return matches;

    const q = query.toLowerCase();
    walkTree(state.activeMenu.items || [], item => {
      const label = String(item.label || '').toLowerCase();
      const url = String(item.url || '').toLowerCase();
      const icon = String(item.icon || '').toLowerCase();
      const hit = label.includes(q) || url.includes(q) || icon.includes(q);
      if (hit) {
        matches.add(item.id);
        findAncestors(state.activeMenu.items, item.id)?.forEach(ancestor => {
          matches.add(ancestor.id);
          state.expandedIds.add(ancestor.id);
        });
      }
    });

    return matches;
  }

  function setSlots(slots, assignments) {
    state.slots = Array.isArray(slots) ? slots : [];
    state.slotAssignments = assignments && typeof assignments === 'object' ? assignments : {};
    emit('slots:changed', { slots: state.slots, assignments: state.slotAssignments });
  }

  function updateSlotAssignment(slot, menu) {
    if (!slot) return;
    state.slotAssignments[slot] = menu || null;
    emit('slots:changed', { slots: state.slots, assignments: state.slotAssignments });
  }

  function setPages(pages) {
    state.pages = Array.isArray(pages) ? pages : [];
    emit('pages:changed', state.pages);
  }

  function setPosts(posts) {
    state.posts = Array.isArray(posts) ? posts : [];
    emit('posts:changed', state.posts);
  }

  function setCategories(categories) {
    state.categories = Array.isArray(categories) ? categories : [];
    emit('categories:changed', state.categories);
  }

  function setAIEnabled(value, settings = null) {
    state.aiEnabled = Boolean(value);
    emit('ai:changed', { enabled: state.aiEnabled, settings });
  }

  function setActiveLayoutId(id) {
    state.activeLayoutId = id || null;
    emit('layout:changed', state.activeLayoutId);
  }

  function setLoading(key, value) {
    if (!Object.prototype.hasOwnProperty.call(state.loading, key)) return;
    state.loading[key] = Boolean(value);
    emit('loading:changed', { key, value: Boolean(value) });
  }

  function setDrag(patch) {
    Object.assign(state.drag, patch || {});
    emit('drag:changed', { ...state.drag });
  }

  function clearDrag() {
    state.drag = { active: false, itemId: null, overItemId: null, position: null, depth: 0 };
    emit('drag:changed', { ...state.drag });
  }

  function setViewMode(mode) {
    if (!mode) return;
    state.viewMode = mode;
    emit('viewmode:changed', state.viewMode);
  }

  function setDevicePreview(device) {
    if (!device) return;
    state.devicePreview = device;
    emit('device-preview:changed', state.devicePreview);
  }

  function setClipboard(item, mode = 'copy') {
    if (!item) return;
    state.clipboard = { item: deepClone(item), mode };
    emit('clipboard:changed', state.clipboard);
  }

  function clearClipboard() {
    state.clipboard = null;
    emit('clipboard:changed', null);
  }

  function computeAnalytics() {
    if (state.analyticsCache) return state.analyticsCache;
    if (!state.activeMenu) return null;

    let total = 0;
    let depth0 = 0;
    let depth1 = 0;
    let depth2 = 0;
    let links = 0;

    walkTree(state.activeMenu.items || [], (item, depth) => {
      total += 1;
      if (depth === 0) depth0 += 1;
      if (depth === 1) depth1 += 1;
      if (depth === 2) depth2 += 1;
      if (item.url) links += 1;
    });

    const assigned = Object.values(state.slotAssignments).filter(menu => menu && ((menu._id || menu.id) === state.activeMenuId)).length;

    state.analyticsCache = {
      total,
      depth0,
      depth1,
      depth2,
      links,
      assigned,
      lastSaved: state.lastSaved,
    };
    return state.analyticsCache;
  }

  function findItemById(items, id) {
    if (!Array.isArray(items) || !id) return null;
    for (const item of items) {
      if (getItemId(item) === id) return item;
      const found = findItemById(item.children || [], id);
      if (found) return found;
    }
    return null;
  }

  function findAncestors(items, id, path = []) {
    if (!Array.isArray(items) || !id) return null;
    for (const item of items) {
      if (getItemId(item) === id) return path;
      if (item.children?.length) {
        const found = findAncestors(item.children, id, [...path, item]);
        if (found) return found;
      }
    }
    return null;
  }

  function walkTree(items, fn, depth = 0) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      fn(item, depth);
      if (item.children?.length) walkTree(item.children, fn, depth + 1);
    }
  }

  function flattenTree(items, depth = 0) {
    const output = [];
    if (!Array.isArray(items)) return output;
    for (const item of items) {
      output.push({ ...item, _depth: depth });
      if (item.children?.length) output.push(...flattenTree(item.children, depth + 1));
    }
    return output;
  }

  function deepClone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
  }

  function generateId(prefix = 'item') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function saveDraft() {
    if (!state.activeMenu) return;
    const draft = {
      menuId: state.activeMenuId,
      items: deepClone(state.activeMenu.items || []),
      ts: Date.now(),
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (err) { console.warn('[MenusState] draft save failed', err); }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (!draft || !draft.menuId || typeof draft.ts !== 'number') return null;
      if (Date.now() - draft.ts > 3600000) { clearDraft(); return null; }
      return draft;
    } catch (err) {
      return null;
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
  }

  function saveSession() {
    const session = {
      activeMenuId: state.activeMenuId,
      activeItemId: state.activeItemId,
      expandedIds: Array.from(state.expandedIds),
      commandPaletteOpen: state.ui.commandPaletteOpen,
      viewMode: state.viewMode,
      devicePreview: state.devicePreview,
      sidebarSearchQuery: state.sidebarSearchQuery,
      treeSearchQuery: state.treeSearchQuery,
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (err) { /* ignore */ }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session) return null;
      state.activeItemId = session.activeItemId || state.activeItemId;
      state.activeMenuId = session.activeMenuId || state.activeMenuId;
      state.expandedIds = new Set(Array.isArray(session.expandedIds) ? session.expandedIds : []);
      state.ui.commandPaletteOpen = Boolean(session.commandPaletteOpen);
      state.viewMode = session.viewMode || state.viewMode;
      state.devicePreview = session.devicePreview || state.devicePreview;
      state.sidebarSearchQuery = session.sidebarSearchQuery || state.sidebarSearchQuery;
      state.treeSearchQuery = session.treeSearchQuery || state.treeSearchQuery;
      state.sessionRestored = true;
      return session;
    } catch (err) {
      return null;
    }
  }

  return {
    get,
    on,
    emit,

    setMenus,
    setActiveMenu,
    updateActiveMenuItems,
    addMenuToList,
    removeMenuFromList,
    updateMenuInList,

    setActiveItem,
    selectItem,
    clearSelection,

    setCommandPaletteState,
    toggleCommandPalette,

    setExpanded,
    setCollapsed,
    toggleExpanded,
    expandAll,
    collapseAll,
    expandBranch,
    collapseBranch,

    markDirty,
    markClean,
    setSaving,

    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,

    setTreeSearch,
    setSidebarSearch,
    computeSearchMatches,

    setSlots,
    updateSlotAssignment,

    setPages,
    setPosts,
    setCategories,
    setAIEnabled,

    setActiveLayoutId,
    setLoading,

    setDrag,
    clearDrag,

    setViewMode,
    setDevicePreview,

    setClipboard,
    clearClipboard,

    computeAnalytics,

    findItemById,
    findAncestors,
    walkTree,
    flattenTree,
    deepClone,
    generateId,

    saveDraft,
    loadDraft,
    clearDraft,

    saveSession,
    loadSession,
  };
})();