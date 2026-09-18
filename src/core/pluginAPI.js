/* ../src/core/pluginAPI.js */
const express = require("express");
const path = require("path");
const fs = require("fs");

let _App = null;

function setApp(app) {
  _App = app;
  // Mount the runtime API proxy once so registerRoute() never duplicates
  // Express layers. Idempotent — subsequent calls are no-ops.
  try {
    require("./runtime/apiRegistry").ensureMounted(app);
  } catch (err) {
    console.warn("⚠️  apiRegistry mount:", err.message);
  }
}
/* ------------------------------------------------
   🗄️ MODEL ACCESS HELPER
------------------------------------------------ */
async function getModels() {
  // First check if models are already loaded globally
  if (global.models) {
    return global.models;
  }
  
  // If not, try to connect and get them
  try {
    const { connectDB } = require("./connect-db");
    const models = await connectDB();
    return models;
  } catch (err) {
    console.error("❌ Plugin API: Failed to get models:", err.message);
    throw new Error("Models not available");
  }
}

function getDbType() {
  try {
    const { getDbType } = require("./connect-db");
    return getDbType();
  } catch (err) {
    console.warn("⚠️ Plugin API: Could not determine database type");
    return null;
  }
}

/* ------------------------------------------------
   🧭 CORE MENUS (Flattened for Conflict Check)
------------------------------------------------ */
const coreMenuData = {
  main: [
    { label: "Dashboard", link: "/acrx/dashboard", icon: "grid-2" },
    { label: "Insights", link: "/acrx/analytics", icon: "chart-line" },
    { label: "Reach", link: "/acrx/seo", icon: "signal" },
    { label: "Performance", link: "/acrx/speed", icon: "gauge-high" },
    { label: "Users", link: "/acrx/users", icon: "user-group" },
    {
      label: "Content",
      link: "/acrx/posts",
      icon: "pen-to-square",
      submenu: [
        { label: "All Content", link: "/acrx/posts" },
        { label: "New Post", link: "/acrx/posts/new" },
        { label: "Topics", link: "/acrx/categories" },
        { label: "Tags", link: "/acrx/tags" },
        { label: "Drafts", link: "/acrx/posts/drafts" },
        { label: "Scheduled", link: "/acrx/posts/scheduled" },
        { label: "Trash", link: "/acrx/posts/trash" },
      ],
    },
    {
      label: "Pages",
      link: "/acrx/pages",
      icon: "file-lines",
      submenu: [
        { label: "All Pages", link: "/acrx/pages" },
        { label: "Add New", link: "/acrx/pages/new" },
        { label: "Layouts", link: "/acrx/pages/layouts" },
        { label: "Templates", link: "/acrx/pages/templates" },
        { label: "Landing Builder", link: "/acrx/pages/builder" },
      ],
    },
    {
      label: "Media Hub",
      link: "/acrx/media",
      icon: "photo-film",
      submenu: [
        { label: "Library", link: "/acrx/media" },
        { label: "Upload Files", link: "/acrx/media/upload" },
        { label: "Optimize", link: "/acrx/media/optimize" },
        { label: "AI Enhance", link: "/acrx/media/ai-enhance" },
        { label: "Background Remover", link: "/acrx/media/bg-remove" },
      ],
    },
    {
      label: "Design",
      link: "/acrx/design",
      icon: "palette",
      submenu: [
        { label: "Themes", link: "/acrx/themes" },
        { label: "Customize", link: "/acrx/customize" },
        { label: "Components", link: "/acrx/widgets" },
        { label: "Animations", link: "/acrx/animations" },
        { label: "Fonts & Icons", link: "/acrx/design/fonts" },
      ],
    },
    {
      label: "Extensions",
      link: "/acrx/extensions",
      icon: "puzzle-piece",
      submenu: [
        { label: "Installed", link: "/acrx/plugins" },
        { label: "Marketplace", link: "/acrx/plugins/discover" },
        { label: "Developer Mode", link: "/acrx/plugins/dev" },
        { label: "APIs", link: "/acrx/plugins/api" },
        { label: "Beta Labs", link: "/acrx/plugins/labs" },
      ],
    },
    {
      label: "System",
      link: "/acrx/system",
      icon: "sliders",
      submenu: [
        { label: "General", link: "/acrx/system/general" },
        { label: "Content Rules", link: "/acrx/system/content" },
        { label: "Storage", link: "/acrx/system/storage" },
        { label: "Permalinks", link: "/acrx/system/permalinks" },
        { label: "Security", link: "/acrx/system/security" },
        { label: "Backups", link: "/acrx/system/backups" },
        { label: "Logs", link: "/acrx/system/logs" },
        { label: "Maintenance", link: "/acrx/system/maintenance" },
      ],
    },
  ],
  extra: [
    { label: "Help Center", link: "/acrx/help", icon: "circle-question" },
    { label: "Documentation", link: "https://docs.acroxa.com", icon: "book" },
    { label: "Feedback", link: "/acrx/feedback", icon: "message-dots" },
    { label: "System Status", link: "/acrx/status", icon: "signal-bars" },
    { label: "Version Notes", link: "/acrx/changelog", icon: "scroll" },
    { label: "About Acroxa", link: "/acrx/about", icon: "gem" },
  ],
};

