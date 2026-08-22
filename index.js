/* index.js */
const express = require("express");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const connectLivereload = require("connect-livereload");
const livereload = require("livereload");
const { getPaths, generateFrontendPaths } = require("./src/core/pathManager");
const { API_BASE } = require("./config/generated-paths");
const { renderPage_404 } = require("./src/pages.js")
const { verifyAPIToken, corsMiddleware, getSettingsCached } = require("./src/middlewares/authMiddleware.js");
const chokidar = require("chokidar");

dotenv.config();

const initAutoBackup = require("./src/core/atb");

initAutoBackup({
  backupDir: "./_acroxa_backups",
  silent: false,
});

const app = express();
const PORT = process.env.PORT || 3000;
const logStream = require("./src/core/logStream");

logStream.patchConsole();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (process.env.NODE_ENV !== "production") {
  try {

const liveReloadServer = livereload.createServer({
  exts: ["html", "js", "css", "png", "jpg", "svg", "json"],
  delay: 500
});

const watcher = chokidar.watch(
  [
    path.join(__dirname, "src/core"),
    path.join(__dirname, "public"),
    path.join(__dirname, "src/views"),
    path.join(__dirname, "src/routes"),
    path.join(__dirname, "src/services"),
    path.join(__dirname, "src/controllers"),
    path.join(__dirname, "src/extensions"),
    path.join(__dirname, "src/functions"),
    path.join(__dirname, "src/models"),
    path.join(__dirname, "src/modules"),
    path.join(__dirname, "src/middlewares"),
    path.join(__dirname, "acrx")
  ],
  {
    ignored: [
      // Ignore layout runtime/editor dirs
      /acrx[\/\\]layouts[\/\\].*/,

      /node_modules/,
      /\.git/
    ],
    ignoreInitial: true
  }
);

watcher.on("change", (file) => {
   console.log("🔄 LiveReload:", file);
  liveReloadServer.refresh("/");
});

// Disable livereload injection on layout editor pages
app.use((req, res, next) => {
  const disableRoutes = [
    "/acrx/layouts",
    "/acrx/layouts/edit",
    "/acrx/layouts/customize",
    "/acrx/layouts/fonts",
  ];

  const disabled = disableRoutes.some(route =>
    req.path.startsWith(route)
  );

  if (disabled) return next();

  connectLivereload()(req, res, next);
});
  } catch (err) {
     console.warn("⚠️  LiveReload failed to start:", err.message);
  }
}

    generateFrontendPaths();

const layoutsBase = path.join(__dirname, "src/layouts");

app.use("/acrx/assets", express.static(path.join(__dirname, "acrx/assets")));
const frameworkPath = path.join(__dirname, "src/layouts");
app.get(
  "/layouts/:layout/preview/screenshot.png",
  verifyAPIToken,
  (req, res) => {
    const layoutName = req.params.layout;

    if (!/^[a-zA-Z0-9-_]+$/.test(layoutName)) {
      return res.status(400).send("Invalid layout name");
    }

    const filePath = path.join(
      layoutsBase,
      layoutName,
      "preview",
      "screenshot.png"
    );

    res.sendFile(filePath, (err) => {
      if (err) res.status(404).send("Preview not found");
    });
  }
);
// 🔥 Layout assets (ALLOW ALL FILE TYPES)
app.use(
  "/layouts/:layout/assets",
  (req, res, next) => {
    const layout = req.params.layout;

    // basic security check
    if (!/^[a-zA-Z0-9-_]+$/.test(layout)) {
      return res.status(400).send("Invalid layout name");
    }

    next();
  },
  (req, res) => {
    const layout = req.params.layout;

    const assetPath = path.join(
      layoutsBase,
      layout,
      "assets",
      req.path.replace(/^\/assets\/?/, "")
    );

    res.sendFile(assetPath, (err) => {
      if (err) res.status(404).send("Asset not found");
    });
  }
);
app.use("/layouts", (req, res, next) => {
  // Allow only .css files
  if (!req.path.endsWith(".css")) {
    return res.status(403).send("Forbidden");
  }
  next();
});

