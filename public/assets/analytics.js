/* public/assets/analytics.js
 *
 * Acroxa public visitor analytics runtime. Vanilla JS, no dependencies.
 * Served at /assets/analytics.js and injected only on live public pages
 * (never /acrx, never previews) by the layout engine.
 *
 * Privacy-first: anonymous visitor/session ids, consent-gated, DNT-aware,
 * no raw IPs client-side, no sensitive input capture. Every failure path
 * is silent — analytics must never break the visitor's page.
 *
 * Widget/layout integration: AcroxaAnalytics.track("cta_click", {...})
 */

(function () {
  "use strict";

  if (window.__ACRX_ANALYTICS_BOOTED__) return;
  window.__ACRX_ANALYTICS_BOOTED__ = true;

  var ADMIN_PREFIXES = ["/acrx", "/acr/api"];
  var CONSENT_KEY = "acrx_consent";
  var VID_KEY = "acrx_vid";
  var SID_KEY = "acrx_sid";
  var SID_TS_KEY = "acrx_sid_ts";
  var SESSION_TTL_MS = 30 * 60 * 1000;
  var FLUSH_SIZE = 20;
  var FLUSH_MS = 10000;
  var SCROLL_MARKS = [25, 50, 75, 90, 100];

  var bootCfg = window.__ACRX_ANALYTICS__ || {};
  var endpoint = bootCfg.endpoint || "/acr/api/analytics/collect";
  var configUrl = "/acr/api/analytics/config";

  var state = {
    ready: false,
    enabled: false,
    consentRequired: true,
    visitorId: null,
    sessionId: null,
    pageViewId: null,
    queue: [],
    timer: 0,
    scrollDone: {},
    visibleSince: 0,
    visibleMs: 0,
    mediaDone: {},
    formSeen: {},
    lastClick: { t: 0, x: -1, y: -1, n: 0 },
    deadClickTimer: 0,
    hoverSeen: {},
    observed: []
  };

  function safe(fn) {
    try { return fn(); } catch (e) { return undefined; }
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function storeGet(storage, key) {
    return safe(function () { return storage.getItem(key); }) || null;
  }

  function storeSet(storage, key, value) {
    safe(function () { storage.setItem(key, value); });
  }

  function storeDel(storage, key) {
    safe(function () { storage.removeItem(key); });
  }

  // ── Coarse, site-scoped device signature for analytics/debugging only ──
  // Composed of non-sensitive, legitimate browser characteristics so repeated
  // sessions on the same device can be recognized loosely. This is NOT a
  // cross-site fingerprint; it never reads canvas/audio and never defeats
  // consent (it is only produced/transmitted while enabled).
  var _sig = null;
  function deviceSignature() {
    if (_sig) return _sig;
    var parts = [];
    try {
      var ua = navigator.userAgent || "";
      var m = /(?:firefox|edg|opr|chrome|safari)\/(\d+)/i.exec(ua);
      parts.push(m ? ("br:" + m[0].split("/")[0].toLowerCase() + ":" + m[1]) : "br:unknown");
      parts.push("os:" + (/windows/i.test(ua) ? "win" : /android/i.test(ua) ? "android" : /iphone|ipad|ipod/i.test(ua) ? "ios" : /mac os|macintosh/i.test(ua) ? "mac" : /linux/i.test(ua) ? "linux" : "other"));
      parts.push("dpr:" + Math.round((window.devicePixelRatio || 1) * 10) / 10);
      parts.push("lang:" + (navigator.language || "").slice(0, 8));
      parts.push("tz:" + (Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone || "" : ""));
      parts.push("touch:" + (("ontouchstart" in window) || navigator.maxTouchPoints > 0 ? 1 : 0));
    } catch (e) { /* ignore */ }
    _sig = parts.join("|").slice(0, 64);
    return _sig;
  }

  function isAdminPath() {
    var path = String(window.location.pathname || "");
    for (var i = 0; i < ADMIN_PREFIXES.length; i++) {
      if (path === ADMIN_PREFIXES[i] || path.indexOf(ADMIN_PREFIXES[i] + "/") === 0) return true;
    }
    var meta = document.querySelector('meta[name="acrx-analytics"]');
    if (meta && String(meta.getAttribute("content") || "").toLowerCase() === "off") return true;
    return false;
  }

  function dntOn() {
    var dnt = navigator.doNotTrack || window.doNotTrack;
    return dnt === "1" || dnt === 1;
  }

  function consentState() {
    return storeGet(window.localStorage, CONSENT_KEY);
  }

  function clearIdentity() {
    storeDel(window.localStorage, VID_KEY);
    storeDel(window.sessionStorage, SID_KEY);
    storeDel(window.sessionStorage, SID_TS_KEY);
    state.visitorId = null;
    state.sessionId = null;
  }

  // ── Events ──────────────────────────────────────────────────────────

  function enqueue(type, extra) {
    if (!state.ready) return;
    var base = {
      event_id: uuid(),
      event_type: type,
      visitor_id: state.visitorId,
      session_id: state.sessionId,
      page_view_id: state.pageViewId,
      timestamp: Date.now(),
      url: String(window.location.href).slice(0, 2048),
      path: String(window.location.pathname).slice(0, 512),
      referrer: String(document.referrer || "").slice(0, 2048),
      viewport_w: window.innerWidth || null,
      viewport_h: window.innerHeight || null,
      doc_w: safe(function () { return document.documentElement.scrollWidth || null; }) || null,
      doc_h: safe(function () { return document.documentElement.scrollHeight || null; }) || null,
      device_signature: deviceSignature(),
      metadata: {},
    };
    if (extra && typeof extra === "object") {
      for (var k in extra) {
        if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
        if (k === "metadata" && extra.metadata && typeof extra.metadata === "object") {
          base.metadata = extra.metadata;
        } else if (k === "value" || k === "x" || k === "y") {
          base[k] = extra[k];
        }
      }
    }
    if (bootCfg.postId) base.metadata.postId = String(bootCfg.postId).slice(0, 64);
    if (bootCfg.postSlug) base.metadata.postSlug = String(bootCfg.postSlug).slice(0, 256);
    state.queue.push(base);
    if (state.queue.length >= FLUSH_SIZE) flush(false);
    else scheduleFlush();
  }

  function payload() {
    return JSON.stringify({ events: state.queue });
  }

  function flush(useBeacon) {
    if (!state.queue.length) return;
    var body = payload();
    state.queue = [];
    if (state.timer) { clearTimeout(state.timer); state.timer = 0; }
    var sent = false;
    if (useBeacon && navigator.sendBeacon) {
      sent = safe(function () {
        return navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      }) || false;
    }
    if (!sent) {
      safe(function () {
        if (useBeacon && typeof fetch === "function") {
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body,
            keepalive: true,
          }).catch(function () {});
        } else if (typeof fetch === "function") {
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body,
          }).catch(function () {});
        }
      });
    }
  }

  function scheduleFlush() {
    if (state.timer || !state.queue.length) return;
    state.timer = setTimeout(function () {
      state.timer = 0;
      flush(false);
    }, FLUSH_MS);
  }

  // ── Identity ────────────────────────────────────────────────────────

  function ensureIdentity() {
    var vid = storeGet(window.localStorage, VID_KEY);
    if (!vid) {
      vid = uuid();
      storeSet(window.localStorage, VID_KEY, vid);
    }
    state.visitorId = vid;
    var sid = storeGet(window.sessionStorage, SID_KEY);
    var sts = parseInt(storeGet(window.sessionStorage, SID_TS_KEY) || "0", 10);
    var fresh = false;
    if (!sid || !sts || Date.now() - sts > SESSION_TTL_MS) {
      sid = uuid();
      fresh = true;
      storeSet(window.sessionStorage, SID_KEY, sid);
    }
    storeSet(window.sessionStorage, SID_TS_KEY, String(Date.now()));
    state.sessionId = sid;
    state.pageViewId = uuid();
    return fresh;
  }

  // ── Engagement ──────────────────────────────────────────────────────

  function scrollDepth() {
    var el = document.documentElement;
    var max = (el.scrollHeight || 1) - (window.innerHeight || 1);
    if (max <= 0) return 100;
    var y = window.scrollY || window.pageYOffset || 0;
    return Math.max(0, Math.min(100, Math.round((y / max) * 100)));
  }

  var scrollQueued = false;
  function onScroll() {
    if (scrollQueued || !state.ready) return;
    scrollQueued = true;
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 200); };
    raf(function () {
      scrollQueued = false;
      var depth = scrollDepth();
      for (var i = 0; i < SCROLL_MARKS.length; i++) {
        var mark = SCROLL_MARKS[i];
        if (depth >= mark && !state.scrollDone[mark]) {
          state.scrollDone[mark] = true;
          enqueue("scroll", { value: mark });
        }
      }
    });
  }

  function markVisible() {
    state.visibleSince = Date.now();
  }

  function markHidden() {
    if (state.visibleSince) {
      state.visibleMs += Date.now() - state.visibleSince;
      state.visibleSince = 0;
    }
  }

  function onVisibility() {
    if (!state.ready) return;
    if (document.visibilityState === "hidden") {
      markHidden();
      flush(true);
    } else {
      markVisible();
    }
  }

  function onPageHide() {
    if (!state.ready) return;
    markHidden();
    if (state.visibleMs > 0) {
      // time_on_page bypasses the queue: the page is going away.
      state.queue.push({
        event_id: uuid(),
        event_type: "time_on_page",
        visitor_id: state.visitorId,
        session_id: state.sessionId,
        page_view_id: state.pageViewId,
        timestamp: Date.now(),
        url: String(window.location.href).slice(0, 2048),
        path: String(window.location.pathname).slice(0, 512),
        referrer: String(document.referrer || "").slice(0, 2048),
        value: Math.round(state.visibleMs / 1000),
        metadata: {},
      });
    }
    flush(true);
  }

  // ── Clicks (delegated; never sensitive inputs) ──────────────────────

  function labelOf(el) {
    if (!el || !el.getAttribute) return "";
    var label = el.getAttribute("aria-label") || el.getAttribute("data-acrx-label") || "";
    if (!label && el.textContent) label = el.textContent.replace(/\s+/g, " ").trim();
    return String(label).slice(0, 120);
  }

  function onClick(e) {
    if (!state.ready) return;
    var t = e.target;
    if (!t || !t.closest) return;
    // Rage-click detection: N rapid clicks within a small spatial/temporal band.
    var now = Date.now();
    var cx = e.clientX != null ? e.clientX : -1;
    var cy = e.clientY != null ? e.clientY : -1;
    if (now - state.lastClick.t < 700 && cx >= 0 && state.lastClick.x >= 0 &&
        Math.abs(cx - state.lastClick.x) < 60 && Math.abs(cy - state.lastClick.y) < 60) {
      state.lastClick.n += 1;
      state.lastClick.t = now;
      if (state.lastClick.n >= 4) {
        state.lastClick.n = 0;
        enqueue("rage_click", {
          x: cx, y: cy,
          metadata: { label: labelOf(t), count: 4 },
        });
        return;
      }
    } else {
      state.lastClick = { t: now, x: cx, y: cy, n: 1 };
    }
    // Never instrument form fields themselves (passwords, text, choices).
    var field = t.closest("input, textarea, select");
    if (field) {
      var ftype = String(field.getAttribute("type") || "text").toLowerCase();
      if (ftype !== "submit" && ftype !== "button") return;
    }
    var tracked = t.closest("[data-acrx-track]");
    if (tracked) {
      var name = String(tracked.getAttribute("data-acrx-track") || "").slice(0, 48);
      if (/^[a-z][a-z0-9_:.-]{0,47}$/.test(name)) {
        enqueue(name.indexOf("_") > -1 || name.indexOf(":") > -1 ? name : "custom", {
          metadata: { widget: name, label: labelOf(tracked) },
        });
      }
      return;
    }
    var link = t.closest("a[href]");
    var button = t.closest("button");
    if (!link && !button) return;
    var meta = {};
    if (link) {
      var href = link.getAttribute("href") || "";
      meta.href = href.slice(0, 512);
      meta.label = labelOf(link);
      meta.outbound = false;
      var m = /^https?:\/\/([^/:?#]+)/i.exec(href);
      if (m && m[1].toLowerCase() !== window.location.hostname.toLowerCase()) {
        meta.outbound = true;
        meta.host = m[1].toLowerCase().slice(0, 128);
        // Outbound navigation happens; if analytics data still arrives the
        // beacon race is acceptable. No dead-click signature for outbound.
      } else if (m) {
        meta.outbound = false;
      }
      enqueue(meta.outbound ? "outbound_click" : "click", {
        x: e.clientX != null ? e.clientX : null,
        y: e.clientY != null ? e.clientY : null,
        metadata: meta,
      });
      if (!meta.outbound) scheduleDeadClick(t, "a");
    } else {
      meta.label = labelOf(button);
      enqueue("click", {
        x: e.clientX != null ? e.clientX : null,
        y: e.clientY != null ? e.clientY : null,
        metadata: meta,
      });
      scheduleDeadClick(t, "button");
    }
  }

  // ── Dead-click heuristic (conservative): a click on an apparently ───────
  // interactive element with no navigation/state change shortly after. Marked
  // as a *signal*, never an absolute bug. Only fires for same-origin anchors
  // and buttons that aren't submit/type=submit and don't open dialogs.
  function scheduleDeadClick(el, kind) {
    var id = el;
    var href = el.getAttribute ? (el.getAttribute("href") || "") : "";
    var isSubmit = el.closest && el.closest("form") && (
      (el.getAttribute && el.getAttribute("type") === "submit") ||
      (el.tagName === "BUTTON" && !el.getAttribute("href"))
    );
    if (isSubmit) return;
    if (el.getAttribute && el.getAttribute("data-acrx-no-dead") === "1") return;
    var startHref = String(window.location.href);
    clearTimeout(state.deadClickTimer);
    state.deadClickTimer = setTimeout(function () {
      if (!state.ready) return;
      var moved = String(window.location.href) !== startHref;
      var opened = el.getAttribute && (el.getAttribute("aria-expanded") === "true" || el.classList && el.classList.contains("open"));
      if (!moved && !opened) {
        enqueue("dead_click", {
          metadata: { label: labelOf(el), kind: kind, href: href.slice(0, 512) },
        });
      }
    }, 700);
  }

  // ── Additional trackers (visibility attention, media, form, downloads,
  //    errors, performance) — all consent-gated via state.ready and delegated.
  // ───────────────────────────────────────────────────────────────────────

  function setupAttentionTracking() {
    // Intersection: coarse visibility of semantic content blocks + CTAs.
    if (!("IntersectionObserver" in window)) return;
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      if (!state.ready) return;
      for (var i = 0; i < entries.length; i++) {
        var en = entries[i];
        if (!en.isIntersecting) continue;
        var el = en.target;
        var id = el.getAttribute("data-acrx-vis") || el.getAttribute("id") ||
          (el.className && typeof el.className === "string" ? el.className.split(" ")[0] : "");
        id = String(id).slice(0, 48);
        if (!id || seen[id]) continue;
        seen[id] = true;
        var kind = el.getAttribute("data-acrx-vis-kind") || "block";
        enqueue("visibility", {
          metadata: { target: id, kind: kind, ratio: Math.round(en.intersectionRatio * 100) },
        });
      }
    }, { threshold: [0.25, 0.5, 0.75] });
    var els = document.querySelectorAll("[data-acrx-vis], article, section[data-acrx-vis], .wdg-cta, .wdg-hero, .wdg-pricing, .wdg-faq");
    for (var j = 0; j < els.length && j < 40; j++) {
      try { io.observe(els[j]); state.observed.push(els[j]); } catch (e) { /* ignore */ }
    }
  }

  function setupMediaTracking() {
    document.addEventListener("play", function (e) {
      if (!state.ready) return;
      var el = e.target;
      if (!el || !el.closest || el.tagName !== "VIDEO" && el.tagName !== "AUDIO") return;
      trackMedia(el, "media_play", 0);
    }, true);
    document.addEventListener("pause", function (e) {
      if (!state.ready) return;
      var el = e.target;
      if (!el || !el.closest || el.tagName !== "VIDEO" && el.tagName !== "AUDIO") return;
      var d = el.duration || 0;
      var cur = el.currentTime || 0;
      var pct = d > 0 ? Math.round((cur / d) * 100) : 0;
      trackMedia(el, "media_pause", pct);
    }, true);
    document.addEventListener("ended", function (e) {
      if (!state.ready) return;
      var el = e.target;
      if (!el || !el.closest || el.tagName !== "VIDEO" && el.tagName !== "AUDIO") return;
      trackMedia(el, "media_complete", 100);
    }, true);
    document.addEventListener("timeupdate", function (e) {
      if (!state.ready) return;
      var el = e.target;
      if (!el || !el.closest || el.tagName !== "VIDEO" && el.tagName !== "AUDIO") return;
      var d = el.duration || 0;
      if (!d) return;
      var pct = Math.round((el.currentTime / d) * 100);
      var key = (el.getAttribute("data-acrx-media") || "media") + ":" + el.currentSrc;
      for (var m = 25; m <= 100; m += 25) {
        if (pct >= m && !state.mediaDone[key + ":" + m]) {
          state.mediaDone[key + ":" + m] = true;
          trackMedia(el, "media_seek", m);
        }
      }
    }, true);
  }

  function trackMedia(el, type, value) {
    var id = el.getAttribute("data-acrx-media") || el.getAttribute("id") || "media";
    enqueue(type, {
      value: value,
      metadata: { mediaId: String(id).slice(0, 64), label: (el.getAttribute("aria-label") || el.getAttribute("title") || "").slice(0, 120) },
    });
  }

  function setupFormTracking() {
    document.addEventListener("focusin", function (e) {
      if (!state.ready) return;
      var el = e.target;
      if (!el || !el.closest) return;
      var field = el.closest("input, textarea, select");
      if (!field) return;
      // Never record values; only safe type + form identity.
      if (/password|email|tel|credit|card/i.test(field.name || field.id || "")) return;
      var form = field.closest("form");
      var fid = form ? (form.getAttribute("data-acrx-form") || form.id || "form") : "form";
      var key = String(fid).slice(0, 48) + ":";
      if (!state.formSeen[fid]) {
        state.formSeen[fid] = true;
        enqueue("form_view", { metadata: { formId: String(fid).slice(0, 64) } });
      }
      enqueue("form_start", {
        metadata: { formId: String(fid).slice(0, 64), fieldType: String(field.type || "text").slice(0, 32) },
      });
    }, true);
    document.addEventListener("submit", function (e) {
      if (!state.ready) return;
      var form = e.target;
      if (!form || form.tagName !== "FORM") return;
      var fid = form.getAttribute("data-acrx-form") || form.id || "form";
      enqueue("form_submit", { metadata: { formId: String(fid).slice(0, 64) } });
    }, true);
  }

  function setupDownloadTracking() {
    document.addEventListener("click", function (e) {
      if (!state.ready) return;
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (!/\.(pdf|zip|rar|7z|tar|gz|docx?|xlsx?|pptx?|csv|txt|mp3|mp4|mov|png|jpe?g|svg|webp)$/i.test(href)) return;
      var ext = (href.match(/\.([a-z0-9]+)(?:[?#]|$)/i) || [])[1] || "";
      enqueue("download", {
        metadata: { href: href.slice(0, 512), ext: ext.toLowerCase(), label: labelOf(a) },
      });
    }, false);
  }

  function setupErrorTracking() {
    var reported = {};
    function report(type, msg) {
      if (!state.ready) return;
      var key = String(msg).slice(0, 200);
      if (reported[key]) return; // de-dupe error storms
      reported[key] = true;
      enqueue("error", { metadata: { type: type, message: key } });
    }
    var onErr = function (ev) {
      if (!state.ready) return;
      var m = (ev.message || (ev.error && ev.error.message) || "unknown error").slice(0, 300);
      report("js", m);
    };
    var onRej = function (ev) {
      if (!state.ready) return;
      var m = (ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason || "rejection")).slice(0, 300);
      report("promise", m);
    };
    var onResErr = function (e) {
      if (!state.ready) return;
      var el = e.target;
      if (el && (el.tagName === "IMG" || el.tagName === "SCRIPT" || el.tagName === "LINK")) {
        var src = (el.src || el.href || "").split("?")[0];
        report("resource", src.slice(-200));
      }
    };
    window.addEventListener("error", onErr, true);
    window.addEventListener("unhandledrejection", onRej, true);
    window.addEventListener("error", onResErr, true);
  }

  function setupPerformanceTracking() {
    if (!("PerformanceObserver" in window)) return;
    var sent = {};
    function sendOnce(name, value, decimals) {
      if (sent[name] || value == null) return;
      sent[name] = true;
      enqueue("perf", {
        value: decimals ? Math.round(value * 10) / 10 : Math.round(value),
        metadata: { metric: name },
      });
    }
    try {
      var lcpObs = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        var last = entries[entries.length - 1];
        if (last) sendOnce("lcp", last.startTime, 0);
      });
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
      var clsObs = new PerformanceObserver(function (list) {
        var v = 0;
        list.getEntries().forEach(function (e) { if (!e.hadRecentInput) v += e.value; });
        if (v > 0) sendOnce("cls", v, 3);
      });
      clsObs.observe({ type: "layout-shift", buffered: true });
    } catch (e) { /* ignore */ }
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      if (nav) {
        sendOnce("ttfb", nav.responseStart, 0);
        sendOnce("dom_interactive", nav.domInteractive, 0);
        sendOnce("load", nav.loadEventEnd, 0);
      }
    } catch (e) { /* ignore */ }
  }

  function setupCampaignTracking() {
    try {
      var q = window.location.search || "";
      var p = new URLSearchParams(q);
      var utm = {};
      var has = false;
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (k) {
        var v = p.get(k);
        if (v) { utm[k] = String(v).slice(0, 128); has = true; }
      });
      if (has && state.ready) {
        enqueue("campaign", { metadata: utm });
      }
    } catch (e) { /* ignore */ }
  }

  // ── Consent banner (only when required + undecided) ─────────────────
  function dismissBanner() {
    var b = document.getElementById("acrx-consent-banner");
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function showBanner() {
    if (document.getElementById("acrx-consent-banner")) return;
    var bar = document.createElement("div");
    bar.id = "acrx-consent-banner";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-live", "polite");
    bar.setAttribute("aria-label", "Cookie consent");
    bar.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;" +
      "display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;" +
      "padding:12px 16px;border-radius:12px;font:14px/1.5 system-ui,sans-serif;" +
      "background:#111827;color:#f9fafb;box-shadow:0 8px 30px rgba(0,0,0,.35);";
    var msg = document.createElement("span");
    msg.textContent = "We use privacy-friendly analytics to improve this site. Accept to help us understand visits.";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;";
    var ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = "Accept";
    ok.style.cssText = "padding:8px 16px;border:0;border-radius:8px;cursor:pointer;background:#6366f1;color:#fff;font-weight:600;";
    var no = document.createElement("button");
    no.type = "button";
    no.textContent = "Decline";
    no.style.cssText = "padding:8px 16px;border:1px solid #4b5563;border-radius:8px;cursor:pointer;background:transparent;color:#f9fafb;";
    ok.addEventListener("click", function () { setConsent(true); });
    no.addEventListener("click", function () { setConsent(false); });
    row.appendChild(ok);
    row.appendChild(no);
    bar.appendChild(msg);
    bar.appendChild(row);
    document.body.appendChild(bar);
  }

  function setConsent(granted) {
    storeSet(window.localStorage, CONSENT_KEY, granted ? "granted" : "denied");
    dismissBanner();
    if (!granted) {
      clearIdentity();
      state.ready = false;
      state.queue = [];
      state.mediaDone = {};
      state.formSeen = {};
      return;
    }
    startTracking();
  }

  // ── Boot ────────────────────────────────────────────────────────────

  function startTracking() {
    if (state.ready) return;
    var freshSession = ensureIdentity();
    if (!state.visitorId || !state.sessionId) return;
    state.ready = true;
    state.visibleMs = 0;
    state.scrollDone = {};
    state.mediaDone = {};
    state.formSeen = {};
    markVisible();
    if (freshSession) enqueue("session_start", {});
    enqueue("page_view", { metadata: { title: String(document.title || "").slice(0, 256) } });
    document.addEventListener("scroll", onScroll, { passive: true, capture: false });
    document.addEventListener("click", onClick, false);
    document.addEventListener("visibilitychange", onVisibility, false);
    window.addEventListener("pagehide", onPageHide, false);
    setupAttentionTracking();
    setupMediaTracking();
    setupFormTracking();
    setupDownloadTracking();
    setupErrorTracking();
    setupPerformanceTracking();
    setupCampaignTracking();
    scheduleFlush();
  }

  function init() {
    if (state.ready || isAdminPath() || dntOn()) return;
    var cfg = null;
    var done = function (c) {
      cfg = c || {};
      state.enabled = cfg.enabled !== false;
      state.consentRequired = cfg.consentRequired !== false;
      if (!state.enabled) return;
      var consent = consentState();
      if (consent === "denied") return;
      if (state.consentRequired && consent !== "granted") {
        showBanner();
        return;
      }
      startTracking();
    };
    safe(function () {
      if (typeof fetch !== "function") { done({}); return; }
      fetch(configUrl, { headers: { Accept: "application/json" } })
        .then(function (res) { return res.ok ? res.json() : {}; })
        .then(function (json) { done((json && json.data) || {}); })
        .catch(function () { done({}); });
    });
  }

  // Public widget/layout API: AcroxaAnalytics.track("cta_click", {...}).
  // Safe to call when analytics is disabled — it simply records nothing.
  window.AcroxaAnalytics = window.AcroxaAnalytics || {
    init: init,
    track: function (name, metadata) {
      if (!state.ready) return false;
      if (typeof name !== "string" || !/^[a-z][a-z0-9_:.-]{0,47}$/.test(name)) return false;
      var clean = {};
      if (metadata && typeof metadata === "object") {
        for (var k in metadata) {
          if (!Object.prototype.hasOwnProperty.call(metadata, k)) continue;
          if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(k)) continue;
          var v = metadata[k];
          if (typeof v === "string") clean[k] = v.slice(0, 512);
          else if (typeof v === "number" && isFinite(v)) clean[k] = v;
          else if (typeof v === "boolean") clean[k] = v;
        }
      }
      enqueue(/^(widget|cta|custom|form|video|tabs|faq|pricing|hero)[_:]/.test(name) ? name : "custom", {
        metadata: Object.assign({ widget: name }, clean),
      });
      return true;
    },
    consent: function (granted) { setConsent(!!granted); },
    reset: function () {
      clearIdentity();
      storeDel(window.localStorage, CONSENT_KEY);
      state.ready = false;
      state.queue = [];
      state.mediaDone = {};
      state.formSeen = {};
      _sig = null;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, false);
  } else {
    init();
  }
})();
