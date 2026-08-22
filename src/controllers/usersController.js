// src/controllers/usersController.js

const EventEmitter = require("events");
const userEvents = new EventEmitter();

// ── DB Access ─────────────────────────────────────────────

const getModels = async () => {
  const { connectDB } = require("../core/connect-db");
  return await connectDB();
};

function getUserModel() {
  return getModels().then(models => models.User);
}

// ── Helpers ───────────────────────────────────────────────

const VALID_ROLES = new Set([
  "admin",
  "editor",
  "author",
  "seo",
  "designer",
  "developer",
  "user"
]);

const VALID_STATUS = new Set([
  "active",
  "suspended"
]);

const isValidRole = (r) => VALID_ROLES.has(r);
const isValidStatus = (s) => VALID_STATUS.has(s);

// ── Query Builder ─────────────────────────────────────────

const buildUserQuery = (query = {}) => {
  const q = {};

  if (query.role && isValidRole(query.role)) {
    q.role = query.role;
  }

  if (query.isActive !== undefined) {
    q.isActive = query.isActive === "true" || query.isActive === true;
  }

  if (query.isSuspended !== undefined) {
    q.isSuspended = query.isSuspended === "true" || query.isSuspended === true;
  }

  if (query.search) {
    const s = query.search.trim();
    q.$or = [
      { username: new RegExp(s, "i") },
      { email: new RegExp(s, "i") },
      { fullName: new RegExp(s, "i") }
    ];
  }

  return q;
};

// ── Controllers ───────────────────────────────────────────

// GET USERS (LIST)
const getUsers = async (req, res) => {
  try {
    const models = await getModels();

    const {
      page = 1,
      limit = 20,
      sort = "-createdAt"
    } = req.query;

    const query = buildUserQuery(req.query);

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      models.User.find(query)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),

      models.User.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: users,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error("[Users] getUsers:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users"
    });
  }
};

// GET SINGLE USER
const getUser = async (req, res) => {
  try {
    const models = await getModels();
    const user = await models.User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.json({
      success: true,
      data: user
    });

  } catch (err) {
    console.error("[Users] getUser:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user"
    });
  }
};

// CREATE USER
const createUser = async (req, res) => {
  try {
    const models = await getModels();

    const data = req.body;

    const user = await models.User.createUser(data);

    userEvents.emit("user.created", user);

    return res.json({
      success: true,
      data: user
    });

  } catch (err) {
    console.error("[Users] createUser:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create user"
    });
  }
};

// UPDATE USER
const updateUser = async (req, res) => {
  try {
    const models = await getModels();

    const user = await models.User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    Object.assign(user, req.body);
    await user.save();

    userEvents.emit("user.updated", user);

    return res.json({
      success: true,
      data: user
    });

  } catch (err) {
    console.error("[Users] updateUser:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update user"
    });
  }
};

// DELETE USER
const deleteUser = async (req, res) => {
  try {
    const models = await getModels();

    const user = await models.User.findByIdAndDelete(req.params.id);
    if (user.isDefaultAdmin) {
      return res.status(403).json({
        success: false,
        message: "Cannot delete the default admin user"
      });
    }
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    if(!user.isDefaultAdmin) {
    userEvents.emit("user.deleted", user);
    }
    return res.json({
      success: true,
      message: "User deleted"
    });

  } catch (err) {
    console.error("[Users] deleteUser:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete user"
    });
  }
};

// BULK UPDATE USERS
const bulkUpdateUsers = async (req, res) => {
  try {
    const models = await getModels();

    const { ids = [], update = {} } = req.body;

    if (!ids.length) {
      return res.status(400).json({
        success: false,
        message: "No users selected"
      });
    }

    const result = await models.User.updateMany(
      { _id: { $in: ids } },
      { $set: update }
    );

    userEvents.emit("user.bulkUpdated", { ids, update });

    return res.json({
      success: true,
      modified: result.modifiedCount
    });

  } catch (err) {
    console.error("[Users] bulkUpdate:", err);
    return res.status(500).json({
      success: false,
      message: "Bulk update failed"
    });
  }
};

// SESSION CONTROL (force logout)
const forceLogout = async (req, res) => {
  try {
    const models = await getModels();

    const user = await models.User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    await user.bumpSessionVersion();

    userEvents.emit("user.logoutForced", user);

    return res.json({
      success: true,
      message: "User logged out from all sessions"
    });

  } catch (err) {
    console.error("[Users] forceLogout:", err);
    return res.status(500).json({
      success: false,
      message: "Force logout failed"
    });
  }
};

// STATUS TOGGLE
const toggleStatus = async (req, res) => {
  try {
    const models = await getModels();

    const user = await models.User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const { action } = req.body;

    if (action === "suspend") {
      user.isSuspended = true;
    }

    if (action === "activate") {
      user.isSuspended = false;
      user.isActive = true;
    }

    await user.save();

    userEvents.emit("user.statusChanged", { user, action });

    return res.json({
      success: true,
      data: user
    });

  } catch (err) {
    console.error("[Users] toggleStatus:", err);
    return res.status(500).json({
      success: false,
      message: "Status update failed"
    });
  }
};

// ── EXPORTS ───────────────────────────────────────────────

module.exports = {
  userEvents,
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  bulkUpdateUsers,
  forceLogout,
  toggleStatus
};