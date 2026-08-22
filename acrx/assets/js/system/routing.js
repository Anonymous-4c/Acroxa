/**
 * routing.js — /acrx/system/routing
 * Handles:
 * - Homepage settings
 * - Blog archive page
 * - URL routing + permalink structure
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {

  const form = document.getElementById('routing-form');
  const saveBtn = document.getElementById('routing-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────
  try {

    const d = await System.getSection('routing');

    System.populateForm(form, {

      // Homepage
      homepageMode: homepageValue(d.homepage?.mode, 'posts'),
      homepagePageId: d.homepage?.pageId ?? '',
      homepageTemplate: d.homepage?.template ?? 'homepage',

      // Blog
      blogPageEnabled: d.blogPage?.enabled ?? false,
      blogPageId: d.blogPage?.pageId ?? '',
      blogPageTemplate: d.blogPage?.template ?? 'blog',
      blogPostsPerPage: d.blogPage?.postsPerPage ?? 10,

      // Routing
      postPrefix: d.routing?.postPrefix ?? 'post',
      categoryPrefix: d.routing?.categoryPrefix ?? 'category',
      pagePrefix: d.routing?.pagePrefix ?? '',
      enablePrettyURLs: d.routing?.enablePrettyURLs ?? true,
      permalinkStructure: d.routing?.permalinkStructure ?? '/:postPrefix/:slug',
      landingPagePrefix: d.routing?.landingPagePrefix ?? 'landing',

    });

  } catch (err) {

    System.showToast('Could not load routing settings.', 'error');
    console.error('[Routing] load:', err);

  }

  // ── Save ─────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {

    System.setSaving(saveBtn, true);

    try {

      const flat = System.serializeForm(form);

      await System.updateBulk({
        homepage: {
          mode: flat.homepageMode,
          pageId: flat.homepagePageId || null,
          template: flat.homepageTemplate || 'homepage',
        },

        blogPage: {
          enabled: flat.blogPageEnabled,
          pageId: flat.blogPageId || null,
          template: flat.blogPageTemplate || 'blog',
          postsPerPage: Number(flat.blogPostsPerPage || 10),
        },

        routing: {
          postPrefix: flat.postPrefix || 'post',
          categoryPrefix: flat.categoryPrefix || 'category',
          pagePrefix: flat.pagePrefix || '',
          enablePrettyURLs: flat.enablePrettyURLs,
          permalinkStructure: flat.permalinkStructure || '/:postPrefix/:slug',
          landingPagePrefix: flat.landingPagePrefix || 'landing',
        }

      });

      System.showToast('Routing settings saved.');

    } catch (err) {

      System.showToast(err.message, 'error');
      console.error('[Routing] save:', err);

    } finally {

      System.setSaving(saveBtn, false);

    }

  });

});

/* ────────────────────────────────────────────────────────────── */

function homepageValue(v, fallback) {
  return v == null || v === ''
    ? fallback
    : v;
}