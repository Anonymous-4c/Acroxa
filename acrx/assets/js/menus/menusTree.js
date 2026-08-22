/**
 * menusTree.js
 * Renders the tree structure and provides item editing helpers.
 */

import { MenusState } from './menusState.js';

let container = null;
let autoSaveFn = null;

function init(el, toolbarEl, saveFn) {
  if (!el) return;
  container = el;
  autoSaveFn = saveFn;
  container.addEventListener('click', handleClick);
  container.addEventListener('dblclick', handleDblClick);

  MenusState.on('menu:changed', render);
  MenusState.on('tree:changed', render);
  MenusState.on('selection:changed', render);
  MenusState.on('item:changed', render);
  MenusState.on('search:changed', render);
  MenusState.on('expand:changed', render);
  MenusState.on('expand:all', render);
  MenusState.on('collapse:all', render);

  render();
}

function getItemId(item) {
  return item?.id || item?._id || '';
}

function render() {
  if (!container) return;
  const menu = MenusState.get().activeMenu;
  if (!menu) {
    container.innerHTML = `
      <div class="mn-tree-empty">
        <p>Select a menu or create one to begin building navigation.</p>
      </div>
    `;
    return;
  }

  if (Array.isArray(menu.items) && menu.items.length === 0) {
    container.innerHTML = `
      <div class="mn-tree-empty">
        <h3>${menu.name || 'Untitled menu'}</h3>
        <p>Please add some menu items to build your navigation.</p>
      </div>
    `;
    return;
  }

  const matches = MenusState.get().treeSearchMatches || new Set();
  const activeItemId = MenusState.get().activeItemId;
  container.innerHTML = renderNodes(menu.items, 0, matches, activeItemId);
}

function renderNodes(items, depth, matches, activeId) {
  if (!Array.isArray(items)) return '';
  return items.map(item => renderNode(item, depth, matches, activeId)).join('');
}

function renderNode(item, depth, matches, activeId) {
  const itemId = getItemId(item);
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  const expanded = MenusState.get().expandedIds.has(itemId);
  const selected = activeId === itemId ? 'mn-node--active' : '';
  const matched = matches.has(itemId) ? 'mn-node--matched' : '';
  const collapseClass = hasChildren ? (expanded ? 'mn-node__toggle--expanded' : '') : 'mn-node__toggle--disabled';

  const chips = [
    item.url ? `<span class="mn-node__chip mn-node__chip--muted">${item.url}</span>` : '',
  ].join('');

  return `
    <div class="mn-node ${selected} ${matched}" data-node-id="${itemId}" draggable="true" style="padding-left: ${16 + depth * 18}px;">
      <div class="mn-node__card">
        <div class="mn-node__drag"><i class="fa-duotone fa-grip-vertical"></i></div>
        <div class="mn-node__content">
          <div class="mn-node__top">
            <button type="button" class="mn-node__toggle ${collapseClass}" data-action="toggle" aria-label="Toggle children"></button>
            <span class="mn-node__label">${item.label || 'Untitled item'}</span>
            <div class="mn-node__chips">${chips}</div>
          </div>
          <div class="mn-node__bottom"><span>${item.url || 'No URL'}</span></div>
        </div>
        <div class="mn-node__actions">
          <button type="button" class="mn-icon-btn" data-action="move-up" title="Move up"><i class="fa-duotone fa-chevron-up"></i></button>
          <button type="button" class="mn-icon-btn" data-action="move-down" title="Move down"><i class="fa-duotone fa-chevron-down"></i></button>
          <button type="button" class="mn-icon-btn" data-action="add-child" title="Add child"><i class="fa-duotone fa-plus"></i></button>
          <button type="button" class="mn-icon-btn" data-action="duplicate" title="Duplicate"><i class="fa-duotone fa-clone"></i></button>
          <button type="button" class="mn-icon-btn mn-icon-btn--danger" data-action="delete" title="Delete"><i class="fa-duotone fa-trash"></i></button>
          <button type="button" class="mn-icon-btn" data-action="more" title="More"><i class="fa-duotone fa-ellipsis-vertical"></i></button>
        </div>
      </div>
      ${hasChildren && expanded ? `<div class="mn-node__children">${renderNodes(item.children, depth + 1, matches, activeId)}</div>` : ''}
    </div>
  `;
}

