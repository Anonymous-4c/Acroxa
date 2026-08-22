// src/layouts/framework/layoutEngine.js
//
// Pure rendering runtime. Has zero knowledge of routing.
// RouteResolver determines what to render; LayoutEngine renders it.
//
// FIX: hot-reload asset wipe — assets are now re-injected atomically
//      inside initialize(), so a reload always produces a clean full set.
//
// NEW: menu injection, logo param, favicon <meta> tag, CSS variables from
//      layout config colors section.

const path       = require("path");
const DataLoader = require("./dataLoader.js");
const { resolve: resolveRoute } = require("../../core/RouteResolver.js");

const CONTEXTS = ["live", "preview", "draft", "customizer", "virtual"];

const TEMPLATE_FALLBACKS = {
  homepage: ["homepage", "blog", "page", "404"],
  blog:     ["blog",     "homepage", "page", "404"],
  post:     ["post",     "page",     "404"],
  page:     ["page",     "404"],
  category: ["category", "blog",     "homepage", "404"],
  landing:  ["landing",  "page",     "404"],
  "404":    ["404"],
};

class LayoutEngine {
  constructor(acrx, layoutName, options = {}) {
    this.acrx            = acrx;
    this.layoutName      = layoutName;
    this.layoutPath      = path.join(__dirname, "../", layoutName);
    this.context         = CONTEXTS.includes(options.context) ? options.context : "live";
    this.isolated        = options.isolated || false;
    this.configOverrides = options.configOverrides || null;

    this.meta            = null;
    this.layouts         = null;
    this._initialized    = false;
    this._isolatedAssets = [];
  }

  // ── LIFECYCLE ──────────────────────────────────────────────────────────────

  async initialize() {
     console.log(`🎨 [LayoutEngine:${this.context}] Initializing: ${this.layoutName}`);

    // 1. Load meta.json fresh (always bust cache)
    const metaFilePath = path.join(this.layoutPath, "meta.json");
    delete require.cache[require.resolve(metaFilePath)];
    try {
      this.meta = require(metaFilePath);
    } catch (err) {
       console.error(`❌ Failed to load meta.json for ${this.layoutName}`);
      throw err;
    }

    // 2. Load layout.js (ESM dynamic import for cache busting)
    const layoutFilePath = path.join(this.layoutPath, "layout.js")
      .split(path.sep).join("/");

    try {
      const layoutModule = await import(`file:///${layoutFilePath}?v=${Date.now()}`);
      this.layouts = layoutModule.layouts ?? layoutModule.default?.layouts;
      if (!this.layouts) throw new Error("layout.js must export a `layouts` object");
    } catch (err) {
       console.error(`❌ Failed to load layout.js for ${this.layoutName}:`, err.message);
      throw err;
    }

    // 3. Asset injection
    // ── FIX: for the live engine we ALWAYS clear then re-inject so a hot-reload
    //    never leaves the global list in a stale / partially-cleared state.
    if (!this.isolated) {
      this.clearPreviousAssets();
      this.injectAssets();
    } else {
      this._prepareIsolatedAssets();
    }

    this._initialized = true;
    if (!this.isolated) global.currentLayoutEngine = this;

     console.log(`✅ [LayoutEngine:${this.context}] Ready: ${this.layoutName}`);
  }

  async cleanup() {
     console.log(`🗑️  [LayoutEngine:${this.context}] Cleanup: ${this.layoutName}`);

    if (!this.isolated && this.acrx?.route_uri?.clearLayoutRoutes) {
      this.acrx.route_uri.clearLayoutRoutes(this.layoutName);
    }

    this.clearPreviousAssets();
    this._isolatedAssets = [];

    if (global.currentLayoutEngine === this) global.currentLayoutEngine = null;

    this._initialized = false;
     console.log(`✅ [LayoutEngine:${this.context}] Cleanup complete: ${this.layoutName}`);
  }

  // ── PRIMARY REQUEST HANDLER ────────────────────────────────────────────────

