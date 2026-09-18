/* src/controllers/cmsController.js */
const { getConnection } = require("../core/connect-db");

// Single source of truth for document rendering: the same module that renders
// content.json on the public site derives html/raw at save time. The client is
// never trusted to ship pre-rendered HTML.
const {
  renderDocument,
  extractTextFromDocument,
} = require("../layouts/framework/widgetRenderer.js");

const _registerProviders = () => {
  try {
    const { registerBackupProvider } = require("./backupController");
    const conn   = getConnection();
    const models = conn.models || conn;
 
    registerBackupProvider("posts", async () => {
      const Post = models.Post;
      if (!Post) return [];
      if (typeof Post.find === "function")    return Post.find({}).lean();
      if (typeof Post.findAll === "function") return (await Post.findAll()).map((r) => r.toJSON());
      return [];
    });
 
    registerBackupProvider("pages", async () => {
      const Page = models.Page;
      if (!Page) return [];
      if (typeof Page.find === "function")    return Page.find({}).lean();
      if (typeof Page.findAll === "function") return (await Page.findAll()).map((r) => r.toJSON());
      return [];
    });
 
    registerBackupProvider("categories", async () => {
      const Category = models.Category;
      if (!Category) return [];
      if (typeof Category.find === "function")    return Category.find({}).lean();
      if (typeof Category.findAll === "function") return (await Category.findAll()).map((r) => r.toJSON());
      return [];
    });
  } catch (err) {
    console.warn("[CMS] Backup provider registration skipped:", err.message);
  }
};
 
// Register after the event loop tick so DB + backup module are both ready
setImmediate(_registerProviders);
 

// Helper to get models from connection
function getModels() {
  const conn = getConnection();
  if (conn.models) return conn.models;
  throw new Error("Database not connected");
}

// Helper to get DB type
function getDbType() {
  const conn = getConnection();
  if (conn?.define) return "sequelize";
  if (conn?.modelNames || conn?.models) return "mongoose";
  return "unknown";
}

// Malformed Mongo ids make Mongoose throw a CastError inside findById/
// findOne (→ 500). Reject them up front with a 400 so malformed editor URLs
// and probes never surface as server errors. SQL lookups (findByPk/findOne
// with where) return null instead of throwing, so any id shape is fine.
function isValidDocumentId(id, dbType) {
  if (dbType !== "mongoose") return true;
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

// Helper: Normalize slug
const generateSlug = (text) => {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
};

//Helper: ensure a slug is unique for a model (post/page). Appends -2, -3…
//or a short random suffix when collisions occur (e.g. repeated
//"Untitled Post" drafts). Works for both Sequelize and Mongoose.
async function ensureUniqueSlug(Model, baseSlug, excludeId = null) {
  const base = (baseSlug || "untitled").slice(0, 120) || "untitled";
  let slug = base;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let exists = null;
    try {
      if (getDbType() === "sequelize") {
        const where = { slug };
        exists = await Model.findOne({ where });
        if (exists && excludeId && String(exists.id) === String(excludeId)) exists = null;
      } else {
        const q = { slug };
        exists = await Model.findOne(q).lean();
        if (exists && excludeId && String(exists._id) === String(excludeId)) exists = null;
      }
    } catch (_) {
      break;
    }
    if (!exists) return slug;
    attempt += 1;
    slug = attempt < 4 ? `${base}-${attempt + 1}` : `${base}-${Date.now().toString(36).slice(-4)}${attempt}`;
    if (attempt > 10) return `${base}-${Date.now().toString(36)}`;
  }
}

// Helper: Get user ID from request
const getUserId = (req) => {
  return req.body.author || req.user?.id || req.user?._id?.toString();
};

/* ================================================
   CATEGORIES
================================================ */
// Helper function to sanitize response for public users
const sanitizeForPublic = (item) => {
  if (!item) return item;

  const sanitized = { ...item };

  // Remove id from main item
  if (sanitized.id) delete sanitized.id;
  if (sanitized._id) delete sanitized._id;

  // Remove id from author
  if (sanitized.authorData) {
    if (sanitized.authorData.id) delete sanitized.authorData.id;
    if (sanitized.authorData._id) delete sanitized.authorData._id;
  }

  if (sanitized.author) {
    if (sanitized.author.id) delete sanitized.author.id;
    if (sanitized.author._id) delete sanitized.author._id;
  }

  return sanitized;
};

const sanitizeArrayForPublic = (items) => {
  if (!Array.isArray(items)) return items;
  return items.map(sanitizeForPublic);
};

// ====================== PAGES ======================

exports.getPages = async (req, res) => {
  try {
    const { Page } = getModels();
    const isAuth = !!req.authId;
    let pages;

    if (getDbType() === "sequelize") {
      const where = isAuth ? {} : { status: "published" };

      pages = await Page.findAll({
        where,
        order: [["order", "ASC"], ["title", "ASC"]],
        include: [
          { 
            association: "authorData", 
            attributes: isAuth 
              ? ["id", "username", "fullName"] 
              : ["username", "fullName"]   // no id for public
          }
        ]
      });
    } else {
      const query = isAuth ? {} : { status: "published" };

      pages = await Page.find(query)
        .populate("author", isAuth ? "username fullName" : "username fullName")  // no id
        .sort({ order: 1, title: 1 })
        .lean();
    }

    // Sanitize for public users
    const finalPages = isAuth ? pages : sanitizeArrayForPublic(pages);

    res.json({ 
      success: true, 
      pages: finalPages,
      count: finalPages.length 
    });
  } catch (err) {
    console.error("getPages error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch pages" 
    });
  }
};

exports.getPage = async (req, res) => {
  try {
    const { Page } = getModels();
    const { id } = req.params;
    const isAuth = !!req.authId;
    let page;

    if (getDbType() === "sequelize") {
      const where = isAuth ? { id } : { id, status: "published" };

      page = await Page.findOne({
        where,
        include: [
          { 
            association: "authorData", 
            attributes: isAuth 
              ? ["id", "username", "fullName"] 
              : ["username", "fullName"]
          }
        ]
      });
    } else {
      const query = isAuth ? { _id: id } : { _id: id, status: "published" };

      page = await Page.findOne(query)
        .populate("author", isAuth ? "username fullName" : "username fullName")
        .lean();
    }

    if (!page) {
      return res.status(404).json({ 
        success: false, 
        message: "Page not found" 
      });
    }

    const finalPage = isAuth ? page : sanitizeForPublic(page);

    res.json({ 
      success: true, 
      page: finalPage 
    });
  } catch (err) {
    console.error("getPage error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch page" 
    });
  }
};

// ====================== CATEGORIES ======================