app.use("/layouts", express.static(frameworkPath));

app.use("/uploads", express.static(path.join(__dirname, "pub-dist/uploads")));
app.use("/uploads/thumbs", express.static(path.join(__dirname, "pub-dist/uploads/thumbs")));
app.use("/uploads/setup", express.static(path.join(__dirname, "public/uploads/setup")));


const uploadDirs = [
  path.join(__dirname, "pub-dist/uploads"),
  path.join(__dirname, "public/uploads/setup")
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});


const { configExists, loadConfig, CONFIG_FILE } = require("./src/core/configManager");


function blockIfNotSetup(req, res, next) {
  const setupRoutes = [
    "/acr/api/firstuser-setup",
    "/acr/api/setup-first-user",
    "/acr/api/send-code",
    "/setup"
  ];

  const isSetupRoute = setupRoutes.some(route => req.path.startsWith(route));

  
  if (!configExists()) {
    if (isSetupRoute) return next();
    return res.redirect("/acr/api/setup-first-user");
  }

  
  if (isSetupRoute) {
    return res.status(403).send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Setup Complete · Acroxa CMS</title>
    <link rel="stylesheet" href="/acrx/assets/css/root.css">
    <link rel="stylesheet" href="/acrx/assets/css/all.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-primary-100);
        font-family: 'Outfit', system-ui, sans-serif;
        padding: 2rem;
      }
      .card {
        max-width: 460px;
        width: 100%;
        background: linear-gradient(135deg, var(--accent-100) 0%, var(--color-primary-200) 100%);
        border-radius: 20px;
        padding: 2.5rem 2rem;
        text-align: center;
        border: 1px solid var(--color-primary-300);
        box-shadow: 0 12px 40px rgba(0,0,0,0.08);
      }
      .icon {
        width: 64px;
        height: 64px;
        margin: 0 auto 1.25rem;
        background: var(--accent-500);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        color: #fff;
      }
      h1 {
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--color-primary-800);
        margin-bottom: 0.5rem;
      }
      p {
        font-size: 0.92rem;
        color: var(--color-primary-600);
        line-height: 1.55;
        margin-bottom: 1rem;
      }
      code {
        display: inline-block;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 0.82rem;
        background: rgba(0,0,0,0.08);
        padding: 0.5rem 1rem;
        border-radius: 8px;
        color: var(--color-primary-700);
        word-break: break-all;
        margin-bottom: 1.25rem;
      }
      .hint {
        font-size: 0.8rem;
        color: var(--color-primary-500);
        opacity: 0.6;
        margin-top: 0.5rem;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon"><i class="fa-solid fa-check"></i></div>
      <h1>Setup Already Completed</h1>
      <p>Your Acroxa CMS is already configured and running.</p>
      <p>To run setup again, delete the config file:</p>
      <code>${CONFIG_FILE}</code>
      <p class="hint">Redirecting to home page in 3 seconds...</p>
    </div>
    <script>setTimeout(() => { window.location.href = "/"; }, 3000);</script>
  </body>
</html>`);
  }

  next();
}

app.use(blockIfNotSetup);

// ── CORS (reads from settings) ────────────────────────────────────────
app.use(corsMiddleware);

// ── SEO Routes ────────────────────────────────────────────────────────
app.get("/sitemap.xml", async (req, res) => {
  try {
    const settings = await getSettingsCached();
    if (!settings?.seo?.enableSitemap) {
      return res.status(404).send("Not found");
    }
    const { connectDB } = require("./src/core/connect-db");
    const models = await connectDB();
    const Post = models.Post;
    const Page = models.Page;
    const posts = await Post.find({ status: "published" }).select("slug updatedAt").lean();
    const pages = await Page.find({ status: "published" }).select("slug updatedAt").lean();
    const siteURL = settings.general?.siteURL || "http://localhost:3000";
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    xml += `  <url><loc>${siteURL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
    for (const p of posts) {
      xml += `  <url><loc>${siteURL}/${p.slug}</loc><lastmod>${p.updatedAt ? new Date(p.updatedAt).toISOString().split("T")[0] : ""}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
    }
    for (const p of pages) {
      xml += `  <url><loc>${siteURL}/${p.slug}</loc><lastmod>${p.updatedAt ? new Date(p.updatedAt).toISOString().split("T")[0] : ""}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>\n`;
    }
    xml += '</urlset>';
    res.setHeader("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    console.error("[SEO] Sitemap error:", err.message);
    res.status(500).send("Error generating sitemap");
  }
});

app.get("/robots.txt", async (req, res) => {
  try {
    const settings = await getSettingsCached();
    if (!settings?.seo?.enableRobotsTxt) {
      return res.status(404).send("Not found");
    }
    const siteURL = settings.general?.siteURL || "http://localhost:3000";
    let txt = "User-agent: *\nAllow: /\n";
    if (settings.seo?.enableSitemap) {
      txt += `Sitemap: ${siteURL}/sitemap.xml\n`;
    }
    res.setHeader("Content-Type", "text/plain");
    res.send(txt);
  } catch (err) {
    console.error("[SEO] Robots.txt error:", err.message);
    res.status(500).send("Error generating robots.txt");
  }
});



let pluginAPI;
try {
  pluginAPI = require("./src/core/pluginAPI.js");
  global.acrx = pluginAPI;
  global.acrx.Layout = require("./src/core/layoutHelpers.js");
  global.acrx.route_uri = require("./src/core/publicAPI.js");

  
  if (pluginAPI.setApp) {
    pluginAPI.setApp(app);
  }

  
  if (global.acrx.route_uri?.setApp) {
    global.acrx.route_uri.setApp(app);
  }
  acrx.registerMenuItem({
  label: "Approvals",                    
  icon: "clipboard-check",               
  link: "/approvals",                    
  allowedRoles: ["admin"],
  order: 25,                             
  plugin: "core"
});
// Core / system-level items

acrx.registerTopbarItem({
  label: "Dashboard",
  icon: "grid-2",
  action: "/acrx/dashboard",
  order: 10
});

acrx.registerTopbarItem({
  label: "Posts",
  icon: "pen",
  action: "/acrx/posts",
  order: 20
});

acrx.registerTopbarItem({
  label: "Media",
  icon: "photo-film",
  action: "/acrx/media",
  order: 30
});

acrx.registerTopbarItem({
  label: "Settings",
  icon: "gear",
  action: "/acrx/settings",
  order: 100
});
} catch (err) {
   console.error("Failed to initialize plugin API:", err.message);
}

// ── Initialize routes and services (called on startup and after setup restart) ──
async function initializeApp() {
  // Load config
  try {
    const siteConfig = loadConfig();
    global.siteConfig = siteConfig;
  } catch (err) {
    throw new Error(`Config loading failed: ${err.message}`);
  }

  // Connect to DB
  const { connectDB } = require("./src/core/connect-db");
  try {
    const models = await connectDB({
      db_type: global.siteConfig.database?.type || process.env.DB_TYPE || "mongodb",
      db_name: global.siteConfig.database?.name || process.env.DB_NAME || "acroxa_cms",
      db_user: global.siteConfig.database?.user || process.env.DB_USER || "",
      db_pass: global.siteConfig.database?.pass || process.env.DB_PASS || "",
      db_host: global.siteConfig.database?.host || process.env.DB_HOST || "127.0.0.1",
      db_port: global.siteConfig.database?.port || process.env.DB_PORT || "",
      db_url: process.env.MONGODB_URI
    });
    global.models = models;
  } catch (err) {
    throw new Error(`Database connection failed: ${err.message}`);
  }

  // Hot reloader (dev only)
  try {
    let env = process.env.NODE_ENV || "";
    if (env !== 'production') {
      const CMSHotReloader = require('./src/hot-reloader');
      const hotReloader = new CMSHotReloader();
      hotReloader.start();
      console.log("🚀 CMS Hot Reloader initialized");
    }
  } catch (e) { console.warn("⚠️  Hot reloader:", e.message); }

  // Dynamic pages router
  const loadPagesRouter = () => require('./src/routes/pages');
  let pagesModule = loadPagesRouter();
  app.use((req, res, next) => {
    try {
      const pagesRouter = loadPagesRouter();
      pagesRouter(req, res, next);
    } catch (err) {
      console.error('Hot reload failed while loading pages router:', err.message);
      res.status(500).send('Error loading updated admin pages');
    }
  });

  // API routes
  const apiRoutes = require("./src/routes/api");
  const { bootLayout } = require('./src/layouts/framework/init.js');
  await bootLayout(global.acrx);

  // Scheduled-content publisher (publishes posts/pages whose publishAt passed)
  try {
    const { startScheduler } = require("./src/services/schedulerService.js");
    startScheduler();
  } catch (schedErr) {
    console.warn("⚠️  Scheduler failed to start:", schedErr.message);
  }

  // Seed widgets and patterns
  try {
    const { seedWidgetsAndPatterns } = require("./src/seed.js");
    await seedWidgetsAndPatterns();
  } catch (seedErr) {
    console.warn("⚠️  Seeding skipped:", seedErr.message);
  }

  // Mount API router
  if (apiRoutes && (typeof apiRoutes === "function" || apiRoutes.router)) {
    app.use(`${API_BASE}`, apiRoutes.router || apiRoutes);
  }

  // Stash reload functions
  global.acrx.reloadPageRenderers = pagesModule.reloadPageRenderers;
  global.acrx.invalidateMenuCache = pagesModule.invalidateMenuCache;

  // Load plugins
  try {
    const pluginsDir = path.join(__dirname, "src/plugins");
    if (fs.existsSync(pluginsDir)) {
      const plugins = fs.readdirSync(pluginsDir).filter(file =>
        fs.statSync(path.join(pluginsDir, file)).isDirectory()
      );
      for (const pluginName of plugins) {
        const pluginPath = path.join(pluginsDir, pluginName, "index.js");
        if (fs.existsSync(pluginPath)) {
          try {
            const plugin = require(pluginPath);
            if (typeof plugin === "function") {
              plugin(global.acrx);
              console.log(`  ✅ Plugin loaded: ${pluginName}`);
            } else if (plugin.init && typeof plugin.init === "function") {
              plugin.init(global.acrx);
              console.log(`  ✅ Plugin loaded: ${pluginName}`);
            }
          } catch (err) {
            console.error(`  ❌ Failed to load plugin ${pluginName}:`, err.message);
          }
        }
      }
    }
  } catch (err) {
    console.warn("⚠️  Failed to load plugins:", err.message);
  }

  // Plugin routes & rewrites
  if (pluginAPI?.registered?.routes) {
    for (const route of pluginAPI.registered.routes) {
      console.log(`  ✅ Registered: ${route.method.toUpperCase()} ${route.path} [${route.plugin}]`);
    }
  }
  if (pluginAPI?.registered?.rewrites) {
    for (const rewrite of pluginAPI.registered.rewrites) {
      app.use((req, res, next) => {
        if (req.path.match(new RegExp(rewrite.from))) {
          req.url = req.url.replace(new RegExp(rewrite.from), rewrite.to);
        }
        next();
      });
      console.log(`  ✅ Rewrite: ${rewrite.from} → ${rewrite.to}`);
    }
  }

  // Public injections
  if (pluginAPI?.registered?.publicInject?.length) {
    global.publicInjections = pluginAPI.registered.publicInject;
  }

  // Route URI
  if (global.acrx?.route_uri?.setApp) {
    global.acrx.route_uri.setApp(app);
  }

  // Plugin registry
  if (pluginAPI?.registered) {
    global.pluginRegistry = pluginAPI.registered;
  }
}

// ── Restart function (called after setup) ──
let serverInstance = null;

async function restartServer() {
  console.log("🔄 Restarting server after setup...");
  const { disconnectDB } = require("./src/core/connect-db");
  try { await disconnectDB(); } catch (_) {}

  if (serverInstance) {
    serverInstance.close(() => {
      console.log("✅ Server stopped, restarting...");
      startServer();
    });
  } else {
    startServer();
  }
}

async function startServer() {
  try {
    await initializeApp();

    // 404 handler (must be last)
    app.use((req, res) => {
      const reqPath = req.path.toLowerCase();
      if (global.currentLayoutEngine?.render404) {
        try {
          return res.status(404).send(global.currentLayoutEngine.render404() || `<h1>404 Page Not Found</h1>`);
        } catch (_) {}
      }
      res.status(404).send(`<!DOCTYPE html><html><head><title>404</title></head><body style="font-family:system-ui;text-align:center;padding:80px;"><h1>404</h1><p>Page not found.</p><a href="/">Home</a></body></html>`);
    });

    serverInstance = app.listen(PORT, "0.0.0.0", () => {
      console.log(`\n🚀 Acroxa CMS running at http://localhost:${PORT}`);
      if (pluginAPI?.registered) {
        const reg = pluginAPI.registered;
        console.log("📊 System Stats:");
        console.log(`   • Routes:     ${reg.routes?.length || 0}`);
        console.log(`   • Menu Items: ${reg.menus?.length || 0}`);
        console.log(`   • Widgets:    ${reg.widgets?.length || 0}`);
        console.log(`   • Hooks:      ${reg.hooks?.length || 0}`);
        console.log(`   • Schemas:    ${reg.schemas?.length || 0}`);
      }
    });
  } catch (err) {
    console.error("\n╔════════════════════════════════════════╗");
    console.error("║     ❌ FATAL ERROR: Startup Failed     ║");
    console.error("╚════════════════════════════════════════╝\n");
    console.error("💥 " + err.message);
    if (process.env.NODE_ENV !== "production") console.error(err.stack);
    process.exit(1);
  }
}

