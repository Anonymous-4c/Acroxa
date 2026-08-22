'use strict';

/**
 * Redesigned Menus Management UI Layer
 * Acroxa CMS
 *
 * UI-only architecture.
 * No business logic.
 * No API wiring.
 * No hydration logic.
 */

const {
  el,
  icon,
  Toggle,
  CustomDropdown,
  MainHeader,
  PageWrapper,
  MainContent,
} = require('./lib/framework');

/* ───────────────────────────────────────────── */
/* HEADER                                       */
/* ───────────────────────────────────────────── */

function renderHeaderToolbar() {
  return MainHeader({
    title: 'Navigation Builder',

    actions: [
      {
        id: 'mn-btn-create',
        icon: icon('plus'),
        title: 'Create Menu',
        class: 'btn primary',
      },

      {
        id: 'mn-btn-save-all',
        icon: icon('floppy-disk'),
        title: 'Save Changes',
        class: 'btn secondary',
      },

      {
        id: 'mn-btn-preview',
        icon: icon('eye'),
        title: 'Preview',
        class: 'btn ghost',
      },
    ],
  });
}

/* ───────────────────────────────────────────── */
/* SIDEBAR                                      */
/* ───────────────────────────────────────────── */

function renderSidebar() {
  return el(
    'aside',
    {
      class: 'mn-sidebar',
      id: 'mn-sidebar',
    },

    el(
      'div',
      { class: 'mn-sidebar__top' },

      el(
        'div',
        { class: 'mn-sidebar__search' },
        icon('magnifying-glass'),
        el('input', {
          type: 'text',
          id: 'mn-search-menus',
          class: 'mn-input',
          placeholder: 'Search menus...',
          autocomplete: 'off',
        })
      ),
    ),

    el(
      'div',
      {
        class: 'mn-menu-cards',
        id: 'mn-menu-cards',
      },

      renderMenuCardSkeleton(),
      renderMenuCardSkeleton(),
      renderMenuCardSkeleton()
    )
  );
}

function renderMenuCardSkeleton() {
  return el('div', {
    class: 'mn-menu-card mn-menu-card--skeleton',
  });
}

function renderMenuCardTemplate() {
  return el(
    'div',
    {
      class: 'mn-menu-card {activeClass}',
      'data-menu-id': '{id}',
      tabindex: '0',
      role: 'button',
    },

    el(
      'div',
      { class: 'mn-menu-card__top' },

      el(
        'div',
        { class: 'mn-menu-card__titleWrap' },

        el(
          'span',
          { class: 'mn-menu-card__icon' },
          icon('bars')
        ),

        el(
          'div',
          { class: 'mn-menu-card__info' },

          el(
            'span',
            { class: 'mn-menu-card__title' },
            '{name}'
          ),

          el(
            'span',
            { class: 'mn-menu-card__meta' },
            '{count} items'
          )
        )
      ),

      el(
        'button',
        {
          class: 'mn-icon-btn',
          'data-action': 'menu-options',
          'data-menu-id': '{id}',
        },
        icon('ellipsis')
      )
    ),

    el(
      'div',
      { class: 'mn-menu-card__slots' },
      '{slotBadges}'
    )
  );
}

/* ───────────────────────────────────────────── */
/* MAIN CANVAS                                  */
/* ───────────────────────────────────────────── */

function renderCanvas() {
  return el(
    'section',
    {
      class: 'mn-canvas',
      id: 'mn-canvas',
    },

    renderCanvasToolbar(),

    renderCanvasEmptyState(),

    renderCanvasTree()
  );
}

function renderCanvasToolbar() {
  return el(
    'div',
    { class: 'mn-canvas-toolbar' },

    el(
      'div',
      { class: 'mn-canvas-toolbar__left' },

      el(
        'button',
        {
          id: 'mn-btn-add-item',
          class: 'acr-btn acr-btn--primary',
        },
        icon('plus'),
        ' Add Item'
      ),

      el(
        'button',
        {
          id: 'mn-btn-expand-all',
          class: 'acr-btn acr-btn--ghost',
        },
        icon('square-plus'),
        ' Expand'
      ),

      el(
        'button',
        {
          id: 'mn-btn-collapse-all',
          class: 'acr-btn acr-btn--ghost',
        },
        icon('square-minus'),
        ' Collapse'
      )
    ),

    el(
      'div',
      { class: 'mn-canvas-toolbar__right' },

      CustomDropdown({
        id: 'mn-view-mode',
        searchable: false,
        label: 'View Mode',
        items: [
          {
            label: 'Tree View',
            value: 'tree',
          },
          {
            label: 'Compact View',
            value: 'compact',
          },
          {
            label: 'Structure View',
            value: 'structure',
          },
        ],
      }),

      CustomDropdown({
        id: 'mn-slot-selector',
        multi: true,
        searchable: true,
        clearable: true,
        label: 'Assign Slots',
        items: [],
      })
    )
  );
}