exports.getCategories = async (req, res) => {
  try {
    const { Category } = getModels();
    let categories;

    // Categories are usually public, but we can still hide inactive ones
    if (getDbType() === "sequelize") {
      categories = await Category.findAll({ 
        where: { isActive: true },
        order: [["order", "ASC"], ["name", "ASC"]] 
      });
    } else {
      categories = await Category.find({ isActive: true })
        .populate("parent", "name slug")
        .sort({ order: 1, name: 1 })
        .lean();
    }

    res.json({ 
      success: true, 
      categories,
      count: categories.length 
    });
  } catch (err) {
    console.error("getCategories error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch categories" 
    });
  }
};

exports.getCategory = async (req, res) => {
  try {
    const { Category } = getModels();
    const { id } = req.params;
    let category;

    if (getDbType() === "sequelize") {
      category = await Category.findByPk(id, {
        where: { isActive: true }
      });
    } else {
      category = await Category.findOne({ 
        _id: id, 
        isActive: true 
      })
        .populate("parent", "name slug")
        .lean();
    }

    if (!category) {
      return res.status(404).json({ 
        success: false, 
        message: "Category not found" 
      });
    }

    res.json({ 
      success: true, 
      category 
    });
  } catch (err) {
    console.error("getCategory error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch category" 
    });
  }
};

// ====================== POSTS ======================

exports.getPosts = async (req, res) => {
  try {
    const { Post } = getModels();
    const { status, category, limit = 100, skip = 0 } = req.query;
    const isAuth = !!req.authId;
    let posts;

    if (getDbType() === "sequelize") {
      const where = {};

      if (!isAuth) {
        where.status = "published";
      } else if (status) {
        where.status = status;
      }

      posts = await Post.findAll({
        where,
        order: [["publishDate", "DESC"]],
        limit: parseInt(limit),
        offset: parseInt(skip),
        include: [
          { 
            association: "authorData", 
            attributes: isAuth 
              ? ["id", "username", "fullName", "avatar"] 
              : ["username", "fullName", "avatar"]
          }
        ]
      });
    } else {
      const query = {};

      if (!isAuth) {
        query.status = "published";
      } else if (status) {
        query.status = status;
      }

      if (category) query.categories = category;

      posts = await Post.find(query)
        .populate({ 
          path: "author", 
          select: isAuth ? "username fullName avatar" : "username fullName avatar" 
        })
        .populate({ path: "categories", select: "name slug color" })
        .sort({ publishDate: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .lean();
    }

    const finalPosts = isAuth ? posts : sanitizeArrayForPublic(posts);

    res.json({ 
      success: true, 
      posts: finalPosts,
      count: finalPosts.length 
    });
  } catch (err) {
    console.error("getPosts error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch posts" 
    });
  }
};

exports.getPost = async (req, res) => {
  try {
    const { Post } = getModels();
    const { id } = req.params;
    const isAuth = !!req.authId;
    let post;

    if (getDbType() === "sequelize") {
      const where = isAuth ? { id } : { id, status: "published" };

      post = await Post.findOne({
        where,
        include: [
          { 
            association: "authorData", 
            attributes: isAuth 
              ? ["id", "username", "fullName", "avatar"] 
              : ["username", "fullName", "avatar"]
          }
        ]
      });
    } else {
      const query = isAuth ? { _id: id } : { _id: id, status: "published" };

      post = await Post.findOne(query)
        .populate("author", isAuth ? "username fullName avatar" : "username fullName avatar")
        .populate("categories", "name slug color")
        .lean();
    }

    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: "Post not found" 
      });
    }

    const finalPost = isAuth ? post : sanitizeForPublic(post);

    res.json({ 
      success: true, 
      post: finalPost 
    });
  } catch (err) {
    console.error("getPost error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch post" 
    });
  }
};
exports.createCategory = async (req, res) => {
  try {
    const { Category } = getModels();
    const { name, slug, description, color, icon, parentId, metaTitle, metaDescription, keywords } = req.body;

    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: "Category name is required" 
      });
    }

    const categoryData = {
      name: name.trim(),
      slug: slug || generateSlug(name),
      description: description || "",
      color: color || "#888888",
      icon: icon || "",
      metaTitle: metaTitle || name,
      metaDescription: metaDescription || "",
      keywords: keywords || []
    };

    if (getDbType() === "sequelize") {
      if (parentId) categoryData.parentId = parentId;
    } else {
      if (parentId) categoryData.parent = parentId;
    }

    const category = await Category.create(categoryData);
    
    res.json({ 
      success: true, 
      category,
      message: "Category created successfully"
    });
  } catch (err) {
    console.error("createCategory error:", err);
    
    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ 
        success: false, 
        message: "Category with this name or slug already exists" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to create category" 
    });
  }
};


exports.updateCategory = async (req, res) => {
  try {
    const { Category } = getModels();
    const { id } = req.params;
    let category;

    if (getDbType() === "sequelize") {
      category = await Category.findByPk(id);
      if (!category) {
        return res.status(404).json({ 
          success: false, 
          message: "Category not found" 
        });
      }
      await category.update(req.body);
    } else {
      category = await Category.findByIdAndUpdate(
        id, 
        req.body, 
        { new: true, runValidators: true }
      );
      if (!category) {
        return res.status(404).json({ 
          success: false, 
          message: "Category not found" 
        });
      }
    }

    res.json({ 
      success: true, 
      category,
      message: "Category updated successfully" 
    });
  } catch (err) {
    console.error("updateCategory error:", err);
    
    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ 
        success: false, 
        message: "Category with this name or slug already exists" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to update category" 
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { Category } = getModels();
    const { id } = req.params;
    let category;
    
    if (getDbType() === "sequelize") {
      category = await Category.findByPk(id);
    } else {
      category = await Category.findById(id);
    }

    if (!category) {
      return res.status(404).json({ 
        success: false, 
        message: "Category not found" 
      });
    }

    if (category.deletable === false) {
      return res.status(403).json({ 
        success: false, 
        message: "This category cannot be deleted" 
      });
    }

    if (getDbType() === "sequelize") {
      await Category.destroy({ where: { id } });
    } else {
      await Category.findByIdAndDelete(id);
    }

    res.json({ 
      success: true,
      message: "Category deleted successfully" 
    });
  } catch (err) {
    console.error("deleteCategory error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to delete category" 
    });
  }
};

/* ================================================
   POSTS
================================================ */

