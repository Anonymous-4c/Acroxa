/**
 * api.js  —  /acrx/system/api
 * Handles: CMS REST API toggle, rate limit, webhooks, third-party keys
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('api-form');
  const saveBtn = document.getElementById('api-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const d    = await System.getSection('api');
    const keys = d.thirdPartyKeys ?? {};
    System.populateForm(form, {
      apiEnabled:   d.apiEnabled   ?? true,
      apiRateLimit: d.apiRateLimit ?? 100,
      webhookURLs:  (d.webhookURLs ?? []).join('\n'),
      // Keys — never pre-fill secrets, just show placeholder or masked indicator
      gaKey:        keys.googleAnalytics ?? '',
      // Stripe / OpenAI / Gemini: show empty — user must re-enter to change
      stripeKey:    '',
      openaiApiKey: '',
      geminiApiKey: '',
    });

    // Show masked indicator if key was previously saved
    if (keys.stripe)          _showSaved('stripeKey');
    if (keys.openai)          _showSaved('openaiApiKey');
    if (keys.gemini)          _showSaved('geminiApiKey');
  } catch (err) {
    System.showToast('Could not load API settings.', 'error');
    console.error('[API] load:', err);
  }

  // ── API enabled toggle dims settings ─────────────────────────────────────
  const apiEnabledCb = form.querySelector('#apiEnabled');
  const rateLimitField = form.querySelector('#apiRateLimit')?.closest('.field');
  apiEnabledCb?.addEventListener('change', () => {
    rateLimitField?.classList.toggle('field-disabled', !apiEnabledCb.checked);
  });

  // ── Webhook URL validation ────────────────────────────────────────────────
  form.querySelector('#webhookURLs')?.addEventListener('blur', e => {
    const lines = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
    const invalid = lines.filter(l => { try { new URL(l); return false; } catch { return true; } });
    const hint = e.target.closest('.field')?.querySelector('.field-hint');
    if (invalid.length && hint) {
      hint.textContent = `⚠ Invalid URL(s): ${invalid.join(', ')}`;
      hint.style.color = 'var(--color-error, #e74c3c)';
    } else if (hint) {
      hint.textContent = 'One URL per line';
      hint.style.color = '';
    }
  });

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      const webhookURLs = flat.webhookURLs
        ? flat.webhookURLs.split('\n').map(s => s.trim()).filter(Boolean)
        : [];

      const payload = {
        apiEnabled:   flat.apiEnabled,
        apiRateLimit: Number(flat.apiRateLimit),
        webhookURLs,
        thirdPartyKeys: {
          googleAnalytics: flat.gaKey,
          ...(flat.stripeKey    ? { stripe: flat.stripeKey }       : {}),
          ...(flat.openaiApiKey ? { openai: flat.openaiApiKey }     : {}),
          ...(flat.geminiApiKey ? { gemini: flat.geminiApiKey }     : {}),
        },
      };

      await System.updateSection('api', payload);
      System.showToast('API settings saved.');

      // Re-mask key fields after save
      ['stripeKey', 'openaiApiKey', 'geminiApiKey'].forEach(id => {
        const el = form.querySelector(`#${id}`);
        if (el?.value) { _showSaved(id); el.value = ''; }
      });
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _showSaved(inputId) {
    const el = form.querySelector(`#${inputId}`);
    if (!el) return;
    el.placeholder = '••••••••  (saved — type to replace)';
  }
});
