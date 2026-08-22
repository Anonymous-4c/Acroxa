/* src/controllers/profileController.js */
const jwt = require("jsonwebtoken");
const { getConnection } = require("../core/connect-db");
const verifyToken = require("../middlewares/authMiddleware").verifyToken;

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

// Helper: Verify JWT token


/**
 * Get user profile with dashboard stats
 */
const getUserProfile = async (req) => {
  try {
    const { User, Post, Page, Category } = getModels();
    const type = getDbType();

    let targetUsername;

    // Check if username is provided in query string (for searching any user)
    if (req.query.username) {
      targetUsername = req.query.username.trim();
    } 
    // Otherwise use logged-in user from token
    else {
      const decoded = verifyToken(req);
      if (!decoded?.username) {
        throw new Error("Invalid user session");
      }
      targetUsername = decoded.username;
    }

    if (!targetUsername) {
      throw new Error("Username is required");
    }

    // Fetch user (exclude sensitive fields)
    let user;

    if (type === "sequelize") {
      user = await User.findOne({
        where: { username: targetUsername.toLowerCase() },
        attributes: { 
          exclude: ["password", "resetPasswordToken", "resetPasswordExpires", "emailVerificationCode"] 
        }
      });
      
      if (!user) {
        throw new Error(`User "${targetUsername}" not found`);
      }
      
      user = user.toJSON();
      
    } else if (type === "mongoose") {
      user = await User.findOne({ username: targetUsername.toLowerCase() })
        .select("-password -__v -resetPasswordToken -resetPasswordExpires -emailVerificationCode")
        .lean();
      
      if (!user) {
        throw new Error(`User "${targetUsername}" not found`);
      }
      
      user.id = user._id?.toString() || user.id;
    }

    // Get statistics
    const stats = await getPostStats(type, Post, user.id);
    const recentPosts = await getRecentPosts(type, Post, user.id);
    const recentPages = Page ? await getRecentPages(type, Page, user.id) : [];
    const categoryCount = Category ? await getCategoryCount(type, Category) : 0;

    return {
      success: true,
      message: `Profile fetched for user: ${targetUsername}`,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName || user.username,
        avatar: user.avatar || "/acrx/assets/images/default-avatar.png",
        bio: user.bio || "",
        role: user.role || "author",
        jobTitle: user.jobTitle || "",
        location: user.location || "",
        phone: user.phone || "",
        emailVerified: user.emailVerified || false,
        isActive: user.isActive !== false,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      stats: {
        posts: stats,
        pages: recentPages.length,
        categories: categoryCount
      },
      recentPosts,
      recentPages
    };

  } catch (err) {
    console.error("getUserProfile error:", err.message);
    throw err;
  }
};
/**
 * Get post statistics for user
 */
/**
 * Get post statistics for user (Fixed & Optimized)
 */
/**
 * Get post statistics for user - Robust & Debug version
 */
