/* src/controllers/analyticsController.js
 *
 * Visitor analytics pipeline: public ingestion + authorized dashboard reads.
 * Response contract (matches acrx/assets/js/analytics.js):
 *   success → { status: "success", data: {...} }
 *   failure → HTTP 4xx/5xx + { status: "error", error: "message" }
 *
 * Identity chain: visitor 1—N sessions 1—N page views 1—N events.
 * Privacy: anonymous ids only; raw IPs are never stored (ipHash only).
 */

const crypto = require("crypto");
const { Op } = require("sequelize");
const { getConnection } = require("../core/connect-db");

// ─── Pure helpers (exported for tests) ─────────────────────────────────────

const EVENT_TYPES = new Set([
  "page_view", "session_start", "click", "scroll", "outbound_click",
  "visibility", "time_on_page", "consent", "custom",
  "rage_click", "dead_click", "hover", "media_play", "media_pause",
  "media_seek", "media_complete", "form_view", "form_start", "form_submit",
  "download", "error", "perf", "campaign",
]);

const MAX_EVENT_JSON = 4096;
const MAX_BATCH = 100;
const MAX_META_KEYS = 50;
const MAX_META_DEPTH = 3;

function ok(data) {
  return { status: "success", data };
}

function fail(res, code, message) {
  return res.status(code).json({ status: "error", error: message });
}

function isSafeKey(k) {
  return typeof k === "string" && k.length <= 64 &&
    k !== "__proto__" && k !== "constructor" && k !== "prototype";
}

function cleanMetadata(meta, depth = 0) {
  if (meta === null || meta === undefined) return {};
  if (depth > MAX_META_DEPTH) return {};
  if (Array.isArray(meta)) {
    return meta.slice(0, 50).map((v) => cleanMetadata(v, depth + 1));
  }
  if (typeof meta === "object") {
    const out = {};
    let n = 0;
    for (const [k, v] of Object.entries(meta)) {
      if (n >= MAX_META_KEYS) break;
      if (!isSafeKey(k)) continue;
      if (typeof v === "string") out[k] = v.slice(0, 512);
      else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      else if (typeof v === "boolean") out[k] = v;
      else if (v !== null && typeof v === "object") out[k] = cleanMetadata(v, depth + 1);
      else if (v == null) out[k] = null;
      n++;
    }
    return out;
  }
  return {};
}

function validEventType(t) {
  if (typeof t !== "string" || t.length === 0 || t.length > 48) return false;
  if (EVENT_TYPES.has(t)) return true;
  // Namespaced custom/widget events: letters, digits, _ : . -
  return /^(widget|cta|custom|form|video|tabs|faq|pricing|hero)[_:a-z0-9.-]{0,40}$/.test(t);
}

function validId(v, max = 128) {
  return typeof v === "string" && v.length > 0 && v.length <= max &&
    /^[A-Za-z0-9_:\-.]+$/.test(v);
}

function clampUrl(u, max = 2048) {
  if (typeof u !== "string") return "";
  const t = u.trim().slice(0, max);
  if (/[\r\n<>]/.test(t)) return "";
  return t;
}

// Validate one inbound event. Returns { ok, event } or { ok:false, error }.
function validateEvent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "event must be an object" };
  }
  if (JSON.stringify(raw).length > MAX_EVENT_JSON) {
    return { ok: false, error: "event payload too large" };
  }
  const eventType = raw.event_type || raw.eventType || "custom";
  if (!validEventType(eventType)) return { ok: false, error: "invalid event_type" };
  for (const [k, name] of [["visitor_id", "visitorId"], ["session_id", "sessionId"]]) {
    const v = raw[k] !== undefined ? raw[k] : raw[name];
    if (!validId(v)) return { ok: false, error: `invalid ${k}` };
  }
  const pageViewId = raw.page_view_id !== undefined ? raw.page_view_id : raw.pageViewId;
  if (pageViewId !== undefined && pageViewId !== null && !validId(pageViewId)) {
    return { ok: false, error: "invalid page_view_id" };
  }
  const url = clampUrl(raw.url || raw.path || "");
  if (!url) return { ok: false, error: "url/path is required" };
  let num = (v, min, max) => {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const event = {
    eventId: validId(raw.event_id || raw.eventId, 64) ? (raw.event_id || raw.eventId) : crypto.randomUUID(),
    eventType,
    visitorId: raw.visitor_id !== undefined ? raw.visitor_id : raw.visitorId,
    sessionId: raw.session_id !== undefined ? raw.session_id : raw.sessionId,
    pageViewId: pageViewId || null,
    url,
    path: clampUrl(raw.path || url, 512) || "/",
    referrer: clampUrl(raw.referrer || "", 2048),
    value: num(raw.value, 0, 1000000),
    x: num(raw.x, 0, 100000),
    y: num(raw.y, 0, 100000),
    viewportW: num(raw.viewport_w !== undefined ? raw.viewport_w : raw.viewportW, 1, 100000),
    viewportH: num(raw.viewport_h !== undefined ? raw.viewport_h : raw.viewportH, 1, 100000),
    deviceSignature: clampUrl(raw.device_signature !== undefined ? raw.device_signature : raw.deviceSignature, 64),
    docW: num(raw.doc_w !== undefined ? raw.doc_w : raw.docW, 1, 1000000),
    docH: num(raw.doc_h !== undefined ? raw.doc_h : raw.docH, 1, 10000000),
    metadata: cleanMetadata(raw.metadata || {}),
  };
  if (JSON.stringify(event.metadata).length > MAX_EVENT_JSON) {
    return { ok: false, error: "metadata too large" };
  }
  return { ok: true, event };
}

