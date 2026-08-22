// src/routes/cmsRoutes.js
const express = require("express");
const router = express.Router();
const cms = require("../controllers/cmsController");
const { verifyAPIToken, requireRoles, checkOwnership, attachAuthId } = require("../middlewares/authMiddleware");

// ===============================
// 🧩 CATEGORY ROUTES
// ===============================
router.post("/categories", verifyAPIToken, cms.createCategory);
router.get("/categories", attachAuthId, cms.getCategories);
router.get("/categories/:id", attachAuthId, cms.getCategory);                          // Single category
router.patch("/categories/:id/quick", verifyAPIToken, cms.quickEditCategory);
router.put("/categories/:id", verifyAPIToken, cms.updateCategory);
router.delete("/categories/:id", verifyAPIToken, cms.deleteCategory);

// ===============================
// 🧩 POST ROUTES
// ===============================
// ======================= POSTS ROUTES =======================
router.post("/posts", 
  verifyAPIToken, 
  // No ownership or role check needed for CREATE
  cms.createPost
);

// GET routes remain the same (public or attachAuthId only)
router.get("/posts", attachAuthId, cms.getPosts);
router.get("/posts/:id", attachAuthId, cms.getPost);
router.get("/posts/status/:status", verifyAPIToken, async (req, res) => {
  req.query.status = req.params.status;
  cms.getPosts(req, res);
});

// === Protected + Ownership routes for Posts ===
router.patch("/posts/:id/quick", 
  verifyAPIToken, 
  requireRoles(["author", "editor", "admin"]),   // Allow multiple roles
  checkOwnership("post", "id"),                  // Only authors are checked for ownership
  cms.quickEditPost
);

router.put("/posts/:id", 
  verifyAPIToken, 
  requireRoles(["author", "editor", "admin"]),
  checkOwnership("post", "id"),
  cms.updatePost
);

router.delete("/posts/:id", 
  verifyAPIToken, 
  requireRoles(["author", "editor", "admin"]),
  checkOwnership("post", "id"),
  cms.deletePost
);

router.post("/posts/:id/schedule", 
  verifyAPIToken, 
  requireRoles(["author", "editor", "admin"]),
  checkOwnership("post", "id"),
  cms.schedulePost
);

// Bulk operations - usually only editors/admins (no ownership check)
router.delete("/posts/bulk", 
  verifyAPIToken, 
  requireRoles(["editor", "admin"]),   // authors usually cannot bulk delete
  cms.bulkDeletePosts
);

router.patch("/posts/bulk", 
  verifyAPIToken, 
  requireRoles(["editor", "admin"]),
  cms.bulkUpdatePostStatus
);
// ===============================
// 🧩 PAGE ROUTES
// ===============================
// ======================= PAGES ROUTES =======================
router.post("/pages", verifyAPIToken, cms.createPage);

router.get("/pages", attachAuthId, cms.getPages);
router.get("/pages/:id", attachAuthId, cms.getPage);
router.get("/pages/status/:status", verifyAPIToken, async (req, res) => {
  req.query.status = req.params.status;
  cms.getPages(req, res);
});

router.patch("/pages/:id/quick", 
  verifyAPIToken, 
  requireRoles(["author", "editor", "admin"]),
  checkOwnership("page", "id"),     // Change resourceKey to "page"
  cms.quickEditPage
);

router.put("/pages/:id", 
  verifyAPIToken, 
  requireRoles(["author", "editor", "admin"]),
  checkOwnership("page", "id"),
  cms.updatePage
);

router.delete("/pages/:id", 
  verifyAPIToken, 
  requireRoles(["author", "editor", "admin"]),
  checkOwnership("page", "id"),
  cms.deletePage
);

router.post("/pages/:id/schedule", 
  verifyAPIToken, 
  requireRoles(["author", "editor", "admin"]),
  checkOwnership("page", "id"),
  cms.schedulePage
);

// ===============================
// 🧩 SEO - analyze endpoint
// ===============================
router.post('/seo/analyze', verifyAPIToken, cms.analyzeSEO);

// ===============================
// 🧩 EDITOR — Save/Load endpoints
// ===============================
router.get('/editor/:id/data', attachAuthId, cms.getEditorData);
router.get('/editor/:id/content', attachAuthId, cms.loadEditorContent);
router.post('/editor/:id/content', verifyAPIToken, cms.saveEditorContent);

// ===============================
// 🧩 EDITOR — Revisions
// ===============================
router.get('/editor/:id/revisions', attachAuthId, cms.getRevisions);
router.get('/editor/:id/revisions/:revisionId', attachAuthId, cms.getRevision);
router.post('/editor/:id/revisions/:revisionId/restore',
  verifyAPIToken,
  requireRoles(["author", "editor", "admin"]),
  checkOwnership("post", "id"),
  cms.restoreRevision
);

// ===============================
// 🧩 EDITOR — Live preview (renders unsaved draft through the real pipeline)
// ===============================
router.post('/editor/:id/preview', verifyAPIToken, cms.previewEditorContent);

module.exports = router;