// 🧩 Flatten all links for fast checking
const coreMenus = [];
for (const section of Object.values(coreMenuData)) {
  for (const item of section) {
    if (item.link?.startsWith("/acrx")) coreMenus.push(item.link);
    if (item.submenu) {
      for (const sub of item.submenu) {
        if (sub.link?.startsWith("/acrx")) coreMenus.push(sub.link);
      }
    }
  }
}

/* ------------------------------------------------
   ⚔️ CONFLICT CHECKER
------------------------------------------------ */
function isPathConflict(link) {
  if (!link) return false;

  // normalize link
  if (!link.startsWith("/acrx")) {
    link = "/acrx" + (link.startsWith("/") ? link : `/${link}`);
  }

  const cleanLink = link.replace(/\/+$/, ""); // trim trailing /
  const rel = cleanLink.replace(/^\/acrx/, "");

  for (const core of coreMenus) {
    const base = core.replace(/^\/acrx/, "").replace(/\/+$/, "");

    if (
      rel === base ||
      rel === "/" + base ||
      rel.startsWith(base + "/") ||
      rel.startsWith("/" + base + "/")
    ) {
      console.warn(`⚠️ Conflict with core path: ${core}`);
      return true;
    }
  }

  return false;
}

/* ------------------------------------------------
   🌍 GLOBAL REGISTRIES
------------------------------------------------ */
const registered = {
  routes: [],
  menus: [],
  topbar: [],
  fields: [],
  hooks: [],
  styles: [],
  scripts: [],
  widgets: [],
  settings: [],
  rewrites: [],
  uiExtensions: [],
  publicInject: [],
  widgets_editor: [],
  topbar_editor: [],
  sidebar_editor: [],
  fields_editor: [],
  features_editor: [],
  actions_editor: [],
  schemas: [],
};

/* ------------------------------------------------
   🔗 ROUTES
------------------------------------------------ */
function normalizePath(p) {
  if (!p.startsWith("/acrx")) return "/acrx" + (p.startsWith("/") ? p : `/${p}`);
  return p;
}

// Runtime-aware route registration (no duplicate Express mounts).
// Entries live in apiRegistry's stable dispatch table; a single proxy router
// is mounted once via ensureMounted(). Re-registration updates in place.
// The legacy `registered.routes` push is kept for diagnostics/back-compat.
function registerRoute({ path, method = "get", handler, plugin = "core", secure = false, middleware = [] }) {
  if (!path || !handler) throw new Error("Invalid route registration");
  path = normalizePath(path);

  if (isPathConflict(path)) {
    console.warn(`Warning: [${plugin}] Route conflict prevented for path: ${path}`);
    return () => {};
  }

  const apiRegistry = require("./runtime/apiRegistry");
  const disposer = apiRegistry.register({
    method, path, handler, owner: plugin,
    middleware: Array.isArray(middleware) ? middleware : [],
    meta: { secure: !!secure, plugin },
  });

  const existing = registered.routes.find(
    (r) => r.path === path && String(r.method).toLowerCase() === String(method).toLowerCase() && r.plugin === plugin
  );
  if (!existing) {
    registered.routes.push({ path, method, plugin, secure });
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`Registered: ${method.toUpperCase()} ${path} [${plugin}]`);
  }
  return disposer;
}

