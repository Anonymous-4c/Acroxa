/**
 * Acroxa CMDK — Command Center Runtime
 * ─────────────────────────────────────────────────────────────
 * Registry-first · Theme-token powered · Async-safe · Plugin-extensible
 *
 * Backward compatible with the original contract:
 *   cmdk.registerNamespace(prefix, { label, desc, icon, actions })
 *   actions[name] = { desc, icon, dynamicSuggestions(query) }
 *
 * New, additive surface (all optional — existing registries keep working):
 *   cmdk.setContext({ page, recents, quickActions, system, ai })
 *   cmdk.pushRecent(item)
 *   cmdk.registerContextProvider(fn)     // fn() -> partial context, sync or async
 *   suggestion items may now include: { group, size, preview, meta, kbd }
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

class CMDKEngine {

  constructor() {

    window.cmdk = this;
    window.cmdk.showToast = (msg, type) => System.showToast(msg, type);

    this.isOpen = false;

    this.registry = {};

    /* Context layer — powers the zero-query "home" surface */
    this.context = {
      recents: [],
      quickActions: [],
      contextualActions: [],
      system: null,
      ai: []
    };
    this.contextProviders = [];

    this.currentGroups = [];      // [{ key, label, items: [...] }]
    this.flatItems = [];          // flattened, in visual order, for keyboard nav
    this.selectedIndex = 0;
    this.viewMode = 'home';       // 'home' | 'results' | 'empty'

    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this._searchToken = 0;        // monotonic token — invalidates stale async work
    this._debounceTimer = null;

    this.wrapper = document.getElementById('cmd-pallete-wrap');
    this.editor = this.wrapper.querySelector('.cmdk-editor');
    this.dropdown = this.wrapper.querySelector('.cmdk-dropdown');
    this.cmdkWrap = this.wrapper.querySelector('.cmdk-wrap');
    this.statusEl = this.wrapper.querySelector('.cmdk-status');
    this.footerEl = this.wrapper.querySelector('.cmdk-footer');

    this.injectStyles();
    this.initModal();
    this.initPreviewSurface();
    this.setupEditorState();
    this.bind();
    this.loadRegistries();
    this.loadRecentsFromStorage();

    this.renderHome();
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Theme Layer                                                  */
  /* ───────────────────────────────────────────────────────────── */

  injectStyles() {
    // Stylesheet is shipped separately as cmdk-command-center.css.
    // This hook stays so registries/themes can still detect readiness
    // and so a future inline-critical-CSS path has somewhere to live.
    if (document.getElementById('cmdk-runtime-style')) return;

    const style = document.createElement('style');
    style.id = 'cmdk-runtime-style';
    style.textContent = `body.cmdk-lock { overflow: hidden; }`;
    document.head.appendChild(style);
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Modal (command detail / settings JSON / layout info, etc.)   */
  /* ───────────────────────────────────────────────────────────── */

  initModal() {

    this.overlay = document.createElement('div');
    this.overlay.className = 'cmdk-popup-overlay';

    this.overlay.innerHTML = `
      <div class="cmdk-popup-content">
        <div class="cmdk-popup-header">
          <div class="cmdk-popup-title"></div>
          <button class="cmdk-popup-close" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="cmdk-popup-body"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.overlay.querySelector('.cmdk-popup-close')
      .addEventListener('click', () => this.hideModal());

    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) this.hideModal();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
        this.hideModal();
      }
    });
  }

  showModal(title, content) {
    this.overlay.querySelector('.cmdk-popup-title').textContent = title;
    this.overlay.querySelector('.cmdk-popup-body').innerHTML = content;
    this.overlay.classList.add('active');
  }

  hideModal() {
    this.overlay.classList.remove('active');
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Inline Preview Surface                                       */
  /* (lightweight — lives inside cmdk-wrap, not the modal)         */
  /* ───────────────────────────────────────────────────────────── */

  initPreviewSurface() {
    this.previewEl = document.createElement('div');
    this.previewEl.className = 'cmdk-preview';
    this.previewEl.setAttribute('aria-hidden', 'true');
    this.cmdkWrap.appendChild(this.previewEl);
  }

  renderPreview(item) {
    if (!item || !item.preview) {
      this.previewEl.classList.remove('cmdk-preview--visible');
      this.previewEl.innerHTML = '';
      return;
    }

    this.previewEl.innerHTML = `
      <div class="cmdk-preview__inner">${item.preview}</div>
    `;

    requestAnimationFrame(() => {
      this.previewEl.classList.add('cmdk-preview--visible');
    });
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Registry                                                     */
  /* ───────────────────────────────────────────────────────────── */

  registerNamespace(prefix, config) {
    this.registry[prefix] = config;
    if (!this.isOpen) return;
    if (this.viewMode === 'home') {
      this.renderHome();
    } else {
      this.runSearch();
    }
  }

  async loadRegistries() {

    const modules = [
      '/registry/layout.js',
      '/registry/menu.js',
      '/registry/settings.js',
      '/registry/backup.js',
      '/registry/media.js',
      '/registry/cms.js'
    ];

    for (const path of modules) {
      const script = document.createElement('script');
      script.src = '/acrx/assets/js/cmdk' + path;
      script.async = true;
      document.head.appendChild(script);
    }
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Context Layer — powers the zero-query Command Center home    */
  /* ───────────────────────────────────────────────────────────── */

  /**
   * Merge-set context used to populate the home surface.
   * Safe to call multiple times (e.g. on route change).
   * @param {Partial<{page, recents, quickActions, contextualActions, system, ai}>} partial
   */
  setContext(partial = {}) {
    this.context = { ...this.context, ...partial };
    if (this.isOpen && this.viewMode === 'home' && !this._hasQuery()) {
      this.renderHome();
    }
  }

  /**
   * Register a function that contributes context lazily when CMDK opens.
   * fn() may return a partial context object, or a Promise of one.
   */
  registerContextProvider(fn) {
    if (typeof fn === 'function') this.contextProviders.push(fn);
  }

  /**
   * Fields in context that are arrays get concatenated across providers
   * rather than overwritten — every registry that contributes a
   * quickAction, contextualAction, etc. should keep its tile, not have
   * it silently replaced by the next provider that resolves.
   */
  static _MERGEABLE_ARRAY_KEYS = ['quickActions', 'contextualActions', 'ai'];

  async _resolveContextProviders() {
    if (!this.contextProviders.length) return;

    // Reset mergeable arrays before this pass — _resolveContextProviders
    // can run again later (e.g. a quick action calls renderHome() to
    // refresh itself after toggling something), and without a reset each
    // provider's tiles would pile up again on top of the previous pass's
    // results instead of replacing them.
    // (note: 'recents' is deliberately excluded — it's maintained by
    // pushRecent()/loadRecentsFromStorage(), not by context providers.)
    for (const key of CMDKEngine._MERGEABLE_ARRAY_KEYS) {
      this.context[key] = [];
    }

    const results = await Promise.allSettled(
      this.contextProviders.map(fn => fn())
    );
    results.forEach(r => {
      if (r.status !== 'fulfilled' || !r.value) return;

      const partial = r.value;
      const merged = { ...this.context };

      for (const [key, value] of Object.entries(partial)) {
        if (CMDKEngine._MERGEABLE_ARRAY_KEYS.includes(key) && Array.isArray(value)) {
          merged[key] = [...(merged[key] || []), ...value];
        } else {
          merged[key] = value;
        }
      }

      this.context = merged;
    });
  }

  pushRecent(item) {
    if (!item || !item.label) return;

    const key = item.commandId || `${item.label}:${item.commandBadge || ''}`;
    this.context.recents = [
      { ...item, _key: key, ts: Date.now() },
      ...this.context.recents.filter(r => r._key !== key)
    ].slice(0, 8);

    this.saveRecentsToStorage();
  }

  saveRecentsToStorage() {
    try {
      const serializable = this.context.recents.map(r => ({
        _key: r._key,
        label: r.label,
        desc: r.desc,
        icon: r.icon,
        commandBadge: r.commandBadge,
        autocomplete: r.autocomplete,
        ts: r.ts
      }));
      sessionStorage.setItem('cmdk:recents', JSON.stringify(serializable));
    } catch (_) { /* storage unavailable — non-fatal */ }
  }

  loadRecentsFromStorage() {
    try {
      const raw = sessionStorage.getItem('cmdk:recents');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.context.recents = parsed.map(r => ({
          ...r,
          action: () => { if (r.autocomplete) this.setInputValue(r.autocomplete); }
        }));
      }
    } catch (_) { /* corrupt/missing — ignore */ }
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Editor Empty State                                           */
  /* ───────────────────────────────────────────────────────────── */

  setupEditorState() {

    const normalize = () => {

      const html = this.editor.innerHTML
        .replace(/<br\s*\/?>/gi, '')
        .replace(/&nbsp;/gi, '')
        .trim();

      const text = this.editor.textContent
        .replace(/\u00A0/g, '')
        .trim();

      const empty = !html.length && !text.length;

      if (empty) {
        this.editor.setAttribute('data-empty', 'true');
        if (this.editor.innerHTML.trim() === '') {
          this.editor.innerHTML = '<br>';
        }
      } else {
        this.editor.removeAttribute('data-empty');
      }
    };

    normalize();

    ['input', 'focus', 'blur', 'paste', 'keyup', 'cut'].forEach(eventName => {
      this.editor.addEventListener(eventName, () => {
        requestAnimationFrame(normalize);
      });
    });
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Parser                                                       */
  /* ───────────────────────────────────────────────────────────── */

  parseInput(text) {
    const normalized = text.trim();
    const match = normalized.match(/^(\S+)(?:\s+(\S+))?(?:\s+(.*))?$/);

    return {
      namespace: match?.[1] || '',
      action: match?.[2] || '',
      query: match?.[3] || ''
    };
  }

  /**
   * Improved fuzzy scorer (replaces boolean-only match).
   * Returns a 0..1 score, or -1 for "no match".
   * Rewards prefix matches and tight character sequences.
   */
  fuzzyScore(text, query) {
    if (!query) return 1;

    const t = text.toLowerCase();
    const q = query.toLowerCase();

    if (t === q) return 1;
    if (t.startsWith(q)) return 0.92;

    let qi = 0;
    let firstMatch = -1;
    let lastMatch = -1;
    let consecutive = 0;
    let bestConsecutive = 0;

    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) {
        if (firstMatch === -1) firstMatch = i;
        if (lastMatch === i - 1) {
          consecutive++;
        } else {
          consecutive = 1;
        }
        bestConsecutive = Math.max(bestConsecutive, consecutive);
        lastMatch = i;
        qi++;
      }
    }

    if (qi < q.length) return -1; // not all characters matched, in order

    const span = lastMatch - firstMatch + 1;
    const density = q.length / span;                 // tighter sequence = higher
    const prefixBonus = firstMatch === 0 ? 0.15 : 0;
    const sequenceBonus = (bestConsecutive / q.length) * 0.3;

    return Math.min(0.9, density * 0.4 + sequenceBonus + prefixBonus + 0.2);
  }

  fuzzy(text, query) {
    return this.fuzzyScore(text, query) >= 0;
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Runtime — execution                                          */
  /* ───────────────────────────────────────────────────────────── */

  async executeAction(action, context = {}, sourceItem = null) {

    try {
      this.setBusy(true);
      this.setStatus('Executing…');

      const result = await action(context);

      if (sourceItem) this.pushRecent(sourceItem);

      if (result?.toast) {
        System.showToast(result.toast.message, result.toast.type || 'success');
      }

      if (result?.modal) {
        this.showModal(result.modal.title, result.modal.content);
      }

      if (result?.reload) {
        location.reload();
      }

      this.setStatus(null);
      return result;

    } catch (err) {
      console.error(err);
      System.showToast(err.message || 'Command failed', 'error');
      this.setStatus(err.message || 'Command failed', true);

    } finally {
      this.setBusy(false);
    }
  }

  setBusy(state) {
    this.wrapper.classList.toggle('cmdk-loading', state);
  }

  /**
   * Surfaces a brief status line beneath the result panel — used for
   * transient "Executing…" feedback and the last error message. Clears
   * itself after a few seconds so it never becomes stale chrome.
   */
  setStatus(message, isError = false) {
    if (!this.statusEl) return;

    clearTimeout(this._statusTimer);

    if (!message) {
      this.statusEl.style.display = 'none';
      this.statusEl.textContent = '';
      return;
    }

    this.statusEl.textContent = message;
    this.statusEl.style.display = 'block';
    this.statusEl.classList.toggle('cmdk-status--error', isError);

    if (isError) {
      this._statusTimer = setTimeout(() => this.setStatus(null), 4000);
    }
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Search Orchestration                                         */
  /* ───────────────────────────────────────────────────────────── */

  _hasQuery() {
    return !!(this.editor.textContent || '').trim();
  }

  /**
   * Entry point called on every input event.
   * Debounces dynamic (async) lookups, but local/static suggestions
   * render immediately for a snappy feel.
   */
  onQueryChange() {

    if (!this._hasQuery()) {
      clearTimeout(this._debounceTimer);
      this.renderHome();
      return;
    }

    const parsed = this.parseInput((this.editor.textContent || '').trim());
    const needsDynamicLookup = !!(
      this.registry[parsed.namespace]?.actions?.[parsed.action]
    );

    clearTimeout(this._debounceTimer);

    if (!needsDynamicLookup) {
      // Pure local fuzzy match across the registry — cheap, render now.
      this.runSearch();
      return;
    }

    // A dynamicSuggestions() call is about to fire — debounce so we don't
    // hammer the registry/network on every keystroke while typing a query.
    this._debounceTimer = setTimeout(() => {
      this.runSearch();
    }, 160);
  }

  /**
   * Builds the grouped result set for the current editor text.
   * Uses a monotonic token so a slow dynamicSuggestions() call from
   * a stale keystroke can never clobber a newer render.
   */
  async runSearch() {

    const token = ++this._searchToken;
    const raw = this.editor.textContent || '';
    const text = raw.trim();

    if (!text) {
      this.renderHome();
      return;
    }

    this.viewMode = 'results';
    const parsed = this.parseInput(text);
    const ns = this.registry[parsed.namespace];

    let groups = [];

    // Case 1 — namespace + action recognized: ask for dynamic suggestions
    if (ns && parsed.action && ns.actions?.[parsed.action]) {

      const action = ns.actions[parsed.action];
      this.setBusy(true);

      let dynamic = [];
      if (action.dynamicSuggestions) {
        try {
          dynamic = (await action.dynamicSuggestions(parsed.query)) || [];
        } catch (err) {
          console.error(err);
        }
      }

      if (token !== this._searchToken) return; // stale — newer search superseded this
      this.setBusy(false);

      const MAX_DYNAMIC = 24;
      const overflow = Math.max(0, dynamic.length - MAX_DYNAMIC);
      const visible = dynamic.slice(0, MAX_DYNAMIC);

      groups = [{
        key: `${parsed.namespace}-${parsed.action}`,
        label: `${ns.label} → ${parsed.action}`,
        icon: action.icon || ns.icon,
        items: visible.map(d => this._normalizeItem(d, { group: `${parsed.namespace}-${parsed.action}` })),
        overflow
      }];

    } else {
      // Case 2 — broad fuzzy search across every namespace + action
      groups = this._fuzzySearchRegistry(text);
    }

    if (token !== this._searchToken) return;

    this.currentGroups = groups;
    this._rebuildFlatItems();
    this.render();
  }

  _fuzzySearchRegistry(text) {

    const MAX_PER_GROUP = 8;
    const MAX_GROUPS = 6;

    const nsScored = [];
    const actionGroups = {};

    Object.entries(this.registry).forEach(([nsKey, nsCfg]) => {

      const nsScore = this.fuzzyScore(`${nsKey} ${nsCfg.label}`, text);

      if (nsScore >= 0) {
        nsScored.push({
          item: this._normalizeItem({
            label: nsCfg.label,
            desc: nsCfg.desc,
            icon: nsCfg.icon,
            commandBadge: nsKey,
            autocomplete: `${nsKey} `,
            size: nsScore > 0.7 ? 'wide' : 'normal',
            action: () => this.setInputValue(`${nsKey} `)
          }, { group: 'namespaces' }),
          score: nsScore
        });
      }

      Object.entries(nsCfg.actions || {}).forEach(([act, cfg]) => {

        const cmd = `${nsKey} ${act}`;
        const score = Math.max(
          this.fuzzyScore(cmd, text),
          this.fuzzyScore(`${nsCfg.label} ${act}`, text)
        );

        if (score < 0) return;

        const groupKey = nsKey;
        if (!actionGroups[groupKey]) {
          actionGroups[groupKey] = {
            key: groupKey,
            label: nsCfg.label,
            icon: nsCfg.icon,
            items: []
          };
        }

        actionGroups[groupKey].items.push({
          score,
          item: this._normalizeItem({
            label: `${act[0].toUpperCase()}${act.slice(1)}`,
            desc: cfg.desc,
            icon: cfg.icon || nsCfg.icon,
            commandBadge: cmd,
            autocomplete: `${cmd} `,
            action: () => this.setInputValue(`${cmd} `)
          }, { group: groupKey })
        });
      });
    });

    const groups = [];

    if (nsScored.length) {
      nsScored.sort((a, b) => b.score - a.score);
      groups.push({
        key: 'namespaces',
        label: 'Modules',
        icon: 'fa-solid fa-shapes',
        items: nsScored.slice(0, MAX_PER_GROUP).map(s => s.item),
        overflow: Math.max(0, nsScored.length - MAX_PER_GROUP)
      });
    }

    const actionGroupList = Object.values(actionGroups).map(group => {
      group.items.sort((a, b) => b.score - a.score);
      const total = group.items.length;
      group.overflow = Math.max(0, total - MAX_PER_GROUP);
      group.items = group.items.slice(0, MAX_PER_GROUP).map(i => i.item);
      group._totalMatches = total;
      return group;
    });

    // Highest-signal group first (most total matches), capped to a sane
    // number of visible groups so a registry with thousands of commands
    // never paints more than a screenful of DOM at once.
    actionGroupList.sort((a, b) => b._totalMatches - a._totalMatches);

    groups.push(...actionGroupList.slice(0, MAX_GROUPS));

    return groups;
  }

  /**
   * Normalizes a suggestion item from a registry so older items
   * (missing group/size/preview) still render correctly.
   */
  _normalizeItem(raw, fallback = {}) {
    return {
      label: raw.label || '',
      desc: raw.desc || '',
      icon: raw.icon || 'fa-solid fa-circle',
      commandBadge: raw.commandBadge || '',
      autocomplete: raw.autocomplete || null,
      action: raw.action || null,
      group: raw.group || fallback.group || 'results',
      size: raw.size || 'normal',          // 'hero' | 'wide' | 'normal' | 'compact'
      preview: raw.preview || null,
      meta: raw.meta || null,
      kbd: raw.kbd || null
    };
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Home Surface (zero-query Command Center)                     */
  /* ───────────────────────────────────────────────────────────── */

  async renderHome() {

    this.viewMode = 'home';
    await this._resolveContextProviders();

    const groups = [];

    if (this.context.contextualActions?.length) {
      groups.push({
        key: 'contextual',
        label: 'On this page',
        icon: 'fa-solid fa-location-crosshairs',
        items: this.context.contextualActions.map(i => this._normalizeItem(i, { group: 'contextual' }))
      });
    }

    if (this.context.quickActions?.length) {
      groups.push({
        key: 'quick',
        label: 'Quick actions',
        icon: 'fa-solid fa-bolt',
        items: this.context.quickActions.map(i => this._normalizeItem(i, { group: 'quick' }))
      });
    }

    if (this.context.recents?.length) {
      groups.push({
        key: 'recents',
        label: 'Recent',
        icon: 'fa-solid fa-clock-rotate-left',
        items: this.context.recents.slice(0, 6).map(i => this._normalizeItem(i, { group: 'recents', size: 'compact' }))
      });
    }

    if (this.context.ai?.length) {
      groups.push({
        key: 'ai',
        label: 'AI tools',
        icon: 'fa-solid fa-sparkles',
        items: this.context.ai.map(i => this._normalizeItem(i, { group: 'ai' }))
      });
    }

    const moduleItems = Object.entries(this.registry).map(([ns, cfg]) =>
      this._normalizeItem({
        label: cfg.label,
        desc: cfg.desc,
        icon: cfg.icon,
        commandBadge: ns,
        autocomplete: `${ns} `,
        action: () => this.setInputValue(`${ns} `)
      }, { group: 'modules' })
    );

    if (moduleItems.length) {
      groups.push({
        key: 'modules',
        label: 'Browse modules',
        icon: 'fa-solid fa-grid-2',
        items: moduleItems
      });
    }

    this.currentGroups = groups;
    this._rebuildFlatItems();
    this.render();
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Flatten (for keyboard nav across a 2D grid)                  */
  /* ───────────────────────────────────────────────────────────── */

  _rebuildFlatItems() {
    this.flatItems = [];
    this.currentGroups.forEach(group => {
      group.items.forEach(item => {
        this.flatItems.push(item);
      });
    });
    if (this.selectedIndex >= this.flatItems.length) {
      this.selectedIndex = 0;
    }
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Render                                                       */
  /* ───────────────────────────────────────────────────────────── */

  render() {

    this.dropdown.innerHTML = '';
    this.dropdown.classList.toggle('cmdk-dropdown--home', this.viewMode === 'home');
    this.dropdown.classList.toggle('cmdk-dropdown--results', this.viewMode === 'results');

    if (!this.flatItems.length) {
      this.dropdown.innerHTML = `
        <div class="cmdk-empty">
          <i class="fa-solid fa-ghost cmdk-empty__icon"></i>
          <div class="cmdk-empty__title">Nothing matches that</div>
          <div class="cmdk-empty__desc">Try a module name like <kbd>layout</kbd> or <kbd>menu</kbd></div>
        </div>
      `;
      this.renderPreview(null);
      return;
    }

    let globalIndex = 0;
    const frag = document.createDocumentFragment();

    this.currentGroups.forEach(group => {
      if (!group.items.length) return;

      const section = document.createElement('div');
      section.className = 'cmdk-section';
      section.dataset.group = group.key;

      const header = document.createElement('div');
      header.className = 'cmdk-section__header';
      header.innerHTML = `
        <i class="${group.icon || 'fa-solid fa-layer-group'}"></i>
        <span>${group.label}</span>
        ${group.overflow ? `<span class="cmdk-section__overflow">+${group.overflow} more — refine your search</span>` : ''}
      `;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'cmdk-grid';

      const balancedItems = this._balanceTrailingGap(group.items);

      balancedItems.forEach(item => {
        const index = globalIndex++;
        grid.appendChild(this._renderTile(item, index));
      });

      section.appendChild(grid);
      frag.appendChild(section);
    });

    this.dropdown.appendChild(frag);

    // keep selection visible
    const activeEl = this.dropdown.querySelector('.cmdk-tile--active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }

    this.renderPreview(this.flatItems[this.selectedIndex]);
  }

  /**
   * Walks a group's items as the 4-column grid would lay them out and
   * promotes a lone trailing 'normal' (span-2) tile to 'wide' (span-4)
   * if it would otherwise dangle alone in a half-empty row.
   * Returns a new array — never mutates the original items.
   */
  _balanceTrailingGap(items) {

    const SPAN = { hero: 4, wide: 4, normal: 2, compact: 1 };
    const COLS = 4;

    let cursor = 0;
    const result = items.map(item => {
      const span = SPAN[item.size] || 2;
      if (cursor + span > COLS) cursor = 0; // wraps to a new row
      const startCol = cursor;
      cursor += span;
      if (cursor >= COLS) cursor = 0;
      return { item, span, startCol };
    });

    const last = result[result.length - 1];
    const isLoneInRow =
      last &&
      last.item.size === 'normal' &&
      last.startCol === 0; // started a fresh row with nothing after it

    if (isLoneInRow) {
      return items.map((it, i) =>
        i === result.length - 1 ? { ...it, size: 'wide' } : it
      );
    }

    return items;
  }

  _renderTile(item, index) {

    const el = document.createElement('div');
    const isActive = index === this.selectedIndex;

    el.className = `cmdk-tile cmdk-tile--${item.size} ${isActive ? 'cmdk-tile--active' : ''}`;
    el.dataset.index = String(index);
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', isActive ? 'true' : 'false');

    el.innerHTML = `
      <div class="cmdk-tile__icon"><i class="${item.icon}"></i></div>
      <div class="cmdk-tile__body">
        <div class="cmdk-tile__label">
          <span>${item.label}</span>
          ${item.commandBadge ? `<kbd class="cmdk-tile__badge">${item.commandBadge}</kbd>` : ''}
        </div>
        ${item.desc ? `<div class="cmdk-tile__desc">${item.desc}</div>` : ''}
        ${item.meta ? `<div class="cmdk-tile__meta">${item.meta}</div>` : ''}
      </div>
      ${item.kbd ? `<div class="cmdk-tile__kbd">${item.kbd}</div>` : ''}
    `;

    el.addEventListener('mousemove', e => this.handleMouseMove(e, index));

    el.addEventListener('click', e => {
      e.stopPropagation();
      this._activate(item);
    });

    return el;
  }

  _activate(item) {
    if (item.autocomplete) {
      this.setInputValue(item.autocomplete);
    } else if (item.action) {
      this.executeAction(item.action, {}, item);
    }
  }

  handleMouseMove(e, index) {

    if (e.screenX === this.lastMouseX && e.screenY === this.lastMouseY) return;

    this.lastMouseX = e.screenX;
    this.lastMouseY = e.screenY;

    if (this.selectedIndex === index) return;

    this.selectedIndex = index;
    this._updateActiveTileOnly();
  }

  /** Cheaper than a full re-render — just toggles classes + preview */
  _updateActiveTileOnly() {
    this.dropdown.querySelectorAll('.cmdk-tile').forEach(el => {
      const idx = Number(el.dataset.index);
      const active = idx === this.selectedIndex;
      el.classList.toggle('cmdk-tile--active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    this.renderPreview(this.flatItems[this.selectedIndex]);
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Input                                                        */
  /* ───────────────────────────────────────────────────────────── */

  setInputValue(val) {
    this.editor.textContent = val;
    this.placeCaretEnd();
    this.onQueryChange();
  }

  placeCaretEnd() {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(this.editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Open / Close                                                 */
  /* ───────────────────────────────────────────────────────────── */

  open() {

    if (this.isOpen) return;

    this.isOpen = true;
    this.selectedIndex = 0;

    document.body.classList.add('cmdk-lock');
    this.wrapper.classList.add('cmdk--open');

    requestAnimationFrame(() => {
      this.editor.focus();
      this.placeCaretEnd();

      if (this._hasQuery()) {
        this.runSearch();
      } else {
        this.renderHome();
      }
    });
  }

  close() {

    if (!this.isOpen) return;

    this.isOpen = false;

    document.body.classList.remove('cmdk-lock');
    this.wrapper.classList.remove('cmdk--visible');
    this.setStatus(null);

    setTimeout(() => {
      if (!this.isOpen) {
        this.wrapper.classList.remove('cmdk--open');
      }
    }, 180);
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  /* ───────────────────────────────────────────────────────────── */
  /* Keyboard + Events                                            */
  /* ───────────────────────────────────────────────────────────── */

  bind() {

    // Global toggle
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Click palette opens it
    this.wrapper.addEventListener('mousedown', e => {
      if (this.overlay.contains(e.target)) return;
      if (!this.isOpen) this.open();
    });

    // Input updates
    this.editor.addEventListener('input', () => {
      if (!this.isOpen) this.open();
      this.onQueryChange();
    });

    // Keyboard navigation
    this.editor.addEventListener('keydown', e => {

      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }

      // Up/Down always step one item at a time through the flattened list,
      // in the exact order items are rendered — never by visual column
      // count, since that caused selection to jump across section
      // boundaries when adjacent sections had different grid widths.
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._moveSelection(1);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._moveSelection(-1);
        return;
      }

      // Left/Right are intentionally left alone here so they behave like
      // normal text-caret movement inside the editor. Pair with Shift to
      // select text, exactly as any other text input would.

      if (e.key === 'Enter') {
        e.preventDefault();
        const item = this.flatItems[this.selectedIndex];
        if (!item) return;
        this._activate(item);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const item = this.flatItems[this.selectedIndex];
        if (!item?.autocomplete) return;
        this.setInputValue(item.autocomplete);
      }
    });

    // Outside click closes
    document.addEventListener('mousedown', e => {

      const insidePalette = this.wrapper.contains(e.target);
      const insideDropdown = this.dropdown.contains(e.target);
      const insidePopup = this.overlay.contains(e.target);

      if (insidePalette || insideDropdown || insidePopup) return;

      this.close();
    });
  }

  _moveSelection(delta) {
    if (!this.flatItems.length) return;
    const len = this.flatItems.length;
    this.selectedIndex = ((this.selectedIndex + delta) % len + len) % len;
    this._updateActiveTileOnly();

    const activeEl = this.dropdown.querySelector('.cmdk-tile--active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new CMDKEngine();
});
