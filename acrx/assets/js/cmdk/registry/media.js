/**
 * /registry/media.js
 *
 * Wires the /media namespace to mediaRoutes.js (file library + thumbnails)
 * and fontController.js (Google Fonts search/download/inject), both
 * mounted under PREFIX "/media" per mediaRoutes.js.
 *
 * Endpoint contract (read directly from the provided route/controller files):
 *   GET    /acr/api/media/files                  -> { success, files: [{name, url, thumb, album_art_url, type, size, modified, thumbnail_status}] }
 *   GET    /acr/api/media/regenerate-thumbs       -> { success, message, results }
 *   POST   /acr/api/media/rename-file             -> body: { oldName, newName } (admin/editor execute directly; others -> approval request)
 *   POST   /acr/api/media/delete-file             -> body: { filename }        (admin executes directly; others -> approval request)
 *   GET    /acr/api/media/fonts/search?q=         -> { fonts: [{ family, category }] }
 *   GET    /acr/api/media/fonts                   -> { success, fonts: [{ slug, family, injected, cssUrl, fileCount, totalSize, downloadedAt }] }
 *   POST   /acr/api/media/fonts/download          -> body: { family }          -> { success, cached, family, slug, cssFile, files }
 *   DELETE /acr/api/media/fonts/:slug             -> { success, message }
 *   POST   /acr/api/media/fonts/:slug/inject      -> { success, injected, cssUrl, message }
 *   POST   /acr/api/media/fonts/:slug/uninject    -> { success, injected, message }
 *
 * Uploading isn't exposed as a typed command — it needs an actual file
 * picker (multer + multipart body), which a text command palette can't
 * drive — so /media upload opens the Media Library UI instead.
 *
 * Rename/delete may silently become an *approval request* instead of an
 * immediate action depending on the current user's role (see
 * mediaRoutes.js's createApprovalRequest helper). The toast message
 * returned by the server is shown as-is either way, so the user sees
 * "renamed" vs "approval requested" reflected accurately.
 */
