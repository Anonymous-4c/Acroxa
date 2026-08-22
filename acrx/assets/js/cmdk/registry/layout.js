/**
 * Layout Registry Module
 * Connects directly to layout endpoints, fetches layout properties dynamically,
 * and renders rich UI card previews inside the custom modal viewport on request.
 *
 * Command Center notes:
 *  - The active layout is surfaced as a "hero" tile so it's unmistakable at a glance.
 *  - `activate` results carry a `preview` snippet so the inline preview pane
 *    shows author/version before the user commits to switching.
 */
(() => {
  const registerLayouts = () => {
    if (!window.cmdk) return;

    const LAYOUT_API = {
      baseUrl: '/acr/api',

      async fetchJSON(endpoint, options = {}) {
        try {
          const response = await fetch(`${this.baseUrl}${endpoint}`, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
          });
          if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
          return await response.json();
        } catch (err) {
          console.error(err);
          return null;
        }
      },

      getLayouts() { return this.fetchJSON('/layouts'); },
      getActiveLayout() { return this.fetchJSON('/layouts/get/active'); },
      setActiveLayout(id) {
        return this.fetchJSON('/layouts/get/active', {
          method: 'POST',
          body: JSON.stringify({ id })
        });
      }
    };

    /**
     * Shared modal content builder — used by both the /layout info
     * suggestion list and the home-surface "active layout" contextual
     * tile, so the two never drift out of sync with each other.
     */
    function _showLayoutInfoModal(l) {
      const capabilities = Object.entries(l.capabilities || {})
        .map(([key, val]) => `
          <div style="display:flex; align-items:center; gap:8px; margin: 6px 0;">
            <i class="${val ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark'}" style="color:${val ? 'var(--cmdk-accent)' : '#ff4444'}"></i>
            <span style="font-size:0.9rem; text-transform:capitalize;">${key.replace('supports', '')}</span>
          </div>
        `).join('');

      const content = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div style="display:flex; flex-direction:column; gap:16px; align-items:flex-start;">
            <img src="${l.preview}" style="width:100%; height:auto; border-radius:10px; object-fit:cover; border:1px solid var(--cmdk-border);" onerror="this.src='https://placehold.co/120x80?text=No+Preview'"/>
            <div>
              <h4 style="margin:0 0 4px 0; font-size:1.2rem; color:var(--cmdk-text);">${l.name}</h4>
              <p style="margin:0 0 8px 0; color:var(--cmdk-text-muted); font-size:0.85rem;">v${l.version} by <a href="${l.authorUrl}" target="_blank" style="color:var(--cmdk-accent); text-decoration:none;">${l.author}</a></p>
              <p style="margin:0; font-size:0.9rem; color:var(--cmdk-text);">${l.description}</p>
            </div>
          </div>
          <div style="border-top:1px solid var(--cmdk-border); padding-top:16px;">
            <h5 style="margin:0 0 8px 0; font-size:1rem; color:var(--cmdk-text-muted);">Capabilities</h5>
            ${capabilities}
          </div>
        </div>
      `;
      window.cmdk.showModal(`${l.name} Details`, content);
    }

    window.cmdk.registerNamespace('/layout', {
      label: 'Layout',
      desc: 'Manage layouts, config, preview, and templates',
      icon: 'fa-solid fa-table-columns',
      actions: {
        'activate': {
          desc: 'Activate an installed layout',
          icon: 'fa-solid fa-toggle-on',
          dynamicSuggestions: async () => {
            const layouts = await LAYOUT_API.getLayouts();
            const activeLayout = await LAYOUT_API.getActiveLayout();

            if (!layouts) return [];

            return layouts
              .filter(l => l.id !== activeLayout?.id)
              .map((l, idx) => ({
                label: l.id,
                desc: `Switch to ${l.name} by ${l.author}`,
                icon: 'fa-solid fa-circle-check',
                size: idx === 0 ? 'wide' : 'normal',
                preview: `
                  <strong>${l.name}</strong> · v${l.version || '—'} by ${l.author || 'Unknown'}<br>
                  ${l.description || 'No description provided.'}
                `,
                action: async () => {
                  window.cmdk.showToast(` Activating ${l.name}...`);
                  const res = await LAYOUT_API.setActiveLayout(l.id);
                  if (res && res.success) {
                    window.cmdk.showToast(` Activated ${l.name}. Reloading...`);
                    setTimeout(() => window.location.reload(), 1500);
                  } else {
                    window.cmdk.showToast(` Failed to activate layout.`);
                  }
                }
              }));
          }
        },
        'info': {
          desc: 'Show rich details and template capabilities of a layout',
          icon: 'fa-solid fa-circle-info',
          dynamicSuggestions: async () => {
            const layouts = await LAYOUT_API.getLayouts();
            if (!layouts) return [];

            return layouts.map(l => ({
              label: l.id,
              desc: `View templates & features of ${l.name}`,
              icon: 'fa-solid fa-eye',
              meta: `v${l.version || '—'}`,
              action: () => _showLayoutInfoModal(l)
            }));
          }
        },
        'edit': {
          desc: 'Open layout config & editor in a new tab',
          icon: 'fa-solid fa-pen-to-square',
          dynamicSuggestions: async () => {
            const layouts = await LAYOUT_API.getLayouts();
            if (!layouts) return [];
            return layouts.map(l => ({
              label: l.id,
              desc: `Configure & customize ${l.name}`,
              icon: 'fa-solid fa-sliders',
              action: () => {
                window.open(`/acrx/layouts/edit?id=${l.id}`, '_blank');
              }
            }));
          }
        },
        'files': {
          desc: 'Manage template files in code editor',
          icon: 'fa-solid fa-folder-open',
          dynamicSuggestions: async () => {
            const layouts = await LAYOUT_API.getLayouts();
            if (!layouts) return [];
            return layouts.map(l => ({
              label: l.id,
              desc: `Open file manager for ${l.name}`,
              icon: 'fa-solid fa-file-code',
              action: () => {
                window.open(`/acrx/layouts/edit?id=${l.id}`, '_blank');
              }
            }));
          }
        }
      }
    });

    /* ── Contributes the active layout as a contextual home-surface tile ── */
    if (window.cmdk.registerContextProvider) {
      window.cmdk.registerContextProvider(async () => {
        const active = await LAYOUT_API.getActiveLayout();
        if (!active) return null;

        return {
          contextualActions: [
            {
              label: `Active layout: ${active.meta.name}`,
              desc: `v${active.meta.version || '—'} by ${active.meta.author.name || 'Unknown'}`,
              icon: 'fa-solid fa-table-columns',
              commandBadge: '/layout info',
              size: 'wide',
              action: () => _showLayoutInfoModal(active.metas)
            }
          ]
        };
      });
    }
  };

  if (window.cmdk) {
    registerLayouts();
  } else {
    const checkInterval = setInterval(() => {
      if (window.cmdk) {
        clearInterval(checkInterval);
        registerLayouts();
      }
    }, 50);
  }
})();
