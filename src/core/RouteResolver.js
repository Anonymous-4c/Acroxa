// src/core/RouteResolver.js
//
// The CMS routing brain. Takes a URL path + settings config and returns a
// structured resolution object that LayoutEngine and DataLoader consume.
//
// Priority order:
//   1. Homepage ( / )
//   2. Blog page override (page designated as blog archive)
//   3. Post routes  ( /:postPrefix/:slug )
//   4. Category routes ( /:categoryPrefix/:slug )
//   5. Landing page routes ( /:landingPagePrefix/:slug )
//   6. Dynamic pages (any slug matching a published page)
//   7. 404 fallback
//
// Resolution object shape:
// {
//   type:       "homepage" | "blog" | "post" | "category" | "landing" | "page" | "404",
//   template:   string,          // layout template key to render
//   slug:       string | null,   // resolved content slug
//   params:     object,          // extra route params (page number, etc.)
//   dataSource: string,          // hint for DataLoader
//   context:    "live" | "preview" | "draft",
//   raw:        string,          // original URL path
// }

const { getConnection } = require("./connect-db");

// ── Internal helpers ─────────────────────────────────────────────────────────

function stripQuery(url) {
  return url.split("?")[0].replace(/\/+$/, "") || "/";
}

function segmentsOf(url) {
  return stripQuery(url).split("/").filter(Boolean);
}

// ── Settings cache ────────────────────────────────────────────────────────────
// Uses configurable TTL from settings, falls back to 30s.
let _settingsCache    = null;
let _settingsCachedAt = 0;
const DEFAULT_TTL_MS = 30_000;

function _getCacheTTL() {
  try {
    const s = global._settingsCache;
    return (parseInt(s?.advanced?.cacheTTL) * 1000) || DEFAULT_TTL_MS;
  } catch (_) {
    return DEFAULT_TTL_MS;
  }
}

async function getRoutingSettings() {
  const now = Date.now();
  const ttl = _getCacheTTL();
  if (_settingsCache && now - _settingsCachedAt < ttl) {
    return _settingsCache;
  }

  try {
    const conn   = getConnection();
    const models = conn.models || conn;
    const Settings = models.Settings;

    if (!Settings) {
      return _defaultRoutingSettings();
    }

    const s = await Settings.getRoutingConfig();
    _settingsCache    = s;
    _settingsCachedAt = now;
    return s;
  } catch (err) {
    console.warn("[RouteResolver] Could not load settings, using defaults:", err.message);
    return _settingsCache || _defaultRoutingSettings();
  }
}

function _defaultRoutingSettings() {
  return {
    homepage: { mode: "posts", pageId: null, template: "homepage" },
    blogPage: { enabled: false, pageId: null, template: "blog", postsPerPage: 10 },
    routing: {
      postPrefix:        "post",
      categoryPrefix:    "category",
      landingPagePrefix: "landing",
      pagePrefix:        "",
      permalinkStructure: "/:postPrefix/:slug",
    },
  };
}

// Allow external systems (settings save hook) to bust the cache immediately
function bustSettingsCache() {
  _settingsCache    = null;
  _settingsCachedAt = 0;
}

// ── Blog page slug cache ──────────────────────────────────────────────────────
// We need the actual slug of the blog-page-designated page.
let _blogSlugCache    = null;
let _blogSlugCachedAt = 0;
const BLOG_SLUG_TTL_MS = 60_000;

async function getBlogPageSlug(blogPageSettings) {
  if (!blogPageSettings?.enabled || !blogPageSettings?.pageId) return null;

  const now = Date.now();
  if (_blogSlugCache !== null && now - _blogSlugCachedAt < BLOG_SLUG_TTL_MS) {
    return _blogSlugCache;
  }

  try {
    const conn   = getConnection();
    const models = conn.models || conn;
    const Page   = models.Page;
    if (!Page) return null;

    let page;
    if (typeof Page.findById === "function") {
      page = await Page.findById(blogPageSettings.pageId).lean();
    } else if (typeof Page.findByPk === "function") {
      page = await Page.findByPk(blogPageSettings.pageId);
    }

    _blogSlugCache    = page?.slug || null;
    _blogSlugCachedAt = now;
    return _blogSlugCache;
  } catch (err) {
    console.warn("[RouteResolver] Could not resolve blog page slug:", err.message);
    return null;
  }
}

function bustBlogSlugCache() {
  _blogSlugCache    = null;
  _blogSlugCachedAt = 0;
}

// ── Homepage page/landing slug cache ─────────────────────────────────────────
let _homepageSlugCache    = null;
let _homepageSlugCachedAt = 0;
const HOMEPAGE_SLUG_TTL_MS = 60_000;

