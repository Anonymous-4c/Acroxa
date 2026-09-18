// src/models/sql/SessionActivity.js
const { DataTypes } = require("sequelize");
const { Op } = require("sequelize");

const buildModel = (sequelize) => {
  const SessionActivity = sequelize.define("SessionActivity", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: "Users", key: "id" }
    },
    username:     { type: DataTypes.STRING, allowNull: false },
    avatar:       { type: DataTypes.STRING, defaultValue: "" },
    role:         { type: DataTypes.STRING, defaultValue: "user" },
    activePage:   { type: DataTypes.STRING, defaultValue: "/" },
    isActive:     { type: DataTypes.BOOLEAN, defaultValue: true },
    lastSeen:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    connectedAt:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    ip:           { type: DataTypes.STRING, defaultValue: "" },
    userAgent:    { type: DataTypes.TEXT, defaultValue: "" },
    sessionId:    { type: DataTypes.STRING, defaultValue: null },
    totalVisits:  { type: DataTypes.INTEGER, defaultValue: 0 },
    todayVisits:  { type: DataTypes.INTEGER, defaultValue: 0 },
    todayResetAt: { type: DataTypes.DATE, defaultValue: null },
    pageHistory:  { type: DataTypes.JSON, defaultValue: [] },
    pagesVisited: { type: DataTypes.JSON, defaultValue: [] },
    actionsToday:     { type: DataTypes.INTEGER, defaultValue: 0 },
    pagesViewedToday: { type: DataTypes.INTEGER, defaultValue: 0 },
    totalTimeOnline:  { type: DataTypes.INTEGER, defaultValue: 0 }
  }, {
    tableName: "session_activities",
    timestamps: true
  });

  // Upsert: called on every session-data poll
  SessionActivity.upsertActivity = async (data) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // First, check if user was previously offline (to detect new session)
    const existingRecord = await SessionActivity.findOne({ where: { userId: data.userId } });
    const wasOffline = !existingRecord || existingRecord.isActive === false;
    const needsReset = !existingRecord || !existingRecord.todayResetAt || new Date(existingRecord.todayResetAt) < todayStart;
    const isNewDay = needsReset;
    
    let record;
    if (!existingRecord) {
      record = await SessionActivity.create({
        userId: data.userId,
        username: data.username,
        avatar: data.avatar || "",
        role: data.role || "user",
        activePage: data.activePage || "/",
        isActive: true,
        lastSeen: now,
        connectedAt: now,
        ip: data.ip || "",
        userAgent: data.userAgent || "",
        sessionId: data.sessionId || null,
        totalVisits: 1,
        todayVisits: 1,
        todayResetAt: todayStart,
        pageHistory: data.activePage ? [{ page: data.activePage, enteredAt: now }] : [],
        pagesVisited: data.activePage ? [data.activePage] : [],
        actionsToday: 0,
        pagesViewedToday: 0,
        totalTimeOnline: 0
      });
      return record;
    }
    
    const history = Array.isArray(record.pageHistory) ? record.pageHistory : [];
    const visited = Array.isArray(record.pagesVisited) ? record.pagesVisited : [];
    
    const isNewPage = !history.length || history[history.length - 1].page !== (data.activePage || "/");
    if (data.activePage && isNewPage) {
      history.push({ page: data.activePage, enteredAt: now });
      if (history.length > 50) history.splice(0, history.length - 50);
    }
    if (data.activePage && !visited.includes(data.activePage)) {
      visited.push(data.activePage);
    }
    
    const updateData = {
      username: data.username,
      avatar: data.avatar || "",
      role: data.role || "user",
      activePage: data.activePage || "/",
      isActive: true,
      lastSeen: now,
      ip: data.ip || "",
      userAgent: data.userAgent || "",
      sessionId: data.sessionId || null
    };
    
    // Track visits only on new session (user was offline)
    if (wasOffline) {
      updateData.totalVisits = record.totalVisits + 1;
      updateData.todayVisits = record.todayVisits + 1;
      updateData.sessionStart = now;
      updateData.totalTimeOnline = 0;
    }
    
    // Reset daily counters if new day
    if (isNewDay) {
      updateData.todayResetAt = todayStart;
      updateData.todayVisits = 1;
      updateData.actionsToday = 0;
      updateData.pagesViewedToday = 0;
      updateData.totalTimeOnline = 0;
      updateData.pagesVisited = [];
    }
    
    // Track total time online (increment by poll interval ~15s = 15000ms)
    if (!isNewDay && !wasOffline) {
      updateData.totalTimeOnline = (record.totalTimeOnline || 0) + 15000;
    } else if (wasOffline) {
      updateData.totalTimeOnline = 0;
    }
    
    // Handle page history
    updateData.pageHistory = history;
    updateData.pagesVisited = visited;
    
    // Handle pagesViewedToday
    if (isNewDay) {
      updateData.pagesViewedToday = 0;
    } else if (isNewPage) {
      updateData.pagesViewedToday = (record.pagesViewedToday || 0) + 1;
    }
    
    await record.update(updateData);
    return record;
  };

  // Mark a page visit as completed (user left the page)
  SessionActivity.closePageVisit = async (userId, page) => {
    const now = new Date();
    const record = await SessionActivity.findOne({ where: { userId } });
    if (!record) return;
    const history = Array.isArray(record.pageHistory) ? record.pageHistory : [];
    const idx = history.findIndex(h => h.page === page && !h.leftAt);
    if (idx >= 0) {
      const enteredAt = new Date(history[idx].enteredAt);
      history[idx].leftAt = now;
      history[idx].duration = now - enteredAt;
      await record.update({ pageHistory: history });
    }
  };

  // Record an action
  SessionActivity.recordAction = async (userId) => {
    return SessionActivity.increment("actionsToday", { where: { userId } });
  };

  // Record page view (for SPA navigation)
  SessionActivity.recordPageView = async (userId, page) => {
    const now = new Date();
    const record = await SessionActivity.findOne({ where: { userId } });
    if (!record) return;
    const history = Array.isArray(record.pageHistory) ? record.pageHistory : [];
    const visited = Array.isArray(record.pagesVisited) ? record.pagesVisited : [];
    
    const isNewPage = !history.length || history[history.length - 1].page !== page;
    if (isNewPage) {
      history.push({ page, enteredAt: now });
      if (history.length > 50) history.splice(0, history.length - 50);
    }
    if (!visited.includes(page)) {
      visited.push(page);
    }
    await record.update({
      activePage: page,
      lastSeen: now,
      isActive: true,
      pageHistory: history,
      pagesVisited: visited,
      pagesViewedToday: isNewPage ? record.pagesViewedToday + 1 : record.pagesViewedToday
    });
  };

  // Mark user offline
  SessionActivity.markOffline = async (userId) => {
    return SessionActivity.update({ isActive: false, activePage: "" }, { where: { userId } });
  };

  // Bulk get latest activity for user IDs
  SessionActivity.getLatestActivity = async (userIds = []) => {
    if (!userIds.length) return [];
    return SessionActivity.findAll({
      where: { userId: userIds },
      attributes: ["userId", "username", "avatar", "role", "activePage", "isActive", "lastSeen", "ip", "sessionId", "totalVisits", "todayVisits", "actionsToday", "pagesViewedToday", "totalTimeOnline", "pagesVisited", "connectedAt"]
    });
  };

  // Get all currently online users
  SessionActivity.getOnlineUsers = async (thresholdMs = 5 * 60 * 1000) => {
    const cutoff = new Date(Date.now() - thresholdMs);
    return SessionActivity.findAll({
      where: { isActive: true, lastSeen: { [Op.gte]: cutoff } },
      attributes: ["userId", "username", "avatar", "role", "activePage", "lastSeen", "ip", "sessionId", "todayVisits", "actionsToday", "pagesViewedToday", "totalTimeOnline", "pagesVisited", "connectedAt"],
      order: [["lastSeen", "DESC"]]
    });
  };

  // Mark stale users as offline
  SessionActivity.markStaleOffline = async (thresholdMs = 5 * 60 * 1000) => {
    const cutoff = new Date(Date.now() - thresholdMs);
    return SessionActivity.update({ isActive: false }, { where: { isActive: true, lastSeen: { [Op.lt]: cutoff } } });
  };

  // Get activity summary stats
  SessionActivity.getActivityStats = async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const [onlineNow, activeToday, aggregates] = await Promise.all([
      SessionActivity.count({ where: { isActive: true, lastSeen: { [Op.gte]: fiveMinAgo } } }),
      SessionActivity.count({ where: { lastSeen: { [Op.gte]: todayStart } } }),
      SessionActivity.findAll({
        attributes: [
          [sequelize.fn('SUM', sequelize.col('actionsToday')), 'totalActions'],
          [sequelize.fn('SUM', sequelize.col('pagesViewedToday')), 'totalPageViews'],
          [sequelize.fn('AVG', sequelize.col('totalTimeOnline')), 'avgTimeOnline']
        ],
        raw: true
      })
    ]);

    // Get top pages from pageHistory
    const allRecords = await SessionActivity.findAll({
      attributes: ['pageHistory'],
      where: { pageHistory: { [Op.ne]: [] } },
      raw: true
    });
    
    const pageCounts = {};
    allRecords.forEach(r => {
      if (Array.isArray(r.pageHistory)) {
        r.pageHistory.forEach(h => {
          if (h.page) pageCounts[h.page] = (pageCounts[h.page] || 0) + 1;
        });
      }
    });
    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([page, count]) => ({ page, count }));

    const agg = aggregates[0] || {};
    return {
      onlineNow,
      activeToday,
      totalActions: parseInt(agg.totalActions) || 0,
      totalPageViews: parseInt(agg.totalPageViews) || 0,
      avgTimeOnline: Math.round(parseFloat(agg.avgTimeOnline) || 0),
      topPages
    };
  };

  return SessionActivity;
};

module.exports = { buildModel };