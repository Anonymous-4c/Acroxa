/**
 * /registry/settings.js
 * Dynamic Settings Runtime Registry
 *
 * Command Center notes:
 *  - `maintenance` and `reset` are surfaced as home-screen quick actions
 *    since they're high-frequency, high-stakes toggles operators reach
 *    for constantly — no change to how they execute.
 */

(() => {

  function prettify(str = '') {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  }

  function escapeHTML(str = '') {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function register() {

    if (!window.cmdk) return;

    const SECTIONS = [
      'general',
      'localization',
      'system',
      'security',
      'appearance',
      'api',
      'content',
      'homepage',
      'blogPage',
      'routing',
      'seo',
      'analytics',
      'ai',
      'advanced',
      'backupPolicy'
    ];

    window.cmdk.registerNamespace('/settings', {

      label: 'Settings',

      desc:
        'System configuration, runtime controls, AI, routing, and CMS settings',

      icon: 'fa-solid fa-gear',

      actions: {

        open: {
          desc: 'Inspect a settings section',
          icon: 'fa-solid fa-sliders',

          dynamicSuggestions: async () => {

            return SECTIONS.map(section => ({

              label: prettify(section),

              desc: `View ${prettify(section)} configuration`,

              icon: 'fa-solid fa-folder-tree',

              action: async () => {

                let link = null;
                if (section.startsWith("home") || section.startsWith("blog")) {
                  link = "routing";
                } else {
                  link = section;
                }

                const data = await System.getSection(section);

                return {
                  modal: {
                    title: `${prettify(section)} Settings`,
                    content: `
                      <pre class="hljs" style="
                        margin:0;
                        padding:18px;
                        border-radius:14px;
                        overflow:auto;
                        background: var(--cmdk-surface);
                        color: var(--cmdk-text);
                        font-size:.82rem;
                        line-height:1.6;
                      "><code class="hljs language-json">${escapeHTML(
                        JSON.stringify(data, null, 2)
                      )}</code></pre>
                      <button data-link="/acrx/system/${link}" style="
                        margin-top:14px;
                        padding:9px 16px;
                        border-radius:9px;
                        border:1px solid var(--cmdk-border);
                        background: var(--cmdk-accent-soft);
                        color: var(--cmdk-text);
                        font-weight:600;
                        font-size:.82rem;
                        cursor:pointer;
                      ">Edit ${prettify(section)} Settings</button>
                    `
                  }
                };
              }
            }));
          }
        },

        maintenance: {
          desc: 'Toggle maintenance mode',
          icon: 'fa-solid fa-screwdriver-wrench',

          dynamicSuggestions: async () => {

            const system = await System.getSection('system');
            const enabled = !!system?.maintenanceMode;

            return [
              {
                label: enabled ? 'Disable Maintenance' : 'Enable Maintenance',

                desc: enabled
                  ? 'Bring system online'
                  : 'Put system into maintenance mode',

                icon: enabled
                  ? 'fa-solid fa-toggle-on'
                  : 'fa-solid fa-toggle-off',

                size: 'wide',

                action: async () => {

                  await System.setMaintenanceMode(!enabled);

                  return {
                    toast: {
                      type: 'success',
                      message: enabled
                        ? 'Maintenance disabled'
                        : 'Maintenance enabled'
                    }
                  };
                }
              }
            ];
          }
        },

        provider: {
          desc: 'Switch AI provider',
          icon: 'fa-solid fa-robot',

          dynamicSuggestions: async () => {

            const providers = ['openai', 'gemini', 'custom'];

            return providers.map(provider => ({

              label: provider.toUpperCase(),

              desc: `Switch AI runtime to ${provider}`,

              icon: 'fa-solid fa-brain',

              action: async () => {

                await System.updateSection('ai', {
                  defaultProvider: provider
                });

                return {
                  toast: {
                    type: 'success',
                    message: `Switched to ${provider}`
                  }
                };
              }
            }));
          }
        },

        models: {
          desc: 'Inspect AI provider models',
          icon: 'fa-solid fa-microchip',

          dynamicSuggestions: async () => {

            const providers = ['openai', 'gemini', 'custom'];

            return providers.map(provider => ({

              label: provider.toUpperCase(),

              desc: `View models for ${provider}`,

              icon: 'fa-solid fa-cubes',

              action: async () => {

                const res = await System.getAIModels(provider);

                return {
                  modal: {
                    title: `${provider} Models`,

                    content: `
                      <div style="
                        display:flex;
                        flex-direction:column;
                        gap:10px;
                      ">
                        ${
                          (res.models || [])
                            .map(model => `
                              <div style="
                                padding:12px 14px;
                                border-radius:10px;
                                background: var(--cmdk-accent-soft);
                                border:1px solid var(--cmdk-border);
                                color: var(--cmdk-text);
                              ">
                                ${model}
                              </div>
                            `)
                            .join('')
                        }
                      </div>
                    `
                  }
                };
              }
            }));
          }
        },

        reset: {
          desc: 'Reset all CMS settings',
          icon: 'fa-solid fa-rotate-left',

          dynamicSuggestions: async () => {

            return [
              {
                label: 'Factory Reset',

                desc: 'Reset all system configuration',

                icon: 'fa-solid fa-triangle-exclamation',

                size: 'wide',

                action: async () => {

                  await System.resetSettings();

                  return {
                    toast: {
                      type: 'warning',
                      message: 'Settings reset complete'
                    },
                    reload: true
                  };
                }
              }
            ];
          }
        }
      }
    });

    /* ── Contributes quick toggles to the home surface ──
       These execute directly on tap/Enter — they don't just populate the
       search box, since a "quick action" that requires a second step to
       actually do anything is misleading. */
    if (window.cmdk.registerContextProvider) {
      window.cmdk.registerContextProvider(async () => {
        let enabled = false;
        try {
          const system = await System.getSection('system');
          enabled = !!system?.maintenanceMode;
        } catch (_) { /* settings unavailable yet — fall through */ }

        return {
          quickActions: [
            {
              label: enabled ? 'Disable maintenance mode' : 'Enable maintenance mode',
              desc: enabled
                ? 'Site is currently in maintenance mode — tap to bring it back online'
                : 'Site is live — tap to take it offline for maintenance',
              icon: enabled ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off',
              commandBadge: '/settings maintenance',
              action: async () => {
                await System.setMaintenanceMode(!enabled);
                // Refresh the home surface so the tile immediately reflects
                // the new state rather than showing stale text until reopened.
                window.cmdk.renderHome();
                return {
                  toast: {
                    type: 'success',
                    message: enabled ? 'Maintenance disabled' : 'Maintenance enabled'
                  }
                };
              }
            },
            {
              label: 'Open settings',
              desc: 'System, security, AI, routing & more',
              icon: 'fa-solid fa-gear',
              commandBadge: '/settings open',
              autocomplete: '/settings open '
            }
          ]
        };
      });
    }
  }

  if (window.cmdk) {
    register();
  } else {

    const interval = setInterval(() => {
      if (window.cmdk) {
        clearInterval(interval);
        register();
      }
    }, 50);

  }

})();
