// acrx/assets/js/widget-styling.js
// Global widget studio: Canva-like, category-based GUI for --wdg-* tokens.
// Linked + synced with the ACTIVE layout palette (no fake values):
//   - reads GET /acr/api/layouts/get/active + GET /:id/config for layout colors
//   - reads GET /acr/api/system/content for saved widgetStyles
//   - writes PATCH /acr/api/system/content { widgetStyles, customCSS }
//   - live-applies to :root so preview + editor share tokens.
(function () {
  const CATS = [
    { id: 'text', label: 'Text', hint: 'Paragraph · Heading · Quote · Code', widgets: ['paragraph', 'heading', 'blockquote', 'codeblock'] },
    { id: 'media', label: 'Media', hint: 'Image · Gallery · Video · Audio', widgets: ['image', 'gallery', 'video', 'audio'] },
    { id: 'interactive', label: 'Interactive', hint: 'Button · Tabs · Accordion', widgets: ['button', 'tabs', 'accordion'] },
    { id: 'layout', label: 'Layout', hint: 'Columns · Card · Section · Spacer', widgets: ['columns', 'card', 'section', 'spacer', 'divider'] },
    { id: 'content', label: 'Content', hint: 'Table · Alert · FAQ · Pricing · Features', widgets: ['table', 'alert', 'faq', 'pricing', 'features', 'timeline', 'hero', 'cta', 'embed'] },
  ];
  const DEFAULTS = {
    '--wdg-radius-sm': 8, '--wdg-radius-md': 14, '--wdg-radius-lg': 22, '--wdg-radius-pill': 999,
    '--wdg-border-width': 1, '--wdg-table-cell-pad-y': 10, '--wdg-table-cell-pad-x': 14,
    '--wdg-border-color': '#e5e7eb', '--wdg-accent': '', '--wdg-surface': '', '--wdg-ink': '',
    '--wdg-code-bg': '#0f172a', '--wdg-code-ink': '#e2e8f0',
    '--wdg-table-header-bg': '', '--wdg-table-header-ink': '#ffffff',
    '--wdg-table-stripe': 'rgba(127,127,127,.08)',
  };
  let state = { cat: 'content', styles: {}, customCSS: '', layout: { id: null, colors: {} }, dirty: false };

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return [...(r || document).querySelectorAll(s)]; }
  function toast(msg, type) {
    if (window.System?.showToast) window.System.showToast(msg, type);
    else if (window.Acroxa?.toast) window.Acroxa.toast(msg, type);
  }
  function applyVars() {
    const root = document.documentElement;
    Object.entries(state.styles).forEach(([k, v]) => {
      if (v === '' || v == null) { root.style.removeProperty(k); return; }
      const val = /radius|width|pad/.test(k) && typeof v === 'number' ? `${v}px` : String(v);
      if (k === '--wdg-table-cell-pad-y' || k === '--wdg-table-cell-pad-x') return;
      root.style.setProperty(k, val);
    });
    const y = state.styles['--wdg-table-cell-pad-y'] ?? 10;
    const x = state.styles['--wdg-table-cell-pad-x'] ?? 14;
    root.style.setProperty('--wdg-table-cell-pad', `${y}px ${x}px`);
    let tag = $('#wdg-live-custom');
    if (state.customCSS) {
      if (!tag) { tag = document.createElement('style'); tag.id = 'wdg-live-custom'; document.head.appendChild(tag); }
      tag.textContent = state.customCSS;
    } else tag?.remove();
  }
  function markDirty() { state.dirty = true; applyVars(); }
  function numField(key, label, min, max) {
    const v = state.styles[key] ?? DEFAULTS[key] ?? 0;
    return `<div class="wdg-field"><label>${label} <span data-val-for="${key}">${v}px</span></label>` +
      `<input type="range" min="${min}" max="${max}" step="1" value="${v}" data-wdg-num="${key}"></div>`;
  }
  function colorField(key, label) {
    const v = state.styles[key] || DEFAULTS[key] || '#6366f1';
    return `<div class="wdg-field"><label>${label}</label><span style="display:flex;gap:8px;align-items:center">` +
      `<input type="color" value="${/^#/.test(v) ? v : '#6366f1'}" data-wdg-color="${key}">` +
      `<input type="text" class="insp-input" value="${v}" data-wdg-color-text="${key}" placeholder="var or #hex" style="flex:1">` +
      `<button type="button" class="btn ghost" data-wdg-clear="${key}">Auto</button></span></div>`;
  }
  function renderCats() {
    $('#wdg-cats').innerHTML = CATS.map((c) =>
      `<button type="button" role="tab" aria-selected="${c.id === state.cat}" class="wdg-studio-cat${c.id === state.cat ? ' is-active' : ''}" data-cat="${c.id}"><strong>${c.label}</strong><br><small>${c.hint}</small></button>`
    ).join('');
    $all('#wdg-cats [data-cat]').forEach((b) => b.addEventListener('click', () => { state.cat = b.dataset.cat; renderCats(); renderPanel(); }));
  }
  function renderPanel() {
    const p = $('#wdg-panel');
    const common = numField('--wdg-radius-sm', 'Radius — small', 0, 32) + numField('--wdg-radius-md', 'Radius — medium', 0, 40) +
      numField('--wdg-radius-lg', 'Radius — large', 0, 48) + numField('--wdg-border-width', 'Border width', 0, 4) + colorField('--wdg-border-color', 'Border color');
    let extra = '';
    if (state.cat === 'content') {
      extra = colorField('--wdg-table-header-bg', 'Table header background') + colorField('--wdg-table-header-ink', 'Table header text') +
        numField('--wdg-table-cell-pad-y', 'Table cell padding Y', 2, 28) + numField('--wdg-table-cell-pad-x', 'Table cell padding X', 4, 40);
    }
    if (state.cat === 'text') extra = colorField('--wdg-code-bg', 'Code background') + colorField('--wdg-code-ink', 'Code text');
    if (state.cat === 'interactive' || state.cat === 'layout') extra = colorField('--wdg-accent', 'Accent (buttons/active tabs)') + colorField('--wdg-surface', 'Surface') + colorField('--wdg-ink', 'Ink');
    p.innerHTML = `<h3>${CATS.find((c) => c.id === state.cat).label} styling</h3>` +
      `<div class="wdg-sync-note">Active layout: <strong>${state.layout.id || '—'}</strong> · primary <code>${state.layout.colors.primary || '—'}</code> ` +
      `<button type="button" class="btn ghost" id="wdg-use-layout">Use layout colors</button></div>` +
      common + extra;
    $('#wdg-use-layout')?.addEventListener('click', () => {
      if (state.layout.colors.primary) state.styles['--wdg-accent'] = state.layout.colors.primary;
      if (state.layout.colors.primary) state.styles['--wdg-table-header-bg'] = state.layout.colors.primary;
      markDirty(); renderPanel();
      toast('Linked to active layout colors', 'success');
    });
    $all('[data-wdg-num]', p).forEach((r) => r.addEventListener('input', () => {
      state.styles[r.dataset.wdgNum] = Number(r.value);
      const lab = p.querySelector(`[data-val-for="${r.dataset.wdgNum}"]`);
      if (lab) lab.textContent = `${r.value}px`;
      markDirty();
    }));
    $all('[data-wdg-color]', p).forEach((c) => c.addEventListener('input', () => {
      state.styles[c.dataset.wdgColor] = c.value;
      const t = p.querySelector(`[data-wdg-color-text="${c.dataset.wdgColor}"]`);
      if (t) t.value = c.value;
      markDirty();
    }));
    $all('[data-wdg-color-text]', p).forEach((t) => t.addEventListener('change', () => {
      state.styles[t.dataset.wdgColorText] = t.value.trim();
      markDirty();
    }));
    $all('[data-wdg-clear]', p).forEach((b) => b.addEventListener('click', () => {
      delete state.styles[b.dataset.wdgClear];
      markDirty(); renderPanel();
    }));
    renderPreview();
  }
  function renderPreview() {
    const host = $('#wdg-preview');
    host.innerHTML =
      `<span class="acrx-btn acrx-btn-primary">Button</span>` +
      `<div class="acrx-card" style="padding:12px">Card · radius var</div>` +
      `<div class="acrx-alert" style="padding:10px 12px">Alert · accent bar</div>` +
      `<blockquote class="acrx-blockquote" style="padding:10px 12px;margin:0">Quote</blockquote>` +
      `<div class="acrx-table-wrap"><table class="acrx-table"><tr><th>Name</th><th>Role</th></tr><tr><td>Ada</td><td>Eng</td></tr><tr><td>Lin</td><td>Design</td></tr></table></div>` +
      `<pre class="acrx-codeblock" style="padding:12px;margin:0">code --radius</pre>`;
  }
  async function load() {
    try {
      const a = await fetch('/acr/api/layouts/get/active').then((r) => r.json()).catch(() => ({}));
      const id = a.id || a.active || a.layoutId || null;
      state.layout.id = typeof id === 'object' ? id.id : id;
      if (state.layout.id) {
        const cfg = await fetch(`/acr/api/layouts/${encodeURIComponent(state.layout.id)}/config`).then((r) => r.json()).catch(() => ({}));
        const c = cfg.config?.layout?.colors || cfg.config?.colors || {};
        state.layout.colors = { primary: c.primary, secondary: c.secondary };
        if (c.primary && !state.styles['--wdg-accent']) {
          document.documentElement.style.setProperty('--layout-color-primary', c.primary);
        }
      }
    } catch {}
    try {
      const s = await (window.System?.getSection ? window.System.getSection('content') : fetch('/acr/api/system/content').then((r) => r.json()).then((d) => d.data || d));
      const saved = s?.widgetStyles || {};
      state.styles = { ...saved };
      state.customCSS = s?.widgetCustomCSS || '';
      const ta = $('#wdg-custom-css');
      if (ta) ta.value = state.customCSS;
    } catch {}
    $('#wdg-sync-note').textContent = state.layout.id
      ? `Synced with active layout “${state.layout.id}”${state.layout.colors.primary ? ` · primary ${state.layout.colors.primary}` : ''} · styles save globally under Settings → Content.`
      : 'No active layout found — styles still save globally.';
    applyVars(); renderCats(); renderPanel();
  }
  async function save() {
    const css = $('#wdg-custom-css')?.value || '';
    state.customCSS = css;
    const body = { widgetStyles: state.styles, widgetCustomCSS: css };
    try {
      if (window.System?.updateSection) await window.System.updateSection('content', body);
      else await fetch('/acr/api/system/content', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(`Save failed (${r.status})`); return r.json(); });
      state.dirty = false;
      applyVars();
      toast('Widget styles saved globally', 'success');
    } catch (e) { toast(e.message || 'Save failed', 'error'); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!$('#wdg-panel')) return;
    $('#wdg-save-btn')?.addEventListener('click', save);
    $('#wdg-reset-btn')?.addEventListener('click', async () => {
      if (!confirm('Reset all widget styles to defaults?')) return;
      state.styles = {}; state.customCSS = '';
      $('#wdg-custom-css').value = '';
      await save(); renderPanel();
    });
    $('#wdg-custom-css')?.addEventListener('input', (e) => { state.customCSS = e.target.value; markDirty(); });
    load();
  });
})();
