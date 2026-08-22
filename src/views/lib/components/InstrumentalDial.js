// ─── InstrumentDial (SSR) ────────────────────────────────────────────────
// A prefix-scoped grid of "instrument" gauges that morph into detail
// panels. Renders pure HTML via the existing el()/icon() helpers — no
// inline <script>. Frontend behavior (thumb positioning, morph animation,
// interaction) is wired up separately by Mini.InstrumentDial.init({ root })
// reading the data-instrument-items attribute this function embeds.
//
// config:
//   id          - string, required. Root grid element id.
//   prefix      - string, default 'id-'. Prepended to every internal class
//                 name, so multiple independent instances never collide.
//   items       - array of metric objects (see shape below). Required, min 1.
//   eyebrow     - string, small label above the heading. Optional.
//   heading     - string, page/section heading. Optional.
//   description - string, supporting copy under the heading. Optional.
//   className   - string, extra class(es) appended to the grid wrapper.
//   settings    - object of feature toggles (all optional, defaults below):
//                   interactive:   true  - whole component is clickable/
//                                  expandable. false renders a static,
//                                  read-only report (no thumb handle, no
//                                  expand, no hover lift).
//                   idleAnimation: true  - the slow breathing/glow-pulse
//                                  idle state while collapsed.
//                   thumbHandle:   true  - the thumb capsule is the primary
//                                  interactive target (the "unzip"
//                                  signature interaction). false makes the
//                                  whole circle the click target instead,
//                                  which suits touch-first contexts where a
//                                  small precision handle is poor UX.
//
// item shape:
//   {
//     key, title, value (0-100), status, description,
//     suggestions: [string, ...],   // 2-8 short recommendation lines
//     action: string                // label for the trailing-arrow CTA
//   }
//
const { el, escapeHTML, icon, escapeAttr } = require('../framework');

const DEFAULT_SETTINGS = {
  interactive: true,
  idleAnimation: true,
  thumbHandle: true,
};

// Small deterministic hash -> stable per-item nudge, so the "slightly
// asymmetrical" layout requirement doesn't shift between server renders or
// re-initializations (real randomness would cause SSR/client mismatch and
// visual jitter on re-init).
function hashToNudge(key) {
  let h = 0;
  const str = String(key || '');
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  const nx = ((h % 7) - 3) * 0.6;        // roughly -1.8px .. +1.8px
  const ny = (((h >> 3) % 7) - 3) * 0.6;
  return { x: Number(nx.toFixed(2)), y: Number(ny.toFixed(2)) };
}

