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
  const loadErrors = [];

  files.forEach(file => {
    if (!file.endsWith(".js")) return;

    let mod;
    try {
      mod = require(path.join(VIEWS_DIR, file));
    } catch (err) {
      // One broken view must never take down every admin page.
      console.error(`[pages] Skipping broken view ${file}:`, err.message);
      loadErrors.push({ file, message: err.message });
      return;
    }

    if (mod.meta && Array.isArray(mod.meta)) {
      mod.meta.forEach(pageMeta => {
        views.push({
          ...pageMeta,
          render: mod[pageMeta.render],   // resolve function reference
          __file: file
        });
      })
    }});
  try { require("../core/logStream").quiet("info", `[pages] Loaded ${views.length} page(s) from ${VIEWS_DIR}`); } catch (_) {}
  // AcroxaJS impact edges: each admin page depends on its view source file
  // AND every project-internal module the view requires (Phase 3 import
  // walk), so a component/module/service change invalidates exactly the
  // pages it reaches (never the whole app). The dep key is the bare
  // normalized absolute path — the same key space file-change invalidations
  // query with. depend() overwrites, so rebuilds re-declare idempotently.
  // graph._key normalizes lookups (win32).
  try {
    const graph = require("../core/runtime/graph");
    const depsMod = require("../core/runtime/render/deps");
    for (const v of views) {
      if (v.path && v.__file) {
        depsMod.declarePageDeps(
          "page:" + v.path,
          path.join(VIEWS_DIR, v.__file).replace(/\\/g, "/")
        );
      }
    }
  } catch (_) {}
  if (process.env.NODE_ENV !== "production") {
    try { require("../core/logStream").quiet("info", `[pages] map:\n` + views.map(v => `  ${v.path} → ${v.render ? v.render.name : "no render fn"} (${v.__file})`).join("\n")); } catch (_) {}
  }
  if (loadErrors.length) {
    console.error(`[pages] ${loadErrors.length} view file(s) failed to load (routes skipped, rest live).`);
  }
  loadViews.errors = loadErrors;
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

