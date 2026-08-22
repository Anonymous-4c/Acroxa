const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

const { LOGIN_PATH, BASE_URL } = require("../../config/generated-paths");
const { renderLogin } = require("../views/login");

const {
  verifyAPIToken,
  attachAuthScript,
  requireRoles,
  requireControlSession    // ← V2 addition
} = require("../middlewares/authMiddleware");

const { renderLayout }  = require("../modules/layout");
const { renderHeader }  = require("../modules/header");
const { renderSidebar } = require("../modules/sidebar");
const { renderFooter }  = require("../modules/footer");
const { renderPage_403, renderPage_404, renderPage_500 } = require("../pages.js");
const { renderLogout }  = require("../modules/logout");

const { getAllowedRolesByPath } = require("../functions/getAllowedRoles.js");

// ---------------- DB ----------------
const { connectDB, getDbType } = require("../core/connect-db");

// ---------------- Views Registry Loader ----------------
const VIEWS_DIR = path.join(__dirname, "../views");

function loadViews() {
  const files = fs.readdirSync(VIEWS_DIR);
  const views = [];

  files.forEach(file => {
    if (!file.endsWith(".js")) return;

    const mod = require(path.join(VIEWS_DIR, file));

    if (mod.meta && Array.isArray(mod.meta)) {
      mod.meta.forEach(pageMeta => {
        views.push({
          ...pageMeta,
          render: mod[pageMeta.render],   // resolve function reference
          __file: file
        });
      });
    }
  });
  console.log(`Loaded ${views.length} page(s) from ${VIEWS_DIR}`);
  console.log(views.map(v => `  ${v.path} → ${v.render ? v.render.name : "no render fn"} (${v.__file})`).join("\n"));
  return views;
}

const pages = loadViews();

// ---------------- Wrapper ----------------

function normalizeScripts(scripts = []) {
  return scripts.map(script => {

    // Backward compatibility
    if (typeof script === "string") {
      return {
        src: script,
        type: "text/javascript",
      };
    }

    return {
      type: "text/javascript",
      defer: false,
      async: false,
      ...script,
    };
  });
}

function renderPageWrapper(req, res, options = {}) {
  const {
    title,
    content,
    css = [],
    js = [],
    header,
    sidebar,
    footer,
    layout = "full",
    maincss = true
  } = options;

  const html = renderLayout({
    head: {
      title,
      styles: css,
      scripts: normalizeScripts(js),
      maincss,
    },

    header:
      header === null
        ? ""
        : (header
            ? header()
            : renderHeader()),

    sidebar:
      sidebar === null
        ? ""
        : (sidebar
            ? sidebar(req.user, req.path)
            : renderSidebar(req.user, req.path)),

    footer:
      footer === null
        ? ""
        : (footer
            ? footer()
            : renderFooter()),

    content,
    injectScript: res.locals.injectTokenScript,
    layout
  });

  res.send(html);
}
// ------------------- Login Page -------------------
// V2: requireControlSession must pass before the login page is served.
// On failure it returns 404 so the route stays invisible to unauthenticated callers.
router.get(`${LOGIN_PATH}`, requireControlSession, (req, res) => {
  res.send(renderLogin());
});

// ------------------- Logout -------------------
router.get(`/acrx/logout`, verifyAPIToken, attachAuthScript, (req, res) => {
  const page = renderLayout({
    head: { title: "Logout - Acroxa" },
    header:  renderHeader(),
    sidebar: renderSidebar(req.user, req.path),
    footer:  renderFooter(),
    content: renderLogout(),
  });
  res.send(page);
});

// ---------------- Route Register ----------------
pages.forEach(page => {

  // ── Public pages (e.g. /token/control/:controlKey) ──────────────────────
  // Skip verifyAPIToken, attachAuthScript, and role checks entirely.
  if (page.public === true) {
    router.get(page.path, async (req, res) => {
      try {
        const renderFn = typeof page.render === "function" ? page.render : null;

        // If the renderer already sent a response (e.g. 404 for bad controlKey)
        // it returns an empty string — don't try to wrap it.
        const content = renderFn ? await renderFn(req, res) : "";

        if (res.headersSent) return;

        renderPageWrapper(req, res, {
          title:   page.title   || "Acroxa",
          content,
          css:     page.css     || [],
          js:      page.js      || [],
          header:  page.header,
          sidebar: page.sidebar,
          footer:  page.footer,
          layout:  page.layout  || "empty",
          maincss: page.maincss !== false,
        });
      } catch (err) {
        console.error("Public page render error:", page.path, err);
        if (!res.headersSent) res.status(500).send(renderPage_500());
      }
    });

    return; // skip the protected handler below
  }

  // ── Protected pages (default) ────────────────────────────────────────────
  router.get(
    page.path,
    verifyAPIToken,

    (req, res, next) => {
      const roles = getAllowedRolesByPath(req.path);
      if (!roles) return next();
      return requireRoles(roles)(req, res, next);
    },

    attachAuthScript,

    async (req, res) => {
      try {
        let content = "";

        if (!page.contentType || page.contentType === "render") {
          const renderFn =
            typeof page.render === "string"
              ? mod[page.render]
              : page.render;

          content =
            typeof renderFn === "function"
              ? await renderFn(req, res)
              : renderFn;
        }
        else if (page.contentType === "raw") {
          content =
            typeof page.content === "function"
              ? await page.content(req, res)
              : page.content;
        }

        let sidebar, footer, header;
        if (page.layout === "full") {
          sidebar = renderSidebar;
          footer  = renderFooter;
          header  = renderHeader;
        }

        renderPageWrapper(req, res, {
          title:   page.title   || "Acroxa",
          content,
          css:     page.css     || [],
          js:      page.js      || [],
          header:  header  || page.header,
          sidebar: sidebar || page.sidebar,
          footer:  footer  || page.footer,
          layout:  page.layout  || "full",
          maincss: page.maincss !== false,
        });

      } catch (err) {
        console.error("Page render error:", page.path, err);
        res.status(500).send(renderPage_500());
      }
    }
  );
});

module.exports = router;