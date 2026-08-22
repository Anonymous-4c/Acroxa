// ../acrx/assets/js/customizer.js
// Acroxa CMS — Visual Layout Customizer Runtime
// Full rewrite with:
//  - Inspector e.preventDefault fix (delegated from iframe document)
//  - Auto-fill saved config/settings on boot
//  - Layout switcher: preview-only vs. activate separately
//  - AI sparkle popups (identity, colors, typography)
//  - Topbar hide / preview-controls hide / fullscreen
//  - Dynamic schema-driven section rendering from meta.json config
//  - Menu slot assignment panel
//  - CSS variable live preview in iframe
        const params = new URLSearchParams(window.location.search);
        const layout_id = params.get("layout");
          const root_el = document.querySelector(".customizer-root");

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  const root = document.querySelector(".customizer-root");
  if (!root) { console.warn("[Customizer] Root not found."); return; }

  // ─────────────────────────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────────────────────────

  const API_BASE      = "/acr/api/layouts";
  const SETTINGS_BASE = "/acr/api/system";
  const MEDIA_BASE    = "/acr/api/media";
  const MENUS_BASE    = "/acr/api/menus";
  const AI_BASE       = "/acr/api/ai";
  const PREVIEW_BASE  = "/acr/api/layouts/preview";

  const VIEWPORTS = {
    desktop: { width: "100%" },
    laptop:  { width: "1440px" },
    tablet:  { width: "768px" },
    mobile:  { width: "390px" },
    custom:  { width: null },
  };

  const LS = {
    INSPECTOR:  "acroxa_inspector",
    SIDEBAR:    "acroxa_sidebar_collapsed",
    CTRL_BAR:   "acroxa_ctrlbar_hidden",
    TOPBAR:     "acroxa_topbar_hidden",
    FULLSCREEN: "acroxa_fullscreen",
  };

  // ─────────────────────────────────────────────────────────────
  // STORE
  // ─────────────────────────────────────────────────────────────
        if (!layout_id || layout_id == null){
        }
        else{
          root.dataset.layout = layout_id;
        }
  const store = {
    layoutId:       root.dataset.layout || "",
    previewLayoutId: null,   // layout being previewed (may differ from active)
    activeRoute:    "/",
    viewport:       "desktop",
    zoom:           100,
    routes:         [],
    liveReload:     true,
    unsavedChanges: false,
    pendingConfig:  {},
    savedConfig:    {},
    resetSchema: {}, 
    schema:         {},      // from meta.json config
    uiSchema:       {},      // from meta.config.js ui overrides
    activeSection:  null,
    installedLayouts: [],
    activeLayoutId:   null,  // confirmed live layout
    settings: { general: {}, ai: {}, content: {} },
    menus:    [],
    menuSlots: {},
    inspector: { enabled: false, lastData: null },
    fullscreen: false,
    autoSave: false,
    autoSaveDelayMs: 900,
    _autoSaveTimer: null,
    _autoSaveInFlight: false,
    _builtInLayoutDocClickBound: false,
    _schemaDropdownDocClickBound: false,
  };

  window.customizerStore = store;

  // ─────────────────────────────────────────────────────────────
  // ELEMENT HELPERS
  // ─────────────────────────────────────────────────────────────

  const get      = (id) => document.getElementById(id);
  const getIframe = () => get("preview-iframe");

  const frameOuter     = get("frame-outer");
  const routeDropdown  = get("route-dropdown");
  const routeTrigger   = get("route-trigger");
  const routeLabel     = get("route-label");
  const routeIcon      = get("route-icon");
  const previewLoading = get("preview-loading");
  const previewError   = get("preview-error");
  const zoomLabel      = get("zoom-label");
  const panelTabs      = get("panel-tabs");
  const panelContent   = get("panel-content");
  const panelLoading   = get("panel-loading");
  const unsavedBadge   = get("unsaved-badge");
  const layoutNameText = get("layout-name-text");

  // ─────────────────────────────────────────────────────────────
  // ORIENTATION GUARD
  // ─────────────────────────────────────────────────────────────

  (function initOrientationGuard() {
    if (!get("orientation-popup")) {
      const popup = document.createElement("div");
      popup.id = "orientation-popup";
      popup.innerHTML = `<div class="orient-popup-inner">
        <i class="fa-duotone fa-rotate-right orient-icon"></i>
        <h2>Better on a wider screen</h2>
        <p>The customizer needs more room.<br>
           On a phone: <strong>rotate to landscape</strong>.<br>
           On desktop: <strong>zoom out</strong> or <strong>go full-screen</strong>.</p>
        <button id="orient-dismiss">Continue anyway</button></div>`;
      document.body.appendChild(popup);
      get("orient-dismiss")?.addEventListener("click", () => {
        popup.classList.add("hidden");
        localStorage.setItem("acroxa_orient_dismissed", "1");
      });
    }
    function checkSize() {
      const popup = get("orientation-popup");
      if (!popup || localStorage.getItem("acroxa_orient_dismissed")) return;
      popup.classList.toggle("hidden", !(window.innerWidth < 900 || window.innerWidth < window.innerHeight));
    }
    checkSize();
    window.addEventListener("resize", checkSize);
    window.addEventListener("orientationchange", () => setTimeout(checkSize, 200));
  })();

  // ─────────────────────────────────────────────────────────────
  // PREVIEW SRC
  // ─────────────────────────────────────────────────────────────

  function buildPreviewSrc(url) {
    const id = store.previewLayoutId || store.layoutId;
    return `${PREVIEW_BASE}?${new URLSearchParams({ id, url: url || "/" })}`;
  }

  function showPreviewLoading(show = true) {
    if (previewLoading) previewLoading.style.display = show ? "flex" : "none";
  }
  function showPreviewError(msg) {
    if (!previewError) return;
    previewError.style.display = "flex";
    const el = get("preview-error-message");
    if (el) el.textContent = msg;
  }
  function hidePreviewError() {
    if (previewError) previewError.style.display = "none";
  }

  // ─────────────────────────────────────────────────────────────
  // IFRAME EVENTS + INSPECTOR FIX
  // ─────────────────────────────────────────────────────────────

  function bindIframeEvents() {
    const iframe = getIframe();
    if (!iframe) return;

    iframe.addEventListener("load", () => {
      showPreviewLoading(false);
      hidePreviewError();
      _injectInspectorScript();
      _bindIframeClicks();
    });
    iframe.addEventListener("error", () => {
      showPreviewLoading(false);
      showPreviewError("Failed to load preview.");
    });

    // Inspector messages from iframe
    window.addEventListener("message", (e) => {
      if (e.data?.source !== "acroxa-inspector") return;
      if (e.data.type === "inspect.data") _renderInspectorPanel(e.data.payload);
    });
  }

  // Bind click delegation inside the iframe for navigation + inspector
  function _bindIframeClicks() {
    const iframe = getIframe();
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      doc.addEventListener("click", (e) => {
        // ── Inspector: capture element data ──────────────────────────────
        if (store.inspector.enabled) {
          e.preventDefault();
          e.stopPropagation();

          const el      = e.target;
          const parents = [];
          let   cur     = el.parentElement;
          let   depth   = 0;
          while (cur && cur !== doc.body && depth < 5) {
            parents.unshift(`${cur.tagName.toLowerCase()}${cur.id ? "#" + cur.id : ""}${cur.className ? "." + [...cur.classList].join(".") : ""}`);
            cur = cur.parentElement;
            depth++;
          }

          window.postMessage({
            source: "acroxa-inspector",
            type:   "inspect.data",
            payload: {
              tag:     el.tagName.toLowerCase(),
              id:      el.id || "",
              classes: [...el.classList],
              dataset: { ...el.dataset },
              styles:  _getInlineStyles(el),
              depth:   depth,
              parents: parents,
            },
          }, "*");
          return;
        }

        // ── Navigation: intercept internal links ──────────────────────────
        const a = e.target.closest("a");
        if (!a) return;
        const href = (a.getAttribute('href') || '').trim();

        if (
            !href ||
            href === '#' ||
            href.startsWith('#') ||
            href === 'javascript:void(0)' ||
            href === 'javascript:;' ||
            href.startsWith('javascript:')
        ) {
            return;
        }
        if (!href || href.startsWith("http") || href.startsWith("//")) return;
        e.preventDefault();
        navigateTo(href);
      }, true); // capture phase ensures e.preventDefault() fires before the link
    } catch (_) {
      // Cross-origin; can't access iframe document
    }
  }

  function _getInlineStyles(el) {
    const result = {};
    const style  = el.style;
    for (let i = 0; i < style.length; i++) {
      const k = style[i];
      result[k] = style.getPropertyValue(k);
    }
    return result;
  }

  function _injectInspectorScript() {
    const iframe = getIframe();
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      // Re-send current state in case iframe reloaded
      iframe.contentWindow?.postMessage({
        source: "acroxa-customizer", type: "inspect.toggle", enabled: store.inspector.enabled,
      }, "*");
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────
  // NAVIGATION
  // ─────────────────────────────────────────────────────────────

  function navigateTo(url, meta = {}) {
    const iframe = getIframe();
    if (!iframe) return;
    store.activeRoute = url;
    showPreviewLoading(true);
    iframe.src = buildPreviewSrc(url);
    if (routeLabel) routeLabel.textContent = meta.label || url;
    if (routeIcon)  routeIcon.innerHTML    = _icon(meta.icon || "file");
  }

  function refreshPreview() {
    const iframe = getIframe();
    if (iframe && store.liveReload) iframe.src = buildPreviewSrc(store.activeRoute);
  }

  // ─────────────────────────────────────────────────────────────
  // ROUTES
  // ─────────────────────────────────────────────────────────────

  async function loadRoutes() {
    try {
      const id  = store.previewLayoutId || store.layoutId;
      const res = await fetch(`${API_BASE}/preview/routes?id=${id}`);
      const data = await res.json();
      store.routes = data.routes || [];
      renderRouteDropdown(store.routes);
    } catch (err) {
      console.error("[Customizer] loadRoutes:", err);
    }
  }

  function renderRouteDropdown(routes) {
    if (!routeDropdown) return;
    routeDropdown.innerHTML = "";
    routes.forEach(route => {
      const btn = document.createElement("button");
      btn.className = "route-option";
      btn.innerHTML = `${_icon(route.icon || "file")} <span>${route.label}</span>`;
      btn.addEventListener("click", () => { navigateTo(route.path, route); closeRouteDropdown(); });
      routeDropdown.appendChild(btn);
    });
  }

  function openRouteDropdown()  { routeDropdown?.classList.add("open"); }
  function closeRouteDropdown() { routeDropdown?.classList.remove("open"); }

  routeTrigger?.addEventListener("click", (e) => { e.stopPropagation(); routeDropdown?.classList.toggle("open"); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#route-selector")) closeRouteDropdown(); });

  // ─────────────────────────────────────────────────────────────
  // VIEWPORTS
  // ─────────────────────────────────────────────────────────────

  function applyViewport(viewport, customWidth = null) {
    store.viewport = viewport;
    const iframe   = getIframe();
    if (!iframe || !frameOuter) return;
    const vp    = VIEWPORTS[viewport] || VIEWPORTS.desktop;
    const width = viewport === "custom" ? `${customWidth}px` : vp.width;
    frameOuter.style.width    = width;
    frameOuter.style.maxWidth = width;
    document.querySelectorAll(".viewport-btn").forEach(btn =>
      btn.classList.toggle("active", btn.dataset.viewport === viewport)
    );
  }

  document.querySelectorAll(".viewport-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const vp = btn.dataset.viewport;
      if (vp === "custom") { get("custom-viewport-input")?.classList.toggle("open"); return; }
      applyViewport(vp);
    });
  });
  get("btn-apply-viewport")?.addEventListener("click", () => {
    const w = parseInt(get("custom-width-input")?.value, 10);
    if (w > 0) applyViewport("custom", w);
  });

  // ─────────────────────────────────────────────────────────────
  // ZOOM
  // ─────────────────────────────────────────────────────────────

  function setZoom(percent) {
    const iframe = getIframe();
    if (!iframe) return;
    store.zoom = Math.max(25, Math.min(200, percent));
    iframe.style.transform       = `scale(${store.zoom / 100})`;
    iframe.style.transformOrigin = "top left";
    if (zoomLabel) zoomLabel.textContent = `${store.zoom}%`;
  }

  get("btn-zoom-in") ?.addEventListener("click", () => setZoom(store.zoom + 10));
  get("btn-zoom-out")?.addEventListener("click", () => setZoom(store.zoom - 10));
  get("btn-zoom-fit")?.addEventListener("click", () => setZoom(100));

  // ─────────────────────────────────────────────────────────────
  // TOPBAR / CONTROLS BAR / FULLSCREEN TOGGLES
  // ─────────────────────────────────────────────────────────────

function _applyTopbarState() {
  const hidden = !!localStorage.getItem(LS.TOPBAR);
  const bar    = document.querySelector(".customizer-topbar");
  const btn    = get("btn-hide-topbar");
 
  if (bar) root.classList.toggle("hidden", hidden);
  if (btn) btn.classList.toggle("active", hidden);
  _syncShowTopbarBtn();
}
 

  function _applyCtrlBarState() {
    const hidden = !!localStorage.getItem(LS.CTRL_BAR);
    const bar = document.querySelector(".preview-controls");
    if (bar) bar.style.display = hidden ? "none" : "";
  }

  function _applyFullscreen() {
    const on = !!localStorage.getItem(LS.FULLSCREEN);
    store.fullscreen = on;
    root.classList.toggle("customizer-fullscreen", on);
    const btn = get("btn-fullscreen");
    if (btn) btn.classList.toggle("active", on);
    if (btn) btn.title = on ? "Exit fullscreen" : "Fullscreen preview";
  }

  // Inject extra topbar buttons (hide topbar + fullscreen) if not already in DOM
  function _injectTopbarControls() {
    const right = document.querySelector(".topbar-right");
    if (!right || get("btn-hide-topbar")) return;

    // Hide topbar toggle
    const btnTopbar = document.createElement("button");
    btnTopbar.id        = "btn-hide-topbar";
    btnTopbar.className = "topbar-btn ghost";
    btnTopbar.title     = "Hide topbar";
    btnTopbar.innerHTML = `<i class="fa-regular fa-chevron-up"></i>`;
    btnTopbar.addEventListener("click", () => {
      const hidden = !!localStorage.getItem(LS.TOPBAR);
      if (hidden) { localStorage.removeItem(LS.TOPBAR); } else { localStorage.setItem(LS.TOPBAR, "1"); }
      _applyTopbarState();
    });
    right.insertBefore(btnTopbar, right.firstChild);

    // Fullscreen toggle
    const btnFS = document.createElement("button");
    btnFS.id        = "btn-fullscreen";
    btnFS.className = "topbar-btn ghost";
    btnFS.title     = "Fullscreen preview";
    btnFS.innerHTML = `<i class="fa-regular fa-expand"></i>`;
    btnFS.addEventListener("click", () => {
      if (store.fullscreen) { localStorage.removeItem(LS.FULLSCREEN); } else { localStorage.setItem(LS.FULLSCREEN, "1"); }
      _applyFullscreen();
    });
    right.insertBefore(btnFS, right.firstChild);

    // Show-topbar restore button (shown when topbar is hidden, positioned top-left)
    if (!get("btn-show-topbar")) {
      const btnShow = document.createElement("button");
      btnShow.id        = "btn-show-topbar";
      btnShow.className = "topbar-restore-btn";
      btnShow.innerHTML = `<i class="fa-regular fa-chevron-down"></i>`;
      btnShow.style.cssText = `
        position:fixed;top:0;left:50%;transform:translateX(-50%);
        z-index:9999;background:var(--color-primary-600,#3b4fd8);
        border:none;border-radius:0 0 8px 8px;padding:4px 18px;
        color:#fff;cursor:pointer;display:none;`;
      btnShow.addEventListener("click", () => {
        localStorage.removeItem(LS.TOPBAR);
        _applyTopbarState();
        btnShow.style.display = "none";
      });
      document.body.appendChild(btnShow);
    }
  }

  // Hook for "show-topbar" when topbar is hidden
  function _syncShowTopbarBtn() {
    const btn = get("btn-show-topbar");
    if (!btn) return;
    btn.style.display = localStorage.getItem(LS.TOPBAR) ? "block" : "none";
  }

  // ─────────────────────────────────────────────────────────────
  // CONFIG LOAD + SAVE
  // ─────────────────────────────────────────────────────────────