  async handle(req, res) {
    if (!this._initialized) {
      return res.status(500).send(this._errorHTML("Layout engine not initialized"));
    }
    try {
      const resolved  = await this.resolve(req);
      const loader    = new DataLoader({
        preview:     this.context === "preview" || this.context === "draft",
        draft:       this.context === "draft",
        bypassCache: this.context !== "live",
      });
      let data = await loader.loadResolvedData(resolved);

      if (data === null) {
        resolved.type = "404"; resolved.template = "404";
        data = { page_title: "Page Not Found" };
      }

      const renderCtx = await this.buildRenderContext(resolved, data);
      const content   = this.render(resolved.template, renderCtx);
      const html      = this.buildHTML(content, renderCtx);
      return res.send(html);
    } catch (err) {
       console.error(`❌ [LayoutEngine:${this.context}] handle error:`, err);
      return res.status(500).send(this._errorHTML(err.message));
    }
  }

  // ── VIRTUAL RENDER ─────────────────────────────────────────────────────────

  async renderVirtual(url, queryOverrides = {}, dataOverrides = null) {
    if (!this._initialized) throw new Error("Layout engine not initialized");

    const fakeReq = { originalUrl: url, url, query: { ...queryOverrides }, params: {}, method: "GET" };
    let resolved = await this.resolve(fakeReq);

    // Editor live-preview hook: callers may pin the resolution to a specific
    // document so drafts, renamed slugs and never-published pages still
    // resolve instead of falling through to 404.
    const resolutionOverride = dataOverrides?.__resolution;
    if (resolutionOverride && typeof resolutionOverride === "object") {
      resolved = { ...resolved, ...resolutionOverride };
    }

    const loader   = new DataLoader({ preview: true, draft: false, bypassCache: true });
    let data = await loader.loadResolvedData(resolved);

    // Draft/unsaved overlay: replaces loaded content fields AFTER normal
    // resolution, so menus, layout config, widgets and every other pipeline
    // piece stay real.
    let overlay = null;
    if (dataOverrides && typeof dataOverrides === "object") {
      overlay = { ...dataOverrides };
      delete overlay.__resolution;
      if (Object.keys(overlay).length) {
        data = { ...(data || {}), ...overlay };
      }
    }

    if (data === null) {
      resolved.type = "404"; resolved.template = "404";
      data = { page_title: "Page Not Found" };
    }

    const renderCtx = await this.buildRenderContext(resolved, data);

    if (this.configOverrides) {
      renderCtx.layoutConfig = this._mergeDeep(renderCtx.layoutConfig || {}, this.configOverrides);
    }

    const content = this.render(resolved.template, renderCtx);
    return this.buildHTML(content, renderCtx);
  }

  // ── RESOLVE ────────────────────────────────────────────────────────────────

  async resolve(req) {
    const url     = req.originalUrl || req.url || "/";
    const pageNum = parseInt(req.query?.page, 10) || 1;
    return resolveRoute(url, { context: this.context, page: pageNum });
  }

  // ── BUILD RENDER CONTEXT ──────────────────────────────────────────────────

  async buildRenderContext(resolved, data) {
    const layoutConfig = await this._loadLayoutConfig();

    const safeLayout = this._mergeDeep(
      {
        sidebar: {
          enabled: true, position: "right", width: "300px",
          show_on_homepage: true, show_on_pages: true, show_on_posts: true,
        },
      },
      layoutConfig?.layout || layoutConfig || {}
    );

    // ── Load menus for all declared slots ─────────────────────────────────
    const menuSlots = await this._loadMenuSlots(layoutConfig);

    // ── Site settings for logo / favicon ─────────────────────────────────
    const siteSettings = await this._loadSiteSettings();

    return {
      ...data,
      resolved,
      layout:       safeLayout,
      layoutConfig,
      context:      this.context,
      page_title:   data.page_title   || this.meta?.name          || "Acroxa CMS",
      site_title:   data.site_title   || siteSettings.siteName    || global.acrx?.config?.site_title || this.meta?.name || "Acroxa CMS",
      site_description: data.site_description || siteSettings.siteDescription || global.acrx?.config?.site_description || this.meta?.description || "",

      // Logo URL (from Settings, falls back to meta)
      site_logo:    siteSettings.siteLogo    || this.meta?.logo    || "",
      site_favicon: siteSettings.siteFavicon || this.meta?.favicon || "",

      // Menus keyed by slot name, e.g. params.menus.primary, params.menus.footer
      menus: menuSlots,

      // Convenience: primary menu as params.menu (backward compat)
      menu: menuSlots.primary || menuSlots[Object.keys(menuSlots)[0]] || data.menu || [],
    };
  }