async function getPostStats(type, Post, userId) {
  const stats = { 
    total: 0, 
    published: 0, 
    draft: 0, 
    scheduled: 0, 
    archived: 0, 
    trashed: 0 
  };

  if (!userId) {
    console.warn("getPostStats: No userId provided");
    return stats;
  }

  try {
    console.log(`[Stats Debug] Type: ${type}, userId: ${userId} (${typeof userId})`);

    if (type === "sequelize") {
      // Simple and reliable way
      const allPosts = await Post.findAll({
        where: { authorId: userId },
        attributes: ["status"],
        raw: true
      });

      console.log(`[Sequelize] Found ${allPosts.length} posts for authorId=${userId}`);

      allPosts.forEach(p => {
        stats.total++;
        const status = String(p.status || "draft").toLowerCase().trim();
        if (status in stats) {
          stats[status]++;
        }
      });

    } 
    else if (type === "mongoose") {
      // Convert userId to proper type (very common bug)
      let queryUserId = userId;
      
      // If userId looks like ObjectId string, convert it
      if (typeof userId === 'string' && userId.length === 24) {
        try {
          const mongoose = require('mongoose');
          queryUserId = new mongoose.Types.ObjectId(userId);
        } catch (e) {
          console.warn("Failed to convert userId to ObjectId");
        }
      }

      const query = { author: queryUserId };

      console.log(`[Mongoose] Query:`, query);

      // First: get total count (simple way)
      const totalCount = await Post.countDocuments(query);
      console.log(`[Mongoose] Total posts: ${totalCount}`);

      // Then group by status
      const aggregation = await Post.aggregate([
        { $match: query },
        {
          $group: {
            _id: { $ifNull: ["$status", "draft"] },
            count: { $sum: 1 }
          }
        }
      ]);

      console.log(`[Mongoose] Aggregation result:`, aggregation);

      let calculatedTotal = 0;

      aggregation.forEach(item => {
        const statusKey = String(item._id || "draft").toLowerCase().trim();
        const count = Number(item.count) || 0;

        if (statusKey in stats) {
          stats[statusKey] = count;
        }
        calculatedTotal += count;
      });

      stats.total = calculatedTotal || totalCount;
    }

  } catch (err) {
    console.error("getPostStats ERROR:", err.message);
    console.error(err.stack);   // ← This will show you the real problem
  }

  console.log("[Final Stats]:", stats);
  return stats;
}

/**
 * Get recent posts for dashboard
 */
async function getRecentPosts(type, Post, userId) {
  const recentPosts = [];

  try {
    if (type === "sequelize") {
      const posts = await Post.findAll({
        where: userId ? { authorId: userId } : {},
        attributes: ["id", "title", "slug", "status", "views", "likes", "createdAt", "publishDate"],
        order: [["createdAt", "DESC"]],
        limit: 10,
        raw: true
      });

      posts.forEach(p => {
        recentPosts.push({
          id: p.id,
          title: p.title,
          slug: p.slug,
          status: p.status || "draft",
          views: p.views || 0,
          likes: p.likes || 0,
          date: p.publishDate || p.createdAt
        });
      });

    } else if (type === "mongoose") {
      const query = userId ? { author: userId } : {};
      
      const posts = await Post.find(query)
        .select("id title slug status views likes createdAt publishDate")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      posts.forEach(p => {
        recentPosts.push({
          id: p._id?.toString() || p.id,
          title: p.title,
          slug: p.slug,
          status: p.status || "draft",
          views: p.views || 0,
          likes: p.likes || 0,
          date: p.publishDate || p.createdAt
        });
      });
    }
  } catch (err) {
    console.error("getRecentPosts error:", err);
  }

  return recentPosts;
}

/**
 * Get recent pages for dashboard
 */
async function getRecentPages(type, Page, userId) {
  const recentPages = [];

  try {
    if (type === "sequelize") {
      const pages = await Page.findAll({
        where: userId ? { authorId: userId } : {},
        attributes: ["id", "title", "slug", "status", "template", "createdAt"],
        order: [["createdAt", "DESC"]],
        limit: 5,
        raw: true
      });

      pages.forEach(p => {
        recentPages.push({
          id: p.id,
          title: p.title,
          slug: p.slug,
          status: p.status || "draft",
          template: p.template || "default",
          date: p.createdAt
        });
      });

    } else if (type === "mongoose") {
      const query = userId ? { author: userId } : {};
      
      const pages = await Page.find(query)
        .select("id title slug status template createdAt")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      pages.forEach(p => {
        recentPages.push({
          id: p._id?.toString() || p.id,
          title: p.title,
          slug: p.slug,
          status: p.status || "draft",
          template: p.template || "default",
          date: p.createdAt
        });
      });
    }
  } catch (err) {
    console.error("getRecentPages error:", err);
  }

  return recentPages;
}

/**
 * Get total category count
 */
async function getCategoryCount(type, Category) {
  let count = 0;

  try {
    if (type === "sequelize") {
      count = await Category.count();
    } else if (type === "mongoose") {
      count = await Category.countDocuments();
    }
  } catch (err) {
    console.error("getCategoryCount error:", err);
  }

  return count;
}

