// src/layouts/framework/dataLoader.js
//
// Route-aware data orchestration layer.
// LayoutEngine calls loadResolvedData(resolved) and receives everything
// the template needs. Layout designers never touch DB code.

const { getConnection } = require("../../core/connect-db");

function getModels() {
  const conn = getConnection();
  if (conn.models) return conn.models;
  throw new Error("Database not connected");
}

function getDbType() {
  const conn = getConnection();
  if (conn?.define) return "sequelize";
  if (conn?.modelNames || conn?.models) return "mongoose";
  return "unknown";
}

class DataLoader {
  constructor(options = {}) {
    const models = getModels();
    this.Post        = models.Post;
    this.Page        = models.Page;
    this.Category    = models.Category;
    this.LandingPage = models.LandingPage || null;
    this.Settings    = models.Settings    || null;

    const dbType     = getDbType();
    this.isMongo     = dbType === "mongoose";
    this.isSequelize = dbType === "sequelize";

    // Preview/draft flags
    this.preview      = options.preview      || false;
    this.draft        = options.draft        || false;
    this.bypassCache  = options.bypassCache  || false;
  }

  // ── STATUS FILTER ──────────────────────────────────────────────────────────
  // In preview/draft mode, we allow non-published content
  _statusFilter() {
    if (this.preview || this.draft) return undefined; // no filter
    return "published";
  }

  _mongoStatusQuery() {
    const s = this._statusFilter();
    return s ? { status: s } : {};
  }

  _sqlStatusWhere() {
    const s = this._statusFilter();
    return s ? { status: s } : {};
  }
  async getSettings() {
    try {
      if (!this.Settings) return null;

      if (this.isSequelize) {
        return await this.Settings.findOne();
      } else {
        return await this.Settings.findOne().lean();
      }
    } catch (err) {
      console.error("❌ DataLoader: getSettings:", err.message);
      return null;
    }
  }
  // ── MASTER ENTRY POINT ────────────────────────────────────────────────────
  // Called by LayoutEngine.handle() with the resolved route object.
  async loadResolvedData(resolved) {
    const { type, slug, params } = resolved;
    const page = params?.page || 1;

    const base = await this.getBaseParams();

    switch (type) {
      case "homepage": return { ...base, ...(await this.getHomepageData(resolved)) };
      case "blog":     return { ...base, ...(await this.getBlogPageData(resolved)) };
      case "post":     return { ...base, ...(await this.getPostData(slug)) };
      case "category": return { ...base, ...(await this.getCategoryData(slug, page)) };
      case "landing":  return { ...base, ...(await this.getLandingData(slug)) };
      case "page":     return { ...base, ...(await this.getPageData(slug)) };
      case "404":      return { ...base, page_title: "Page Not Found" };
      default:         return base;
    }
  }

  // ── BASE PARAMS ───────────────────────────────────────────────────────────
async getBaseParams() {
  const [recentPosts, categories, menuPages, settings] = await Promise.all([
    this.getRecentPosts(5),
    this.getCategories(),
    this.getMenuPages(),
    this.getSettings(),
  ]);

  const general = settings?.general || {};

  return {
    site_title:        general.siteName || "Acroxa CMS",
    site_description:  general.siteDescription || "",
    site_logo:         general.siteLogo || "",
    site_favicon:      general.siteFavicon || "",
    site_tagline:      general.siteTagline || "",

    menu:         menuPages,
    recent_posts: recentPosts,
    categories,
  };
}

  // ── HOMEPAGE DATA ─────────────────────────────────────────────────────────
  async getHomepageData(resolved) {
    const { dataSource, slug, params } = resolved;
    const page = params?.page || 1;

    // Mode: posts archive
    if (dataSource === "posts_archive" || !slug) {
      const posts = await this.getPublishedPosts(null, page);
      return {
        page_title: "Home",
        posts: posts.map(p => this.formatPostForTemplate(p)),
      };
    }

    // Mode: page as homepage
    if (dataSource === "page") {
      const data = await this.getPageData(slug);
      return data;
    }

    // Mode: landing page as homepage
    if (dataSource === "landing") {
      const data = await this.getLandingData(slug);
      return data;
    }

    return { page_title: "Home" };
  }

