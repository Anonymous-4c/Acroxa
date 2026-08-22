/**
 * ai.js  —  /acrx/system/ai
 * Handles: AI engine toggle, provider config (OpenAI/Gemini/Custom),
 *          feature toggles, connection tests
 *
 * CHANGES:
 *  - Added `customizerEnabled` toggle: loads from ai.features.customizerEnabled,
 *    saves back into features alongside the other feature flags.
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('ai-form');
  const saveBtn = document.getElementById('ai-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const d = await System.getSection('ai');
    System.populateForm(form, {
      aiEnabled:        d.enabled         ?? true,
      defaultProvider:  d.defaultProvider ?? 'openai',
      // OpenAI
      openaiEnabled: d.providers?.openai?.enabled ?? true,
      openaiKey:     '',                                          // never pre-fill key fields
      openaiModel:   d.providers?.openai?.model   ?? 'gpt-4o-mini',
      // Gemini
      geminiEnabled: d.providers?.gemini?.enabled ?? false,
      geminiKey:     '',
      geminiModel:   d.providers?.gemini?.model   ?? 'gemini-1.5-flash',
      // Custom
      customEndpoint: d.providers?.custom?.endpoint ?? '',
      customKey:      '',
      // Features
      contentSuggestions:        d.features?.contentSuggestions        ?? true,
      seoSuggestions:            d.features?.seoSuggestions            ?? true,
      autoTitleGeneration:       d.features?.autoTitleGeneration       ?? true,
      autoDescriptionGeneration: d.features?.autoDescriptionGeneration ?? true,
      chatAssistant:             d.features?.chatAssistant             ?? true,
      // ── NEW ──
      customizerEnabled:         d.features?.customizerEnabled         ?? true,
    });
  } catch (err) {
    System.showToast('Could not load AI settings.', 'error');
    console.error('[AI] load:', err);
  }

  // ── Master toggle disables provider sections ──────────────────────────────
  const aiEnabledCb      = form.querySelector('#aiEnabled');
  const providerSections = form.querySelectorAll('.settings-section:not(:first-child)');

  function syncEnabledState() {
    const on = aiEnabledCb?.checked ?? true;
    providerSections.forEach(s => s.classList.toggle('section-disabled', !on));
  }

  aiEnabledCb?.addEventListener('change', syncEnabledState);
  syncEnabledState();

  // ── Connection test ───────────────────────────────────────────────────────
  async function testProvider(provider) {
    const btn = document.getElementById(`test-${provider}`);
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.disabled  = true;
    btn.innerHTML = '<span class="icon icon-duotone"><i class="fa-duotone fa-spinner fa-spin"></i></span> <span>Testing…</span>';

    try {
      // Save keys/endpoints first so the server has them
      const flat = System.serializeForm(form);
      if (provider === 'openai' && flat.openaiKey) {
        await System.updateSection('ai', { providers: { openai: { apiKey: flat.openaiKey } } });
      } else if (provider === 'gemini' && flat.geminiKey) {
        await System.updateSection('ai', { providers: { gemini: { apiKey: flat.geminiKey } } });
      } else if (provider === 'custom') {
        const payload = { providers: { custom: { endpoint: flat.customEndpoint } } };
        if (flat.customKey) payload.providers.custom.apiKey = flat.customKey;
        await System.updateSection('ai', payload);
      }
      const res = await System.testAIProvider(provider);
      System.showToast(`${provider}: connected (${res.latencyMs}ms)`, 'success');
    } catch (err) {
      System.showToast(`${provider}: ${err.message}`, 'error');
    } finally {
      btn.disabled  = false;
      btn.innerHTML = originalHTML;
    }
  }

  document.getElementById('test-openai')?.addEventListener('click', () => testProvider('openai'));
  document.getElementById('test-gemini')?.addEventListener('click', () => testProvider('gemini'));
  document.getElementById('test-custom')?.addEventListener('click', () => testProvider('custom'));

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat    = System.serializeForm(form);
      const payload = {
        enabled:         flat.aiEnabled,
        defaultProvider: flat.defaultProvider,
        providers: {
          openai: {
            enabled: flat.openaiEnabled,
            model:   flat.openaiModel,
            ...(flat.openaiKey ? { apiKey: flat.openaiKey } : {}),
          },
          gemini: {
            enabled: flat.geminiEnabled,
            model:   flat.geminiModel,
            ...(flat.geminiKey ? { apiKey: flat.geminiKey } : {}),
          },
          custom: {
            endpoint: flat.customEndpoint,
            ...(flat.customKey ? { apiKey: flat.customKey } : {}),
          },
        },
        features: {
          contentSuggestions:        flat.contentSuggestions,
          seoSuggestions:            flat.seoSuggestions,
          autoTitleGeneration:       flat.autoTitleGeneration,
          autoDescriptionGeneration: flat.autoDescriptionGeneration,
          chatAssistant:             flat.chatAssistant,
          // ── NEW ──
          customizerEnabled:         flat.customizerEnabled,
        },
      };
      await System.updateSection('ai', payload);
      System.showToast('AI settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });
});