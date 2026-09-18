const { PageWrapper, MainHeader, MainContent, el } = require('./lib/framework');

function renderWidgets() {
  return PageWrapper({ className: 'acrx-dshb-wr' },
    MainHeader({
      title: 'Widget Styling',
      actions: [
        { class: 'btn ghost', title: 'Reset', icon: 'rotate', attrs: { id: 'wdg-reset-btn' } },
        { class: 'btn accent', title: 'Save styles', icon: 'floppy-disk', attrs: { id: 'wdg-save-btn' } },
      ]
    }),
    MainContent(
      el('div', { class: 'wdg-sync-note', id: 'wdg-sync-note' }, 'Loading active layout…'),
      el('div', { class: 'wdg-studio-root' },
        el('div', { class: 'wdg-studio-cats', id: 'wdg-cats', role: 'tablist', 'aria-label': 'Widget categories' }),
        el('div', { class: 'wdg-studio-main' },
          el('div', { class: 'wdg-studio-panel', id: 'wdg-panel' }),
          el('div', { class: 'wdg-studio-panel' },
            el('h3', {}, 'Live preview'),
            el('div', { class: 'wdg-preview-grid', id: 'wdg-preview' })
          ),
          el('div', { class: 'wdg-studio-panel' },
            el('h3', {}, 'Custom CSS'),
            el('p', { class: 'wdg-sync-note' }, 'Applies globally after save. Keep selectors scoped with .acrx- where possible.'),
            el('textarea', { id: 'wdg-custom-css', class: 'insp-textarea', rows: '6', placeholder: '.acrx-table { /* … */ }' })
          )
        )
      )
    )
  );
}

module.exports = { renderWidgets };
module.exports.meta = [{
  path: '/acrx/layouts/widgets',
  title: 'Widget Styling - Acroxa',
  render: 'renderWidgets',
  css: [
    '/acrx/assets/css/ad-st.css',
    '/acrx/assets/css/ad-components.css',
  ],
  js: [
    '/acrx/assets/js/system/_shared.js',
    '/acrx/assets/js/widget-styling.js',
  ],
  layout: 'full'
}];