function unregisterRoute({ path, method = "get", plugin = "core" } = {}) {
  if (!path) return false;
  path = normalizePath(path);
  const apiRegistry = require("./runtime/apiRegistry");
  const ok = apiRegistry.unregisterRoute(method, path, plugin);
  const idx = registered.routes.findIndex(
    (r) => r.path === path && String(r.method).toLowerCase() === String(method).toLowerCase() && r.plugin === plugin
  );
  if (idx !== -1) registered.routes.splice(idx, 1);
  return ok;
}

/* ------------------------------------------------
   ♻️ REVERSIBLE REGISTRATION (AcroxaJS lifecycle)
   Every register* below returns a disposer. disposeOwner(plugin)
   removes ALL legacy array entries + runtime registry/hooks/events/apis.
------------------------------------------------ */
function _removeAll(arr, pred) {
  let n = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    try { if (pred(arr[i], i)) { arr.splice(i, 1); n++; } } catch (_) {}
  }
  return n;
}

function _track(owner, type, name, dispose, meta = {}) {
  try { return require("./runtime/lifecycle").track(owner, type, name, dispose, meta); }
  catch (_) { return typeof dispose === "function" ? dispose : () => {}; }
}

function unregisterMenuItem(label, plugin = null) {
  return _removeAll(registered.menus, (m) => m.label === label && (!plugin || m.plugin === plugin));
}
function unregisterTopbarItem(label, plugin = null) {
  return _removeAll(registered.topbar, (m) => m.label === label && (!plugin || m.plugin === plugin));
}
function unregisterWidget(title, plugin = null) {
  return _removeAll(registered.widgets, (w) => w.title === title && (!plugin || w.plugin === plugin));
}
function unregisterSettingsPage(id, plugin = null) {
  return _removeAll(registered.settings, (s) => s.id === id && (!plugin || s.plugin === plugin));
}
function removeStyle(url, plugin = null) {
  return _removeAll(registered.styles, (s) => s.url === url && (!plugin || s.plugin === plugin));
}
function removeScript(url, plugin = null) {
  return _removeAll(registered.scripts, (s) => s.url === url && (!plugin || s.plugin === plugin));
}
function removePublicInject(pred, plugin = null) {
  const fn = typeof pred === "function" ? pred : (e) => e.url === pred || e.content === pred;
  return _removeAll(registered.publicInject, (e) => (!plugin || e.plugin === plugin) && fn(e));
}
function unregisterUIExtension(target, plugin = null) {
  return _removeAll(registered.uiExtensions, (e) => e.target === target && (!plugin || e.plugin === plugin));
}
function unregisterCustomField(type, plugin = null) {
  return _removeAll(registered.fields, (f) => f.type === type && (!plugin || f.plugin === plugin));
}
function unregisterEditorWidget(id, plugin = null) {
  return _removeAll(registered.widgets_editor, (w) => w.id === id && (!plugin || w.plugin === plugin));
}
function unregisterEditorButton(id, plugin = null) {
  return _removeAll(registered.topbar_editor, (b) => b.id === id && (!plugin || b.plugin === plugin));
}
function unregisterEditorSidebar(id, plugin = null) {
  return _removeAll(registered.sidebar_editor, (s) => s.id === id && (!plugin || s.plugin === plugin));
}
function unregisterEditorField(id, plugin = null) {
  return _removeAll(registered.fields_editor, (f) => f.id === id && (!plugin || f.plugin === plugin));
}
function unregisterEditorFeature(id, plugin = null) {
  return _removeAll(registered.features_editor, (f) => f.id === id && (!plugin || f.plugin === plugin));
}
function unregisterEditorAction(id, plugin = null) {
  return _removeAll(registered.actions_editor, (a) => a.id === id && (!plugin || a.plugin === plugin));
}
function unregisterSchema(name, plugin = null) {
  return _removeAll(registered.schemas, (s) => s.name === name && (!plugin || s.plugin === plugin));
}
function removeRewrite(from, plugin = null) {
  return _removeAll(registered.rewrites, (r) => r.from === from && (!plugin || r.plugin === plugin));
}