(() => {

  const MEDIA_API = {
    base: '/acr/api/media',

    async _fetch(endpoint, options = {}) {
      try {
        const res = await fetch(`${this.base}${endpoint}`, {
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
          ...options
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return await res.json();
      } catch (err) {
        console.error('[MediaRegistry]', err);
        return null;
      }
    },

    getFiles() { return this._fetch('/files'); },
    regenerateThumbs() { return this._fetch('/regenerate-thumbs'); },
    renameFile(oldName, newName) {
      return this._fetch('/rename-file', {
        method: 'POST',
        body: JSON.stringify({ oldName, newName })
      });
    },
    deleteFile(filename) {
      return this._fetch('/delete-file', {
        method: 'POST',
        body: JSON.stringify({ filename })
      });
    },

    searchFonts(q) { return this._fetch(`/fonts/search?q=${encodeURIComponent(q)}`); },
    getFonts() { return this._fetch('/fonts'); },
    downloadFont(family) {
      return this._fetch('/fonts/download', {
        method: 'POST',
        body: JSON.stringify({ family })
      });
    },
    deleteFont(slug) {
      return this._fetch(`/fonts/${slug}`, { method: 'DELETE' });
    },
    injectFont(slug) {
      return this._fetch(`/fonts/${slug}/inject`, { method: 'POST' });
    },
    uninjectFont(slug) {
      return this._fetch(`/fonts/${slug}/uninject`, { method: 'POST' });
    }
  };

  function formatBytes(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function iconForType(mime) {
    if (mime?.startsWith('image/')) return 'fa-solid fa-image';
    if (mime?.startsWith('video/')) return 'fa-solid fa-film';
    if (mime?.startsWith('audio/')) return 'fa-solid fa-music';
    if (mime === 'application/pdf') return 'fa-solid fa-file-pdf';
    if (mime?.includes('zip') || mime?.includes('compressed') || mime?.includes('tar')) return 'fa-solid fa-file-zipper';
    return 'fa-solid fa-file';
  }

  function buildFileDetailHTML(f) {
    const thumb = f.thumb
      ? `<img src="${f.thumb}" style="width:100%; max-height:220px; object-fit:contain; border-radius:10px; border:1px solid var(--cmdk-border); background:var(--cmdk-surface);"/>`
      : `<div style="display:flex; align-items:center; justify-content:center; height:120px; border-radius:10px; background:var(--cmdk-surface); border:1px solid var(--cmdk-border);">
           <i class="${iconForType(f.type)}" style="font-size:32px; color:var(--cmdk-text-muted);"></i>
         </div>`;

    return `
      <div style="display:flex; flex-direction:column; gap:14px;">
        ${thumb}
        <div>
          <div style="font-size:14px; font-weight:600; color:var(--cmdk-text); word-break:break-all;">${f.name}</div>
          <div style="font-size:12px; color:var(--cmdk-text-muted); margin-top:4px;">${f.type} · ${formatBytes(f.size)}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button onclick="window.open('${f.url}','_blank')" style="
            flex:1; padding:9px 14px; border-radius:9px; border:1px solid var(--cmdk-border);
            background:var(--cmdk-accent-soft); color:var(--cmdk-text); font-weight:600; font-size:12.5px; cursor:pointer;
          ">Open file</button>
          <button onclick="window.open('/acrx/media','_self')" style="
            flex:1; padding:9px 14px; border-radius:9px; border:1px solid var(--cmdk-border);
            background:var(--cmdk-surface); color:var(--cmdk-text); font-weight:600; font-size:12.5px; cursor:pointer;
          ">Open Media Library</button>
        </div>
      </div>
    `;
  }

  const registerMedia = () => {
    if (!window.cmdk) return;

    window.cmdk.registerNamespace('/media', {
      label: 'Media',
      desc: 'Upload, manage, rename, and delete media files',
      icon: 'fa-solid fa-photo-film',

      actions: {

        /* ────────────────────────────────────────────── */
        /* list                                           */
        /* ────────────────────────────────────────────── */

        'list': {
          desc: 'Browse uploaded media files',
          icon: 'fa-solid fa-list-ul',
          dynamicSuggestions: async (query) => {
            const res = await MEDIA_API.getFiles();
            if (!res?.files) {
              return [{
                label: 'Could not load media',
                desc: 'Check your connection to /acr/api/media',
                icon: 'fa-solid fa-triangle-exclamation',
                action: () => {}
              }];
            }

            let files = res.files;
            if (query?.trim()) {
              const q = query.trim().toLowerCase();
              files = files.filter(f => f.name.toLowerCase().includes(q));
            }

            if (!files.length) {
              return [{
                label: query ? `No files matching "${query}"` : 'No media files yet',
                desc: 'Open the Media Library to upload your first file',
                icon: 'fa-solid fa-circle-info',
                action: () => window.open('/acrx/media', '_self')
              }];
            }

            return files.slice(0, 60).map((f, idx) => ({
              label: f.name,
              desc: `${f.type} · ${formatBytes(f.size)}`,
              icon: iconForType(f.type),
              size: idx === 0 ? 'wide' : 'normal',
              preview: `<strong>${f.name}</strong><br>${f.type} · ${formatBytes(f.size)} · modified ${new Date(f.modified).toLocaleDateString()}`,
              action: () => window.cmdk.showModal(f.name, buildFileDetailHTML(f))
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* upload                                         */
        /* ────────────────────────────────────────────── */

        'upload': {
          desc: 'Open the Media Library to upload files',
          icon: 'fa-solid fa-upload',
          dynamicSuggestions: async () => [{
            label: 'Open Media Library to upload',
            desc: 'File uploads need the drag-and-drop UI — opening it now',
            icon: 'fa-solid fa-upload',
            action: () => window.open('/acrx/media', '_self')
          }]
        },

        /* ────────────────────────────────────────────── */
        /* rename                                         */
        /* ────────────────────────────────────────────── */

        'rename': {
          desc: 'Rename a media file',
          icon: 'fa-solid fa-pencil',
          dynamicSuggestions: async (query) => {
            const res = await MEDIA_API.getFiles();
            const files = res?.files || [];

            const filtered = query?.trim()
              ? files.filter(f => f.name.toLowerCase().includes(query.trim().toLowerCase()))
              : files;

            if (!filtered.length) {
              return [{
                label: 'No matching files',
                desc: '',
                icon: 'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return filtered.slice(0, 30).map(f => ({
              label: f.name,
              desc: 'Click to rename this file',
              icon: iconForType(f.type),
              action: async () => {
                const newName = prompt(`Rename "${f.name}" to:`, f.name);
                if (!newName || !newName.trim() || newName.trim() === f.name) return;

                const res = await MEDIA_API.renameFile(f.name, newName.trim());

                if (res?.success) {
                  return {
                    toast: { message: res.message || 'File renamed.', type: 'success' },
                    reload: false
                  };
                }

                return { toast: { message: res?.message || 'Rename failed.', type: 'error' } };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* delete                                         */
        /* ────────────────────────────────────────────── */

        'delete': {
          desc: 'Delete a media file',
          icon: 'fa-solid fa-trash',
          dynamicSuggestions: async (query) => {
            const res = await MEDIA_API.getFiles();
            const files = res?.files || [];

            const filtered = query?.trim()
              ? files.filter(f => f.name.toLowerCase().includes(query.trim().toLowerCase()))
              : files;

            if (!filtered.length) {
              return [{
                label: 'No matching files',
                desc: '',
                icon: 'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return filtered.slice(0, 30).map(f => ({
              label: f.name,
              desc: `Delete this file (${formatBytes(f.size)}) — may require approval`,
              icon: 'fa-solid fa-trash',
              action: async () => {
                const ok = confirm(`Delete "${f.name}"? This cannot be undone.`);
                if (!ok) return;

                const res = await MEDIA_API.deleteFile(f.name);

                if (res?.success) {
                  return {
                    toast: { message: res.message || 'File deleted.', type: 'success' },
                    reload: false
                  };
                }

                return { toast: { message: res?.message || 'Delete failed.', type: 'error' } };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* regenerate-thumbs                              */
        /* ────────────────────────────────────────────── */

        'regenerate-thumbs': {
          desc: 'Rebuild thumbnails for all media files',
          icon: 'fa-solid fa-arrows-rotate',
          dynamicSuggestions: async () => [{
            label: 'Regenerate all thumbnails',
            desc: 'Rebuilds image thumbs and re-extracts audio album art',
            icon: 'fa-solid fa-arrows-rotate',
            size: 'wide',
            action: async () => {
              const res = await MEDIA_API.regenerateThumbs();

              if (res?.success) {
                return { toast: { message: res.message || 'Thumbnails regenerated.', type: 'success' } };
              }

              return { toast: { message: res?.message || 'Regeneration failed.', type: 'error' } };
            }
          }]
        },

        /* ────────────────────────────────────────────── */
        /* fonts                                          */
        /* ────────────────────────────────────────────── */

        'fonts': {
          desc: 'Browse downloaded fonts',
          icon: 'fa-solid fa-font',
          dynamicSuggestions: async () => {
            const res = await MEDIA_API.getFonts();
            const fonts = res?.fonts || [];

            if (!fonts.length) {
              return [{
                label: 'No fonts downloaded yet',
                desc: 'Search Google Fonts with /media font-search',
                icon: 'fa-solid fa-circle-info',
                action: () => window.cmdk.setInputValue('/media font-search ')
              }];
            }

            return fonts.map(f => ({
              label: f.family,
              desc: `${f.injected ? 'Injected on public site' : 'Not injected'} · ${f.fileCount} files · ${formatBytes(f.totalSize)}`,
              icon: f.injected ? 'fa-solid fa-circle-check' : 'fa-solid fa-font',
              meta: f.injected ? 'Live' : null,
              action: async () => {
                const action = f.injected ? 'uninject' : 'inject';
                const res = f.injected
                  ? await MEDIA_API.uninjectFont(f.slug)
                  : await MEDIA_API.injectFont(f.slug);

                if (res?.success) {
                  return {
                    toast: { message: res.message || `Font ${action}ed.`, type: 'success' },
                    reload: false
                  };
                }

                return { toast: { message: res?.message || `Failed to ${action} font.`, type: 'error' } };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* font-search                                    */
        /* ────────────────────────────────────────────── */

        'font-search': {
          desc: 'Search Google Fonts and download one',
          icon: 'fa-solid fa-magnifying-glass',
          dynamicSuggestions: async (query) => {
            if (!query || query.trim().length < 2) {
              return [{
                label: 'Type at least 2 characters…',
                desc: 'e.g. /media font-search roboto',
                icon: 'fa-solid fa-keyboard',
                action: () => {}
              }];
            }

            const res = await MEDIA_API.searchFonts(query.trim());
            const fonts = res?.fonts || [];

            if (!fonts.length) {
              return [{
                label: `No fonts matching "${query.trim()}"`,
                desc: '',
                icon: 'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return fonts.map(f => ({
              label: f.family,
              desc: `Download from Google Fonts · ${f.category}`,
              icon: 'fa-solid fa-download',
              action: async () => {
                window.cmdk.showToast(`Downloading ${f.family}...`);
                const res = await MEDIA_API.downloadFont(f.family);

                if (res?.success) {
                  return {
                    toast: {
                      message: res.cached ? `${f.family} already downloaded.` : `${f.family} downloaded.`,
                      type: 'success'
                    }
                  };
                }

                return { toast: { message: res?.message || 'Font download failed.', type: 'error' } };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* delete-font                                    */
        /* ────────────────────────────────────────────── */

        'delete-font': {
          desc: 'Delete a downloaded font',
          icon: 'fa-solid fa-trash',
          dynamicSuggestions: async () => {
            const res = await MEDIA_API.getFonts();
            const fonts = res?.fonts || [];

            if (!fonts.length) {
              return [{
                label: 'No fonts to delete',
                desc: '',
                icon: 'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return fonts.map(f => ({
              label: f.family,
              desc: f.injected ? 'Currently injected — will be removed from the site too' : 'Not currently injected',
              icon: 'fa-solid fa-trash',
              action: async () => {
                const ok = confirm(`Delete font "${f.family}"? This removes the files and any site injection.`);
                if (!ok) return;

                const res = await MEDIA_API.deleteFont(f.slug);

                if (res?.success) {
                  return {
                    toast: { message: res.message || 'Font deleted.', type: 'success' },
                    reload: false
                  };
                }

                return { toast: { message: res?.message || 'Failed to delete font.', type: 'error' } };
              }
            }));
          }
        }
      }
    });

    /* ── Contributes a "recently uploaded" tile to the home surface ── */
    if (window.cmdk.registerContextProvider) {
      window.cmdk.registerContextProvider(async () => {
        const res = await MEDIA_API.getFiles();
        const files = res?.files || [];
        if (!files.length) return null;

        const mostRecent = [...files].sort((a, b) =>
          new Date(b.modified) - new Date(a.modified)
        )[0];

        return {
          quickActions: [{
            label: 'Browse media library',
            desc: `${files.length} file${files.length === 1 ? '' : 's'} · most recent: ${mostRecent.name}`,
            icon: 'fa-solid fa-photo-film',
            commandBadge: '/media list',
            autocomplete: '/media list '
          }]
        };
      });
    }
  };

  if (window.cmdk) {
    registerMedia();
  } else {
    const checkInterval = setInterval(() => {
      if (window.cmdk) {
        clearInterval(checkInterval);
        registerMedia();
      }
    }, 50);
  }
})();