exports.createPost = async (req, res) => {
  try {
    const { Post, Category } = getModels();
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        message: "Title and content are required" 
      });
    }

    const authorId = getUserId(req);
    if (!authorId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }

    const postData = {
      title: title.trim(),
      slug: await ensureUniqueSlug(Post, req.body.slug || generateSlug(title) || "untitled-post"),
      content: content,
      ast: req.body.ast || {},
      schemaVersion: req.body.schemaVersion || "1",
      // allow client to submit seo analysis
      seoReport: req.body.seoReport || undefined,
      excerpt: req.body.excerpt || "",
      featuredImage: req.body.featuredImage || "",
      featuredImageAlt: req.body.featuredImageAlt || "",
      status: req.body.status || "draft",
      publishDate: req.body.publishDate || new Date(),
      publishAt: req.body.publishAt || null,
      metaTitle: req.body.metaTitle || title,
      metaDescription: req.body.metaDescription || "",
      focusKeyword: req.body.focusKeyword || "",
      keywords: req.body.keywords || [],
      canonicalUrl: req.body.canonicalUrl || "",
      ogTitle: req.body.ogTitle || title,
      ogDescription: req.body.ogDescription || "",
      ogImage: req.body.ogImage || req.body.featuredImage || "",
      isPillarContent: !!req.body.isPillarContent,
      pillarParentId: req.body.pillarParentId || null,
      allowComments: req.body.allowComments !== false,
      noIndex: !!req.body.noIndex,
      noFollow: !!req.body.noFollow
    };

    if (getDbType() === "sequelize") {
      postData.authorId = authorId;
    } else {
      postData.author = authorId;
    }

    if (req.body.categories && Array.isArray(req.body.categories)) {
      postData.categories = req.body.categories;
    }

    const post = await Post.create(postData);

    if (getDbType() === "sequelize" && req.body.categories?.length > 0) {
      if (post.setCategories) {
        await post.setCategories(req.body.categories);
      }
    }

    res.json({ 
      success: true, 
      post,
      message: "Post created successfully" 
    });
  } catch (err) {
    console.error("createPost error:", err);
    
    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ 
        success: false, 
        message: "Post with this slug already exists" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to create post" 
    });
  }
};
exports.updatePost = async (req, res) => {
  try {
    const { Post } = getModels();
    const { id } = req.params;
    let post;

    if (getDbType() === "sequelize") {
      post = await Post.findByPk(id);
      if (!post) {
        return res.status(404).json({ 
          success: false, 
          message: "Post not found" 
        });
      }
      await post.update(req.body);
      
      if (req.body.categories && post.setCategories) {
        await post.setCategories(req.body.categories);
      }
    } else {
      post = await Post.findByIdAndUpdate(
        id, 
        req.body, 
        { new: true, runValidators: true }
      );
      if (!post) {
        return res.status(404).json({ 
          success: false, 
          message: "Post not found" 
        });
      }
    }

    res.json({ 
      success: true, 
      post,
      message: "Post updated successfully" 
    });
  } catch (err) {
    console.error("updatePost error:", err);
    
    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ 
        success: false, 
        message: "Post with this slug already exists" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to update post" 
    });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const { Post } = getModels();
    const { id } = req.params;
    let deleted;

    if (getDbType() === "sequelize") {
      deleted = await Post.destroy({ where: { id } });
      if (!deleted) {
        return res.status(404).json({ 
          success: false, 
          message: "Post not found" 
        });
      }
    } else {
      const post = await Post.findByIdAndDelete(id);
      if (!post) {
        return res.status(404).json({ 
          success: false, 
          message: "Post not found" 
        });
      }
    }

    res.json({ 
      success: true,
      message: "Post deleted successfully" 
    });
  } catch (err) {
    console.error("deletePost error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to delete post" 
    });
  }
};

exports.schedulePost = async (req, res) => {
  try {
    const { Post } = getModels();
    const { id } = req.params;
    const { publishAt } = req.body;

    if (!publishAt) {
      return res.status(400).json({ 
        success: false, 
        message: "publishAt date is required" 
      });
    }

    let post;

    if (getDbType() === "sequelize") {
      post = await Post.findByPk(id);
      if (!post) {
        return res.status(404).json({ 
          success: false, 
          message: "Post not found" 
        });
      }
      await post.update({ publishAt, status: "scheduled" });
    } else {
      post = await Post.findByIdAndUpdate(
        id, 
        { publishAt, status: "scheduled" }, 
        { new: true }
      );
      if (!post) {
        return res.status(404).json({ 
          success: false, 
          message: "Post not found" 
        });
      }
    }

    res.json({ 
      success: true, 
      post,
      message: "Post scheduled successfully" 
    });
  } catch (err) {
    console.error("schedulePost error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to schedule post" 
    });
  }
};

/* ================================================
   PAGES
================================================ */

exports.createPage = async (req, res) => {
  try {
    const { Page } = getModels();
    const { title, content } = req.body;

    if (!title) {
      return res.status(400).json({ 
        success: false, 
        message: "Title is required" 
      });
    }

    const authorId = getUserId(req);
    if (!authorId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }

    const pageData = {
      title: title.trim(),
      slug: await ensureUniqueSlug(Page, req.body.slug || generateSlug(title) || "untitled-page"),
      content: content || "",
      ast: req.body.ast || {},
      schemaVersion: req.body.schemaVersion || "1",
      excerpt: req.body.excerpt || "",
      status: req.body.status || "draft",
      template: req.body.template || "default",
      showInMenu: req.body.showInMenu !== false,
      order: req.body.order || 0,
      featuredImage: req.body.featuredImage || "",
      metaTitle: req.body.metaTitle || title,
      metaDescription: req.body.metaDescription || "",
      focusKeyword: req.body.focusKeyword || "",
      keywords: req.body.keywords || [],
      canonicalUrl: req.body.canonicalUrl || "",
      ogTitle: req.body.ogTitle || title,
      ogDescription: req.body.ogDescription || "",
      ogImage: req.body.ogImage || req.body.featuredImage || "",
      noIndex: !!req.body.noIndex,
      noFollow: !!req.body.noFollow
    };

    if (getDbType() === "sequelize") {
      pageData.authorId = authorId;
      if (req.body.parentId) pageData.parentId = req.body.parentId;
    } else {
      pageData.author = authorId;
      if (req.body.parentId) pageData.parent = req.body.parentId;
    }

    const page = await Page.create(pageData);

    res.json({ 
      success: true, 
      page,
      message: "Page created successfully" 
    });
  } catch (err) {
    console.error("createPage error:", err);
    
    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ 
        success: false, 
        message: "Page with this slug already exists" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to create page" 
    });
  }
};

exports.updatePage = async (req, res) => {
  try {
    const { Page } = getModels();
    const { id } = req.params;
    let page;

    if (getDbType() === "sequelize") {
      page = await Page.findByPk(id);
      if (!page) {
        return res.status(404).json({ 
          success: false, 
          message: "Page not found" 
        });
      }
      await page.update(req.body);
    } else {
      page = await Page.findByIdAndUpdate(
        id, 
        req.body, 
        { new: true, runValidators: true }
      );
      if (!page) {
        return res.status(404).json({ 
          success: false, 
          message: "Page not found" 
        });
      }
    }

    res.json({ 
      success: true, 
      page,
      message: "Page updated successfully" 
    });
  } catch (err) {
    console.error("updatePage error:", err);
    
    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ 
        success: false, 
        message: "Page with this slug already exists" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to update page" 
    });
  }
};