async function disposeOwner(owner) {
  if (!owner) return { owner, disposed: 0, errors: [] };
  const counts = {};
  counts.menus = _removeAll(registered.menus, (m) => m.plugin === owner);
  counts.topbar = _removeAll(registered.topbar, (m) => m.plugin === owner);
  counts.widgets = _removeAll(registered.widgets, (w) => w.plugin === owner);
  counts.settings = _removeAll(registered.settings, (s) => s.plugin === owner);
  counts.styles = _removeAll(registered.styles, (s) => s.plugin === owner);
  counts.scripts = _removeAll(registered.scripts, (s) => s.plugin === owner);
  counts.publicInject = _removeAll(registered.publicInject, (e) => e.plugin === owner);
  counts.uiExtensions = _removeAll(registered.uiExtensions, (e) => e.plugin === owner);
  counts.fields = _removeAll(registered.fields, (f) => f.plugin === owner);
  counts.widgets_editor = _removeAll(registered.widgets_editor, (w) => w.plugin === owner);
  counts.topbar_editor = _removeAll(registered.topbar_editor, (b) => b.plugin === owner);
  counts.sidebar_editor = _removeAll(registered.sidebar_editor, (s) => s.plugin === owner);
  counts.fields_editor = _removeAll(registered.fields_editor, (f) => f.plugin === owner);
  counts.features_editor = _removeAll(registered.features_editor, (f) => f.plugin === owner);
  counts.actions_editor = _removeAll(registered.actions_editor, (a) => a.plugin === owner);
  counts.schemas = _removeAll(registered.schemas, (s) => s.plugin === owner);
  counts.rewrites = _removeAll(registered.rewrites, (r) => r.plugin === owner);
  counts.routes = _removeAll(registered.routes, (r) => r.plugin === owner);
  counts.hooks = _removeAll(registered.hooks, (h) => h.plugin === owner);
  let runtime = { disposed: 0, errors: [] };
  try { runtime = await require("./runtime/registry").disposeOwner(owner); } catch (e) { runtime.errors = [{ message: e.message }]; }
  try { require("./runtime/hookBus").disposeOwner(owner); } catch (_) {}
  try { require("./runtime/events").disposeOwner(owner); } catch (_) {}
  try { await require("./runtime/apiRegistry").disposeOwner(owner); } catch (_) {}
  try { require("./runtime/revision").bump(`dispose:${owner}`, "module"); } catch (_) {}
  return { owner, counts, runtime };
}
/* ------------------------------------------------
   🧭 SIDEBAR MENU
------------------------------------------------ */
function registerMenuItem({
  label,
  icon = "extension",
  link,
  parent = null,
  allowedRoles = [],
  order = 10,
  plugin = "core",
}) {
  if (link && !link.startsWith("/acrx/")) {
    link = "/acrx" + (link.startsWith("/") ? link : `/${link}`);
  }

  if (isPathConflict(link)) {
    console.warn(`⚠️ [${plugin}] Menu conflict prevented for link: ${link}`);
    return () => {};
  }

  registered.menus.push({ label, icon, link, parent, allowedRoles, order, plugin });
  return _track(plugin, "menu", label, () => { unregisterMenuItem(label, plugin); }, { link });
}
/* ------------------------------------------------
   🧱 TOPBAR MENU
------------------------------------------------ */
function registerTopbarItem({
  label,
  icon = "fa-circle",
  action = "#",
  allowedRoles = [],
  order = 10,
  target = null,
  hiddenOnMobile = false,
  hiddenOnTablet = false,
  plugin = "core"
}) {

  registered.topbar.push({
    label,
    icon,
    action,
    allowedRoles,
    order,
    target,
    hiddenOnMobile,
    hiddenOnTablet,
    plugin
  });

  console.log(
    `🧩 Topbar item registered: ${label} [${plugin}]`
  );
  return _track(plugin, "topbar", label, () => { unregisterTopbarItem(label, plugin); }, { action });
}
/* ------------------------------------------------
   🧩 CUSTOM FIELDS
------------------------------------------------ */
function registerCustomField({ type, label, render, save, plugin = "core" }) {
  registered.fields.push({ type, label, render, save, plugin });
  return _track(plugin, "field", type, () => { unregisterCustomField(type, plugin); }, { type });
}

