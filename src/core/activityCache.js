// src/core/activityCache.js — In-memory real-time activity cache
// Singleton updated by SSE broadcast, read by controllers for instant data

const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

class ActivityCache {
  constructor() {
    this._map = new Map(); // userId -> activity object
    this._cleanupInterval = null;
    this._startCleanup();
  }

  _startCleanup() {
    // Run cleanup every minute
    this._cleanupInterval = setInterval(() => this._cleanup(), 60 * 1000);
    this._cleanupInterval.unref();
  }

  _cleanup(thresholdMs = DEFAULT_STALE_THRESHOLD_MS) {
    const cutoff = Date.now() - thresholdMs;
    for (const [userId, data] of this._map.entries()) {
      if (data.lastSeen && new Date(data.lastSeen).getTime() < cutoff) {
        this._map.delete(userId);
      }
    }
  }

  // Update from SSE broadcast
  set(userId, data) {
    if (!userId) return;
    const existing = this._map.get(userId) || {};
    this._map.set(userId, { ...existing, ...data, userId, updatedAt: Date.now() });
  }

  // Get single user
  get(userId) {
    return this._map.get(userId) || null;
  }

  // Get multiple users
  getMany(userIds) {
    const result = {};
    for (const id of userIds) {
      const data = this._map.get(id);
      if (data) result[id] = data;
    }
    return result;
  }

  // Get all cached activities
  getAll() {
    return new Map(this._map);
  }

  // Get online users (active within threshold)
  getOnline(thresholdMs = DEFAULT_STALE_THRESHOLD_MS) {
    const cutoff = Date.now() - thresholdMs;
    const online = [];
    for (const [userId, data] of this._map.entries()) {
      if (data.isActive !== false && data.lastSeen && new Date(data.lastSeen).getTime() >= cutoff) {
        online.push({ userId, ...data });
      }
    }
    return online.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  }

  // Get aggregate stats
  getStats() {
    let onlineNow = 0;
    let activeToday = 0;
    let totalActions = 0;
    let totalPageViews = 0;
    let totalTimeOnline = 0;
    let userCount = 0;
    const pageCounts = {};

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    for (const [, data] of this._map.entries()) {
      userCount++;
      const lastSeen = data.lastSeen ? new Date(data.lastSeen).getTime() : 0;
      const isOnline = data.isActive !== false && lastSeen >= (Date.now() - 5 * 60 * 1000);
      const isActiveToday = lastSeen >= todayStart.getTime();

      if (isOnline) onlineNow++;
      if (isActiveToday) activeToday++;

      totalActions += data.actionsToday || 0;
      totalPageViews += data.pagesViewedToday || 0;
      totalTimeOnline += data.totalTimeOnline || 0;

      // Aggregate top pages from pageHistory
      if (Array.isArray(data.pageHistory)) {
        for (const h of data.pageHistory) {
          if (h.page) pageCounts[h.page] = (pageCounts[h.page] || 0) + 1;
        }
      }
    }

    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([page, count]) => ({ page, count }));

    return {
      onlineNow,
      activeToday,
      totalActions,
      totalPageViews,
      avgTimeOnline: userCount ? Math.round(totalTimeOnline / userCount) : 0,
      topPages
    };
  }

  // Clear cache (for testing/reload)
  clear() {
    this._map.clear();
  }

  // Shutdown cleanup
  shutdown() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

// Singleton instance
const instance = new ActivityCache();

module.exports = { ActivityCache, instance };