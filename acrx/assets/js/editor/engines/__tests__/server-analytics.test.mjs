import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Analytics backend unit tests: validation, classification, ranges,
// aggregation and rules — all without a database (pure controller helpers).

const require = createRequire(import.meta.url);
const ctrl = require("../../../../../../src/controllers/analyticsController.js");

function pv(sessionId, path, at, extra = {}) {
  return {
    sessionId, visitorId: `v-${sessionId}`, path,
    referrer: "", channel: "direct", device: "desktop",
    createdAt: new Date(at), ...extra,
  };
}

describe("analytics ingestion validation", () => {
  it("accepts a well-formed batch event", () => {
    const r = ctrl.validateEvent({
      event_type: "page_view", visitor_id: "v1", session_id: "s1",
      page_view_id: "p1", url: "https://site.co/post/a", path: "/post/a",
      referrer: "https://google.com/", metadata: { postSlug: "a" },
    });
    assert.equal(r.ok, true);
    assert.equal(r.event.path, "/post/a");
    assert.deepEqual(r.event.metadata, { postSlug: "a" });
    assert.ok(r.event.eventId, "server stamps an id");
  });

  it("rejects invalid, oversized and malicious payloads", () => {
    assert.equal(ctrl.validateEvent(null).ok, false);
    assert.equal(ctrl.validateEvent({}).ok, false);
    assert.equal(ctrl.validateEvent({ event_type: "nope\"; DROP", visitor_id: "v", session_id: "s", url: "/x" }).ok, false);
    assert.equal(ctrl.validateEvent({ event_type: "page_view", visitor_id: "v!", session_id: "s", url: "/x" }).ok, false);
    assert.equal(ctrl.validateEvent({ event_type: "page_view", visitor_id: "v", session_id: "s", url: "not a url\r\n<x>" }).ok, false);
    assert.equal(ctrl.validateEvent({ event_type: "page_view", visitor_id: "v", session_id: "s", url: "/x", metadata: { a: "b".repeat(9000) } }).ok, false);
    const evil = ctrl.validateEvent({
      event_type: "click", visitor_id: "v", session_id: "s", url: "/x",
      metadata: { __proto__: { p: 1 }, ok: "yes", deep: { deep: { deep: { deep: { deep: "gone" } } } } },
    });
    assert.equal(evil.ok, true);
    assert.deepEqual(Object.keys(evil.event.metadata), ["ok", "deep"]);
    // Object nesting truncates past depth 3; the 4th level is emptied.
    assert.deepEqual(evil.event.metadata.deep, { deep: { deep: { deep: {} } } });
  });
});

