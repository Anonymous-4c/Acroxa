/**
 * Menu Registry Module
 * Connects to /acr/api/menus and /acr/api/ CMS endpoints.
 * Registers the /menu namespace with full CRUD, slot assignment,
 * and CMS-item-binding actions — all wired to dynamicSuggestions.
 *
 * Command Center notes:
 *  - No API calls were changed. Tile `size`/`meta` hints were added so
 *    richer items (e.g. a menu with many items, or an unfilled slot)
 *    stand out visually without altering what data is fetched.
 *  - NOTE: `list` reads `menus.menus` while several other actions
 *    (`rename`, `delete`, `assign`, `add-post`, etc.) read `menus` as a
 *    plain array from the same `getMenus()` call. That inconsistency
 *    existed in the original implementation and has been left intact
 *    rather than guessed at — verify which shape `/acr/api/menus`
 *    actually returns and align these before shipping.
 */
(() => {

  /* ─────────────────────────────────────────────────── */
  /* API Adapter                                         */
  /* ─────────────────────────────────────────────────── */

  const MENU_API = {

    base: '/acr/api',

    async _fetch(endpoint, options = {}) {
      try {
        const res = await fetch(`${this.base}${endpoint}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
          },
          ...options
        });

        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);

        return await res.json();

      } catch (err) {
        console.error('[MenuRegistry]', err);
        return null;
      }
    },

    /* ── Menus ── */

    getMenus() {
      return this._fetch('/menus');
    },

    getMenuById(id) {
      return this._fetch(`/menus/${id}`);
    },

    createMenu(name) {
      return this._fetch('/menus', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
    },

    updateMenu(id, data) {
      return this._fetch(`/menus/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    deleteMenu(id) {
      return this._fetch(`/menus/${id}`, {
        method: 'DELETE'
      });
    },

    /* ── Slots ── */

    getSlots() {
      return this._fetch('/menus/slots');
    },

    getMenusBySlot() {
      return this._fetch('/menus/by-slot');
    },

    assignSlot(id, slot) {
      return this._fetch(`/menus/${id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ slot })
      });
    },

    unassignSlot(id, slot) {
      return this._fetch(`/menus/${id}/unassign`, {
        method: 'POST',
        body: JSON.stringify({ slot })
      });
    },

    /* ── CMS ── */

    /* CMS — cmsController.js's getPosts/getPages/getCategories return
       {success, posts|pages|categories, count}, not a bare array, and
       don't support a `?search=` query param server-side. We unwrap the
       envelope here and filter client-side so callers can keep using
       getPosts(query)/getPages(query)/getCategories(query) as a simple
       "array, optionally narrowed by title/name" helper. */
    async getPosts(query = '') {
      const res = await this._fetch('/posts');
      const posts = res?.posts || [];
      if (!query) return posts;
      const q = query.toLowerCase();
      return posts.filter(p => (p.title || '').toLowerCase().includes(q));
    },

    async getPages(query = '') {
      const res = await this._fetch('/pages');
      const pages = res?.pages || [];
      if (!query) return pages;
      const q = query.toLowerCase();
      return pages.filter(p => (p.title || '').toLowerCase().includes(q));
    },

    async getCategories(query = '') {
      const res = await this._fetch('/categories');
      const categories = res?.categories || [];
      if (!query) return categories;
      const q = query.toLowerCase();
      return categories.filter(c => (c.name || '').toLowerCase().includes(q));
    }
  };

  /* ─────────────────────────────────────────────────── */
  /* Shared Helpers                                      */
  /* ─────────────────────────────────────────────────── */

  /**
   * Build the rich modal content for a single menu —
   * shows its items, assigned slots, and quick actions.
   */
  function buildMenuDetailHTML(menu) {
    const slots = (menu.slots || []).length
      ? menu.slots.map(slot => `
          <span class="menu-slot-badge">${slot}</span>
        `).join("")
      : `<span class="menu-empty-state">No slots assigned</span>`;

    const items = (menu.items || []).length
      ? menu.items.map(item => `
          <div class="menu-item-card">
            <i class="${
              item.type === "cms"
                ? "fa-solid fa-link"
                : "fa-solid fa-pen-nib"
            } menu-item-icon"></i>

            <span class="menu-item-label">
              ${item.label || item.url || "—"}
            </span>

            <span class="menu-item-type">
              ${
                item.type === "cms"
                  ? item.meta?.cmsType || "cms"
                  : "custom"
              }
            </span>
          </div>
        `).join("")
      : `<p class="menu-empty-text">No items yet.</p>`;

    return `
      <div class="menu-detail">

        <div class="menu-section">
          <h5 class="menu-section-title">
            Assigned Slots
          </h5>
          <div class="menu-slots">
            ${slots}
          </div>
        </div>

        <div class="menu-section">
          <h5 class="menu-section-title">
            Items (${(menu.items || []).length})
          </h5>
          <div class="menu-items">
            ${items}
          </div>
        </div>

        <div class="menu-actions">
          <button
            class="menu-btn menu-btn-primary"
            onclick="window.open('/acrx/menus?id=${menu._id || menu.id}','_self')"
          >
            <i class="fa-solid fa-pen-to-square"></i>
            Open Editor
          </button>

          <button
            class="menu-btn menu-btn-secondary"
            onclick="window.open('/acrx/menus','_self')"
          >
            <i class="fa-solid fa-list"></i>
            All Menus
          </button>
        </div>

      </div>
    `;
  }

  /**
   * Lightweight HTML preview for the inline preview pane —
   * intentionally terser than buildMenuDetailHTML (which powers the modal).
   */
  function buildMenuPreviewHTML(menu) {
    const slotText = (menu.slots || []).length
      ? (menu.slots || []).join(', ')
      : 'No slots assigned';

    return `
      <strong>${menu.name}</strong> · ${(menu.items || []).length} items<br>
      ${slotText}
    `;
  }

  /* ─────────────────────────────────────────────────── */
  /* Registry Registration                               */
  /* ─────────────────────────────────────────────────── */

  const registerMenus = () => {

    if (!window.cmdk) return;

    window.cmdk.registerNamespace('/menu', {

      label: 'Menus',
      desc:  'Create, edit, assign, and manage navigation menus',
      icon:  'fa-solid fa-bars',

      actions: {

        /* ────────────────────────────────────────────── */
        /* list                                           */
        /* ────────────────────────────────────────────── */

        'list': {
          desc: 'Browse all menus and view their slot assignments',
          icon: 'fa-solid fa-list-ul',

          dynamicSuggestions: async () => {

            const menus = await MENU_API.getMenus();

            if (!menus.menus || !menus.menus.length) {
              return [{
                label: 'No menus found',
                desc:  'Create your first menu with /menu create',
                icon:  'fa-solid fa-circle-info',
                action: () => window.cmdk.setInputValue('/menu create ')
              }];
            }

            return menus.menus.map((m, idx) => ({
              label: m.name,
              desc:  `Slots: ${(m.slots || []).join(', ') || 'none'} · ${(m.items || []).length} items`,
              icon:  'fa-solid fa-bars',
              size:  idx === 0 ? 'wide' : 'normal',
              preview: buildMenuPreviewHTML(m),
              action: () => {
                window.cmdk.showModal(
                  `Menu: ${m.name}`,
                  buildMenuDetailHTML(m)
                );
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* create                                         */
        /* ────────────────────────────────────────────── */

        'create': {
          desc: 'Create a new menu by name',
          icon: 'fa-solid fa-plus',

          dynamicSuggestions: async (query) => {

            if (!query || !query.trim()) {
              return [{
                label: 'Type a menu name…',
                desc:  'e.g. /menu create Main Navigation',
                icon:  'fa-solid fa-keyboard',
                action: () => {}
              }];
            }

            return [{
              label: `Create "${query.trim()}"`,
              desc:  'Add a new empty menu',
              icon:  'fa-solid fa-plus-circle',
              size:  'wide',
              action: async () => {
                const res = await MENU_API.createMenu(query.trim());

                if (res && (res._id || res.id)) {
                  return {
                    toast: { message: `Menu "${query.trim()}" created.`, type: 'success' },
                    reload: true
                  };
                }

                return {
                  toast: { message: 'Failed to create menu.', type: 'error' }
                };
              }
            }];
          }
        },

        /* ────────────────────────────────────────────── */
        /* rename                                         */
        /* ────────────────────────────────────────────── */

        'rename': {
          desc: 'Rename an existing menu',
          icon: 'fa-solid fa-pencil',

          dynamicSuggestions: async (query) => {

            const menus = await MENU_API.getMenus();

            if (!menus || !menus.length) {
              return [{
                label: 'No menus found',
                desc:  'Create a menu first',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return menus.map(m => ({
              label: m.name,
              desc:  'Click to rename this menu',
              icon:  'fa-solid fa-pencil',
              action: () => {
                const newName = prompt(`Rename "${m.name}" to:`, m.name);

                if (!newName || !newName.trim()) return;

                MENU_API.updateMenu(m._id || m.id, { name: newName.trim() })
                  .then(res => {
                    if (res) {
                      System.showToast(`Renamed to "${newName.trim()}"`, 'success');
                    } else {
                      System.showToast('Rename failed.', 'error');
                    }
                  });
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* delete                                         */
        /* ────────────────────────────────────────────── */

        'delete': {
          desc: 'Delete a menu permanently',
          icon: 'fa-solid fa-trash',

          dynamicSuggestions: async () => {

            const menus = await MENU_API.getMenus();

            if (!menus || !menus.length) {
              return [{
                label: 'No menus to delete',
                desc:  '',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return menus.map(m => ({
              label: m.name,
              desc:  `Permanently remove this menu and its ${(m.items || []).length} items`,
              icon:  'fa-solid fa-triangle-exclamation',
              action: async () => {
                const ok = confirm(`Delete menu "${m.name}"? This cannot be undone.`);

                if (!ok) return;

                const res = await MENU_API.deleteMenu(m._id || m.id);

                if (res) {
                  return {
                    toast:  { message: `Menu "${m.name}" deleted.`, type: 'success' },
                    reload: true
                  };
                }

                return {
                  toast: { message: 'Delete failed.', type: 'error' }
                };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* assign                                         */
        /* ────────────────────────────────────────────── */

        'assign': {
          desc: 'Assign a menu to a layout slot (primary, footer, sidebar…)',
          icon: 'fa-solid fa-map-pin',

          dynamicSuggestions: async () => {

            const [menus, slots] = await Promise.all([
              MENU_API.getMenus(),
              MENU_API.getSlots()
            ]);

            if (!menus || !menus.length) {
              return [{
                label: 'No menus available',
                desc:  'Create a menu first',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            if (!slots || !slots.length) {
              return [{
                label: 'No slots available',
                desc:  'Check your active layout defines slot areas',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            /* Cross-product: show "MenuName → slot" combos */
            const suggestions = [];

            for (const m of menus) {

              const unassigned = slots.filter(s =>
                !(m.slots || []).includes(s)
              );

              for (const slot of unassigned) {
                suggestions.push({
                  label: m.name,
                  desc:  `Assign to "${slot}" slot`,
                  icon:  'fa-solid fa-arrow-right-to-bracket',
                  action: async () => {
                    const res = await MENU_API.assignSlot(m._id || m.id, slot);

                    if (res) {
                      return {
                        toast:  { message: `"${m.name}" assigned to ${slot}.`, type: 'success' },
                        reload: true
                      };
                    }

                    return {
                      toast: { message: 'Slot assignment failed.', type: 'error' }
                    };
                  }
                });
              }
            }

            return suggestions.length ? suggestions : [{
              label: 'All slots already assigned',
              desc:  'Unassign a menu first to reassign its slot',
              icon:  'fa-solid fa-circle-check',
              action: () => {}
            }];
          }
        },

        /* ────────────────────────────────────────────── */
        /* unassign                                       */
        /* ────────────────────────────────────────────── */

        'unassign': {
          desc: 'Remove a menu from a slot',
          icon: 'fa-solid fa-map-pin',

          dynamicSuggestions: async () => {

            const menus = await MENU_API.getMenus();

            if (!menus) return [];

            const assigned = menus.flatMap(m =>
              (m.slots || []).map(slot => ({ menu: m, slot }))
            );

            if (!assigned.length) {
              return [{
                label: 'No menus currently assigned',
                desc:  'Use /menu assign to bind a menu to a slot',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return assigned.map(({ menu: m, slot }) => ({
              label: `${m.name}`,
              desc:  `Remove from "${slot}" slot`,
              icon:  'fa-solid fa-xmark',
              action: async () => {
                const res = await MENU_API.unassignSlot(m._id || m.id, slot);

                if (res) {
                  return {
                    toast:  { message: `"${m.name}" removed from ${slot}.`, type: 'success' },
                    reload: true
                  };
                }

                return {
                  toast: { message: 'Unassign failed.', type: 'error' }
                };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* slots                                          */
        /* ────────────────────────────────────────────── */

        'slots': {
          desc: 'View all layout slots and their current menu bindings',
          icon: 'fa-solid fa-table-columns',

          dynamicSuggestions: async () => {

            const bySlot = await MENU_API.getMenusBySlot();

            if (!bySlot) {
              return [{
                label: 'Could not load slot data',
                desc:  'Check your API connection',
                icon:  'fa-solid fa-circle-exclamation',
                action: () => {}
              }];
            }

            const entries = Object.entries(bySlot);

            if (!entries.length) {
              return [{
                label: 'No slot assignments found',
                desc:  'Use /menu assign to bind menus to slots',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return entries.map(([slot, menu]) => ({
              label: slot,
              desc:  menu ? `${menu.name} · ${(menu.items || []).length} items` : 'Empty',
              icon:  menu ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle',
              action: () => {
                if (!menu) {
                  window.cmdk.setInputValue('/menu assign ');
                  return;
                }

                window.cmdk.showModal(
                  `Slot: ${slot}`,
                  buildMenuDetailHTML(menu)
                );
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* add-post                                       */
        /* ────────────────────────────────────────────── */

        'add-post': {
          desc: 'Add a CMS post into a menu as a navigation item',
          icon: 'fa-solid fa-file-lines',

          dynamicSuggestions: async (query) => {

            const [menus, posts] = await Promise.all([
              MENU_API.getMenus(),
              MENU_API.getPosts(query)
            ]);

            if (!menus || !menus.length) {
              return [{
                label: 'No menus found',
                desc:  'Create a menu first',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            if (!posts || !posts.length) {
              return [{
                label: query ? `No posts matching "${query}"` : 'No posts found',
                desc:  '',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return posts.map(post => ({
              label: post.title,
              desc:  `Add to menu · ${post.status || 'published'}`,
              icon:  'fa-solid fa-file-lines',
              action: () => {
                if (menus.length === 1) {
                  _addCmsItemToMenu(menus[0], post, 'post');
                  return;
                }

                const listHTML = menus.map(m => `
                  <div onclick="window._addCmsItem('${m._id || m.id}','${post._id || post.id}','post','${(post.title || '').replace(/'/g, "\\'")}','${post.slug || post.url || ''}')"
                    style="padding:10px 14px;border-radius:6px;cursor:pointer;margin-bottom:6px;
                      background:var(--cmdk-surface);
                      border:1px solid var(--cmdk-border);">
                    <span style="font-size:0.9rem;">${m.name}</span>
                    <span style="float:right;color:var(--cmdk-text-muted);font-size:0.8rem;">${(m.slots || []).join(', ') || 'no slot'}</span>
                  </div>
                `).join('');

                window.cmdk.showModal(
                  `Add "${post.title}" to…`,
                  `<p style="color:var(--cmdk-text-muted);font-size:0.85rem;margin:0 0 12px;">Choose which menu to add this post to:</p>${listHTML}`
                );

                window._addCmsItem = async (menuId, cmsId, cmsType, label, url) => {
                  const menu = menus.find(m => (m._id || m.id) === menuId);
                  if (!menu) return;
                  const fakePost = { _id: cmsId, title: label, slug: url };
                  await _addCmsItemToMenu(menu, fakePost, cmsType);
                  window.cmdk.hideModal();
                };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* add-page                                       */
        /* ────────────────────────────────────────────── */

        'add-page': {
          desc: 'Add a CMS page into a menu as a navigation item',
          icon: 'fa-solid fa-file',

          dynamicSuggestions: async (query) => {

            const [menus, pages] = await Promise.all([
              MENU_API.getMenus(),
              MENU_API.getPages(query)
            ]);

            if (!menus || !menus.length) {
              return [{
                label: 'No menus found',
                desc:  'Create a menu first',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            if (!pages || !pages.length) {
              return [{
                label: query ? `No pages matching "${query}"` : 'No pages found',
                desc:  '',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return pages.map(page => ({
              label: page.title,
              desc:  `Add to menu · ${page.status || 'published'}`,
              icon:  'fa-solid fa-file',
              action: () => {
                if (menus.length === 1) {
                  _addCmsItemToMenu(menus[0], page, 'page');
                  return;
                }

                const listHTML = menus.map(m => `
                  <div onclick="window._addCmsItem('${m._id || m.id}','${page._id || page.id}','page','${(page.title || '').replace(/'/g, "\\'")}','${page.slug || page.url || ''}')"
                    style="padding:10px 14px;border-radius:6px;cursor:pointer;margin-bottom:6px;
                      background:var(--cmdk-surface);
                      border:1px solid var(--cmdk-border);">
                    <span style="font-size:0.9rem;">${m.name}</span>
                    <span style="float:right;color:var(--cmdk-text-muted);font-size:0.8rem;">${(m.slots || []).join(', ') || 'no slot'}</span>
                  </div>
                `).join('');

                window.cmdk.showModal(
                  `Add "${page.title}" to…`,
                  `<p style="color:var(--cmdk-text-muted);font-size:0.85rem;margin:0 0 12px;">Choose which menu to add this page to:</p>${listHTML}`
                );

                window._addCmsItem = async (menuId, cmsId, cmsType, label, url) => {
                  const menu = menus.find(m => (m._id || m.id) === menuId);
                  if (!menu) return;
                  const fakePage = { _id: cmsId, title: label, slug: url };
                  await _addCmsItemToMenu(menu, fakePage, cmsType);
                  window.cmdk.hideModal();
                };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* add-category                                   */
        /* ────────────────────────────────────────────── */

        'add-category': {
          desc: 'Add a CMS category into a menu',
          icon: 'fa-solid fa-folder',

          dynamicSuggestions: async (query) => {

            const [menus, cats] = await Promise.all([
              MENU_API.getMenus(),
              MENU_API.getCategories(query)
            ]);

            if (!menus || !menus.length) {
              return [{
                label: 'No menus found',
                desc:  'Create a menu first',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            if (!cats || !cats.length) {
              return [{
                label: query ? `No categories matching "${query}"` : 'No categories found',
                desc:  '',
                icon:  'fa-solid fa-circle-info',
                action: () => {}
              }];
            }

            return cats.map(cat => ({
              label: cat.name || cat.title,
              desc:  `Add to menu · ${cat.count != null ? cat.count + ' posts' : ''}`,
              icon:  'fa-solid fa-folder',
              action: () => {
                if (menus.length === 1) {
                  _addCmsItemToMenu(menus[0], { ...cat, title: cat.name || cat.title }, 'category');
                  return;
                }

                const listHTML = menus.map(m => `
                  <div onclick="window._addCmsItem('${m._id || m.id}','${cat._id || cat.id}','category','${(cat.name || cat.title || '').replace(/'/g, "\\'")}','${cat.slug || ''}')"
                    style="padding:10px 14px;border-radius:6px;cursor:pointer;margin-bottom:6px;
                      background:var(--cmdk-surface);
                      border:1px solid var(--cmdk-border);">
                    <span style="font-size:0.9rem;">${m.name}</span>
                    <span style="float:right;color:var(--cmdk-text-muted);font-size:0.8rem;">${(m.slots || []).join(', ') || 'no slot'}</span>
                  </div>
                `).join('');

                window.cmdk.showModal(
                  `Add "${cat.name || cat.title}" to…`,
                  `<p style="color:var(--cmdk-text-muted);font-size:0.85rem;margin:0 0 12px;">Choose which menu to add this category to:</p>${listHTML}`
                );

                window._addCmsItem = async (menuId, cmsId, cmsType, label, url) => {
                  const menu = menus.find(m => (m._id || m.id) === menuId);
                  if (!menu) return;
                  const fakeCat = { _id: cmsId, title: label, slug: url };
                  await _addCmsItemToMenu(menu, fakeCat, cmsType);
                  window.cmdk.hideModal();
                };
              }
            }));
          }
        },

        /* ────────────────────────────────────────────── */
        /* edit                                           */
        /* ────────────────────────────────────────────── */

        'edit': {
          desc: 'Open the full menu editor in the admin panel',
          icon: 'fa-solid fa-pen-to-square',

          dynamicSuggestions: async () => {

            const menus = await MENU_API.getMenus();

            if (!menus || !menus.length) {
              return [{
                label: 'No menus found',
                desc:  'Create a menu first with /menu create',
                icon:  'fa-solid fa-circle-info',
                action: () => window.cmdk.setInputValue('/menu create ')
              }];
            }

            return menus.map(m => ({
              label: m.name,
              desc:  `Open editor · ${(m.items || []).length} items · slots: ${(m.slots || []).join(', ') || 'none'}`,
              icon:  'fa-solid fa-pen-to-square',
              action: () => {
                window.open(`/acrx/menus?id=${m._id || m.id}`, '_self');
              }
            }));
          }
        }
      }
    });

    /* ── Contributes a "Browse menus" quick action to the home surface ── */
    if (window.cmdk.registerContextProvider) {
      window.cmdk.registerContextProvider(async () => {
        const menus = await MENU_API.getMenus();
        const count = menus?.menus?.length ?? (Array.isArray(menus) ? menus.length : 0);

        return {
          quickActions: [
            {
              label: 'Browse menus',
              desc: count ? `${count} menu${count === 1 ? '' : 's'} configured` : 'No menus yet — create one',
              icon: 'fa-solid fa-bars',
              commandBadge: '/menu list',
              autocomplete: '/menu list '
            }
          ]
        };
      });
    }
  };

  /* ─────────────────────────────────────────────────── */
  /* CMS Item → Menu Item Normalizer                     */
  /* ─────────────────────────────────────────────────── */

  /**
   * Converts a CMS entity into the normalized menu item shape,
   * appends it to the given menu, and persists via PUT /menus/:id.
   */
  async function _addCmsItemToMenu(menu, entity, cmsType) {

    const id     = menu._id || menu.id;
    const items  = Array.isArray(menu.items) ? [...menu.items] : [];

    /* Duplicate guard */
    const alreadyIn = items.some(item =>
      item.type === 'cms' &&
      item.meta?.cmsId === (entity._id || entity.id) &&
      item.meta?.cmsType === cmsType
    );

    if (alreadyIn) {
      System.showToast(
        ` "${entity.title}" is already in this menu.`,
        'warning'
      );
      return;
    }

    /* Normalized item */
    const newItem = {
      id:    `cms-${cmsType}-${entity._id || entity.id}`,
      label: entity.title || entity.name,
      type:  'cms',
      url:   entity.slug || entity.url || `/${cmsType}/${entity._id || entity.id}`,
      meta: {
        cmsType,
        cmsId: entity._id || entity.id
      }
    };

    items.push(newItem);

    const res = await MENU_API.updateMenu(id, { items });

    if (res) {
      System.showToast(
        ` "${entity.title}" added to ${menu.name}.`,
        'success'
      );
    } else {
      System.showToast(
        ` Failed to update menu.`,
        'error'
      );
    }
  }

  /* ─────────────────────────────────────────────────── */
  /* Boot                                                */
  /* ─────────────────────────────────────────────────── */

  if (window.cmdk) {
    registerMenus();
  } else {
    const checkInterval = setInterval(() => {
      if (window.cmdk) {
        clearInterval(checkInterval);
        registerMenus();
      }
    }, 50);
  }

})();