async function getHomepageSlug(homepageSettings) {
  if (homepageSettings?.mode === "posts") return null;
  if (!homepageSettings?.pageId) return null;

  const now = Date.now();
  if (_homepageSlugCache !== null && now - _homepageSlugCachedAt < HOMEPAGE_SLUG_TTL_MS) {
    return _homepageSlugCache;
  }

  try {
    const conn   = getConnection();
    const models = conn.models || conn;

    const mode = homepageSettings.mode; // "page" | "landing"
    const Model = mode === "landing" ? models.LandingPage : models.Page;
    if (!Model) return null;

    let doc;
    if (typeof Model.findById === "function") {
      doc = await Model.findById(homepageSettings.pageId).lean();
    } else if (typeof Model.findByPk === "function") {
      doc = await Model.findByPk(homepageSettings.pageId);
    }

    _homepageSlugCache    = doc?.slug || null;
    _homepageSlugCachedAt = now;
    return _homepageSlugCache;
  } catch (err) {
    console.warn("[RouteResolver] Could not resolve homepage slug:", err.message);
    return null;
  }
}

// ── Resolution factory ────────────────────────────────────────────────────────

function resolved(type, template, slug, params = {}, dataSource = null) {
  return { type, template, slug, params, dataSource: dataSource || type };
}

// ── MAIN RESOLVER ─────────────────────────────────────────────────────────────

/**
 * resolve(url, options)
 *
 * @param {string} url        - Full request path, e.g. "/post/hello-world?page=2"
 * @param {object} options
 *   @param {string} [options.context="live"] - "live" | "preview" | "draft"
 *   @param {number} [options.page=1]         - Pagination page number
 * @returns {Promise<ResolutionObject>}
 */
async function resolve(url, options = {}) {
  const context = options.context || "live";
  const path    = stripQuery(url);
  const segs    = segmentsOf(path);
  const page    = parseInt(options.page || 1, 10);

  // Load routing config (cached)
  const { homepage, blogPage, routing } = await getRoutingSettings();

  const postPrefix     = routing.postPrefix        || "post";
  const categoryPrefix = routing.categoryPrefix    || "category";
  const landingPrefix  = routing.landingPagePrefix || "landing";

  // ── 1. HOMEPAGE ────────────────────────────────────────────────────────────
  if (path === "/") {
    const mode = homepage?.mode || "posts";

    if (mode === "posts") {
      return { ...resolved("homepage", homepage?.template || "homepage", null, { page }, "posts_archive"), context, raw: url };
    }

    if (mode === "page") {
      const slug = await getHomepageSlug(homepage);
      return { ...resolved("homepage", homepage?.template || "homepage", slug, { page }, "page"), context, raw: url };
    }

    if (mode === "landing") {
      const slug = await getHomepageSlug(homepage);
      return { ...resolved("homepage", homepage?.template || "landing", slug, { page }, "landing"), context, raw: url };
    }

    // Fallback
    return { ...resolved("homepage", "homepage", null, { page }, "posts_archive"), context, raw: url };
  }

  // ── 2. BLOG PAGE OVERRIDE ──────────────────────────────────────────────────
  // If a page has been designated as the blog archive page,
  // its slug must render as blog archive, NOT as a normal page.
  if (blogPage?.enabled) {
    const blogSlug = await getBlogPageSlug(blogPage);
    if (blogSlug && (path === `/${blogSlug}` || segs[0] === blogSlug)) {
      const blogPage2 = parseInt(segs[1], 10) || page;
      return {
        ...resolved("blog", blogPage?.template || "blog", null, { page: blogPage2, postsPerPage: blogPage?.postsPerPage || 10 }, "posts_archive"),
        context,
        raw: url,
      };
    }
  }

  // ── 3. POST ROUTES ─────────────────────────────────────────────────────────
  // Matches /:postPrefix/:slug
  if (segs[0] === postPrefix && segs[1]) {
    return {
      ...resolved("post", "post", segs[1], {}, "post"),
      context,
      raw: url,
    };
  }

  // ── 4. CATEGORY ROUTES ─────────────────────────────────────────────────────
  // Matches /:categoryPrefix/:slug and /:categoryPrefix/:slug/:page
  if (segs[0] === categoryPrefix && segs[1]) {
    const catPage = parseInt(segs[2], 10) || page;
    return {
      ...resolved("category", "category", segs[1], { page: catPage }, "category"),
      context,
      raw: url,
    };
  }

  // ── 5. LANDING PAGE ROUTES ─────────────────────────────────────────────────
  // Matches /:landingPrefix/:slug
  if (segs[0] === landingPrefix && segs[1]) {
    return {
      ...resolved("landing", "landing", segs[1], {}, "landing"),
      context,
      raw: url,
    };
  }

  // ── 6. DYNAMIC PAGE ROUTES ─────────────────────────────────────────────────
  // Single-segment slugs that match published pages.
  // e.g. /about, /contact, /privacy-policy
  //
  // For migration compatibility: also matches /:pagePrefix/:slug if pagePrefix set.
  if (segs.length === 1) {
    const slug = segs[0];
    return {
      ...resolved("page", "page", slug, {}, "page"),
      context,
      raw: url,
    };
  }

  // Optional pagePrefix support: /page/slug
  const pagePrefix = routing.pagePrefix;
  if (pagePrefix && segs[0] === pagePrefix && segs[1]) {
    return {
      ...resolved("page", "page", segs[1], {}, "page"),
      context,
      raw: url,
    };
  }

  // ── 7. 404 FALLBACK ────────────────────────────────────────────────────────
  return {
    ...resolved("404", "404", null, {}, null),
    context,
    raw: url,
  };
}