  // ── BLOG ARCHIVE DATA ─────────────────────────────────────────────────────
  async getBlogPageData(resolved) {
    const { params } = resolved;
    const page    = params?.page    || 1;
    const perPage = params?.postsPerPage || 10;

    const [posts, total] = await Promise.all([
      this.getPublishedPosts(perPage, page),
      this.countPublishedPosts(),
    ]);

    return {
      page_title:   "Blog",
      posts:        posts.map(p => this.formatPostForTemplate(p)),
      pagination:   this._buildPagination(page, perPage, total),
    };
  }

  // ── POST DATA ─────────────────────────────────────────────────────────────
  async getPostData(slug) {
    const post = await this.getPostBySlug(slug);
    if (!post) return null; // LayoutEngine will handle 404

    // Parse JSON content from editor
    let jsonContent = null;
    try {
      const raw = post.content?.json;
      jsonContent = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      jsonContent = null;
    }

    return {
      page_title: post.title,
      post:       this.formatPostForTemplate(post),
      // Editor-specific data
      editorContent: jsonContent,
      contentHtml:   post.content?.html || "",
      contentRaw:    post.content?.raw || "",
      seo: {
        metaTitle:       post.metaTitle,
        metaDescription: post.metaDescription,
        focusKeyword:    post.focusKeyword,
        canonicalUrl:    post.canonicalUrl,
        ogTitle:         post.ogTitle,
        ogDescription:    post.ogDescription,
        ogImage:         post.ogImage,
        noIndex:         post.noIndex,
        noFollow:        post.noFollow,
      },
    };
  }

  // ── PAGE DATA ─────────────────────────────────────────────────────────────
  async getPageData(slug) {
    const page = await this.getPageBySlug(slug);
    if (!page) return null; // LayoutEngine will handle 404

    // Parse JSON content from editor
    let jsonContent = null;
    try {
      const raw = page.content?.json;
      jsonContent = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      jsonContent = null;
    }

    return {
      page_title: page.title,
      page:       this.formatPageForTemplate(page),
      // Editor-specific data
      editorContent: jsonContent,
      contentHtml:   page.content?.html || "",
      contentRaw:    page.content?.raw || "",
    };
  }

  // ── LANDING PAGE DATA ─────────────────────────────────────────────────────
  async getLandingData(slug) {
    if (!this.LandingPage) return null;

    try {
      let lp;
      if (this.isMongo) {
        const q = { slug, ...this._mongoStatusQuery() };
        lp = await this.LandingPage.findOne(q).lean();
      } else {
        lp = await this.LandingPage.findOne({
          where: { slug, ...this._sqlStatusWhere() },
        });
      }

      if (!lp) return null;

      return {
        page_title:      lp.title,
        landing:         this.formatLandingForTemplate(lp),
      };
    } catch (err) {
      console.error("❌ DataLoader: getLandingData:", err.message);
      return null;
    }
  }

  // ── CATEGORY DATA ─────────────────────────────────────────────────────────
  async getCategoryData(slug, page = 1) {
    const categories = await this.getCategories();
    const category   = categories.find(c => c.slug === slug);
    const posts      = await this.getPostsByCategory(slug);
    const perPage    = 10;
    const paginated  = posts.slice((page - 1) * perPage, page * perPage);

    return {
      page_title: category?.name || slug,
      category,
      posts:      paginated.map(p => this.formatPostForTemplate(p)),
      pagination: this._buildPagination(page, perPage, posts.length),
    };
  }

