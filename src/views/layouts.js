const {
  PageWrapper,
  MainHeader,
  MainContent,
  el,
  icon
} = require('./lib/framework');

const Layout = require('../core/layoutHelpers');
const fs = require('fs');
const path = require('path');

function renderLayouts() {

  const active = Layout.getActiveLayout();

  const layoutsDir = path.join(__dirname, '../layouts');

  const layouts = fs.readdirSync(layoutsDir)
    .map((id) => {
      const mp = path.join(layoutsDir, id, 'meta.json');
      if (!fs.existsSync(mp)) return null;

      const m = JSON.parse(fs.readFileSync(mp, 'utf-8'));

      return {
        id,
        name: m.name,
        version: m.version,
        description: m.description,
        author: m.author?.name || 'Unknown',
        preview: "/layouts/"+ id + m.preview || "/assets/default-preview.png"
      };
    })
    .filter(Boolean);

  return PageWrapper({ className: 'acrx-dshb-wr' },

    // ================= HEADER =================
    MainHeader({
      title: 'Layouts',
      actions: [
        { class: 'btn accent', title: 'Refresh', icon: 'rotate' },
        { class: 'btn ghost',  title: 'Import',  icon: 'upload' }
      ]
    }),

    // ================= CONTENT =================
    MainContent(

      // ACTIVE LAYOUT BANNER (like a dashboard widget)
      el('div', { class: 'active-layout-banner' },

        el('div', { class: 'alb-left' },
          el('h2', {}, 'Active Layout'),
          el('p', {}, active || 'No layout selected')
        ),

        el('div', { class: 'alb-right' },
          el('button', {
            class: 'btn ghost',
            'data-action': 'preview-active'
          }, icon('eye')),

          el('button', {
            class: 'btn accent',
            'data-action': 'reload-active'
          }, icon('rotate'))
        )
      ),

      // ================= GRID =================
      el('div', { class: 'layout-grid' },

        ...layouts.map(l =>
          el('div', { class: 'layout-card' },

            // IMAGE
            el('div', { class: 'layout-image' },
              el('img', {
                src: l.preview,
                alt: l.name
              })
            ),

            el('div', {class: 'layout-details'},
                          // INFO
            el('div', { class: 'layout-info' },

              el('div', { class: 'layout-title' },

                el('h3', {}, l.name),

                active === l.id
                  ? el('span', { class: 'badge active' }, 'Active')
                  : null
              ),

              el('p', { class: 'layout-desc' }, l.description || ''),

              el('div', { class: 'layout-meta' },
                el('span', {}, `v${l.version}`),
                el('span', {}, l.author)
              )
            ),

            // ACTIONS
            el('div', { class: 'layout-actions' },

              el('button', {
                class: 'btn ghost',
                'data-preview': l.id
              }, icon('eye') + el('span', { class: 'label' },' Preview')),
              el('button', {
                class: 'btn ghost',
                'data-info': l.id
              }, icon('circle-info')),
              el('button', {
                class: active === l.id ? 'btn disabled' : 'btn accent',
                'data-activate': l.id,
                disabled: active === l.id
              }, active === l.id ? icon('toggle-large-on') + ' Active' : icon('toggle-large-off') + el('span', { class: 'label' },' Activate'))
            )
            )
          )
        )
      )
    )
  );
}

module.exports = { renderLayouts };
module.exports.meta =[{
      "path": `/acrx/layouts`,
      "title": "Layouts - Acroxa",

      "render": "renderLayouts",

      "css": [
        "/acrx/assets/css/ad-st.css",
        "/acrx/assets/css/ad-layout.css",
      ],

      "js": [
        "/acrx/assets/js/system/_shared.js",
        "/acrx/assets/js/layout.js",
      ],
      "layout" : "full"
    }
  ]