exports.deletePage = async (req, res) => {
  try {
    const { Page } = getModels();
    const { id } = req.params;
    let deleted;

    if (getDbType() === "sequelize") {
      deleted = await Page.destroy({ where: { id } });
      if (!deleted) {
        return res.status(404).json({ 
          success: false, 
          message: "Page not found" 
        });
      }
    } else {
      const page = await Page.findByIdAndDelete(id);
      if (!page) {
        return res.status(404).json({ 
          success: false, 
          message: "Page not found" 
        });
      }
    }

    res.json({ 
      success: true,
      message: "Page deleted successfully" 
    });
  } catch (err) {
    console.error("deletePage error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to delete page" 
    });
  }
};

exports.schedulePage = async (req, res) => {
  try {
    const { Page } = getModels();
    const { id } = req.params;
    const { publishAt } = req.body;

    if (!publishAt) {
      return res.status(400).json({ 
        success: false, 
        message: "publishAt date is required" 
      });
    }

    let page;

    if (getDbType() === "sequelize") {
      page = await Page.findByPk(id);
      if (!page) {
        return res.status(404).json({ 
          success: false, 
          message: "Page not found" 
        });
      }
      await page.update({ publishAt, status: "scheduled" });
    } else {
      page = await Page.findByIdAndUpdate(
        id, 
        { publishAt, status: "scheduled" }, 
        { new: true }
      );
      if (!page) {
        return res.status(404).json({ 
          success: false, 
          message: "Page not found" 
        });
      }
    }

    res.json({ 
      success: true, 
      page,
      message: "Page scheduled successfully" 
    });
  } catch (err) {
    console.error("schedulePage error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to schedule page" 
    });
  }
};

/* ================================================
   BULK OPERATIONS
================================================ */

exports.bulkDeletePosts = async (req, res) => {
  try {
    const { Post } = getModels();
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Post IDs array is required" 
      });
    }

    if (getDbType() === "sequelize") {
      await Post.destroy({ where: { id: ids } });
    } else {
      await Post.deleteMany({ _id: { $in: ids } });
    }

    res.json({ 
      success: true,
      message: `${ids.length} posts deleted successfully`,
      count: ids.length
    });
  } catch (err) {
    console.error("bulkDeletePosts error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to delete posts" 
    });
  }
};

exports.bulkUpdatePostStatus = async (req, res) => {
  try {
    const { Post } = getModels();
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Post IDs array is required" 
      });
    }

    if (!status) {
      return res.status(400).json({ 
        success: false, 
        message: "Status is required" 
      });
    }

    if (getDbType() === "sequelize") {
      await Post.update({ status }, { where: { id: ids } });
    } else {
      await Post.updateMany({ _id: { $in: ids } }, { status });
    }

    res.json({ 
      success: true,
      message: `${ids.length} posts updated successfully`,
      count: ids.length
    });
  } catch (err) {
    console.error("bulkUpdatePostStatus error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to update posts" 
    });
  }
};
/* ================================================
   QUICK EDIT ENDPOINTS
================================================ */

/**
 * Quick edit for Categories (e.g., name, slug, color, order, parentId)
 */
exports.quickEditCategory = async (req, res) => {
  try {
    const { Category } = getModels();
    const { id } = req.params;
    const updates = req.body;

    // Allowed fields for quick edit
    const allowedFields = ['name', 'slug', 'color', 'icon', 'order', 'parentId', 'parent'];
    const filteredUpdates = {};

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key === 'parentId' && getDbType() === 'mongoose' ? 'parent' : key] = updates[key];
      }
    }

    // Special: auto-generate slug if name changed and slug not provided
    if (updates.name && !updates.slug) {
      filteredUpdates.slug = generateSlug(updates.name);
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update"
      });
    }

    let category;

    if (getDbType() === "sequelize") {
      category = await Category.findByPk(id);
      if (!category) {
        return res.status(404).json({ success: false, message: "Category not found" });
      }
      await category.update(filteredUpdates);
      category = await Category.findByPk(id); // reload
    } else {
      category = await Category.findByIdAndUpdate(
        id,
        filteredUpdates,
        { new: true, runValidators: true }
      );
      if (!category) {
        return res.status(404).json({ success: false, message: "Category not found" });
      }
    }

    res.json({
      success: true,
      category,
      message: "Category quick updated successfully"
    });
  } catch (err) {
    console.error("quickEditCategory error:", err);

    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        success: false,
        message: "Slug already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: err.message || "Failed to quick update category"
    });
  }
};

/**
 * Quick edit for Posts (e.g., title, status, categories, publishDate)
 */
exports.quickEditPost = async (req, res) => {
  try {
    const { Post } = getModels();
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = ['title', 'slug', 'status', 'categories', 'publishDate', 'featuredImage'];
    const filteredUpdates = {};

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    if (updates.title && !updates.slug) {
      filteredUpdates.slug = generateSlug(updates.title);
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update"
      });
    }

    let post;

    if (getDbType() === "sequelize") {
      post = await Post.findByPk(id);
      if (!post) {
        return res.status(404).json({ success: false, message: "Post not found" });
      }
      await post.update(filteredUpdates);

      if (updates.categories && post.setCategories) {
        await post.setCategories(updates.categories);
      }

      post = await Post.findByPk(id, {
        include: [{ association: "authorData", attributes: ["id", "username", "fullName", "avatar"] }]
      });
    } else {
      post = await Post.findByIdAndUpdate(
        id,
        filteredUpdates,
        { new: true, runValidators: true }
      )
      .populate("author", "username fullName avatar")
      .populate("categories", "name slug color");

      if (!post) {
        return res.status(404).json({ success: false, message: "Post not found" });
      }
    }

    res.json({
      success: true,
      post,
      message: "Post quick updated successfully"
    });
  } catch (err) {
    console.error("quickEditPost error:", err);

    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        success: false,
        message: "Slug already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: err.message || "Failed to quick update post"
    });
  }
};

/**
 * Quick edit for Pages (e.g., title, slug, status, order, showInMenu)
 */