async function loadConfig() {
  try {
    const res  = await fetch(`${API_BASE}/${store.layoutId}/config`);
    const data = await res.json();

    // ── Schema (structure only, never values during normal render) ──
    store.schema     = data.schema   || {};
    store.uiSchema   = data.uiSchema || {};
    store.resetSchema = deepClone(data.schema || {}); // STEP 5: kept for Reset workflow only

    // ── Raw config from DB (source of truth) ──
    const rawConfig = data.config || {};

    // STEP 6: Audit nested-section merging.
    // Previous code merged top-level keys (colors, typography,
    // homepage, animations) into config.layout.  This caused
    // schema defaults to contaminate pendingConfig on every load.
    //
    // New policy:
    //  - If the DB record already has config.layout.colors etc.,
    //    use it as-is.
    //  - If the DB record has top-level colors/typography (legacy
    //    shape from an older save), migrate them into config.layout
    //    exactly once and mark dirty so the next save normalises.
    //  - Schema defaults are NOT merged here under any circumstance.
    const legacySections = ["colors", "typography", "homepage", "animations"];
    let didMigrate = false;
    const config = deepClone(rawConfig);

    if (!config.layout) config.layout = {};

    legacySections.forEach(section => {
      if (config[section] && typeof config[section] === "object") {
        // Migrate: merge legacy top-level value into layout,
        // preserving any already-correct layout sub-key.
        config.layout[section] = {
          ...config[section],
          ...(config.layout[section] || {}), // layout sub-key wins
        };
        delete config[section];
        didMigrate = true;
      }
    });

    store.savedConfig   = deepClone(config);
    store.pendingConfig = deepClone(config);

    if (didMigrate) {
      markDirty(); // prompt user to save the normalised shape
    }


    renderSidebarSections();
    if (panelLoading) panelLoading.style.display = "none";
  } catch (err) {
    console.error("[Customizer] loadConfig:", err);
  }
}