// ── VIRTUAL ROUTE INVENTORY ───────────────────────────────────────────────────
// Used by the customizer's dynamic route navigator.
// Queries the DB for real pages/posts/categories and returns a route list.

async function getPreviewRoutes(layoutId) {
  const routes = [];

  try {
    const conn   = getConnection();
    const models = conn.models || conn;
    const { homepage, blogPage, routing } = await getRoutingSettings();

    const postPrefix     = routing.postPrefix        || "post";
    const categoryPrefix = routing.categoryPrefix    || "category";
    const landingPrefix  = routing.landingPagePrefix || "landing";

    // Homepage
    routes.push({ label: "Homepage", path: "/", type: "homepage", icon: "home" });

    // Blog page
    if (blogPage?.enabled) {
      const blogSlug = await getBlogPageSlug(blogPage);
      if (blogSlug) {
        routes.push({ label: "Blog", path: `/${blogSlug}`, type: "blog", icon: "files" });
      }
    } else {
      // Show a virtual blog route so customizer can preview blog template
      routes.push({ label: "Blog (virtual)", path: `/${postPrefix}s`, type: "blog", icon: "files" });
    }

    // Sample post (first published)
    if (models.Post) {
      let post;
      try {
        if (typeof models.Post.findOne === "function") {
          post = await models.Post.findOne({ status: "published" })
            .select("title slug").lean();
        } else {
          post = await models.Post.findOne({ where: { status: "published" } });
        }
      } catch (_) {}
      if (post) {
        routes.push({
          label: `Post: ${post.title}`,
          path:  `/${postPrefix}/${post.slug}`,
          type:  "post",
          icon:  "pen",
        });
      }
    }

    // Sample category (first)
    if (models.Category) {
      let cat;
      try {
        if (typeof models.Category.findOne === "function") {
          cat = await models.Category.findOne({ isActive: true }).select("name slug").lean();
        } else {
          cat = await models.Category.findOne({ where: { isActive: true } });
        }
      } catch (_) {}
      if (cat) {
        routes.push({
          label: `Category: ${cat.name}`,
          path:  `/${categoryPrefix}/${cat.slug}`,
          type:  "category",
          icon:  "tag",
        });
      }
    }

    // Up to 5 published pages
    if (models.Page) {
      let pages = [];
      try {
        if (typeof models.Page.find === "function") {
          pages = await models.Page.find({ status: "published" }).select("title slug").limit(5).lean();
        } else {
          pages = await models.Page.findAll({ where: { status: "published" }, limit: 5 });
        }
      } catch (_) {}
      for (const p of pages) {
        routes.push({
          label: `Page: ${p.title}`,
          path:  `/${p.slug}`,
          type:  "page",
          icon:  "file",
        });
      }
    }

    // Up to 3 published landing pages
    if (models.LandingPage) {
      let landings = [];
      try {
        if (typeof models.LandingPage.find === "function") {
          landings = await models.LandingPage.find({ status: "published" }).select("title slug").limit(3).lean();
        } else {
          landings = await models.LandingPage.findAll({ where: { status: "published" }, limit: 3 });
        }
      } catch (_) {}
      for (const lp of landings) {
        routes.push({
          label: `Landing: ${lp.title}`,
          path:  `/${landingPrefix}/${lp.slug}`,
          type:  "landing",
          icon:  "rocket",
        });
      }
    }

  } catch (err) {
    console.error("[RouteResolver] getPreviewRoutes error:", err.message);
  }

  return routes;
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  resolve,
  getRoutingSettings,
  getPreviewRoutes,
  bustSettingsCache,
  bustBlogSlugCache,
};