const SEARCH_HOSTS = ["google.", "bing.", "yahoo.", "duckduckgo.", "yandex.", "baidu.", "ecosia.", "brave."];
const SOCIAL_HOSTS = ["facebook.", "instagram.", "twitter.", "x.com", "linkedin.", "tiktok.", "pinterest.", "reddit.", "youtube.", "threads.", "mastodon.", "bluesky.", "t.co", "youtu.be", "fb.me", "lnkd.in", "pin.it"];

function hostOf(ref) {
  try {
    const u = new URL(ref);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.hostname.toLowerCase();
  } catch { return ""; }
}

function channelFromReferrer(referrer, siteHost = "") {
  if (!referrer) return "direct";
  const host = hostOf(referrer);
  if (!host) return "direct";
  if (siteHost && (host === siteHost || host.endsWith(`.${siteHost}`))) return "internal";
  if (SEARCH_HOSTS.some((s) => host.includes(s))) return "search";
  if (SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s.replace(/^\./, "")}`) || host.includes(s))) return "social";
  return "referral";
}

function parseDevice(ua = "") {
  const s = String(ua || "");
  let device = "desktop";
  if (/mobile|android|iphone|ipod|phone/i.test(s)) device = "mobile";
  else if (/tablet|ipad/i.test(s)) device = "tablet";
  let browser = "";
  if (/edg\//i.test(s)) browser = "Edge";
  else if (/opr\/|opera/i.test(s)) browser = "Opera";
  else if (/chrome\//i.test(s) && !/chromium/i.test(s)) browser = "Chrome";
  else if (/safari\//i.test(s) && /version\//i.test(s)) browser = "Safari";
  else if (/firefox\//i.test(s)) browser = "Firefox";
  else if (/msie|trident/i.test(s)) browser = "IE";
  let os = "";
  if (/windows/i.test(s)) os = "Windows";
  else if (/android/i.test(s)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(s)) os = "iOS";
  else if (/mac os|macintosh/i.test(s)) os = "macOS";
  else if (/linux/i.test(s)) os = "Linux";
  else if (/cros/i.test(s)) os = "ChromeOS";
  return { device, browser, os };
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(`acrx-analytics:${ip || "unknown"}`).digest("hex");
}

function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

// Parse ?from/?to (YYYY-MM-DD). Defaults to trailing 7 days, caps at 366.
function parseRange(query = {}) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const now = new Date();
  let to = now;
  let from = new Date(now.getTime() - 6 * 86400000);
  if (query.to && iso.test(query.to)) {
    to = new Date(`${query.to}T23:59:59.999`);
    if (Number.isNaN(to.getTime())) return { ok: false, error: "invalid 'to' date" };
  }
  if (query.from && iso.test(query.from)) {
    from = new Date(`${query.from}T00:00:00.000`);
    if (Number.isNaN(from.getTime())) return { ok: false, error: "invalid 'from' date" };
  }
  if (from > to) return { ok: false, error: "'from' must not be after 'to'" };
  if (to - from > 366 * 86400000) return { ok: false, error: "range exceeds 366 days" };
  return { ok: true, from, to };
}

function bucketize(rows, interval = "daily") {
  const buckets = new Map();
  for (const r of rows) {
    const d = new Date(r.createdAt);
    let key;
    if (interval === "hourly") {
      key = `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:00`;
    } else {
      key = dayKey(d);
    }
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([timestamp, value]) => ({ timestamp, value }));
}

function groupSessions(pageViews) {
  // pageViews: [{ sessionId, visitorId, path, referrer, channel, createdAt, ... }]
  const map = new Map();
  for (const p of pageViews) {
    if (!map.has(p.sessionId)) {
      map.set(p.sessionId, {
        sessionId: p.sessionId,
        visitorId: p.visitorId,
        views: [],
        referrer: p.referrer || "",
        channel: p.channel || "direct",
        device: p.device || "",
      });
    }
    map.get(p.sessionId).views.push(p);
  }
  for (const s of map.values()) {
    s.views.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    s.first = s.views[0];
    s.last = s.views[s.views.length - 1];
    s.spanSec = s.views.length > 1
      ? Math.max(0, Math.round((new Date(s.last.createdAt) - new Date(s.first.createdAt)) / 1000))
      : 0;
  }
  return [...map.values()];
}

function computeOverview(pageViews) {
  const sessions = groupSessions(pageViews);
  const visitors = new Set(pageViews.map((p) => p.visitorId));
  const bounced = sessions.filter((s) => s.views.length === 1).length;
  const engaged = sessions.filter((s) => s.views.length > 1);
  const avgSpan = engaged.length
    ? engaged.reduce((n, s) => n + s.spanSec, 0) / engaged.length
    : 0;
  return {
    page_views: pageViews.length,
    sessions: sessions.length,
    unique_users: visitors.size,
    bounce_rate: sessions.length ? Math.round((bounced / sessions.length) * 1000) / 10 : 0,
    avg_session_duration: Math.round(avgSpan * 10) / 10,
  };
}

function computePages(pageViews) {
  const sessions = groupSessions(pageViews);
  const byPath = new Map();
  for (const s of sessions) {
    const touched = new Set(s.views.map((v) => v.path || "/"));
    for (const path of touched) {
      if (!byPath.has(path)) byPath.set(path, { page: path, views: 0, sessions: 0, exits: 0, spans: [] });
      const row = byPath.get(path);
      row.views += s.views.filter((v) => (v.path || "/") === path).length;
      row.sessions += 1;
      if ((s.last.path || "/") === path) row.exits += 1;
      row.spans.push(s.spanSec);
    }
  }
  return [...byPath.values()]
    .map((r) => ({
      page: r.page,
      views: r.views,
      avg_duration: r.spans.length ? Math.round((r.spans.reduce((a, b) => a + b, 0) / r.spans.length) * 10) / 10 : null,
      exit_rate: r.sessions ? Math.round((r.exits / r.sessions) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.views - a.views);
}

function computeSources(pageViews) {
  const sessions = groupSessions(pageViews);
  const ref = new Map();
  const chan = new Map();
  for (const s of sessions) {
    const r = s.referrer || "";
    ref.set(r, (ref.get(r) || 0) + 1);
    chan.set(s.channel || "direct", (chan.get(s.channel || "direct") || 0) + 1);
  }
  return {
    referrers: [...ref.entries()]
      .filter(([referrer]) => referrer)
      .map(([referrer, sessions]) => ({ referrer, sessions }))
      .sort((a, b) => b.sessions - a.sessions),
    channels: [...chan.entries()]
      .map(([channel, sessions]) => ({ channel, sessions }))
      .sort((a, b) => b.sessions - a.sessions),
  };
}

function computeDevices(pageViews) {
  const map = new Map();
  for (const p of pageViews) {
    const t = (p.device || "desktop").toLowerCase();
    map.set(t, (map.get(t) || 0) + 1);
  }
  return {
    device_types: [...map.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ─── Explorer aggregation (server-reduced, never raw dumps) ───────────────

function summarizeSession(events) {
  if (!events.length) return null;
  const sorted = [...events].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const views = sorted.filter((e) => e.eventType === "page_view");
  const entry = views[0];
  const exit = views[views.length - 1];
  const maxDepth = sorted
    .filter((e) => e.eventType === "scroll" && e.value != null)
    .reduce((m, e) => Math.max(m, e.value), 0);
  return {
    sessionId: first.sessionId,
    visitorId: first.visitorId,
    startedAt: first.createdAt,
    endedAt: last.createdAt,
    durationSec: Math.max(0, Math.round((new Date(last.createdAt) - new Date(first.createdAt)) / 1000)),
    pageViews: views.length,
    events: sorted.length,
    device: first.device || "",
    browser: first.browser || "",
    os: first.os || "",
    entryPage: entry?.path || "",
    exitPage: exit?.path || "",
    referrer: first.referrer || "",
    channel: first.channel || "direct",
    maxScrollDepth: maxDepth,
  };
}

function summarizeVisitor(events) {
  if (!events.length) return null;
  const sorted = [...events].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const sessions = new Set(sorted.map((e) => e.sessionId));
  const pageViews = sorted.filter((e) => e.eventType === "page_view");
  return {
    visitorId: sorted[0].visitorId,
    firstSeen: sorted[0].createdAt,
    lastSeen: sorted[sorted.length - 1].createdAt,
    sessions: sessions.size,
    pageViews: pageViews.length,
    events: sorted.length,
    device: sorted[0].device || "",
    browser: sorted[0].browser || "",
    os: sorted[0].os || "",
  };
}

function summarizeEventTypes(events) {
  const map = new Map();
  for (const e of events) {
    map.set(e.eventType, (map.get(e.eventType) || 0) + 1);
  }
  return [...map.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

function summarizeCampaigns(events) {
  const map = new Map();
  for (const e of events) {
    const m = e.metadata || {};
    const src = m.utm_source || m.x_utm_source;
    if (!src) continue;
    const key = [src, m.utm_medium, m.utm_campaign].filter(Boolean).join("|");
    if (!map.has(key)) {
      map.set(key, { source: src, medium: m.utm_medium || "", campaign: m.utm_campaign || "", sessions: new Set() });
    }
    map.get(key).sessions.add(e.sessionId);
  }
  return [...map.values()]
    .map((c) => ({ source: c.source, medium: c.medium, campaign: c.campaign, sessions: c.sessions.size }))
    .sort((a, b) => b.sessions - a.sessions);
}

function summarizeContent(pageViews) {
  const sessions = groupSessions(pageViews);
  const bySlug = new Map();
  for (const s of sessions) {
    const paths = new Set(s.views.map((v) => v.path || "/"));
    for (const path of paths) {
      if (!bySlug.has(path)) {
        bySlug.set(path, {
          page: path, views: 0, uniques: new Set(), sessions: 0,
          durationSec: 0, scrollDepths: [], clicks: 0,
        });
      }
      const row = bySlug.get(path);
      const items = s.views.filter((v) => (v.path || "/") === path);
      row.views += items.length;
      row.sessions += 1;
      row.uniques.add(s.visitorId);
      row.durationSec += s.spanSec;
      for (const v of items) {
        if (v.value != null && v.eventType === "scroll") row.scrollDepths.push(v.value);
      }
    }
  }
  return [...bySlug.values()]
    .map((r) => ({
      page: r.page,
      views: r.views,
      unique_users: r.uniques.size,
      sessions: r.sessions,
      avg_duration: r.sessions ? Math.round((r.durationSec / r.sessions) * 10) / 10 : 0,
      avg_scroll: r.scrollDepths.length
        ? Math.round((r.scrollDepths.reduce((a, b) => a + b, 0) / r.scrollDepths.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.views - a.views);
}

function stableKey(parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

// Rule-based insights derived from REAL aggregates (never fabricated).
function computeInsights({ overview, pages, timeseries, from, to }) {
  const insights = [];
  const range = `${dayKey(from)}..${dayKey(to)}`;
  const mid = Math.floor(timeseries.length / 2);
  if (timeseries.length >= 4) {
    const first = timeseries.slice(0, mid).reduce((n, p) => n + p.value, 0);
    const second = timeseries.slice(mid).reduce((n, p) => n + p.value, 0);
    if (first > 0) {
      const pct = Math.round(((second - first) / first) * 100);
      if (Math.abs(pct) >= 20) {
        const up = pct > 0;
        insights.push({
          id: stableKey(["trend", range]),
          insight_type: "trend",
          severity: Math.abs(pct) >= 100 ? "high" : "medium",
          insight: `Page views ${up ? "up" : "down"} ${Math.abs(pct)}% in the second half of the selected period.`,
          suggestion: up ? "Double down on what worked — check top pages for drivers." : "Review top exit pages and recent content changes.",
          confidence: 0.7,
        });
      }
    }
  }
  if (pages.length > 0) {
    insights.push({
      id: stableKey(["toppages", range, pages[0].page]),
      insight_type: "summary",
      severity: "low",
      insight: `"${pages[0].page}" is the most viewed page with ${pages[0].views} views in this period.`,
      suggestion: "",
      confidence: 0.9,
    });
  }
  if (overview.sessions >= 10 && overview.bounce_rate >= 70) {
    insights.push({
      id: stableKey(["bounce", range]),
      insight_type: "recommendation",
      severity: "medium",
      insight: `Bounce rate is ${overview.bounce_rate}% across ${overview.sessions} sessions.`,
      suggestion: "Strengthen internal linking and add clear next steps above the fold.",
      confidence: 0.6,
    });
  }
  return insights;
}

function computeAnomalies({ timeseries, from, to }) {
  const anomalies = [];
  if (timeseries.length < 4) return anomalies;
  const range = `${dayKey(from)}..${dayKey(to)}`;
  const values = timeseries.map((p) => p.value);
  const total = values.reduce((a, b) => a + b, 0);
  if (total < 20) return anomalies;
  timeseries.forEach((p, i) => {
    const rest = values.filter((_, j) => j !== i);
    const mean = rest.reduce((a, b) => a + b, 0) / rest.length;
    if (mean < 2) return;
    if (p.value >= mean * 2.5) {
      anomalies.push({
        id: stableKey(["spike", range, p.timestamp]),
        severity: p.value >= mean * 4 ? "high" : "medium",
        insight: `Traffic spike on ${p.timestamp}: ${p.value} views vs ~${Math.round(mean)} typical.`,
        possible_reason: "Check referrers for a viral link, campaign, or bot burst.",
        affected_scope: "site",
        confidence: 0.65,
      });
    } else if (p.value <= mean * 0.3) {
      anomalies.push({
        id: stableKey(["drop", range, p.timestamp]),
        severity: "medium",
        insight: `Traffic drop on ${p.timestamp}: ${p.value} views vs ~${Math.round(mean)} typical.`,
        possible_reason: "Check for downtime, deploy issues, or tracking breakage.",
        affected_scope: "site",
        confidence: 0.6,
      });
    }
  });
  return anomalies.slice(0, 20);
}

function rowsToCSV(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

// ─── Heatmap binning ──────────────────────────────────────────────────────
// Coordinates are normalized to a percentage of the *document* when available,
// else of the viewport, so desktop/mobile views align into a shared grid. The
// server reduces raw x/y into coarse density cells — the browser never sees
// precision coordinates.

function normalizeCoord(x, y, docW, docH, viewportW, viewportH) {
  const w = docW || viewportW || 1;
  const h = docH || viewportH || 1;
  if (x == null && y == null) return null;
  const nx = x != null ? Math.max(0, Math.min(1, x / w)) : null;
  const ny = y != null ? Math.max(0, Math.min(1, y / h)) : null;
  return { nx, ny };
}

function binHeatmap(events, opts = {}) {
  const cols = Math.max(2, Math.min(64, parseInt(opts.cols, 10) || 24));
  const rows = Math.max(2, Math.min(64, parseInt(opts.rows, 10) || 16));
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let max = 0;
  for (const e of events) {
    if (e.x == null && e.y == null) continue;
    const n = normalizeCoord(e.x, e.y, e.docW, e.docH, e.viewportW, e.viewportH);
    if (!n || n.nx == null || n.ny == null) continue;
    const c = Math.min(cols - 1, Math.floor(n.nx * cols));
    const r = Math.min(rows - 1, Math.floor(n.ny * rows));
    grid[r][c] += 1;
    if (grid[r][c] > max) max = grid[r][c];
  }
  return { cols, rows, max, cells: grid };
}

function binScrollHeatmap(events, opts = {}) {
  // Scroll heatmap uses the `value` (depth %) — a single vertical density band.
  const buckets = Math.max(10, Math.min(100, parseInt(opts.rows, 10) || 20));
  const bands = new Array(buckets).fill(0);
  let max = 0;
  for (const e of events) {
    const v = e.value != null ? e.value : e.metadata?.depth;
    if (v == null) continue;
    const depth = Math.max(0, Math.min(100, Number(v)));
    const idx = Math.min(buckets - 1, Math.floor((depth / 100) * buckets));
    bands[idx] += 1;
    if (bands[idx] > max) max = bands[idx];
  }
  return { buckets, max, bands };
}

// ─── DB plumbing (dual backend, repo convention) ─────────────────────────────

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

function toPlain(r) {
  if (!r) return null;
  if (typeof r.toJSON === "function") {
    const o = r.toJSON();
    if (o._id && !o.id) o.id = String(o._id);
    return o;
  }
  return { ...r };
}

function rangeFilter(from, to) {
  return { createdAt: { $gte: from, $lte: to } };
}

// Fetch events in range, newest cap. Returns plain objects (both backends).
async function fetchEvents(Event, dbType, { from, to, types = null, limit = 20000 }) {
  if (dbType === "sequelize") {
    const where = { createdAt: { [Op.between]: [from, to] } };
    if (types) where.eventType = { [Op.in]: types };
    const rows = await Event.findAll({
      where, order: [["createdAt", "ASC"]], limit,
      attributes: { exclude: ["updatedAt"] },
    });
    return rows.map(toPlain);
  }
  const q = { createdAt: { $gte: from, $lte: to } };
  if (types) q.eventType = { $in: types };
  return Event.find(q).sort({ createdAt: 1 }).limit(limit).lean();
}

async function insertEvents(Event, dbType, docs) {
  if (!docs.length) return 0;
  if (dbType === "sequelize") {
    const rows = await Event.bulkCreate(docs, { ignoreDuplicates: true, validate: true });
    return rows.length;
  }
  try {
    const rows = await Event.insertMany(docs, { ordered: false });
    return rows.length;
  } catch (err) {
    // ordered:false → partial success; bulkWriteErrors carry what landed
    if (err && typeof err.result?.nInserted === "number") return err.result.nInserted;
    if (Array.isArray(err?.insertedDocs)) return err.insertedDocs.length;
    throw err;
  }
}

async function dismissedKeys(Insight, dbType) {
  try {
    if (dbType === "sequelize") {
      const rows = await Insight.findAll({ where: { dismissed: true }, attributes: ["key"] });
      return new Set(rows.map((r) => r.key));
    }
    const rows = await Insight.find({ dismissed: true }).select("key").lean();
    return new Set(rows.map((r) => r.key));
  } catch {
    return new Set();
  }
}

// ─── Ingestion rate limiting (per-IP sliding bucket, bounded) ────────────────

const ingestHits = new Map();
const INGEST_WINDOW_MS = 60 * 1000;
const INGEST_MAX_HITS = 120;

function sweepIngestHits(now) {
  if (ingestHits.size > 5000) {
    for (const [ip, arr] of ingestHits) {
      const fresh = arr.filter((t) => now - t < INGEST_WINDOW_MS);
      if (fresh.length) ingestHits.set(ip, fresh);
      else ingestHits.delete(ip);
    }
  }
}

function ingestAllowed(ip, count) {
  const now = Date.now();
  sweepIngestHits(now);
  const arr = (ingestHits.get(ip) || []).filter((t) => now - t < INGEST_WINDOW_MS);
  if (arr.length + count > INGEST_MAX_HITS) return false;
  for (let i = 0; i < count; i++) arr.push(now);
  ingestHits.set(ip, arr);
  return true;
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  const raw = (typeof fwd === "string" ? fwd.split(",")[0] : "") || req.socket?.remoteAddress || "unknown";
  return raw.trim().slice(0, 64);
}

function siteHost(req) {
  return String(req.headers.host || "").split(":")[0].toLowerCase();
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function settingsSnapshot() {
  try {
    const models = getModels();
    if (!models.Settings || typeof models.Settings.getSettings !== "function") return null;
    return await models.Settings.getSettings();
  } catch {
    return null;
  }
}

// POST /analytics/collect — public, validated, rate-limited
async function collect(req, res) {
  try {
    const body = req.body || {};
    const incoming = Array.isArray(body.events) ? body.events : [body];
    if (incoming.length === 0 || incoming.length > MAX_BATCH) {
      return fail(res, 400, `events array must hold 1–${MAX_BATCH} items`);
    }
    const ip = clientIp(req);
    if (!ingestAllowed(ip, incoming.length)) {
      return fail(res, 429, "rate limit exceeded");
    }
    const settings = await settingsSnapshot();
    if (settings && settings.analytics && settings.analytics.analyticsEnabled === false) {
      return res.json(ok({ accepted: 0, disabled: true }));
    }
    const ua = String(req.headers["user-agent"] || "");
    const dev = parseDevice(ua);
    const host = siteHost(req);
    const ipHash = hashIp(ip);
    const now = Date.now();
    const docs = [];
    for (const raw of incoming) {
      const v = validateEvent(raw);
      if (!v.ok) continue; // drop invalid events, keep the batch honest
      const e = v.event;
      const ts = Number(raw.timestamp || raw.ts || 0);
      const createdAt = Number.isFinite(ts) && Math.abs(now - ts) < 86400000 ? new Date(ts) : new Date(now);
      docs.push({
        ...e,
        channel: channelFromReferrer(e.referrer, host),
        device: dev.device,
        browser: dev.browser,
        os: dev.os,
        postId: typeof raw.post_id === "string" ? raw.post_id.slice(0, 64) : (typeof raw.postId === "string" ? raw.postId.slice(0, 64) : (e.metadata.postId || e.metadata.post_id || null)),
        postSlug: typeof raw.post_slug === "string" ? raw.post_slug.slice(0, 256) : (typeof raw.postSlug === "string" ? raw.postSlug.slice(0, 256) : (e.metadata.postSlug || e.metadata.post_slug || null)),
        consent: true,
        ipHash,
        createdAt,
        updatedAt: createdAt,
      });
    }
    if (!docs.length) return fail(res, 400, "no valid events in batch");
    const models = getModels();
    const accepted = await insertEvents(models.AnalyticsEvent, getDbType(), docs);
    return res.json(ok({ accepted }));
  } catch (err) {
    console.error("[Analytics] collect error:", err.message);
    return fail(res, 500, "ingestion failed");
  }
}

async function guardRange(req, res) {
  const r = parseRange(req.query || {});
  if (!r.ok) {
    fail(res, 400, r.error);
    return null;
  }
  return r;
}

async function overview(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r, types: ["page_view"] });
    return res.json(ok(computeOverview(rows)));
  } catch (err) {
    console.error("[Analytics] overview error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function timeseries(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const interval = req.query.interval === "hourly" ? "hourly" : "daily";
    const metric = String(req.query.metric || "page_views");
    const models = getModels();
    const types = metric === "sessions"
      ? ["session_start"]
      : metric === "visitors" || metric === "unique_users"
        ? ["page_view"]
        : ["page_view"];
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r, types });
    if (metric === "sessions" && rows.length === 0) {
      // Fall back to distinct sessions derived from page views.
      const pv = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r, types: ["page_view"] });
      const seen = new Map();
      for (const p of pv) {
        if (!seen.has(p.sessionId)) seen.set(p.sessionId, p);
      }
      return res.json(ok({ series: bucketize([...seen.values()], interval) }));
    }
    if (metric === "visitors" || metric === "unique_users") {
      const seen = new Map();
      for (const p of rows) {
        const key = `${p.visitorId}`;
        if (!seen.has(key)) seen.set(key, p);
      }
      return res.json(ok({ series: bucketize([...seen.values()], interval) }));
    }
    return res.json(ok({ series: bucketize(rows, interval) }));
  } catch (err) {
    console.error("[Analytics] timeseries error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function pages(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r, types: ["page_view"] });
    return res.json(ok({ pages: computePages(rows).slice(0, limit) }));
  } catch (err) {
    console.error("[Analytics] pages error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function sources(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r, types: ["page_view"] });
    return res.json(ok(computeSources(rows)));
  } catch (err) {
    console.error("[Analytics] sources error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function devices(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r, types: ["page_view"] });
    return res.json(ok(computeDevices(rows)));
  } catch (err) {
    console.error("[Analytics] devices error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function insights(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const models = getModels();
    const dbType = getDbType();
    const rows = await fetchEvents(models.AnalyticsEvent, dbType, { ...r, types: ["page_view"] });
    const all = computeInsights({
      overview: computeOverview(rows),
      pages: computePages(rows),
      timeseries: bucketize(rows, "daily"),
      from: r.from,
      to: r.to,
    });
    let dismissed = new Set();
    if (models.AnalyticsInsight) dismissed = await dismissedKeys(models.AnalyticsInsight, dbType);
    return res.json(ok({ insights: all.filter((i) => !dismissed.has(i.id)) }));
  } catch (err) {
    console.error("[Analytics] insights error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function dismissInsight(req, res) {
  try {
    const id = String(req.params.id || "");
    if (!/^[a-f0-9]{32}$/.test(id)) return fail(res, 400, "invalid insight id");
    const models = getModels();
    if (!models.AnalyticsInsight) return fail(res, 503, "insights store unavailable");
    const dbType = getDbType();
    if (dbType === "sequelize") {
      await models.AnalyticsInsight.upsert({ key: id, kind: "insight", dismissed: true });
    } else {
      await models.AnalyticsInsight.findOneAndUpdate(
        { key: id },
        { $set: { key: id, kind: "insight", dismissed: true } },
        { upsert: true, new: true }
      );
    }
    return res.json(ok({ dismissed: true }));
  } catch (err) {
    console.error("[Analytics] dismiss error:", err.message);
    return fail(res, 500, "dismiss failed");
  }
}

async function anomalies(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r, types: ["page_view"] });
    return res.json(ok({
      anomalies: computeAnomalies({ timeseries: bucketize(rows, "daily"), from: r.from, to: r.to }),
    }));
  } catch (err) {
    console.error("[Analytics] anomalies error:", err.message);
    return fail(res, 500, "query failed");
  }
}

// ─── Heatmaps ───────────────────────────────────────────────────────────────
async function heatmap(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const type = String(req.query.type || "clicks");
    const pathFilter = String(req.query.path || "");
    const models = getModels();
    let types;
    if (type === "scroll") types = ["scroll"];
    else if (type === "rage") types = ["rage_click"];
    else types = ["click", "outbound_click", "rage_click"];
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r, types });
    const filtered = pathFilter
      ? rows.filter((e) => (e.path || "/") === pathFilter || (e.path || "/").startsWith(pathFilter))
      : rows;
    if (type === "scroll") {
      return res.json(ok({ heatmap: binScrollHeatmap(filtered, r2opts(req.query)) }));
    }
    return res.json(ok({ heatmap: binHeatmap(filtered, r2opts(req.query)) }));
  } catch (err) {
    console.error("[Analytics] heatmap error:", err.message);
    return fail(res, 500, "query failed");
  }
}

function r2opts(q) {
  return { cols: q.cols, rows: q.rows };
}

// ─── Sessions / visitors / events / content explorers ─────────────────────
async function sessions(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r });
    const bySession = new Map();
    for (const e of rows) {
      if (!bySession.has(e.sessionId)) bySession.set(e.sessionId, []);
      bySession.get(e.sessionId).push(e);
    }
    const list = [...bySession.values()]
      .map(summarizeSession)
      .filter(Boolean)
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, limit);
    return res.json(ok({ sessions: list }));
  } catch (err) {
    console.error("[Analytics] sessions error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function sessionDetail(req, res) {
  try {
    const id = String(req.params.id || "");
    if (!/^[A-Za-z0-9_:\-.]{1,128}$/.test(id)) return fail(res, 400, "invalid session id");
    const r = await guardRange(req, res);
    if (!r) return;
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r, limit: 5000 });
    const mine = rows.filter((e) => e.sessionId === id);
    if (!mine.length) return fail(res, 404, "session not found in range");
    const summary = summarizeSession(mine);
    const timeline = [...mine]
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((e) => ({
        eventType: e.eventType,
        at: e.createdAt,
        path: e.path || "",
        value: e.value,
        x: e.x, y: e.y,
        metadata: e.metadata || {},
      }));
    return res.json(ok({ session: summary, timeline }));
  } catch (err) {
    console.error("[Analytics] sessionDetail error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function visitors(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r });
    const byVisitor = new Map();
    for (const e of rows) {
      if (!byVisitor.has(e.visitorId)) byVisitor.set(e.visitorId, []);
      byVisitor.get(e.visitorId).push(e);
    }
    const list = [...byVisitor.values()]
      .map(summarizeVisitor)
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
      .slice(0, limit);
    return res.json(ok({ visitors: list }));
  } catch (err) {
    console.error("[Analytics] visitors error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function eventTypes(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r });
    return res.json(ok({ events: summarizeEventTypes(rows) }));
  } catch (err) {
    console.error("[Analytics] eventTypes error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function content(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r });
    return res.json(ok({ content: summarizeContent(rows).slice(0, limit) }));
  } catch (err) {
    console.error("[Analytics] content error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function campaigns(req, res) {
  try {
    const r = await guardRange(req, res);
    if (!r) return;
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r });
    return res.json(ok({ campaigns: summarizeCampaigns(rows) }));
  } catch (err) {
    console.error("[Analytics] campaigns error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function realtime(req, res) {
  try {
    const models = getModels();
    const from = new Date(Date.now() - 60 * 1000);
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { from, to: new Date() });
    const sessions = new Set(rows.map((e) => e.sessionId));
    const recent = [...rows]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 25)
      .map((e) => ({ eventType: e.eventType, at: e.createdAt, path: e.path || "", device: e.device || "" }));
    return res.json(ok({ activeSessions: sessions.size, events: rows.length, recent }));
  } catch (err) {
    console.error("[Analytics] realtime error:", err.message);
    return fail(res, 500, "query failed");
  }
}

async function exportReport(req, res) {
  try {
    const body = req.body || {};
    const format = String(body.format || req.query.format || "csv").toLowerCase();
    if (format !== "csv") return fail(res, 400, "only csv export is supported");
    const r = parseRange({ from: body.from || req.query.from, to: body.to || req.query.to });
    if (!r.ok) return fail(res, 400, r.error);
    const models = getModels();
    const rows = await fetchEvents(models.AnalyticsEvent, getDbType(), { ...r, types: ["page_view"] });
    const overview = computeOverview(rows);
    const pages = computePages(rows);
    const lines = [
      ["metric", "value"],
      ["from", dayKey(r.from)],
      ["to", dayKey(r.to)],
      ["page_views", overview.page_views],
      ["sessions", overview.sessions],
      ["unique_users", overview.unique_users],
      ["bounce_rate", overview.bounce_rate],
      ["avg_session_duration_s", overview.avg_session_duration],
      [],
      ["page", "views", "avg_duration_s", "exit_rate_pct"],
      ...pages.map((p) => [p.page, p.views, p.avg_duration ?? "", p.exit_rate ?? ""]),
    ];
    const csv = rowsToCSV(lines);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="analytics-${dayKey(r.from)}-to-${dayKey(r.to)}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error("[Analytics] export error:", err.message);
    return fail(res, 500, "export failed");
  }
}

// Public runtime config: what the visitor script may know (never secrets).
async function publicConfig(req, res) {
  try {
    const settings = await settingsSnapshot();
    const a = (settings && settings.analytics) || {};
    return res.json(ok({
      enabled: a.analyticsEnabled !== false,
      consentRequired: a.cookieConsentRequired !== false,
      endpoint: "/acr/api/analytics/collect",
    }));
  } catch (err) {
    return fail(res, 500, "config unavailable");
  }
}

module.exports = {
  collect,
  overview,
  timeseries,
  pages,
  sources,
  devices,
  insights,
  dismissInsight,
  anomalies,
  heatmap,
  sessions,
  sessionDetail,
  visitors,
  eventTypes,
  content,
  campaigns,
  realtime,
  exportReport,
  publicConfig,
  // Pure helpers (tested without a database)
  validateEvent,
  channelFromReferrer,
  parseDevice,
  hashIp,
  parseRange,
  bucketize,
  groupSessions,
  computeOverview,
  computePages,
  computeSources,
  computeDevices,
  computeInsights,
  computeAnomalies,
  rowsToCSV,
  cleanMetadata,
  binHeatmap,
  binScrollHeatmap,
  summarizeSession,
  summarizeVisitor,
  summarizeEventTypes,
  summarizeCampaigns,
  summarizeContent,
};
