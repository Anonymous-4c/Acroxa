// src/routes/aiRoutes.js

const express = require("express");
const router  = express.Router();
const { verifyAPIToken } = require("../middlewares/authMiddleware");
const ctrl = require("../controllers/aiController");
const content = require("../controllers/aiContentController");

const PREFIX = "/ai";

// ── Customizer AI suggestion endpoints ────────────────────────────────────────

// POST /acr/api/ai/suggest/identity
router.post("/suggest/identity",      verifyAPIToken, ctrl.suggestIdentity);

// POST /acr/api/ai/suggest/colors
router.post("/suggest/colors",        verifyAPIToken, ctrl.suggestColors);

// POST /acr/api/ai/suggest/typography
router.post("/suggest/typography",    verifyAPIToken, ctrl.suggestTypography);

// POST /acr/api/ai/suggest/layout-config
router.post("/suggest/layout-config", verifyAPIToken, ctrl.suggestLayoutConfig);

// ── Editor content AI endpoints ───────────────────────────────────────────────
// Scoped operations invoked by the Acroxa Editor's AI commands.

// GET  /acr/api/ai/content/status            → capability discovery
router.get("/content/status", verifyAPIToken, content.getStatus);

// POST /acr/api/ai/content/transform         → rewrite/improve/shorten/expand/…
router.post("/content/transform", verifyAPIToken, content.transformText);

// POST /acr/api/ai/content/generate          → new content from a prompt
router.post("/content/generate", verifyAPIToken, content.generateContent);

// POST /acr/api/ai/content/heading           → heading suggestions
router.post("/content/heading", verifyAPIToken, content.generateHeading);

// POST /acr/api/ai/content/excerpt           → post excerpt
router.post("/content/excerpt", verifyAPIToken, content.generateExcerpt);

// POST /acr/api/ai/content/seo-title         → SEO title suggestions
router.post("/content/seo-title", verifyAPIToken, content.generateSeoTitle);

// POST /acr/api/ai/content/meta-description  → meta description suggestions
router.post("/content/meta-description", verifyAPIToken, content.generateMetaDescription);

// POST /acr/api/ai/content/keywords          → focus keyword + keywords
router.post("/content/keywords", verifyAPIToken, content.suggestKeywords);

// POST /acr/api/ai/content/alt-text          → image alt text
router.post("/content/alt-text", verifyAPIToken, content.generateAltText);

// POST /acr/api/ai/content/schema            → schema.org JSON-LD
router.post("/content/schema", verifyAPIToken, content.generateStructuredData);

module.exports = router;
module.exports.PREFIX = PREFIX;