/* ------------------------------------------------
   ⚙️ HOOK SYSTEM
------------------------------------------------ */
// Hook system delegates to hookBus (priority + disposal + error isolation).
// `registered.hooks` push is kept so legacy diagnostics keep working.
function addHook(hookName, callback, plugin = "core", opts = {}) {
  registered.hooks.push({ hookName, callback, plugin });
  try {
    return require("./runtime/hookBus").register(hookName, callback, plugin, opts);
  } catch (err) {
    console.error("[pluginAPI] addHook failed:", err.message);
    return () => {};
  }
}

function runHooks(hookName, data, ctx = {}) {
  try {
    return require("./runtime/hookBus").run(hookName, data, ctx);
  } catch (err) {
    console.error("[pluginAPI] runHooks failed:", err.message);
    return data;
  }
}

function runHooksAsync(hookName, data, ctx = {}) {
  try {
    return require("./runtime/hookBus").runAsync(hookName, data, ctx);
  } catch (err) {
    console.error("[pluginAPI] runHooksAsync failed:", err.message);
    return Promise.resolve(data);
  }
}

function removeHooks(callbackOrRecord, hookName = null) {
  let n = 0;
  try {
    n = require("./runtime/hookBus").remove(callbackOrRecord, hookName);
  } catch (_) { n = 0; }
  // Also clean the legacy diagnostics array (previously leaked).
  try {
    const isFn = typeof callbackOrRecord === "function";
    _removeAll(registered.hooks, (h) => {
      if (hookName && h.hookName !== hookName) return false;
      if (isFn) return h.callback === callbackOrRecord;
      if (callbackOrRecord && typeof callbackOrRecord === "object") {
        return h.callback === callbackOrRecord.callback || h.callback === callbackOrRecord;
      }
      return true;
    });
  } catch (_) {}
  return n;
}

/* ------------------------------------------------
   🎨 STYLES & SCRIPTS
------------------------------------------------ */
function addStyle(url, plugin = "core") {
  registered.styles.push({ url, plugin });
  return _track(plugin, "asset", `style:${url}`, () => { removeStyle(url, plugin); }, { url, kind: "style" });
}

function addScript(url, plugin = "core") {
  registered.scripts.push({ url, plugin });
  return _track(plugin, "asset", `script:${url}`, () => { removeScript(url, plugin); }, { url, kind: "script" });
}

/* ------------------------------------------------
   ⚡ PUBLIC INJECTIONS
------------------------------------------------ */
function injectPublicAsset({ type = "script", url, location = "head", plugin = "core" }) {
  registered.publicInject.push({ type, url, location, plugin });
  return _track(plugin, "asset", `inject:${type}:${url || location}`, () => { removePublicInject(url, plugin); }, { type, url, location });
}

function injectPublicInline({ location = "head", content, plugin = "core" }) {
  registered.publicInject.push({ type: "inline", content, location, plugin });
  return _track(plugin, "asset", `inline:${location}:${String(content || "").length}`, () => { removePublicInject(content, plugin); }, { location });
}

/* ------------------------------------------------
   🧱 ADMIN UI EXTENSIONS
------------------------------------------------ */
function extendUI({ target, position = "after", render, plugin = "core" }) {
  registered.uiExtensions.push({ target, position, render, plugin });
  return _track(plugin, "ui", target, () => { unregisterUIExtension(target, plugin); }, { target, position });
}

/* ------------------------------------------------
   ⚡ DASHBOARD WIDGETS
------------------------------------------------ */
function registerWidget({ title, icon, render, plugin = "core" }) {
  registered.widgets.push({ title, icon, render, plugin });
  return _track(plugin, "widget", title, () => { unregisterWidget(title, plugin); }, { title });
}

/* ------------------------------------------------
   ⚙️ SETTINGS PAGE
------------------------------------------------ */
function registerSettingsPage({ id, title, component, icon, plugin = "core" }) {
  registered.settings.push({ id, title, component, icon, plugin });
  return _track(plugin, "settings", id, () => { unregisterSettingsPage(id, plugin); }, { id });
}

