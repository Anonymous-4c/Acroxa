// src/models/mongo/SessionActivity.js
// Rich session activity tracking: page history, visit count, durations, live status.

const mongoose = require("mongoose");

const PageVisitSchema = new mongoose.Schema({
  page:      { type: String, required: true },
  enteredAt: { type: Date, default: Date.now },
  leftAt:    { type: Date, default: null },
  duration:  { type: Number, default: 0 }  // ms spent on page
}, { _id: false });

const getSchema = () => {
  const schema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    username:     { type: String, required: true },
    avatar:       { type: String, default: "" },
    role:         { type: String, default: "user" },

    // ── Live state ──
    activePage:   { type: String, default: "/" },
    isActive:     { type: Boolean, default: true, index: true },
    lastSeen:     { type: Date, default: Date.now, index: true },
    connectedAt:  { type: Date, default: Date.now },

    // ── Connection info ──
    ip:           { type: String, default: "" },
    userAgent:    { type: String, default: "" },
    sessionId:    { type: String, default: null },

    // ── Rich history ──
    totalVisits:  { type: Number, default: 0 },
    todayVisits:  { type: Number, default: 0 },
    todayResetAt: { type: Date, default: null },
    pageHistory:  { type: [PageVisitSchema], default: [] },
    pagesVisited: { type: [String], default: [] },  // unique pages visited today

    // ── Today stats ──
    actionsToday:    { type: Number, default: 0 },
    pagesViewedToday:{ type: Number, default: 0 },
    totalTimeOnline: { type: Number, default: 0 },  // ms total online time today
  }, { timestamps: true });

  schema.index({ lastSeen: -1 });
  schema.index({ isActive: 1, lastSeen: -1 });

  return schema;
};

