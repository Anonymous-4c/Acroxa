/**
 * acrxjs-runtime.js  —  /acrx/system/acrxjs
 * Handles: visitor cache (enabled/strategy/ttl/grace/size), diagnostics
 * (inspector, patch logging) + live runtime stats from GET /acr/api/system/runtime.
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('runtime-form');
  const saveBtn = document.getElementById('runtime-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const rt = await System.getSection('runtime');
    System.populateForm(form, {
      cacheEnabled:    rt.cacheEnabled    ?? true,
      cacheStrategy:   rt.cacheStrategy   ?? 'cache-first',
      cacheTTL:        rt.cacheTTL        ?? 60000,
      cacheSwrGraceMs: rt.cacheSwrGraceMs ?? 30000,
      cacheMaxSize:    rt.cacheMaxSize    ?? 200,
      inspector:       rt.inspector       ?? true,
      patchLog:        rt.patchLog        ?? true,
    });
  } catch (err) {
    System.showToast('Could not load runtime settings.', 'error');
    console.error('[AcroxaJS Runtime] load:', err);
  }

  // ── Live runtime stats (real endpoint, honest empty states) ──────────────
  try {
    const res = await fetch('/acr/api/system/runtime', { credentials: 'include' });
    if (res.ok) {
      const body = await res.json();
      const snap = body && body.data ? body.data : null;
      const perfEl = document.getElementById('runtime-live-stats');
      if (perfEl && snap) {
        const perf = snap.perf || {};
        const rows = Object.keys(perf).slice(0, 8).map((k) => {
          const s = perf[k] || {};
          return `<tr><td>${k}</td><td>${s.count ?? 0}</td><td>${s.avgMs != null ? Math.round(s.avgMs * 100) / 100 + 'ms' : '—'}</td></tr>`;
        }).join('');
        perfEl.innerHTML = rows
          ? `<table class="table"><thead><tr><th>Stage</th><th>Count</th><th>Avg</th></tr></thead><tbody>${rows}</tbody></table>`
          : '<p class="text-muted">No performance data yet — it fills as the runtime serves.</p>';
      }
    }
  } catch (_) {
    const perfEl = document.getElementById('runtime-live-stats');
    if (perfEl) perfEl.innerHTML = '<p class="text-muted">Live stats unavailable.</p>';
  }

  // ── Cache flush (existing endpoint — real invalidation) ──────────────────
  document.getElementById('runtime-flush-btn')?.addEventListener('click', async () => {
    if (!confirm('Flush all runtime caches? Visitors render fresh on the next request.')) return;
    try {
      await System.flushCache();
      System.showToast('Runtime caches flushed.', 'success');
    } catch (err) {
      System.showToast(err.message, 'error');
    }
  });

  void 0;

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      await System.updateSection('runtime', {
        cacheEnabled:    flat.cacheEnabled,
        cacheStrategy:   flat.cacheStrategy,
        cacheTTL:        Number(flat.cacheTTL) || 0,
        cacheSwrGraceMs: Number(flat.cacheSwrGraceMs) || 0,
        cacheMaxSize:    Number(flat.cacheMaxSize) || 200,
        inspector:       flat.inspector,
        patchLog:        flat.patchLog,
      });
      System.showToast('Runtime settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });
});