function handleClick(event) {
  const actionEl = event.target.closest('[data-action]');
  const nodeEl = event.target.closest('.mn-node');
  if (!nodeEl) return;
  const id = nodeEl.dataset.nodeId;
  if (!id) return;

  if (actionEl) {
    event.stopPropagation();
    const action = actionEl.dataset.action;
    if (action === 'add-child') {
      MenusState.emit('modal:add-items', { mode: 'child', parentId: id });
      return;
    }
    if (action === 'duplicate') {
      duplicateItem(id);
      return;
    }
    if (action === 'delete') {
      deleteItem(id);
      return;
    }
    if (action === 'toggle') {
      MenusState.toggleExpanded(id);
      return;
    }
    if (action === 'move-up') {
      moveItem(id, -1);
      return;
    }
    if (action === 'move-down') {
      moveItem(id, 1);
      return;
    }
    if (action === 'more') {
      showContextMenu(nodeEl, actionEl);
      return;
    }
  }

  selectItem(id);
}

// Context menu helpers
function closeContextMenu() {
  const existing = document.querySelector('.ms-context-menu');
  if (existing) existing.remove();
}

function showContextMenu(nodeEl, anchorEl) {
  closeContextMenu();
  const id = nodeEl.dataset.nodeId;
  const menu = document.createElement('div');
  menu.className = 'ms-context-menu';
  const list = document.createElement('div');
  list.className = 'ms-context-menu__list';

  const items = [
    { icon: 'fa-chevron-up', label: 'Move Up', action: () => moveItem(id, -1) },
    { icon: 'fa-chevron-down', label: 'Move Down', action: () => moveItem(id, 1) },
    { icon: 'fa-level-up', label: 'Make Main Item', action: () => outdentItem(id) },
    { icon: 'fa-indent', label: 'Indent (Make Child of Previous)', action: () => indentItem(id) },
    { icon: 'fa-clone', label: 'Duplicate', action: () => duplicateItem(id) },
    { icon: 'fa-trash', label: 'Delete', action: () => deleteItem(id), danger: true },
  ];

  items.forEach(it => {
    const elItem = document.createElement('div');
    elItem.className = 'ms-context-menu__item';
    if (it.danger) elItem.classList.add('ms-context-menu__item--danger');
    const iconEl = document.createElement('i');
    iconEl.className = `fa-duotone ${it.icon}`;
    iconEl.style.marginRight = '8px';
    elItem.appendChild(iconEl);
    const lbl = document.createElement('span');
    lbl.textContent = it.label;
    elItem.appendChild(lbl);
    elItem.addEventListener('click', e => {
      e.stopPropagation();
      try { it.action(); } catch (err) { console.error(err); }
      closeContextMenu();
    });
    list.appendChild(elItem);
  });

  menu.appendChild(list);
  document.body.appendChild(menu);

  // position near anchor
  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.minWidth = '180px';
  // prefer to open to the right of the anchor; clamp to viewport
  const margin = 8;
  let left = rect.right + 6;
  let top = rect.top;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // temporarily set so we can measure
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  const mRect = menu.getBoundingClientRect();
  if (mRect.right + margin > vw) {
    // open to left of anchor if no space
    left = rect.left - mRect.width - 6;
  }
  if (mRect.bottom + margin > vh) {
    top = Math.max(margin, vh - mRect.height - margin);
  }
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;

  // close on outside click
  setTimeout(() => document.addEventListener('click', closeContextMenu, { once: true }), 0);
}

function handleDblClick(event) {
  const nodeEl = event.target.closest('.mn-node');
  if (!nodeEl) return;
  const id = nodeEl.dataset.nodeId;
  if (!id) return;
  inlineRename(id);
}

function selectItem(id) {
  MenusState.selectItem(id, 'single');
  MenusState.emit('item:inspect', id);
}

function mutate(callback, description = 'Update tree') {
  const menu = MenusState.get().activeMenu;
  if (!menu) return false;
  const items = MenusState.deepClone(menu.items || []);
  const changed = callback(items);
  if (!changed) return false;
  MenusState.updateActiveMenuItems(items);
  MenusState.pushHistory(items, description);
  if (typeof autoSaveFn === 'function') autoSaveFn();
  return true;
}

function duplicateItem(id) {
  mutate(items => {
    const node = MenusState.findItemById(items, id);
    if (!node) return false;
    const parentData = findParent(items, id);
    const clone = deepCloneItem(node);
    reassignIds(clone);
    if (parentData) {
      parentData.container.splice(parentData.index + 1, 0, clone);
    } else {
      items.push(clone);
    }
    return true;
  }, 'Duplicate item');
}

function reassignIds(item) {
  if (!item || typeof item !== 'object') return;
  item.id = MenusState.generateId();
  if (item.children?.length) {
    item.children.forEach(child => reassignIds(child));
  }
}