function renderCanvasEmptyState() {
  return el(
    'div',
    {
      class: 'mn-canvas-empty',
      id: 'mn-canvas-empty',
    },

    el(
      'div',
      { class: 'mn-canvas-empty__icon' },
      icon('diagram-project')
    ),

    el(
      'h2',
      { class: 'mn-canvas-empty__title' },
      'Build Your Navigation'
    ),

    el(
      'p',
      { class: 'mn-canvas-empty__desc' },
      'Create menus, drag items, and organize your site architecture visually.'
    ),

    el(
      'div',
      { class: 'mn-canvas-empty__actions' },

      el(
        'button',
        {
          id: 'mn-btn-empty-create',
          class: 'acr-btn acr-btn--primary',
        },
        icon('plus'),
        ' Create Menu'
      ),

      el(
        'button',
        {
          id: 'mn-btn-empty-import',
          class: 'acr-btn acr-btn--ghost',
        },
        icon('upload'),
        ' Import'
      )
    )
  );
}

function renderCanvasTree() {
  return el(
    'div',
    {
      class: 'mn-tree-wrap',
      id: 'mn-tree-wrap',
    },

    el(
      'div',
      {
        class: 'mn-tree',
        id: 'mn-tree',
        'data-drop-zone': 'tree',
      }
    ),
    
  );
}

function renderTreeNodeTemplate() {
  return el(
    'div',
    {
      class: 'mn-node',
      'data-node-id': '{id}',
      draggable: 'true',
    },

    el(
      'div',
      { class: 'mn-node__line' }
    ),

    el(
      'div',
      { class: 'mn-node__card' },

      el(
        'div',
        { class: 'mn-node__drag' },
        icon('grip-vertical')
      ),

      el(
        'div',
        { class: 'mn-node__content' },

        el(
          'div',
          { class: 'mn-node__top' },

          el(
            'span',
            { class: 'mn-node__label' },
            '{label}'
          ),

          el(
            'div',
            { class: 'mn-node__chips' },
            '{chips}'
          )
        ),

        el(
          'div',
          { class: 'mn-node__bottom' },

          el(
            'span',
            { class: 'mn-node__url' },
            '{url}'
          )
        )
      ),

      el(
        'div',
        { class: 'mn-node__actions' },

        el(
          'button',
          {
            class: 'mn-icon-btn',
            'data-action': 'add-child',
          },
          icon('plus')
        ),

        el(
          'button',
          {
            class: 'mn-icon-btn',
            'data-action': 'duplicate',
          },
          icon('clone')
        ),

        el(
          'button',
          {
            class: 'mn-icon-btn mn-icon-btn--danger',
            'data-action': 'delete',
          },
          icon('trash')
        )
      )
    )
  );
}

/* ───────────────────────────────────────────── */
/* INSPECTOR                                    */
/* ───────────────────────────────────────────── */