describe("analytics classification", () => {
  it("channels referrers honestly", () => {
    assert.equal(ctrl.channelFromReferrer("", "site.co"), "direct");
    assert.equal(ctrl.channelFromReferrer("https://site.co/other", "site.co"), "internal");
    assert.equal(ctrl.channelFromReferrer("https://www.google.com/search?q=x", "site.co"), "search");
    assert.equal(ctrl.channelFromReferrer("https://t.co/abc", "site.co"), "social");
    assert.equal(ctrl.channelFromReferrer("https://blog.other.co/p", "site.co"), "referral");
    assert.equal(ctrl.channelFromReferrer("javascript:evil()", "site.co"), "direct");
  });

  it("parses devices without a library", () => {
    assert.equal(ctrl.parseDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile/15E148 Safari/604.1").device, "mobile");
    assert.equal(ctrl.parseDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36").browser, "Chrome");
    assert.equal(ctrl.parseDevice("").device, "desktop");
  });

  it("hashes IPs instead of storing them", () => {
    const a = ctrl.hashIp("1.2.3.4");
    assert.equal(a, ctrl.hashIp("1.2.3.4"));
    assert.ok(!a.includes("1.2.3.4") && a.length === 64);
  });
});

describe("analytics ranges", () => {
  it("defaults to 7 days, validates and caps", () => {
    const d = ctrl.parseRange({});
    assert.equal(d.ok, true);
    assert.ok(d.to - d.from <= 7 * 86400000);
    assert.equal(ctrl.parseRange({ from: "2026-09-10", to: "2026-09-01" }).ok, false);
    assert.equal(ctrl.parseRange({ from: "2020-01-01", to: "2026-09-11" }).ok, false);
    assert.equal(ctrl.parseRange({ from: "not-a-date", to: "2026-09-11" }).ok, true);
    const exact = ctrl.parseRange({ from: "2026-09-01", to: "2026-09-02" });
    assert.ok(exact.ok && exact.from < exact.to);
  });
});

describe("analytics aggregation", () => {
  const rows = [
    pv("s1", "/a", "2026-09-01T10:00:00Z"),
    pv("s1", "/b", "2026-09-01T10:02:00Z"),
    pv("s2", "/a", "2026-09-01T11:00:00Z"),
    pv("s3", "/a", "2026-09-02T10:00:00Z", { device: "mobile", referrer: "https://google.com/", channel: "search" }),
  ];

  it("overview counts sessions, users, bounce and duration", () => {
    const o = ctrl.computeOverview(rows);
    assert.deepEqual([o.page_views, o.sessions, o.unique_users], [4, 3, 3]);
    assert.equal(o.bounce_rate, 66.7);
    assert.equal(o.avg_session_duration, 120);
  });

  it("pages rank with exits", () => {
    const pages = ctrl.computePages(rows);
    assert.equal(pages[0].page, "/a");
    assert.equal(pages[0].views, 3);
    const b = pages.find((p) => p.page === "/b");
    assert.equal(b.exit_rate, 100);
  });

  it("sources split referrers and channels", () => {
    const s = ctrl.computeSources(rows);
    assert.deepEqual(s.channels.find((c) => c.channel === "search"), { channel: "search", sessions: 1 });
    assert.deepEqual(s.referrers, [{ referrer: "https://google.com/", sessions: 1 }]);
  });

  it("devices group and timeseries buckets", () => {
    assert.deepEqual(ctrl.computeDevices(rows).device_types,
      [{ type: "desktop", count: 3 }, { type: "mobile", count: 1 }]);
    assert.deepEqual(ctrl.bucketize(rows, "daily"),
      [{ timestamp: "2026-09-01", value: 3 }, { timestamp: "2026-09-02", value: 1 }]);
  });

  it("empty data yields empty insights, never fabrications", () => {
    const from = new Date("2026-09-01"), to = new Date("2026-09-02");
    assert.deepEqual(ctrl.computeInsights({ overview: ctrl.computeOverview([]), pages: [], timeseries: [], from, to }), []);
    assert.deepEqual(ctrl.computeAnomalies({ timeseries: [], from, to }), []);
  });

  it("detects spikes and trends from real numbers", () => {
    const from = new Date("2026-09-01"), to = new Date("2026-09-08");
    const series = ["01", "02", "03", "04", "05", "06", "07", "08"].map((d, i) => ({
      timestamp: `2026-09-${d}`, value: i === 5 ? 100 : 10,
    }));
    const anomalies = ctrl.computeAnomalies({ timeseries: series, from, to });
    assert.equal(anomalies.length, 1);
    assert.ok(anomalies[0].insight.includes("2026-09-06"));
    const insights = ctrl.computeInsights({
      overview: { sessions: 50, bounce_rate: 80, page_views: 60, unique_users: 40, avg_session_duration: 5 },
      pages: [{ page: "/hot", views: 40 }],
      timeseries: series, from, to,
    });
    assert.ok(insights.some((i) => i.insight_type === "trend"));
    assert.ok(insights.some((i) => i.insight_type === "recommendation"));
    assert.ok(insights.every((i) => /^[a-f0-9]{32}$/.test(i.id)), "dismissable stable keys");
  });

  it("builds safe CSV", () => {
    const csv = ctrl.rowsToCSV([["a", 'b"c,d'], ["e\nf", 1]]);
    assert.equal(csv, 'a,"b""c,d"\n"e\nf",1');
  });
});