/* ------------------------------------------------
   🌐 URL REWRITES
------------------------------------------------ */
function addRewrite({ from, to, plugin = "core" }) {
  registered.rewrites.push({ from, to, plugin });
  return _track(plugin, "rewrite", from, () => { removeRewrite(from, plugin); }, { from, to });
}

/* ------------------------------------------------
   🧱 EDITOR WIDGETS MENU
   -> For "Insert" menu inside the editor
------------------------------------------------ */
function registerEditorWidget({ id, label, icon = "square-plus", render, plugin = "core" }) {
  registered.widgets_editor.push({ id, label, icon, render, plugin });
  return _track(plugin, "editor-widget", id, () => { unregisterEditorWidget(id, plugin); }, { id });
}

/* ------------------------------------------------
   🧭 EDITOR TOPBAR / TOOLBAR BUTTONS
   -> Buttons like Bold, Italic, AI Suggest, etc.
------------------------------------------------ */
function registerEditorButton({ id, label, icon, action, group = "format", plugin = "core" }) {
  registered.topbar_editor.push({ id, label, icon, action, group, plugin });
  return _track(plugin, "editor-button", id, () => { unregisterEditorButton(id, plugin); }, { id });
}

/* ------------------------------------------------
   📋 EDITOR SIDEBAR PANELS
   -> SEO, Featured Image, Categories, Custom Fields, etc.
------------------------------------------------ */
function registerEditorSidebar({
  id,
  title,
  icon = "sliders",
  render,
  order = 10,
  plugin = "core",
}) {
  registered.sidebar_editor.push({ id, title, icon, render, order, plugin });
  return _track(plugin, "editor-sidebar", id, () => { unregisterEditorSidebar(id, plugin); }, { id });
}

/* ------------------------------------------------
   🧩 EDITOR META FIELDS
   -> Small form inputs in sidebars or settings
------------------------------------------------ */
function registerEditorField({ id, label, inputType = "text", render, save, plugin = "core" }) {
  registered.fields_editor.push({ id, label, inputType, render, save, plugin });
  return _track(plugin, "editor-field", id, () => { unregisterEditorField(id, plugin); }, { id });
}

/* ------------------------------------------------
   🚀 EDITOR FEATURES
   -> Toggleable functional enhancements (AI Assist, AutoSave, etc.)
------------------------------------------------ */
function registerEditorFeature({ id, label, init, destroy, plugin = "core" }) {
  registered.features_editor.push({ id, label, init, destroy, plugin });
  return _track(plugin, "editor-feature", id, () => { unregisterEditorFeature(id, plugin); }, { id });
}

/* ------------------------------------------------
   ⚡ EDITOR ACTIONS / COMMANDS
   -> Logic hooks triggered by buttons or shortcuts
------------------------------------------------ */
function registerEditorAction({ id, run, plugin = "core" }) {
  registered.actions_editor.push({ id, run, plugin });
  return _track(plugin, "editor-action", id, () => { unregisterEditorAction(id, plugin); }, { id });
}

/**
 * registerSchema
 * Allows plugins to create or modify a table/collection structure dynamically
 *
 * @param {string} name - Unique name of the schema/table
 * @param {object} structure - Field definitions { fieldName: { type, default, required } }
 * @param {string} plugin - Plugin name
 * @param {boolean} overwrite - If true, overwrite existing schema
 */
function registerSchema({ target, name, structure, plugin = "core", overwrite = false }) {
  if (!name || typeof structure !== "object") {
    console.warn(`⚠️ [${plugin}] Invalid schema registration`);
    return () => {};
  }

  const existing = registered.schemas.find(s => s.name === name);
  if (existing && !overwrite) {
    console.warn(`⚠️ [${plugin}] Schema "${name}" already exists. Use overwrite=true to modify.`);
    return () => {};
  }

  if (existing && overwrite) {
    Object.assign(existing.structure, structure); // merge/modify fields
    existing.plugin = plugin;
    console.log(`✅ [${plugin}] Schema "${name}" updated`);
  } else {
    registered.schemas.push({ target, name, structure, plugin });
    console.log(`✅ [${plugin}] Schema "${name}" registered with Target "${target}"`);
  }
  return _track(plugin, "schema", name, () => { unregisterSchema(name, plugin); }, { target, name });
}