function deleteItem(id) {
  mutate(items => {
    const parentData = findParent(items, id);
    if (!parentData) return false;
    parentData.container.splice(parentData.index, 1);
    if (MenusState.get().activeItemId === id) MenusState.clearSelection();
    return true;
  }, 'Delete item');
}

function moveItem(id, offset) {
  // FLIP animation: record positions, mutate, then animate new nodes from old positions
  const root = document.getElementById('mn-tree');
  const beforeRects = new Map();
  if (root) {
    Array.from(root.querySelectorAll('.mn-node')).forEach(n => {
      beforeRects.set(n.dataset.nodeId, n.getBoundingClientRect());
    });
  }

  const ok = mutate(items => {
    const parentData = findParent(items, id);
    if (!parentData) return false;
    const { container, index } = parentData;
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= container.length) return false;
    const [item] = container.splice(index, 1);
    container.splice(targetIndex, 0, item);
    return true;
  }, 'Move item');

  if (!ok || !root) return;

  // After render, compute deltas and animate using proper FLIP sequence:
  // 1) set transform to delta WITHOUT transition (jump to old visual position)
  // 2) force reflow
  // 3) set transition and transform to '' to animate to new position
  requestAnimationFrame(() => {
    const nodes = Array.from(root.querySelectorAll('.mn-node'));
    nodes.forEach(n => {
      const idk = n.dataset.nodeId;
      const before = beforeRects.get(idk);
      if (!before) return;
      const after = n.getBoundingClientRect();
      const dy = before.top - after.top;
      if (!dy) return;

      // apply inverse transform without transition
      n.style.transition = '';
      n.style.transform = `translateY(${dy}px)`;
      n.style.willChange = 'transform';

      // force reflow so transform takes effect immediately
      /* eslint-disable no-unused-expressions */
      n.getBoundingClientRect();
      /* eslint-enable no-unused-expressions */

      // then animate back to natural position
      requestAnimationFrame(() => {
        const clear = () => {
          n.style.transition = '';
          n.style.willChange = '';
          n.removeEventListener('transitionend', clear);
        };
        n.addEventListener('transitionend', clear);
        n.style.transition = 'transform 220ms cubic-bezier(.2,.9,.2,1)';
        n.style.transform = '';
      });
    });
  });
}

function moveItemTo(id, targetId, position = 'inside') {
  mutate(items => {
    if (id === targetId) return false;
    const sourceParent = findParent(items, id);
    const targetParent = findParent(items, targetId);
    const node = sourceParent?.container.splice(sourceParent.index, 1)[0];
    if (!node) return false;

    if (position === 'inside') {
      const targetNode = MenusState.findItemById(items, targetId);
      if (!targetNode) return false;
      targetNode.children = targetNode.children || [];
      targetNode.children.push(node);
      MenusState.setExpanded(targetId);
      return true;
    }

    if (!targetParent) {
      if (position === 'before') items.unshift(node);
      else items.push(node);
      return true;
    }

    if (position === 'before') targetParent.container.splice(targetParent.index, 0, node);
    else targetParent.container.splice(targetParent.index + 1, 0, node);
    return true;
  }, 'Move item');
}

function outdentItem(id) {
  mutate(items => {
    const parentData = findParent(items, id);
    if (!parentData || !parentData.parentData) return false;
    const item = parentData.container.splice(parentData.index, 1)[0];
    const siblingContainer = parentData.parentData.container;
    siblingContainer.splice(parentData.parentData.index + 1, 0, item);
    return true;
  }, 'Outdent item');
}

function indentItem(id) {
  mutate(items => {
    const parentData = findParent(items, id);
    if (!parentData) return false;
    const { container, index } = parentData;
    if (index === 0) return false;
    const prevSibling = container[index - 1];
    if (!prevSibling) return false;
    const item = container.splice(index, 1)[0];
    prevSibling.children = prevSibling.children || [];
    prevSibling.children.push(item);
    MenusState.setExpanded(prevSibling.id);
    return true;
  }, 'Indent item');
}

function inlineRename(id) {
  const field = document.querySelector('#mn-item-label');
  if (field) field.focus();
  MenusState.selectItem(id, 'single');
}

function findParent(items, id, parentData = null) {
  if (!Array.isArray(items)) return null;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if ((item.id || item._id) === id) {
      return { parentData, container: items, index: i };
    }
    if (item.children?.length) {
      const found = findParent(item.children, id, { container: items, index: i, parentData });
      if (found) return found;
    }
  }
  return null;
}

function deepCloneItem(item) {
  return MenusState.deepClone(item);
}

export const MenusTree = {
  init,
  mutate,
  duplicateItem,
  deleteItem,
  moveItem,
  moveItemTo,
  outdentItem,
  indentItem,
  inlineRename,
};