const attachMethods = (Model) => {
  // Upsert: called on every session-data poll
  Model.upsertActivity = async (data) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // First, check if user was previously offline (to detect new session)
    const existingDoc = await Model.findOne({ userId: data.userId }).lean();
    const wasOffline = !existingDoc || existingDoc.isActive === false;
    const isNewDay = !existingDoc || !existingDoc.todayResetAt || (existingDoc.todayResetAt && existingDoc.todayResetAt < todayStart);

    const update = {
      $set: {
        username: data.username,
        avatar: data.avatar || "",
        role: data.role || "user",
        activePage: data.activePage || "/",
        lastSeen: now,
        ip: data.ip || "",
        userAgent: data.userAgent || "",
        sessionId: data.sessionId || null,
        isActive: true
      }
    };

    // Reset daily counters if new day
    if (isNewDay) {
      update.$set.todayResetAt = todayStart;
      update.$set.todayVisits = 1;
      update.$set.actionsToday = 0;
      update.$set.pagesViewedToday = 0;
      update.$set.totalTimeOnline = 0;
      update.$set.pagesVisited = [];
    } else {
      // Same day - don't increment visits on heartbeat
      // Only increment on new session (user was offline)
      if (wasOffline) {
        update.$inc = { totalVisits: 1, todayVisits: 1 };
        update.$set.sessionStart = now;
      }
    }

    // Push page visit
    if (data.activePage) {
      const pageEntry = { page: data.activePage, enteredAt: now };
      if (isNewDay) {
        update.$set = update.$set || {};
        update.$set.pageHistory = [pageEntry];
      } else {
        update.$push = {
          pageHistory: {
            $each: [pageEntry],
            $slice: -50
          }
        };
      }
    } else if (isNewDay) {
      update.$set = update.$set || {};
      update.$set.pageHistory = [];
    }

    // Track total time online (increment by poll interval ~15s = 15000ms)
    if (!isNewDay && !wasOffline) {
      update.$inc = update.$inc || {};
      update.$inc.totalTimeOnline = 15000; // ~15 second poll interval
    } else if (wasOffline) {
      update.$set.totalTimeOnline = 0;
    }

    return Model.findOneAndUpdate(
      { userId: data.userId },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  };

  // Mark a page visit as completed (user left the page)
  Model.closePageVisit = async (userId, page) => {
    const now = new Date();
    // Find the document first to calculate duration
    const doc = await Model.findOne({ userId, "pageHistory.page": page, "pageHistory.leftAt": null });
    if (!doc) return;
    const history = doc.pageHistory || [];
    const idx = history.findIndex(h => h.page === page && !h.leftAt);
    if (idx === -1) return;
    const enteredAt = new Date(history[idx].enteredAt);
    const duration = now - enteredAt;
    return Model.updateOne(
      { userId, "pageHistory.page": page, "pageHistory.leftAt": null },
      {
        $set: {
          "pageHistory.$.leftAt": now,
          "pageHistory.$.duration": duration
        }
      }
    );
  };

  // Record a page view (for SPA navigation - user moved to new page)
  Model.recordPageView = async (userId, page) => {
    const now = new Date();
    const doc = await Model.findOne({ userId });
    if (!doc) return;
    
    const history = doc.pageHistory || [];
    const visited = doc.pagesVisited || [];
    const isNewPage = !history.length || history[history.length - 1].page !== page;
    
    if (isNewPage) {
      history.push({ page, enteredAt: now });
      if (history.length > 50) history.splice(0, history.length - 50);
    }
    if (!visited.includes(page)) {
      visited.push(page);
    }
    
    const update = {
      $set: {
        activePage: page,
        lastSeen: now,
        isActive: true,
        pageHistory: history,
        pagesVisited: visited
      }
    };
    if (isNewPage) {
      update.$inc = { pagesViewedToday: 1 };
    }
    
    return Model.findOneAndUpdate({ userId }, update, { new: true });
  };

  // Record an action
  Model.recordAction = async (userId) => {
    return Model.updateOne(
      { userId },
      { $inc: { actionsToday: 1 } }
    );
  };

  // Mark user offline
  Model.markOffline = async (userId) => {
    return Model.updateOne(
      { userId },
      { $set: { isActive: false, activePage: "" } }
    );
  };

  // Bulk get latest activity for user IDs
  Model.getLatestActivity = async (userIds = []) => {
    if (!userIds.length) return [];
    return Model.find({ userId: { $in: userIds } })
      .select("userId username avatar role activePage isActive lastSeen ip sessionId totalVisits todayVisits actionsToday pagesViewedToday totalTimeOnline pagesVisited")
      .lean();
  };

  // Get all currently online users
  Model.getOnlineUsers = async (thresholdMs = 5 * 60 * 1000) => {
    const cutoff = new Date(Date.now() - thresholdMs);
    return Model.find({ isActive: true, lastSeen: { $gte: cutoff } })
      .select("userId username avatar role activePage lastSeen ip sessionId todayVisits actionsToday")
      .sort({ lastSeen: -1 })
      .lean();
  };

  // Get activity summary stats
  Model.getActivityStats = async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const hourAgo = new Date(now.getTime() - 3600000);
    const dayAgo = new Date(now.getTime() - 86400000);

    const [onlineNow, activeToday, totalActivity] = await Promise.all([
      Model.countDocuments({ isActive: true, lastSeen: { $gte: new Date(now.getTime() - 5 * 60000) } }),
      Model.countDocuments({ lastSeen: { $gte: todayStart } }),
      Model.aggregate([
        {
          $facet: {
            totalActions: [{ $group: { _id: null, total: { $sum: "$actionsToday" } } }],
            totalPageViews: [{ $group: { _id: null, total: { $sum: "$pagesViewedToday" } } }],
            avgTimeOnline: [{ $group: { _id: null, avg: { $avg: "$totalTimeOnline" } } }],
            topPages: [
              { $unwind: "$pageHistory" },
              { $group: { _id: "$pageHistory.page", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 5 }
            ]
          }
        }
      ])
    ]);

    const agg = totalActivity[0] || {};
    return {
      onlineNow,
      activeToday,
      totalActions: agg.totalActions?.[0]?.total || 0,
      totalPageViews: agg.totalPageViews?.[0]?.total || 0,
      avgTimeOnline: Math.round(agg.avgTimeOnline?.[0]?.avg || 0),
      topPages: agg.topPages || []
    };
  };

  // Mark stale users as offline (call periodically)
  Model.markStaleOffline = async (thresholdMs = 5 * 60 * 1000) => {
    const cutoff = new Date(Date.now() - thresholdMs);
    return Model.updateMany(
      { isActive: true, lastSeen: { $lt: cutoff } },
      { $set: { isActive: false } }
    );
  };

  return Model;
};

const buildModel = () => {
  const schema = getSchema();
  const Model = mongoose.models.SessionActivity ||
    mongoose.model("SessionActivity", schema);
  return attachMethods(Model);
};

module.exports = { buildModel };
