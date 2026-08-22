/**
 * menusApi.js
 * Centralized API layer for the Menus Management system.
 * Uses `/acr/api` routes exactly as provided by the backend.
 */

import { MenusState } from './menusState.js';

const BASE = '/acr/api';

function getHeaders() {
  const token = window.System?.token || window.acrxToken || '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toast(message, type = 'info') {
  if (window.System?.showToast) {
    window.System.showToast(message, type);
  } else {
    console[type === 'error' ? 'error' : 'log']('[MenusApi]', message);
  }
}

async function request(method, path, body, opts = {}) {
  const url = `${BASE}${path}`;
  const config = {
    method,
    headers: getHeaders(),
    signal: opts.signal,
  };
  if (body !== undefined) config.body = JSON.stringify(body);

  try {
    const res = await fetch(url, config);
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!res.ok) {
      const message = data?.error || data?.message || `Request failed (${res.status})`;
      if (!opts.silent) toast(message, 'error');
      return { ok: false, error: message, data };
    }
    return { ok: true, data };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, error: 'Request aborted', aborted: true };
    const message = err.message || 'Network error';
    if (!opts.silent) toast(message, 'error');
    return { ok: false, error: message };
  }
}

const get = (path, opts) => request('GET', path, undefined, opts);
const post = (path, body, opts) => request('POST', path, body, opts);
const put = (path, body, opts) => request('PUT', path, body, opts);
const patch = (path, body, opts) => request('PATCH', path, body, opts);
const del = (path, opts) => request('DELETE', path, undefined, opts);

function qs(params = {}) {
  const layoutId = MenusState.get().activeLayoutId;
  const merged = layoutId ? { layoutId, ...params } : params;
  const search = new URLSearchParams(merged).toString();
  return search ? `?${search}` : '';
}

async function getMenus() {
  MenusState.setLoading('menus', true);
  const res = await get(`/menus${qs()}`);
  MenusState.setLoading('menus', false);
  if (res.ok) {
    const menus = Array.isArray(res.data.menus) ? res.data.menus : [];
    MenusState.setMenus(menus);
    return menus;
  }
  return [];
}

async function getMenu(id) {
  if (!id) return null;
  const res = await get(`/menus/${id}`);
  if (res.ok) return res.data.menu;
  return null;
}

async function createMenu(payload) {
  if (!payload) return null;
  const res = await post('/menus', payload);
  if (res.ok) {
    const menu = res.data.menu;
    MenusState.addMenuToList(menu);
    toast('Menu created', 'success');
    return menu;
  }
  return null;
}

async function updateMenu(id, payload, opts = {}) {
  if (!id || !payload) return null;
  if (!opts.silent) MenusState.setSaving(true);
  const res = await put(`/menus/${id}`, payload, { silent: opts.silent });
  if (!opts.silent) MenusState.setSaving(false);
  if (res.ok) {
    const menu = res.data.menu;
    MenusState.updateMenuInList(menu);
    MenusState.markClean();
    MenusState.clearDraft();
    if (!opts.silent) toast('Menu saved', 'success');
    return menu;
  }
  return null;
}

async function deleteMenu(id) {
  if (!id) return false;
  const res = await del(`/menus/${id}`);
  if (res.ok) {
    MenusState.removeMenuFromList(id);
    toast('Menu deleted', 'success');
    return true;
  }
  return false;
}

async function duplicateMenu(id) {
  if (!id) return null;
  const menu = await getMenu(id);
  if (!menu) return null;
  const copy = {
    name: `${menu.name || 'Untitled'} (Copy)`,
    items: deepClone(menu.items || []),
    places: [],
    layoutId: MenusState.get().activeLayoutId,
  };
  function reId(items) {
    return (items || []).map(item => ({
      ...item,
      id: MenusState.generateId(),
      children: reId(item.children),
    }));
  }
  copy.items = reId(copy.items);
  return createMenu(copy);
}

async function getSlots() {
  MenusState.setLoading('slots', true);
  const res = await get(`/menus/slots${qs()}`);
  MenusState.setLoading('slots', false);
  if (res.ok) {
    MenusState.setSlots(res.data.slots || [], res.data.assignments || {});
    return res.data;
  }
  return null;
}

