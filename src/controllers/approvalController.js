// src/controllers/approvalController.js

const { verifyAPIToken, requireRoles } = require("../middlewares/authMiddleware");

// Get models dynamically based on DB type
const getModels = async () => {
  const { connectDB } = require("../core/connect-db");
  return await connectDB();
};

// ====================== CREATE APPROVAL REQUEST ======================
const createApproval = async (req, res) => {
  try {
    const { type, fileName, oldName, newName, reason, actionApi } = req.body;
    const userId = req.user.id || req.user._id;

    if (!type || !fileName || !actionApi) {
      return res.status(400).json({
        success: false,
        message: "type, fileName, and actionApi are required"
      });
    }

    const models = await getModels();
    const Approval = models.Approval;

    const approval = await Approval.create({
      type,
      requestedBy: userId,
      fileName,
      oldName: type === "rename" ? oldName : null,
      newName: type === "rename" ? newName : null,
      reason: reason || "",
      actionApi,
      status: "pending"
    });

    res.json({
      success: true,
      message: `Your ${type} request has been sent to the administrator for approval.`,
      approvalId: approval.id || approval._id,
      status: "pending"
    });
  } catch (err) {
    console.error("[Approval] Create error:", err);
    res.status(500).json({ success: false, message: "Failed to create approval request" });
  }
};
// ====================== GET ALL APPROVALS (Admin Only) ======================
const getAllApprovals = async (req, res) => {
  try {
    const models = await getModels();
    const Approval = models.Approval;

    // Optional query filters (powerful for dashboard)
    const { status, type, page = 1, limit = 20 } = req.query;

    let query = {};

    if (status) query.status = status; // pending, approved, rejected
    if (type) query.type = type;

    // Support both Sequelize & Mongoose style
    let approvals;

    if (Approval.findAll) {
      // Sequelize
      approvals = await Approval.findAll({
        where: query,
        limit: parseInt(limit),
        offset: (page - 1) * limit,
        order: [["createdAt", "DESC"]]
      });
    } else {
      // Mongoose
      approvals = await Approval.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    }

    res.json({
      success: true,
      count: approvals.length,
      page: parseInt(page),
      approvals
    });

  } catch (err) {
    console.error("[Approval] Get all error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch approvals"
    });
  }
};

// ====================== GET PENDING APPROVALS (Admin Only) ======================
const getPendingApprovals = async (req, res) => {
  try {
    const models = await getModels();
    const Approval = models.Approval;

    const approvals = await Approval.findPending();

    res.json({ success: true, approvals });
  } catch (err) {
    console.error("[Approval] List error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch pending approvals" });
  }
};

// ====================== REVIEW APPROVAL (Admin Only) ======================
const reviewApproval = async (req, res) => {
  try {
    const { approvalId, action, reviewNote } = req.body; // action = "approve" | "reject"
    const adminId = req.user.id || req.user._id;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid action. Use 'approve' or 'reject'" });
    }

    const models = await getModels();
    const Approval = models.Approval;

    const approval = await Approval.findByIdAndPopulate(approvalId);
    if (!approval) {
      return res.status(404).json({ success: false, message: "Approval request not found" });
    }

    if (approval.status !== "pending") {
      return res.status(400).json({ success: false, message: "This request has already been processed" });
    }

    await approval.markAsReviewed(adminId, action, reviewNote || "");

    res.json({
      success: true,
      message: `Request ${action}d successfully by admin.`,
      status: action === "approve" ? "approved" : "rejected",
      approvalId: approval.id || approval._id,
      actionApi: approval.actionApi,
      fileName: approval.fileName
    });
  } catch (err) {
    console.error("[Approval] Review error:", err);
    res.status(500).json({ success: false, message: "Failed to review approval" });
  }
};

module.exports = {
  createApproval,
  getPendingApprovals,
  getAllApprovals,
  reviewApproval
};