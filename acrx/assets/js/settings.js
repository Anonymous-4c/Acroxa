/**
 * system-settings.js
 * Client-side logic for all /acrx/system/* pages.
 * One file — each section is clearly marked so you can split it later.
 *
 * Depends on:
 *  - fetch API (native)
 *  - Font Awesome (icons already in markup)
 *  - The CMS dropdown markup produced by CustomDropdown in framework.js
 *
 * Dropdown contract:
 *   .dropdown-field-wrap[data-dropdown-id="fieldId"]
 *     input.dropdown-hidden-input          ← real value storage
 *     .dropdown
 *       button.dropdown-toggle             ← label display
 *       .dropdown-menu .wrap-menu-dp
 *         button.dropdown-item[data-value] ← option buttons
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   § SHARED UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */

const API = '/api';

/** Thin fetch wrapper — returns parsed JSON or throws */
async function apiFetch(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

/** Show a transient toast notification */
function toast(message, type = 'success') {
  const existing = document.getElementById('acrx-toast');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.id = 'acrx-toast';
  t.className = `acrx-toast toast-${type}`;
  t.innerHTML = `<span class="toast-msg">${message}</span>`;
  document.body.appendChild(t);

  requestAnimationFrame(() => t.classList.add('toast-visible'));
  setTimeout(() => {
    t.classList.remove('toast-visible');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

/** Collect all form values from a container div.
 *  - text/number/email/password inputs → by id
 *  - checkboxes (toggles) → by id → boolean
 *  - textareas → by id
 *  - CustomDropdown hidden inputs → by id
 *  Returns a flat object { fieldId: value }
 */
function collectForm(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return {};
  const data = {};

  container.querySelectorAll('input:not([type=file]):not([type=checkbox]), textarea').forEach(el => {
    if (!el.id) return;
    data[el.id] = el.value;
  });

  container.querySelectorAll('input[type=checkbox]').forEach(el => {
    if (!el.id) return;
    data[el.id] = el.checked;
  });

  return data;
}

/** Nested key helper — turns { 'siteName': 'X' } into { general: { siteName: 'X' } } etc.
 *  Pass a fieldMap: { fieldId: ['section', 'nestedKey?'] }
 */
function buildPayload(flat, fieldMap) {
  const out = {};
  for (const [fieldId, path] of Object.entries(fieldMap)) {
    if (flat[fieldId] === undefined) continue;
    const val = flat[fieldId];
    const [section, key] = path;
    if (!out[section]) out[section] = {};
    if (key) {
      // Supports one level of nesting: ['security', 'passwordPolicy.minLength']
      const parts = key.split('.');
      if (parts.length === 2) {
        if (!out[section][parts[0]]) out[section][parts[0]] = {};
        out[section][parts[0]][parts[1]] = val;
      } else {
        out[section][key] = val;
      }
    } else {
      out[section][fieldId] = val;
    }
  }
  return out;
}

/** Patch a single section to the API */
async function patchSection(section, payload) {
  return apiFetch('PATCH', `/settings/${section}`, payload);
}

/** Patch multiple sections (bulk) */
async function patchBulk(payload) {
  return apiFetch('PATCH', '/settings', payload);
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system  — NAVIGATION PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

function initSystemNav() {
  // Nav cards are plain <a> links — no JS needed.
  // This hook exists for future analytics or prefetch behaviour.
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/general  — GENERAL SETTINGS
   ═══════════════════════════════════════════════════════════════════════════ */

function initGeneralSettings() {
  // File upload button proxies
  document.getElementById('logo-upload-btn')?.addEventListener('click', () =>
    document.getElementById('siteLogo')?.click()
  );
  document.getElementById('favicon-upload-btn')?.addEventListener('click', () =>
    document.getElementById('siteFavicon')?.click()
  );

  // Preview on file select
  ['siteLogo', 'siteFavicon'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e => {
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
  });

  // Save
  document.getElementById('general-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('general-settings-form');
    try {
      await patchSection('general', {
        siteName:        flat.siteName,
        siteTagline:     flat.siteTagline,
        siteDescription: flat.siteDescription,
        siteURL:         flat.siteURL,
        adminEmail:      flat.adminEmail,
      });
      toast('General settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/localization  — LOCALIZATION
   ═══════════════════════════════════════════════════════════════════════════ */

function initLocalizationSettings() {
  document.getElementById('localization-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('localization-form');
    try {
      await patchSection('localization', {
        language:   flat.language,
        timezone:   flat.timezone,
        dateFormat: flat.dateFormat,
        timeFormat: flat.timeFormat,
        currency:   flat.currency,
      });
      toast('Localization settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/content  — CONTENT SETTINGS
   ═══════════════════════════════════════════════════════════════════════════ */

function initContentSettings() {
  document.getElementById('content-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('content-form');
    const formats = flat.imageOptWebp ? ['webp'] : [];
    try {
      await patchSection('content', {
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
          formats,
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
      toast('Content settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/seo  — SEO SETTINGS
   ═══════════════════════════════════════════════════════════════════════════ */

function initSeoSettings() {
  document.getElementById('og-image-btn')?.addEventListener('click', () =>
    document.getElementById('ogDefaultImage')?.click()
  );

  document.getElementById('seo-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('seo-form');
    try {
      await patchSection('seo', {
        metaTitle:       flat.metaTitle,
        metaDescription: flat.metaDescription,
        metaKeywords:    flat.metaKeywords,
        enableSitemap:   flat.enableSitemap,
        enableRobotsTxt: flat.enableRobotsTxt,
        canonicalURL:    flat.canonicalURL,
        openGraph: {
          enabled: flat.ogEnabled,
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
      toast('SEO settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/ai  — AI SETTINGS
   ═══════════════════════════════════════════════════════════════════════════ */

function initAiSettings() {
  // Test connection buttons
  async function testProvider(provider) {
    const btn = document.getElementById(`test-${provider}`);
    if (!btn) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="icon icon-duotone"><i class="fa-duotone fa-spinner fa-spin"></i></span> Testing…';
    try {
      const res = await apiFetch('POST', '/settings/ai/test', { provider });
      toast(`${provider}: connected (${res.latencyMs}ms)`, 'success');
    } catch (err) {
      toast(`${provider}: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  document.getElementById('test-openai')?.addEventListener('click', () => testProvider('openai'));
  document.getElementById('test-gemini')?.addEventListener('click', () => testProvider('gemini'));

  document.getElementById('ai-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('ai-form');
    try {
      await patchSection('ai', {
        enabled:         flat.aiEnabled,
        defaultProvider: flat.defaultProvider,
        providers: {
          openai: {
            enabled: flat.openaiEnabled,
            apiKey:  flat.openaiKey,
            model:   flat.openaiModel,
          },
          gemini: {
            enabled: flat.geminiEnabled,
            apiKey:  flat.geminiKey,
            model:   flat.geminiModel,
          },
          custom: {
            endpoint: flat.customEndpoint,
            apiKey:   flat.customKey,
          },
        },
        features: {
          contentSuggestions:        flat.contentSuggestions,
          seoSuggestions:            flat.seoSuggestions,
          autoTitleGeneration:       flat.autoTitleGeneration,
          autoDescriptionGeneration: flat.autoDescriptionGeneration,
          chatAssistant:             flat.chatAssistant,
        },
      });
      toast('AI settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/security  — SECURITY
   ═══════════════════════════════════════════════════════════════════════════ */

function initSecuritySettings() {
  // Force sign out all
  document.getElementById('force-signout-all')?.addEventListener('click', async () => {
    if (!confirm('Sign out every active user? This cannot be undone.')) return;
    try {
      await apiFetch('POST', '/auth/force-signout-all');
      toast('All users signed out.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('security-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('security-form');
    const allowedIPs  = flat.allowedIPs  ? flat.allowedIPs.split(',').map(s => s.trim()).filter(Boolean)  : [];
    const corsOrigins = flat.corsOrigins ? flat.corsOrigins.split(',').map(s => s.trim()).filter(Boolean) : ['*'];

    try {
      await patchSection('security', {
        loginAttemptsLimit: Number(flat.loginAttemptsLimit),
        sessionTimeout:     Number(flat.sessionTimeout),
        twoFactorEnabled:   flat.twoFactorEnabled,
        passwordPolicy: {
          minLength:        Number(flat.pwMinLength),
          requireNumbers:   flat.requireNumbers,
          requireSymbols:   flat.requireSymbols,
          requireUppercase: flat.requireUppercase,
        },
        allowedIPs,
        corsOrigins,
      });
      toast('Security settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/api  — API & INTEGRATIONS
   ═══════════════════════════════════════════════════════════════════════════ */

function initApiSettings() {
  document.getElementById('api-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('api-form');
    const webhookURLs = flat.webhookURLs
      ? flat.webhookURLs.split('\n').map(s => s.trim()).filter(Boolean)
      : [];

    try {
      await patchBulk({
        api: {
          apiEnabled:   flat.apiEnabled,
          apiRateLimit: Number(flat.apiRateLimit),
          webhookURLs,
          thirdPartyKeys: {
            googleAnalytics: flat.gaKey,
            stripe:          flat.stripeKey,
            openai:          flat.openaiApiKey,
            gemini:          flat.geminiApiKey,
          },
        },
      });
      toast('API settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/plugins  — PLUGINS
   ═══════════════════════════════════════════════════════════════════════════ */

function initPluginsSettings() {
  // Configure plugin buttons
  document.querySelectorAll('[data-configure]')?.forEach(btn => {
    btn.addEventListener('click', () => {
      const pluginId = btn.dataset.configure;
      // Open a config panel / modal — implementation depends on plugin registry
      // For now, log as a hook point
      console.log('[Plugins] Configure requested for:', pluginId);
      toast(`Configure panel for "${pluginId}" — coming soon.`, 'info');
    });
  });

  document.getElementById('plugins-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('plugins-form');
    const enabledPlugins = [];

    document.querySelectorAll('[data-plugin-id]').forEach(cb => {
      if (cb.checked) enabledPlugins.push(cb.dataset.pluginId);
    });

    try {
      await patchSection('plugins', {
        pluginAutoUpdate: flat.pluginAutoUpdate,
        enabledPlugins,
      });
      toast('Plugin settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/analytics  — ANALYTICS
   ═══════════════════════════════════════════════════════════════════════════ */

function initAnalyticsSettings() {
  document.getElementById('analytics-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('analytics-form');
    try {
      await patchSection('analytics', {
        analyticsEnabled:      flat.analyticsEnabled,
        trackingID:            flat.trackingID,
        cookieConsentRequired: flat.cookieConsentRequired,
      });
      toast('Analytics settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/backups  — BACKUPS
   ═══════════════════════════════════════════════════════════════════════════ */

function initBackupsPage() {
  // ── Load history ─────────────────────────────────────────────────────────
  async function loadHistory() {
    const container = document.getElementById('backup-history');
    if (!container) return;
    try {
      const res = await apiFetch('GET', '/system/backups');
      if (!res.data?.length) {
        container.innerHTML = '<p class="text-muted">No backups found.</p>';
        return;
      }
      container.innerHTML = '';
      const table = document.createElement('div');
      table.className = 'backup-history-list';
      res.data.forEach(b => {
        const row = document.createElement('div');
        row.className = 'backup-row';
        row.innerHTML = `
          <span class="backup-filename">${b.filename}</span>
          <span class="backup-size text-muted">${(b.size / 1024).toFixed(1)} KB</span>
          <span class="backup-date text-muted">${new Date(b.createdAt).toLocaleString()}</span>
          <div class="backup-row-actions">
            <button class="btn btn-secondary btn-sm" data-download="${b.filename}">
              <i class="fa-duotone fa-download"></i>
            </button>
            <button class="btn btn-danger-ghost btn-sm" data-delete="${b.filename}">
              <i class="fa-duotone fa-trash"></i>
            </button>
          </div>
        `;
        table.appendChild(row);
      });
      container.appendChild(table);

      // Wire download / delete
      container.querySelectorAll('[data-download]').forEach(btn => {
        btn.addEventListener('click', () => {
          window.location.href = `${API}/system/backups/download/${btn.dataset.download}`;
        });
      });
      container.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm(`Delete ${btn.dataset.delete}?`)) return;
          try {
            await apiFetch('DELETE', `/system/backups/${btn.dataset.delete}`);
            toast('Backup deleted.');
            loadHistory();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<p class="text-muted">${err.message}</p>`;
    }
  }

  loadHistory();

  // ── Export now ───────────────────────────────────────────────────────────
  document.getElementById('export-backup-btn')?.addEventListener('click', () => {
    const includeMedia = document.getElementById('includeMedia')?.checked ? '?media=true' : '';
    window.location.href = `${API}/system/backups/export${includeMedia}`;
  });

  // ── Import / restore ──────────────────────────────────────────────────────
  document.getElementById('import-backup-btn')?.addEventListener('click', () =>
    document.getElementById('restore-input')?.click()
  );

  document.getElementById('restore-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Restore from this backup? Existing settings will be overwritten.')) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await apiFetch('POST', '/system/backups/import', json);
      toast('Backup restored successfully. Reloading…', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      toast(`Restore failed: ${err.message}`, 'error');
    }
    e.target.value = '';
  });

  // ── Save policy ───────────────────────────────────────────────────────────
  document.getElementById('backup-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('backup-policy-form');
    try {
      await apiFetch('PATCH', '/system/backups/policy', {
        enabled: flat.backupEnabled,
        schedule: {
          interval:       flat.backupInterval,
          time:           flat.backupTime,
          customInterval: Number(flat.customInterval),
        },
        targets: {
          local: flat.targetLocal,
          git:   flat.targetGit,
          cloud: flat.targetCloud,
        },
        includeMedia: flat.includeMedia,
        git: {
          repoURL:     flat.gitRepoURL,
          branch:      flat.gitBranch,
          token:       flat.gitToken,
          authorName:  flat.gitAuthorName,
          authorEmail: flat.gitAuthorEmail,
        },
        cloud: {
          provider:        flat.cloudProvider,
          bucket:          flat.cloudBucket,
          region:          flat.cloudRegion,
          accessKeyId:     flat.cloudAccessKey,
          secretAccessKey: flat.cloudSecretKey,
          endpoint:        flat.cloudEndpoint,
        },
      });
      toast('Backup policy saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/logs  — SYSTEM LOGS
   ═══════════════════════════════════════════════════════════════════════════ */

function initLogsPage() {
  const viewer    = document.getElementById('log-viewer');
  const search    = document.getElementById('log-search');
  const levelDrop = document.getElementById('logLevelFilter'); // hidden input

  let allLogs = [];

  function renderLogs(logs) {
    if (!viewer) return;
    if (!logs.length) {
      viewer.innerHTML = '<div class="log-placeholder"><p class="text-muted">No matching log entries.</p></div>';
      return;
    }
    viewer.innerHTML = logs.map(l => `
      <div class="log-entry log-${l.level || 'info'}">
        <span class="log-ts">${new Date(l.timestamp || Date.now()).toLocaleTimeString()}</span>
        <span class="log-level badge badge-${l.level || 'info'}">${(l.level || 'info').toUpperCase()}</span>
        <span class="log-msg">${l.message || JSON.stringify(l)}</span>
      </div>
    `).join('');
  }

  function filterLogs() {
    const level  = levelDrop?.value || 'all';
    const query  = (search?.value || '').toLowerCase();
    const filtered = allLogs.filter(l => {
      const levelMatch = level === 'all' || l.level === level;
      const textMatch  = !query || JSON.stringify(l).toLowerCase().includes(query);
      return levelMatch && textMatch;
    });
    renderLogs(filtered);
  }

  async function fetchLogs() {
    try {
      const res = await apiFetch('GET', '/system/logs');
      allLogs = res.data || res.logs || [];
      filterLogs();
    } catch {
      if (viewer) viewer.innerHTML = '<p class="text-muted">Could not load logs.</p>';
    }
  }

  fetchLogs();

  document.getElementById('refresh-logs')?.addEventListener('click', fetchLogs);

  document.getElementById('clear-logs')?.addEventListener('click', async () => {
    if (!confirm('Clear all logs?')) return;
    try {
      await apiFetch('DELETE', '/system/logs');
      allLogs = [];
      filterLogs();
      toast('Logs cleared.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  levelDrop?.addEventListener('change', filterLogs);
  search?.addEventListener('input', filterLogs);
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/maintenance  — MAINTENANCE
   ═══════════════════════════════════════════════════════════════════════════ */

function initMaintenancePage() {
  // Maintenance mode quick-toggle button (separate from save)
  document.getElementById('toggle-maintenance-btn')?.addEventListener('click', async () => {
    const chk = document.getElementById('maintenanceMode');
    const newState = chk ? !chk.checked : true;
    try {
      await apiFetch('POST', '/settings/system/maintenance', { enabled: newState });
      toast(`Maintenance mode ${newState ? 'enabled' : 'disabled'}. Reloading…`);
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Flush cache
  document.getElementById('flush-cache-btn')?.addEventListener('click', async () => {
    try {
      await apiFetch('POST', '/system/cache/flush');
      toast('Cache flushed.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('maintenance-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('maintenance-form');
    try {
      await patchBulk({
        system: {
          maintenanceMode:           flat.maintenanceMode,
          registrationEnabled:       flat.registrationEnabled,
          contentModerationRequired: flat.contentModerationRequired,
          defaultUserRole:           flat.defaultUserRole,
          autoSaveInterval:          Number(flat.autoSaveInterval),
          paginationLimit:           Number(flat.paginationLimit),
        },
        advanced: {
          cacheEnabled: flat.cacheEnabled,
          cacheTTL:     Number(flat.cacheTTL),
        },
      });
      toast('Maintenance settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § /acrx/system/advanced  — ADVANCED
   ═══════════════════════════════════════════════════════════════════════════ */

function initAdvancedSettings() {
  // Reset all settings — danger action
  document.getElementById('reset-all-settings-btn')?.addEventListener('click', async () => {
    const confirm1 = confirm('Reset ALL settings to factory defaults? This cannot be undone.');
    if (!confirm1) return;
    const confirm2 = confirm('Are you absolutely sure? All custom configuration will be lost.');
    if (!confirm2) return;
    try {
      await apiFetch('POST', '/settings/reset');
      toast('Settings reset to defaults. Reloading…', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('advanced-save-btn')?.addEventListener('click', async () => {
    const flat = collectForm('advanced-form');
    try {
      await patchBulk({
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
      toast('Advanced settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   § ROUTER — auto-detect page and run the right init
   ═══════════════════════════════════════════════════════════════════════════ */

const PAGE_INIT_MAP = {
  '/acrx/system':             initSystemNav,
  '/acrx/system/general':     initGeneralSettings,
  '/acrx/system/localization':initLocalizationSettings,
  '/acrx/system/content':     initContentSettings,
  '/acrx/system/seo':         initSeoSettings,
  '/acrx/system/ai':          initAiSettings,
  '/acrx/system/security':    initSecuritySettings,
  '/acrx/system/api':         initApiSettings,
  '/acrx/system/plugins':     initPluginsSettings,
  '/acrx/system/analytics':   initAnalyticsSettings,
  '/acrx/system/backups':     initBackupsPage,
  '/acrx/system/logs':        initLogsPage,
  '/acrx/system/maintenance': initMaintenancePage,
  '/acrx/system/advanced':    initAdvancedSettings,
};

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.replace(/\/$/, '');
  const init = PAGE_INIT_MAP[path];
  if (typeof init === 'function') {
    init();
  }
});