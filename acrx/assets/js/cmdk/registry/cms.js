/**
 * /registry/cms.js
 *
 * Wires /cms (posts, pages, categories) to cmsRoutes.js / cmsController.js.
 * Field shapes below are taken directly from real sample responses, not
 * guessed — see the docstrings on each action for the exact response
 * envelope used.
 *
 * Creation is navigation-only: createPost/createPage/createCategory all
 * require fields a command palette can't reasonably collect (title,
 * content, etc.), so /cms post create and friends just open the editor
 * with no id (= new document) rather than attempting a zero-input POST.
 * Editing existing content also opens the editor — only rename
 * (slug/title via quick-edit), status changes, and delete execute
 * directly from here.
 *
 * Role/ownership notes: quick-edit, delete, and bulk routes are gated by
 * requireRoles + checkOwnership server-side (author/editor/admin, with
 * authors restricted to their own content, and bulk ops requiring
 * editor/admin). This registry doesn't try to replicate that logic
 * client-side — it just calls the endpoint and surfaces whatever
 * success/error message the server returns, same as the media registry's
 * approval-flow handling.
 */
(() => {

  const CMS_API = {
    base: '/acr/api',

    async _fetch(endpoint, options = {}) {
      try {
        const res = await fetch(`${this.base}${endpoint}`, {
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
          ...options
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          // Surface the server's own message (validation/ownership errors etc.)
          // rather than a generic "API Error", since cmsController returns
          // useful messages like "Category with this name or slug already exists".
          return { success: false, message: body?.message || `HTTP ${res.status}`, _httpStatus: res.status };
        }
        return body;
      } catch (err) {
        console.error('[CmsRegistry]', err);
        return null;
      }
    },

    // Posts — response shape: { success, posts: [...], count } / { success, post }
    getPosts(query) {
      const qs = query ? `?status=${encodeURIComponent(query)}` : '';
      return this._fetch(`/posts${qs}`);
    },
    quickEditPost(id, data) {
      return this._fetch(`/posts/${id}/quick`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    deletePost(id) {
      return this._fetch(`/posts/${id}`, { method: 'DELETE' });
    },
    schedulePost(id, publishAt) {
      return this._fetch(`/posts/${id}/schedule`, { method: 'POST', body: JSON.stringify({ publishAt }) });
    },

    // Pages
    getPages() { return this._fetch('/pages'); },
    quickEditPage(id, data) {
      return this._fetch(`/pages/${id}/quick`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    deletePage(id) {
      return this._fetch(`/pages/${id}`, { method: 'DELETE' });
    },

    // Categories — response shape confirmed: { success, categories: [...], count }
    getCategories() { return this._fetch('/categories'); },
    quickEditCategory(id, data) {
      return this._fetch(`/categories/${id}/quick`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    deleteCategory(id) {
      return this._fetch(`/categories/${id}`, { method: 'DELETE' });
    }
  };

  function statusIcon(status) {
    if (status === 'published') return 'fa-solid fa-circle-check';
    if (status === 'draft') return 'fa-solid fa-pen';
    if (status === 'scheduled') return 'fa-solid fa-clock';
    return 'fa-solid fa-circle';
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) {
      return iso;
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /* Posts                                                              */
  /* ─────────────────────────────────────────────────────────────────── */

  function registerPosts(cmdk) {

    cmdk.registerNamespace('/posts', {
      label: 'Posts',
      desc: 'Create, edit, publish, and manage blog posts',
      icon: 'fa-solid fa-newspaper',

      actions: {

        'list': {
          desc: 'Browse all posts',
          icon: 'fa-solid fa-list-ul',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getPosts();
            const posts = res?.posts || [];

            const filtered = query?.trim()
              ? posts.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))
              : posts;

            if (!filtered.length) {
              return [{
                label: query ? `No posts matching "${query}"` : 'No posts yet',
                desc: 'Create your first post',
                icon: 'fa-solid fa-circle-info',
                action: () => window.open('/acrx/editor?type=post', '_self')
              }];
            }

            return filtered.slice(0, 40).map((p, idx) => ({
              label: p.title,
              desc: `${p.status} · ${p.author?.fullName || p.author?.username || 'Unknown'} · ${formatDate(p.publishDate)}`,
              icon: statusIcon(p.status),
              size: idx === 0 ? 'wide' : 'normal',
              preview: `<strong>${p.title}</strong> · ${p.status}<br>${p.excerpt || 'No excerpt'} · ${p.readingTime || 1} min read · ${p.views || 0} views`,
              action: () => window.open(`/acrx/editor?id=${p._id}&type=post`, '_self')
            }));
          }
        },

        'new': {
          desc: 'Create a new post',
          icon: 'fa-solid fa-circle-plus',
          dynamicSuggestions: async () => [{
            label: 'New post',
            desc: 'Opens a blank post in the editor',
            icon: 'fa-solid fa-circle-plus',
            size: 'wide',
            action: () => window.open('/acrx/editor?type=post', '_self')
          }]
        },

        'drafts': {
          desc: 'View draft posts',
          icon: 'fa-solid fa-pen',
          dynamicSuggestions: async () => {
            const res = await CMS_API.getPosts('draft');
            const posts = (res?.posts || []).filter(p => p.status === 'draft');

            if (!posts.length) {
              return [{
                label: 'No drafts',
                desc: 'All posts are published or scheduled',
                icon: 'fa-solid fa-circle-check',
                action: () => {}
              }];
            }

            return posts.map(p => ({
              label: p.title,
              desc: `Draft · last updated ${formatDate(p.updatedAt)}`,
              icon: 'fa-solid fa-pen',
              action: () => window.open(`/acrx/editor?id=${p._id}&type=post`, '_self')
            }));
          }
        },

        'publish': {
          desc: 'Publish a draft post',
          icon: 'fa-solid fa-circle-check',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getPosts();
            const drafts = (res?.posts || []).filter(p =>
              p.status !== 'published' &&
              (!query?.trim() || p.title.toLowerCase().includes(query.trim().toLowerCase()))
            );

            if (!drafts.length) {
              return [{
                label: 'No unpublished posts',
                desc: '',
                icon: 'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return drafts.map(p => ({
              label: p.title,
              desc: `Currently ${p.status} — publish now`,
              icon: 'fa-solid fa-circle-check',
              action: async () => {
                const res = await CMS_API.quickEditPost(p._id, { status: 'published' });

                if (res?.success) {
                  return { toast: { message: `"${p.title}" published.`, type: 'success' } };
                }
                return { toast: { message: res?.message || 'Publish failed.', type: 'error' } };
              }
            }));
          }
        },

        'rename': {
          desc: 'Rename a post (updates title and slug)',
          icon: 'fa-solid fa-pencil',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getPosts();
            const posts = res?.posts || [];

            const filtered = query?.trim()
              ? posts.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))
              : posts;

            if (!filtered.length) {
              return [{ label: 'No matching posts', desc: '', icon: 'fa-solid fa-circle-info', action: () => {} }];
            }

            return filtered.slice(0, 30).map(p => ({
              label: p.title,
              desc: 'Click to rename',
              icon: 'fa-solid fa-pencil',
              action: async () => {
                const newTitle = prompt(`Rename "${p.title}" to:`, p.title);
                if (!newTitle || !newTitle.trim() || newTitle.trim() === p.title) return;

                const res = await CMS_API.quickEditPost(p._id, { title: newTitle.trim() });

                if (res?.success) {
                  return { toast: { message: `Renamed to "${newTitle.trim()}".`, type: 'success' } };
                }
                return { toast: { message: res?.message || 'Rename failed.', type: 'error' } };
              }
            }));
          }
        },

        'delete': {
          desc: 'Delete a post',
          icon: 'fa-solid fa-trash',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getPosts();
            const posts = res?.posts || [];

            const filtered = query?.trim()
              ? posts.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))
              : posts;

            if (!filtered.length) {
              return [{ label: 'No matching posts', desc: '', icon: 'fa-solid fa-circle-info', action: () => {} }];
            }

            return filtered.slice(0, 30).map(p => ({
              label: p.title,
              desc: `Delete this ${p.status} post permanently`,
              icon: 'fa-solid fa-trash',
              action: async () => {
                const ok = confirm(`Delete "${p.title}"? This cannot be undone.`);
                if (!ok) return;

                const res = await CMS_API.deletePost(p._id);

                if (res?.success) {
                  return { toast: { message: 'Post deleted.', type: 'success' } };
                }
                return { toast: { message: res?.message || 'Delete failed — you may not have permission.', type: 'error' } };
              }
            }));
          }
        }
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /* Pages                                                              */
  /* ─────────────────────────────────────────────────────────────────── */

  function registerPages(cmdk) {

    cmdk.registerNamespace('/pages', {
      label: 'Pages',
      desc: 'Create, edit, and manage CMS pages',
      icon: 'fa-solid fa-file',

      actions: {

        'list': {
          desc: 'Browse all pages',
          icon: 'fa-solid fa-list-ul',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getPages();
            const pages = res?.pages || [];

            const filtered = query?.trim()
              ? pages.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))
              : pages;

            if (!filtered.length) {
              return [{
                label: query ? `No pages matching "${query}"` : 'No pages yet',
                desc: 'Create your first page',
                icon: 'fa-solid fa-circle-info',
                action: () => window.open('/acrx/editor?type=page', '_self')
              }];
            }

            return filtered.slice(0, 40).map((p, idx) => ({
              label: p.title,
              desc: `${p.status} · template: ${p.template || 'default'}${p.showInMenu ? ' · in menu' : ''}`,
              icon: statusIcon(p.status),
              size: idx === 0 ? 'wide' : 'normal',
              preview: `<strong>${p.title}</strong> · ${p.status}<br>/${p.slug} · template: ${p.template || 'default'}`,
              action: () => window.open(`/acrx/editor?id=${p._id}&type=page`, '_self')
            }));
          }
        },

        'new': {
          desc: 'Create a new page',
          icon: 'fa-solid fa-circle-plus',
          dynamicSuggestions: async () => [{
            label: 'New page',
            desc: 'Opens a blank page in the editor',
            icon: 'fa-solid fa-circle-plus',
            size: 'wide',
            action: () => window.open('/acrx/editor?type=page', '_self')
          }]
        },

        'rename': {
          desc: 'Rename a page (updates title and slug)',
          icon: 'fa-solid fa-pencil',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getPages();
            const pages = res?.pages || [];

            const filtered = query?.trim()
              ? pages.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))
              : pages;

            if (!filtered.length) {
              return [{ label: 'No matching pages', desc: '', icon: 'fa-solid fa-circle-info', action: () => {} }];
            }

            return filtered.slice(0, 30).map(p => ({
              label: p.title,
              desc: 'Click to rename',
              icon: 'fa-solid fa-pencil',
              action: async () => {
                const newTitle = prompt(`Rename "${p.title}" to:`, p.title);
                if (!newTitle || !newTitle.trim() || newTitle.trim() === p.title) return;

                const res = await CMS_API.quickEditPage(p._id, { title: newTitle.trim() });

                if (res?.success) {
                  return { toast: { message: `Renamed to "${newTitle.trim()}".`, type: 'success' } };
                }
                return { toast: { message: res?.message || 'Rename failed.', type: 'error' } };
              }
            }));
          }
        },

        'toggle-menu': {
          desc: 'Show or hide a page in the site menu',
          icon: 'fa-solid fa-bars',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getPages();
            const pages = res?.pages || [];

            const filtered = query?.trim()
              ? pages.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))
              : pages;

            if (!filtered.length) {
              return [{ label: 'No matching pages', desc: '', icon: 'fa-solid fa-circle-info', action: () => {} }];
            }

            return filtered.slice(0, 30).map(p => ({
              label: p.title,
              desc: p.showInMenu ? 'Currently shown in menu — tap to hide' : 'Currently hidden — tap to show in menu',
              icon: p.showInMenu ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off',
              action: async () => {
                const res = await CMS_API.quickEditPage(p._id, { showInMenu: !p.showInMenu });

                if (res?.success) {
                  return { toast: { message: p.showInMenu ? 'Hidden from menu.' : 'Shown in menu.', type: 'success' } };
                }
                return { toast: { message: res?.message || 'Update failed.', type: 'error' } };
              }
            }));
          }
        },

        'delete': {
          desc: 'Delete a page',
          icon: 'fa-solid fa-trash',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getPages();
            const pages = res?.pages || [];

            const filtered = query?.trim()
              ? pages.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))
              : pages;

            if (!filtered.length) {
              return [{ label: 'No matching pages', desc: '', icon: 'fa-solid fa-circle-info', action: () => {} }];
            }

            return filtered.slice(0, 30).map(p => ({
              label: p.title,
              desc: `Delete this ${p.status} page permanently`,
              icon: 'fa-solid fa-trash',
              action: async () => {
                const ok = confirm(`Delete "${p.title}"? This cannot be undone.`);
                if (!ok) return;

                const res = await CMS_API.deletePage(p._id);

                if (res?.success) {
                  return { toast: { message: 'Page deleted.', type: 'success' } };
                }
                return { toast: { message: res?.message || 'Delete failed — you may not have permission.', type: 'error' } };
              }
            }));
          }
        }
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /* Categories                                                         */
  /* ─────────────────────────────────────────────────────────────────── */

  function registerCategories(cmdk) {

    cmdk.registerNamespace('/categories', {
      label: 'Categories',
      desc: 'Create, edit, and delete post categories',
      icon: 'fa-solid fa-tag',

      actions: {

        'list': {
          desc: 'Browse all categories',
          icon: 'fa-solid fa-list-ul',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getCategories();
            const categories = res?.categories || [];

            const filtered = query?.trim()
              ? categories.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()))
              : categories;

            if (!filtered.length) {
              return [{
                label: query ? `No categories matching "${query}"` : 'No categories yet',
                desc: 'Create your first category',
                icon: 'fa-solid fa-circle-info',
                action: () => window.open('/acrx/categories/edit', '_self')
              }];
            }

            return filtered.map((c, idx) => ({
              label: c.name,
              desc: c.description || `/${c.slug}`,
              icon: 'fa-solid fa-tag',
              size: idx === 0 ? 'wide' : 'normal',
              meta: c.color,
              preview: `<strong>${c.name}</strong><br>${c.description || 'No description'} · /${c.slug}`,
              action: () => window.open(`/acrx/categories/edit?id=${c._id}`, '_self')
            }));
          }
        },

        'new': {
          desc: 'Create a new category',
          icon: 'fa-solid fa-circle-plus',
          dynamicSuggestions: async () => [{
            label: 'New category',
            desc: 'Opens a blank category in the editor',
            icon: 'fa-solid fa-circle-plus',
            size: 'wide',
            action: () => window.open('/acrx/categories/edit', '_self')
          }]
        },

        'rename': {
          desc: 'Rename a category',
          icon: 'fa-solid fa-pencil',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getCategories();
            const categories = res?.categories || [];

            const filtered = query?.trim()
              ? categories.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()))
              : categories;

            if (!filtered.length) {
              return [{ label: 'No matching categories', desc: '', icon: 'fa-solid fa-circle-info', action: () => {} }];
            }

            return filtered.map(c => ({
              label: c.name,
              desc: 'Click to rename',
              icon: 'fa-solid fa-pencil',
              action: async () => {
                const newName = prompt(`Rename "${c.name}" to:`, c.name);
                if (!newName || !newName.trim() || newName.trim() === c.name) return;

                const res = await CMS_API.quickEditCategory(c._id, { name: newName.trim() });

                if (res?.success) {
                  return { toast: { message: `Renamed to "${newName.trim()}".`, type: 'success' } };
                }
                return { toast: { message: res?.message || 'Rename failed.', type: 'error' } };
              }
            }));
          }
        },

        'delete': {
          desc: 'Delete a category',
          icon: 'fa-solid fa-trash',
          dynamicSuggestions: async (query) => {
            const res = await CMS_API.getCategories();
            const categories = res?.categories || [];

            const filtered = query?.trim()
              ? categories.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()))
              : categories;

            if (!filtered.length) {
              return [{ label: 'No matching categories', desc: '', icon: 'fa-solid fa-circle-info', action: () => {} }];
            }

            return filtered.map(c => {
              // The API itself enforces `deletable: false` (e.g. "Uncategorized")
              // server-side and returns 403 — reflect that here too so the
              // suggestion is honest about what tapping it will do.
              if (c.deletable === false) {
                return {
                  label: c.name,
                  desc: 'This category cannot be deleted',
                  icon: 'fa-solid fa-lock',
                  action: () => System.showToast(`"${c.name}" cannot be deleted.`, 'warning')
                };
              }

              return {
                label: c.name,
                desc: 'Delete this category permanently',
                icon: 'fa-solid fa-trash',
                action: async () => {
                  const ok = confirm(`Delete "${c.name}"? This cannot be undone.`);
                  if (!ok) return;

                  const res = await CMS_API.deleteCategory(c._id);

                  if (res?.success) {
                    return { toast: { message: 'Category deleted.', type: 'success' } };
                  }
                  return { toast: { message: res?.message || 'Delete failed.', type: 'error' } };
                }
              };
            });
          }
        }
      }
    });
  }

  const registerCms = () => {
    if (!window.cmdk) return;
    registerPosts(window.cmdk);
    registerPages(window.cmdk);
    registerCategories(window.cmdk);

    /* ── Contributes recent content counts to the home surface ── */
    if (window.cmdk.registerContextProvider) {
      window.cmdk.registerContextProvider(async () => {
        const [postsRes, pagesRes] = await Promise.all([
          CMS_API.getPosts(),
          CMS_API.getPages()
        ]);

        const posts = postsRes?.posts || [];
        const drafts = posts.filter(p => p.status !== 'published').length;

        if (!posts.length && !(pagesRes?.pages || []).length) return null;

        return {
          quickActions: [{
            label: 'Browse posts',
            desc: `${posts.length} post${posts.length === 1 ? '' : 's'}${drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : ''}`,
            icon: 'fa-solid fa-newspaper',
            commandBadge: '/posts list',
            autocomplete: '/posts list '
          }]
        };
      });
    }
  };

  if (window.cmdk) {
    registerCms();
  } else {
    const checkInterval = setInterval(() => {
      if (window.cmdk) {
        clearInterval(checkInterval);
        registerCms();
      }
    }, 50);
  }
})();