function InstrumentDial({
  id,
  prefix = 'id-',
  items = [],
  eyebrow = '',
  heading = '',
  description = '',
  className = '',
  settings = {},
} = {}) {
  if (!id) throw new Error('InstrumentDial: `id` is required');
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('InstrumentDial: `items` must be a non-empty array');
  }

  const s = { ...DEFAULT_SETTINGS, ...settings };
  const cls = (name) => `${prefix}${name}`;

  const RADIUS = 92;
  const VIEWBOX = 200;
  const CENTER = VIEWBOX / 2;
  const CIRC = 2 * Math.PI * RADIUS;
  const TICK_COUNT = 48;

  // Ticks are generated once here (not duplicated logic in the frontend)
  // since their count/geometry never changes at runtime — only the
  // progress arc and thumb are animated client-side.
  function ticks() {
    const lines = [];
    for (let i = 0; i < TICK_COUNT; i++) {
      const angle = (i / TICK_COUNT) * Math.PI * 2;
      const outer = RADIUS + 6;
      const inner = RADIUS + 1;
      const x1 = CENTER + Math.cos(angle) * inner;
      const y1 = CENTER + Math.sin(angle) * inner;
      const x2 = CENTER + Math.cos(angle) * outer;
      const y2 = CENTER + Math.sin(angle) * outer;
      lines.push(el('line', {
        x1: x1.toFixed(2), y1: y1.toFixed(2),
        x2: x2.toFixed(2), y2: y2.toFixed(2),
      }));
    }
    return lines;
  }

  function suggestionItem(text) {
    return el('li', {}, escapeHTML(text));
  }

  function instrumentCard(item, index) {
    const nudge = hashToNudge(item.key || item.title || index);

    return el('div', { class: cls('instrument'),
        tabindex: '0',
        role: 'button',
        ariaExpanded: 'false',
        ariaLabel: `${item.title} — ${item.value}, ${item.status}. Press to expand.`,
        dataIndex: index,
        dataKey: item.key || '',
        dataValue: item.value,
        style: `--${prefix}nudge-x:${nudge.x}px; --${prefix}nudge-y:${nudge.y}px`,
      },
      // Inner wrapper for idle animation clipping — the idle animation scales
      // this wrapper (via .id-idle-on), while the outer .id-instrument stays
      // at its layout size with overflow:hidden to clip the scaled content.
      el('div', { class: cls('inner') },
        // NOTE: el()'s attribute normalizer kebab-cases any camelCase key,
        // which would turn "viewBox" into the invalid "view-box" and break
        // the ring's coordinate system. Passing the all-lowercase "viewbox"
        // key sidesteps that (no capital letter, so normalizeAttr leaves it
        // untouched) — HTML parses SVG attributes case-insensitively, so
        // `viewbox="..."` is correctly recognized as `viewBox` by the browser.
        el('svg', { class: cls('ring'), viewbox: `0 0 ${VIEWBOX} ${VIEWBOX}` },
          el('circle', { class: cls('track'), cx: CENTER, cy: CENTER, r: RADIUS }),
          el('g', { class: cls('ticks') }, ...ticks()),
          el('circle', {
            class: cls('progress'), cx: CENTER, cy: CENTER, r: RADIUS,
            strokeDasharray: CIRC.toFixed(2),
            strokeDashoffset: CIRC.toFixed(2), // frontend animates this in from full
          })
        ),

        // Subtle inner well for depth
        el('div', { class: cls('well') }),

        // Thumb starts at the 12-o'clock rest position (angle 0 on the
        // rotated ring); the frontend immediately animates it out to the
        // real value on mount, matching the arc's own reveal animation.
        s.interactive
          ? el('button', {
              type: 'button',
              class: cls('thumb'),
              ariaLabel: `Open ${escapeHTML(item.title || 'metric')} details`,
              dataThumb: 'true',
            })
          : el('div', { class: cls('thumb') }),

        el('div', { class: `${cls('content')} ${cls('compact')}` },
          el('div', { class: cls('value') }, escapeHTML(String(item.value))),
          el('div', { class: cls('title') }, escapeHTML(item.title || '')),
          el('div', { class: cls('status') }, escapeHTML(item.status || ''))
        ),

        el('div', { class: `${cls('content')} ${cls('expanded')}` },
          el('div', { class: cls('panel-header') },
            el('div', { class: cls('panel-title') },
              el('div', { class: cls('p-title') }, escapeHTML(item.title || ''))
            )
          ),
          el('div', { class: cls('panel-score') },
            el('div', { class: cls('p-value') }, escapeHTML(String(item.value))),
            el('div', { class: cls('p-status') }, escapeHTML(item.status || ''))
          ),
          el('p', { class: `${cls('p-description')} ${cls('panel-description')}` }, escapeHTML(item.description || '')),
          el('div', { class: cls('panel-recs') },
            el('div', { class: cls('p-rec-label') }, 'Recommendations'),
            el('ul', { class: cls('suggestions') },
              ...(item.suggestions || []).map(suggestionItem)
            )
          ),
          el('div', { class: cls('panel-footer') },
            el('button', { class: cls('action-btn'), type: 'button' },
              escapeHTML(item.action || 'View report'),
              el('span', { class: cls('action-arrow') }, icon('arrow-right', 'solid'))
            )
          )
        ),

        s.interactive
          ? el('button', { class: cls('close-btn'), type: 'button', ariaLabel: `Collapse ${escapeHTML(item.title || '')}` }, '×')
          : null
      )
    );
  }

  const cardEls = items.map((item, i) =>
    el('div', { class: cls('slot') }, instrumentCard(item, i))
  ).join('');

  const serializedItems = escapeAttr(JSON.stringify(items));
  const serializedSettings = escapeAttr(JSON.stringify(s));

  const headerBlock = (eyebrow || heading || description)
    ? el('div', { class: cls('page-head') },
        eyebrow ? el('div', { class: cls('eyebrow') }, escapeHTML(eyebrow)) : null,
        heading ? el('h2', { class: cls('heading') }, escapeHTML(heading)) : null,
        description ? el('p', { class: cls('page-desc') }, escapeHTML(description)) : null
      )
    : '';

  return el('div', { class: `${cls('wrap')} ${className}`.trim() },
    headerBlock,
    el('div', {
        id,
        class: cls('grid'),
        dataInstrumentItems: serializedItems,
        dataInstrumentSettings: serializedSettings,
      },
      cardEls
    )
  );
}

module.exports = { InstrumentDial };