// ./acrx/assets/js/framework.js

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
  'circle', 'line', 'path', 'polygon', 'polyline', 'rect'
]);

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

  // convert camelCase -> kebab-case
  const toKebab = str =>
    str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

  // special attribute mapper
  const normalizeAttr = key => {
    // dataClick -> data-click
    if (key.startsWith('data') && key.length > 4 && /[A-Z]/.test(key[4])) {
      return 'data-' + toKebab(key.slice(4));
    }

    // ariaLabel -> aria-label
    if (key.startsWith('aria') && key.length > 4 && /[A-Z]/.test(key[4])) {
      return 'aria-' + toKebab(key.slice(4));
    }

    // normal camelCase attrs too if wanted:
    // tabIndex -> tab-index
    if (/[A-Z]/.test(key)) {
      return toKebab(key);
    }

    return key;
  };

  // Attributes
  for (const [rawKey, value] of Object.entries(attrs)) {
    const key = normalizeAttr(rawKey);

    if (value === true) {
      html += ` ${key}`;
    } else if (value != null && value !== false) {
      html += ` ${key}="${escapeAttr(value)}"`;
    }
  }

  const isVoid = VOID_ELEMENTS.has(tag);

  if (isVoid) {
    return html + ' />';
  }

  html += '>';

  // Children
  for (const child of children) {
    if (child == null) continue;

    html += (typeof child === 'string' || typeof child === 'number')
      ? child
      : String(child);
  }

  html += `</${tag}>`;

  return html;
}

function icon(name, style = 'duotone', extraClass) {
  return el('i', { class: `fa-${style} fa-${name} ${extraClass || style}` });
}
function Toggle({ id, label, checked = false, hint, disabled = false } = {}) {
  return el('div', { class: 'toggle-field form-toggle' },
    el('label', { 
      class: 'toggle-wrap', 
      for: id 
    },
      el('input', {
        type: 'checkbox',
        id,
        name: id,
        class: 'toggle-input',
        ...(checked ? { checked: true } : {}),
        ...(disabled ? { disabled: true } : {})
      }),
      el('span', { class: 'toggle-track' },
        el('span', { class: 'toggle-thumb' })
      ),
      el('span', { class: 'toggle-label' }, label)
    ),
    hint ? el('span', { class: 'field-hint text-muted' }, hint) : null
  );
}
function CustomDropdown({ label, items, valueAttr = 'data-value', extraClass = '', id }) {
  // items = [ { label: "...", value: "..." }, ... ] or just strings
  const menuItems = items.map(item => {
    const isObj = typeof item === 'object' && item !== null;
    const lbl = isObj ? item.label : item;
    const val = isObj ? item.value : item;
    return el('button', { class: 'dropdown-item', [valueAttr]: val }, lbl);
  });

  return el('div', { class: `dropdown ${extraClass}`.trim(), id: id || `dropdown-${label.toLowerCase().replace(/\s+/g, '-')}` },
    el('button', { class: 'dropdown-toggle' },
      label, ' ', icon('chevron-down', 'solid')
    ),
    el('div', { class: 'dropdown-menu' },
      el('div', { class: 'wrap-menu-dp' },
        ...menuItems
      )
    )
  );
}

// ─── Helper: Simple Input ───────────────────────────────────────────────
function Input({ type = 'text', id, name, placeholder, className = '', attrs = {} }) {
  return el('input', {
    type,
    id,
    name: name || id,
    placeholder,
    class: className,
    ...attrs
  });
}

// ─── Helper: Hidden Input (convenience) ─────────────────────────────────
function HiddenInput({ id, name, attrs = {} }) {
  return Input({ type: 'hidden', id, name, attrs });
}

// ─── Helper: File Input ─────────────────────────────────────────────────
function FileInput({ id, multiple = false, attrs = {} }) {
  return Input({
    type: 'file',
    id,
    attrs: {
      multiple: multiple ? true : undefined,
      hidden: true,
      ...attrs
    }
  });
}


export {
  CustomDropdown,
  el,
  icon,
  Toggle,
  escapeHTML,
  Input,
  HiddenInput,
  FileInput,
};