  // ── RESOLVE DYNAMIC ROUTE (utility for RouteResolver preview) ────────────
  async resolveDynamicRoute(url) {
    const path = url.split("?")[0].replace(/\/+$/, "") || "/";
    const segs = path.split("/").filter(Boolean);
    if (!segs.length) return null;

    const slug = segs[segs.length - 1];

    // Try page
    const page = await this.getPageBySlug(slug);
    if (page) return { type: "page", slug, data: this.formatPageForTemplate(page) };

    // Try post
    const post = await this.getPostBySlug(slug);
    if (post) return { type: "post", slug, data: this.formatPostForTemplate(post) };

    return null;
  }

  // ── DB QUERIES ────────────────────────────────────────────────────────────

  async getPublishedPosts(limit = null, page = 1) {
    try {
      const offset = limit ? (page - 1) * limit : 0;

      if (this.isSequelize) {
        const q = { where: this._sqlStatusWhere(), order: [["publishDate", "DESC"]] };
        if (limit)  q.limit  = limit;
        if (offset) q.offset = offset;
        return await this.Post.findAll(q);
      } else {
        let q = this.Post.find(this._mongoStatusQuery())
          .populate({ path: "author",     select: "username email",    strictPopulate: false })
          .populate({ path: "categories", select: "name slug color",   strictPopulate: false })
          .sort({ publishDate: -1 });
        if (limit)  q = q.limit(limit);
        if (offset) q = q.skip(offset);
        return await q.lean();
      }
    } catch (err) {
      console.error("❌ DataLoader: getPublishedPosts:", err.message);
      return [];
    }
  }

  async countPublishedPosts() {
    try {
      if (this.isSequelize) {
        return await this.Post.count({ where: this._sqlStatusWhere() });
      } else {
        return await this.Post.countDocuments(this._mongoStatusQuery());
      }
    } catch (err) {
      return 0;
    }
  }

  async getPostBySlug(slug) {
    try {
      if (this.isSequelize) {
        return await this.Post.findOne({ where: { slug, ...this._sqlStatusWhere() } });
      } else {
        return await this.Post.findOne({ slug, ...this._mongoStatusQuery() })
          .populate({ path: "author",     select: "username email",   strictPopulate: false })
          .populate({ path: "categories", select: "name slug color",  strictPopulate: false })
          .lean();
      }
    } catch (err) {
      console.error("❌ DataLoader: getPostBySlug:", err.message);
      return null;
    }
  }

  async getRecentPosts(limit = 5) {
    const posts = await this.getPublishedPosts(limit);
    return posts.map(post => ({
      title: post.title,
      url:   `/post/${post.slug}`,
      date:  this.formatDate(post.publishDate),
    }));
  }

  async getPageBySlug(slug) {
    try {
      if (this.isSequelize) {
        return await this.Page.findOne({ where: { slug, ...this._sqlStatusWhere() } });
      } else {
        return await this.Page.findOne({ slug, ...this._mongoStatusQuery() })
          .populate({ path: "author", select: "username email", strictPopulate: false })
          .lean();
      }
    } catch (err) {
      console.error("❌ DataLoader: getPageBySlug:", err.message);
      return null;
    }
  }

  async getMenuPages() {
    try {
      if (this.isSequelize) {
        return await this.Page.findAll({
          where: { status: "published", showInMenu: true },
          order: [["order", "ASC"]],
        });
      } else {
        return await this.Page.find({ status: "published", showInMenu: true })
          .sort({ order: 1 })
          .lean();
      }
    } catch (err) {
      return [];
    }
  }

  async getCategories() {
    try {
      let categories;
      if (this.isSequelize) {
        categories = await this.Category.findAll({ order: [["name", "ASC"]] });
      } else {
        categories = await this.Category.find().sort({ name: 1 }).lean();
      }

      return await Promise.all(
        categories.map(async (cat) => {
          let count = 0;
          try {
            if (this.isMongo) {
              count = await this.Post.countDocuments({
                categories: cat._id || cat.id,
                status: "published",
              });
            }
          } catch (_) {}
          return { name: cat.name, slug: cat.slug, color: cat.color, count };
        })
      );
    } catch (err) {
      console.error("❌ DataLoader: getCategories:", err.message);
      return [];
    }
  }

