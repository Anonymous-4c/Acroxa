/**
 * menusDragDrop.js
 * Enables drag & drop reordering for tree nodes.
 */

import { MenusState } from './menusState.js';
import { MenusTree } from './menusTree.js';

let tree = null;
let autoSaveFn = null;
let dragSourceId = null;
let lastOver = null;

function init(treeEl, saveFn) {
  if (!treeEl) return;
  tree = treeEl;
  autoSaveFn = saveFn;

  tree.addEventListener('dragstart', handleDragStart);
  tree.addEventListener('dragover', handleDragOver);
  tree.addEventListener('dragleave', handleDragLeave);
  tree.addEventListener('drop', handleDrop);
  tree.addEventListener('dragend', handleDragEnd);

  tree.addEventListener('dragenter', event => {
    const node = event.target.closest('.mn-node');
    if (node) node.classList.add('mn-node--drop-target');
  });
}

function handleDragStart(event) {
  const node = event.target.closest('.mn-node');
  if (!node) return;
  dragSourceId = node.dataset.nodeId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', dragSourceId);
  node.classList.add('mn-node--dragging');
}

function handleDragOver(event) {
  event.preventDefault();
  const node = event.target.closest('.mn-node');
  if (!node) return;
  if (lastOver && lastOver !== node) lastOver.classList.remove('mn-node--drag-over');
  node.classList.add('mn-node--drag-over');
  lastOver = node;
}

function handleDragLeave(event) {
  const node = event.target.closest('.mn-node');
  if (node) node.classList.remove('mn-node--drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  const node = event.target.closest('.mn-node');
  if (node) node.classList.remove('mn-node--drag-over');
  const targetId = node?.dataset.nodeId;
  const sourceId = dragSourceId || event.dataTransfer.getData('text/plain');
  if (!sourceId || sourceId === targetId) return;
  if (!targetId) {
    MenusTree.moveItemTo(sourceId, null, 'root');
  } else {
    MenusTree.moveItemTo(sourceId, targetId, 'inside');
  }
  if (typeof autoSaveFn === 'function') autoSaveFn();
  dragSourceId = null;
}

function handleDragEnd(event) {
  const node = event.target.closest('.mn-node');
  if (node) node.classList.remove('mn-node--dragging');
  if (lastOver) lastOver.classList.remove('mn-node--drag-over');
  lastOver = null;
}

export const MenusDragDrop = {
  init,
};