function renderInspector() {
  return el(
    'aside',
    {
      class: 'mn-inspector',
      id: 'mn-inspector',
    },

    el(
      'div',
      { class: 'mn-inspector__header' },

      el(
        'span',
        { class: 'mn-inspector__title' },
        icon('sliders'),
        ' Item Settings'
      )
    ),

    el(
      'div',
      { class: 'mn-inspector__body' },

      renderInspectorField({
        label: 'Navigation Label',
        input: el('input', {
          type: 'text',
          id: 'mn-item-label',
          class: 'acr-input',
          placeholder: 'Menu label...',
        }),
      }),

      renderInspectorField({
        label: 'URL',
        input: el('input', {
          type: 'text',
          id: 'mn-item-url',
          class: 'acr-input',
          placeholder: '/path or https://',
        }),
      }),

      renderInspectorField({
        label: 'Item Type',
        input: CustomDropdown({
          id: 'mn-item-type',
          searchable: false,
          placeholder: 'Choose type',
          items: [
            { label: 'Page', value: 'page' },
            { label: 'Post', value: 'post' },
            { label: 'Custom URL', value: 'custom' },
            { label: 'Category', value: 'category' },
          ],
        }),
      }),

      renderInspectorField({
        label: 'Target',
        input: CustomDropdown({
          id: 'mn-item-target',
          searchable: false,
          placeholder: 'Target',
          items: [
            { label: 'Same Window', value: '_self' },
            { label: 'New Tab', value: '_blank' },
          ],
        }),
      }),

      renderInspectorField({
        label: 'Icon',
        input: el('input', {
          type: 'text',
          id: 'mn-item-icon',
          class: 'acr-input',
          placeholder: 'fa-duotone fa-star',
        }),
      }),

      renderInspectorField({
        label: 'Visibility',
        input: CustomDropdown({
          id: 'mn-item-visibility',
          searchable: false,
          placeholder: 'Visibility',
          items: [
            { label: 'Public', value: 'public' },
            { label: 'Logged In', value: 'auth' },
            { label: 'Admins', value: 'admin' },
          ],
        }),
      }),

      el(
        'div',
        { class: 'mn-toggle-list' },

        Toggle({
          id: 'mn-toggle-nofollow',
          label: 'nofollow',
        }),

        Toggle({
          id: 'mn-toggle-disabled',
          label: 'Disabled',
        }),

        Toggle({
          id: 'mn-toggle-highlighted',
          label: 'Highlighted',
        })
      )
    )
  );
}

function renderInspectorField({ label, input }) {
  return el(
    'div',
    { class: 'mn-field' },

    el(
      'label',
      { class: 'mn-field__label' },
      label
    ),

    input
  );
}

/* ───────────────────────────────────────────── */
/* CMS DRAWER                                   */
/* ───────────────────────────────────────────── */

function renderCmsDrawer() {
  return el("div", {class : "mn-drawer-overlay"}, el(
    'div',
    {
      class: 'mn-drawer',
      id: 'mn-drawer',
    },

    el(
      'div',
      { class: 'mn-drawer__header' },

      el(
        'span',
        { class: 'mn-drawer__title' },
        icon('database'),
        ' Content Library'
      ),

      el(
        'button',
        {
          id: 'mn-btn-close-drawer',
          class: 'mn-icon-btn',
        },
        icon('xmark')
      )
    ),

    el(
      'div',
      { class: 'mn-drawer__search' },
      icon('magnifying-glass'),
      el('input', {
        type: 'text',
        id: 'mn-drawer-search',
        class: 'mn-input',
        placeholder: 'Search content...',
      })
    ),

    el(
      'div',
      {
        class: 'mn-drawer-tabs',
        role: 'tablist',
      },

      renderDrawerTab('posts', 'Posts', true),
      renderDrawerTab('pages', 'Pages'),
      renderDrawerTab('categories', 'Categories'),
      renderDrawerTab('custom', 'Custom'),
      renderDrawerTab('dynamic', 'Dynamic')
    ),

    el(
      'div',
      {
        class: 'mn-drawer-panels',
        id: 'mn-drawer-panels',
      },

      el('div', {
        class: 'mn-drawer-panel mn-drawer-panel--active',
        id: 'mn-panel-posts',
      }),

      el('div', {
        class: 'mn-drawer-panel',
        id: 'mn-panel-pages',
      }),

      el('div', {
        class: 'mn-drawer-panel',
        id: 'mn-panel-categories',
      }),

      renderCustomPanel(),
      renderDynamicPanel()
    )
  ))

}

function renderDrawerTab(id, label, active = false) {
  return el(
    'button',
    {
      class: `mn-drawer-tab ${active ? 'mn-drawer-tab--active' : ''}`,
      'data-tab': id,
      role: 'tab',
    },
    label
  );
}

function renderCustomPanel() {
  return el(
    'div',
    {
      class: 'mn-drawer-panel',
      id: 'mn-panel-custom',
    },

    renderInspectorField({
      label: 'Label',
      input: el('input', {
        type: 'text',
        id: 'mn-custom-label',
        class: 'acr-input',
      }),
    }),

    renderInspectorField({
      label: 'URL',
      input: el('input', {
        type: 'text',
        id: 'mn-custom-url',
        class: 'acr-input',
      }),
    }),

    el(
      'button',
      {
        id: 'mn-btn-add-custom-item',
        class: 'acr-btn acr-btn--primary',
      },
      icon('plus'),
      ' Add Custom Item'
    )
  );
}