/* ------------------------------------------------
   💡 BUILD SIDEBAR
------------------------------------------------ */
function buildSidebarHTML() {
  let html = "";
  const sorted = registered.menus.sort((a, b) => a.order - b.order);

  sorted.forEach(item => {
    const children = registered.menus.filter(i => i.parent === item.label);
    if (children.length > 0) {
      html += `
      <div class="item has-sub acroxa-item" data-link="${item.link}">
        <i class="fa-duotone fa ${item.icon} icon"></i>
        <span>${item.label}</span>
        <div class="submenu">
          ${children.map(sub => `<a href="${sub.link}" class="sub-item">${sub.label}</a>`).join("")}
        </div>
      </div>`;
    } else if (!item.parent) {
      html += `
      <a href="${item.link}" class="item acroxa-item">
        <i class="fa-duotone fa ${item.icon} icon"></i>
        <span>${item.label}</span>
      </a>`;
    }
  });

  return html;
}

/* ------------------------------------------------
   🧩 EXTENSION REGISTRY (Acroxa terminology: extension, not plugin)
   Code-first manifests backed by src/core/runtime/extensions.js.
   registerExtension({ id, version, deps, conflicts, capabilities,
   boundaries, scripts, styles, hooks, apis, criticality, enabled })
   returns a disposer. Conflicts are explanatory diagnostics.
------------------------------------------------ */
function registerExtension(manifest = {}) {
  const extensions = require("./runtime/extensions");
  const record = extensions.register(manifest, { owner: manifest.owner || `extension:${manifest.id}` });
  try {
    const lifecycle = require("./runtime/lifecycle");
    lifecycle.track(record.owner, "extension", record.id, () => {
      try { extensions.unregister(record.id); } catch (_) {}
    }, { version: record.version, criticality: record.criticality });
  } catch (_) {}
  return () => { try { extensions.unregister(record.id); } catch (_) {} };
}

function unregisterExtension(id) {
  try { return require("./runtime/extensions").unregister(id); } catch (_) { return false; }
}

function setExtensionEnabled(id, enabled) {
  try { return require("./runtime/extensions").setEnabled(id, enabled); } catch (_) { return false; }
}

function getExtensionConflicts() {
  try { return require("./runtime/extensions").detectConflicts(); } catch (_) { return []; }
}

/* ------------------------------------------------
   ♻️ RUNTIME RELOAD SHIMS (safe targets for hot-reloader)
   Previously `global.acrx.reloadRoutes/reloadExtensions` were undefined,
   so file changes silently did nothing. These delegate to the stable
   dispatch layers: file routes rebuild atomically, plugin routes rebuild
   via apiRegistry, extensions dispose owner-scoped registrations.
------------------------------------------------ */
function reloadRoutes() {
  try {
    return require("./loadRoutes").reloadRoutes();
  } catch (err) {
    console.error("[pluginAPI] reloadRoutes failed:", err.message);
    return { success: false, error: err.message };
  }
}

async function reloadExtensions(owner = null) {
  try {
    const apiRegistry = require("./runtime/apiRegistry");
    const events = require("./runtime/events");
    if (owner) {
      const n = await apiRegistry.disposeOwner(owner);
      events.emit("extension:loaded", { owner, reloaded: true });
      return { owner, disposedRoutes: n };
    }
    // No extension loader exists on disk (extensions are code-only
    // registrations); global reload just re-emits state for diagnostics.
    events.emit("extension:loaded", { owner: "*", reloaded: true });
    return { owner: "*", routes: apiRegistry.list().length };
  } catch (err) {
    console.error("[pluginAPI] reloadExtensions failed:", err.message);
    return { error: err.message };
  }
}

function reloadPageRenderers() {
  // Admin views are re-required per request by the pages wrapper in index.js,
  // so after the hot-reloader's scoped clearCache(file) the next request
  // already picks up fresh render functions. This shim just notifies.
  try {
    require("./runtime/events").emit("module:updated", { id: "views", stage: "update" });
  } catch (_) {}
  try {
    require("./sseHub").broadcast("page.updated", { source: "reloadPageRenderers" });
  } catch (_) {}
  return { success: true, timestamp: new Date().toISOString() };
}