// AcroxaJS Phase 6/7: commit the content-region snapshot (tree + deps) for a
// page render, through the render scheduler fence (out-of-order renders of
// the same page can never overwrite — newest valid state wins). Returns the
// committed snapshot or null. Shared by the full render path and the
// fragment (patch protocol) path.
function commitContentSnapshot(pageId, rc, html) {
  try {
    if (!rc || !rc.nodes || !rc.nodes.length) return null;
    const scheduler = require("../core/runtime/render/scheduler");
    const token = scheduler.begin(pageId);
    const snapshots = require("../core/runtime/render/snapshot");
    const treeMod = require("../core/runtime/render/tree");
    const built = treeMod.build(rc.nodes);
    const root = built.roots.length === 1
      ? treeMod.serialize(built.roots[0])
      : { type: "fragment", id: "page-root", children: built.roots.map((r) => treeMod.serialize(r)) };
    const r = scheduler.commit(pageId, token, () => snapshots.commit(pageId, {
      html,
      root,
      deps: [...rc.deps],
      owners: rc.ownerId ? [rc.ownerId] : [],
      ms: rc.meta().ms,
    }));
    return r.committed ? r.snapshot : null;
  } catch (_) { return null; }
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

  let filteredContent = content;
  try { filteredContent = require("../core/runtime/hookBus").run("page:beforeRender", content, { title, path: req.path }) || content; } catch (_) {}

  // Fragment mode (AcroxaJS admin live updates): return the content region
  // as JSON instead of a full document. Never HTML-wraps errors here —
  // the client decides (redirect vs toast) from the status code.
  const wantsFragment = req.query._frag === "content" || req.headers["x-acrx-fragment"] === "content";
  if (wantsFragment) {
    let rev = 0;
    try { rev = require("../core/runtime/revision").get(); } catch (_) {}

    // AcroxaJS Phase 5/6 patch protocol: commit the fresh content render,
    // diff against the previous snapshot, and send ops when the difference
    // is expressible (bounded). Otherwise the client falls back to the
    // proven full-html swap. Same-shape roots only (element|fragment).
    let patchInfo = null;
    try {
      const rcMod = require("../core/runtime/render/context");
      const rc = rcMod.current();
      if (rc && rc.nodes && rc.nodes.length) {
        const pageId = "page:" + req.path;
        const snapshots = require("../core/runtime/render/snapshot");
        const prev = snapshots.latest(pageId);
        const snap = commitContentSnapshot(pageId, rc, filteredContent);
        if (
          prev && snap && prev.root && prev.root.type === snap.root.type &&
          (snap.root.type === "element" || snap.root.type === "fragment")
        ) {
          const diffMod = require("../core/runtime/diff");
          const patchMod = require("../core/runtime/diff/patch");
          const d = diffMod.diff(prev.root, snap.root);
          // Lifecycle hook (Phase 9): the diff is generated.
          try { require("../core/runtime/hookBus").run("render:afterDiff", { page: pageId, ops: d.ops.length, unchanged: d.unchanged }); } catch (_) {}
          if (!d.unchanged && d.ops.length && d.ops.length <= 40) {
            const p = patchMod.makePatch({
              page: pageId,
              fromVersion: prev.version,
              toVersion: snap.version,
              ops: d.ops,
            });
            if (p.valid) {
              patchInfo = p;
              // Lifecycle hook (Phase 9): the patch reaches the browser
              // via this response (the server's role ends at send).
              try { require("../core/runtime/hookBus").run("render:patchSent", { page: pageId, patchId: p.patchId, fromVersion: p.fromVersion, toVersion: p.toVersion, ops: p.ops.length }); } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}

    const body = {
      success: true,
      html: filteredContent,
      title: title || "Acroxa",
      css: css || [],
      js: normalizeScripts(js || []),
      layout: layout || "full",
      rev,
    };
    // Always send the committed content version so the client can version-
    // gate op patches (fromVersion must match) and resync on gaps.
    try {
      const snapshots = require("../core/runtime/render/snapshot");
      const snap = snapshots.latest("page:" + req.path);
      if (snap) body.contentVersion = snap.version;
    } catch (_) {}
    if (patchInfo) {
      body.ops = patchInfo.ops;
      body.fromVersion = patchInfo.fromVersion;
      body.toVersion = patchInfo.toVersion;
      body.patchId = patchInfo.patchId;
    }
    res.setHeader("Cache-Control", "no-store");
    return res.json(body);
  }

  // AcroxaJS Phase 6: commit the content-region snapshot BEFORE rendering so
  // the version can be stamped on #acrx-content (client op-patch boot) and
  // the first fragment request after a page load can diff (op-level) instead
  // of always swapping the whole region.
  let contentVersion = null;
  try {
    const rcMod = require("../core/runtime/render/context");
    const rc = rcMod.current();
    if (rc) {
      const snap = commitContentSnapshot("page:" + req.path, rc, filteredContent);
      if (snap) contentVersion = snap.version;
    }
  } catch (_) {}

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

    content: filteredContent,
    injectScript: res.locals.injectTokenScript,
    layout,
    contentVersion
  });

  let out = html;
  try { out = require("../core/runtime/hookBus").run("page:afterRender", html, { title, path: req.path }) || html; } catch (_) {}
  res.send(out);
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
  // Handler is a named export (handleProtectedPage) so the dev-only testing
  // aliases below can render the same pages with a stub identity. Same code
  // path, same fragment support, no auth bypass anywhere else.
  router.get(
    page.path,
    verifyAPIToken,

    (req, res, next) => {
      const roles = getAllowedRolesByPath(req.path);
      if (!roles) return next();
      return requireRoles(roles)(req, res, next);
    },

    attachAuthScript,

    async (req, res) => handleProtectedPage(page, req, res)
  );
});

// ---------------- Dev-only E2E testing aliases ----------------
// Double-gated: E2E_TEST_ROUTER=1 AND non-production. Serves the same admin
// renders under /acrx/testing/* with a stub admin identity so Playwright can
// verify the runtime without credentials. Lives inside the pages router (and
// therefore inside the rebuild proxy) so view hot-reloads — including brand-
// new view files — are picked up with no extra wiring. GET-only, no
// mutations, no auth-redirect script. Never loads in production.
if (process.env.E2E_TEST_ROUTER === "1" && process.env.NODE_ENV !== "production") {
  console.warn("[testing] ENABLED (dev-only): /acrx/testing/* serves admin renders without auth. Never enable in production.");

  const testingStub = (req, res, next) => {
    req.user = { id: "e2e-test", username: "e2e-test", role: "admin", roles: ["admin"] };
    // Mirror the production auth script's unhide behavior (authMiddleware
    // injectTokenScript removes body.hidden after verify). The testing
    // router has no session to verify, so unhide directly — same pixels
    // an authed user sees, no auth logic bypassed beyond this dev router.
    res.locals.injectTokenScript = `<script class="testing-stub">document.body.classList.remove("hidden")</script>`;
    next();
  };

  router.get("/acrx/testing", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      success: true,
      urls: pages
        .filter((p) => p && typeof p.path === "string" && p.public !== true)
        .map((p) => "/acrx/testing" + p.path.replace(/^\/acrx/, "")),
    });
  });

  router.get("/acrx/testing/api/system/runtime", (req, res) => {
    try {
      return require("../controllers/runtimeController").getSnapshot(req, res);
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Dev-only server log tail (staged [Acroxa:*] runtime trace). GET-only,
  // bounded, same no-auth testing scope as the alias above.
  router.get("/acrx/testing/api/system/logs", (req, res) => {
    try {
      const ls = require("../core/logStream");
      const q = req.query || {};
      const out = ls.readHistory({
        limit: Math.max(1, Math.min(parseInt(q.limit, 10) || 200, 500)),
        offset: 0,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.json({ success: true, total: out.total, entries: out.entries });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  pages.forEach((page) => {
    if (!page || typeof page.path !== "string" || page.public === true) return;
    router.get(
      "/acrx/testing" + page.path.replace(/^\/acrx/, ""),
      testingStub,
      (req, res, next) => {
        const roles = getAllowedRolesByPath(page.path);
        if (!roles) return next();
        return requireRoles(roles)(req, res, next);
      },
      async (req, res) => handleProtectedPage(page, req, res)
    );
  });
} else if (process.env.NODE_ENV !== "production") {
  console.log("[testing] disabled (set E2E_TEST_ROUTER=1 to enable dev E2E aliases).");
}

// Shared protected-page renderer (pages.js + testing router).
async function handleProtectedPage(page, req, res) {
  try {
    let content = "";
    const env = process.env.NODE_ENV === "production" ? "production" : "development";

    if (!page.contentType || page.contentType === "render") {
      // render was resolved to a function reference by loadViews().
      const renderFn = typeof page.render === "function" ? page.render : null;

      if (typeof renderFn === "function") {
        // AcroxaJS Phase 6: render inside a render context so el() records
        // the content-region tree and deps — the snapshot/diff/patch chain's
        // source. withRenderContext never throws from its own machinery;
        // view errors propagate untouched (no double-execution retry).
        const rcMod = require("../core/runtime/render/context");
        content = await rcMod.withRenderContext(
          { pageId: "page:" + page.path, route: page.path, env, ownerId: "core:views" },
          async () => renderFn(req, res)
        );
      } else {
        content = renderFn;
      }
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
    if (!res.headersSent) res.status(500).send(renderPage_500());
  }
}

module.exports = router;
// Diagnostics + rebuild support (AcroxaJS pages HMR).
module.exports.getPages = () => pages;
module.exports.getLoadErrors = () => loadViews.errors || [];
module.exports.VIEWS_DIR = VIEWS_DIR;
// Shared renderer for the dev-only testing router (same code path as above).
module.exports.handleProtectedPage = handleProtectedPage;