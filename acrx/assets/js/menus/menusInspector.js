/**
 * menusInspector.js
 * Binds the inspector panel to the active item in the tree.
 */

import { MenusState } from './menusState.js';

let container = null;
let autoSaveFn = null;

function init(el, saveFn) {
  if (!el) return;
  container = el;
  autoSaveFn = saveFn;

  container.addEventListener('input', handleInput);
  container.addEventListener('click', handleDropdownSelection);
  container.addEventListener('change', handleInput);

  MenusState.on('item:changed', render);
  MenusState.on('menu:changed', render);
  MenusState.on('tree:changed', render);

  render();
}

function render() {
  if (!container) return;
  const activeId = MenusState.get().activeItemId;
  const item = MenusState.findItemById(MenusState.get().activeMenu?.items || [], activeId);
  if (!item) {
    container.querySelectorAll('input').forEach(input => input.value = '');
    return;
  }

  setInputValue('mn-item-label', item.label || '');
  setInputValue('mn-item-url', item.url || '');
  setInputValue('mn-item-icon', item.icon || '');
}

function handleInput(event) {
  const target = event.target;
  if (!target) return;
  const activeId = MenusState.get().activeItemId;
  if (!activeId) return;

  if (target.matches('#mn-item-label')) {
    updateActiveItem({ label: target.value });
    return;
  }
  if (target.matches('#mn-item-url')) {
    updateActiveItem({ url: target.value });
    return;
  }
  if (target.matches('#mn-item-icon')) {
    updateActiveItem({ icon: target.value });
    return;
  }
}

function handleDropdownSelection(event) {
  // no dropdowns in inspector anymore
}

function setInputValue(id, value) {
  const input = container.querySelector(`#${id}`);
  if (!input) return;
  input.value = value;
}

function setCheckboxValue(id, value) {
  const input = container.querySelector(`#${id}`);
  if (!input) return;
  input.checked = Boolean(value);
}

function setDropdownValue(id, value, label) {
  const wrapper = container.querySelector(`#${id}`);
  if (!wrapper) return;
  const toggle = wrapper.querySelector('.dropdown-toggle');
  const selectedButton = wrapper.querySelector(`.dropdown-item[data-value="${value}"]`);
  if (toggle) {
    const icon = toggle.querySelector('i, .icon');
    [...toggle.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).forEach(n => n.remove());
    const textNode = document.createTextNode((selectedButton ? selectedButton.textContent : label || value) + ' ');
    if (icon) toggle.insertBefore(textNode, icon);
    else toggle.prepend(textNode);
  }
  wrapper.querySelectorAll('.dropdown-item').forEach(item => item.removeAttribute('data-active'));
  if (selectedButton) selectedButton.setAttribute('data-active', 'true');
}

function updateActiveItem(patch) {
  const activeId = MenusState.get().activeItemId;
  if (!activeId) return;
  const menu = MenusState.get().activeMenu;
  if (!menu) return;

  const items = MenusState.deepClone(menu.items || []);
  const item = MenusState.findItemById(items, activeId);
  if (!item) return;
  Object.assign(item, patch);
  MenusState.updateActiveMenuItems(items);
  MenusState.pushHistory(items, 'Update item details');
  MenusState.markDirty();
  if (typeof autoSaveFn === 'function') autoSaveFn();
}

export const MenusInspector = {
  init,
};
