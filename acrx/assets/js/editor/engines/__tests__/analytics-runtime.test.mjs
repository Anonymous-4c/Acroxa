import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";

// Public analytics runtime: init-once, consent gating, batching, beacon
// transport and silent failure — exercised in jsdom with stubbed network.

const SRC = fs.readFileSync(
  path.join(process.cwd(), "public", "assets", "analytics.js"), "utf8"
);

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// Fresh browser per case: new DOM + fresh runtime instance.
function bootBrowser({ url = "https://site.co/post/a", config = null, dnt = false, preset = null } = {}) {
  const d = new JSDOM(`<!DOCTYPE html><html><head><title>Post A</title></head><body><main><a id="ext" href="https://other.co/x">Out</a><button id="btn">Go</button></main></body></html>`, {
    url,
    pretendToBeVisual: true,
  });
  const win = d.window;
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  if (preset) for (const [store, k, v] of preset) {
    (store === "local" ? localStorage : sessionStorage).setItem(k, v);
  }
  for (const [k, v] of [["localStorage", localStorage], ["sessionStorage", sessionStorage]]) {
    try { win[k] = v; }
    catch { try { Object.defineProperty(win, k, { value: v, configurable: true }); } catch { /* ignore */ } }
  }
  if (dnt) {
    try { Object.defineProperty(win.navigator, "doNotTrack", { value: "1", configurable: true }); } catch { /* ignore */ }
  }
  if (!win.crypto || typeof win.crypto.randomUUID !== "function") {
    try { win.crypto = { randomUUID: () => `uuid-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}` }; } catch { /* ignore */ }
  }
  const sent = { fetch: [] };
  const sandbox = {
    window: win,
    document: win.document,
    navigator: win.navigator,
    setTimeout,
    clearTimeout,
    fetch: async (endpoint, opts) => {
      if (String(endpoint).includes("/config")) {
        return { ok: true, json: async () => ({ status: "success", data: config || {} }) };
      }
      sent.fetch.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({}) };
    },
  };
  sandbox.window.fetch = sandbox.fetch;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
  const hide = async () => {
    win.dispatchEvent(new win.Event("pagehide"));
    await tick(30);
  };
  const allEvents = () => sent.fetch.flatMap((f) => f.events);
  return { d, win, sandbox, sent, localStorage, sessionStorage, tick, hide, allEvents };
}

describe("analytics runtime boot", () => {
  it("starts once: session_start + page_view, no duplicates on re-init", async () => {
    const b = bootBrowser({ config: { enabled: true, consentRequired: false } });
    await b.tick(50);
    await b.hide();
    const types = b.allEvents().map((e) => e.event_type).sort();
    assert.deepEqual(types.filter((t) => t !== "time_on_page").sort(), ["page_view", "session_start"]);
    const pv = b.allEvents().find((e) => e.event_type === "page_view");
    assert.equal(pv.metadata.title, "Post A");
    assert.ok(pv.visitor_id && pv.session_id && pv.page_view_id, "identity chain present");
    // Re-init must not duplicate listeners or page views.
    b.sandbox.window.AcroxaAnalytics.init();
    b.sandbox.window.AcroxaAnalytics.init();
    await b.hide();
    assert.equal(b.allEvents().filter((e) => e.event_type === "page_view").length, 1);
  });

  it("stays silent on admin paths and with DNT", async () => {
    const admin = bootBrowser({ url: "https://site.co/acrx/analytics", config: { enabled: true, consentRequired: false } });
    await admin.tick(50);
    await admin.hide();
    assert.equal(admin.sent.fetch.length, 0, "no tracking on /acrx");
    // The public API still exists (widgets call it safely) but stays inert.
    assert.equal(admin.sandbox.window.AcroxaAnalytics.track("cta_click", {}), false);
    const dnt = bootBrowser({ dnt: true, config: { enabled: true, consentRequired: false } });
    await dnt.tick(50);
    await dnt.hide();
    assert.equal(dnt.sent.fetch.length, 0, "DNT disables tracking");
  });

  it("exits when disabled server-side", async () => {
    const b = bootBrowser({ config: { enabled: false, consentRequired: false } });
    await b.tick(50);
    await b.hide();
    assert.equal(b.sent.fetch.length, 0);
  });
});

