/**
 * content.js  —  /acrx/system/content
 * Handles: post defaults, media storage, image optimisation, versioning, autosave
 *
 * STATUS: No changes needed.
 * mediaNaming is already loaded (d.mediaNaming ?? 'uuid') and saved
 * (flat.mediaNaming) correctly. The ContentSettingsPage view renderer
 * in views.js is what needed updating to show the dropdown — see views.js diff.
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('content-form');
  const saveBtn = document.getElementById('content-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const d = await System.getSection('content');
    System.populateForm(form, {
      defaultPostStatus: d.defaultPostStatus            ?? 'draft',
      postsPerPage:      d.postsPerPage                 ?? 10,
      allowComments:     d.allowComments                ?? true,
      storageDriver:     d.storageDriver                ?? 'local',
      uploadStrategy:    d.uploadStrategy               ?? 'auto',
      mediaNaming:       d.mediaNaming                  ?? 'uuid',
      autoOrganizeMedia: d.autoOrganizeMedia            ?? true,
      imageOptEnabled:   d.imageOptimization?.enabled   ?? true,
      imageOptQuality:   d.imageOptimization?.quality   ?? 80,
      imageOptWebp:      (d.imageOptimization?.formats ?? []).includes('webp'),
      versioningEnabled: d.versioning?.enabled          ?? true,
      maxRevisions:      d.versioning?.maxRevisions      ?? 10,
      autosaveEnabled:   d.autosave?.enabled            ?? true,
      autosaveInterval:  d.autosave?.interval           ?? 30,
    });
  } catch (err) {
    System.showToast('Could not load content settings.', 'error');
    console.error('[Content] load:', err);
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      await System.updateSection('content', {
        defaultPostStatus: flat.defaultPostStatus,
        postsPerPage:      Number(flat.postsPerPage),
        allowComments:     flat.allowComments,
        storageDriver:     flat.storageDriver,
        uploadStrategy:    flat.uploadStrategy,
        mediaNaming:       flat.mediaNaming,
        autoOrganizeMedia: flat.autoOrganizeMedia,
        imageOptimization: {
          enabled: flat.imageOptEnabled,
          quality: Number(flat.imageOptQuality),
          formats: flat.imageOptWebp ? ['webp'] : [],
        },
        versioning: {
          enabled:      flat.versioningEnabled,
          maxRevisions: Number(flat.maxRevisions),
        },
        autosave: {
          enabled:  flat.autosaveEnabled,
          interval: Number(flat.autosaveInterval),
        },
      });
      System.showToast('Content settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });
});