/**
 * Update user profile
 */
const updateUserProfile = async (req) => {
  try {
    const { User } = getModels();
    
    // Verify token
    const decoded = verifyToken(req);
    const type = getDbType();
    
    const { fullName, bio, avatar, jobTitle, location, phone } = req.body;

    let user;

    if (type === "sequelize") {
      user = await User.findOne({ where: { username: decoded.username } });
      
      if (!user) {
        throw new Error("User not found");
      }

      const updateData = {};
      if (fullName !== undefined) updateData.fullName = fullName;
      if (bio !== undefined) updateData.bio = bio;
      if (avatar !== undefined) updateData.avatar = avatar;
      if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
      if (location !== undefined) updateData.location = location;
      if (phone !== undefined) updateData.phone = phone;

      await user.update(updateData);
      user = user.toJSON();

    } else if (type === "mongoose") {
      const updateData = {};
      if (fullName !== undefined) updateData.fullName = fullName;
      if (bio !== undefined) updateData.bio = bio;
      if (avatar !== undefined) updateData.avatar = avatar;
      if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
      if (location !== undefined) updateData.location = location;
      if (phone !== undefined) updateData.phone = phone;

      user = await User.findOneAndUpdate(
        { username: decoded.username },
        updateData,
        { new: true, runValidators: true }
      ).select("-password -__v -resetPasswordToken -resetPasswordExpires -emailVerificationCode")
       .lean();

      if (!user) {
        throw new Error("User not found");
      }

      user.id = user._id?.toString() || user.id;
    }

    return {
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        bio: user.bio,
        jobTitle: user.jobTitle,
        location: user.location,
        phone: user.phone,
        role: user.role
      }
    };

  } catch (err) {
    console.error("updateUserProfile error:", err.message);
    throw err;
  }
};

/**
 * Change user password
 */
const changePassword = async (req) => {
  try {
    const { User } = getModels();
    
    // Verify token
    const decoded = verifyToken(req);
    const type = getDbType();
    
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      throw new Error("All password fields are required");
    }

    if (newPassword !== confirmPassword) {
      throw new Error("New passwords do not match");
    }

    if (newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    // Fetch user with password
    let user;

    if (type === "sequelize") {
      user = await User.findOne({ where: { username: decoded.username } });
    } else if (type === "mongoose") {
      user = await User.findOne({ username: decoded.username }).select("+password");
    }

    if (!user) {
      throw new Error("User not found");
    }

    // Verify current password
    const { verifyPassword, hashPassword } = require("./authController");
    const isMatch = await verifyPassword(user.password, currentPassword);

    if (!isMatch) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    if (type === "sequelize") {
      await user.update({ password: hashedPassword });
    } else if (type === "mongoose") {
      user.password = hashedPassword;
      await user.save();
    }

    return {
      success: true,
      message: "Password changed successfully"
    };

  } catch (err) {
    console.error("changePassword error:", err.message);
    throw err;
  }
};

/**
 * Get user activity log
 */