exports.quickEditPage = async (req, res) => {
  try {
    const { Page } = getModels();
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = ['title', 'slug', 'status', 'order', 'showInMenu', 'template', 'parentId', 'parent'];
    const filteredUpdates = {};

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        const fieldKey = (key === 'parentId' && getDbType() === 'mongoose') ? 'parent' : key;
        filteredUpdates[fieldKey] = updates[key];
      }
    }

    if (updates.title && !updates.slug) {
      filteredUpdates.slug = generateSlug(updates.title);
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update"
      });
    }

    let page;

    if (getDbType() === "sequelize") {
      page = await Page.findByPk(id);
      if (!page) {
        return res.status(404).json({ success: false, message: "Page not found" });
      }
      await page.update(filteredUpdates);
      page = await Page.findByPk(id);
    } else {
      page = await Page.findByIdAndUpdate(
        id,
        filteredUpdates,
        { new: true, runValidators: true }
      ).populate("author", "username fullName");

      if (!page) {
        return res.status(404).json({ success: false, message: "Page not found" });
      }
    }

    res.json({
      success: true,
      page,
      message: "Page quick updated successfully"
    });
  } catch (err) {
    console.error("quickEditPage error:", err);

    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        success: false,
        message: "Slug already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: err.message || "Failed to quick update page"
    });
  }
};

// ===============================
// 🧩 SEO ANALYSIS (server-side)
// ===============================
function serverAnalyzeSEO(htmlContent = '', title = '', metaDescription = '', focusKeyword = ''){
  const doc = new (require('jsdom').JSDOM)(htmlContent || '<body></body>');
  const text = doc.window.document.body.textContent || '';
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const suggestions = [];
  const scoreParts = {title:0, meta:0, headings:0, images:0, keyword:0, length:0};

  if (title.length >= 30 && title.length <= 60) { scoreParts.title = 20; } else { suggestions.push('Title length should be 30–60 characters'); }
  if (metaDescription.length >= 120 && metaDescription.length <= 160) { scoreParts.meta = 20; } else { suggestions.push('Meta description should be 120–160 characters'); }
  const hCount = (htmlContent.match(/<h[1-6]/gi) || []).length;
  if (hCount > 0) { scoreParts.headings = 15; } else { suggestions.push('Add at least one heading (H1/H2)'); }
  const imgCount = (htmlContent.match(/<img /gi) || []).length;
  if (imgCount > 0) { scoreParts.images = Math.min(10, imgCount*5); } else { suggestions.push('Add at least one image with alt text'); }
  if (focusKeyword){
    const k = focusKeyword.trim().toLowerCase();
    const kwCount = words.filter(w => w.toLowerCase().includes(k)).length;
    const density = wordCount ? (kwCount/wordCount)*100 : 0;
    if (density > 0 && density < 3) { scoreParts.keyword = 20; } else if (density >=3 && density <=6) { scoreParts.keyword = 25; } else { suggestions.push('Adjust focus keyword frequency (aim ~1–3%)'); }
  } else { suggestions.push('Set a focus keyword for better targeting'); }
  if (wordCount >= 600) { scoreParts.length = 20; } else { suggestions.push('Consider longer content (600+ words)'); }

  const score = Object.values(scoreParts).reduce((a,b)=>a+b,0);
  return { score: Math.round(score), scoreParts, suggestions, wordCount };
}

exports.analyzeSEO = async (req, res) => {
  try{
    const { content = '', title = '', metaDescription = '', focusKeyword = '' } = req.body || {};
    const report = serverAnalyzeSEO(content, title, metaDescription, focusKeyword);
    return res.json({ success: true, report });
  }catch(err){
    console.error('analyzeSEO error', err);
    return res.status(500).json({ success: false, message: 'Analyze failed' });
  }
};

// ===============================
// 🧩 EDITOR — Save/Load full JSON content
// ===============================

// Save full editor JSON content to post/page
exports.saveEditorContent = async (req, res) => {
  try {
    const models = getModels();
    const { id } = req.params;
    const { content, title, status, postType, meta, seo } = req.body;

    if (!content || !content.json) {
      return res.status(400).json({ success: false, message: "content.json is required" });
    }

    const Model = postType === "page" ? models.Page : models.Post;
    if (!Model) return res.status(503).json({ error: "Content model not available" });

    const dbType = getDbType();
    let document;

    // Prepare content object. html/raw are DERIVED from json through the
    // public renderer whenever the client does not supply them (and even when
    // it does, an absent json-derived html is repaired). This keeps
    // content.html authoritative for layouts that prefer it and feeds the
    // readingTime hook + SEO analyzer with real data.
    let derivedHtml = "";
    let derivedRaw = "";
    try {
      const parsedJson = typeof content.json === "string"
        ? JSON.parse(content.json)
        : content.json;
      if (parsedJson) {
        derivedHtml = renderDocument(parsedJson) || "";
        derivedRaw = extractTextFromDocument(parsedJson) || "";
      }
    } catch (deriveErr) {
      console.warn("[Editor] html/raw derivation failed:", deriveErr.message);
    }

    const contentObj = {
      json: content.json,
      html: content.html || derivedHtml,
      raw: content.raw || derivedRaw,
      conditionalJS: content.conditionalJS || null,
    };

    const updateData = { content: contentObj };

    if (title !== undefined) updateData.title = title;
    if (status !== undefined) updateData.status = status;

    // Post metadata
    if (meta) {
      if (meta.slug !== undefined) updateData.slug = meta.slug;
      if (meta.excerpt !== undefined) updateData.excerpt = meta.excerpt;
      if (meta.featuredImage !== undefined) updateData.featuredImage = meta.featuredImage;
      if (meta.featuredImageAlt !== undefined) updateData.featuredImageAlt = meta.featuredImageAlt;
      if (meta.categories !== undefined) updateData.categories = meta.categories;
      if (meta.tags !== undefined) updateData.tags = meta.tags;
      if (meta.publishDate !== undefined) updateData.publishDate = meta.publishDate;
      if (meta.allowComments !== undefined) updateData.allowComments = meta.allowComments;
      if (meta.template !== undefined) updateData.template = meta.template;
      if (meta.parent !== undefined) updateData.parent = meta.parent;
      if (meta.order !== undefined) updateData.order = meta.order;
      if (meta.showInMenu !== undefined) updateData.showInMenu = meta.showInMenu;
    }

    // SEO metadata
    if (seo) {
      if (seo.metaTitle !== undefined) updateData.metaTitle = seo.metaTitle;
      if (seo.metaDescription !== undefined) updateData.metaDescription = seo.metaDescription;
      if (seo.focusKeyword !== undefined) updateData.focusKeyword = seo.focusKeyword;
      if (seo.keywords !== undefined) updateData.keywords = seo.keywords;
      if (seo.canonicalUrl !== undefined) updateData.canonicalUrl = seo.canonicalUrl;
      if (seo.noIndex !== undefined) updateData.noIndex = seo.noIndex;
      if (seo.noFollow !== undefined) updateData.noFollow = seo.noFollow;
      if (seo.ogTitle !== undefined) updateData.ogTitle = seo.ogTitle;
      if (seo.ogDescription !== undefined) updateData.ogDescription = seo.ogDescription;
      if (seo.ogImage !== undefined) updateData.ogImage = seo.ogImage;
    }

    if (dbType === "sequelize") {
      document = await Model.findByPk(id);
      if (!document) return res.status(404).json({ success: false, message: "Document not found" });
      await document.update(updateData);
      document = await Model.findByPk(id);
    } else {
      document = await Model.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      );
      if (!document) return res.status(404).json({ success: false, message: "Document not found" });
    }

    // Create revision snapshot (backend-agnostic: mongoose chain vs sequelize options).
    try {
      const Revision = models.Revision;
      if (Revision) {
        const docType = postType || "post";
        let nextNum = 1;
        if (dbType === "sequelize") {
          const lastRev = await Revision.findOne({
            where: { documentId: id, documentType: docType },
            order: [["revisionNumber", "DESC"]],
          });
          nextNum = lastRev ? (lastRev.revisionNumber || 0) + 1 : 1;
        } else {
          const lastRev = await Revision.findOne({ documentId: id, documentType: docType })
            .sort({ revisionNumber: -1 })
            .lean();
          nextNum = lastRev ? (lastRev.revisionNumber || 0) + 1 : 1;
        }
        await Revision.create({
          documentId: id,
          documentType: docType,
          content: contentObj,
          title: document.title,
          status: document.status,
          revisionNumber: nextNum,
          createdBy: getUserId(req),
        });
      }
    } catch (revErr) {
      console.warn("[Editor] Revision snapshot failed:", revErr.message);
    }

    res.json({
      success: true,
      document,
      message: "Content saved successfully",
    });
  } catch (err) {
    console.error("[Editor] saveEditorContent error:", err);
    res.status(500).json({ success: false, message: "Failed to save editor content" });
  }
};

