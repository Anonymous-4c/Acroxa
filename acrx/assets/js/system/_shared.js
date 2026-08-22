/**
 * /acrx/assets/js/system/_shared.js
 * Global System object — imported/included before every settings page script.
 * Provides: API calls, form helpers, toast, dropdown wiring.
 *
 * API base: /acr/api
 * Settings routes:  /acr/api/system/...
 * Backup routes:    /acr/api/system/backups/...
 */

'use strict';

/* ─── API Base ────────────────────────────────────────────────────────────── */
const BASE_API = '/acr/api';
const SETTINGS_BASE = `${BASE_API}/system`;
const BACKUPS_BASE  = `${BASE_API}/system/backups`;

/* ─── Core fetch ──────────────────────────────────────────────────────────── */
async function _request(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const json = await res.json().catch(() => ({ success: false, message: `HTTP ${res.status}` }));
  if (!json.success) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

function showToast(message, type = 'success') {
  document.getElementById('acrx-toast')?.remove();

  const icons = {
    success: 'fa-duotone fa-circle-check',
    error: 'fa-duotone fa-circle-xmark',
    warning: 'fa-duotone fa-triangle-exclamation',
    info: 'fa-duotone fa-circle-info'
  };

  const toast = document.createElement('div');
  toast.id = 'acrx-toast';
  toast.className = `acrx-toast toast-${type}`;

  toast.innerHTML = `
    <div class="toast-icon">
      <i class="${icons[type] || icons.info}"></i>
    </div>

    <div class="toast-content">
      <span class="toast-msg">${message}</span>
    </div>

    <button class="toast-close" aria-label="Close">
      <i class="fa-duotone fa-xmark"></i>
    </button>
  `;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  let removed = false;
  let timer = setTimeout(removeToast, 5000);

  function removeToast() {
    if (removed) return;
    removed = true;

    clearTimeout(timer);
    toast.classList.remove('toast-visible');

    setTimeout(() => toast.remove(), 280);
  }

  // close button
  toast.querySelector('.toast-close').addEventListener('click', removeToast);

  // swipe / drag dismiss
  let startX = 0;
  let currentX = 0;
  let dragging = false;

  function start(e) {
    dragging = true;
    toast.classList.add('dragging');
    clearTimeout(timer);

    startX = e.touches ? e.touches[0].clientX : e.clientX;
  }

  function move(e) {
    if (!dragging) return;

    currentX = e.touches ? e.touches[0].clientX : e.clientX;
    const deltaX = currentX - startX;

    toast.style.transform =
      `translateX(${deltaX}px) scale(1)`;

    toast.style.opacity =
      Math.max(.25, 1 - Math.abs(deltaX) / 220);
  }

  function end() {
    if (!dragging) return;

    dragging = false;
    toast.classList.remove('dragging');

    const deltaX = currentX - startX;

    if (Math.abs(deltaX) > 110) {
      toast.style.transform =
        `translateX(${deltaX > 0 ? 420 : -420}px)`;
      toast.style.opacity = 0;
      setTimeout(removeToast, 120);
    } else {
      toast.style.transform = '';
      toast.style.opacity = '';
      timer = setTimeout(removeToast, 2500);
    }
  }

  // touch
  toast.addEventListener('touchstart', start, {passive:true});
  toast.addEventListener('touchmove', move, {passive:true});
  toast.addEventListener('touchend', end);

  // mouse desktop swipe
  toast.addEventListener('mousedown', start);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
}

/* ─── Settings API ────────────────────────────────────────────────────────── */

/** GET /acr/api/system — full settings object */
async function getAllSettings() {
  const res = await _request('GET', SETTINGS_BASE);
  return res.data ?? res.settings ?? {};
}

/** GET /acr/api/system/:section */
async function getSection(section) {
  const res = await _request('GET', `${SETTINGS_BASE}/${section}`);
  return res.data ?? {};
}

/** PATCH /acr/api/system/:section */
async function updateSection(section, data) {
  return _request('PATCH', `${SETTINGS_BASE}/${section}`, data);
}

/** PATCH /acr/api/system  (bulk, multiple sections) */
async function updateBulk(payload) {
  return _request('PATCH', SETTINGS_BASE, payload);
}

/** POST /acr/api/system/reset */
async function resetSettings() {
  return _request('POST', `${SETTINGS_BASE}/reset`);
}

/** POST /acr/api/system/maintenance */
async function setMaintenanceMode(enabled) {
  return _request('POST', `${SETTINGS_BASE}/maintenance`, { enabled });
}

/** POST /acr/api/system/ai/test */
async function testAIProvider(provider) {
  return _request('POST', `${SETTINGS_BASE}/ai/test`, { provider });
}

/** GET /acr/api/system/ai/models?provider=X */
async function getAIModels(provider) {
  return _request('GET', `${SETTINGS_BASE}/ai/models?provider=${encodeURIComponent(provider)}`);
}

/* ─── Backup API ──────────────────────────────────────────────────────────── */

/** GET /acr/api/system/backups */
async function getBackupHistory() {
  return _request('GET', BACKUPS_BASE);
}

/** GET /acr/api/system/backups/export  (triggers download) */
function downloadBackup(includeMedia = false) {
  const q = includeMedia ? '?media=true' : '';
  window.location.href = `${BACKUPS_BASE}/export${q}`;
}

/** GET /acr/api/system/backups/download/:filename  (re-download saved file) */
function downloadSavedBackup(filename) {
  window.location.href = `${BACKUPS_BASE}/download/${encodeURIComponent(filename)}`;
}

/** POST /acr/api/system/backups/import  (body = parsed backup JSON) */
async function importBackup(payload) {
  return _request('POST', `${BACKUPS_BASE}/import`, payload);
}

/** DELETE /acr/api/system/backups/:filename */
async function deleteBackup(filename) {
  return _request('DELETE', `${BACKUPS_BASE}/${encodeURIComponent(filename)}`);
}

/** GET /acr/api/system/backups/policy */
async function getBackupPolicy() {
  const res = await _request('GET', `${BACKUPS_BASE}/policy`);
  return res.data ?? {};
}

/** PATCH /acr/api/system/backups/policy */
async function updateBackupPolicy(data) {
  return _request('PATCH', `${BACKUPS_BASE}/policy`, data);
}

/** POST /acr/api/system/backups/run */
async function runManualBackup(targets = ['local']) {
  return _request('POST', `${BACKUPS_BASE}/run`, { targets });
}

/* ─── Cloud Connections API ───────────────────────────────────────────────── */

/** GET /acr/api/system/backups/connections */
async function getConnections() {
  const res = await _request('GET', `${BACKUPS_BASE}/connections`);
  return res.data ?? [];
}

/** POST /acr/api/system/backups/connections */
async function createConnection(data) {
  return _request('POST', `${BACKUPS_BASE}/connections`, data);
}

/** PATCH /acr/api/system/backups/connections/:id */
async function updateConnection(id, data) {
  return _request('PATCH', `${BACKUPS_BASE}/connections/${encodeURIComponent(id)}`, data);
}

/** DELETE /acr/api/system/backups/connections/:id */
async function deleteConnection(id) {
  return _request('DELETE', `${BACKUPS_BASE}/connections/${encodeURIComponent(id)}`);
}

/** POST /acr/api/system/backups/connections/test — body: { id } OR full unsaved connection */
async function testConnection(data) {
  return _request('POST', `${BACKUPS_BASE}/connections/test`, data);
}

/* ─── Backup Jobs API ──────────────────────────────────────────────────────── */

/** GET /acr/api/system/backups/jobs */
async function getJobs() {
  const res = await _request('GET', `${BACKUPS_BASE}/jobs`);
  return res.data ?? [];
}

/** POST /acr/api/system/backups/jobs */
async function createJob(data) {
  return _request('POST', `${BACKUPS_BASE}/jobs`, data);
}

/** PATCH /acr/api/system/backups/jobs/:id */
async function updateJob(id, data) {
  return _request('PATCH', `${BACKUPS_BASE}/jobs/${encodeURIComponent(id)}`, data);
}

/** DELETE /acr/api/system/backups/jobs/:id */
async function deleteJob(id) {
  return _request('DELETE', `${BACKUPS_BASE}/jobs/${encodeURIComponent(id)}`);
}

/* ─── Form helpers ────────────────────────────────────────────────────────── */

/**
 * Collect all field values from a container element or selector string.
 * Returns flat object { fieldId: value }  (checkboxes → boolean)
 * Includes dropdown hidden inputs by name (preferred) or id.
 */
function serializeForm(containerOrSelector) {
  const el = typeof containerOrSelector === 'string'
    ? document.querySelector(containerOrSelector)
    : containerOrSelector;
  if (!el) return {};
  const out = {};

  // Text / number / email / password / color / hidden inputs
  // Prefer name attribute (used for form submission) over id
  const inputs = el.querySelectorAll('input:not([type=file]):not([type=checkbox])');
  inputs.forEach(i => {
    // Prefer name (form submission standard), fall back to id
    const key = i.name || i.id;
    if (key) out[key] = i.value;
  });

  // Checkboxes (toggles) - use id since they typically don't have name
  el.querySelectorAll('input[type=checkbox]').forEach(i => {
    if (i.id) out[i.id] = i.checked;
  });

  // Textareas - prefer name, fall back to id
  el.querySelectorAll('textarea').forEach(t => {
    const key = t.name || t.id;
    if (key) out[key] = t.value;
  });

  return out;
}

/**
 * Get all dropdown values from a container (for forms using name attributes on hidden inputs)
 */
function serializeDropdowns(containerOrSelector) {
  const el = typeof containerOrSelector === 'string'
    ? document.querySelector(containerOrSelector)
    : containerOrSelector;
  if (!el) return {};

  const out = {};
  el.querySelectorAll('input[type=hidden].dropdown-hidden-input, input[type=hidden][data-schema-key]').forEach(input => {
    const key = input.name || input.id || input.getAttribute('data-schema-key');
    if (key) out[key] = input.value;
  });
  return out;
}

/**
 * Sync custom dropdowns with saved data - properly updates label while preserving icons
 */
function syncDropdowns(containerOrSelector, data) {
  if (!data || typeof data !== 'object') return;

  const container = typeof containerOrSelector === 'string'
    ? document.querySelector(containerOrSelector)
    : containerOrSelector;

  if (!container) return;

  container.querySelectorAll('.dropdown-field-wrap[data-dropdown-id]').forEach(wrapper => {
    const fieldKey = wrapper.dataset.dropdownId;
    if (!fieldKey || data[fieldKey] === undefined) return;

    const savedValue = data[fieldKey];
    if (savedValue === null || savedValue === '') return;

    const hiddenInput = wrapper.querySelector('.dropdown-hidden-input');
    const toggle = wrapper.querySelector('.dropdown-toggle');

    if (!hiddenInput || !toggle) return;

    // Update hidden input
    hiddenInput.value = savedValue;

    // Find matching dropdown item
    const matchingItem = wrapper.querySelector(`.dropdown-item[data-value="${CSS.escape(String(savedValue))}"]`);

    if (!matchingItem) return; // Value not in options → keep default label

    const newLabel = matchingItem.textContent.trim();

    // Preserve icon (Font Awesome duotone or any <i> / .icon)
    const icon = toggle.querySelector('i, .icon');

    // Remove only text nodes (critical: do NOT use innerHTML)
    Array.from(toggle.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.remove();
      }
    });

    // Insert new label text before the icon
    const textNode = document.createTextNode(newLabel + ' ');
    if (icon) {
      toggle.insertBefore(textNode, icon);
    } else {
      toggle.prepend(textNode);
    }
  });

  // Also handle plain (non-custom) <select>-like Dropdown() components that use
  // a hidden input directly by id, without the wrapper (e.g. jobConnectionId).
  Object.entries(data).forEach(([key, val]) => {
    if (val === null || val === '') return;
    const hidden = container.querySelector(`input.dropdown-hidden-input#${CSS.escape(key)}`);
    if (hidden && !hidden.closest('[data-dropdown-id]')) {
      hidden.value = val;
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

/**
 * Populate a container with flat key→value data.
 * Handles inputs, textareas, checkboxes, and CustomDropdowns.
 */
function populateForm(containerOrSelector, data) {
  const el = typeof containerOrSelector === 'string'
    ? document.querySelector(containerOrSelector)
    : containerOrSelector;

  if (!el || !data) return;

  Object.entries(data).forEach(([key, val]) => {
    // Text / number / email / password / hidden / color inputs
    const input = el.querySelector(`input#${CSS.escape(key)}`);
    if (input && input.type !== 'checkbox' && input.type !== 'file') {
      input.value = val ?? '';
      // Sync color hex twin if exists
      const hexTwin = el.querySelector(`input#${CSS.escape(key)}-hex`);
      if (hexTwin) hexTwin.value = val ?? '';
      return;
    }

    // Checkbox / toggle
    if (input && input.type === 'checkbox') {
      input.checked = Boolean(val);
      return;
    }

    // Textarea
    const ta = el.querySelector(`textarea#${CSS.escape(key)}`);
    if (ta) {
      ta.value = val ?? '';
      return;
    }

    // CustomDropdown - only update hidden input here
    const ddWrap = el.querySelector(`[data-dropdown-id="${CSS.escape(key)}"]`);
    if (ddWrap) {
      const hidden = ddWrap.querySelector('.dropdown-hidden-input');
      if (hidden) hidden.value = val ?? '';
    }
  });

  // After basic population, properly sync dropdown visual labels (preserves icons)
  syncDropdowns(el, data);
}

/**
 * Clear all fields in a container back to empty/default. Useful when re-using
 * one form markup for both "add" and "edit" of list items (connections, jobs).
 */
function clearForm(containerOrSelector) {
  const el = typeof containerOrSelector === 'string'
    ? document.querySelector(containerOrSelector)
    : containerOrSelector;
  if (!el) return;

  el.querySelectorAll('input:not([type=checkbox])').forEach(i => { i.value = ''; });
  el.querySelectorAll('input[type=checkbox]').forEach(i => { i.checked = false; });
  el.querySelectorAll('textarea').forEach(t => { t.value = ''; });
}

/* ─── Save button state helpers ───────────────────────────────────────────── */
function setSaving(btn, saving, savingLabel = 'Saving…', savedLabel = 'Saved Changes') {
  if (!btn) return;
  btn.disabled = saving;
  const span = btn.querySelector('span');
  if (span) span.textContent = saving ? savingLabel : savedLabel;
}

/**
 * Rebuild the option list of a CustomDropdown after it's already been rendered
 * — used when connections change and the job form's "Connection" dropdown needs new choices.
 */
function setDropdownOptions(wrapEl, options, selectedValue = '') {
  if (!wrapEl) return;
  const menu = wrapEl.querySelector('.dropdown-menu');
  const hidden = wrapEl.querySelector('.dropdown-hidden-input');
  const toggle = wrapEl.querySelector('.dropdown-toggle');
  if (!menu || !hidden || !toggle) return;

  menu.innerHTML = '';
  options.forEach(opt => {
    const item = document.createElement('button');
    item.className = 'dropdown-item';
    item.dataset.value = opt.value;
    item.textContent = opt.label;
    menu.appendChild(item);
  });

  const match = options.find(o => o.value === selectedValue) || options[0];
  hidden.value = match ? match.value : '';

  const iconNode = toggle.querySelector('i, .icon');
  [...toggle.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).forEach(n => n.remove());
  const textNode = document.createTextNode((match ? match.label : 'Select…') + ' ');
  if (iconNode) toggle.insertBefore(textNode, iconNode); else toggle.prepend(textNode);
}

/* ─── Logs API (for logs page) ────────────────────────────────────────────── */
async function fetchLogs() {
  return _request('GET', `${BASE_API}/system/logs`);
}
async function clearLogs() {
  return _request('DELETE', `${BASE_API}/system/logs`);
}

/* ─── Cache API (for maintenance page) ────────────────────────────────────── */
async function flushCache() {
  return _request('POST', `${BASE_API}/system/cache/flush`);
}

/* ─── Auto-save interval (from content settings) ────────────────────────── */
let _autoSaveInterval = null;
async function getAutoSaveInterval() {
  if (_autoSaveInterval !== null) return _autoSaveInterval;
  try {
    const content = await getSection('content');
    _autoSaveInterval = (parseInt(content?.autoSaveInterval) || 30) * 1000;
  } catch (_) {
    _autoSaveInterval = 30000;
  }
  return _autoSaveInterval;
}

/* ─── Auth API ────────────────────────────────────────────────────────────── */
async function forceSignOutAll() {
  return _request('POST', `${BASE_API}/auth/force-signout-all`);
}

/* ─── Export global System object ────────────────────────────────────────── */
window.System = {
  // Settings
  getAllSettings,
  getSection,
  updateSection,
  updateBulk,
  resetSettings,
  setMaintenanceMode,
  testAIProvider,
  getAIModels,
  // Backups
  getBackupHistory,
  downloadBackup,
  downloadSavedBackup,
  importBackup,
  deleteBackup,
  getBackupPolicy,
  updateBackupPolicy,
  runManualBackup,
  // Cloud connections
  getConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  // Backup jobs
  getJobs,
  createJob,
  updateJob,
  deleteJob,
  // Form
  serializeForm,
  serializeDropdowns,
  populateForm,
  clearForm,
  syncDropdowns,        // ← Exposed for manual calls if needed
  setDropdownOptions,
  setSaving,
  // UI
  showToast,
  // Misc
  fetchLogs,
  clearLogs,
  flushCache,
  forceSignOutAll,
  getAutoSaveInterval,
  // Constants
  BACKUPS_BASE,
  SETTINGS_BASE,
  BASE_API,
};