const getUserActivity = async (req) => {
  try {
    const { User, Post, Page } = getModels();
    
    // Verify token
    const decoded = verifyToken(req);
    const type = getDbType();

    // Fetch user
    let user;

    if (type === "sequelize") {
      user = await User.findOne({ where: { username: decoded.username } });
    } else if (type === "mongoose") {
      user = await User.findOne({ username: decoded.username });
    }

    if (!user) {
      throw new Error("User not found");
    }

    const userId = user.id || user._id?.toString();

    // Get activity data
    const activity = {
      recentPosts: await getRecentPosts(type, Post, userId),
      recentPages: Page ? await getRecentPages(type, Page, userId) : [],
      loginHistory: {
        lastLogin: user.lastLogin,
        firstLogin: user.firstLogin
      }
    };

    return {
      success: true,
      activity
    };

  } catch (err) {
    console.error("getUserActivity error:", err.message);
    throw err;
  }
};
const deleteUserAccount = async (req) => {
  try {
    const { User } = getModels();
    const type = getDbType();
    
    const decoded = verifyToken(req);
    const { userId, username } = req.body; // For admin deletion

    let targetUserId;
    let isAdminDeleting = false;

    // Check if admin is deleting another user
    if ((userId || username) && decoded.role === "admin") {
      isAdminDeleting = true;

      if (type === "sequelize") {
        const targetUser = await User.findOne({
          where: userId ? { id: userId } : { username: username?.toLowerCase() }
        });

        if (!targetUser) {
          throw new Error("Target user not found");
        }

        // Prevent deleting admin accounts
        if (targetUser.role === "admin") {
          throw new Error("Admin accounts cannot be deleted");
        }

        targetUserId = targetUser.id;
      } else if (type === "mongoose") {
        const targetUser = await User.findOne(
          userId ? { _id: userId } : { username: username?.toLowerCase() }
        );

        if (!targetUser) {
          throw new Error("Target user not found");
        }

        if (targetUser.role === "admin") {
          throw new Error("Admin accounts cannot be deleted");
        }

        targetUserId = targetUser._id;
      }
    } 
    // Self deletion
    else {
      targetUserId = decoded.id || decoded.userId;
      
      // Double-check user exists and is not admin (extra safety)
      let currentUser;
      if (type === "sequelize") {
        currentUser = await User.findOne({ where: { id: targetUserId } });
      } else {
        currentUser = await User.findOne({ _id: targetUserId });
      }

      if (!currentUser) throw new Error("User not found");
      if (currentUser.role === "admin") {
        throw new Error("Admin accounts cannot be deleted");
      }
    }

    if (!targetUserId) {
      throw new Error("Unable to determine target user");
    }

    // Perform deletion
    if (type === "sequelize") {
      const deleted = await User.destroy({ where: { id: targetUserId } });
      if (!deleted) throw new Error("Failed to delete user");
    } else if (type === "mongoose") {
      const deleted = await User.findByIdAndDelete(targetUserId);
      if (!deleted) throw new Error("Failed to delete user");
    }

    return {
      success: true,
      message: isAdminDeleting 
        ? "User account deleted successfully by admin" 
        : "Your account has been deleted successfully"
    };

  } catch (err) {
    console.error("deleteUserAccount error:", err.message);
    throw err;
  }
};

/**
 * Get all users (Admin only)
 */
const getAllUsers = async (req) => {
  try {
    const { User } = getModels();
    const type = getDbType();

    // Only admin can access this
    const decoded = verifyToken(req);
    if (decoded.role !== "admin") {
      throw new Error("Access denied. Admin privileges required.");
    }

    let users = [];

    if (type === "sequelize") {
      users = await User.findAll({
        attributes: { 
          exclude: ["password", "resetPasswordToken", "resetPasswordExpires", "emailVerificationCode"] 
        },
        order: [["createdAt", "DESC"]]
      });

      users = users.map(user => user.toJSON());

    } else if (type === "mongoose") {
      users = await User.find({})
        .select("-password -__v -resetPasswordToken -resetPasswordExpires -emailVerificationCode")
        .sort({ createdAt: -1 })
        .lean();

      users = users.map(user => ({
        ...user,
        id: user._id?.toString() || user.id
      }));
    }

    return {
      success: true,
      message: "Users fetched successfully",
      count: users.length,
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName || user.username,
        avatar: user.avatar || "/acrx/assets/images/default-avatar.png",
        role: user.role || "author",
        jobTitle: user.jobTitle || "",
        location: user.location || "",
        phone: user.phone || "",
        emailVerified: user.emailVerified || false,
        isActive: user.isActive !== false,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }))
    };

  } catch (err) {
    console.error("getAllUsers error:", err.message);
    throw err;
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  changePassword,
  getUserActivity,
  deleteUserAccount,
  getAllUsers
};