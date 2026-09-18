// ─── OrbitalWheel (SSR) ──────────────────────────────────────────────────────
// A prefix-scoped, container-friendly "orbital" card navigator.
// Renders pure HTML via the existing el()/icon() helpers — no inline <script>,
// no full-viewport assumptions. Frontend behavior is wired up separately by
// Mini.OrbitalWheel.init({ root }) reading the data-orbital-items attribute
// this function embeds.
//
// config:
//   id          - string, required. Root element id (also becomes drag/keyboard scope).
//   prefix      - string, default 'ow-'. Prepended to every internal class name,
//                 so multiple independent instances / design systems never collide.
//   items       - array of card objects (see shape below). Required, min length 1.
//   brandLabel  - string, small label shown top-left. Optional.
//   hintLabel   - string, small label shown top-right. Optional.
//   radius      - number (px), optional override for the orbit radius at desktop
//                 width. Frontend still clamps responsively; this is just a hint
//                 passed through as a data attribute.
//   className   - string, extra class(es) appended to the root wrapper.
//   settings    - object of feature toggles, all optional (defaults below).
//                 Rendered both as a data-orbital-settings JSON attribute (so
//                 Mini.OrbitalWheel.init() picks them up automatically without
//                 needing to pass them again in JS) AND applied directly to the
//                 markup here, so a disabled section is never even flashed
//                 visible before the frontend script finishes booting:
//                   drag:      true  - mouse-driven pointer drag rotation
//                   touch:     true  - touch-driven pointer drag rotation
//                   scroll:    true  - mouse-wheel / trackpad wheel rotation
//                   keyboard:  true  - left/right arrow key navigation
//                   controls:  true  - prev/next nav buttons (hidden if false)
//                   dots:      true  - dot indicator row (hidden if false)
//                   branding:  true  - top-left brand label (hidden if false)
//                   hint:      true  - top-right hint label (hidden if false)
//                   autoSnap:  true  - magnetic snap back to nearest card
//                 drag/touch/scroll are independent — e.g. pass
//                 `{ scroll: false }` alone to keep drag/touch working while
//                 only disabling the wheel gesture (so the page scrolls
//                 normally under the component), or
//                 `{ drag: false, touch: false }` to make it click/keyboard-
//                 only while trackpad/wheel scrolling still rotates it.
//
// item shape:
//   { key, title, icon, accent, status, value, unit, delta, sub, spark: [numbers] }
//
const { el, escapeHTML, icon } = require('../framework');
const DEFAULT_SETTINGS = {
  drag: true,
  touch: true,
  scroll: true,
  keyboard: true,
  controls: true,
  dots: true,
  branding: true,
  hint: true,
  autoSnap: true,
};