  // ── Load menus from DB for all slots declared in meta.json ────────────────

  async _loadMenuSlots(layoutConfig) {
    try {
      const conn    = require("../../core/connect-db").getConnection();
      const models  = conn.models || conn;
      const Menu    = models.Menu;

      if (!Menu) return {};

      // Slots from meta.json menuAreas, fallback to standard ones
      const slots = this.meta?.menuAreas || ["primary", "footer"];

      const result = {};
      await Promise.all(
        slots.map(async (slot) => {
          const menu = await Menu.getBySlot(slot, this.layoutName);
          result[slot] = menu ? Menu.formatForTemplate(menu) : [];
        })
      );

      return result;
    } catch (err) {
       console.warn(`[LayoutEngine] Could not load menus:`, err.message);
      return {};
    }
  }

  // ── Load site settings (logo, favicon, site name) ─────────────────────────

  async _loadSiteSettings() {
    try {
      const conn    = require("../../core/connect-db").getConnection();
      const models  = conn.models || conn;
      const Settings = models.Settings;
      if (!Settings) return {};
      const s = await Settings.getSettings();
      return s?.general || {};
    } catch {
      return {};
    }
  }

  // ── Load layout config ─────────────────────────────────────────────────────

  async _loadLayoutConfig() {
    const metaDefaults = this._extractMetaDefaults(this.meta?.config || {});
    
    try {
      const conn    = require("../../core/connect-db").getConnection();
      const models  = conn.models || conn;
      const LCModel = models.LayoutConfig;
      if (!LCModel) return metaDefaults;

      const entry    = await LCModel.getByLayout(this.layoutName);
      const dbConfig = entry?.config || {};

      let merged = this._mergeDeep(metaDefaults, dbConfig);
      if (this.configOverrides) {
        merged = this._mergeDeep(merged, this.configOverrides);
      }
      return merged;
    } catch (err) {
       console.warn(`[LayoutEngine] Could not load layout config:`, err.message);
      return metaDefaults;
    }
  }