function markDirty() {
  const dirty =
    JSON.stringify(store.pendingConfig) !==
    JSON.stringify(store.savedConfig);

  store.unsavedChanges = dirty;

  if (unsavedBadge) {
    unsavedBadge.style.display = dirty ? "flex" : "none";
  }

  return dirty;
}

  async function _flushLayoutConfig({ silent = true } = {}) {
    if (store._autoSaveInFlight) return;
    store._autoSaveInFlight = true;
    try {
      const res = await fetch(`${API_BASE}/${store.layoutId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: store.pendingConfig }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      store.savedConfig = deepClone(store.pendingConfig);
      markDirty();
      if (!silent) System?.showToast?.("Saved.", "success");
    } catch (err) {
      if (!silent) System?.showToast?.(`Save failed: ${err.message}`, "error");
    } finally {
      store._autoSaveInFlight = false;
    }
  }

  function _scheduleAutoSave() {
    if (!store.autoSave) return;
    clearTimeout(store._autoSaveTimer);
    store._autoSaveTimer = setTimeout(() => {
      if (store.unsavedChanges) _flushLayoutConfig({ silent: true });
    }, store.autoSaveDelayMs);
  }

  get("btn-save")?.addEventListener("click", async () => {
    try {
      const res = await fetch(`${API_BASE}/${store.layoutId}/config`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: store.pendingConfig }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      store.savedConfig = deepClone(store.pendingConfig);
      markDirty();
      System?.showToast?.("Saved.", "success");
    } catch (err) {
      System?.showToast?.(`Save failed: ${err.message}`, "error");
    }
  });

  get("btn-revert")?.addEventListener("click", () => {
    store.pendingConfig = deepClone(store.savedConfig);
    activateSection(store.activeSection || SIDEBAR_SECTIONS[0]?.id);
    markDirty();
    refreshPreview();
  });

function _setPending(section, key, value, replace = false) {
  // STEP 8: Debug log
 
  const nestedUnderLayout = new Set(["colors", "typography", "homepage", "animations", "layout", "layout_sidebar", "layout_ext"]);
  const targetRoot = nestedUnderLayout.has(section)
    ? (store.pendingConfig.layout || (store.pendingConfig.layout = {}))
    : store.pendingConfig;
  const targetKey = (section === "layout" || section === "layout_sidebar" || section === "layout_ext") ? null : section;
 
  if (targetKey !== null && !targetRoot[targetKey]) targetRoot[targetKey] = {};
 
  if (replace && targetKey !== null) {
    targetRoot[targetKey] = value;
  } else if (key !== null) {
    let cur = targetKey !== null ? targetRoot[targetKey] : targetRoot;
    if (typeof key === "string" && key.includes(".")) {
      const parts = key.split(".").filter(Boolean);
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
        cur = cur[p];
      }
      cur[parts[parts.length - 1]] = value;
    } else {
      cur[key] = value;
    }
  }
 
  markDirty();
  if (store.liveReload) _injectCSSVarsLive();
  _scheduleAutoSave();
  console.log(store.pendingConfig)
}
 

  // Push CSS variables into iframe without full reload
  function _injectCSSVarsLive() {
    const iframe = getIframe();
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      let styleEl = doc.getElementById("customizer-live-vars");
      if (!styleEl) {
        styleEl    = doc.createElement("style");
        styleEl.id = "customizer-live-vars";
        doc.head?.appendChild(styleEl);
      }
      styleEl.textContent = _buildCSSVarsString(store.pendingConfig);
    } catch (_) {}
  }

  function _buildCSSVarsString(config) {
    const lines = [];
    const colors = config?.layout?.colors || config?.colors || {};
    for (const [k, v] of Object.entries(colors)) {
      if (v) lines.push(`  --layout-color-${_kebab(k)}: ${v};`);
    }
    const typo = config?.layout?.typography || config?.typography || {};
    for (const [k, v] of Object.entries(typo)) {
      if (v !== null && v !== undefined) {
        lines.push(`  --layout-${_kebab(k)}: ${typeof v === "number" ? v + "px" : v};`);
      }
    }
    return lines.length ? `:root {\n${lines.join("\n")}\n}` : "";
  }

  // ─────────────────────────────────────────────────────────────
  // SSE
  // ─────────────────────────────────────────────────────────────

  function initSSE() {
    if (!window.EventSource) return;
    try {
      const sse = new EventSource(`${API_BASE}/sse`);
      sse.addEventListener("layout.updated", () => { if (store.liveReload) refreshPreview(); });
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────
  // PANEL COLLAPSE
  // ─────────────────────────────────────────────────────────────

  function _togglePanel() {
    const panel     = get("customizer-panel");
    const collapsed = panel?.classList.toggle("collapsed");
    localStorage.setItem(LS.SIDEBAR, collapsed ? "1" : "");
  }

  get("panel-toggle")?.addEventListener("click",       _togglePanel);
  get("panel-toggle-inner")?.addEventListener("click", _togglePanel);

  if (localStorage.getItem(LS.SIDEBAR)) get("customizer-panel")?.classList.add("collapsed");

  // ─────────────────────────────────────────────────────────────
  // LAYOUT META + INSTALLED LAYOUTS
  // ─────────────────────────────────────────────────────────────

  async function loadLayoutMeta() {
    try {
      const res  = await fetch(`${API_BASE}/${store.layoutId}`);
      const data = await res.json();
      if (layoutNameText) layoutNameText.textContent = data.name || store.layoutId;
    } catch (_) {}
  }

  async function loadInstalledLayouts() {
    try {
      const [layoutsRes, activeRes] = await Promise.all([
        fetch(`${API_BASE}`),
        fetch(`${API_BASE}/get/active`),
      ]);
      store.installedLayouts = (await layoutsRes.json()) || [];
      const active = await activeRes.json();
      store.activeLayoutId = active.id || store.layoutId;
    } catch (err) {
      console.error("[Customizer] loadInstalledLayouts:", err);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SETTINGS + MENUS LOAD
  // ─────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const res  = await fetch(`${SETTINGS_BASE}`);
    const data = await res.json();
 
    if (data.data && data.section) {
      // Single-section response: { success, section, data: { siteName, ... } }
      const section = data.section;
      if (section === "general") store.settings.general = data.data || {};
      else if (section === "ai") store.settings.ai = data.data || {};
      else if (section === "content") store.settings.content = data.data || {};
    } else {
      // Multi-section flat response: { general: {}, ai: {}, content: {} }
      store.settings.general = data.general || {};
      store.settings.ai      = data.ai      || {};
      store.settings.content = data.content || {};
    }
 
    if (store.activeSection) {
      activateSection(store.activeSection);
    }
  } catch (err) {
    console.warn("[Customizer] loadSettings:", err);
  }
}
async function loadSiteIdentity() {
  try {
    const res  = await fetch(`${SETTINGS_BASE}/general`);
    const data = await res.json();
 
    // Normalise both response shapes
    const payload = data.data || data.general || {};
 
    // API wins.  Never let undefined/null overwrite a valid existing value.
    store.settings.general = {
      ...store.settings.general,
      siteName:        payload.siteName        ?? store.settings.general?.siteName        ?? "",
      siteTagline:     payload.siteTagline      ?? store.settings.general?.siteTagline     ?? "",
      siteDescription: payload.siteDescription  ?? store.settings.general?.siteDescription ?? "",
      siteLogo:        payload.siteLogo         ?? store.settings.general?.siteLogo        ?? "",
      siteFavicon:     payload.siteFavicon       ?? store.settings.general?.siteFavicon    ?? "",
      siteURL:         payload.siteURL          ?? store.settings.general?.siteURL         ?? "",
      adminEmail:      payload.adminEmail        ?? store.settings.general?.adminEmail     ?? "",
    };
 
  } catch (err) {
    console.warn("[SiteIdentity] Load failed:", err);
  }
}
function _resolveVal(dotPath, schemaDefault = "") {
  function _get(obj, path) {
    return path.split(".").reduce((cur, k) => (cur != null ? cur[k] : undefined), obj);
  }
  const fromPending = _get(store.pendingConfig, dotPath);
  const fromSaved   = _get(store.savedConfig,   dotPath);
  const resolved    = fromPending !== undefined ? fromPending
                    : fromSaved   !== undefined ? fromSaved
                    : schemaDefault;
 
  const source = fromPending !== undefined ? "pendingConfig"
               : fromSaved   !== undefined ? "savedConfig"
               : "schema.default";
  return resolved;
}
  async function loadMenus() {
    try {
      const res  = await fetch(`${MENUS_BASE}?id=${store.layoutId}`);
      const data = await res.json();
      store.menus = data.menus || [];

      const slotsRes  = await fetch(`${MENUS_BASE}/slots?id=${store.layoutId}`);
      const slotsData = await slotsRes.json();
      store.menuSlots      = slotsData.assignments || {};
      store.menuSlotNames  = slotsData.slots        || ["primary", "footer"];
    } catch (err) {
      console.warn("[Customizer] loadMenus:", err);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SIDEBAR SECTIONS
  // ─────────────────────────────────────────────────────────────

const SIDEBAR_SECTIONS = [
  { id: "site-identity", label: "Identity",   icon: "id-card"      },
  { id: "colors",        label: "Colors",     icon: "palette"      },
  { id: "typography",    label: "Typography", icon: "font"         },
  { id: "layout-nav",    label: "Layout",     icon: "layer-group"  },
  { id: "menus",         label: "Menus",      icon: "bars"         },
  { id: "layouts",       label: "Layouts",    icon: "grid-2"       },
  { id: "content",       label: "Content",    icon: "photo-film"   },
  { id: "ai-settings",   label: "AI",         icon: "robot"        },
  { id: "editor",        label: "Editor",     icon: "code"         },
  { id: "advanced",      label: "Advanced",   icon: "sliders"      },
];

  function renderSidebarSections() {
    if (!panelTabs) return;
    panelTabs.innerHTML = "";
    const base = SIDEBAR_SECTIONS.slice();

    // Auto-add schema-driven tabs (homepage, animations, etc.)
    const schemaKeys = Object.keys(store.schema || {});
    const reserved = new Set(base.map(s => s.id));
    const exclude = new Set(["layout", "colors", "typography"]); // handled by dedicated tabs
    const iconMap = {
      homepage: "house",
      animations: "wand-magic-sparkles",
    };

    const dynamic = schemaKeys
      .filter(k => !reserved.has(k) && !exclude.has(k))
      .map(k => ({ id: k, label: humanize(k), icon: iconMap[k] || "sliders" }));

    const sections = base.slice(0, 4) // Identity, Colors, Typography, Layout
      .concat(dynamic)
      .concat(base.slice(4));

    sections.forEach((section, i) => {
      const btn = document.createElement("button");
      btn.className   = `panel-tab${i === 0 ? " active" : ""}`;
      btn.dataset.sid = section.id;
      btn.innerHTML   = `<i class="fa-duotone fa-${section.icon}"></i><span>${section.label}</span>`;
      btn.addEventListener("click", () => activateSection(section.id));
      panelTabs.appendChild(btn);
    });
    activateSection(sections[0].id);
  }

// AFTER
function activateSection(sectionId) {
  store.activeSection = sectionId;
  document.querySelectorAll(".panel-tab").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.sid === sectionId)
  );
  if (!panelContent) return;
 
  if (sectionId === "site-identity") {
    // STEP 7: Always fetch fresh identity data before rendering.
    // Show skeleton while request is in flight.
    panelContent.innerHTML = `<div class="cust-section">
      <div class="cust-section-header">
        <i class="fa-duotone fa-id-card"></i><span>Site Identity</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:24px;
                  color:var(--color-text-secondary);font-size:13px">
        <i class="fa-regular fa-spinner fa-spin"></i> Loading…
      </div>
    </div>`;
 
    loadSiteIdentity().then(() => {
      if (store.activeSection !== "site-identity") return; // user switched away
      panelContent.innerHTML = _renderSection("site-identity");
      _bindSection("site-identity");
    });
    return;
  }
 
  // All other tabs: read-only render from pendingConfig — no state mutation.
  panelContent.innerHTML = _renderSection(sectionId);
  _bindSection(sectionId);
}
 

  // ─────────────────────────────────────────────────────────────
  // AI SPARKLE BUTTON HELPER
  // ─────────────────────────────────────────────────────────────

  function _sparkleBtn(sectionId, fieldHint = "") {
    return `<button class="cust-ai-sparkle" data-ai-section="${sectionId}" data-ai-field="${escapeAttr(fieldHint)}" title="AI suggestions">
      <i class="fa-duotone fa-sparkles"></i>
    </button>`;
  }

  // ─────────────────────────────────────────────────────────────
  // SECTION RENDERERS
  // ─────────────────────────────────────────────────────────────

  function _renderSection(id) {
    switch (id) {
      case "site-identity": return _renderIdentity();
      case "colors":        return _renderColors();
      case "typography":    return _renderTypography();
      case "layout-nav":    return _renderLayoutNav();
      case "menus":         return _renderMenus();
      case "layouts":       return _renderLayouts();
      case "content":       return _renderContent();
      case "ai-settings":   return _renderAI();
      case "advanced":      return _renderAdvanced();
      default:              return _renderSchemaSection(id);
    }
  }

  // ── Site Identity ──────────────────────────────────────────────────────────
function _renderIdentity() {
  const g = store.settings.general || {};
 
 
  return `<div class="cust-section" data-section="site-identity">
    <div class="cust-section-header">
      <i class="fa-duotone fa-id-card"></i><span>Site Identity</span>
      <div class="cust-section-actions">
        ${_sparkleBtn("identity")}
        <button class="cust-btn-sm" id="cust-identity-refresh" title="Reload from server">
          <i class="fa-regular fa-rotate"></i>
        </button>
      </div>
    </div>
 
    <div class="cust-field">
      <label class="cust-label">Site Title</label>
      <input class="cust-input" id="cust-siteName" type="text"
             value="${escapeAttr(g.siteName || "")}" placeholder="My Site" />
    </div>
 
    <div class="cust-field">
      <label class="cust-label">Tagline</label>
      <input class="cust-input" id="cust-siteTagline" type="text"
             value="${escapeAttr(g.siteTagline || "")}" placeholder="Just another site…" />
    </div>
 
    <div class="cust-field">
      <label class="cust-label">Site Description</label>
      <textarea class="cust-input cust-textarea" id="cust-siteDesc"
                placeholder="Brief description…">${escapeHtml(g.siteDescription || "")}</textarea>
    </div>
 
    <div class="cust-field">
      <label class="cust-label">Site Logo</label>
      <div class="cust-upload-wrap" id="cust-logo-wrap">
        ${g.siteLogo
          ? `<img class="cust-img-preview" src="${escapeAttr(g.siteLogo)}" alt="Logo" />`
          : `<div class="cust-upload-placeholder"><i class="fa-regular fa-image"></i><span>No logo</span></div>`}
        <div class="cust-upload-actions">
          <button class="cust-btn-sm" id="cust-logo-upload-btn">
            <i class="fa-regular fa-upload"></i> Upload
          </button>
          ${g.siteLogo
            ? `<button class="cust-btn-sm cust-btn-danger" id="cust-logo-remove-btn">Remove</button>`
            : ""}
        </div>
      </div>
      <input type="file" id="cust-logo-file" accept="image/*" hidden />
    </div>
 
    <div class="cust-field">
      <label class="cust-label">Favicon</label>
      <div class="cust-upload-wrap" id="cust-favicon-wrap">
        ${g.siteFavicon
          ? `<img class="cust-img-preview cust-favicon-preview" src="${escapeAttr(g.siteFavicon)}" alt="Favicon" />`
          : `<div class="cust-upload-placeholder"><i class="fa-regular fa-star"></i><span>No favicon</span></div>`}
        <div class="cust-upload-actions">
          <button class="cust-btn-sm" id="cust-favicon-upload-btn">
            <i class="fa-regular fa-upload"></i> Upload
          </button>
          ${g.siteFavicon
            ? `<button class="cust-btn-sm cust-btn-danger" id="cust-favicon-remove-btn">Remove</button>`
            : ""}
        </div>
      </div>
      <input type="file" id="cust-favicon-file" accept="image/*,.ico" hidden />
    </div>
 
    <button class="cust-save-btn" data-saves="identity">
      <i class="fa-regular fa-floppy-disk"></i> Save Identity
    </button>
  </div>`;
}
 

  // ── Colors ─────────────────────────────────────────────────────────────────
function _renderColors() {
  const schema = store.schema?.colors || {};
 
  const fields = Object.keys(schema).length
    ? Object.keys(schema)
    : ["primary", "secondary", "accent", "background"];
 
  const colorFields = fields.map(key => {
    const label       = schema[key]?.label || humanize(key);
    const schemaDefault = schema[key]?.default || "#000000";
 
    // STEP 3: strict precedence
    const val = _resolveVal(`layout.colors.${key}`, schemaDefault);
 
    return renderColorField({ key, label, value: val, id: `cust-color-${key}` });
  }).join("");
 
  return `
  <div class="cust-section" data-section="colors">
    <div class="cust-section-header">
      <i class="fa-duotone fa-palette"></i>
      <span>Colors</span>
      <div class="cust-section-actions">${_sparkleBtn("colors")}</div>
    </div>
    ${colorFields}
    <button class="cust-save-btn" data-saves="colors">
      <i class="fa-regular fa-floppy-disk"></i> Save Colors
    </button>
  </div>`;
}
 
 
// ─────────────────────────────────────────────────────────────
// STEP 2 + 3  ─  _renderTypography()
//
// Same strict-precedence pattern.
// ─────────────────────────────────────────────────────────────
function _renderTypography() {
  const schema = store.schema?.typography || {};
 
  const hFont = _resolveVal("layout.typography.headingFont",  schema.headingFont?.default  || "");
  const bFont = _resolveVal("layout.typography.bodyFont",     schema.bodyFont?.default     || "");
  const bSize = _resolveVal("layout.typography.baseFontSize", schema.baseFontSize?.default || 16);
 
  return `<div class="cust-section" data-section="typography">
    <div class="cust-section-header">
      <i class="fa-duotone fa-font"></i><span>Typography</span>
      <div class="cust-section-actions">${_sparkleBtn("typography")}</div>
    </div>
 
    <div class="cust-field">
      <label class="cust-label">Heading Font</label>
      <input class="cust-input" id="cust-headingFont-search"
             placeholder="Search Google Fonts…" autocomplete="off"
             value="${escapeAttr(hFont)}" />
      <div class="cust-font-results" id="cust-headingfont-results"></div>
      <div class="cust-font-selected">
        <span class="cust-label-sm">Selected:</span>
        <strong id="cust-headingfont-selected-label">${escapeHtml(hFont || "System default")}</strong>
      </div>
      <input type="hidden" id="cust-headingFont" value="${escapeAttr(hFont)}" />
    </div>
 
    <div class="cust-field">
      <label class="cust-label">Body Font</label>
      <input class="cust-input" id="cust-bodyFont-search"
             placeholder="Search Google Fonts…" autocomplete="off"
             value="${escapeAttr(bFont)}" />
      <div class="cust-font-results" id="cust-bodyfont-results"></div>
      <div class="cust-font-selected">
        <span class="cust-label-sm">Selected:</span>
        <strong id="cust-bodyfont-selected-label">${escapeHtml(bFont || "System default")}</strong>
      </div>
      <input type="hidden" id="cust-bodyFont" value="${escapeAttr(bFont)}" />
    </div>
 
    <div class="cust-field">
      <label class="cust-label">Base Font Size
        <span class="cust-hint-inline">(${bSize}px)</span>
      </label>
      <input class="cust-range" id="cust-baseFontSize"
             type="range" min="12" max="24" step="1" value="${bSize}" />
    </div>
 
    <button class="cust-save-btn" data-saves="typography">
      <i class="fa-regular fa-floppy-disk"></i> Save Typography
    </button>
  </div>`;
}

  // ── Built-in Layout (dynamic, meta.config.js-aware) ────────────────────────
  // (Built-in tab removed — tabs are schema-driven now.)

  // ── Layout & Nav ──────────────────────────────────────────────────────────

function _renderLayoutNav() {
  const l       = store.pendingConfig?.layout   || {};
  const sidebar = l.sidebar                     || {};
  const schema  = store.schema?.layout          || {};
  const uiHints = store.uiSchema                || {};
 
  // ── Helper: render a schema-driven field for layout section ──
  function _renderLayoutField(key, def, value, section = "layout") {
    const label = uiHints[`layout.${key}`]?.label || def.label || humanize(key);
    const hint  = uiHints[`layout.${key}`]?.hint  || def.hint  || "";
    return _renderSchemaField(section, key, def, value, label, hint);
  }
 
  // ── Sidebar toggle + settings (dynamic from schema) ──
  const sidebarEnabled = sidebar.enabled !== false;
  const sidebarFields  = Object.keys(schema?.sidebar || {})
    .filter(k => k !== "enabled")
    .map(k => {
      const def = schema.sidebar[k];
      const val = sidebar[k] ?? def?.default ?? "";
      // Use dot-path key for sidebar fields
      return _renderSchemaField("layout", `sidebar.${k}`, def, val, def.label || humanize(k), def.hint || "");
    }).join("");
 
  // ── Detect extra top-level layout fields from schema ──
  const knownTopLevel = new Set(["sidebar"]);
  const extraFields = Object.keys(schema)
    .filter(k => !knownTopLevel.has(k))
    .map(k => {
      const def = schema[k];
      const val = l[k] ?? def?.default ?? "";
      return _renderLayoutField(k, def, val);
    }).join("");
 
  // ── Meta.config.js schema extensions for layout ──
  const extSchema = store.uiSchema?.["_schema"]?.layout || {};
  const extFields = Object.keys(extSchema).map(k => {
    const def = extSchema[k];
    const val = l[k] ?? def.default ?? "";
    return _renderSchemaField("layout", k, def, val, def.label || humanize(k), def.hint || "");
  }).join("");
 
  // ── Slot lifecycle timeline (visual only, read-only reference) ──
  const slotTimeline = _renderSlotTimeline();
 
  // ── Widget areas display ──
  const widgetAreas = _renderWidgetAreaManager();
 
  // ── Menu areas display ──
  const menuAreaDisplay = _renderMenuAreaManager();
 
  return `
<div class="cust-section" data-section="layout-nav">
 
  <div class="cust-section-header">
    <i class="fa-duotone fa-layer-group"></i>
    <span>Layout & Navigation</span>
    <div class="cust-section-actions">
      <button class="cust-btn-sm" id="cust-ln-open-editor" title="Open Layout Editor">
        <i class="fa-regular fa-code"></i> Editor
      </button>
    </div>
  </div>
 
  <!-- ── HEADER SECTION ── -->
  <div class="cust-subsection" id="cust-ln-header-wrap">
    <div class="cust-subsection-title" data-toggle="cust-ln-header-body">
      <i class="fa-regular fa-rectangle-history"></i>
      <span>Header</span>
      <i class="fa-regular fa-chevron-down cust-toggle-chevron"></i>
    </div>
    <div class="cust-subsection-body" id="cust-ln-header-body">
 
      <div class="cust-field">
        <label class="cust-label">Header Style</label>
        <div class="cust-style-cards" id="cust-headerStyle-cards">
          ${["default","minimal","centered","sticky","transparent"].map(s => `
            <div class="cust-style-card${(l.headerStyle||"default")===s?" active":""}" data-style-val="${s}" data-style-key="headerStyle">
              <div class="cust-style-card-icon">
                <i class="fa-regular fa-${s==="sticky"?"thumbtack":s==="transparent"?"ghost":s==="minimal"?"minus":s==="centered"?"align-center":"rectangle-history"}"></i>
              </div>
              <span>${humanize(s)}</span>
            </div>`).join("")}
        </div>
      </div>
 
      ${extSchema?.headerSticky !== undefined ? `
      <div class="cust-field cust-toggle-field">
        <label class="cust-toggle">
          <input type="checkbox" id="cust-headerSticky" ${l.headerSticky?"checked":""} data-schema-section="layout_ext" data-schema-key="headerSticky" />
          <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
          <span class="cust-toggle-text">Sticky Header</span>
        </label>
        <span class="cust-hint">Fix header to top on scroll</span>
      </div>` : ""}
 
      ${extSchema?.headerBlur !== undefined ? `
      <div class="cust-field cust-toggle-field">
        <label class="cust-toggle">
          <input type="checkbox" id="cust-headerBlur" ${l.headerBlur!==false?"checked":""} data-schema-section="layout_ext" data-schema-key="headerBlur" />
          <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
          <span class="cust-toggle-text">Glass / Blur Header</span>
        </label>
        <span class="cust-hint">Glassmorphism backdrop on header</span>
      </div>` : ""}
 
    </div>
  </div>
 
  <!-- ── FOOTER SECTION ── -->
  <div class="cust-subsection" id="cust-ln-footer-wrap">
    <div class="cust-subsection-title" data-toggle="cust-ln-footer-body">
      <i class="fa-regular fa-table-rows"></i>
      <span>Footer</span>
      <i class="fa-regular fa-chevron-down cust-toggle-chevron"></i>
    </div>
    <div class="cust-subsection-body" id="cust-ln-footer-body">
 
      <div class="cust-field">
        <label class="cust-label">Footer Style</label>
        <div class="cust-style-cards">
          ${["default","minimal","columns","centered"].map(s => `
            <div class="cust-style-card${(l.footerStyle||"default")===s?" active":""}" data-style-val="${s}" data-style-key="footerStyle">
              <div class="cust-style-card-icon">
                <i class="fa-regular fa-${s==="columns"?"columns-3":s==="centered"?"align-center":s==="minimal"?"minus":"table-rows"}"></i>
              </div>
              <span>${humanize(s)}</span>
            </div>`).join("")}
        </div>
      </div>
 
    </div>
  </div>
 
  <!-- ── SIDEBAR SECTION ── -->
  <div class="cust-subsection" id="cust-ln-sidebar-wrap">
    <div class="cust-subsection-title" data-toggle="cust-ln-sidebar-body">
      <i class="fa-regular fa-sidebar"></i>
      <span>Sidebar</span>
      <div class="cust-subsection-badge ${sidebarEnabled?"active":"inactive"}" id="cust-sidebar-badge">
        ${sidebarEnabled?"Enabled":"Disabled"}
      </div>
      <i class="fa-regular fa-chevron-down cust-toggle-chevron"></i>
    </div>
    <div class="cust-subsection-body" id="cust-ln-sidebar-body">
 
      <div class="cust-field cust-toggle-field">
        <label class="cust-toggle">
          <input type="checkbox" id="cust-sidebarEnabled" ${sidebarEnabled?"checked":""} />
          <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
          <span class="cust-toggle-text">Enable Sidebar</span>
        </label>
      </div>
 
      <div class="cust-sidebar-settings${sidebarEnabled?"":" cust-disabled"}" id="cust-sidebar-settings">
 
        <div class="cust-field">
          <label class="cust-label">Position</label>
          <div class="cust-radio-group">
            <label class="cust-radio-option ${(sidebar.position||"right")==="left"?"active":""}">
              <input type="radio" name="sidebar-pos" value="left" ${(sidebar.position||"right")==="left"?"checked":""} />
              <i class="fa-regular fa-sidebar-flip"></i> Left
            </label>
            <label class="cust-radio-option ${(sidebar.position||"right")==="right"?"active":""}">
              <input type="radio" name="sidebar-pos" value="right" ${(sidebar.position||"right")==="right"?"checked":""} />
              <i class="fa-regular fa-sidebar"></i> Right
            </label>
          </div>
        </div>
 
        <div class="cust-field">
          <label class="cust-label">
            Width
            <span class="cust-hint-inline">(${sidebar.width || "300px"})</span>
          </label>
          <input class="cust-input" type="text" id="cust-sidebarWidth"
            value="${escapeAttr(sidebar.width || "300px")}"
            placeholder="300px or 25%" />
          <span class="cust-hint">CSS value: px, %, rem, vw</span>
        </div>
 
        <div class="cust-field">
          <label class="cust-label">Behaviour on mobile</label>
          <select class="cust-select" id="cust-sidebarBehavior">
            <option value="auto"      ${l.sidebarBehavior==="auto"     ?"selected":""}>Auto-collapse</option>
            <option value="always"    ${l.sidebarBehavior==="always"   ?"selected":""}>Always show</option>
            <option value="collapsed" ${l.sidebarBehavior==="collapsed"?"selected":""}>Always collapsed</option>
            <option value="hidden"    ${l.sidebarBehavior==="hidden"   ?"selected":""}>Hidden</option>
          </select>
        </div>
 
        <div class="cust-field-group cust-field-group-label">Show sidebar on:</div>
        <div class="cust-check-row">
          <label class="cust-check">
            <input type="checkbox" id="cust-sb-homepage" ${sidebar.show_on_homepage!==false?"checked":""} />
            Homepage
          </label>
          <label class="cust-check">
            <input type="checkbox" id="cust-sb-pages" ${sidebar.show_on_pages!==false?"checked":""} />
            Pages
          </label>
          <label class="cust-check">
            <input type="checkbox" id="cust-sb-posts" ${sidebar.show_on_posts!==false?"checked":""} />
            Posts
          </label>
        </div>
 
      </div>
    </div>
  </div>
 
  <!-- ── EXTRA SCHEMA FIELDS (from meta.json layout.*) ── -->
  ${extraFields ? `
  <div class="cust-subsection">
    <div class="cust-subsection-title" data-toggle="cust-ln-extra-body">
      <i class="fa-regular fa-sliders"></i>
      <span>Additional Layout Options</span>
      <i class="fa-regular fa-chevron-down cust-toggle-chevron"></i>
    </div>
    <div class="cust-subsection-body" id="cust-ln-extra-body">
      ${extraFields}
    </div>
  </div>` : ""}
 
  <!-- ── EXTENSION FIELDS (from meta.config.js schema.layout) ── -->
  ${extFields ? `
  <div class="cust-subsection">
    <div class="cust-subsection-title" data-toggle="cust-ln-ext-body">
      <i class="fa-regular fa-puzzle-piece"></i>
      <span>Layout Extensions</span>
      <i class="fa-regular fa-chevron-down cust-toggle-chevron"></i>
    </div>
    <div class="cust-subsection-body" id="cust-ln-ext-body">
      ${extFields}
    </div>
  </div>` : ""}
 
  <!-- ── WIDGET AREAS ── -->
  <div class="cust-subsection">
    <div class="cust-subsection-title" data-toggle="cust-ln-widgets-body">
      <i class="fa-regular fa-block-brick"></i>
      <span>Widget Areas</span>
      <i class="fa-regular fa-chevron-down cust-toggle-chevron"></i>
    </div>
    <div class="cust-subsection-body" id="cust-ln-widgets-body">
      ${widgetAreas}
    </div>
  </div>
 
  <!-- ── MENU AREAS ── -->
  <div class="cust-subsection">
    <div class="cust-subsection-title" data-toggle="cust-ln-menu-areas-body">
      <i class="fa-regular fa-sitemap"></i>
      <span>Navigation Areas</span>
      <i class="fa-regular fa-chevron-down cust-toggle-chevron"></i>
    </div>
    <div class="cust-subsection-body" id="cust-ln-menu-areas-body">
      ${menuAreaDisplay}
    </div>
  </div>
 
  <!-- ── LIFECYCLE SLOTS REFERENCE ── -->
  <div class="cust-subsection">
    <div class="cust-subsection-title" data-toggle="cust-ln-slots-body">
      <i class="fa-regular fa-timeline"></i>
      <span>Render Lifecycle</span>
      <span class="cust-hint-inline" style="margin-left:auto;font-size:11px">reference</span>
      <i class="fa-regular fa-chevron-down cust-toggle-chevron"></i>
    </div>
    <div class="cust-subsection-body cust-collapsed" id="cust-ln-slots-body">
      ${slotTimeline}
    </div>
  </div>
 
  <button class="cust-save-btn" data-saves="layout">
    <i class="fa-regular fa-floppy-disk"></i> Save Layout
  </button>
 
</div>`;
}

  // ── Menus ─────────────────────────────────────────────────────────────────

  function _renderMenus() {
    const slots = store.menuSlotNames || ["primary", "footer"];
    const menus = store.menus || [];

    const slotRows = slots.map(slot => {
      const assigned = store.menuSlots?.[slot];
      const assignedId = assigned?._id || assigned?.id || "";

      return `<div class="cust-field cust-menu-slot-row">
        <label class="cust-label cust-slot-label">
          <i class="fa-regular fa-bars"></i> <strong>${humanize(slot)}</strong> menu
        </label>
        <select class="cust-select" data-slot="${slot}" id="cust-slot-${slot}">
          <option value="">— None —</option>
          ${menus.map(m => {
            const mid = m._id || m.id || "";
            return `<option value="${escapeAttr(mid)}" ${mid === assignedId ? "selected" : ""}>${escapeHtml(m.name)}</option>`;
          }).join("")}
        </select>
      </div>`;
    }).join("");

    return `<div class="cust-section" data-section="menus">
      <div class="cust-section-header">
        <i class="fa-duotone fa-bars"></i><span>Menu Assignment</span>
      </div>
      <p class="cust-hint">Assign a menu to each navigation slot. Menus are managed in <a href="/acrx/menus" target="_blank">Menus</a>.</p>
      ${menus.length === 0
        ? `<div class="cust-empty-state"><i class="fa-regular fa-triangle-exclamation"></i> No menus found. <a href="/acrx/menus" target="_blank">Create one →</a></div>`
        : slotRows}
      <button class="cust-save-btn" data-saves="menus" ${menus.length === 0 ? "disabled" : ""}>
        <i class="fa-regular fa-floppy-disk"></i> Save Menu Assignments
      </button>
    </div>`;
  }

  // ── Installed Layouts ─────────────────────────────────────────────────────

  function _renderLayouts() {
    const layouts  = store.installedLayouts || [];
    const activeId = store.activeLayoutId   || store.layoutId;
    const prevId   = store.previewLayoutId  || store.layoutId;

    return `<div class="cust-section" data-section="layouts">
      <div class="cust-section-header">
        <i class="fa-duotone fa-grid-2"></i><span>Installed Layouts</span>
      </div>
      <p class="cust-hint">Click a layout to preview it. Use <strong>Activate</strong> to make it the live layout.</p>
      <div class="cust-layouts-grid">
        ${layouts.map(l => {
          const isActive  = l.id === activeId;
          const isPrev    = l.id === prevId;
          return `<div class="cust-layout-card ${isPrev ? "previewing" : ""} ${isActive ? "active-layout" : ""}" data-layout-id="${escapeAttr(l.id)}">
            <div class="cust-layout-thumb">
              <img src="${escapeAttr(l.preview || "")}" alt="${escapeHtml(l.name)}" onerror="this.style.display='none'" />
            </div>
            <div class="cust-layout-info">
              <strong>${escapeHtml(l.name)}</strong>
              <span class="cust-layout-version">v${escapeHtml(l.version || "")}</span>
              ${isActive  ? `<span class="cust-badge active">Live</span>`     : ""}
              ${isPrev && !isActive ? `<span class="cust-badge preview">Previewing</span>` : ""}
            </div>
            <div class="cust-layout-actions">
              <button class="cust-btn-sm" data-layout-preview="${escapeAttr(l.id)}">
                <i class="fa-regular fa-eye"></i> Preview
              </button>
              <button class="cust-btn-sm ${isActive ? "cust-btn-disabled" : "cust-btn-accent"}"
                      data-layout-activate="${escapeAttr(l.id)}" ${isActive ? "disabled" : ""}>
                <i class="fa-regular fa-toggle-large-${isActive ? "on" : "off"}"></i>
                ${isActive ? "Active" : "Activate"}
              </button>
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
  }
function _renderLayouts() {
  const layouts  = store.installedLayouts || [];
  const activeId = store.activeLayoutId   || store.layoutId;
  const prevId   = store.previewLayoutId  || store.layoutId;
 
  return `
<div class="cust-section" data-section="layouts">
 
  <div class="cust-section-header">
    <i class="fa-duotone fa-grid-2"></i>
    <span>Installed Layouts</span>
    <div class="cust-section-actions">
      <button class="cust-btn-sm" id="cust-layouts-install" title="Upload layout package">
        <i class="fa-regular fa-upload"></i> Install
      </button>
      <button class="cust-btn-sm" id="cust-layouts-create" title="Create new layout with wizard">
        <i class="fa-regular fa-plus"></i> New Layout
      </button>
    </div>
  </div>
 
  <p class="cust-hint">
    Click a layout to <strong>preview</strong> it in the iframe.
    Use <strong>Activate</strong> to make it the live layout.
  </p>
 
  <!-- Active layout summary bar -->
  <div class="cust-active-layout-bar">
    <div class="cust-active-layout-icon"><i class="fa-regular fa-check-circle"></i></div>
    <div class="cust-active-layout-info">
      <span class="cust-active-label">Live layout</span>
      <strong class="cust-active-name" id="cust-active-name">
        ${escapeHtml(layouts.find(l => l.id === activeId)?.name || activeId || "—")}
      </strong>
    </div>
    <button class="cust-btn-sm" id="cust-btn-edit-active">
      <i class="fa-regular fa-code"></i> Edit Files
    </button>
  </div>
 
  <!-- Layout grid -->
  <div class="cust-layouts-grid" id="cust-layouts-grid">
    ${layouts.length === 0 ? `
      <div class="cust-empty-state">
        <i class="fa-regular fa-grid-2"></i>
        <span>No layouts installed</span>
        <button class="cust-btn-sm cust-btn-accent" id="cust-layouts-create-empty">
          <i class="fa-regular fa-plus"></i> Create First Layout
        </button>
      </div>` :
    layouts.map(l => {
      const isActive  = l.id === activeId;
      const isPrev    = l.id === prevId && prevId !== activeId;
      return `
      <div class="cust-layout-card ${isPrev ? "previewing" : ""} ${isActive ? "active-layout" : ""}"
           data-layout-id="${escapeAttr(l.id)}">
 
        <div class="cust-layout-thumb">
          ${l.preview
            ? `<img src="${escapeAttr(l.preview)}" alt="${escapeHtml(l.name)}" loading="lazy" onerror="this.closest('.cust-layout-thumb').innerHTML='<div class=cust-layout-thumb-empty><i class=fa-regular\\ fa-image></i></div>'" />`
            : `<div class="cust-layout-thumb-empty"><i class="fa-regular fa-image"></i></div>`}
          ${isActive ? `<div class="cust-layout-live-badge"><i class="fa-regular fa-circle-dot"></i> Live</div>` : ""}
          ${isPrev   ? `<div class="cust-layout-preview-badge"><i class="fa-regular fa-eye"></i> Previewing</div>` : ""}
        </div>
 
        <div class="cust-layout-info">
          <div class="cust-layout-name">${escapeHtml(l.name)}</div>
          <div class="cust-layout-meta">
            <span class="cust-layout-version">v${escapeHtml(l.version || "")}</span>
            <span class="cust-layout-author">${escapeHtml(l.author || "")}</span>
          </div>
          ${l.features?.length ? `
          <div class="cust-layout-features">
            ${l.features.slice(0,3).map(f => `<span class="cust-layout-feature-tag">${escapeHtml(f)}</span>`).join("")}
            ${l.features.length > 3 ? `<span class="cust-layout-feature-more">+${l.features.length-3}</span>` : ""}
          </div>` : ""}
        </div>
 
        <div class="cust-layout-actions">
          <button class="cust-btn-sm" data-layout-preview="${escapeAttr(l.id)}" title="Preview this layout">
            <i class="fa-regular fa-eye"></i> Preview
          </button>
          <button class="cust-btn-sm" data-layout-edit="${escapeAttr(l.id)}" title="Open file editor">
            <i class="fa-regular fa-code"></i> Edit
          </button>
          <button class="cust-btn-sm ${isActive ? "cust-btn-disabled" : "cust-btn-accent"}"
                  data-layout-activate="${escapeAttr(l.id)}"
                  ${isActive ? "disabled title='Currently active'" : "title='Set as live layout'"}>
            <i class="fa-regular fa-toggle-large-${isActive?"on":"off"}"></i>
            ${isActive ? "Active" : "Activate"}
          </button>
        </div>
 
      </div>`;
    }).join("")}
  </div>
 
  <!-- Upload progress (hidden until needed) -->
  <div class="cust-upload-progress" id="cust-layout-upload-progress" style="display:none">
    <div class="cust-upload-bar" id="cust-layout-upload-bar"></div>
    <span id="cust-layout-upload-status">Uploading…</span>
  </div>
 
  <!-- Hidden file input for zip upload -->
  <input type="file" id="cust-layout-zip-input" accept=".zip" hidden />
 
</div>`;
}
function _renderWidgetAreaManager() {
  const meta        = store.metaJson || {};
  const widgetAreas = meta.widgetAreas || [];
 
  if (!widgetAreas.length) {
    return `<div class="cust-empty-state">
      <i class="fa-regular fa-block-brick"></i>
      <span>No widget areas defined in meta.json</span>
    </div>`;
  }
 
  const rows = widgetAreas.map(area => `
    <div class="cust-widget-area-row">
      <div class="cust-widget-area-icon"><i class="fa-regular fa-block-brick"></i></div>
      <div class="cust-widget-area-info">
        <span class="cust-widget-area-name">${escapeHtml(area)}</span>
        <span class="cust-widget-area-hint">injection zone</span>
      </div>
      <div class="cust-widget-area-status active">active</div>
    </div>`).join("");
 
  return `
    <p class="cust-hint" style="margin-bottom:8px">
      Widget areas defined in <code>meta.json</code>. Manage content in
      <a href="/acrx/widgets" target="_blank">Widgets</a>.
    </p>
    <div class="cust-widget-area-list">${rows}</div>`;
}
 
// ─────────────────────────────────────────────────────────────────────────
// PATCH 3b: Helper — Menu Area Manager (display, not assignment)
// ─────────────────────────────────────────────────────────────────────────
function _renderMenuAreaManager() {
  const meta      = store.metaJson || {};
  const menuAreas = meta.menuAreas || [];
 
  if (!menuAreas.length) {
    return `<div class="cust-empty-state">
      <i class="fa-regular fa-sitemap"></i>
      <span>No menu areas defined in meta.json</span>
    </div>`;
  }
 
  const rows = menuAreas.map(area => {
    const assigned = store.menuSlots?.[area];
    const name     = typeof assigned === "object" ? assigned?.name : assigned;
    return `
    <div class="cust-menu-area-row">
      <div class="cust-menu-area-icon"><i class="fa-regular fa-bars"></i></div>
      <div class="cust-menu-area-info">
        <span class="cust-menu-area-key">${escapeHtml(area)}</span>
        ${name ? `<span class="cust-menu-area-assigned">${escapeHtml(name)}</span>` : `<span class="cust-menu-area-none">unassigned</span>`}
      </div>
      <a href="/acrx/menus" target="_blank" class="cust-btn-sm">
        <i class="fa-regular fa-arrow-right"></i>
      </a>
    </div>`;
  }).join("");
 
  return `
    <p class="cust-hint" style="margin-bottom:8px">
      Menu slots from <code>meta.json</code>. Assign menus in the
      <strong>Menus</strong> tab or <a href="/acrx/menus" target="_blank">Menus manager</a>.
    </p>
    <div class="cust-menu-area-list">${rows}</div>`;
}

 function _renderEditorShortcut() {
  const id = store.layoutId;
  const meta = store.metaJson || {};
 
  const templates = Object.keys(meta.templates || {});
  const templateRows = templates.map(t => `
    <div class="cust-editor-file-row" data-open-file="templates/${t}.js">
      <i class="fa-regular fa-file-code cust-editor-file-icon"></i>
      <span class="cust-editor-file-name">${t}.js</span>
      <button class="cust-btn-sm" data-open-file="templates/${t}.js">
        <i class="fa-regular fa-external-link"></i>
      </button>
    </div>`).join("");
 
  return `
<div class="cust-section" data-section="editor">
 
  <div class="cust-section-header">
    <i class="fa-duotone fa-code"></i>
    <span>Layout Editor</span>
  </div>
 
  <p class="cust-hint">
    Directly edit the layout files for <strong>${escapeHtml(meta.name || id)}</strong>.
    Changes take effect after save.
  </p>
 
  <div class="cust-editor-launch-card">
    <div class="cust-editor-launch-icon">
      <i class="fa-regular fa-code-branch"></i>
    </div>
    <div class="cust-editor-launch-info">
      <strong>Open in Layout Editor</strong>
      <span>Full IDE with Monaco, file tree, live preview</span>
    </div>
    <button class="cust-btn-sm cust-btn-accent" id="cust-editor-launch">
      <i class="fa-regular fa-external-link"></i> Open
    </button>
  </div>
 
  <div class="cust-subsection" style="margin-top:12px">
    <div class="cust-subsection-title" data-toggle="cust-editor-templates-body">
      <i class="fa-regular fa-files"></i>
      <span>Template Files</span>
      <i class="fa-regular fa-chevron-down cust-toggle-chevron"></i>
    </div>
    <div class="cust-subsection-body" id="cust-editor-templates-body">
      ${templateRows || `<div class="cust-empty-state"><span>No templates found</span></div>`}
      <a href="/acrx/edit?id=${escapeAttr(id)}&file=meta.json" target="_blank" class="cust-editor-file-row" style="margin-top:8px;text-decoration:none">
        <i class="fa-regular fa-braces cust-editor-file-icon" style="color:#34d399"></i>
        <span class="cust-editor-file-name">meta.json</span>
        <span class="cust-badge active">config</span>
      </a>
    </div>
  </div>
 
</div>`;
}
function _renderSlotTimeline() {
const slots = [
  { id: "BEFORE_LAYOUT", icon: "user-shield", desc: "Auth checks, global data injection" },
  { id: "AFTER_LAYOUT_INIT", icon: "cogs", desc: "Preprocess config, resolve templates" },
  { id: "BEFORE_HEADER", icon: "heading", desc: "Modify header data, inject actions" },
  { id: "AFTER_HEADER", icon: "layer-group", desc: "UI overlays, toolbar augmentations" },
  { id: "BEFORE_CONTENT", icon: "boxes-stacked", desc: "Content guards, dynamic injections" },
  { id: "AFTER_CONTENT", icon: "chart-line", desc: "Post-process UI, analytics" },
  { id: "BEFORE_FOOTER", icon: "grip-lines", desc: "Footer modifications, dynamic links" },
  { id: "AFTER_FOOTER", icon: "code", desc: "Final scripts, telemetry hooks" },
  { id: "AFTER_LAYOUT_RENDER", icon: "check-circle", desc: "Finalize DOM, initialize editor" },
];
 
  return `<div class="cust-slot-timeline">
    ${slots.map((s, i) => `
    <div class="cust-slot-row">
      <div class="cust-slot-num">${i + 1}</div>
      <div class="cust-slot-icon"><i class="fa-regular fa-${s.icon}"></i></div>
      <div class="cust-slot-info">
        <code class="cust-slot-id">${s.id}</code>
        <span class="cust-slot-desc">${s.desc}</span>
      </div>
    </div>`).join("")}
  </div>`;
}
  // ── Content ───────────────────────────────────────────────────────────────

  function _renderContent() {
    const c = store.settings.content || {};
    return `<div class="cust-section" data-section="content">
      <div class="cust-section-header">
        <i class="fa-duotone fa-photo-film"></i><span>Content</span>
      </div>
      <div class="cust-field">
        <label class="cust-label">Posts per page</label>
        <input class="cust-input cust-input-sm" id="cust-postsPerPage" type="number"
               value="${c.postsPerPage || 10}" min="1" max="100" />
      </div>
      <div class="cust-field cust-toggle-field">
        <label class="cust-toggle">
          <input type="checkbox" id="cust-allowComments" ${c.allowComments !== false ? "checked" : ""} />
          <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
          <span class="cust-toggle-text">Allow comments</span>
        </label>
      </div>
      <button class="cust-save-btn" data-saves="content">
        <i class="fa-regular fa-floppy-disk"></i> Save Content
      </button>
    </div>`;
  }

  // ── AI Settings ───────────────────────────────────────────────────────────

  function _renderAI() {
    const ai      = store.settings.ai  || {};
    const enabled = ai.enabled !== false;
    return `<div class="cust-section" data-section="ai-settings">
      <div class="cust-section-header">
        <i class="fa-duotone fa-robot"></i><span>AI Settings</span>
      </div>
      <div class="cust-field cust-toggle-field">
        <label class="cust-toggle">
          <input type="checkbox" id="cust-aiEnabled" ${enabled ? "checked" : ""} />
          <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
          <span class="cust-toggle-text">AI enabled</span>
        </label>
      </div>
      <div class="cust-field">
        <label class="cust-label">Default Provider</label>
        <select class="cust-select" id="cust-aiProvider">
          <option value="openai" ${ai.defaultProvider==="openai"?"selected":""}>OpenAI</option>
          <option value="gemini" ${ai.defaultProvider==="gemini"?"selected":""}>Gemini</option>
          <option value="custom" ${ai.defaultProvider==="custom"?"selected":""}>Custom</option>
        </select>
      </div>
      <div class="cust-ai-test-row">
        <button class="cust-btn-sm" id="cust-ai-test"><i class="fa-regular fa-plug"></i> Test</button>
        <span id="cust-ai-test-result" class="cust-ai-test-result"></span>
      </div>
      <button class="cust-save-btn" data-saves="ai">
        <i class="fa-regular fa-floppy-disk"></i> Save AI
      </button>
    </div>`;
  }

  // ── Advanced ──────────────────────────────────────────────────────────────

  function _renderAdvanced() {
    return `<div class="cust-section" data-section="advanced">
      <div class="cust-section-header">
        <i class="fa-duotone fa-sliders"></i><span>Advanced</span>
      </div>

      <div class="cust-field cust-toggle-field">
        <label class="cust-toggle">
          <input type="checkbox" id="cust-autoSave" ${store.autoSave ? "checked" : ""} />
          <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
          <span class="cust-toggle-text">Auto-save layout config</span>
        </label>
        <span class="cust-hint">Automatically saves layout changes (colors, typography, layout, homepage, etc.).</span>
      </div>

      <div class="cust-field cust-toggle-field">
        <label class="cust-toggle">
          <input type="checkbox" id="cust-hidePreviewBar" ${localStorage.getItem(LS.CTRL_BAR) ? "checked" : ""} />
          <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
          <span class="cust-toggle-text">Hide preview control bar</span>
        </label>
      </div>

      <div class="cust-field cust-toggle-field">
        <label class="cust-toggle">
          <input type="checkbox" id="cust-hideTopbar" ${localStorage.getItem(LS.TOPBAR) ? "checked" : ""} />
          <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
          <span class="cust-toggle-text">Hide top bar</span>
        </label>
        <span class="cust-hint">A restore button appears at the top of the screen.</span>
      </div>

      <div class="cust-field cust-toggle-field">
        <label class="cust-toggle">
          <input type="checkbox" id="cust-inspectToggle" ${store.inspector.enabled ? "checked" : ""} />
          <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
          <span class="cust-toggle-text">Inspector Mode</span>
        </label>
        <span class="cust-hint">Click elements in the preview to inspect them.</span>
      </div>

      <div class="cust-field cust-toggle-field">
        <label class="cust-toggle">
          <input type="checkbox" id="cust-liveReload" ${store.liveReload ? "checked" : ""} />
          <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
          <span class="cust-toggle-text">Live Reload</span>
        </label>
      </div>

      <button class="cust-btn cust-btn-danger-outline cust-mt" id="cust-reset-config">
        <i class="fa-regular fa-rotate-left"></i> Reset layout config
      </button>
    </div>`;
  }

  // ── Generic schema section (for any extra sections from meta.config.js) ───

function _renderSchemaSection(sectionId) {
  const sectionSchema = store.schema?.[sectionId] || {};
  if (!Object.keys(sectionSchema).length) {
    return `<div class="cust-section"><p class="cust-hint">No fields defined for this section.</p></div>`;
  }
 
  // STEP 6: normalised storage is always under config.layout.<section>
  // for the canonical sections; arbitrary sections live at config.<sectionId>.
  const canonicalUnderLayout = new Set(["colors", "typography", "homepage", "animations"]);
  const basePath = canonicalUnderLayout.has(sectionId)
    ? `layout.${sectionId}`
    : sectionId;
 
  const fields = Object.entries(sectionSchema).map(([key, def]) => {
    const val   = _resolveVal(`${basePath}.${key}`, def.default ?? "");
    const label = def.label || humanize(key);
    const hint  = def.hint  || "";
    return _renderSchemaField(sectionId, key, def, val, label, hint);
  }).join("");
 
  return `<div class="cust-section" data-section="${escapeAttr(sectionId)}">
    <div class="cust-section-header"><span>${humanize(sectionId)}</span></div>
    ${fields}
    <button class="cust-save-btn" data-saves="${escapeAttr(sectionId)}">
      <i class="fa-regular fa-floppy-disk"></i> Save
    </button>
  </div>`;
}
  function _renderSchemaField(section, key, def, value, label, hint) {
    const type  = def.type || "text";
    const id    = `cust-schema-${section}-${key}`;

    let input = "";

    if (type === "boolean") {
      input = `<label class="cust-toggle">
        <input type="checkbox" id="${id}" ${value ? "checked" : ""} data-schema-section="${section}" data-schema-key="${key}" />
        <span class="cust-toggle-track"><span class="cust-toggle-thumb"></span></span>
        <span class="cust-toggle-text">${label}</span>
      </label>`;
    } else if (type === "color") {
input = `
<div class="cust-color-row"
     data-color-picker
     data-color-key="${key}"
     data-color-row="${key}">

  <!-- REAL INPUT -->
  <input
    class="cust-color-native"
    type="color"
    id="${id}"
    value="${escapeAttr(value || "#000000")}"
    data-color-key="${key}"
    data-schema-section="${section}"
    data-schema-key="${key}"
  />

  <!-- CUSTOM SWATCH -->
  <button
    type="button"
    class="cust-color-swatch"
    data-color-trigger="${key}"
    aria-label="Open color picker"
  >
    <span
      class="cust-color-preview"
      style="background:${escapeAttr(value || "#000000")}"
      data-color-preview="${key}"
    ></span>
  </button>

  <!-- CUSTOM POPUP -->
  <div class="cust-color-popup hidden"
       data-color-popup="${key}">

    <!-- SATURATION/VALUE -->
    <div class="cust-color-sv"
         data-sv="${key}">
      <div class="cust-color-white"></div>
      <div class="cust-color-black"></div>
      <div class="cust-color-cursor"></div>
    </div>

    <!-- HUE -->
    <div class="cust-color-hue"
         data-hue="${key}">
      <div class="cust-color-hue-thumb"></div>
    </div>

    <!-- HEX -->
    <input
      class="cust-input cust-color-hex"
      type="text"
      value="${escapeAttr(value || "#000000")}"
      id="${id}-hex"
      maxlength="9"
      data-color-hex="${key}"
    />

  </div>

</div>
`;
    } else if (type === "range") {
      const min  = def.min  ?? 0;
      const max  = def.max  ?? 100;
      const step = def.step ?? 1;
      const unit = def.unit ?? "";
      input = `<div class="cust-range-row">
        <input class="cust-range" type="range" id="${id}" min="${min}" max="${max}" step="${step}"
               value="${value}" data-schema-section="${section}" data-schema-key="${key}" />
        <span class="cust-range-value">${value}${unit}</span>
      </div>`;
    } else if (type === "select") {
      const options = def.options || [];
      const current = (value === null || value === undefined) ? "" : String(value);
      input = `
        <div class="dropdown cust-schema-dropdown" data-schema-dropdown>
          <button
            type="button"
            class="dropdown-toggle"
            data-schema-dd-toggle
            data-label="${escapeAttr(label)}"
            data-selected-value="${escapeAttr(current)}"
          >
            <span class="cust-dd-label">${escapeHtml(label)}</span>
            <span class="cust-dd-selected">${escapeHtml(current)}</span>
            <i class="fa-solid fa-chevron-down"></i>
          </button>

          <input
            type="hidden"
            id="${id}"
            value="${escapeAttr(current)}"
            data-schema-section="${section}"
            data-schema-key="${key}"
          />

          <div class="dropdown-menu">
            <div class="wrap-menu-dp">
              ${options.map(o => {
                const dv = String(o);
                const active = dv === current ? 'data-active="true"' : "";
                return `<button type="button" class="dropdown-item" data-value="${escapeAttr(dv)}" ${active}>${escapeHtml(dv)}</button>`;
              }).join("")}
            </div>
          </div>
        </div>`;
    } else if (type === "textarea") {
      input = `<textarea class="cust-input cust-textarea" id="${id}"
                         data-schema-section="${section}" data-schema-key="${key}"
                         rows="${def.rows || 4}">${escapeHtml(value)}</textarea>`;
    } else {
      input = `<input class="cust-input" type="text" id="${id}" value="${escapeAttr(value)}"
                      data-schema-section="${section}" data-schema-key="${key}" />`;
    }

    return `<div class="cust-field">
      ${type !== "boolean" ? `<label class="cust-label" for="${id}">${escapeHtml(label)}</label>` : ""}
      ${input}
      ${hint ? `<span class="cust-hint">${escapeHtml(hint)}</span>` : ""}
    </div>`;
  }

  // ─────────────────────────────────────────────────────────────
  // SECTION EVENT BINDERS
  // ─────────────────────────────────────────────────────────────

  function _bindSection(id) {
    // Universal save buttons
    panelContent.querySelectorAll(".cust-save-btn[data-saves]").forEach(btn => {
      btn.addEventListener("click", () => _saveSection(btn.dataset.saves));
    });

    // Universal schema field bindings (range, color, select, textarea, input, checkbox)
    panelContent.querySelectorAll("[data-schema-section][data-schema-key]").forEach(el => {
      const evName = (el.type === "checkbox") ? "change" : "input";
      el.addEventListener(evName, () => {
        const sec = el.dataset.schemaSection;
        const key = el.dataset.schemaKey;
        const val = el.type === "checkbox" ? el.checked : el.type === "range" ? Number(el.value) : el.value;
        _setPending(sec, key, val);
        // Sync range display
        if (el.type === "range") {
          const display = el.closest(".cust-range-row")?.querySelector(".cust-range-value");
          if (display) display.textContent = `${el.value}${el.dataset.unit || ""}`;
        }
      });
    });

    // AI sparkle buttons
    panelContent.querySelectorAll(".cust-ai-sparkle").forEach(btn => {
      btn.addEventListener("click", () => _openAIPopup(btn.dataset.aiSection));
    });

    switch (id) {
      case "site-identity": _bindIdentity(); break;
      case "colors":        _bindColors();   break;
      case "typography":    _bindTypography();break;
      case "editor": _bindEditor(); break;
      case "layout-nav":    _bindLayoutNav();break;
      case "menus":         _bindMenus();    break;
      case "layouts":       _bindLayouts();  break;
      case "content":       _bindContent();  break;
      case "ai-settings":   _bindAI();       break;
      case "advanced":      _bindAdvanced(); break;
    }
  }
function _bindEditor() {
  const id = store.layoutId;
 
  get("cust-editor-launch")?.addEventListener("click", () => {
    window.open(`/acrx/edit?id=${id}`, "_blank");
  });
 
  panelContent.querySelectorAll("[data-open-file]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      const file = (el.dataset.openFile || el.closest("[data-open-file]")?.dataset.openFile);
      if (file) window.open(`/acrx/edit?id=${id}&file=${encodeURIComponent(file)}`, "_blank");
    });
  });
 
  // Template body toggle
  panelContent.querySelectorAll(".cust-subsection-title[data-toggle]").forEach(header => {
    header.addEventListener("click", () => {
      const body = get(header.dataset.toggle);
      if (!body) return;
      body.classList.toggle("cust-collapsed");
      const chev = header.querySelector(".cust-toggle-chevron");
      if (chev) chev.style.transform = body.classList.contains("cust-collapsed") ? "rotate(-90deg)" : "";
    });
  });
}
 
function _bindIdentity() {
  // Refresh button — re-fetches from API and re-renders
  get("cust-identity-refresh")?.addEventListener("click", () => {
    activateSection("site-identity"); // triggers loadSiteIdentity() → re-render
  });
 
  get("cust-logo-upload-btn")?.addEventListener("click",   () => get("cust-logo-file")?.click());
  get("cust-favicon-upload-btn")?.addEventListener("click", () => get("cust-favicon-file")?.click());
 
  get("cust-logo-file")?.addEventListener("change",    e => _uploadBrandingFile(e, "siteLogo",    "cust-logo-wrap"));
  get("cust-favicon-file")?.addEventListener("change", e => _uploadBrandingFile(e, "siteFavicon", "cust-favicon-wrap"));
 
  get("cust-logo-remove-btn")?.addEventListener("click",    () => {
    store.settings.general.siteLogo = "";
    activateSection("site-identity");
  });
  get("cust-favicon-remove-btn")?.addEventListener("click", () => {
    store.settings.general.siteFavicon = "";
    activateSection("site-identity");
  });
 
  // Text inputs sync to store.settings.general (NOT to pendingConfig)
  get("cust-siteName")?.addEventListener("input", e => {
    store.settings.general.siteName = e.target.value;
    markDirty();
  });
  get("cust-siteTagline")?.addEventListener("input", e => {
    store.settings.general.siteTagline = e.target.value;
    markDirty();
  });
  get("cust-siteDesc")?.addEventListener("input", e => {
    store.settings.general.siteDescription = e.target.value;
    markDirty();
  });
}
 

  async function _uploadBrandingFile(e, settingKey, wrapId) {
    const file = e.target.files[0];
    if (!file) return;
    const wrap = get(wrapId);
    let img    = wrap?.querySelector(".cust-img-preview");
    if (!img) { img = document.createElement("img"); img.className = "cust-img-preview"; wrap?.insertBefore(img, wrap.firstChild); }
    img.src = URL.createObjectURL(file);
    try {
      const fd  = new FormData(); fd.append("media", file);
      const res = await fetch(`${MEDIA_BASE}/upload`, { method: "POST", body: fd });
      const d   = await res.json();
      const url = d.files?.[0]?.url ?? d.file?.url;
      if (!url) throw new Error("No URL returned");
      store.settings.general[settingKey] = url;
      img.src = url;
      System?.showToast?.("Uploaded.", "success");
    } catch (err) { System?.showToast?.(`Upload failed: ${err.message}`, "error"); }
  }

  function _bindColors() {
    panelContent.querySelectorAll(".cust-color-swatch").forEach(swatch => {
      const key = swatch.dataset.colorKey;
      const hex = get(`cust-color-${key}-hex`);
      swatch.addEventListener("input", () => {
        if (hex) hex.value = swatch.value;
        _setPending("colors", key, swatch.value);
      });
      hex?.addEventListener("input", () => {
        if (/^#[0-9a-f]{3,8}$/i.test(hex.value)) {
          swatch.value = hex.value;
          _setPending("colors", key, hex.value);
        }
      });
    });
  }

  function _bindTypography() {
    _initFontSearch("cust-headingFont-search", "cust-headingfont-results", "cust-headingFont", "cust-headingfont-selected-label", "typography", "headingFont");
    _initFontSearch("cust-bodyFont-search",    "cust-bodyfont-results",    "cust-bodyFont",    "cust-bodyfont-selected-label",    "typography", "bodyFont");

    const slider = get("cust-baseFontSize");
    slider?.addEventListener("input", () => {
      const label = slider.closest(".cust-field")?.querySelector(".cust-hint-inline");
      if (label) label.textContent = `(${slider.value}px)`;
      _setPending("typography", "baseFontSize", Number(slider.value));
    });
  }

  // (Built-in tab removed — dropdown binding handled generically in _bindSection.)

function _bindLayoutNav() {
  // ── Open editor button ──
  get("cust-ln-open-editor")?.addEventListener("click", () => {
    const id = store.layoutId;
    window.open(`/acrx/edit?id=${id}`, "_blank");
  });
 
  // ── Subsection toggles ──
  panelContent.querySelectorAll(".cust-subsection-title[data-toggle]").forEach(header => {
    header.addEventListener("click", () => {
      const bodyId = header.dataset.toggle;
      const body   = get(bodyId);
      if (!body) return;
      const collapsed = body.classList.toggle("cust-collapsed");
      const chev = header.querySelector(".cust-toggle-chevron");
      if (chev) chev.style.transform = collapsed ? "rotate(-90deg)" : "";
    });
  });
 
  // ── Header style cards ──
  panelContent.querySelectorAll(".cust-style-card[data-style-key]").forEach(card => {
    card.addEventListener("click", () => {
      const key = card.dataset.styleKey;
      const val = card.dataset.styleVal;
      panelContent.querySelectorAll(`.cust-style-card[data-style-key="${key}"]`)
        .forEach(c => c.classList.toggle("active", c === card));
      _setPending("layout", key, val);
    });
  });
 
  // ── Footer style cards (same pattern) ──
  // (handled by generic style-card handler above)
 
  // ── Sidebar enabled toggle ──
  get("cust-sidebarEnabled")?.addEventListener("change", e => {
    const enabled   = e.target.checked;
    const settings  = get("cust-sidebar-settings");
    const badge     = get("cust-sidebar-badge");
    if (settings) settings.classList.toggle("cust-disabled", !enabled);
    if (badge) {
      badge.textContent = enabled ? "Enabled" : "Disabled";
      badge.className   = `cust-subsection-badge ${enabled ? "active" : "inactive"}`;
    }
    const cur = store.pendingConfig?.layout?.sidebar || {};
    _setPending("layout", "sidebar", { ...cur, enabled });
  });
 
  // ── Sidebar position radio ──
  panelContent.querySelectorAll("input[name='sidebar-pos']").forEach(radio => {
    radio.addEventListener("change", e => {
      panelContent.querySelectorAll(".cust-radio-option").forEach(opt => {
        opt.classList.toggle("active", opt.querySelector("input")?.value === e.target.value);
      });
      const cur = store.pendingConfig?.layout?.sidebar || {};
      _setPending("layout", "sidebar", { ...cur, position: e.target.value });
    });
  });
 
  // ── Sidebar width ──
  const widthInput = get("cust-sidebarWidth");
  if (widthInput) {
    let widthTimer;
    widthInput.addEventListener("input", () => {
      clearTimeout(widthTimer);
      widthTimer = setTimeout(() => {
        const cur = store.pendingConfig?.layout?.sidebar || {};
        _setPending("layout", "sidebar", { ...cur, width: widthInput.value.trim() });
      }, 400);
    });
  }
 
  // ── Sidebar behaviour select ──
  get("cust-sidebarBehavior")?.addEventListener("change", e =>
    _setPending("layout", "sidebarBehavior", e.target.value)
  );
 
  // ── Sidebar show-on checkboxes ──
  ["homepage","pages","posts"].forEach(page => {
    get(`cust-sb-${page}`)?.addEventListener("change", e => {
      const cur = store.pendingConfig?.layout?.sidebar || {};
      _setPending("layout", "sidebar", { ...cur, [`show_on_${page}`]: e.target.checked });
    });
  });
 
  // ── headerSticky / headerBlur (schema extension fields) ──
  get("cust-headerSticky")?.addEventListener("change", e =>
    _setPending("layout_ext", "headerSticky", e.target.checked)
  );
  get("cust-headerBlur")?.addEventListener("change", e =>
    _setPending("layout_ext", "headerBlur", e.target.checked)
  );
 
  // ── topbarAutoHide (legacy compat) ──
  get("cust-topbarAutoHide")?.addEventListener("change", e =>
    _setPending("layout", "topbarAutoHide", e.target.checked)
  );
 
  // ── Universal schema field bindings (for _renderSchemaField-generated fields) ──
  panelContent.querySelectorAll("[data-schema-section][data-schema-key]").forEach(el => {
    const evName = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(evName, () => {
      const sec = el.dataset.schemaSection;
      const key = el.dataset.schemaKey;
      const val = el.type === "checkbox" ? el.checked
                : el.type === "range"    ? Number(el.value)
                : el.value;
      _setPending(sec, key, val);
      if (el.type === "range") {
        const display = el.closest(".cust-range-row")?.querySelector(".cust-range-value");
        if (display) display.textContent = `${el.value}${el.dataset.unit || ""}`;
      }
    });
  });
}

  function _bindMenus() {
    panelContent.querySelectorAll("select[data-slot]").forEach(sel => {
      sel.addEventListener("change", () => {
        // Store pending slot assignment — saved via "Save Menu Assignments" button
        if (!store._pendingMenuSlots) store._pendingMenuSlots = {};
        store._pendingMenuSlots[sel.dataset.slot] = sel.value;
        markDirty();
      });
    });
  }

function _bindLayouts() {
 
  // ── Edit active layout shortcut ──
  get("cust-btn-edit-active")?.addEventListener("click", () => {
    const id = store.activeLayoutId || store.layoutId;
    window.open(`/acrx/edit?id=${id}`, "_blank");
  });
 
  // ── Create new layout (opens layout editor wizard) ──
  ["cust-layouts-create","cust-layouts-create-empty"].forEach(btnId => {
    get(btnId)?.addEventListener("click", () => {
      window.open(`/acrx/edit?id=__new__`, "_blank");
    });
  });
 
  // ── Install (zip upload) ──
  get("cust-layouts-install")?.addEventListener("click", () => get("cust-layout-zip-input")?.click());
 
  get("cust-layout-zip-input")?.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    const progress  = get("cust-layout-upload-progress");
    const bar       = get("cust-layout-upload-bar");
    const statusEl  = get("cust-layout-upload-status");
 
    if (progress) progress.style.display = "flex";
    if (bar)      bar.style.width = "0%";
    if (statusEl) statusEl.textContent = "Uploading…";
 
    try {
      const fd = new FormData();
      fd.append("zip", file);
 
      const res  = await fetch(`${API_BASE}/install`, { method: "POST", body: fd });
      const data = await res.json();
 
      if (data.status === "conflict") {
        const confirmed = confirm(`Layout "${data.id}" v${data.version} is already installed. Update it?`);
        if (!confirmed) { if (progress) progress.style.display = "none"; return; }
        const resForcep = await fetch(`${API_BASE}/install?mode=update`, { method: "POST", body: fd });
        const dataForce = await resForcep.json();
        if (dataForce.status !== "success") throw new Error(dataForce.error || "Update failed");
        System?.showToast?.(`Layout updated: ${dataForce.id}`, "success");
      } else if (data.status === "success") {
        System?.showToast?.(`Layout installed: ${data.id}`, "success");
      } else {
        throw new Error(data.error || data.message || "Install failed");
      }
 
      if (bar)      bar.style.width = "100%";
      if (statusEl) statusEl.textContent = "Done";
      await loadInstalledLayouts();
      activateSection("layouts");
    } catch (err) {
      System?.showToast?.(`Install failed: ${err.message}`, "error");
    } finally {
      setTimeout(() => { if (progress) progress.style.display = "none"; }, 1500);
      e.target.value = "";
    }
  });
 
  // ── Preview layout ──
  panelContent.querySelectorAll("[data-layout-preview]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.layoutPreview;
      store.previewLayoutId = id;
      if (layoutNameText) {
        const l = store.installedLayouts.find(x => x.id === id);
        layoutNameText.textContent = (l?.name || id) + " (preview)";
      }
      await loadRoutes();
      navigateTo("/");
      activateSection("layouts");
      System?.showToast?.(`Previewing: ${id}`, "info");
    });
  });
 
  // ── Edit layout files ──
  panelContent.querySelectorAll("[data-layout-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      window.open(`/acrx/edit?id=${btn.dataset.layoutEdit}`, "_blank");
    });
  });
 
  // ── Activate layout ──
  panelContent.querySelectorAll("[data-layout-activate]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.layoutActivate;
      const layout = store.installedLayouts.find(l => l.id === id);
      if (!confirm(`Activate "${layout?.name || id}" as the live layout?\n\nThis affects all visitors to the public site.`)) return;
 
      try {
        btn.disabled  = true;
        btn.innerHTML = `<i class="fa-regular fa-spinner fa-spin"></i> Activating…`;
 
        const res  = await fetch(`${API_BASE}/get/active`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ id }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Activation failed");
 
        store.activeLayoutId  = id;
        store.layoutId        = id;
        store.previewLayoutId = id;
 
        if (layoutNameText) {
          const l = store.installedLayouts.find(x => x.id === id);
          layoutNameText.textContent = l?.name || id;
        }
 
        // Reload config for newly-active layout
        await loadConfig();
 
        System?.showToast?.(`Layout activated: ${layout?.name || id}`, "success");
        activateSection("layouts");
        refreshPreview();
      } catch (err) {
        System?.showToast?.(`Activation failed: ${err.message}`, "error");
        btn.disabled  = false;
        btn.innerHTML = `<i class="fa-regular fa-toggle-large-off"></i> Activate`;
      }
    });
  });
}

  function _bindContent() {
    get("cust-postsPerPage")?.addEventListener("change", e =>
      _setPending("content", "postsPerPage", parseInt(e.target.value))
    );
    get("cust-allowComments")?.addEventListener("change", e =>
      _setPending("content", "allowComments", e.target.checked)
    );
  }

  function _bindAI() {
    get("cust-ai-test")?.addEventListener("click", async () => {
      const btn    = get("cust-ai-test");
      const result = get("cust-ai-test-result");
      const prov   = get("cust-aiProvider")?.value || "openai";
      btn.disabled = true;
      if (result) result.textContent = "Testing…";
      try {
        const res  = await fetch(`${SETTINGS_BASE}/ai/test`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: prov }),
        });
        const d = await res.json();
        if (result) {
          result.textContent = d.success ? `✓ Connected (${d.latencyMs}ms)` : "✗ Failed";
          result.className   = `cust-ai-test-result ${d.success ? "ok" : "fail"}`;
        }
      } catch { if (result) { result.textContent = "✗ Error"; result.className = "cust-ai-test-result fail"; } }
      finally { btn.disabled = false; }
    });
  }

  function _bindAdvanced() {
    get("cust-inspectToggle")?.addEventListener("change", e => _toggleInspector(e.target.checked));
    get("cust-autoSave")?.addEventListener("change", e => {
      store.autoSave = e.target.checked;
      if (store.autoSave && store.unsavedChanges) _scheduleAutoSave();
    });
    get("cust-hidePreviewBar")?.addEventListener("change", e => {
      const bar = document.querySelector(".preview-controls");
      if (bar) bar.style.display = e.target.checked ? "none" : "";
      if (e.target.checked) localStorage.setItem(LS.CTRL_BAR, "1"); else localStorage.removeItem(LS.CTRL_BAR);
    });
    get("cust-hideTopbar")?.addEventListener("change", e => {
      if (e.target.checked) localStorage.setItem(LS.TOPBAR, "1"); else localStorage.removeItem(LS.TOPBAR);
      _applyTopbarState();
      _syncShowTopbarBtn();
    });
    get("cust-liveReload")?.addEventListener("change", e => { store.liveReload = e.target.checked; });
get("cust-reset-config")?.addEventListener("click", async () => {
  if (!confirm("Reset all layout config to defaults? This cannot be undone.")) return;
  try {
    // STEP 5: Build a fresh config from resetSchema defaults only.
    const defaults = {};
    const schemaKeys = Object.keys(store.resetSchema || {});
    const canonicalUnderLayout = new Set(["colors", "typography", "homepage", "animations"]);
 
    schemaKeys.forEach(section => {
      const sectionSchema = store.resetSchema[section] || {};
      const sectionDefaults = {};
      Object.entries(sectionSchema).forEach(([key, def]) => {
        if (def?.default !== undefined) sectionDefaults[key] = def.default;
      });
 
      if (canonicalUnderLayout.has(section)) {
        if (!defaults.layout) defaults.layout = {};
        defaults.layout[section] = sectionDefaults;
      } else {
        defaults[section] = sectionDefaults;
      }
    });
 
 
    const res = await fetch(`${API_BASE}/${store.layoutId}/config`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ config: defaults }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Reset save failed");
 
    store.savedConfig   = deepClone(defaults);
    store.pendingConfig = deepClone(defaults);
    markDirty();
    activateSection(store.activeSection || "colors");
    refreshPreview();
    System?.showToast?.("Config reset to defaults.", "success");
  } catch (err) {
    System?.showToast?.(`Reset failed: ${err.message}`, "error");
  }
});
  }

  // ─────────────────────────────────────────────────────────────
  // SECTION SAVERS
  // ─────────────────────────────────────────────────────────────

  async function _saveSection(key) {
    try {
      switch (key) {
case "identity": {
  const payload = {
    siteName:        get("cust-siteName")?.value        ?? store.settings.general.siteName        ?? "",
    siteTagline:     get("cust-siteTagline")?.value     ?? store.settings.general.siteTagline     ?? "",
    siteDescription: get("cust-siteDesc")?.value        ?? store.settings.general.siteDescription ?? "",
    siteLogo:        store.settings.general.siteLogo    ?? "",
    siteFavicon:     store.settings.general.siteFavicon ?? "",
  };
 
 
  const res = await fetch(`${SETTINGS_BASE}/general`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Save failed");
 
  // Sync local state
  store.settings.general = { ...store.settings.general, ...payload };
  markDirty();
  System?.showToast?.("Identity saved.", "success");
  refreshPreview();
  return; // Identity does not touch layout config — early return
}
 
 
        case "colors": {
          const colors = {};
          // Read the actual editable HEX inputs (swatch buttons don't have a usable value)
          panelContent.querySelectorAll("input.cust-color-hex[data-color-hex]").forEach(inp => {
            const k = inp.dataset.colorHex;
            const v = String(inp.value || "").trim();
            if (/^#[0-9a-f]{3,8}$/i.test(v)) colors[k] = v;
          });
          _setPending("colors", null, colors, true);
          break;
        }
        case "typography": {
          _setPending("typography", "headingFont",  get("cust-headingFont")?.value);
          _setPending("typography", "bodyFont",     get("cust-bodyFont")?.value);
          _setPending("typography", "baseFontSize", Number(get("cust-baseFontSize")?.value || 16));
          break;
        }
        case "ai": {
          await System?.updateSection?.("ai", {
            enabled:         get("cust-aiEnabled")?.checked,
            defaultProvider: get("cust-aiProvider")?.value,
          });
          break;
        }
        case "menus": {
          // Save slot assignments
          const pending = store._pendingMenuSlots || {};
          for (const [slot, menuId] of Object.entries(pending)) {
            await fetch(`${MENUS_BASE}/slots/assign`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slot, menuId, layoutId: store.layoutId }),
            });
          }
          store._pendingMenuSlots = {};
          await loadMenus();
          System?.showToast?.("Menu assignments saved.", "success");
          return; // Early return — no layout config to flush
        }
        case "content": {
          break;
        }
        // Generic schema sections
        default: {
          // Already updated via _setPending by field bindings
          break;
        }
      }

      // Flush pendingConfig
      const res  = await fetch(`${API_BASE}/${store.layoutId}/config`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: store.pendingConfig }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      store.savedConfig = deepClone(store.pendingConfig);
      markDirty();
      System?.showToast?.("Saved.", "success");
      refreshPreview();
    } catch (err) {
      System?.showToast?.(`Save failed: ${err.message}`, "error");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // GOOGLE FONTS
  // ─────────────────────────────────────────────────────────────

  let _fontTimer = null;
  const _fontCache = {};

  function _initFontSearch(inputId, resultsId, hiddenId, labelId, section, key) {
    const input   = get(inputId);
    const results = get(resultsId);
    if (!input || !results) return;

    input.addEventListener("input", () => {
      clearTimeout(_fontTimer);
      const q = input.value.trim();
      if (q.length < 2) { results.innerHTML = ""; return; }
      _fontTimer = setTimeout(() => _searchFonts(q, results, hiddenId, labelId, section, key), 300);
    });
    input.addEventListener("keydown", e => { if (e.key === "Escape") results.innerHTML = ""; });
  }

  async function _searchFonts(query, resultsEl, hiddenId, labelId, section, key) {
    if (_fontCache[query]) { _renderFontResults(_fontCache[query], resultsEl, hiddenId, labelId, section, key); return; }
    resultsEl.innerHTML = `<div class="cust-font-loading"><i class="fa-regular fa-spinner fa-spin"></i> Searching…</div>`;
    try {
      const proxyRes  = await fetch(`${MEDIA_BASE}/fonts/search?q=${encodeURIComponent(query)}`);
      const proxyData = await proxyRes.json();
      const fonts     = proxyData.fonts || [];
      _fontCache[query] = fonts;
      _renderFontResults(fonts, resultsEl, hiddenId, labelId, section, key);
    } catch { resultsEl.innerHTML = `<div class="cust-font-error">Could not load fonts.</div>`; }
  }

  function _renderFontResults(fonts, resultsEl, hiddenId, labelId, section, key) {
    if (!fonts.length) { resultsEl.innerHTML = `<div class="cust-font-empty">No fonts found.</div>`; return; }
    resultsEl.innerHTML = fonts.map(f =>
      `<button class="cust-font-item" data-family="${escapeAttr(f.family)}"
               style="font-family:'${escapeAttr(f.family)}',sans-serif;">${escapeHtml(f.family)}</button>`
    ).join("");
    fonts.forEach(f => {
      const linkId = `gfont-${f.family.replace(/\s+/g, "-")}`;
      if (!document.getElementById(linkId)) {
        const link = Object.assign(document.createElement("link"), {
          id: linkId, rel: "stylesheet",
          href: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}&display=swap`,
        });
        document.head.appendChild(link);
      }
    });
    resultsEl.querySelectorAll(".cust-font-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const family = btn.dataset.family;
        const h = get(hiddenId);
        const l = get(labelId);
        if (h) h.value = family;
        if (l) l.textContent = family;
        resultsEl.innerHTML = "";
        if (section && key) _setPending(section, key, family);
        markDirty();
        fetch(`${MEDIA_BASE}/fonts/download`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ family }),
        }).catch(() => {});
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // INSPECTOR
  // ─────────────────────────────────────────────────────────────

  get("btn-inspect-mode")?.addEventListener("click", () => _toggleInspector(!store.inspector.enabled));
  get("inspector-close")?.addEventListener("click", () => _toggleInspector(false));

  function _toggleInspector(on) {
    store.inspector.enabled = on;
    localStorage.setItem(LS.INSPECTOR, on ? "1" : "");
    get("btn-inspect-mode")?.classList.toggle("active", on);
    const panel   = get("inspector-panel");
    const preview = get("customizer-preview");
    if (panel)   panel.classList.toggle("visible", on);
    if (preview) preview.classList.toggle("inspector-open", on);
    getIframe()?.contentWindow?.postMessage({ source: "acroxa-customizer", type: "inspect.toggle", enabled: on }, "*");
    const adv = get("cust-inspectToggle");
    if (adv) adv.checked = on;
    if (!on && panel) {
      panel.querySelector(".inspector-empty")?.classList.remove("hidden");
      panel.querySelector(".inspector-data")?.classList.add("hidden");
    }
  }

  function _renderInspectorPanel(data) {
    store.inspector.lastData = data;
    const panel  = get("inspector-panel");
    if (!panel) return;
    const empty  = panel.querySelector(".inspector-empty");
    const dataEl = panel.querySelector(".inspector-data");
    if (empty)  empty.classList.add("hidden");
    if (!dataEl) return;
    dataEl.classList.remove("hidden");

    const classPills = (data.classes || []).map(c => `<span class="insp-pill">${escapeHtml(c)}</span>`).join("");
    const dataAttrs  = Object.entries(data.dataset || {}).map(([k,v]) =>
      `<div class="insp-row"><span class="insp-key">data-${escapeHtml(k)}</span><span class="insp-val">${escapeHtml(v)}</span></div>`
    ).join("");
    const styleAttrs = Object.entries(data.styles || {}).map(([k,v]) =>
      `<div class="insp-row"><span class="insp-key">${escapeHtml(k)}</span><span class="insp-val">${escapeHtml(v)}</span></div>`
    ).join("");
    const parents = (data.parents || []).map(p => `<span class="insp-parent">${escapeHtml(p)}</span>`)
      .join(" <i class='fa-solid fa-chevron-right insp-arrow'></i> ");

    dataEl.innerHTML = `
      <div class="insp-block">
        <div class="insp-row insp-row-main">
          <span class="insp-tag">&lt;${escapeHtml(data.tag)}&gt;</span>
          ${data.id ? `<span class="insp-id">#${escapeHtml(data.id)}</span>` : ""}
          <button class="insp-copy" data-copy="${escapeAttr(data.tag + (data.id?"#"+data.id:""))}">
            <i class="fa-regular fa-copy"></i>
          </button>
        </div>
      </div>
      ${classPills ? `<div class="insp-block"><div class="insp-block-title">Classes</div><div class="insp-pills">${classPills}</div></div>` : ""}
      ${dataAttrs  ? `<div class="insp-block"><div class="insp-block-title">Data</div>${dataAttrs}</div>` : ""}
      ${styleAttrs ? `<div class="insp-block"><div class="insp-block-title">Inline Styles</div>${styleAttrs}</div>` : ""}
      <div class="insp-block"><div class="insp-block-title">DOM Depth: ${data.depth ?? "?"}</div>${parents ? `<div class="insp-parents">${parents}</div>` : ""}</div>`;

    dataEl.querySelectorAll(".insp-copy").forEach(btn => {
      btn.addEventListener("click", () => {
        navigator.clipboard?.writeText(btn.dataset.copy);
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
      });
    });
  }

  if (localStorage.getItem(LS.INSPECTOR)) _toggleInspector(true);

  // ─────────────────────────────────────────────────────────────
  // AI SPARKLE POPUP
  // ─────────────────────────────────────────────────────────────
function _closeAIPopup() {
  const overlay = document.getElementById("ai-sparkle-popup");
  if (!overlay) return;
 
  overlay.classList.add("hidden");
 
  function onEnd() {
    overlay.removeEventListener("transitionend", onEnd);
    overlay.remove();
  }
 
  overlay.addEventListener("transitionend", onEnd);
 
  // Fallback in case no transition is defined
  setTimeout(() => { if (overlay.isConnected) overlay.remove(); }, 600);
}
 
async function _openAIPopup(section) {
  // If already open, close it
  if (document.getElementById("ai-sparkle-popup")) { _closeAIPopup(); return; }
 
  const overlay = document.createElement("div");
  overlay.id        = "ai-sparkle-popup";
  overlay.className = "ai-popup-overlay hidden"; // start hidden
  overlay.innerHTML = `
    <div class="ai-popup">
      <div class="ai-popup-header">
        <i class="fa-duotone fa-sparkles"></i>
        <span>AI Suggestions — ${humanize(section)}</span>
        <button class="ai-popup-close" id="ai-popup-close">
          <i class="fa-regular fa-xmark"></i>
        </button>
      </div>
      <div class="ai-popup-body" id="ai-popup-body">
        <div class="ai-popup-context" id="ai-popup-context">
          ${_renderAIContext(section)}
        </div>
        <button class="cust-btn cust-btn-accent ai-popup-generate" id="ai-popup-generate">
          <i class="fa-duotone fa-sparkles"></i> Generate Suggestions
        </button>
        <div class="ai-popup-results" id="ai-popup-results"></div>
      </div>
    </div>`;
 
  overlay.addEventListener("click", e => { if (e.target === overlay) _closeAIPopup(); });
  overlay.querySelector("#ai-popup-close").addEventListener("click", _closeAIPopup);
  overlay.querySelector("#ai-popup-generate").addEventListener("click", () => _runAISuggestion(section));
 
  document.body.appendChild(overlay);
 
  // Remove .hidden next frame so CSS transition fires
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.remove("hidden"));
  });
}
 
  function _renderAIContext(section) {
    switch (section) {
      case "identity":
        return `<div class="ai-ctx-fields">
          <label class="cust-label">Describe your site</label>
          <textarea class="cust-input cust-textarea" id="ai-ctx-desc" rows="3" placeholder="e.g. A portfolio for a freelance photographer specializing in landscapes…"></textarea>
          <label class="cust-label">Keywords</label>
          <input class="cust-input" id="ai-ctx-keywords" placeholder="photography, landscape, minimal…" />
        </div>`;
      case "colors":
        return `<div class="ai-ctx-fields">
          <label class="cust-label">Mood / Style</label>
          <input class="cust-input" id="ai-ctx-mood" placeholder="e.g. futuristic, dark, neon glow…" value="dark, futuristic" />
          <label class="cust-label">Industry</label>
          <input class="cust-input" id="ai-ctx-industry" placeholder="e.g. tech, fashion, food…" />
        </div>`;
      case "typography":
        return `<div class="ai-ctx-fields">
          <label class="cust-label">Visual style</label>
          <input class="cust-input" id="ai-ctx-style" placeholder="e.g. modern, editorial, playful…" />
          <label class="cust-label">Industry</label>
          <input class="cust-input" id="ai-ctx-industry" placeholder="e.g. tech, fashion, food…" />
        </div>`;
      default:
        return `<div class="ai-ctx-fields">
          <label class="cust-label">Additional context</label>
          <textarea class="cust-input cust-textarea" id="ai-ctx-desc" rows="2" placeholder="Describe what you're looking for…"></textarea>
        </div>`;
    }
  }

  async function _runAISuggestion(section) {
    const btn     = document.getElementById("ai-popup-generate");
    const results = document.getElementById("ai-popup-results");
    if (!btn || !results) return;

    btn.disabled    = true;
    results.innerHTML = `<div class="ai-loading"><i class="fa-regular fa-spinner fa-spin"></i> Generating…</div>`;

    try {
      let endpoint = "";
      let body     = {};

      switch (section) {
        case "identity": {
          endpoint = `${AI_BASE}/suggest/identity`;
          body = {
            description:    document.getElementById("ai-ctx-desc")?.value || "",
            keywords:       (document.getElementById("ai-ctx-keywords")?.value || "").split(",").map(s => s.trim()).filter(Boolean),
            currentName:    store.settings.general?.siteName    || "",
            currentTagline: store.settings.general?.siteTagline || "",
          };
          break;
        }
        case "colors": {
          endpoint = `${AI_BASE}/suggest/colors`;
          body = {
            mood:          document.getElementById("ai-ctx-mood")?.value     || "",
            industry:      document.getElementById("ai-ctx-industry")?.value || "",
            currentColors: store.pendingConfig?.layout?.colors || store.pendingConfig?.colors || {},
            siteName:      store.settings.general?.siteName || "",
          };
          break;
        }
        case "typography": {
          endpoint = `${AI_BASE}/suggest/typography`;
          body = {
            style:          document.getElementById("ai-ctx-style")?.value    || "",
            industry:       document.getElementById("ai-ctx-industry")?.value || "",
            currentHeading: store.pendingConfig?.layout?.typography?.headingFont || store.pendingConfig?.typography?.headingFont || "",
            currentBody:    store.pendingConfig?.layout?.typography?.bodyFont    || store.pendingConfig?.typography?.bodyFont    || "",
          };
          break;
        }
      }

      const res  = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "AI request failed");

      // Needed so "Apply" buttons can read the suggestions
      window._aiLastSuggestions = data.suggestions || {};

      results.innerHTML = _renderAISuggestions(section, data.suggestions);
      _bindAISuggestions(section);
    } catch (err) {
      results.innerHTML = `<div class="ai-error"><i class="fa-regular fa-triangle-exclamation"></i> ${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  function _renderAISuggestions(section, suggestions) {
    if (!suggestions) return `<div class="ai-error">No suggestions returned.</div>`;

    switch (section) {
      case "identity": {
        const { names = [], taglines = [] } = suggestions;
        return `<div class="ai-suggestions">
          <div class="ai-sugg-group">
            <h4>Name Suggestions</h4>
            ${names.map((n, i) => `<button class="ai-sugg-btn" data-apply-name="${escapeAttr(n)}" data-idx="${i}">
              ${escapeHtml(n)} <i class="fa-regular fa-arrow-right"></i>
            </button>`).join("")}
          </div>
          <div class="ai-sugg-group">
            <h4>Tagline Suggestions</h4>
            ${taglines.map((t, i) => `<button class="ai-sugg-btn" data-apply-tagline="${escapeAttr(t)}" data-idx="${i}">
              ${escapeHtml(t)} <i class="fa-regular fa-arrow-right"></i>
            </button>`).join("")}
          </div>
        </div>`;
      }
      case "colors": {
        const { palettes = [] } = suggestions;
        return `<div class="ai-suggestions">
          ${palettes.map((p, i) => `
            <div class="ai-palette-card">
              <div class="ai-palette-swatches">
                ${Object.entries(p.colors || {}).map(([k, v]) =>
                  `<div class="ai-swatch" style="background:${v}" title="${k}: ${v}"></div>`
                ).join("")}
              </div>
              <div class="ai-palette-info">
                <strong>${escapeHtml(p.name || "Palette " + (i+1))}</strong>
                <span>${escapeHtml(p.description || "")}</span>
              </div>
              <button class="ai-sugg-btn ai-apply-palette" data-palette-idx="${i}">
                Apply <i class="fa-regular fa-arrow-right"></i>
              </button>
            </div>
          `).join("")}
        </div>`;
      }
      case "typography": {
        const { pairings = [] } = suggestions;
        return `<div class="ai-suggestions">
          ${pairings.map((p, i) => {
            // Load font previews
            [p.headingFont, p.bodyFont].forEach(f => {
              if (f && !document.getElementById(`gfont-ai-${f.replace(/\s+/g, "-")}`)) {
                const link = Object.assign(document.createElement("link"), {
                  id: `gfont-ai-${f.replace(/\s+/g, "-")}`, rel: "stylesheet",
                  href: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}&display=swap`,
                });
                document.head.appendChild(link);
              }
            });
            return `<div class="ai-font-card">
              <div class="ai-font-preview">
                <span style="font-family:'${escapeAttr(p.headingFont)}',sans-serif;font-size:1.2rem">${escapeHtml(p.headingFont)}</span>
                <span style="font-family:'${escapeAttr(p.bodyFont)}',sans-serif;font-size:0.85rem">${escapeHtml(p.bodyFont)}</span>
              </div>
              <div class="ai-font-info">
                <strong>${escapeHtml(p.name || "")}</strong>
                <span>${escapeHtml(p.description || "")}</span>
              </div>
              <button class="ai-sugg-btn ai-apply-font" data-font-idx="${i}">
                Apply <i class="fa-regular fa-arrow-right"></i>
              </button>
            </div>`;
          }).join("")}
        </div>`;
      }
      default:
        return `<div class="ai-error">Section not supported.</div>`;
    }
  }

  function _bindAISuggestions(section) {
    const results = document.getElementById("ai-popup-results");
    if (!results) return;

    // Identity: apply name
    results.querySelectorAll("[data-apply-name]").forEach(btn => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.applyName;
        const inp = get("cust-siteName");
        if (inp) inp.value = v;
        markDirty();
        System?.showToast?.("Name applied.", "success");
      });
    });

    // Identity: apply tagline
    results.querySelectorAll("[data-apply-tagline]").forEach(btn => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.applyTagline;
        const inp = get("cust-siteTagline");
        if (inp) inp.value = v;
        markDirty();
        System?.showToast?.("Tagline applied.", "success");
      });
    });

    // Colors: apply palette
    results.querySelectorAll(".ai-apply-palette").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx  = parseInt(btn.dataset.paletteIdx, 10);
        const popupResults = document.getElementById("ai-popup-results");
        // Get palette data from a hidden store
        if (!window._aiLastSuggestions?.palettes) return;
        const palette = window._aiLastSuggestions.palettes[idx];
        if (!palette?.colors) return;
        _setPending("colors", null, palette.colors, true);
        // Re-render colors section if active
        if (store.activeSection === "colors") activateSection("colors");
        System?.showToast?.("Palette applied.", "success");
        document.getElementById("ai-sparkle-popup")?.remove();
      });
    });

    // Typography: apply font pairing
    results.querySelectorAll(".ai-apply-font").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!window._aiLastSuggestions?.pairings) return;
        const idx     = parseInt(btn.dataset.fontIdx, 10);
        const pairing = window._aiLastSuggestions.pairings[idx];
        if (!pairing) return;
        _setPending("typography", "headingFont",  pairing.headingFont);
        _setPending("typography", "bodyFont",     pairing.bodyFont);
        if (pairing.baseFontSize) _setPending("typography", "baseFontSize", pairing.baseFontSize);
        if (store.activeSection === "typography") activateSection("typography");
        System?.showToast?.("Font pairing applied.", "success");
        document.getElementById("ai-sparkle-popup")?.remove();
      });
    });
  }
const ColorState = new Map();

/* ─────────────────────────────
   CONVERTERS
───────────────────────────── */

function hexToRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(x => x + x).join("");

  const num = parseInt(hex, 16);

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}
/* ─────────────────────────────────────────────
   HSV → HEX
───────────────────────────────────────────── */
function hsvToHex(h, s, v) {

  s /= 100;
  v /= 100;

  let c = v * s;
  let x = c * (1 - Math.abs((h / 60) % 2 - 1));
  let m = v - c;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  }
  else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  }
  else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  }
  else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  }
  else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  }
  else {
    r = c; g = 0; b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return rgbToHex(r, g, b);
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b]
    .map(v => v.toString(16).padStart(2, "0"))
    .join("");
} 
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  let h = 0, s = 0;
  const l = (max + min) / 2;

  const d = max - min;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }

    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, l: l * 100 };
}

// RGB → HSV (H: 0..360, S: 0..100, V: 0..100)
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d === 0) {
    h = 0;
  } else if (max === r) {
    h = ((g - b) / d) % 6;
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }

  h *= 60;
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s: s * 100, v: v * 100 };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;

  const c = (1 - Math.abs(2*l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (h < 60) [r,g,b] = [c,x,0];
  else if (h < 120) [r,g,b] = [x,c,0];
  else if (h < 180) [r,g,b] = [0,c,x];
  else if (h < 240) [r,g,b] = [0,x,c];
  else if (h < 300) [r,g,b] = [x,0,c];
  else [r,g,b] = [c,0,x];

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return `#${[r,g,b].map(v => v.toString(16).padStart(2,'0')).join('')}`;
}

