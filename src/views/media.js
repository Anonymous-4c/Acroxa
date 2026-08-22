/* ../src/views/media.js */

const {
  MediaHeader,
  MediaFilters,
  MediaGridPlaceholder,
  MediaModal,
  el
} = require('./lib/framework');   // adjust path

function renderMedia() {
  return el('div', { class: 'media-library' },

    // Header with upload button + search
    MediaHeader({
      title: 'Media Library',
      uploadId: 'upload-btn',
      fileInputId: 'upload-input',
      searchId: 'search-media'
    }),
      // Filters
      MediaFilters({ active: 'all' }),

    el("div", {class: "dshb-content"},

      // Grid placeholder
      MediaGridPlaceholder(),

      // Modal (always in DOM, shown/hidden via JS)
      MediaModal()
    )
  );
}

module.exports = { renderMedia };
module.exports.meta = [
  {
    path: '/acrx/media',
    render: 'renderMedia',
    title: 'Media - Acroxa',

    css: [
      '/acrx/assets/css/ad-media.css',
      '/acrx/assets/css/ad-media-player.css',
      '/acrx/assets/css/ad-ds.css',
      '/acrx/assets/css/ad-st.css',
    ],

    js: [
      '/acrx/assets/js/media.js',
    ],

    layout: 'blank',
  },
];