describe("analytics runtime consent", () => {
  it("gates on consent with a banner, honors accept and decline", async () => {
    const b = bootBrowser({ config: { enabled: true, consentRequired: true } });
    await b.tick(50);
    assert.equal(b.sent.fetch.length, 0, "nothing before consent");
    const banner = b.sandbox.document.getElementById("acrx-consent-banner");
    assert.ok(banner, "minimal banner shown when undecided");
    [...banner.querySelectorAll("button")][0].dispatchEvent(new b.win.MouseEvent("click", { bubbles: true }));
    await b.hide();
    assert.equal(b.localStorage.getItem("acrx_consent"), "granted");
    assert.ok(!b.sandbox.document.getElementById("acrx-consent-banner"), "banner dismissed");
    assert.ok(b.allEvents().some((e) => e.event_type === "page_view"), "tracking starts after accept");

    const b2 = bootBrowser({ config: { enabled: true, consentRequired: true } });
    await b2.tick(30);
    const banner2 = b2.sandbox.document.getElementById("acrx-consent-banner");
    [...banner2.querySelectorAll("button")][1].dispatchEvent(new b2.win.MouseEvent("click", { bubbles: true }));
    await b2.tick(30);
    await b2.hide();
    assert.equal(b2.localStorage.getItem("acrx_consent"), "denied");
    assert.equal(b2.sent.fetch.length, 0, "decline records nothing");
    assert.equal(b2.localStorage.getItem("acrx_vid"), null, "identifiers cleared on decline");
  });

  it("skips the banner when consent was already granted", async () => {
    const b = bootBrowser({
      config: { enabled: true, consentRequired: true },
      preset: [["local", "acrx_consent", "granted"]],
    });
    await b.tick(50);
    assert.ok(!b.sandbox.document.getElementById("acrx-consent-banner"));
    await b.hide();
    assert.ok(b.allEvents().some((e) => e.event_type === "page_view"));
  });
});

describe("analytics runtime events", () => {
  it("tracks outbound vs internal clicks with coordinates, single listener", async () => {
    const b = bootBrowser({ config: { enabled: true, consentRequired: false } });
    await b.tick(50);
    b.sandbox.document.getElementById("ext")
      .dispatchEvent(new b.win.MouseEvent("click", { bubbles: true, clientX: 120, clientY: 300 }));
    b.sandbox.document.getElementById("btn")
      .dispatchEvent(new b.win.MouseEvent("click", { bubbles: true }));
    await b.hide();
    const events = b.allEvents();
    const outbound = events.filter((e) => e.event_type === "outbound_click");
    assert.equal(outbound.length, 1, "exactly one outbound event (single delegated listener)");
    assert.equal(outbound[0].x, 120);
    assert.equal(outbound[0].metadata.label, "Out");
    assert.ok(events.some((e) => e.event_type === "click"), "internal click tracked");
  });

  it("records each scroll milestone once and time on hide", async () => {
    const b = bootBrowser({ config: { enabled: true, consentRequired: false } });
    await b.tick(50);
    // Unscrollable fixture: depth clamps to 100, firing every milestone once.
    b.sandbox.document.dispatchEvent(new b.sandbox.window.Event("scroll"));
    await b.tick(300);
    b.sandbox.document.dispatchEvent(new b.sandbox.window.Event("scroll"));
    await b.tick(300);
    await b.hide();
    const events = b.allEvents();
    const scrolls = events.filter((e) => e.event_type === "scroll");
    assert.deepEqual([...new Set(scrolls.map((e) => e.value))].sort((x, y) => x - y), [25, 50, 75, 90, 100]);
    for (const m of [25, 50, 75, 90, 100]) {
      assert.equal(scrolls.filter((e) => e.value === m).length, 1, `milestone ${m} emitted once`);
    }
    assert.ok(events.some((e) => e.event_type === "time_on_page"), "time_on_page emitted on hide");
  });

  it("public track() validates names and never throws when disabled", async () => {
    const b = bootBrowser({ config: { enabled: false, consentRequired: false } });
    await b.tick(30);
    assert.equal(b.sandbox.window.AcroxaAnalytics.track("cta_click", { widget: "hero" }), false);
    assert.equal(b.sent.fetch.length, 0);
    const ok = bootBrowser({ config: { enabled: true, consentRequired: false } });
    await ok.tick(50);
    assert.equal(ok.sandbox.window.AcroxaAnalytics.track("bogus name!", {}), false);
    assert.equal(ok.sandbox.window.AcroxaAnalytics.track("cta_click", { widget: "hero", n: 2 }), true);
    await ok.hide();
    const custom = ok.allEvents().filter((e) => e.event_type === "cta_click");
    assert.equal(custom.length, 1);
    assert.equal(custom[0].metadata.widget, "hero");
  });
});