/* ─────────────────────────────
   STATE
───────────────────────────── */

function initColorState(key, hex) {
  if (ColorState.has(key)) return ColorState.get(key);

  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const state = {
    hex,
    rgb,
    hsl,
    h: hsl.h,
    s: hsl.s,
    l: hsl.l
  };

  ColorState.set(key, state);
  return state;
}

function renderColorField({ key, label, value, id }) {

  return `
  <div class="cust-field" data-color-field="${key}">

    <label class="cust-label">${escapeHtml(label)}</label>

    <div class="cust-color-row"
         data-color-picker
         data-color-key="${key}">

      <input
        class="cust-color-native"
        type="color"
        id="${id}"
        value="${escapeAttr(value)}"
        data-color-key="${key}"
      />

      <button type="button"
              class="cust-color-swatch"
              data-color-trigger="${key}">
        <span class="cust-color-preview"
              style="background:${escapeAttr(value)}"
              data-color-preview="${key}">
        </span>
      </button>

      <input class="cust-input cust-color-hex"
             id="${id}-hex"
             type="text"
             value="${escapeAttr(value)}"
             maxlength="9"
             data-color-hex="${key}" />

      <div class="cust-color-popup hidden" data-color-popup="${key}">

        <!-- SV AREA -->
        <div class="cust-color-sv" data-sv="${key}">
          <div class="cust-color-sv-white"></div>
          <div class="cust-color-sv-black"></div>
          <div class="cust-color-sv-cursor"></div>
        </div>

        <!-- HUE -->
        <div class="cust-color-hue" data-hue="${key}">
          <div class="cust-color-hue-thumb"></div>
        </div>

        <!-- HEX -->
        <div class="cust-color-format">

          <button class="cust-format-btn" data-format-prev><i class="fa-solid fa-chevron-up"></i></button>

          <input
            class="cust-input cust-color-hex"
            type="text"
            value="${escapeAttr(value || "#000000")}"
            id="${id}-hex"
            data-format-input="${key}"
          />

          <button class="cust-format-btn" data-format-next><i class="fa-solid fa-chevron-down"></i></button>

        </div>

        <!-- PALETTE -->
        <div class="cust-color-palette">

          ${[
  /* ───────── GRAYSCALE (18) ───────── */
  "#000000", "#0d0d0d", "#1a1a1a", "#262626", "#333333",
  "#404040", "#4d4d4d", "#595959", "#666666", "#737373",
  "#808080", "#8c8c8c", "#999999", "#a6a6a6", "#b3b3b3",
  "#c0c0c0", "#e0e0e0", "#ffffff",

  /* ───────── WARM UI NEUTRALS (6) ───────── */
  "#2b1d1d", "#3a2a1f", "#4a3a2a", "#5a4a3a", "#6a5a4a", "#7a6a5a",

  /* ───────── PRIMARY COLORS (12) ───────── */
  "#ff0000", "#ff3b30", "#ff7a00", "#ff9500",
  "#ffcc00", "#ffd60a", "#34c759", "#00ff00",
  "#00c7be", "#00ffff", "#007aff", "#0066ff",

  /* ───────── SECONDARY / VIBRANT (10) ───────── */
  "#5856d6", "#7a00ff", "#af52de", "#ff2d55",
  "#ff00ff", "#ff0066", "#ff4d4d", "#ff66cc",
  "#4dd0e1", "#4caf50",

  /* ───────── MODERN UI ACCENTS (8) ───────── */
  "#1f2937", "#111827", "#0f172a", "#0ea5e9",
  "#22c55e", "#f97316", "#eab308", "#ec4899"
].map(color => `
            <button
              class="cust-color-preset"
              style="background:${color}"
              data-preset="${color}"
              title="${color}">
            </button>
          `).join("")}

        </div>
      </div>

    </div>
  </div>
  `;
}

