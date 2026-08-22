/**
 * appearance.js  —  /acrx/system/appearance
 * Handles: theme, accent colour, font, layout, border radius, effects, animation
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('appearance-form');
  const saveBtn = document.getElementById('appearance-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const d = await System.getSection('appearance');
    System.populateForm(form, {
      defaultTheme:  d.defaultTheme  ?? 'light',
      primaryColor:  d.primaryColor  ?? '#007bff',
      fontFamily:    d.fontFamily    ?? 'Inter, sans-serif',
      layoutStyle:   d.layoutStyle   ?? 'grid',
      borderRadius:  d.borderRadius  ?? 'medium',
      enableGlass:   d.enableGlass   ?? false,
      enableShadows: d.enableShadows ?? true,
      animation:     d.animation     ?? 'fade',
    });
  } catch (err) {
    System.showToast('Could not load appearance settings.', 'error');
    console.error('[Appearance] load:', err);
  }

  // ── Live colour preview ───────────────────────────────────────────────────
  const colorInput = form.querySelector('#primaryColor');
  const hexInput   = form.querySelector('#primaryColor-hex');
  const preview    = _buildColorPreview();

  colorInput?.addEventListener('input', () => {
    if (hexInput) hexInput.value = colorInput.value;
    if (preview)  preview.style.background = colorInput.value;
    document.documentElement.style.setProperty('--preview-accent', colorInput.value);
  });

  hexInput?.addEventListener('input', () => {
    const val = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      if (colorInput) colorInput.value = val;
      if (preview)    preview.style.background = val;
      document.documentElement.style.setProperty('--preview-accent', val);
    }
  });

  // ── Font family live preview ──────────────────────────────────────────────
  form.querySelector('#fontFamily')?.addEventListener('input', e => {
    document.documentElement.style.setProperty('--preview-font', e.target.value);
  });

  // ── Theme preview badge ───────────────────────────────────────────────────
  const themeHidden = form.querySelector('#defaultTheme');
  themeHidden?.addEventListener('change', () => {
    const badge = form.querySelector('.theme-preview-badge');
    if (badge) badge.textContent = themeHidden.value;
  });

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      await System.updateSection('appearance', {
        defaultTheme:  flat.defaultTheme,
        primaryColor:  flat.primaryColor,
        fontFamily:    flat.fontFamily,
        layoutStyle:   flat.layoutStyle,
        borderRadius:  flat.borderRadius,
        enableGlass:   flat.enableGlass,
        enableShadows: flat.enableShadows,
        animation:     flat.animation,
      });
      System.showToast('Appearance settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _buildColorPreview() {
    const colorField = form.querySelector('#primaryColor')?.closest('.color-field');
    if (!colorField) return null;
    const swatch = document.createElement('div');
    swatch.className = 'color-preview-swatch';
    swatch.style.cssText = `
      width: 32px; height: 32px; border-radius: 6px;
      background: ${colorInput?.value ?? '#007bff'};
      border: 1px solid var(--border-color, #e0e0e0);
      display: inline-block; vertical-align: middle; margin-left: 8px;
    `;
    colorField.querySelector('.color-input-wrap')?.appendChild(swatch);
    return swatch;
  }
});
