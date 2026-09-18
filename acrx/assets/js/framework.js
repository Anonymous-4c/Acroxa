// public/acrx/assets/js/framework.js — Client-side framework (mirrors server-side framework.js)
'use strict';

(function FrameworkModule() {
  'use strict';

  // ─── Core DOM Builder ──────────────────────────────────────────────
  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
    'circle', 'line', 'path', 'polygon', 'polyline', 'rect'
  ]);

  // FIX: previously these were no-ops ('&' -> '&') which broke rendering
  // parity with the server and left attribute injection unescaped.
  // Now mirrors src/views/lib/framework.js exactly.
  function escapeHTML(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(str = '') {
    return String(str).replace(/"/g, '&quot;');
  }

  function el(tag, attrs = {}, ...children) {
    tag = String(tag).toLowerCase().trim();
    let html = `<${tag}`;
    const toKebab = str => str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const normalizeAttr = key => {
      if (key.startsWith('data') && key.length > 4 && /[A-Z]/.test(key[4])) {
        return 'data-' + toKebab(key.slice(4));
      }
      if (key.startsWith('aria') && key.length > 4 && /[A-Z]/.test(key[4])) {
        return 'aria-' + toKebab(key.slice(4));
      }
      if (/[A-Z]/.test(key)) return toKebab(key);
      return key;
    };
    for (const [rawKey, value] of Object.entries(attrs)) {
      const key = normalizeAttr(rawKey);
      if (value === true) html += ` ${key}`;
      else if (value != null && value !== false) html += ` ${key}="${escapeAttr(value)}"`;
    }
    const isVoid = VOID_ELEMENTS.has(tag);
    if (isVoid) return html + ' />';
    html += '>';
    for (const child of children) {
      if (child == null) continue;
      html += (typeof child === 'string' || typeof child === 'number') ? child : String(child);
    }
    html += `</${tag}>`;
    return html;
  }

  // ─── Shorthand Elements ────────────────────────────────────────────
  function div(attrs = {}, ...children) { return el('div', attrs, ...children); }
  function span(attrs = {}, ...children) { return el('span', attrs, ...children); }
  function p(attrs = {}, ...children) { return el('p', attrs, ...children); }
  function h1(attrs = {}, ...children) { return el('h1', attrs, ...children); }
  function h2(attrs = {}, ...children) { return el('h2', attrs, ...children); }
  function h3(attrs = {}, ...children) { return el('h3', attrs, ...children); }
  function h4(attrs = {}, ...children) { return el('h4', attrs, ...children); }
  function h5(attrs = {}, ...children) { return el('h5', attrs, ...children); }
  function h6(attrs = {}, ...children) { return el('h6', attrs, ...children); }
  function section(attrs = {}, ...children) { return el('section', attrs, ...children); }
  function article(attrs = {}, ...children) { return el('article', attrs, ...children); }
  function header(attrs = {}, ...children) { return el('header', attrs, ...children); }
  function footer(attrs = {}, ...children) { return el('footer', attrs, ...children); }
  function nav(attrs = {}, ...children) { return el('nav', attrs, ...children); }
  function aside(attrs = {}, ...children) { return el('aside', attrs, ...children); }
  function main(attrs = {}, ...children) { return el('main', attrs, ...children); }
  function ul(attrs = {}, ...children) { return el('ul', attrs, ...children); }
  function ol(attrs = {}, ...children) { return el('ol', attrs, ...children); }
  function li(attrs = {}, ...children) { return el('li', attrs, ...children); }
  function table(attrs = {}, ...children) { return el('table', attrs, ...children); }
  function thead(attrs = {}, ...children) { return el('thead', attrs, ...children); }
  function tbody(attrs = {}, ...children) { return el('tbody', attrs, ...children); }
  function tr(attrs = {}, ...children) { return el('tr', attrs, ...children); }
  function th(attrs = {}, ...children) { return el('th', attrs, ...children); }
  function td(attrs = {}, ...children) { return el('td', attrs, ...children); }
  function strong(attrs = {}, ...children) { return el('strong', attrs, ...children); }
  function em(attrs = {}, ...children) { return el('em', attrs, ...children); }
  function code(attrs = {}, ...children) { return el('code', attrs, ...children); }
  function pre(attrs = {}, ...children) { return el('pre', attrs, ...children); }
  function blockquote(attrs = {}, ...children) { return el('blockquote', attrs, ...children); }
  function a(attrs = {}, ...children) { return el('a', attrs, ...children); }
  function figure(attrs = {}, ...children) { return el('figure', attrs, ...children); }
  function figcaption(attrs = {}, ...children) { return el('figcaption', attrs, ...children); }
  function hr(attrs = {}) { return el('hr', attrs); }
  function br(attrs = {}) { return el('br', attrs); }
  function sep() { return el('sep'); }
  function Input({ type = 'text', id, name, placeholder, className = '', attrs = {} }) {
    return el('input', { type, id, name: name || id, placeholder, class: className, ...attrs });
  }
  function Textarea({ id, value = '', rows = 4, placeholder = '' } = {}) {
    return el('textarea', { id, name: id, rows, placeholder, class: 'textarea-input form-input form-textarea' }, value);
  }
  function HiddenInput({ id, name, attrs = {} }) { return Input({ type: 'hidden', id, name, attrs }); }
  function FileInput({ id, multiple = false, attrs = {} }) {
    return Input({ type: 'file', id, attrs: { multiple: multiple ? true : undefined, hidden: true, ...attrs } });
  }
  function select(attrs = {}, ...children) { return el('select', attrs, ...children); }
  function option(attrs = {}, ...children) { return el('option', attrs, ...children); }
  function button(attrs = {}, ...children) { return el('button', attrs, ...children); }
  function form(attrs = {}, ...children) { return el('form', attrs, ...children); }
  function label(attrs = {}, ...children) { return el('label', attrs, ...children); }
  function fieldset(attrs = {}, ...children) { return el('fieldset', attrs, ...children); }
  function legend(attrs = {}, ...children) { return el('legend', attrs, ...children); }
  function textarea(attrs = {}, ...children) { return el('textarea', attrs, ...children); }
  function script(attrs = {}, ...children) { return el('script', attrs, ...children); }
  function style(attrs = {}, ...children) { return el('style', attrs, ...children); }
  function link(attrs = {}, ...children) { return el('link', attrs, ...children); }
  function img(attrs = {}, ...children) { return el('img', attrs, ...children); }

  // ─── Icon ──────────────────────────────────────────────────────────
  function icon(name, style = 'duotone', extraClass) {
    return el('i', { class: `fa-${style} fa-${name} ${extraClass || style}` });
  }

  function _Icon(name, style = 'duotone') {
    return el('i', { class: 'icon icon-duotone' }, icon(name, style));
  }

  // ─── Toggle ────────────────────────────────────────────────────────
  function Toggle({ id, label, checked = false, hint, disabled = false } = {}) {
    return el('div', { class: 'toggle-field form-toggle' },
      el('label', { class: 'toggle-wrap', for: id },
        el('input', { type: 'checkbox', id, name: id, class: 'toggle-input', ...(checked ? { checked: true } : {}), ...(disabled ? { disabled: true } : {}) }),
        el('span', { class: 'toggle-track' }, el('span', { class: 'toggle-thumb' })),
        el('span', { class: 'toggle-label' }, label)
      ),
      hint ? el('span', { class: 'field-hint text-muted' }, hint) : null
    );
  }

  // ─── CustomDropdown ───────────────────────────────────────────────
  function CustomDropdown({ label, items, valueAttr = 'data-value', extraClass = '', id, name, value = '' }) {
    const menuItems = items.map(item => {
      const isObj = typeof item === 'object' && item !== null;
      const lbl = isObj ? item.label : item;
      const val = isObj ? item.value : item;
      const activeAttr = value && val === value ? { 'data-active': 'true' } : {};
      return el('button', { class: 'dropdown-item', [valueAttr]: val, ...activeAttr }, lbl);
    });
    return el('div', { class: `dropdown ${extraClass}`.trim(), id: id || `dropdown-${label.toLowerCase().replace(/\s+/g, '-')}` },
      el('button', { class: 'dropdown-toggle' }, label, ' ', icon('chevron-down', 'solid')),
      el('input', { type: 'hidden', class: 'dropdown-hidden-input', name: name || id, id: id ? id + '-hidden' : undefined, value }),
      el('div', { class: 'dropdown-menu' }, el('div', { class: 'wrap-menu-dp' }, ...menuItems))
    );
  }

  // ─── Icon ──────────────────────────────────────────────────────────
  function _Icon(name, style = 'duotone') {
    return el('i', { class: 'icon icon-duotone' }, icon(name, style));
  }

  // ─── UI Components ────────────────────────────────────────────────
  function MetricCard({ icon: iconName, title, value, change, changeType = 'steady' }) {
    const changeClass = changeType === 'up' ? 'up' : changeType === 'down' ? 'down' : 'steady';
    const arrow = changeType === 'up' ? 'caret-up' : changeType === 'down' ? 'caret-down' : 'minus';
    return el('div', { class: 'metric-card' },
      el('div', { class: 'metric-icon' }, icon(iconName)),
      el('div', { class: 'card-content' },
        el('h3', {}, title),
        el('p', { class: 'metric-value' }, value),
        el('span', { class: `metric-change ${changeClass}` }, icon(arrow, 'solid'), ' ', change)
      )
    );
  }

  function ScoreCircle({ score, label, variant = '' }) {
    const extra = variant ? ` ${variant}` : '';
    return el('div', {},
      el('div', { class: `score-circle${extra}`, 'data-score': score }, el('div', { class: 'score-inner' }, score)),
      el('p', { class: 'score-label' }, label)
    );
  }

  function ScoreCard({ iconName, title, score, label, variant = '' }) {
    return el('div', { class: 'score-card' },
      el('div', { class: 'sc-icon' }, icon(iconName), el('div', { class: 'score-header' }, el('h3', {}, title))),
      el('div', { class: 'sc-content' }, ScoreCircle({ score, label, variant }))
    );
  }

  function ActionCard({ iconName, title, description, href, btnText = '' }) {
    return el('div', { class: 'action-card' },
      el('div', { class: 'action-header' }, el('div', { class: 'action-icon-wrp' }, icon(iconName))),
      el('div', { class: 'info' }, el('h3', {}, title), el('p', {}, description)),
      el('div', { class: 'action-button' }, el('a', { href, class: 'action-btn' }, btnText, ' ', icon('chevron-right')))
    );
  }

  function MainHeader({ title = 'Dashboard', actions = [] }) {
    const buttons = actions.map(a =>
      el('button', {
        class: a.class || 'btn ghost',
        dataTitle: a.title || '',
        ...(a.dataClick && { dataClick: a.dataClick }),
        ...(a.dataFocus && { dataFocus: a.dataFocus }),
        ...(a.dataToggle && { dataToggle: a.dataToggle }),
        ...(a.dataLink && { dataLink: a.dataLink }),
        ...(a.id && { id: a.id })
      }, icon(a.icon))
    );
    return el('div', { class: 'dshb-header main-head' },
      el('div', {}, el('h1', { class: 'fade-in-up' }, title)),
      el('div', { class: 'header-actions' }, ...buttons)
    );
  }

  function PostsMainContent(...children) {
    return el('div', { class: 'dshb-content' }, ...children);
  }

  function MainContent(...children) {
    return el('div', { class: 'dshb-content' }, ...children);
  }

  function PageWrapper({ className = 'acrx-dshb-wr' }, ...children) {
    return el('div', { class: className }, ...children);
  }

  function PageHeader({ title, actionText = 'Create New', actionHref = '#', actionIcon = 'add', extraClasses = '' }) {
    return el('div', { class: `main-head d-flex flex-row ${extraClasses}`.trim() },
      el('h1', {}, title),
      el('button', { class: 'p-2 button-pst', 'data-': actionHref }, icon(actionIcon, 'solid'), el('span', {}, actionText))
    );
  }

  function PaginationControls() {
    return el('div', { class: 'pg-fdpv paginator-controls' },
      el('button', { class: 'p-2 button-pst prev' }, icon('chevron-left', 'solid')),
      el('span', { class: 'page-info' }, ''),
      el('button', { class: 'p-2 button-pst next' }, icon('chevron-right', 'solid'))
    );
  }

  function StatusTabs({ active = 'all' } = {}) {
    const items = [
      { id: 'all', label: 'All' }, { id: 'published', label: 'Published' },
      { id: 'draft', label: 'Drafts' }, { id: 'trash', label: 'Trash' }
    ];
    return el('div', { class: 'links' },
      ...items.flatMap((item, i) => [
        el('div', { class: `pages ${item.id === active ? 'active' : ''}`, 'data-show-sid': item.id }, item.label),
        i < items.length - 1 ? el('sep') : null
      ].filter(Boolean))
    );
  }

  function PostsPerPageDropdown({ current = 10, name = 'postsPerPage' } = {}) {
    const options = [5,10,20,30,40,50,75,100,150,200,250];
    return el('div', { class: 'dropdown num-exp pp-dropdown' },
      el('button', { type: 'button', class: 'dropdown-toggle pp-dropdown-toggle' },
        el('span', { class: 'dull' }, 'Posts'), el('span', { class: 'p-n-m' }, current), icon('chevron-down', 'solid')
      ),
      el('input', { type: 'hidden', name: name, id: name, class: 'dropdown-hidden-input', value: current }),
      el('div', { class: 'dropdown-menu pp-dropdown-menu' },
        el('div', { class: 'wrap-menu-dp' },
          ...options.map(val => el('button', { class: 'dropdown-item pp-dropdown-item', 'data-value': val, ...(val === current ? { 'data-active': 'true' } : {}) }, val))
        )
      )
    );
  }

  // ─── Settings Form Primitives ──────────────────────────────────────
  function Field({ label, forId, hint } = {}, ...inputs) {
    return el('div', { class: 'field form-field' },
      label ? el('label', { class: 'field-label', for: forId || '' }, label) : null,
      ...inputs,
      hint ? el('span', { class: 'field-hint text-muted' }, hint) : null
    );
  }

  function Section({ title, description, icon: [style="duotone", name] } = {}, ...children) {
    return el('div', { class: 'settings-section card-section' },
      el('div', { class: 'section-head' },
        name ? el('span', { class: 'section-icon icon' }, _Icon(name, style)) : null,
        el('div', { class: 'section-head-content' },
          el('h2', { class: 'section-title' }, title),
          description ? el('p', { class: 'section-desc text-muted' }, description) : null
        )
      ),
      el('div', { class: 'section-body' }, ...children)
    );
  }

  function FieldGrid(...fields) { return el('div', { class: 'field-grid form-grid' }, ...fields); }

  function NumberInput({ id, value = 0, min, max, step = 1, suffix = '' } = {}) {
    return el('div', { class: 'number-input-wrap input-with-suffix' },
      el('input', { type: 'number', id, name: id, value, class: 'number-input form-input', ...(min != null ? { min } : {}), ...(max != null ? { max } : {}), step }),
      suffix ? el('span', { class: 'input-suffix text-muted' }, suffix) : null
    );
  }

  function Dropdown({ id, options = [], value = '', extraClass = '' } = {}) {
    const currentOpt = options.find(o => (typeof o === 'object' ? o.value : o) === value);
    const currentLabel = currentOpt ? (typeof currentOpt === 'object' ? currentOpt.label : currentOpt) : (options[0] ? (typeof options[0] === 'object' ? options[0].label : options[0]) : 'Select…');
    return el('div', { class: 'dropdown-field-wrap', 'data-dropdown-id': id },
      CustomDropdown({ label: currentLabel, items: options, valueAttr: 'data-value', extraClass: `settings-dropdown ${extraClass}`.trim(), id: `dd-${id}`, name: id, value })
    );
  }

  function SaveBar({ id = 'save-btn' } = {}) {
    return el('div', { class: 'save-bar form-actions' },
      el('button', { id, class: 'btn-save btn ghost btn-lg' }, _Icon('floppy-disk', 'solid'), el('span', {}, 'Save Changes'))
    );
  }

  function Badge(text, variant = 'default') { return el('span', { class: `badge badge-${variant} badge-pill` }, text); }

  function Textarea({ id, value = '', rows = 4, placeholder = '' } = {}) {
    return el('textarea', { id, name: id, rows, placeholder, class: 'textarea-input form-input form-textarea' }, value);
  }

  function ColorPicker({ id, value = '#007bff', label } = {}) {
    return el('div', { class: 'color-field form-color-picker' },
      label ? el('label', { class: 'field-label', for: id }, label) : null,
      el('div', { class: 'color-input-wrap' },
        el('input', { type: 'color', id, name: id, value, class: 'color-input' }),
        el('input', { type: 'text', id: `${id}-hex`, class: 'color-hex-input form-input', value, maxlength: '7', placeholder: '#000000' })
      )
    );
  }

  function DangerZone(...children) {
    return el('div', { class: 'danger-zone danger-card' },
      el('div', { class: 'danger-header' }, _Icon('triangle-exclamation', 'solid'), el('h3', { class: 'danger-title' }, 'Danger Zone')), ...children
    );
  }

  function Callout({ type = 'info', title, message } = {}) {
    const icons = { info: 'circle-info', warning: 'triangle-exclamation', success: 'circle-check', error: 'circle-xmark' };
    return el('div', { class: `callout callout-${type} callout-box` },
      _Icon(icons[type] || 'circle-info'),
      el('div', { class: 'callout-content' }, title ? el('strong', { class: 'callout-title' }, title) : null, message ? el('p', { class: 'callout-message' }, message) : null)
    );
  }

  // ─── Media Components ──────────────────────────────────────────────
  function MediaFilters({ active = 'all' } = {}) {
    const filters = [
      { value: 'all',    label: 'All', icon: ''       },
      { value: 'image',  label: 'Images'    },
      { value: 'video',  label: 'Videos'    },
      { value: 'audio',  label: 'Audio'     },
      { value: 'doc',    label: 'Documents' },
    ];
    return el('div', { class: 'media-filters d-flex fl-wrap' },
      ...filters.map(f =>
        el('button', {
          'data-filter': f.value,
          class: f.value === active ? 'active' : ''
        }, f.label)
      )
    );
  }

  function MediaGridPlaceholder() {
    return el('div', { class: 'media-grid', id: 'media-grid' },
      '<!-- Media items will be injected here by JavaScript -->'
    );
  }

  function MediaHeader({
    title = 'Media Library',
    uploadId = 'upload-btn',
    fileInputId = 'upload-input',
    searchId = 'search-media',
  } = {}) {
    return el('div', { class: 'media-header main-head' },
      el('h1', {}, title),
      el('div', { class: 'media-actions' },
        el('button', {
          id: uploadId,
          class: 'btn-primary',
          dataTitle: "Upload Files"
        }, icon('circle-plus')),
        FileInput({ id: fileInputId, multiple: true }),
        Input({ id: searchId, placeholder: 'Search files...', className: '' })
      )
    );
  }

  function MediaModal() {
    return el('div', { class: 'media-modal', id: 'media-modal' },
      el('div', { class: 'modal-content' },
        el('span', { class: 'close-modal' }, '×'),
        el('div', { class: 'modal-preview', id: 'modal-preview-container' },
          el('img',  { id: 'modal-preview-img',  src: '', alt: '', hidden: true }),
          el('video', { id: 'modal-preview-video', controls: true, hidden: true }),
          el('div', { id: 'modal-preview-icon', class: 'file-icon', hidden: true },
            icon('file', 'regular')
          )
        ),
        el('div', { class: 'modal-info' },
          el('h3', { id: 'modal-filename' }),
          el('p', {}, el('strong', {}, 'Type:'), ' ', el('span', { id: 'modal-type' })),
          el('p', {}, el('strong', {}, 'Size:'), ' ', el('span', { id: 'modal-size' })),
          el('p', {}, el('strong', {}, 'Modified:'), ' ', el('span', { id: 'modal-modified' })),
          el('p', {}, el('strong', {}, 'URL:'), ' ',
            el('a', { id: 'modal-url', href: '#', target: '_blank' }, 'Open File')
          )
        ),
        el('div', { class: 'modal-actions' },
          el('button', { id: 'copy-link', class: 'btn-secondary' },
            icon('link', 'regular'), ' Copy Link'
          ),
          el('button', { id: 'download-file', class: 'btn-secondary' },
            icon('download', 'regular'), ' Download'
          ),
          el('button', { id: 'rename-file', class: 'btn-secondary' },
            icon('pen-to-square', 'regular'), ' Rename'
          ),
          el('button', { id: 'delete-file', class: 'btn-danger' },
            icon('trash', 'regular'), ' Delete'
          )
        )
      )
    );
  }

  // ─── IconDropdown ──────────────────────────────────────────────────
  function IconDropdown({
    label,
    items = [],
    valueAttr = 'data-value',
    extraClass = '',
    id,
    name
  }) {
    const menuItems = items.map(item => {
      const { label, value, icon: iconName, iconStyle = 'duotone', image } = item;
      return el('button', {
        class: 'dropdown-item',
        [valueAttr]: value
      },
        el('div', { class: 'dropdown-item-inner d-flex flex-row al-center' },
          image
            ? el('img', { src: image, alt: label, class: 'dropdown-item-image' })
            : (
                iconName
                  ? icon(iconName, iconStyle, 'dropdown-item-icon')
                  : null
              ),
          el('span', { class: 'dropdown-item-label' }, label)
        )
      );
    });
    return el('div', {
      class: `IconDropdown dropdown ${extraClass}`.trim(),
      id: id || `icon-dropdown-${Date.now()}`
    },
      el('button', {
        id: `${id}-action`,
        class: 'icon-dropdown-action dropdown-action'
      }, label),
      el('button', {
        id: `${id}-toggle`,
        class: 'icon-dropdown-toggle dropdown-toggle'
      }, icon('chevron-down', 'solid')),
      el('input', {
        type: 'hidden',
        name: id,
        id: id,
        class: 'dropdown-hidden-input',
        value: items[0]?.value || ''
      }),
      el('div', { class: 'dropdown-menu' },
        el('div', { class: 'wrap-menu-dp' }, ...menuItems)
      )
    );
  }

  // ─── SplitButtonDropdown ───────────────────────────────────────────
  function SplitButtonDropdown({
    id,
    label,
    items = [],
    valueAttr = 'data-value',
    extraClass = ''
  }) {
    const menuItems = items.map(item =>
      el('button', {
        class: 'dropdown-item',
        [valueAttr]: item.value
      },
        item.icon
          ? icon(item.icon, 'duotone', 'dropdown-item-icon')
          : null,
        el('span', {}, item.label)
      )
    );
    return el('div', {
      id,
      class: `split-dropdown ${extraClass}`.trim()
    },
      el('button', {
        id: `${id}-action`,
        class: 'split-dropdown-action dropdown-action'
      }, label),
      el('button', {
        id: `${id}-toggle`,
        class: 'split-dropdown-toggle dropdown-toggle'
      }, icon('chevron-down', 'solid')),
      el('input', {
        type: 'hidden',
        name: id,
        id: id,
        class: 'dropdown-hidden-input',
        value: items[0]?.value || ''
      }),
      el('div', { class: 'dropdown-menu' },
        el('div', { class: 'wrap-menu-dp' }, ...menuItems)
      )
    );
  }

  // ─── CategoryFilter ────────────────────────────────────────────────
  function CategoryFilter() {
    const categories = [
      'all', 'news', 'tutorials', 'updates', 'ai', 'cms', 'design',
      'development', 'security', 'performance', 'seo', 'plugins',
      'themes', 'marketing', 'business', 'other'
    ];
    return CustomDropdown({
      label: 'Category',
      items: categories.map(cat => ({
        label: cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1),
        value: cat
      })),
      valueAttr: 'data-cat',
      extraClass: 'category-filter',
      id: 'category-filter'
    });
  }

  // ─── PostsTableSkeleton ───────────────────────────────────────────
  function PostsTableSkeleton() {
    return el('div', { class: 'posts-ttc-wrap acrx-ttc-wrap' },
      el('div', { class: 'posts-ttc acrx-ttc' },
        el('div', { class: 'ttc-ph' },
          el('div', { class: 'box-sel' },
            el('div', { class: 'sel-cbx' },
              icon('check', 'solid')
            )
          ),
          el('sep'),
          el('div', { class: 'name' }, 'Name'),
          el('sep'),
          el('div', { class: 'status' }, 'Status'),
          el('sep'),
          el('div', { class: 'categories' }, 'Taxonomies'),
          el('sep'),
          el('div', { class: 'dated' }, 'Date'),
          el('sep'),
          el('div', { class: 'tags' }, 'Tags'),
          el('sep'),
          el('div', { class: 'seo-sc' }, 'SEO'),
          el('sep'),
          el('div', { class: 'actions' }, 'Actions')
        ),
        el('div', { class: 'ttc-pis ttc-pis-wrap' })
      )
    );
  }

  // ─── ScoreCircle ───────────────────────────────────────────────────
  function ScoreCircle({ score, label, variant = '' }) {
    const extra = variant ? ` ${variant}` : '';
    return el('div', {},
      el('div', { class: `score-circle${extra}`, 'data-score': score },
        el('div', { class: 'score-inner' }, score)
      ),
      el('p', { class: 'score-label' }, label)
    );
  }

  // ─── ScoreCard ────────────────────────────────────────────────────
  function ScoreCard({ iconName, title, score, label, variant = '' }) {
    return el('div', { class: 'score-card' },
      el('div', { class: 'sc-icon' },
        icon(iconName),
        el('div', { class: 'score-header' },
          el('h3', {}, title)
        )
      ),
      el('div', { class: 'sc-content' },
        ScoreCircle({ score, label, variant })
      )
    );
  }

  // ─── ActionCard ───────────────────────────────────────────────────
  function ActionCard({ iconName, title, description, href, btnText = '' }) {
    return el('div', { class: 'action-card' },
      el('div', { class: 'action-header' },
        el('div', { class: 'action-icon-wrp' }, icon(iconName))
      ),
      el('div', { class: 'info' },
        el('h3', {}, title),
        el('p', {}, description)
      ),
      el('div', { class: 'action-button' },
        el('a', { href, class: 'action-btn' },
          btnText, ' ', icon('chevron-right')
        )
      )
    );
  }

  // ─── OverviewMetrics ──────────────────────────────────────────────
  function OverviewMetrics(cards) {
    return el('div', { class: 'overview-metrics grid slide-up' },
      ...cards.map(MetricCard)
    );
  }

  // ─── TrafficTrend ─────────────────────────────────────────────────
  function TrafficTrend() {
    return el('div', { class: 'widget card slide-up' },
      el('div', { class: 'widget-header' },
        el('h2', {}, icon('chart-line'), ' Traffic Trend')
      ),
      el('div', { class: 'line-chart' },
        el('svg', { viewBox: '0 0 300 120', class: 'line-svg' },
          el('polyline', {
            fill: 'none',
            stroke: 'var(--color-primary-500)',
            'stroke-width': '3',
            points: '10,90 40,70 70,60 100,40 130,55 160,35 190,50 220,25 250,40 280,20'
          })
        ),
        el('div', { class: 'chart-labels' },
          ...['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'].map(m => el('span', {}, m))
        )
      )
    );
  }

  // ─── Scorecards ───────────────────────────────────────────────────
  function Scorecards(cards) {
    return el('div', { class: 'scorecards grid slide-up' },
      ...cards.map(ScoreCard)
    );
  }

  // ─── ActionGrid ───────────────────────────────────────────────────
  function ActionGrid(items) {
    return el('div', {class: 'action-grid-wrap'},
      div({class: 'action-head'},
        h2({}, 'Quick Actions'),
        p({ class: 'muted' }, 'Perform common tasks quickly and easily.')
      ),
      el('div', { class: 'redirects grid slide-up' },
        ...items.map(ActionCard)
      )
    );
  }

  // ─── PostsTableSkeleton ──────────────────────────────────────────
  function PostsTableSkeleton() {
    return el('div', { class: 'posts-ttc-wrap acrx-ttc-wrap' },
      el('div', { class: 'posts-ttc acrx-ttc' },
        el('div', { class: 'ttc-ph' },
          el('div', { class: 'box-sel' },
            el('div', { class: 'sel-cbx' },
              icon('check', 'solid')
            )
          ),
          el('sep'),
          el('div', { class: 'name' }, 'Name'),
          el('sep'),
          el('div', { class: 'status' }, 'Status'),
          el('sep'),
          el('div', { class: 'categories' }, 'Taxonomies'),
          el('sep'),
          el('div', { class: 'dated' }, 'Date'),
          el('sep'),
          el('div', { class: 'tags' }, 'Tags'),
          el('sep'),
          el('div', { class: 'seo-sc' }, 'SEO'),
          el('sep'),
          el('div', { class: 'actions' }, 'Actions')
        ),
        el('div', { class: 'ttc-pis ttc-pis-wrap' })
      )
    );
  }

  // ─── CategoryFilter ───────────────────────────────────────────────
  function CategoryFilter() {
    const categories = [
      'all', 'news', 'tutorials', 'updates', 'ai', 'cms', 'design',
      'development', 'security', 'performance', 'seo', 'plugins',
      'themes', 'marketing', 'business', 'other'
    ];
    return CustomDropdown({
      label: 'Category',
      items: categories.map(cat => ({
        label: cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1),
        value: cat
      })),
      valueAttr: 'data-cat',
      extraClass: 'category-filter',
      id: 'category-filter'
    });
  }

  // ─── SplitButtonDropdown ──────────────────────────────────────────
  function SplitButtonDropdown({
    id,
    label,
    items = [],
    valueAttr = 'data-value',
    extraClass = ''
  }) {
    const menuItems = items.map(item =>
      el('button', {
        class: 'dropdown-item',
        [valueAttr]: item.value
      },
        item.icon
          ? icon(item.icon, 'duotone', 'dropdown-item-icon')
          : null,
        el('span', {}, item.label)
      )
    );
    return el('div', {
      id,
      class: `split-dropdown ${extraClass}`.trim()
    },
      el('button', {
        id: `${id}-action`,
        class: 'split-dropdown-action dropdown-action'
      }, label),
      el('button', {
        id: `${id}-toggle`,
        class: 'split-dropdown-toggle dropdown-toggle'
      }, icon('chevron-down', 'solid')),
      el('input', {
        type: 'hidden',
        name: id,
        id: id,
        class: 'dropdown-hidden-input',
        value: items[0]?.value || ''
      }),
      el('div', { class: 'dropdown-menu' },
        el('div', { class: 'wrap-menu-dp' }, ...menuItems)
      )
    );
  }

  // ─── IconDropdown ─────────────────────────────────────────────────
  function IconDropdown({
    label,
    items = [],
    valueAttr = 'data-value',
    extraClass = '',
    id,
    name
  }) {
    const menuItems = items.map(item => {
      const { label, value, icon: iconName, iconStyle = 'duotone', image } = item;
      return el('button', {
        class: 'dropdown-item',
        [valueAttr]: value
      },
        div(
          {
            class: 'dropdown-item-inner d-flex flex-row al-center'
          },
          image
            ? el('img', {
                src: image,
                alt: label,
                class: 'dropdown-item-image'
              })
            : (
                iconName
                  ? icon(iconName, iconStyle, 'dropdown-item-icon')
                  : null
              ),
          el('span', {
            class: 'dropdown-item-label'
          }, label)
        )
      );
    });
    return el('div', {
      class: `IconDropdown dropdown ${extraClass}`.trim(),
      id: id || `icon-dropdown-${Date.now()}`
    },
      el('button', {
        class: 'icon-dropdown-toggle'
      },
        el('span', {
          class: 'icon-dropdown-toggle-label'
        },
          label
        ),
        icon('chevron-down', 'solid')
      ),
      el('input', {
        type: 'hidden',
        class: 'dropdown-hidden-input',
        name: name || id,
        id: id ? `${id}-hidden` : undefined
      }),
      el('div', {
        class: 'dropdown-menu'
      },
        el('div', {
          class: 'wrap-menu-dp'
        },
          ...menuItems
        )
      )
    );
  }

  // ─── Runtime identity / hydration metadata (mirrors server el.h) ────
  // Cheap path (el/div/...) unchanged. h() adds data-acrx-* identity for
  // hydration without breaking string concat (returns String object).
  function _hashId(str) {
    let h1 = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h1 ^= str.charCodeAt(i); h1 = Math.imul(h1, 0x01000193) >>> 0; }
    return 'a' + h1.toString(36);
  }
  function stableId() {
    const parts = Array.prototype.slice.call(arguments);
    return _hashId(parts.map(function (p) { return String(p == null ? '' : p); }).join('|'));
  }
  function hydrateAttrs(id, opts) {
    opts = opts || {};
    const out = { 'data-acrx-id': id };
    const hydrate = opts.hydrate || opts.strategy || null;
    if (hydrate && hydrate !== 'none') out['data-acrx-hydrate'] = hydrate;
    if (opts.stateKey) out['data-acrx-state'] = String(opts.stateKey);
    if (opts.owner) out['data-acrx-owner'] = String(opts.owner);
    if (opts.component) out['data-acrx-component'] = String(opts.component);
    return out;
  }
  function h(tag, attrs) {
    const children = Array.prototype.slice.call(arguments, 2);
    const a = Object.assign({}, attrs || {});
    const meta = {
      key: a.key != null ? a.key : null,
      hydrate: a.hydrate != null ? a.hydrate : (a.strategy != null ? a.strategy : null),
      stateKey: a.stateKey != null ? a.stateKey : null,
      owner: a.owner != null ? a.owner : null,
      component: a.component != null ? a.component : null
    };
    delete a.key; delete a.hydrate; delete a.strategy; delete a.stateKey; delete a.owner; delete a.component;
    const needsId = meta.key != null || meta.hydrate || meta.stateKey || meta.component;
    if (needsId) {
      const id = (typeof meta.key === 'string' && meta.key) ? meta.key : stableId(tag, meta.key || '', meta.component || '', children.length);
      const extra = hydrateAttrs(id, meta);
      for (const k in extra) a[k] = extra[k];
      meta.id = id;
    }
    const html = el.apply(null, [tag, a].concat(children));
    const boxed = new String(html); // eslint-disable-line no-new-wrappers
    boxed.__acrx = { tag: tag, id: meta.id || null, key: meta.key, hydrate: meta.hydrate, stateKey: meta.stateKey, owner: meta.owner, component: meta.component };
    return boxed;
  }
  el.h = h;
  function describe(tag, attrs) {
    attrs = attrs || {};
    const out = {
      tag: String(tag),
      id: null, key: attrs.key != null ? attrs.key : null,
      hydrate: attrs.hydrate != null ? attrs.hydrate : (attrs.strategy != null ? attrs.strategy : null),
      stateKey: attrs.stateKey != null ? attrs.stateKey : null,
      owner: attrs.owner != null ? attrs.owner : null,
      component: attrs.component != null ? attrs.component : null
    };
    const needsId = out.key != null || out.hydrate || out.stateKey || out.component;
    if (needsId) out.id = (typeof out.key === 'string' && out.key) ? out.key : stableId(tag, out.key || '', out.component || '', 0);
    return out;
  }
  el.describe = describe;

  // ─── Export ────────────────────────────────────────────────────────
  // Single canonical surface: every helper exactly once. (Duplicates here
  // were harmless but hid typos and missing bindings.)
  window.AcroxaFramework = {
    // Runtime identity / hydration
    stableId, hydrateAttrs, h, describe,
    // Escaping (used by mediaPicker and other components)
    escapeHTML, escapeAttr,
    // Core primitive + tag shorthands
    el, div, span, p, h1, h2, h3, h4, h5, h6, section, article, header,
    footer, nav, aside, main, ul, ol, li, table, thead, tbody, tr, th, td,
    strong, em, code, pre, blockquote, a, figure, figcaption, hr, br, sep,
    // Form primitives
    Input, Textarea, HiddenInput, FileInput, select, option, button, form,
    label, fieldset, legend, textarea, script, style, link, img,
    // Icons, toggles, dropdowns
    icon, _Icon, Toggle, CustomDropdown, IconDropdown, SplitButtonDropdown,
    CategoryFilter,
    // Cards + page kits
    MetricCard, ScoreCircle, ScoreCard, ActionCard, MainHeader,
    PostsMainContent, MainContent, PageWrapper, PageHeader,
    PaginationControls, StatusTabs, PostsPerPageDropdown, PostsTableSkeleton,
    // Settings form kit
    Field, Section, FieldGrid, NumberInput, Dropdown, SaveBar, Badge,
    ColorPicker, DangerZone, Callout,
    // Media kit
    MediaFilters, MediaGridPlaceholder, MediaHeader, MediaModal,
    // Analytics kit
    OverviewMetrics, TrafficTrend, Scorecards, ActionGrid,
  };
})();