function renderDynamicPanel() {
  return el(
    'div',
    {
      class: 'mn-drawer-panel',
      id: 'mn-panel-dynamic',
    },
    el('div', { class: 'mn-drawer-panel__empty' },
      el('h3', {}, 'Dynamic Content'),
      el('p', {}, 'Dynamic menu sources will be available here soon.')
    )
  );
}

/* ───────────────────────────────────────────── */
/* PREVIEW                                      */
/* ───────────────────────────────────────────── */

function renderPreviewDock() {
  return el(
    'div',
    {
      class: 'mn-preview-dock',
      id: 'mn-preview-dock',
    },

    el(
      'div',
      { class: 'mn-preview-dock__header' },

      el(
        'span',
        { class: 'mn-preview-dock__title' },
        icon('eye'),
        ' Live Preview'
      ),

      el(
        'div',
        { class: 'mn-preview-dock__devices' },

        el(
          'button',
          {
            class: 'mn-device-btn mn-device-btn--active',
            'data-device': 'desktop',
          },
          icon('desktop')
        ),

        el(
          'button',
          {
            class: 'mn-device-btn',
            'data-device': 'tablet',
          },
          icon('tablet-screen-button')
        ),

        el(
          'button',
          {
            class: 'mn-device-btn',
            'data-device': 'mobile',
          },
          icon('mobile-screen-button')
        )
      )
    ),

    el(
      'div',
      {
        class: 'mn-preview-dock__viewport',
        id: 'mn-preview-viewport',
      },

      el('nav', {
        class: 'mn-preview-nav',
        id: 'mn-preview-nav',
      })
    )
  );
}

/* ───────────────────────────────────────────── */
/* MODALS                                       */
/* ───────────────────────────────────────────── */

function renderCreateModal() {
  return el(
    'div',
    {
      class: 'acr-modal-overlay',
      id: 'mn-modal-create',
    },

    el(
      'div',
      { class: 'acr-modal' },

      el(
        'div',
        { class: 'acr-modal__header' },

        el(
          'h2',
          { class: 'acr-modal__title' },
          icon('plus-circle'),
          ' Create Navigation'
        ),

        el(
          'button',
          {
            id: 'mn-modal-close',
            class: 'acr-modal__close',
          },
          icon('xmark')
        )
      ),

      el(
        'div',
        { class: 'acr-modal__body' },

        renderInspectorField({
          label: 'Menu Name',
          input: el('input', {
            type: 'text',
            id: 'mn-create-name',
            class: 'acr-input',
            placeholder: 'Main Navigation',
          }),
        }),

        renderInspectorField({
          label: 'Default Slot',
          input: CustomDropdown({
            id: 'mn-create-slot',
            searchable: true,
            placeholder: 'Choose slot',
            items: [],
          }),
        })
      ),

      el(
        'div',
        { class: 'acr-modal__footer' },

        el(
          'button',
          {
            id: 'mn-btn-cancel-create',
            class: 'acr-btn acr-btn--ghost',
          },
          'Cancel'
        ),

        el(
          'button',
          {
            id: 'mn-btn-confirm-create',
            class: 'acr-btn acr-btn--primary',
          },
          icon('check'),
          ' Create'
        )
      )
    )
  );
}

/* ───────────────────────────────────────────── */
/* MAIN PAGE                                    */
/* ───────────────────────────────────────────── */

function MenusPage(req, res) {
  return PageWrapper(
    {
      className: 'mn-app',
    },

    renderHeaderToolbar(),

    MainContent(
      el(
        'div',
        {
          class: 'mn-layout',
          id: 'mn-layout',
        },

        renderSidebar(),

        el(
          'div',
          {
            class: 'mn-main',
          },

          renderCanvas()
        ),

        renderInspector()
      ),
      
      el(
        'div',
        {
          id: 'mn-drawer-overlay',
          class: 'mn-drawer-overlay',
        }
      ),

      renderCmsDrawer(),

      renderCreateModal()
    ),
  );
}

/* ───────────────────────────────────────────── */
/* EXPORTS                                      */
/* ───────────────────────────────────────────── */

module.exports = {
  MenusPage,
  renderTreeNodeTemplate,
  renderMenuCardTemplate,
};

module.exports.meta = [
  {
    path: '/acrx/layouts/menus',
    render: 'MenusPage',
    title: 'Navigation Builder - Acroxa',

    css: [
      '/acrx/assets/css/ad-st.css',
      '/acrx/assets/css/ad-ap.css',
      '/acrx/assets/css/ad-menu.css',
    ],

    js: [
      '/acrx/assets/js/menus.js',
    ],

    layout: 'blank',
  },
];