  _extractMetaDefaults(schema) {
    const result = {};
    for (const key of Object.keys(schema)) {
      const val = schema[key];
      if (val && typeof val === "object" && !Array.isArray(val)) {
        if ("default" in val || "type" in val) {
          result[key] = val.default ?? null;
        } else {
          result[key] = this._extractMetaDefaults(val);
        }
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  // ── TEMPLATE RENDER ────────────────────────────────────────────────────────

  render(templateKey, params) {
    const fallbacks = TEMPLATE_FALLBACKS[templateKey] || [templateKey, "404"];
    for (const key of fallbacks) {
      if (this.layouts[key]) return this.layouts[key](params);
    }
     console.error(`❌ No template found for: ${templateKey} (tried: ${fallbacks.join(", ")})`);
    return "<h1>Template not found</h1>";
  }

  // ── HTML BUILDER ──────────────────────────────────────────────────────────

  buildHTML(content, params) {
    const inject = this.isolated
      ? this._isolatedAssets
      : (this.acrx?.registered?.publicInject || []);

    const headAssets = inject
      .filter(a => a.location === "head")
      .map(a => this._assetTag(a))
      .join("\n    ");

    const bodyAssets = inject
      .filter(a => a.location === "body")
      .map(a => this._assetTag(a))
      .join("\n    ");

    const desc    = params.site_description || "";
    const title   = params.page_title || params.site_title || this.meta?.name || "";

    // ── Favicon: prefer settings favicon, then meta.json favicon ──────────
    const favicon = params.site_favicon || this.meta?.favicon || "";

    // ── CSS variables from layout config colors section ───────────────────
    const cssVars = this._buildCSSVars(params.layoutConfig);

    // ── Font CSS from /uploads/fonts/<slug>/font.css ──────────────────────
    const fontLinks = this._buildFontCssLinks(params.layout, params.layoutConfig);

    // ── Tracking pixels ───────────────────────────────────────────────────
    const trackingHead = this._buildTrackingPixels(params, "head");
    const trackingBody = this._buildTrackingPixels(params, "body_start");

    const pageCustomCSS = params.landing?.customCSS || params.page?.customCSS || "";
    const pageCustomJS  = params.landing?.customJS  || "";

    // ── OG Meta Tags (from SEO settings + per-page overrides) ────────────
    const ogTags = this._buildOGTags(params);

    // ── GA Tracking (from analytics settings) ─────────────────────────────
    const gaScript = this._buildGATracking(params);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${this._esc(desc)}">
    ${ogTags}
    <title>${this._esc(title)}</title>
    ${favicon ? `<link rel="icon" type="image/x-icon" href="${this._esc(favicon)}">` : ""}
    ${fontLinks}
    ${headAssets}
    ${trackingHead}
    ${gaScript}
    ${cssVars ? `<style id="layout-css-vars">${cssVars}</style>` : ""}
    ${pageCustomCSS ? `<style>${pageCustomCSS}</style>` : ""}
</head>
<body>
    ${trackingBody}
    ${content}
    ${bodyAssets}
    ${pageCustomJS ? `<script>${pageCustomJS}</script>` : ""}
</body>
</html>`;
  }

  // ── Build CSS variables from layoutConfig.colors (and typography) ─────────
  // Any key under config.colors becomes --layout-color-{key}
  // Any key under config.typography becomes --layout-{key}
  _buildCSSVars(layoutConfig) {
    if (!layoutConfig) return "";

    const lines = [];

    // colors → --layout-color-primary, --layout-color-secondary, etc.
    const colors = layoutConfig.layout?.colors || layoutConfig.colors || {};
    for (const [key, val] of Object.entries(colors)) {
      if (val) {
        const cssKey = `--layout-color-${_kebab(key)}`;
        lines.push(`  ${cssKey}: ${val};`);
      }
    }

    // typography → --layout-heading-font, --layout-body-font, --layout-base-font-size
    const typo = layoutConfig.layout?.typography || layoutConfig.typography || {};
    for (const [key, val] of Object.entries(typo)) {
      if (val !== null && val !== undefined) {
        const cssKey = `--layout-${_kebab(key)}`;
        const cssVal = typeof val === "number" ? `${val}px` : val;
        lines.push(`  ${cssKey}: ${cssVal};`);
      }
    }

    if (!lines.length) return "";
    return `:root {\n${lines.join("\n")}\n}`;
  }

  _buildFontCssLinks(layout = {}, layoutConfig = {}) {
    const typo =
      layout?.typography ||
      layoutConfig?.layout?.typography ||
      layoutConfig?.typography ||
      {};
    const families = [typo.headingFont, typo.bodyFont].filter(Boolean);

    const slugs = new Set();
    for (const fam of families) {
      const base = this._extractPrimaryFontFamily(fam);
      const slug = this._fontFamilyToSlug(base);
      if (slug) slugs.add(slug);
    }

    if (!slugs.size) return "";
    return [...slugs]
      .map(slug => `<link rel="stylesheet" href="/uploads/fonts/${this._esc(slug)}/font.css">`)
      .join("\n    ");
  }

  _extractPrimaryFontFamily(fontFamilyValue = "") {
    // Accept values like: "'Inter', sans-serif" or "Inter, sans-serif"
    const first = String(fontFamilyValue).split(",")[0] || "";
    return first.trim().replace(/^['"]|['"]$/g, "");
  }

  _fontFamilyToSlug(family = "") {
    const f = String(family || "").trim();
    if (!f) return "";

    // Ignore generic stacks
    const generic = new Set([
      "serif","sans-serif","monospace","system-ui",
      "-apple-system","blinkmacsystemfont","segoe ui","roboto","arial","helvetica","helvetica neue",
    ]);
    if (generic.has(f.toLowerCase())) return "";

    // Must match FontController.familyToSlug()
    return f.toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  _assetTag(a) {
    if (a.type === "inline")  return a.content;
    if (a.type === "script")  return `<script src="${a.url}"></script>`;
    if (a.type === "style")   return `<link rel="stylesheet" href="${a.url}">`;
    return "";
  }

  _buildTrackingPixels(params, location) {
    const pixels = params.landing?.trackingPixels || [];
    return pixels
      .filter(p => p.enabled !== false)
      .filter(p => {
        if (location === "head")       return p.location === "head";
        if (location === "body_start") return p.location === "body_start";
        return false;
      })
      .map(p => p.code || "")
      .join("\n");
  }

  // ── Build OG Meta Tags from SEO settings + per-page overrides ────────
  _buildOGTags(params) {
    try {
      const settings = global._settingsCache || null;
      if (!settings?.seo?.openGraph?.enabled) return "";

      const siteName = settings.general?.siteName || "";
      const siteURL = settings.general?.siteURL || "";
      const pageURL = siteURL ? `${siteURL}/${params.page_slug || ""}` : "";

      // Per-page OG overrides (from post/page model)
      const ogTitle = params.ogTitle || params.page_og_title || params.page_title || settings.seo.openGraph?.titleTemplate?.replace("%title%", params.page_title || "") || params.page_title || "";
      const ogDesc = params.ogDescription || params.page_og_description || params.page_description || settings.seo.openGraph?.descriptionTemplate?.replace("%description%", params.page_description || "") || params.page_description || "";
      const ogImage = params.ogImage || params.page_og_image || settings.seo.openGraph?.defaultImage || "";

      let tags = "";
      if (ogTitle) tags += `    <meta property="og:title" content="${this._esc(ogTitle)}">\n`;
      if (ogDesc) tags += `    <meta property="og:description" content="${this._esc(ogDesc)}">\n`;
      if (pageURL) tags += `    <meta property="og:url" content="${this._esc(pageURL)}">\n`;
      if (ogImage) tags += `    <meta property="og:image" content="${this._esc(ogImage)}">\n`;
      if (siteName) tags += `    <meta property="og:site_name" content="${this._esc(siteName)}">\n`;
      tags += `    <meta property="og:type" content="${params.resolved?.type === "post" ? "article" : "website"}">\n`;

      // Twitter Card
      if (settings.seo.twitterCards?.enabled) {
        tags += `    <meta name="twitter:card" content="${settings.seo.twitterCards?.cardType || "summary_large_image"}">\n`;
        if (ogTitle) tags += `    <meta name="twitter:title" content="${this._esc(ogTitle)}">\n`;
        if (ogDesc) tags += `    <meta name="twitter:description" content="${this._esc(ogDesc)}">\n`;
        if (ogImage) tags += `    <meta name="twitter:image" content="${this._esc(ogImage)}">\n`;
      }

      return tags;
    } catch (_) {
      return "";
    }
  }

  // ── Build GA Tracking Script from analytics settings ──────────────────
  _buildGATracking(params) {
    try {
      const settings = global._settingsCache || null;
      if (!settings?.analytics?.analyticsEnabled) return "";
      const trackingID = settings.analytics?.trackingID;
      if (!trackingID) return "";

      return `<script async src="https://www.googletagmanager.com/gtag/js?id=${this._esc(trackingID)}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${this._esc(trackingID)}');
    </script>`;
    } catch (_) {
      return "";
    }
  }
// ── QUICK 404 RENDER ───────────────────────────────────────────────

  render404(extra = {}) {
    try {
      const params = {
        page_title: "Page Not Found",
        site_title: this.meta?.name || "Acroxa CMS",
        site_description: "",
        context: this.context,
        resolved: {
          type: "404",
          template: "404"
        },
        ...extra
      };

      const content = this.render("404", params);
      return this.buildHTML(content, params);

    } catch (err) {
       console.error("[LayoutEngine] render404 error:", err);
      return null;
    }
  }
  // ── ASSET MANAGEMENT ──────────────────────────────────────────────────────
  // FIX: clearPreviousAssets now removes ALL assets tagged with this layout,
  // and injectAssets immediately re-injects them. This means a hot-reload
  // (which calls initialize() → clearPreviousAssets() → injectAssets())
  // always leaves the publicInject list in a correct state.

  clearPreviousAssets() {
    if (!this.acrx?.registered?.publicInject) return;
    const before = this.acrx.registered.publicInject.length;
    this.acrx.registered.publicInject = this.acrx.registered.publicInject.filter(
      a => a.plugin !== this.layoutName
    );
    const removed = before - this.acrx.registered.publicInject.length;
    if (removed > 0)  console.log(`🧹 Removed ${removed} assets for ${this.layoutName}`);
  }

  injectAssets() {
    if (!this.acrx) return;

    // Use a timestamp so the browser always fetches fresh files after reload
    const v = `?v=${Date.now()}`;

    (this.meta?.stylesheets || []).forEach(url => {
      this.acrx.injectPublicAsset?.({
        type: "style", url: `${url}${v}`, location: "head", plugin: this.layoutName,
      });
    });

    (this.meta?.scripts || []).forEach(asset => {
      const url = typeof asset === "string" ? asset : asset?.url;
      const location = typeof asset === "object" && asset?.location ? asset.location : "body";
      const type = typeof asset === "object" && asset?.module ? asset.module : "";
      if (!url) return;
      this.acrx.injectPublicAsset?.({
        type: "script", url: `${url}${v}`, location, plugin: this.layoutName,
      });
    });

    if (this.meta?.customStyles) {
      this.acrx.injectPublicInline?.({
        location: "head",
        content:  `<style id="layout-custom-${this.layoutName}">${this.meta.customStyles}</style>`,
        plugin:   this.layoutName,
      });
    }

    if (this.meta?.customScripts) {
      this.acrx.injectPublicInline?.({
        location: "body",
        content:  `<script id="layout-script-${this.layoutName}">${this.meta.customScripts}</script>`,
        plugin:   this.layoutName,
      });
    }

     console.log(`✅ Assets injected for ${this.layoutName}`);
  }

  _prepareIsolatedAssets() {
    const v = `?v=${Date.now()}`;
    this._isolatedAssets = [];

    (this.meta?.stylesheets || []).forEach(url => {
      this._isolatedAssets.push({
        type: "style", url: `${url}${v}`, location: "head", plugin: this.layoutName,
      });
    });

    (this.meta?.scripts || []).forEach(asset => {
      const url = typeof asset === "string" ? asset : asset?.url;
      const location = typeof asset === "object" && asset?.location ? asset.location : "body";
      if (!url) return;
      this._isolatedAssets.push({
        type: "script", url: `${url}${v}`, location, plugin: this.layoutName,
      });
    });

    if (this.meta?.customStyles) {
      this._isolatedAssets.push({
        type: "inline",
        content: `<style id="layout-custom-${this.layoutName}">${this.meta.customStyles}</style>`,
        location: "head",
        plugin: this.layoutName,
      });
    }

    if (this.meta?.customScripts) {
      this._isolatedAssets.push({
        type: "inline",
        content: `<script id="layout-script-${this.layoutName}">${this.meta.customScripts}</script>`,
        location: "body",
        plugin: this.layoutName,
      });
    }
  }

  clearAssets() {
    this.clearPreviousAssets();
    this._isolatedAssets = [];
  }

  // ── UTILITIES ─────────────────────────────────────────────────────────────

  _esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  _mergeDeep(target, source) {
    if (typeof target !== "object" || target === null) return source;
    if (typeof source !== "object" || source === null) return source;
    const out = { ...target };
    for (const k of Object.keys(source)) {
      if (typeof source[k] === "object" && !Array.isArray(source[k]) && source[k] !== null) {
        out[k] = this._mergeDeep(target[k] || {}, source[k]);
      } else {
        out[k] = source[k];
      }
    }
    return out;
  }

  _errorHTML(message) {
    return `<!DOCTYPE html><html><head><title>Layout Error</title></head>
<body style="font-family:monospace;padding:2rem;background:#0a0a14;color:#ff4444;">
<h2>⚠ Layout Render Error</h2><pre>${this._esc(message)}</pre>
<a href="/" style="color:#00f0ff;">← Return Home</a>
</body></html>`;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _kebab(str) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
}

module.exports = LayoutEngine;