async function assignMenuToSlot(slot, menuId) {
  if (!slot || !menuId) return null;
  const body = { slot, menuId, ...(MenusState.get().activeLayoutId ? { layoutId: MenusState.get().activeLayoutId } : {}) };
  const res = await post('/menus/slots/assign', body);
  if (res.ok) {
    const menu = res.data.menu || null;
    MenusState.updateSlotAssignment(slot, menu);
    if (menu) {
      const assignedId = menu._id || menu.id;
      const updatedMenus = MenusState.get().menus.map(item => {
        const itemId = item._id || item.id;
        if (itemId === assignedId) return menu;
        if (Array.isArray(item.places) && item.places.includes(slot)) {
          return { ...item, places: item.places.filter(place => place !== slot) };
        }
        return item;
      });
      MenusState.setMenus(updatedMenus);
      if (assignedId === MenusState.get().activeMenuId) {
        MenusState.setActiveMenu(menu);
      }
    }
    toast(`Assigned to ${slot}`, 'success');
    return menu;
  }
  return null;
}

async function unassignMenuFromSlot(menuId, slot) {
  if (!menuId || !slot) return false;
  const res = await post(`/menus/${menuId}/unassign`, { slot });
  if (res.ok) {
    MenusState.updateSlotAssignment(slot, null);
    const menu = MenusState.get().menus.find(item => (item._id || item.id) === menuId);
    if (menu) {
      const updatedMenu = { ...menu, places: Array.isArray(menu.places) ? menu.places.filter(place => place !== slot) : [] };
      const updatedMenus = MenusState.get().menus.map(item => {
        if ((item._id || item.id) === menuId) return updatedMenu;
        return item;
      });
      MenusState.setMenus(updatedMenus);
      if ((updatedMenu._id || updatedMenu.id) === MenusState.get().activeMenuId) {
        MenusState.setActiveMenu(updatedMenu);
      }
    }
    toast(`Unassigned ${slot}`, 'success');
    return true;
  }
  return false;
}

async function getPages() {
  if (MenusState.get().pages.length) return MenusState.get().pages;
  MenusState.setLoading('pages', true);
  const res = await get('/pages');
  MenusState.setLoading('pages', false);
  if (res.ok) {
    const pages = Array.isArray(res.data.pages) ? res.data.pages : [];
    MenusState.setPages(pages);
    return pages;
  }
  return [];
}

async function getPosts() {
  if (MenusState.get().posts.length) return MenusState.get().posts;
  MenusState.setLoading('posts', true);
  const res = await get('/posts');
  MenusState.setLoading('posts', false);
  if (res.ok) {
    const posts = Array.isArray(res.data.posts) ? res.data.posts : [];
    MenusState.setPosts(posts);
    return posts;
  }
  return [];
}

async function getCategories() {
  if (MenusState.get().categories.length) return MenusState.get().categories;
  MenusState.setLoading('categories', true);
  const res = await get('/categories');
  MenusState.setLoading('categories', false);
  if (res.ok) {
    const categories = Array.isArray(res.data.categories) ? res.data.categories : [];
    MenusState.setCategories(categories);
    return categories;
  }
  return [];
}

async function getActiveLayout() {
  const res = await get('/layouts/get/active', { silent: true });
  if (res.ok && res.data?.id) {
    MenusState.setActiveLayoutId(res.data.id);
    return res.data.id;
  }
  return null;
}

async function getAISettings() {
  MenusState.setLoading('aiSettings', true);
  const res = await get('/system/ai', { silent: true });
  MenusState.setLoading('aiSettings', false);
  if (res.ok) {
    const enabled = res.data?.enabled === true;
    MenusState.setAIEnabled(enabled, res.data);
    return res.data;
  }
  return null;
}

async function validateLinks(items) {
  const issues = [];
  const seen = new Set();
  MenusState.walkTree(items || [], item => {
    if (!item.label?.trim()) {
      issues.push({ id: item.id, type: 'warning', msg: 'Missing label' });
    }
    if (item.url) {
      if (seen.has(item.url)) {
        issues.push({ id: item.id, type: 'warning', msg: 'Duplicate URL' });
      }
      seen.add(item.url);
    }
  });
  return issues;
}

function deepClone(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

function exportMenu(menu) {
  if (!menu) return null;
  return JSON.stringify({ menu: deepClone(menu), exportedAt: new Date().toISOString() }, null, 2);
}

function importMenu(json) {
  try {
    const payload = typeof json === 'string' ? JSON.parse(json) : json;
    if (!payload || !payload.menu) return null;
    const menu = payload.menu;
    return menu;
  } catch (err) {
    toast('Invalid import payload', 'error');
    return null;
  }
}

export const MenusApi = {
  getMenus,
  getMenu,
  createMenu,
  updateMenu,
  deleteMenu,
  duplicateMenu,
  getSlots,
  assignMenuToSlot,
  unassignMenuFromSlot,
  getPages,
  getPosts,
  getCategories,
  getActiveLayout,
  getAISettings,
  validateLinks,
  exportMenu,
  importMenu,
};