function initColorPickers(root = document) {

  root.querySelectorAll("[data-color-picker]").forEach(picker => {

    if (picker.dataset.bound === "1") return;
    picker.dataset.bound = "1";

    const key = picker.dataset.colorKey;

    const sv = picker.querySelector("[data-sv]");
    const hue = picker.querySelector("[data-hue]");

    const popup = picker.querySelector("[data-color-popup]");
    const trigger = picker.querySelector("[data-color-trigger]");

    const svCursor = picker.querySelector(".cust-color-sv-cursor");
    const hueThumb = picker.querySelector(".cust-color-hue-thumb");

    const preview = picker.querySelector(".cust-color-preview");
    const native = picker.querySelector("input[type=color]");

    const innerHex = picker.querySelector("[data-format-input]");
    const outerHex = picker.querySelector(".cust-color-hex");

    const formatBtns = picker.querySelectorAll(".cust-format-btn");

    const presets = picker.querySelectorAll("[data-preset]");

    /* ─────────────────────────────
       HSV STATE (FIXED MODEL)
    ───────────────────────────── */
    const state = {
      h: 0,
      s: 100,
      v: 100,
      format: "hex"
    };

    /* INIT FROM VALUE */
    const initial = hexToRgb(native?.value || "#000000");
    const initHSV = rgbToHsv(initial.r, initial.g, initial.b);
    state.h = initHSV.h;
    state.s = initHSV.s;
    state.v = initHSV.v;

    /* ─────────────────────────────
       FORMAT CONVERTER
    ───────────────────────────── */
    const FORMATS = ["hex", "rgb", "hsl"];

    function formatColor() {
      const hex = hsvToHex(state.h, state.s, state.v);

      const rgb = hexToRgb(hex);

      if (state.format === "hex") return hex;
      if (state.format === "rgb") return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      return `hsl(${Math.round(hsl.h)},${Math.round(hsl.s)}%,${Math.round(hsl.l)}%)`;
    }

    /* ─────────────────────────────
       APPLY STATE (SINGLE SOURCE)
    ───────────────────────────── */
    function applyState() {

      const hex = hsvToHex(state.h, state.s, state.v);

      /* sync all inputs */
     const formatted = formatColor();

      /* BOTH INPUTS SYNCED */
      if (innerHex) innerHex.value = formatted;
      if (outerHex) outerHex.value = hex;

      if (preview) preview.style.background = hex;
      if (native) native.value = hex;

      /* SV background FIXED */
      if (sv) {
        sv.style.background = `hsl(${state.h}, 100%, 50%)`;
      }

      /* cursor */
      if (svCursor) {
        svCursor.style.left = `${state.s}%`;
        svCursor.style.top = `${100 - state.v}%`;
      }

      /* hue */
      if (hueThumb) {
        hueThumb.style.left = `${(state.h / 360) * 100}%`;
      }

      /* HEX format input */
      if (innerHex) innerHex.value = formatted;
      if (outerHex) outerHex.value = hex;

      /* store */
      _setPending("colors", key, hex);
    }

    // If user changes the native <input type="color">, sync picker HSV state.
    native?.addEventListener("input", () => {
      const rgb = hexToRgb(native?.value || "#000000");
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      state.h = hsv.h;
      state.s = hsv.s;
      state.v = hsv.v;
      applyState();
    });

    /* ─────────────────────────────
       OPEN / CLOSE
    ───────────────────────────── */
    trigger?.addEventListener("click", e => {
      e.stopPropagation();

      document.querySelectorAll(".cust-color-popup")
        .forEach(p => p.classList.add("hidden"));

      popup?.classList.remove("hidden");
    });

    document.addEventListener("click", e => {
      if (!picker.contains(e.target)) popup?.classList.add("hidden");
    });

    /* ─────────────────────────────
       HUE DRAG
    ───────────────────────────── */
    hue?.addEventListener("mousedown", e => {

      const move = ev => {
        const rect = hue.getBoundingClientRect();

        let x = (ev.clientX - rect.left) / rect.width;
        x = Math.max(0, Math.min(1, x));

        state.h = x * 360;
        applyState();
      };

      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", () => {
        window.removeEventListener("mousemove", move);
      }, { once: true });
    });

    /* ─────────────────────────────
       SV DRAG (HSV FIXED)
    ───────────────────────────── */
    sv?.addEventListener("mousedown", e => {

      const move = ev => {
        const rect = sv.getBoundingClientRect();

        let x = (ev.clientX - rect.left) / rect.width;
        let y = (ev.clientY - rect.top) / rect.height;

        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));

        state.s = x * 100;
        state.v = (1 - y) * 100;

        applyState();
      };

      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", () => {
        window.removeEventListener("mousemove", move);
      }, { once: true });
    });

    /* ─────────────────────────────
       HEX INPUT SYNC (BOTH)
    ───────────────────────────── */
    function bindHex(el) {
      el?.addEventListener("input", () => {
        const rgb = hexToRgb(el.value || "#000000");
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

        state.h = hsv.h;
        state.s = hsv.s;
        state.v = hsv.v;

        applyState();
      });
    }

    bindHex(innerHex);
    bindHex(outerHex);

    /* ─────────────────────────────
       FORMAT BUTTONS (FIXED)
    ───────────────────────────── */
    formatBtns.forEach(btn => {
      btn.addEventListener("click", () => {

        let i = FORMATS.indexOf(state.format);
        i = btn.dataset.formatNext ? i + 1 : i - 1;

        if (i < 0) i = FORMATS.length - 1;
        if (i >= FORMATS.length) i = 0;

        state.format = FORMATS[i];
        applyState();
      });
    });

    /* ─────────────────────────────
       PALETTE
    ───────────────────────────── */
    presets.forEach(btn => {
      btn.addEventListener("click", () => {

        const rgb = hexToRgb(btn.dataset.preset);
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

        state.h = hsv.h;
        state.s = hsv.s;
        state.v = hsv.v;

        applyState();
      });
    });

    /* INIT */
    applyState();
  });
}
function watchColorPickerDOM() {

  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if ([...m.addedNodes].some(n =>
        n.nodeType === 1 && n.querySelector?.("[data-color-picker]")
      )) {
        initColorPickers(document);
        break;
      }
    }
  });

  obs.observe(document.body, {
    childList: true,
    subtree: true
  });
}
  // ─────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────

  function humanize(str = "") {
    return str.replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, s => s.toUpperCase()).trim();
  }
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function escapeHtml(str = "") {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
  function escapeAttr(str = "") { return String(str).replace(/"/g,"&quot;"); }
  function _icon(name) { return `<i class="fa-regular fa-${name}"></i>`; }
  function _kebab(str) {
    return str.replace(/([a-z])([A-Z])/g,"$1-$2").toLowerCase().replace(/[^a-z0-9-]/g,"-");
  }

  // ─────────────────────────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────────────────────────
const iframe_preview = getIframe();

iframe_preview.addEventListener('load', () => {
    const doc = iframe_preview.contentDocument || iframe_preview.contentWindow.document;

    doc.addEventListener('click', (e) => {
        const link = e.target.closest('a');

        if (!link || link == "#") return;

        const url = new URL(link.href, location.href);

        if (url.origin !== location.origin) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
});
  async function boot() {
    _injectTopbarControls();

    bindIframeEvents();

    await Promise.all([
      loadLayoutMeta(),
      loadInstalledLayouts(),
      loadSiteIdentity(),
      loadConfig(),
      loadSettings(),
      loadMenus(),
      loadRoutes(),

    ]);

    // Set previewLayoutId to match store.layoutId on boot
    store.previewLayoutId = store.layoutId;

    const firstRoute = store.routes[0] || { path: "/", label: "Homepage", icon: "home" };
    navigateTo(firstRoute.path, firstRoute);

    applyViewport("desktop");
    markDirty();
    initSSE();

    // Restore states
    _applyCtrlBarState();
    _applyTopbarState();
    _syncShowTopbarBtn();
    _applyFullscreen();

    if (localStorage.getItem(LS.INSPECTOR)) _toggleInspector(true);

  }

  boot();
  setInterval(() => {
    initColorPickers()
watchColorPickerDOM()
  }, 5000);
});