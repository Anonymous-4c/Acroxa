/**
 * maintenance.js  —  /acrx/system/maintenance
 * Handles: maintenance mode toggle, cache flush, registration, autosave, pagination
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('maintenance-form');
  const saveBtn = document.getElementById('maintenance-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  let currentMaintenanceState = false;

  try {
    const [sys, adv] = await Promise.all([
      System.getSection('system'),
      System.getSection('advanced'),
    ]);

    currentMaintenanceState = sys.maintenanceMode ?? false;

    System.populateForm(form, {
      maintenanceMode:           sys.maintenanceMode           ?? false,
      registrationEnabled:       sys.registrationEnabled       ?? true,
      contentModerationRequired: sys.contentModerationRequired ?? false,
      defaultUserRole:           sys.defaultUserRole           ?? 'user',
      autoSaveInterval:          sys.autoSaveInterval          ?? 30,
      paginationLimit:           sys.paginationLimit           ?? 10,
      cacheEnabled:              adv.cacheEnabled              ?? true,
      cacheTTL:                  adv.cacheTTL                  ?? 3600,
    });

    _syncMaintenanceUI(currentMaintenanceState);
  } catch (err) {
    System.showToast('Could not load maintenance settings.', 'error');
    console.error('[Maintenance] load:', err);
  }

  // ── Maintenance toggle button (instant API call) ──────────────────────────
  document.getElementById('toggle-maintenance-btn')?.addEventListener('click', async () => {
    const newState = !currentMaintenanceState;
    const btn = document.getElementById('toggle-maintenance-btn');
    btn.disabled = true;
    try {
      await System.setMaintenanceMode(newState);
      currentMaintenanceState = newState;
      // Sync checkbox
      const cb = form.querySelector('#maintenanceMode');
      if (cb) cb.checked = newState;
      _syncMaintenanceUI(newState);
      System.showToast(`Maintenance mode ${newState ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Also sync button when checkbox is toggled manually (UI only, saved on Save)
  form.querySelector('#maintenanceMode')?.addEventListener('change', e => {
    _syncMaintenanceUI(e.target.checked);
  });

  // ── Flush cache ───────────────────────────────────────────────────────────
  document.getElementById('flush-cache-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('flush-cache-btn');
    btn.disabled = true;
    try {
      await System.flushCache();
      System.showToast('Cache flushed successfully.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ── Cache enabled toggle dims TTL field ───────────────────────────────────
  form.querySelector('#cacheEnabled')?.addEventListener('change', e => {
    const ttlField = form.querySelector('#cacheTTL')?.closest('.field');
    ttlField?.classList.toggle('field-disabled', !e.target.checked);
  });

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      await System.updateBulk({
        system: {
          maintenanceMode:           flat.maintenanceMode,
          registrationEnabled:       flat.registrationEnabled,
          contentModerationRequired: flat.contentModerationRequired,
          defaultUserRole:           flat.defaultUserRole,
          autoSaveInterval:          Number(flat.autoSaveInterval),
          paginationLimit:           Number(flat.paginationLimit),
        },
        advanced: {
          cacheEnabled: flat.cacheEnabled,
          cacheTTL:     Number(flat.cacheTTL),
        },
      });
      currentMaintenanceState = flat.maintenanceMode;
      System.showToast('Maintenance settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _syncMaintenanceUI(isOn) {
    const btn     = document.getElementById('toggle-maintenance-btn');
    const callout = form.querySelector('.callout');
    const spanEl  = btn?.querySelector('span');

    if (btn) {
      btn.className = btn.className.replace(/btn-(success|secondary)/g, '').trim();
      btn.classList.add(isOn ? 'btn-success' : 'btn-secondary');
    }
    if (spanEl) spanEl.textContent = isOn ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode';

    if (callout) {
      callout.className = `callout callout-${isOn ? 'warning' : 'info'} callout-box`;
      const msg = callout.querySelector('.callout-message');
      const ttl = callout.querySelector('.callout-title');
      if (isOn) {
        if (ttl) ttl.textContent  = 'Maintenance mode is ON';
        if (msg) msg.textContent  = 'Public-facing pages are hidden. Only admins can access the CMS.';
      } else {
        if (ttl) ttl.textContent  = '';
        if (msg) msg.textContent  = 'The site is currently live and accessible to all visitors.';
      }
    }
  }
});
