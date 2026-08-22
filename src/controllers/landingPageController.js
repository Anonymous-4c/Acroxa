// src/controllers/landingPageController.js
//
// Landing page management.
// Handles CRUD, section block operations, A/B test config, conversion stats.

const { getConnection } = require("../core/connect-db");

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

const generateSlug = (text) =>
  (text || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");

// ── LIST ──────────────────────────────────────────────────────────────────────

exports.getLandingPages = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { status } = req.query;

    let pages;
    if (getDbType() === "sequelize") {
      const where = status ? { status } : {};
      pages = await LandingPage.findAll({
        where,
        order: [["updatedAt", "DESC"]],
        attributes: { exclude: ["sections", "trackingPixels", "customCSS", "customJS"] },
      });
    } else {
      const q = status ? { status } : {};
      pages = await LandingPage.find(q)
        .select("-sections -trackingPixels -customCSS -customJS")
        .sort({ updatedAt: -1 })
        .lean();
    }

    res.json({ success: true, pages, count: pages.length });
  } catch (err) {
    console.error("getLandingPages:", err);
    res.status(500).json({ success: false, message: "Failed to fetch landing pages" });
  }
};

// ── SINGLE ────────────────────────────────────────────────────────────────────

exports.getLandingPage = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;

    let page;
    if (getDbType() === "sequelize") {
      page = await LandingPage.findByPk(id);
    } else {
      page = await LandingPage.findById(id).lean();
    }

    if (!page) return res.status(404).json({ success: false, message: "Landing page not found" });

    res.json({ success: true, page });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CREATE ────────────────────────────────────────────────────────────────────

exports.createLandingPage = async (req, res) => {
  try {
    const { LandingPage } = getModels();

    const authorId = req.body.author || req.user?.id || req.user?._id?.toString();
    if (!authorId) return res.status(401).json({ success: false, message: "Not authenticated" });

    const data = _buildPageData(req.body, authorId);
    const page = await LandingPage.create(data);

    res.json({ success: true, page, message: "Landing page created" });
  } catch (err) {
    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ success: false, message: "Slug already exists" });
    }
    console.error("createLandingPage:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── UPDATE ────────────────────────────────────────────────────────────────────

exports.updateLandingPage = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;

    let page;
    if (getDbType() === "sequelize") {
      page = await LandingPage.findByPk(id);
      if (!page) return res.status(404).json({ success: false, message: "Not found" });
      await page.update(req.body);
    } else {
      page = await LandingPage.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
      if (!page) return res.status(404).json({ success: false, message: "Not found" });
    }

    res.json({ success: true, page });
  } catch (err) {
    if (err.code === 11000 || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ success: false, message: "Slug already exists" });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE ────────────────────────────────────────────────────────────────────

exports.deleteLandingPage = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;

    if (getDbType() === "sequelize") {
      const deleted = await LandingPage.destroy({ where: { id } });
      if (!deleted) return res.status(404).json({ success: false, message: "Not found" });
    } else {
      const page = await LandingPage.findByIdAndDelete(id);
      if (!page) return res.status(404).json({ success: false, message: "Not found" });
    }

    res.json({ success: true, message: "Landing page deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── SECTION BLOCKS ────────────────────────────────────────────────────────────

// POST /landing-pages/:id/sections   { type, label, data, order }
exports.addSection = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;
    const block = req.body;

    if (!block.type) return res.status(400).json({ success: false, message: "Block type required" });

    let page;
    if (getDbType() === "sequelize") {
      page = await LandingPage.findByPk(id);
      if (!page) return res.status(404).json({ success: false, message: "Not found" });

      const sections = [...(page.sections || []), block];
      await page.update({ sections });
      page = await LandingPage.findByPk(id);
    } else {
      page = await LandingPage.findByIdAndUpdate(
        id,
        { $push: { sections: block } },
        { new: true }
      );
    }

    res.json({ success: true, sections: page.sections });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /landing-pages/:id/sections/:blockId
exports.updateSection = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id, blockId } = req.params;

    if (getDbType() === "mongoose") {
      const page = await LandingPage.findOneAndUpdate(
        { _id: id, "sections._id": blockId },
        { $set: { "sections.$": { ...req.body, _id: blockId } } },
        { new: true }
      );
      if (!page) return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true, sections: page.sections });
    }

    // Sequelize: full sections array replace
    const page = await LandingPage.findByPk(id);
    if (!page) return res.status(404).json({ success: false, message: "Not found" });

    const sections = (page.sections || []).map(s =>
      String(s.id || s._id) === String(blockId) ? { ...s, ...req.body } : s
    );
    await page.update({ sections });
    res.json({ success: true, sections });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /landing-pages/:id/sections/:blockId
exports.deleteSection = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id, blockId } = req.params;

    if (getDbType() === "mongoose") {
      const page = await LandingPage.findByIdAndUpdate(
        id,
        { $pull: { sections: { _id: blockId } } },
        { new: true }
      );
      if (!page) return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true, sections: page.sections });
    }

    const page = await LandingPage.findByPk(id);
    if (!page) return res.status(404).json({ success: false, message: "Not found" });

    const sections = (page.sections || []).filter(s =>
      String(s.id || s._id) !== String(blockId)
    );
    await page.update({ sections });
    res.json({ success: true, sections });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /landing-pages/:id/sections/reorder   { order: [blockId, ...] }
