/**
 * menusSidebar.js
 * Renders and manages the menu list, search, and card actions.
 */

import { MenusState } from './menusState.js';
import { MenusApi } from './menusApi.js';

let container = null;
let cardsWrapper = null;
let searchInput = null;
let filterStatus = null;
let filterSort = null;

function init(el) {
  if (!el) return;
  container = el;
  cardsWrapper = container.querySelector('#mn-menu-cards');
  searchInput = document.querySelector('#mn-search-menus');
  filterStatus = document.querySelector('#mn-filter-status');
  filterSort = document.querySelector('#mn-filter-sort');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      MenusState.setSidebarSearch(searchInput.value);
      renderMenuCards();
    });
  }

  container.addEventListener('click', handleClick);

  MenusState.on('menus:changed', renderMenuCards);
  MenusState.on('menu:changed', renderMenuCards);

  renderMenuCards();
}

function handleClick(event) {
  const card = event.target.closest('.mn-menu-card');
  if (!card || !cardsWrapper) return;
  const menuId = card.dataset.menuId;
  if (!menuId) return;

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'delete-menu') {
    event.stopPropagation();
    confirmDelete(menuId);
    return;
  }
  if (action === 'duplicate-menu') {
    event.stopPropagation();
    duplicateMenu(menuId);
    return;
  }
  if (action === 'copy-id') {
    event.stopPropagation();
    copyMenuId(menuId);
    return;
  }
  if (action === 'assign-slot') {
    event.stopPropagation();
    promptAssignSlot(menuId);
    return;
  }

  selectMenu(menuId);
}

function confirmDelete(id) {
  if (!window.confirm) {
    return deleteMenu(id);
  }
  if (window.confirm('Delete this menu? This cannot be undone.')) {
    deleteMenu(id);
  }
}

async function deleteMenu(id) {
  const success = await MenusApi.deleteMenu(id);
  if (success) {
    const state = MenusState.get();
    if (state.activeMenuId === id) {
      const next = state.menus[0] || null;
      if (next) MenusState.setActiveMenu(next);
      else MenusState.setActiveMenu(null);
    }
  }
}

async function duplicateMenu(id) {
  const menu = await MenusApi.duplicateMenu(id);
  if (menu) {
    MenusState.setActiveMenu(menu);
  }
}

function copyMenuId(id) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(id).catch(() => {
    console.warn('Unable to copy menu id');
  });
}

function promptAssignSlot(id) {
  const slot = window.prompt('Enter a slot name for this menu:', 'main');
  if (!slot) return;
  const menu = MenusState.get().menus.find(m => (m._id || m.id) === id);
  if (!menu) return;
  const updated = {
    ...menu,
    places: Array.isArray(menu.places) ? [...new Set([...(menu.places || []), slot])] : [slot],
  };
  MenusState.updateMenuInList(updated);
}

function selectMenu(id) {
  const menu = MenusState.get().menus.find(m => (m._id || m.id) === id);
  if (!menu) return;
  MenusState.setActiveMenu(menu);
  MenusState.pushHistory(menu.items || [], 'Select menu');
}

function renderMenuCards() {
  if (!cardsWrapper) return;
  const state = MenusState.get();
  const query = state.sidebarSearchQuery.toLowerCase();
  const menus = (state.menus || []).filter(menu => {
    if (!query) return true;
    return String(menu.name || '').toLowerCase().includes(query) || String(menu.description || '').toLowerCase().includes(query);
  });

  if (!menus.length) {
    cardsWrapper.innerHTML = `
      <div class="mn-sidebar-empty">
        <h3>No menus yet</h3>
        <p>Create a new navigation menu to get started.</p>
      </div>
    `;
    return;
  }

  cardsWrapper.innerHTML = menus.map(menu => {
    const id = menu._id || menu.id || '';
    const active = state.activeMenuId === id ? 'mn-menu-card--active' : '';
    const count = Array.isArray(menu.items) ? menu.items.length : 0;
    const slotBadges = (menu.places || []).map(place => `<span class="mn-menu-card__slot">${place}</span>`).join('') || '<span class="mn-menu-card__slot mn-menu-card__slot--empty">Unassigned</span>';
    return `
      <div class="mn-menu-card ${active}" data-menu-id="${id}" tabindex="0" role="button">
        <div class="mn-menu-card__top">
          <div class="mn-menu-card__titleWrap">
            <div class="mn-menu-card__icon"><i class="fa-duotone fa-bars"></i></div>
            <div class="mn-menu-card__info">
              <span class="mn-menu-card__title">${menu.name || 'Untitled Menu'}</span>
              <span class="mn-menu-card__meta">${count} items</span>
            </div>
          </div>
          <div class="mn-menu-card__actions">
            <button type="button" class="mn-icon-btn" data-action="copy-id" title="Copy menu ID"><i class="fa-duotone fa-copy"></i></button>
            <button type="button" class="mn-icon-btn" data-action="assign-slot" title="Assign slot"><i class="fa-duotone fa-link"></i></button>
            <button type="button" class="mn-icon-btn" data-action="duplicate-menu"><i class="fa-duotone fa-clone"></i></button>
            <button type="button" class="mn-icon-btn mn-icon-btn--danger" data-action="delete-menu"><i class="fa-duotone fa-trash"></i></button>
          </div>
        </div>
        <div class="mn-menu-card__slots">${slotBadges}</div>
      </div>
    `;
  }).join('');
}

function showCreateModal() {
  document.querySelector('#mn-btn-create')?.click();
}

export const MenusSidebar = {
  init,
  selectMenu,
  showCreateModal,
};
