const fs = require("fs");
const path = require("path");

// ===================== YOUR OLD CONFIG =====================
// Paste your protectedPages here (or import from pages.js if you want later)

const protectedPages = [
  {
    path: "/acrx/dashboard",
    title: "Dashboard - Acroxa",
    render: "renderDashboard",
    css: ["/acrx/assets/css/ad-ds.css"],
    js: ["/acrx/assets/js/dashboard.js"],
    layout: "full"
  },
  {
    path: "/acrx/posts",
    title: "Posts - Acroxa",
    render: "renderPosts",
    css: ["/acrx/assets/css/ad-ps.css"],
    js: ["/acrx/assets/js/posts.js"],
    layout: "full"
  },
  {
    path: "/acrx/media",
    title: "Media Library - Acroxa",
    render: "renderMedia",
    css: ["/acrx/assets/css/ad-media.css"],
    js: ["/acrx/assets/js/media.js"],
    layout: "full"
  },
  {
    path: "/acrx/media/upload",
    title: "Upload Media - Acroxa",
    render: "renderMediaUpload",
    css: ["/acrx/assets/css/ad-media-upload.css"],
    js: ["/acrx/assets/js/media-upload.js"],
    layout: "full"
  },
  {
    path: "/acrx/categories",
    title: "Categories - Acroxa",
    render: "renderCategory",
    css: [
      "/acrx/assets/css/ad-ps.css",
      "/acrx/assets/css/ad-cat.css"
    ],
    js: ["/acrx/assets/js/category.js"],
    layout: "full"
  },
  {
    path: "/acrx/approvals",
    title: "Approval Requests - Acroxa",
    render: "renderApprovals",
    css: [
      "/acrx/assets/css/ad-media.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/approvals.js"],
    layout: "full"
  },
  {
    path: "/acrx/analytics",
    title: "Analytics - Acroxa",
    render: "renderAnalytics",
    css: ["/acrx/assets/css/ad-analytics.css"],
    js: ["/acrx/assets/js/analytics.js"],
    layout: "full"
  },
  {
    path: "/acrx/layouts",
    title: "Layout Manager - Acroxa",
    render: "renderLayouts",
    css: ["/acrx/assets/css/ad-layout.css"],
    js: ["/acrx/assets/js/layout.js"],
    layout: "full"
  },
  {
    path: "/acrx/layouts/customize",
    title: "Layout Customizer - Acroxa",
    render: "renderCustomizer",
    css: ["/acrx/assets/css/ad-customizer.css"],
    js: [
      "/acrx/assets/js/regular.js",
      "/acrx/assets/js/all.js",
      "/acrx/assets/js/customizer.js",
      "/acrx/assets/js/system/_shared.js"
    ],
    layout: "empty"
  },
  {
    path: "/acrx/customize",
    title: "Layout Customizer - Acroxa",
    render: "renderCustomizer",
    css: ["/acrx/assets/css/ad-customizer.css"],
    js: [
      "/acrx/assets/js/customizer.js",
      "/acrx/assets/js/system/_shared.js"
    ],
    layout: "empty"
  },
  {
    path: "/acrx/editor",
    title: "Editor - Acroxa",
    render: "renderEditor",
    css: ["/acrx/assets/css/ad-ed.css"],
    js: ["/acrx/assets/js/editor.js"],
    layout: "empty",
    header: null,
    sidebar: null,
    footer: null
  },
  {
    path: "/acrx/layouts/edit",
    title: "Layout Editor - Acroxa",
    render: "renderLayoutEditor",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-layout-editor.css",
      "/acrx/assets/css/monaco.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/layout-editor.js"
    ],
    layout: "empty",
    maincss: false
  },
  {
    path: "/acrx/system",
    title: "System - Acroxa",
    render: "SystemNavPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/system-nav.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/general",
    title: "System - Acroxa",
    render: "GeneralSettingsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/general.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/routing",
    title: "System - Acroxa",
    render: "RoutingSettingsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/routing.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/localization",
    title: "System - Acroxa",
    render: "LocalizationPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/localization.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/content",
    title: "System - Acroxa",
    render: "ContentSettingsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/content.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/seo",
    title: "System - Acroxa",
    render: "SeoSettingsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/seo.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/ai",
    title: "System - Acroxa",
    render: "AiSettingsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/ai.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/security",
    title: "System - Acroxa",
    render: "SecuritySettingsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/security.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/api",
    title: "System - Acroxa",
    render: "ApiSettingsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/api.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/analytics",
    title: "System - Acroxa",
    render: "AnalyticsSettingsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/analytics.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/backups",
    title: "System - Acroxa",
    render: "BackupsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css",
      "/acrx/assets/css/ad-ds.css"
    ],
    js: ["/acrx/assets/js/system/backups.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/logs",
    title: "System - Acroxa",
    render: "LogsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/logs.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/maintenance",
    title: "System - Acroxa",
    render: "MaintenancePage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/maintenance.js"],
    layout: "full"
  },
  {
    path: "/acrx/system/advanced",
    title: "System - Acroxa",
    render: "AdvancedSettingsPage",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: ["/acrx/assets/js/system/advanced.js"],
    layout: "full"
  }
];
const viewFileMap = {
  SystemNavPage: "settings.js",
  GeneralSettingsPage: "settings.js",
  LocalizationPage: "settings.js",
  ContentSettingsPage: "settings.js",
  SeoSettingsPage: "settings.js",
  AiSettingsPage: "settings.js",
  SecuritySettingsPage: "settings.js",
  ApiSettingsPage: "settings.js",
  AnalyticsSettingsPage: "settings.js",
  BackupsPage: "settings.js",
  LogsPage: "settings.js",
  MaintenancePage: "settings.js",
  AdvancedSettingsPage: "settings.js",
  RoutingSettingsPage: "settings.js"
};

// ===================== VIEW LOCATION =====================
const VIEWS_DIR = path.join(__dirname, "../src/views");

// Map render function → file guess
function guessViewFile(renderFn) {
  const fnName =
    typeof renderFn === "function"
      ? renderFn.name
      : renderFn;

  const file = viewFileMap[fnName];

  if (!file) {
    console.warn("No mapping for:", fnName);
    return null;
  }

  return path.join(VIEWS_DIR, file);
}

// ===================== MIGRATION =====================
function migrate() {
  protectedPages.forEach(page => {
    const filePath = guessViewFile(page.render);

    if (!fs.existsSync(filePath)) {
      console.warn("Missing view file:", filePath);
      return;
    }

    let content = fs.readFileSync(filePath, "utf-8");

    // Avoid duplicate migration
    if (content.includes("module.exports.meta")) {
      console.log("Already migrated:", filePath);
      return;
    }

    const meta = {
      path: page.path,
      render: page.render,
      title: page.title,
      css: page.css || [],
      js: page.js || [],
      layout: page.layout || "full",
      header: page.header || null,
      sidebar: page.sidebar || null,
      footer: page.footer || null
    };

    const metaBlock = `\n\nmodule.exports.meta = ${JSON.stringify([meta], null, 2)};\n`;

    fs.appendFileSync(filePath, metaBlock);

    console.log("Migrated:", filePath);
  });

  console.log("\n✅ Migration complete from protectedPages.");
}

migrate();