// Load post/page with full JSON content for editor
exports.loadEditorContent = async (req, res) => {
  try {
    const models = getModels();
    const { id } = req.params;
    const postType = req.query.type || "post";

    const Model = postType === "page" ? models.Page : models.Post;
    if (!Model) return res.status(503).json({ error: "Content model not available" });

    const dbType = getDbType();
    if (!isValidDocumentId(id, dbType)) {
      return res.status(400).json({ success: false, message: "Invalid document id" });
    }
    let document;

    if (dbType === "sequelize") {
      document = await Model.findByPk(id);
    } else {
      document = await Model.findById(id)
        .populate("author", "username fullName")
        .populate("categories", "name slug")
        .lean();
    }

    if (!document) return res.status(404).json({ success: false, message: "Document not found" });

    // Parse JSON content
    let jsonContent = null;
    try {
      const raw = document.content?.json;
      jsonContent = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      jsonContent = null;
    }

    res.json({
      success: true,
      document: {
        id: document.id || document._id,
        title: document.title,
        slug: document.slug,
        status: document.status,
        content: {
          json: jsonContent,
          html: document.content?.html || "",
          raw: document.content?.raw || "",
        },
        meta: {
          excerpt: document.excerpt || "",
          featuredImage: document.featuredImage || null,
          featuredImageAlt: document.featuredImageAlt || "",
          categories: document.categories || [],
          tags: document.tags || [],
          publishDate: document.publishDate || null,
          author: document.author || null,
          allowComments: document.allowComments,
          template: document.template || null,
          parent: document.parent || null,
          order: document.order || 0,
          showInMenu: document.showInMenu || false,
        },
        seo: {
          metaTitle: document.metaTitle || "",
          metaDescription: document.metaDescription || "",
          focusKeyword: document.focusKeyword || "",
          keywords: document.keywords || [],
          canonicalUrl: document.canonicalUrl || "",
          noIndex: document.noIndex || false,
          noFollow: document.noFollow || false,
          ogTitle: document.ogTitle || "",
          ogDescription: document.ogDescription || "",
          ogImage: document.ogImage || null,
        },
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
    });
  } catch (err) {
    console.error("[Editor] loadEditorContent error:", err);
    res.status(500).json({ success: false, message: "Failed to load editor content" });
  }
};

// Get editor data: post + widgets + patterns + SEO in single response
exports.getEditorData = async (req, res) => {
  try {
    const models = getModels();
    const { id } = req.params;
    const postType = req.query.type || "post";

    const Model = postType === "page" ? models.Page : models.Post;
    if (!Model) return res.status(503).json({ error: "Content model not available" });

    const dbType = getDbType();
    if (!isValidDocumentId(id, dbType)) {
      return res.status(400).json({ success: false, message: "Invalid document id" });
    }
    let document;

    if (dbType === "sequelize") {
      document = await Model.findByPk(id);
    } else {
      document = await Model.findById(id).lean();
    }

    if (!document) return res.status(404).json({ success: false, message: "Document not found" });

    // Parse JSON content
    let jsonContent = null;
    try {
      const raw = document.content?.json;
      jsonContent = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      jsonContent = null;
    }

    // Fetch widgets and patterns in parallel
    let widgets = [];
    let patterns = [];

    try {
      if (dbType === "sequelize") {
        const [wResult, pResult] = await Promise.all([
          models.Widget ? models.Widget.findAll({ where: { status: "active" }, limit: 100 }) : [],
          models.Pattern ? models.Pattern.findAll({ where: { status: "active" }, limit: 100 }) : [],
        ]);
        widgets = wResult.map((w) => (typeof w.toJSON === "function" ? w.toJSON() : w));
        patterns = pResult.map((p) => (typeof p.toJSON === "function" ? p.toJSON() : p));
      } else {
        const [wResult, pResult] = await Promise.all([
          models.Widget ? models.Widget.find({ status: "active" }).limit(100).lean() : [],
          models.Pattern ? models.Pattern.find({ status: "active" }).limit(100).lean() : [],
        ]);
        widgets = wResult;
        patterns = pResult;
      }
    } catch (fetchErr) {
      console.warn("[Editor] Failed to fetch widgets/patterns:", fetchErr.message);
    }

    // Run SEO analysis
    let seoReport = null;
    try {
      const htmlContent = document.content?.html || "";
      const title = document.metaTitle || document.title || "";
      const metaDescription = document.metaDescription || "";
      const focusKeyword = document.focusKeyword || "";
      seoReport = serverAnalyzeSEO(htmlContent, title, metaDescription, focusKeyword);
    } catch (seoErr) {
      console.warn("[Editor] SEO analysis failed:", seoErr.message);
    }

    res.json({
      success: true,
      data: {
        document: {
          id: document.id || document._id,
          title: document.title,
          slug: document.slug,
          status: document.status,
          content: {
            json: jsonContent,
            html: document.content?.html || "",
            raw: document.content?.raw || "",
          },
          meta: {
            excerpt: document.excerpt || "",
            featuredImage: document.featuredImage || null,
            featuredImageAlt: document.featuredImageAlt || "",
            categories: document.categories || [],
            tags: document.tags || [],
            publishDate: document.publishDate || null,
            author: document.author || null,
            allowComments: document.allowComments,
            template: document.template || null,
            parent: document.parent || null,
            order: document.order || 0,
            showInMenu: document.showInMenu || false,
          },
          seo: {
            metaTitle: document.metaTitle || "",
            metaDescription: document.metaDescription || "",
            focusKeyword: document.focusKeyword || "",
            keywords: document.keywords || [],
            canonicalUrl: document.canonicalUrl || "",
            noIndex: document.noIndex || false,
            noFollow: document.noFollow || false,
            ogTitle: document.ogTitle || "",
            ogDescription: document.ogDescription || "",
            ogImage: document.ogImage || null,
          },
        },
        widgets,
        patterns,
        seoReport,
      },
    });
  } catch (err) {
    console.error("[Editor] getEditorData error:", err);
    res.status(500).json({ success: false, message: "Failed to get editor data" });
  }
};

// ===============================
// 🧩 EDITOR — Revision history
// ===============================
// Revisions are already snapshotted on every save (model hooks + save handler).
// These endpoints expose them to the editor's history panel.

const REVISION_SUMMARY_FIELDS = "id _id documentId documentType title status revisionNumber summary createdBy createdAt";

exports.getRevisions = async (req, res) => {
  try {
    const models = getModels();
    const { id } = req.params;
    const postType = req.query.type || "post";
    const Revision = models.Revision;
    if (!Revision) return res.status(503).json({ success: false, message: "Revisions not available" });

    const dbType = getDbType();
    const where = { documentId: id, documentType: postType };
    let revisions;

    if (dbType === "sequelize") {
      revisions = await Revision.findAll({
        where,
        order: [["revisionNumber", "DESC"]],
        attributes: { exclude: ["content"] },
        limit: 50,
      });
      revisions = revisions.map((r) => (typeof r.toJSON === "function" ? r.toJSON() : r));
    } else {
      revisions = await Revision.find(where)
        .sort({ revisionNumber: -1 })
        .select(REVISION_SUMMARY_FIELDS)
        .limit(50)
        .lean();
    }

    res.json({ success: true, revisions, count: revisions.length });
  } catch (err) {
    console.error("[Editor] getRevisions error:", err);
    res.status(500).json({ success: false, message: "Failed to load revisions" });
  }
};

exports.getRevision = async (req, res) => {
  try {
    const models = getModels();
    const { id, revisionId } = req.params;
    const postType = req.query.type || "post";
    const Revision = models.Revision;
    if (!Revision) return res.status(503).json({ success: false, message: "Revisions not available" });

    const dbType = getDbType();
    if (!isValidDocumentId(revisionId, dbType)) {
      return res.status(400).json({ success: false, message: "Invalid revision id" });
    }
    let revision;
    if (dbType === "sequelize") {
      revision = await Revision.findOne({ where: { id: revisionId, documentId: id, documentType: postType } });
    } else {
      revision = await Revision.findOne({ _id: revisionId, documentId: id, documentType: postType }).lean();
    }

    if (!revision) return res.status(404).json({ success: false, message: "Revision not found" });

    let jsonContent = null;
    try {
      const raw = revision.content?.json;
      jsonContent = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_) {
      jsonContent = null;
    }

    res.json({
      success: true,
      revision: {
        id: revision.id || revision._id,
        revisionNumber: revision.revisionNumber,
        title: revision.title,
        status: revision.status,
        createdAt: revision.createdAt,
        content: { json: jsonContent, html: revision.content?.html || "", raw: revision.content?.raw || "" },
      },
    });
  } catch (err) {
    console.error("[Editor] getRevision error:", err);
    res.status(500).json({ success: false, message: "Failed to load revision" });
  }
};

// Restoring writes the snapshot back onto the live document through the same
// update path as a normal editor save, so hooks (readingTime, new revision)
// behave identically.
exports.restoreRevision = async (req, res) => {
  try {
    const models = getModels();
    const { id, revisionId } = req.params;
    const postType = req.body?.postType || req.query.type || "post";
    const Revision = models.Revision;
    if (!Revision) return res.status(503).json({ success: false, message: "Revisions not available" });

    const Model = postType === "page" ? models.Page : models.Post;
    if (!Model) return res.status(503).json({ error: "Content model not available" });

    const dbType = getDbType();
    let revision;
    if (dbType === "sequelize") {
      revision = await Revision.findOne({ where: { id: revisionId, documentId: id, documentType: postType } });
    } else {
      revision = await Revision.findOne({ _id: revisionId, documentId: id, documentType: postType }).lean();
    }

    if (!revision || !revision.content?.json) {
      return res.status(404).json({ success: false, message: "Revision not found or empty" });
    }

    let parsedJson;
    try {
      parsedJson = typeof revision.content.json === "string"
        ? JSON.parse(revision.content.json)
        : revision.content.json;
    } catch (_) {
      return res.status(400).json({ success: false, message: "Revision content is corrupt" });
    }

    const derivedHtml = renderDocument(parsedJson) || "";
    const derivedRaw = extractTextFromDocument(parsedJson) || "";
    const contentObj = {
      json: revision.content.json,
      html: revision.content.html || derivedHtml,
      raw: revision.content.raw || derivedRaw,
      conditionalJS: revision.content.conditionalJS || null,
    };

    const updateData = { content: contentObj };
    if (revision.title != null) updateData.title = revision.title;

    let document;
    if (dbType === "sequelize") {
      document = await Model.findByPk(id);
      if (!document) return res.status(404).json({ success: false, message: "Document not found" });
      await document.update(updateData);
      document = await Model.findByPk(id);
    } else {
      document = await Model.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true });
      if (!document) return res.status(404).json({ success: false, message: "Document not found" });
    }

    res.json({ success: true, document, message: `Restored revision #${revision.revisionNumber}` });
  } catch (err) {
    console.error("[Editor] restoreRevision error:", err);
    res.status(500).json({ success: false, message: "Failed to restore revision" });
  }
};

