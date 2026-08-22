/**
 * analytics.js  —  /acrx/system/analytics
 * Handles: tracking toggle, GA4 measurement ID, cookie consent
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('analytics-form');
  const saveBtn = document.getElementById('analytics-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const d = await System.getSection('analytics');
    System.populateForm(form, {
      analyticsEnabled:      d.analyticsEnabled      ?? true,
      trackingID:            d.trackingID            ?? '',
      cookieConsentRequired: d.cookieConsentRequired ?? true,
    });
  } catch (err) {
    System.showToast('Could not load analytics settings.', 'error');
    console.error('[Analytics] load:', err);
  }

  // ── Validate GA4 format on blur ───────────────────────────────────────────
  form.querySelector('#trackingID')?.addEventListener('blur', e => {
    const val  = e.target.value.trim();
    const hint = e.target.closest('.field')?.querySelector('.field-hint');
    if (!hint) return;
    if (val && !/^G-[A-Z0-9]+$/.test(val)) {
      hint.textContent = '⚠ Should match format G-XXXXXXXXXX';
      hint.style.color = 'var(--color-error, #e74c3c)';
    } else {
      hint.textContent = 'Google Analytics 4: G-XXXXXXXXXX';
      hint.style.color = '';
    }
  });

  // ── Analytics enabled toggle dims the tracking ID ─────────────────────────
  const enabledCb = form.querySelector('#analyticsEnabled');
  const idField   = form.querySelector('#trackingID')?.closest('.field');
  enabledCb?.addEventListener('change', () => {
    idField?.classList.toggle('field-disabled', !enabledCb.checked);
  });

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      await System.updateSection('analytics', {
        analyticsEnabled:      flat.analyticsEnabled,
        trackingID:            flat.trackingID,
        cookieConsentRequired: flat.cookieConsentRequired,
      });
      System.showToast('Analytics settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });
});
