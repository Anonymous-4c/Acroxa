/**
 * /registry/backup.js
 *
 * Wires the /backup namespace to /acr/api/backup endpoints.
 *
 * ASSUMED ENDPOINT CONTRACT — please verify against your actual
 * backupController.js / backupRoutes.js and adjust paths/fields below
 * if they differ. Inferred from cmsController.js's use of
 * registerBackupProvider("posts"|"pages"|"categories", fn) plus the
 * REST conventions used consistently across layout/menu/settings/media:
 *
 *   GET    /acr/api/backup                 -> { success, backups: [{ id, name, createdAt, size, providers: [...] }] }
 *   POST   /acr/api/backup                 -> body: { name? }                  -> { success, backup }
 *   GET    /acr/api/backup/:id             -> { success, backup }              (detail / manifest)
 *   POST   /acr/api/backup/:id/restore     ->                                  -> { success, message }
 *   DELETE /acr/api/backup/:id             ->                                  -> { success, message }
 *   GET    /acr/api/backup/:id/download    -> binary (opened in a new tab, not fetched as JSON)
 *
 * If your real routes differ (e.g. /acr/api/backups, plural), update
 * BACKUP_API.base and the endpoint strings below — everything else
 * (registry shape, UI, Command Center integration) stays the same.
 */