// ── Main entry ──
(async () => {
  try {
    if (configExists()) {
      await startServer();
    } else {
      // Setup mode — mount only the API routes needed for setup
      console.log("⚠️  No configuration found");
      console.log("🔧 Activating setup mode.");

      const setupApi = require("./src/routes/api");
      if (setupApi && (typeof setupApi === "function" || setupApi.router)) {
        app.use("/acr/api", setupApi.router || setupApi);
      }

      // Expose restart so setup handler can trigger it
      if (global.acrx) global.acrx.restartServer = restartServer;

      app.listen(PORT, "0.0.0.0", () => {
        console.log(`\n🔧 SETUP MODE — http://localhost:${PORT}/acr/api/setup-first-user`);
      });
    }
  } catch (err) {
    console.error("\n╔════════════════════════════════════════╗");
    console.error("║     ❌ FATAL ERROR: Startup Failed     ║");
    console.error("╚════════════════════════════════════════╝\n");
    console.error("💥 " + err.message);
    if (process.env.NODE_ENV !== "production") console.error(err.stack);
    process.exit(1);
  }
})();


process.on("SIGINT", async () => {

  try {
    const { disconnectDB } = require("./src/core/connect-db");
    await disconnectDB();
    process.exit(0);
    
  } catch (err) {
     console.error("❌ Error during shutdown:", err.message);
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
   console.log("\n🛑 SIGTERM received, shutting down...");
  process.emit("SIGINT");
});


process.on("uncaughtException", (err) => {
   console.error("\n💥 UNCAUGHT EXCEPTION:");
   console.error(err.stack);
   console.error("\n🛑 Shutting down due to uncaught exception...");
  process.exit(1);
});


process.on("unhandledRejection", (reason, promise) => {
   console.error("\n💥 UNHANDLED PROMISE REJECTION:");
   console.error("Promise:", promise);
   console.error("Reason:", reason);
   console.error("\n🛑 Shutting down due to unhandled rejection..");
  process.exit(1);
});
 console.log(`🔒 ${process.env.NODE_ENV}`)