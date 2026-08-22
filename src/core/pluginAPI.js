/* ../src/core/pluginAPI.js */
const express = require("express");
const path = require("path");
const fs = require("fs");

let _App = null;

function setApp(app) {
  _App = app;
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

// Then update registerRoute to use _App
function registerRoute({ path, method = "get", handler, plugin = "core", secure = false }) {
  if (!path || !handler) throw new Error("Invalid route registration");
  path = normalizePath(path);

  if (isPathConflict(path)) {
    console.warn(`Warning: [${plugin}] Route conflict prevented for path: ${path}`);
    return;
  }

  if (!_App) {
    throw new Error(
      `[${plugin}] Cannot register admin route "${method.toUpperCase()} ${path}" – ` +
      `Express app not set! Call pluginAPI.setApp(app) in index.js before loading plugins.`
    );
  }

  _App[method](path, handler);  // ← NOW IT GOES TO THE REAL SERVER
  registered.routes.push({ path, method, plugin, secure });

  console.log(`Registered: ${method.toUpperCase()} ${path} [${plugin}]`);
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
    return;
  }

  registered.menus.push({ label, icon, link, parent, allowedRoles, order, plugin });
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
}
/* ------------------------------------------------
   🧩 CUSTOM FIELDS
------------------------------------------------ */
function registerCustomField({ type, label, render, save, plugin = "core" }) {
  registered.fields.push({ type, label, render, save, plugin });
}

/* ------------------------------------------------
   ⚙️ HOOK SYSTEM
------------------------------------------------ */
function addHook(hookName, callback, plugin = "core") {
  registered.hooks.push({ hookName, callback, plugin });
}

function runHooks(hookName, data) {
  const hooks = registered.hooks.filter(h => h.hookName === hookName);
  for (const h of hooks) data = h.callback(data) || data;
  return data;
}

/* ------------------------------------------------
   🎨 STYLES & SCRIPTS
------------------------------------------------ */
function addStyle(url, plugin = "core") {
  registered.styles.push({ url, plugin });
}

function addScript(url, plugin = "core") {
  registered.scripts.push({ url, plugin });
}

/* ------------------------------------------------
   ⚡ PUBLIC INJECTIONS
------------------------------------------------ */
function injectPublicAsset({ type = "script", url, location = "head", plugin = "core" }) {
  registered.publicInject.push({ type, url, location, plugin });
}

function injectPublicInline({ location = "head", content, plugin = "core" }) {
  registered.publicInject.push({ type: "inline", content, location, plugin });
}

/* ------------------------------------------------
   🧱 ADMIN UI EXTENSIONS
------------------------------------------------ */
function extendUI({ target, position = "after", render, plugin = "core" }) {
  registered.uiExtensions.push({ target, position, render, plugin });
}

/* ------------------------------------------------
   ⚡ DASHBOARD WIDGETS
------------------------------------------------ */
function registerWidget({ title, icon, render, plugin = "core" }) {
  registered.widgets.push({ title, icon, render, plugin });
}

/* ------------------------------------------------
   ⚙️ SETTINGS PAGE
------------------------------------------------ */
function registerSettingsPage({ id, title, component, icon, plugin = "core" }) {
  registered.settings.push({ id, title, component, icon, plugin });
}

/* ------------------------------------------------
   🌐 URL REWRITES
------------------------------------------------ */
function addRewrite({ from, to, plugin = "core" }) {
  registered.rewrites.push({ from, to, plugin });
}

/* ------------------------------------------------
   🧱 EDITOR WIDGETS MENU
   -> For "Insert" menu inside the editor
------------------------------------------------ */
function registerEditorWidget({ id, label, icon = "square-plus", render, plugin = "core" }) {
  registered.widgets_editor.push({ id, label, icon, render, plugin });
}

/* ------------------------------------------------
   🧭 EDITOR TOPBAR / TOOLBAR BUTTONS
   -> Buttons like Bold, Italic, AI Suggest, etc.
------------------------------------------------ */
function registerEditorButton({ id, label, icon, action, group = "format", plugin = "core" }) {
  registered.topbar_editor.push({ id, label, icon, action, group, plugin });
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
}

/* ------------------------------------------------
   🧩 EDITOR META FIELDS
   -> Small form inputs in sidebars or settings
------------------------------------------------ */
function registerEditorField({ id, label, inputType = "text", render, save, plugin = "core" }) {
  registered.fields_editor.push({ id, label, inputType, render, save, plugin });
}

/* ------------------------------------------------
   🚀 EDITOR FEATURES
   -> Toggleable functional enhancements (AI Assist, AutoSave, etc.)
------------------------------------------------ */
function registerEditorFeature({ id, label, init, destroy, plugin = "core" }) {
  registered.features_editor.push({ id, label, init, destroy, plugin });
}

/* ------------------------------------------------
   ⚡ EDITOR ACTIONS / COMMANDS
   -> Logic hooks triggered by buttons or shortcuts
------------------------------------------------ */
function registerEditorAction({ id, run, plugin = "core" }) {
  registered.actions_editor.push({ id, run, plugin });
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
    return;
  }

  const existing = registered.schemas.find(s => s.name === name);
  if (existing && !overwrite) {
    console.warn(`⚠️ [${plugin}] Schema "${name}" already exists. Use overwrite=true to modify.`);
    return;
  }

  if (existing && overwrite) {
    Object.assign(existing.structure, structure); // merge/modify fields
    existing.plugin = plugin;
    console.log(`✅ [${plugin}] Schema "${name}" updated`);
  } else {
    registered.schemas.push({ target, name, structure, plugin });
    console.log(`✅ [${plugin}] Schema "${name}" registered with Target "${target}"`);
  }
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
   🔥 EXPORT ALL
------------------------------------------------ */
const CMSHelpers = {
  // Database helpers
  getModels,
  getDbType,
  
  // Route management
  registerRoute,
  
  // Menu management
  registerMenuItem,
  registerTopbarItem,
  
  // Field system
  registerCustomField,
  
  // Hook system
  addHook,
  runHooks,
  
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
  // App setter
  setApp,
  // Registry access
  registered,
};

global.CMS = CMSHelpers;
module.exports = CMSHelpers;