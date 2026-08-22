/**
 * menusPreview.js
 * Renders a live navigation preview for active menu items.
 */

import { MenusState } from './menusState.js';

let container = null;
let device = 'desktop';

function init(el) {
  if (!el) return;
  container = el;
  bindDeviceControls();
  MenusState.on('menu:changed', render);
  MenusState.on('tree:changed', render);
  render();
}

function bindDeviceControls() {
  const toolbar = document.querySelector('.mn-preview-dock__devices');
  if (!toolbar) return;
  toolbar.addEventListener('click', event => {
    const button = event.target.closest('[data-device]');
    if (!button) return;
    document.querySelectorAll('.mn-device-btn').forEach(btn => btn.classList.toggle('mn-device-btn--active', btn === button));
    device = button.dataset.device || 'desktop';
    render();
  });
}

function render() {
  if (!container) return;
  const menu = MenusState.get().activeMenu;
  const viewport = container.querySelector('#mn-preview-viewport');
  const nav = container.querySelector('#mn-preview-nav');
  if (!viewport || !nav) return;

  if (!menu || !Array.isArray(menu.items) || !menu.items.length) {
    nav.innerHTML = '<p class="mn-preview-empty">No menu items available.</p>';
    return;
  }

  nav.innerHTML = `<div class="mn-preview-device mn-preview-device--${device}">${renderMenuItems(menu.items)}</div>`;
}

function renderMenuItems(items) {
  if (!Array.isArray(items) || !items.length) return '<div class="mn-preview-empty">No items</div>';
  return `<ul class="mn-preview-list">${items.map(renderMenuItem).join('')}</ul>`;
}

function renderMenuItem(item) {
  const children = Array.isArray(item.children) && item.children.length ? `<ul>${item.children.map(renderMenuItem).join('')}</ul>` : '';
  return `
    <li class="mn-preview-item">
      <a href="${item.url || '#'}" target="${item.target || '_self'}" class="mn-preview-link">
        ${item.label || 'Untitled'}
      </a>
      ${children}
    </li>
  `;
}

export const MenusPreview = {
  init,
};