// ===============================
// 🧩 EDITOR — Live preview
// ===============================
// CONTRACT (P0-06): JSON in, JSON out. The client POSTs the unsaved draft
// ({ content, title, postType, meta, seo }) and always receives
// `{ success: true, html }` — never a text/html body — so the editor can
// open the rendered page from a blob URL without saving first.
exports.previewEditorContent = async (req, res) => {
  try {
    const models = getModels();
    const { id } = req.params;
    const postType = req.query.type || req.body?.postType || "post";
    const { content, meta, seo } = req.body || {};

    const Model = postType === "page" ? models.Page : models.Post;
    if (!Model) return res.status(503).json({ success: false, message: "Content model not available" });

    // Stored doc may legitimately be missing for brand-new drafts; overlay wins.
    const dbType = getDbType();
    let document = null;
    if (dbType === "sequelize") {
      document = await Model.findByPk(id);
    } else {
      document = await Model.findById(id).lean();
    }
    if (!document && !content?.json) {
      return res.status(404).json({ success: false, message: "Nothing to preview yet" });
    }

    // Resolve the virtual URL exactly like RouteResolver would.
    let routing = {};
    try {
      const { getRoutingSettings } = require("../core/RouteResolver");
      routing = (await getRoutingSettings()).routing || {};
    } catch (_) {}
    const prefix = postType === "page" ? (routing.pagePrefix || "") : (routing.postPrefix || "post");
    const slug = (meta && meta.slug) || generateSlug((req.body?.title ?? document?.title) || "preview") || String(id);
    const virtualUrl = postType === "page" ? `/${slug}`.replace(/^\/+/, "/") : `/${prefix}/${slug}`;

    // Overlay unsaved state onto whatever is stored.
    const overlay = {};
    if (content?.json) {
      let parsedJson;
      try {
        parsedJson = typeof content.json === "string" ? JSON.parse(content.json) : content.json;
      } catch (_) {
        return res.status(400).json({ success: false, message: "Preview content is corrupt" });
      }
      overlay.editorContent = parsedJson;
      overlay.contentHtml = renderDocument(parsedJson) || "";
      overlay.contentRaw = extractTextFromDocument(parsedJson) || "";
    } else {
      overlay.editorContent = null;
      overlay.contentHtml = document?.content?.html || "";
      overlay.contentRaw = document?.content?.raw || "";
    }
    if (req.body?.title != null) overlay.page_title = req.body.title;
    if (seo) {
      overlay.seo = {
        ...(document ? {
          metaTitle: document.metaTitle,
          metaDescription: document.metaDescription,
          focusKeyword: document.focusKeyword,
          canonicalUrl: document.canonicalUrl,
          ogTitle: document.ogTitle,
          ogDescription: document.ogDescription,
          ogImage: document.ogImage,
          noIndex: document.noIndex,
          noFollow: document.noFollow,
        } : {}),
        ...seo,
      };
    }

    const activeLayout = (() => {
      try {
        const Layout = require("../core/layoutHelpers");
        return Layout.getActiveLayout();
      } catch (_) {
        return null;
      }
    })();
    if (!activeLayout) return res.status(503).json({ success: false, message: "No active layout to preview with" });

    // Pin resolution so drafts / renamed slugs / never-published docs resolve.
    const resolution = {
      type: postType,
      template: postType === "page" ? "page" : "post",
      slug,
      params: {},
      context: "preview",
    };

    // Minimal document shape for templates when nothing is stored yet.
    if (postType === "page") {
      overlay.page = {
        ...(document || {}),
        title: req.body?.title ?? document?.title ?? "Untitled Page",
        slug,
        content: { json: overlay.editorContent ?? document?.content?.json ?? null },
      };
    } else {
      overlay.post = {
        ...(document || {}),
        title: req.body?.title ?? document?.title ?? "Untitled Post",
        slug,
        author: document?.author || null,
        categories: document?.categories || [],
        tags: document?.tags || [],
        publishDate: document?.publishDate || new Date().toISOString(),
        readingTime: document?.readingTime || 0,
        featuredImage: (meta && meta.featuredImage) ?? document?.featuredImage ?? null,
        excerpt: (meta && meta.excerpt) ?? document?.excerpt ?? "",
      };
    }

    const PreviewEngineManager = require("../core/PreviewEngineManager");
    const html = await PreviewEngineManager.render(
      global.acrx,
      activeLayout,
      virtualUrl,
      null,
      { __resolution: resolution, ...overlay }
    );

    res.setHeader("X-Robots-Tag", "noindex");
    res.json({ success: true, html });
  } catch (err) {
    console.error("[Editor] previewEditorContent error:", err);
    res.status(500).json({ success: false, message: `Preview failed: ${err.message}` });
  }
};

