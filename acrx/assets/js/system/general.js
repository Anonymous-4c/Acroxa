/**
 * general.js  —  /acrx/system/general
 * Handles: site identity, URLs, branding (logo / favicon upload)
 *
 * CHANGES:
 *  - Logo / favicon now upload to /acr/api/media/upload first,
 *    get the URL from the response, then save that URL to general settings.
 *  - Previews restored from saved URLs on load (unchanged).
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('general-settings-form');
  const saveBtn = document.getElementById('general-save-btn');

  if (!form) return;

  // Tracks the resolved URLs after upload (or existing saved ones)
  const _urls = {
    siteLogo:    null,
    siteFavicon: null,
  };

  // ── Load saved settings ──────────────────────────────────────────────────
  try {
    const data = await System.getSection('general');
    System.populateForm(form, {
      siteName:        data.siteName        ?? '',
      siteTagline:     data.siteTagline     ?? '',
      siteDescription: data.siteDescription ?? '',
      siteURL:         data.siteURL         ?? '',
      adminEmail:      data.adminEmail      ?? '',
    });

    // Restore existing logo / favicon previews and store URLs
    if (data.siteLogo) {
      _urls.siteLogo = data.siteLogo;
      _setPreview('logo-upload-btn', data.siteLogo);
    }
    if (data.siteFavicon) {
      _urls.siteFavicon = data.siteFavicon;
      _setPreview('favicon-upload-btn', data.siteFavicon);
    }
  } catch (err) {
    System.showToast('Could not load general settings.', 'error');
    console.error('[General] load:', err);
  }

  // ── File upload proxy buttons ─────────────────────────────────────────────
  document.getElementById('logo-upload-btn')?.addEventListener('click', () =>
    document.getElementById('siteLogo')?.click()
  );
  document.getElementById('favicon-upload-btn')?.addEventListener('click', () =>
    document.getElementById('siteFavicon')?.click()
  );

  // ── Preview on file select + upload immediately ───────────────────────────
  // Map input id → settings key
  const _inputMap = {
    siteLogo:    'siteLogo',
    siteFavicon: 'siteFavicon',
  };

  Object.keys(_inputMap).forEach(inputId => {
    document.getElementById(inputId)?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Show local blob preview immediately so the user sees feedback
      const wrap = e.target.closest('.file-upload-wrap');
      let preview = wrap?.querySelector('.preview-thumb');
      if (!preview) {
        preview = document.createElement('img');
        preview.className = 'preview-thumb upload-preview';
        wrap?.appendChild(preview);
      }
      preview.src = URL.createObjectURL(file);

      // Upload to media controller
      try {
        const formData = new FormData();
        formData.append('media', file);

        const res  = await fetch('/acr/api/media/upload', {
          method: 'POST',
          body:   formData,
          // Auth header injected by System helper if available
          headers: System.authHeaders?.() ?? {},
        });

        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

        const data = await res.json();

        // handleUpload (normal mode) returns { success, files: [{ url, ... }] }
        const uploadedUrl = data.files?.[0]?.url ?? data.file?.url;
        if (!uploadedUrl) throw new Error('No URL in upload response');

        _urls[_inputMap[inputId]] = uploadedUrl;

        // Update preview to the real served URL
        preview.src = uploadedUrl;

        System.showToast(`${inputId === 'siteLogo' ? 'Logo' : 'Favicon'} uploaded.`, 'success');
      } catch (err) {
        System.showToast(`Upload error: ${err.message}`, 'error');
        console.error('[General] upload:', err);
        // Clear the pending URL so we don't save a stale value
        _urls[_inputMap[inputId]] = null;
      }
    });
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);

      const payload = {
        siteName:        flat.siteName,
        siteTagline:     flat.siteTagline,
        siteDescription: flat.siteDescription,
        siteURL:         flat.siteURL,
        adminEmail:      flat.adminEmail,
      };

      // Only include logo/favicon URLs if they are set (uploaded or previously saved)
      if (_urls.siteLogo    !== null) payload.siteLogo    = _urls.siteLogo;
      if (_urls.siteFavicon !== null) payload.siteFavicon = _urls.siteFavicon;

      await System.updateSection('general', payload);
      System.showToast('General settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _setPreview(btnId, src) {
    const btn  = document.getElementById(btnId);
    const wrap = btn?.closest('.file-upload-wrap');
    if (!wrap) return;
    let img = wrap.querySelector('.preview-thumb');
    if (!img) {
      img = document.createElement('img');
      img.className = 'preview-thumb upload-preview';
      wrap.appendChild(img);
    }
    img.src = src;
  }
});