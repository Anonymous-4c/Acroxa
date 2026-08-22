/**
 * advanced.js  —  /acrx/system/advanced
 * Handles: environment, CDN, log level, debug mode, custom CSS/JS, danger reset
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('advanced-form');
  const saveBtn = document.getElementById('advanced-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const [adv, app] = await Promise.all([
      System.getSection('advanced'),
      System.getSection('appearance'),
    ]);

    System.populateForm(form, {
      environment:  adv.environment  ?? 'production',
      cdnURL:       adv.cdnURL       ?? '',
      logLevel:     adv.logLevel     ?? 'info',
      debugMode:    adv.debugMode    ?? false,
      customCSS:    app.customCSS    ?? '',
      customJS:     app.customJS     ?? '',
    });

    // Warn if debug mode is enabled in production
    if (adv.debugMode && adv.environment === 'production') {
      _showDebugWarning();
    }
  } catch (err) {
    System.showToast('Could not load advanced settings.', 'error');
    console.error('[Advanced] load:', err);
  }

  // ── Debug mode + environment cross-validation ─────────────────────────────
  form.querySelector('#debugMode')?.addEventListener('change', e => {
    const env = form.querySelector('#environment')?.value;
    if (e.target.checked && env === 'production') {
      _showDebugWarning();
    } else {
      _clearDebugWarning();
    }
  });

  form.querySelector('#environment')?.addEventListener('change', e => {
    const debugOn = form.querySelector('#debugMode')?.checked;
    if (debugOn && e.target.value === 'production') {
      _showDebugWarning();
    } else {
      _clearDebugWarning();
    }
  });

  // ── CSS/JS line counters ──────────────────────────────────────────────────
  _addLineCounter('customCSS');
  _addLineCounter('customJS');

  // ── Danger zone — reset all settings ─────────────────────────────────────
  document.getElementById('reset-all-settings-btn')?.addEventListener('click', async () => {
    if (!confirm('Reset ALL settings to factory defaults?\n\nThis will erase every customisation and cannot be undone.')) return;
    if (!confirm('Final confirmation: are you absolutely sure?')) return;
    try {
      await System.resetSettings();
      System.showToast('Settings reset. Reloading…', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      System.showToast(err.message, 'error');
    }
  });

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      await System.updateBulk({
        advanced: {
          environment:  flat.environment,
          cdnURL:       flat.cdnURL,
          logLevel:     flat.logLevel,
          debugMode:    flat.debugMode,
        },
        appearance: {
          customCSS: flat.customCSS,
          customJS:  flat.customJS,
        },
      });
      System.showToast('Advanced settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  let _debugWarnEl = null;

  function _showDebugWarning() {
    if (_debugWarnEl) return;
    const section = form.querySelector('#debugMode')?.closest('.settings-section .section-body');
    if (!section) return;
    _debugWarnEl = document.createElement('div');
    _debugWarnEl.className = 'callout callout-warning callout-box mt-2';
    _debugWarnEl.innerHTML = `
      <span class="icon icon-duotone"><i class="fa-duotone fa-triangle-exclamation"></i></span>
      <div class="callout-content">
        <strong class="callout-title">Debug mode is ON in Production</strong>
        <p class="callout-message">Verbose logs expose internal details. Disable before going live.</p>
      </div>
    `;
    section.appendChild(_debugWarnEl);
  }

  function _clearDebugWarning() {
    _debugWarnEl?.remove();
    _debugWarnEl = null;
  }

  function _addLineCounter(id) {
    const ta = form.querySelector(`#${id}`);
    if (!ta) return;
    const counter = document.createElement('span');
    counter.className = 'line-counter field-hint text-muted';
    ta.insertAdjacentElement('afterend', counter);
    const update = () => {
      const lines = ta.value ? ta.value.split('\n').length : 0;
      counter.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
    };
    ta.addEventListener('input', update);
    update();
  }
});