  async getPostsByCategory(categorySlug, limit = null) {
    try {
      const category = this.isSequelize
        ? await this.Category.findOne({ where: { slug: categorySlug } })
        : await this.Category.findOne({ slug: categorySlug }).lean();

      if (!category) return [];

      const categoryId = category._id || category.id;

      if (this.isSequelize) {
        const q = {
          where: { status: "published", categories: { $contains: categoryId } },
          order: [["publishDate", "DESC"]],
        };
        if (limit) q.limit = limit;
        return await this.Post.findAll(q);
      } else {
        let q = this.Post.find({ status: "published", categories: categoryId })
          .populate({ path: "author",     select: "username email",   strictPopulate: false })
          .populate({ path: "categories", select: "name slug color",  strictPopulate: false })
          .sort({ publishDate: -1 });
        if (limit) q = q.limit(limit);
        return await q.lean();
      }
    } catch (err) {
      console.error("❌ DataLoader: getPostsByCategory:", err.message);
      return [];
    }
  }

  // ── FORMATTERS ────────────────────────────────────────────────────────────

  formatPostForTemplate(post) {
    if (!post) return null;

    // Parse JSON content from editor
    let jsonContent = null;
    try {
      const raw = post.content?.json;
      jsonContent = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      jsonContent = null;
    }

    return {
      id:        post.id || post._id,
      title:     post.title,
      slug:      post.slug,
      excerpt:   post.excerpt || "",
      content:   post.content?.html || post.content || "",
      // Editor JSON content (source of truth)
      editorJson: jsonContent,
      contentRaw: post.content?.raw || "",
      image:     post.featuredImage || "",
      date:      this.formatDate(post.publishDate),
      category:  post.categories?.[0]?.name || "Uncategorized",
      categories: Array.isArray(post.categories)
        ? post.categories.map(c => ({ name: c.name, slug: c.slug, color: c.color }))
        : [],
      author:    post.author?.username || "Admin",
      read_time: this.calculateReadTime(post.content?.html || post.content || ""),
      url:       `/post/${post.slug}`,
    };
  }

  formatPageForTemplate(page) {
    if (!page) return null;

    // Parse JSON content from editor
    let jsonContent = null;
    try {
      const raw = page.content?.json;
      jsonContent = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      jsonContent = null;
    }

    return {
      id:         page.id || page._id,
      title:      page.title,
      slug:       page.slug,
      content:    page.content?.html || page.content?.raw || page.content || "",
      // Editor JSON content (source of truth)
      editorJson: jsonContent,
      contentRaw: page.content?.raw || "",
      image:      page.featuredImage || "",
      template:   page.template || "default",
      customCSS:  page.customCSS || "",
    };
  }

  formatLandingForTemplate(lp) {
    if (!lp) return null;
    return {
      id:              lp.id || lp._id,
      title:           lp.title,
      slug:            lp.slug,
      sections:        lp.sections || [],
      template:        lp.template || "landing",
      layoutOverrides: lp.layoutOverrides || {},
      customCSS:       lp.customCSS || "",
      customJS:        lp.customJS  || "",
      abTesting:       lp.abTesting || { enabled: false },
      goals:           lp.goals     || [],
      trackingPixels:  lp.trackingPixels || [],
      stats:           lp.stats || { views: 0, conversions: 0 },
    };
  }

  // ── UTILITIES ─────────────────────────────────────────────────────────────

  _buildPagination(page, perPage, total) {
    const totalPages = Math.ceil(total / perPage);
    return {
      page,
      perPage,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null,
    };
  }

  formatDate(date) {
    if (!date) return "";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  calculateReadTime(content) {
    if (!content) return 1;
    return Math.max(1, Math.ceil(content.split(/\s+/).length / 200));
  }
}

module.exports = DataLoader;