function OrbitalWheel({
  id,
  prefix = 'ow-',
  items = [],
  brandLabel = '',
  hintLabel = '',
  radius,
  className = '',
  settings = {},
} = {}) {
  if (!id) throw new Error('OrbitalWheel: `id` is required');
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('OrbitalWheel: `items` must be a non-empty array');
  }

  const s = { ...DEFAULT_SETTINGS, ...settings };

  // cls('card') -> 'ow-card' (or whatever prefix was configured)
  const cls = (name) => `${prefix}${name}`;

  // Applies the {prefix}hidden utility class server-side when a toggle is
  // off, so there's no flash-of-visible-content before the frontend JS
  // (which reads the very same settings back out of data-orbital-settings)
  // has a chance to apply it.
  const hiddenIf = (flag) => (flag ? null : cls('hidden'));

  // Build one sparkline <svg> (static server-rendered preview; the frontend
  // re-derives the same paths at runtime, this is just so the card isn't
  // empty before JS boots / for no-JS contexts).
  function sparkline(values = []) {
    const w = 96, h = 28, pad = 3;
    const safeValues = values.length ? values : [1, 1];
    const max = Math.max(...safeValues);
    const min = Math.min(...safeValues);
    const range = (max - min) || 1;
    const stepX = (w - pad * 2) / (safeValues.length - 1 || 1);

    const pts = safeValues.map((v, i) => [
      pad + i * stepX,
      h - pad - ((v - min) / range) * (h - pad * 2),
    ]);

    let line = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) line += ` L ${pts[i][0]},${pts[i][1]}`;
    const fill = `${line} L ${pts[pts.length - 1][0]},${h} L ${pts[0][0]},${h} Z`;

    // NOTE: lowercase "viewbox" is intentional — el() kebab-cases camelCase
    // keys, which would turn "viewBox" into the invalid "view-box". HTML
    // parses SVG attributes case-insensitively so `viewbox` still works.
    return el('svg', { class: cls('spark'), viewbox: `0 0 ${w} ${h}` },
      el('path', { class: cls('fill'), d: fill }),
      el('path', { class: cls('line'), d: line })
    );
  }

  function card(item, index) {
    return el('div', {
        class: cls('card'),
        dataIndex: index,
        dataKey: item.key || '',
        style: `--card-accent:${item.accent || 'var(--color-primary-500)'}`,
      },
      el('div', { class: cls('card-face') },
        el('div', { class: cls('card-top') },
          el('div', { class: cls('card-eyebrow') },
            el('div', { class: cls('card-glyph') }, icon(item.icon || 'circle', 'solid')),
            el('div', { class: cls('card-title') }, escapeHTML(item.title || ''))
          ),
          el('div', { class: cls('status-badge') },
            el('span', { class: cls('pulse') }),
            escapeHTML(item.status || '')
          )
        ),
        el('div', { class: cls('card-metric') },
          el('span', { class: cls('value') }, escapeHTML(item.value || '')),
          el('span', { class: cls('unit') }, escapeHTML(item.unit || '')),
          el('span', { class: cls('delta') }, escapeHTML(item.delta || ''))
        ),
        el('div', { class: cls('card-bottom') },
          el('div', { class: cls('card-sub') }, escapeHTML(item.sub || '')),
          sparkline(item.spark)
        )
      )
    );
  }

  const cardEls = items.map(card).join('');

  // Only the data the frontend needs to rebuild sparklines / accents / labels
  // gets serialized. NOTE: pass raw JSON — el() already escapeAttr()s every
  // attribute value exactly once. Pre-escaping here would double-encode
  // quotes (&quot; -> &amp;quot;) so getAttribute() returns invalid JSON.
  const serializedItems = JSON.stringify(items);
  const serializedSettings = JSON.stringify(s);

  return el('section', {
      id,
      class: `${cls('wheel')} ${className}`.trim(),
      dataOrbitalItems: serializedItems,
      dataOrbitalSettings: serializedSettings,
      ...(radius ? { dataRadius: radius } : {}),
    },
    el('div', { class: [cls('topbar')].filter(Boolean).join(' ') },
      el('div', { class: [cls('brand'), hiddenIf(s.branding)].filter(Boolean).join(' ') },
        el('span', { class: cls('dot') }),
        escapeHTML(brandLabel)
      ),
      el('div', { class: [cls('hint'), hiddenIf(s.hint)].filter(Boolean).join(' ') }, escapeHTML(hintLabel))
    ),

    el('div', { class: cls('frame') },
      el('div', { class: [cls('viewport'), (!s.drag && !s.touch) ? cls('no-drag') : null].filter(Boolean).join(' ') },
        el('div', { class: cls('hub') }, cardEls)
      )
    ),

    el('div', { class: cls('mask') }),

    el('div', { class: cls('footer-label') },
      el('div', { class: cls('name') }, escapeHTML(items[0].title || '')),
      el('div', { class: cls('desc') }, escapeHTML(items[0].sub || ''))
    ),

    el('div', { class: [cls('controls'), hiddenIf(s.controls)].filter(Boolean).join(' ') },
      el('button', { class: cls('nav-btn'), type: 'button', dataAction: 'prev', ariaLabel: 'Previous module' },
        icon('chevron-left', 'solid')
      ),
      el('div', { class: [cls('dots'), hiddenIf(s.dots)].filter(Boolean).join(' ') },
        ...items.map((_, i) =>
          el('div', { class: cls('dot-ind'), dataGoto: i })
        )
      ),
      el('button', { class: cls('nav-btn'), type: 'button', dataAction: 'next', ariaLabel: 'Next module' },
        icon('chevron-right', 'solid')
      )
    )
  );
}

module.exports = { OrbitalWheel };