(() => {

  const BACKUP_API = {
    base: '/acr/api',

    async _fetch(endpoint, options = {}) {
      try {
        const res = await fetch(`${this.base}${endpoint}`, {
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
          ...options
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        // DELETE/restore endpoints may return 204 No Content
        const text = await res.text();
        console.log('[BackupRegistry] Response from', endpoint, ':', text ? JSON.parse(text) : 'No content');
        return text ? JSON.parse(text) : { success: true };
      } catch (err) {
        console.error('[BackupRegistry]', err);
        return null;
      }
    },

    list() {
      return this._fetch('/system/backups');
      
    },
    create(name) {
      return this._fetch('/system/backups/run', {
        method: 'POST',
        body: JSON.stringify(name ? { name } : {})
      });
    },
    restore(id) {
      return this._fetch(`/system/backups/${id}/restore`, { method: 'POST' });
    },
    remove(id) {
      return this._fetch(`/system/backups/${id}`, { method: 'DELETE' });
    }
  };

  function formatBytes(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatWhen(iso) {
    if (!iso) return 'Unknown date';
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
      });
    } catch (_) {
      return iso;
    }
  }

  function buildBackupDetailHTML(backup) {
    const providers = (backup.providers || []).length
      ? backup.providers.map(p => `<span class="backup-provider-badge" style="
          display:inline-block; padding:3px 9px; margin:3px 4px 0 0;
          border-radius:6px; font-size:11px; font-weight:600;
          background:var(--cmdk-accent-soft); color:var(--cmdk-text);
        ">${p}</span>`).join('')
      : '<span style="color:var(--cmdk-text-muted); font-size:12.5px;">No provider breakdown available</span>';

    return `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <div style="font-size:12.5px; color:var(--cmdk-text-muted); margin-bottom:4px;">Created</div>
          <div style="font-size:13.5px; color:var(--cmdk-text);">${formatWhen(backup.createdAt)}</div>
        </div>
        <div>
          <div style="font-size:12.5px; color:var(--cmdk-text-muted); margin-bottom:4px;">Size</div>
          <div style="font-size:13.5px; color:var(--cmdk-text);">${formatBytes(backup.size)}</div>
        </div>
        <div>
          <div style="font-size:12.5px; color:var(--cmdk-text-muted); margin-bottom:6px;">Included data</div>
          <div>${providers}</div>
        </div>
      </div>
    `;
  }

  const registerBackup = () => {
    if (!window.cmdk) return;

    window.cmdk.registerNamespace('/backup', {
      label: 'Backup',
      desc: 'Export, import, schedule, and manage CMS backups',
      icon: 'fa-solid fa-box-archive',
      actions: {

        /* ────────────────────────────────────────────── */
        /* list                                           */
        /* ────────────────────────────────────────────── */

        'list': {
          desc: 'View all backups',
          icon: 'fa-solid fa-list-ul',
          dynamicSuggestions: async () => {
            const res = await BACKUP_API.list();
            const backups = res?.data || [];

            if (!res) {
              return [{
                label: 'Could not reach backup service',
                desc: 'Check that /acr/api/system/backups is wired up correctly',
                icon: 'fa-solid fa-triangle-exclamation',
                action: () => {}
              }];
            }

            if (!backups.length) {
              return [{
                label: 'No backups yet',
                desc: 'Create one with /system/backups create',
                icon: 'fa-solid fa-circle-info',
                action: () => window.cmdk.setInputValue('/backup create ')
              }];
            }

            return backups.map((b, idx) => ({
              label: b.name || `Backup ${b.id}`,
              desc: `${formatWhen(b.createdAt)} · ${formatBytes(b.size)}`,
              icon: 'fa-solid fa-box-archive',
              size: idx === 0 ? 'wide' : 'normal',
              preview: `<strong>${b.name || 'Backup'}</strong> · ${formatWhen(b.createdAt)}<br>${formatBytes(b.size)}${b.providers?.length ? ' · ' + b.providers.join(', ') : ''}`,
              action: () => window.cmdk.showModal(b.name || 'Backup details', buildBackupDetailHTML(b))
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* create                                         */
        /* ────────────────────────────────────────────── */

        'create': {
          desc: 'Create a new backup snapshot',
          icon: 'fa-solid fa-circle-plus',
          dynamicSuggestions: async (query) => {
            const label = query?.trim() ? `Create "${query.trim()}"` : 'Create a new backup';
            return [{
              label,
              desc: 'Snapshots posts, pages, categories, and settings',
              icon: 'fa-solid fa-plus-circle',
              size: 'wide',
              action: async () => {
                const res = await BACKUP_API.create(query?.trim() || undefined);

                if (res?.success) {
                  return {
                    toast: { message: 'Backup created.', type: 'success' },
                    reload: false
                  };
                }

                return { toast: { message: 'Failed to create backup.', type: 'error' } };
              }
            }];
          }
        },

        /* ────────────────────────────────────────────── */
        /* restore                                        */
        /* ────────────────────────────────────────────── */

        'restore': {
          desc: 'Restore the CMS from a previous backup',
          icon: 'fa-solid fa-clock-rotate-left',
          dynamicSuggestions: async () => {
            const res = await BACKUP_API.list();
            const backups = res?.data || [];

            if (!backups.length) {
              return [{
                label: 'No backups available to restore',
                desc: '',
                icon: 'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return backups.map(b => ({
              label: b.name || `Backup ${b.id}`,
              desc: `Restore to ${formatWhen(b.createdAt)} — this will overwrite current data`,
              icon: 'fa-solid fa-triangle-exclamation',
              action: async () => {
                const ok = confirm(
                  `Restore "${b.name || b.id}" from ${formatWhen(b.createdAt)}? ` +
                  `This will overwrite current content and cannot be undone.`
                );
                if (!ok) return;

                const res = await BACKUP_API.restore(b.id);

                if (res?.success) {
                  return {
                    toast: { message: 'Backup restored. Reloading...', type: 'success' },
                    reload: true
                  };
                }

                return { toast: { message: 'Restore failed.', type: 'error' } };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* delete                                         */
        /* ────────────────────────────────────────────── */

        'delete': {
          desc: 'Delete a backup permanently',
          icon: 'fa-solid fa-trash',
          dynamicSuggestions: async () => {
            const res = await BACKUP_API.list();
            const backups = res?.data || [];

            if (!backups.length) {
              return [{
                label: 'No backups to delete',
                desc: '',
                icon: 'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return backups.map(b => ({
              label: b.name || `Backup ${b.id}`,
              desc: `Permanently delete this backup (${formatBytes(b.size)})`,
              icon: 'fa-solid fa-trash',
              action: async () => {
                const ok = confirm(`Delete backup "${b.name || b.id}"? This cannot be undone.`);
                if (!ok) return;

                const res = await BACKUP_API.remove(b.id);

                if (res?.success) {
                  return {
                    toast: { message: 'Backup deleted.', type: 'success' },
                    reload: true
                  };
                }

                return { toast: { message: 'Delete failed.', type: 'error' } };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* download                                       */
        /* ────────────────────────────────────────────── */

        'download': {
          desc: 'Download a backup file',
          icon: 'fa-solid fa-download',
          dynamicSuggestions: async () => {
            const res = await BACKUP_API.list();
            const backups = res?.data || [];

            if (!backups.length) {
              return [{
                label: 'No backups available',
                desc: '',
                icon: 'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return backups.map(b => ({
              label: b.name || `Backup ${b.id}`,
              desc: `Download (${formatBytes(b.size)})`,
              icon: 'fa-solid fa-download',
              action: () => {
                window.open(`${BACKUP_API.base}/backup/${b.id}/download`, '_blank');
              }
            }));
          }
        }
      }
    });

    /* ── Contributes the most recent backup as a quick action ── */
    if (window.cmdk.registerContextProvider) {
      window.cmdk.registerContextProvider(async () => {
        const res = await BACKUP_API.list();
        const backups = res?.data || [];

        if (!backups.length) {
          return {
            quickActions: [{
              label: 'Create your first backup',
              desc: 'No backups yet',
              icon: 'fa-solid fa-box-archive',
              commandBadge: '/backup create',
              autocomplete: '/backup create '
            }]
          };
        }

        const latest = backups[0];
        return {
          quickActions: [{
            label: 'Latest backup',
            desc: `${latest.name || latest.id} · ${formatWhen(latest.createdAt)}`,
            icon: 'fa-solid fa-box-archive',
            commandBadge: '/backup list',
            autocomplete: '/backup list '
          }]
        };
      });
    }
  };

  if (window.cmdk) {
    registerBackup();
  } else {
    const checkInterval = setInterval(() => {
      if (window.cmdk) {
        clearInterval(checkInterval);
        registerBackup();
      }
    }, 50);
  }
})();
