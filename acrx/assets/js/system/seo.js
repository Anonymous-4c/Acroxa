/**
 * seo.js  —  /acrx/system/seo
 * Handles: meta defaults, technical SEO, Open Graph, Twitter Cards, schema
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('seo-form');
  const saveBtn = document.getElementById('seo-save-btn');

  if (!form) return;

  let _ogImageUrl = '';

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const d = await System.getSection('seo');
    _ogImageUrl = d.openGraph?.defaultImage ?? '';
    System.populateForm(form, {
      metaTitle:       d.metaTitle        ?? '',
      metaDescription: d.metaDescription  ?? '',
      metaKeywords:    d.metaKeywords     ?? '',
      enableSitemap:   d.enableSitemap    ?? true,
      enableRobotsTxt: d.enableRobotsTxt  ?? true,
      canonicalURL:    d.canonicalURL     ?? true,
      ogEnabled:       d.openGraph?.enabled   ?? true,
      twitterEnabled:  d.twitterCards?.enabled ?? true,
      twitterHandle:   d.twitterCards?.siteHandle ?? '',
      schemaEnabled:   d.schemaMarkup?.enabled ?? true,
      schemaType:      d.schemaMarkup?.type    ?? 'Organization',
    });
    // Show existing OG image preview if one is saved
    if (_ogImageUrl) {
      const wrap = document.getElementById('ogDefaultImage')?.closest('.file-upload-wrap');
      let preview = wrap?.querySelector('.preview-thumb');
      if (!preview) {
        preview = document.createElement('img');
        preview.className = 'preview-thumb upload-preview';
        wrap?.appendChild(preview);
      }
      preview.src = _ogImageUrl;
    }
  } catch (err) {
    System.showToast('Could not load SEO settings.', 'error');
    console.error('[SEO] load:', err);
  }

  // ── OG image upload proxy ─────────────────────────────────────────────────
  document.getElementById('og-image-btn')?.addEventListener('click', () =>
    document.getElementById('ogDefaultImage')?.click()
  );

  // Preview OG image and track the file for upload
  document.getElementById('ogDefaultImage')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const wrap = e.target.closest('.file-upload-wrap');
    let preview = wrap?.querySelector('.preview-thumb');
    if (!preview) {
      preview = document.createElement('img');
      preview.className = 'preview-thumb upload-preview';
      wrap?.appendChild(preview);
    }
    preview.src = URL.createObjectURL(file);
  });

  // ── Character counters ────────────────────────────────────────────────────
  _addCharCounter('metaTitle',       60,  'Meta title: aim for 30–60 characters');
  _addCharCounter('metaDescription', 160, 'Meta description: aim for 120–160 characters');

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      // Upload OG image if a new file was selected
      const ogFileInput = document.getElementById('ogDefaultImage');
      if (ogFileInput?.files?.[0]) {
        const formData = new FormData();
        formData.append('file', ogFileInput.files[0]);
        try {
          const uploadRes = await fetch(System.BASE_API + '/media/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });
          const uploadData = await uploadRes.json();
          if (uploadData.success && uploadData.files?.[0]?.url) {
            _ogImageUrl = uploadData.files[0].url;
          }
        } catch (uploadErr) {
          console.error('[SEO] OG image upload failed:', uploadErr);
          System.showToast('OG image upload failed.', 'warning');
        }
      }

      const flat = System.serializeForm(form);
      await System.updateSection('seo', {
        metaTitle:       flat.metaTitle,
        metaDescription: flat.metaDescription,
        metaKeywords:    flat.metaKeywords,
        enableSitemap:   flat.enableSitemap,
        enableRobotsTxt: flat.enableRobotsTxt,
        canonicalURL:    flat.canonicalURL,
        openGraph: {
          enabled:      flat.ogEnabled,
          defaultImage: _ogImageUrl,
        },
        twitterCards: {
          enabled:    flat.twitterEnabled,
          siteHandle: flat.twitterHandle,
        },
        schemaMarkup: {
          enabled: flat.schemaEnabled,
          type:    flat.schemaType,
        },
      });
      System.showToast('SEO settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _addCharCounter(id, max, hint) {
    const el = document.getElementById(id);
    if (!el) return;
    const counter = document.createElement('span');
    counter.className = 'char-counter field-hint text-muted';
    el.insertAdjacentElement('afterend', counter);
    const update = () => {
      const len = el.value.length;
      counter.textContent = `${len} / ${max}`;
      counter.classList.toggle('over-limit', len > max);
    };
    el.addEventListener('input', update);
    update();
  }
});