/* ------------------------------------------------
   🧩 ACROXAJS EXTENSION CONTRACT (Phase 9)
   Targeted invalidation + render snapshots — thin delegates to core
   runtime modules. Closed core is enforced: extensions never mutate core
   state; these are read/evict APIs with the same validation as the
   underlying modules.
------------------------------------------------ */
function invalidateCacheTag(tag) {
  try {
    return require("./runtime/cache").invalidateTag(tag);
  } catch (err) {
    console.error("[pluginAPI] invalidateCacheTag failed:", err.message);
    return 0;
  }
}

function invalidateCacheDep(dep) {
  try {
    return require("./runtime/cache").invalidate(dep);
  } catch (err) {
    console.error("[pluginAPI] invalidateCacheDep failed:", err.message);
    return 0;
  }
}

function renderSnapshot(page, version = undefined) {
  try {
    const snapshots = require("./runtime/render/snapshot");
    return version === undefined ? snapshots.latest(page) : snapshots.get(page, version);
  } catch (_) {
    return null;
  }
}

function snapshotStats() {
  try {
    return require("./runtime/render/snapshot").stats();
  } catch (_) {
    return { pages: 0, versions: 0, bytes: 0 };
  }
}

/* ------------------------------------------------
   ⏱️ RUNTIME SHELL (persistent registries/lifecycle/events)
   Lazily required to avoid circular deps during early boot.
------------------------------------------------ */
function getRuntime() {
  try {
    return require("./runtime/shell");
  } catch (_) {
    return null;
  }
}

/* ------------------------------------------------
   🔥 EXPORT ALL
------------------------------------------------ */
const CMSHelpers = {
  // Persistent runtime shell (registry/lifecycle/events/diagnostics)
  runtime: null,
  // Database helpers
  getModels,
  getDbType,
  
  // Route management (runtime-aware, duplicate-safe)
  registerRoute,
  unregisterRoute,
  
  // Menu management
  registerMenuItem,
  registerTopbarItem,
  
  // Field system
  registerCustomField,
  
  // Hook system (hookBus-backed, disposable, ordered)
  addHook,
  runHooks,
  runHooksAsync,
  removeHooks,
  
  // Asset management
  addStyle,
  addScript,
  injectPublicAsset,
  injectPublicInline,
  
  // UI extensions
  extendUI,
  registerWidget,
  registerSettingsPage,
  
  // URL management
  addRewrite,
  
  // Sidebar
  buildSidebarHTML,
  
  // Editor extensions
  registerEditorWidget,
  registerEditorButton,
  registerEditorSidebar,
  registerEditorField,
  registerEditorFeature,
  registerEditorAction,
  
  // Schema management
  registerSchema,
  unregisterSchema,
  // Extension registry (Acroxa-native)
  registerExtension,
  unregisterExtension,
  setExtensionEnabled,
  getExtensionConflicts,
  // Reversible registration
  unregisterMenuItem,
  unregisterTopbarItem,
  unregisterWidget,
  unregisterSettingsPage,
  removeStyle,
  removeScript,
  removePublicInject,
  unregisterUIExtension,
  unregisterCustomField,
  unregisterEditorWidget,
  unregisterEditorButton,
  unregisterEditorSidebar,
  unregisterEditorField,
  unregisterEditorFeature,
  unregisterEditorAction,
  removeRewrite,
  disposeOwner,
  // Runtime reload (hot-reloader targets)
  reloadRoutes,
  reloadExtensions,
  reloadPageRenderers,
  // AcroxaJS extension contract (Phase 9): targeted invalidation + render
  // snapshots — thin delegates to core runtime modules. Closed core is
  // enforced (extensions never mutate core state; these are read/evict APIs).
  invalidateCacheTag,
  invalidateCacheDep,
  renderSnapshot,
  snapshotStats,
  // App setter
  setApp,
  // Registry access
  registered,
  // Runtime accessor (shell init is idempotent; safe to call repeatedly)
  getRuntime,
};

try {
  CMSHelpers.runtime = require("./runtime/shell");
} catch (_) {
  CMSHelpers.runtime = null;
}

global.CMS = CMSHelpers;
module.exports = CMSHelpers;