exports.reorderSections = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;
    const { order } = req.body; // array of block IDs in desired order

    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, message: "order must be an array of block IDs" });
    }

    let page;
    if (getDbType() === "sequelize") {
      page = await LandingPage.findByPk(id);
    } else {
      page = await LandingPage.findById(id).lean();
    }

    if (!page) return res.status(404).json({ success: false, message: "Not found" });

    const blocksById = Object.fromEntries(
      (page.sections || []).map(s => [String(s._id || s.id), s])
    );

    const reordered = order
      .filter(bid => blocksById[bid])
      .map((bid, i) => ({ ...blocksById[bid], order: i }));

    if (getDbType() === "sequelize") {
      await page.update({ sections: reordered });
    } else {
      await LandingPage.findByIdAndUpdate(id, { sections: reordered });
    }

    res.json({ success: true, sections: reordered });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A/B TESTING ───────────────────────────────────────────────────────────────

exports.updateABTest = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;

    let page;
    if (getDbType() === "sequelize") {
      page = await LandingPage.findByPk(id);
      if (!page) return res.status(404).json({ success: false, message: "Not found" });
      await page.update({ abTesting: req.body });
    } else {
      page = await LandingPage.findByIdAndUpdate(
        id, { abTesting: req.body }, { new: true }
      );
    }

    res.json({ success: true, abTesting: page.abTesting });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CONVERSION STATS ──────────────────────────────────────────────────────────

// POST /landing-pages/:id/stats/view
exports.recordView = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;

    if (getDbType() === "sequelize") {
      await LandingPage.increment("statsViews", { where: { id } });
    } else {
      await LandingPage.findByIdAndUpdate(id, { $inc: { "stats.views": 1 } });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /landing-pages/:id/stats/conversion
exports.recordConversion = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;

    if (getDbType() === "sequelize") {
      await LandingPage.increment("statsConversions", { where: { id } });
    } else {
      await LandingPage.findByIdAndUpdate(id, { $inc: { "stats.conversions": 1 } });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /landing-pages/:id/stats
exports.getStats = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;

    let page;
    if (getDbType() === "sequelize") {
      page = await LandingPage.findByPk(id, {
        attributes: ["id", "title", "statsViews", "statsConversions"],
      });
    } else {
      page = await LandingPage.findById(id).select("title stats").lean();
    }

    if (!page) return res.status(404).json({ success: false, message: "Not found" });

    const views       = page.statsViews       ?? page.stats?.views       ?? 0;
    const conversions = page.statsConversions ?? page.stats?.conversions ?? 0;

    res.json({
      success: true,
      stats: {
        views,
        conversions,
        conversionRate: views ? ((conversions / views) * 100).toFixed(2) + "%" : "0%",
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUBLISH / UNPUBLISH ───────────────────────────────────────────────────────

exports.publishLandingPage = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;

    const update = { status: "published", publishDate: new Date() };

    let page;
    if (getDbType() === "sequelize") {
      page = await LandingPage.findByPk(id);
      if (!page) return res.status(404).json({ success: false, message: "Not found" });
      await page.update(update);
    } else {
      page = await LandingPage.findByIdAndUpdate(id, update, { new: true });
    }

    res.json({ success: true, page });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DUPLICATE ─────────────────────────────────────────────────────────────────

exports.duplicateLandingPage = async (req, res) => {
  try {
    const { LandingPage } = getModels();
    const { id } = req.params;

    let source;
    if (getDbType() === "sequelize") {
      source = await LandingPage.findByPk(id);
    } else {
      source = await LandingPage.findById(id).lean();
    }

    if (!source) return res.status(404).json({ success: false, message: "Not found" });

    const sourceData = source.toJSON ? source.toJSON() : source;
    delete sourceData.id;
    delete sourceData._id;
    delete sourceData.createdAt;
    delete sourceData.updatedAt;

    sourceData.title       = `${sourceData.title} (Copy)`;
    sourceData.slug        = generateSlug(sourceData.title) + "-" + Date.now();
    sourceData.status      = "draft";
    sourceData.publishDate = null;

    const copy = await LandingPage.create(sourceData);
    res.json({ success: true, page: copy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── INTERNAL ──────────────────────────────────────────────────────────────────

function _buildPageData(body, authorId) {
  const data = {
    title:        (body.title || "").trim(),
    slug:         body.slug || generateSlug(body.title),
    status:       body.status       || "draft",
    template:     body.template     || "landing",
    sections:     body.sections     || [],
    layoutOverrides: body.layoutOverrides || {},
    abTesting:    body.abTesting    || { enabled: false, variants: [], splitMethod: "cookie", cookieTTL: 30 },
    conversionGoal: body.conversionGoal || "",
    goals:        body.goals        || [],
    trackingPixels: body.trackingPixels || [],
    metaTitle:       body.metaTitle       || body.title || "",
    metaDescription: body.metaDescription || "",
    focusKeyword:    body.focusKeyword    || "",
    keywords:        body.keywords        || [],
    canonicalUrl:    body.canonicalUrl    || "",
    ogTitle:         body.ogTitle         || body.title || "",
    ogDescription:   body.ogDescription  || "",
    ogImage:         body.ogImage         || "",
    noIndex:         !!body.noIndex,
    noFollow:        !!body.noFollow,
    customCSS:       body.customCSS || "",
    customJS:        body.customJS  || "",
  };

  if (getDbType() === "sequelize") {
    data.authorId = authorId;
  } else {
    data.author = authorId;
  }

  return data;
}