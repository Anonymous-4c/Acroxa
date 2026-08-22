// ../src/layouts/lib/framework.js

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

module.exports = {

  el,
  escapeHTML,
};