// GET /editor/:id/preview/page — customizer-parity iframe preview.
// Unlike POST /preview (JSON {html} for unsaved blobs), this returns
// text/html directly so the editor can embed it in an <iframe> exactly
// like /acr/api/layouts/preview?id&url. It renders the last SAVED
// document through the active layout pipeline; callers should save (or
// autosave-flush) first, then load this URL with a cache-buster.
// Query: ?type=post|page&device=desktop|tablet|mobile&t=<ts>
exports.previewEditorPage = async (req, res) => {
  try {
    const models = getModels();
    const { id } = req.params;
    const postType = req.query.type || "post";
    const Model = postType === "page" ? models.Page : models.Post;
    if (!Model) return res.status(503).send("Content model not available");
    const dbType = getDbType();
    let document = null;
    if (dbType === "sequelize") document = await Model.findByPk(id);
    else {
      if (!isValidDocumentId(id, dbType)) return res.status(400).send("Invalid document id");
      document = await Model.findById(id).lean();
    }
    if (!document) return res.status(404).send("Nothing to preview yet — save first");
    let routing = {};
    try {
      const { getRoutingSettings } = require("../core/RouteResolver");
      routing = (await getRoutingSettings()).routing || {};
    } catch (_) {}
    const prefix = postType === "page" ? (routing.pagePrefix || "") : (routing.postPrefix || "post");
    const slug = document.slug || generateSlug(document.title || "") || String(id);
    const virtualUrl = postType === "page" ? `/${slug}`.replace(/^\/+/, "/") : `/${prefix}/${slug}`;
    let parsed = null;
    try {
      const raw = document.content?.json ?? document.content;
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_) { parsed = null; }
    const overlay = {
      editorContent: parsed,
      contentHtml: renderDocument(parsed) || document.content?.html || "",
      contentRaw: extractTextFromDocument(parsed) || document.content?.raw || "",
      page_title: document.title,
      previewDevice: req.query.device || "desktop",
    };
    const activeLayout = (() => {
      try { return require("../core/layoutHelpers").getActiveLayout(); }
      catch (_) { return null; }
    })();
    if (!activeLayout) return res.status(503).send("No active layout to preview with");
    const resolution = { type: postType, template: postType === "page" ? "page" : "post", slug, params: {}, context: "preview" };
    if (postType === "page") {
      overlay.page = { ...(document || {}), title: document.title || "Untitled Page", slug, content: { json: parsed ?? document?.content?.json ?? null } };
    } else {
      overlay.post = { ...(document || {}), title: document.title || "Untitled Post", slug };
    }
    const PreviewEngineManager = require("../core/PreviewEngineManager");
    const html = await PreviewEngineManager.render(global.acrx, activeLayout, virtualUrl, null, { __resolution: resolution, ...overlay });
    res.setHeader("X-Robots-Tag", "noindex");
    res.setHeader("X-Preview-URL", virtualUrl);
    res.setHeader("Cache-Control", "no-store");
    res.type("html").send(html);
  } catch (err) {
    console.error("[Editor] previewEditorPage error:", err);
    res.status(500).send(`Preview failed: ${err.message}`);
  }
};