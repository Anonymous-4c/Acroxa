// src/AcroxaJS/tests/admin-resync.test.mjs
// Admin runtime restart-resync: a server reboot under an open tab must look
// like a realtime update (content swap), never demand a manual refresh.
// DB-free jsdom test with a phased fetch mock (old boot -> new boot).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "..", "acrx", "assets", "js", "acrx-admin-runtime.js"),
  "utf8"
);

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe("admin runtime restart resync", () => {
  it("swaps fresh content on boot change without a refresh demand", async () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><body><div id="acrx-content"><p>old dashboard</p></div></body>`,
      { url: "http://localhost/acrx/dashboard" }
    );
    const { window } = dom;
    const events = [];
    window.addEventListener("acrx:update", (e) => events.push(e.detail && e.detail.status));

    let phase = "old";
    const routes = {
      old: {
        ping: { rev: 72, bootId: "boot-old" },
        sync: { success: true, rev: 72, bootId: "boot-old", missed: [] },
        frag: { success: true, html: "<p>old dashboard</p>", rev: 72, css: [], js: [] },
      },
      new: {
        ping: { rev: 3, bootId: "boot-new" },
        sync: { success: true, rev: 3, bootId: "boot-new", missed: [] },
        frag: { success: true, html: "<p>fresh dashboard</p>", rev: 3, css: [], js: [] },
      },
    };
    const realFetch = globalThis.fetch;
    const realCustomEvent = globalThis.CustomEvent;
    const realCSS = globalThis.CSS;
    globalThis.fetch = async (url) => {
      const u = String(url);
      const r = routes[phase];
      const body = u.includes("_frag=content") ? r.frag : u.includes("/sync") ? r.sync : r.ping;
      return { ok: true, status: 200, json: async () => body };
    };
    globalThis.CustomEvent = window.CustomEvent;
    globalThis.CSS = { escape: (s) => String(s) };
    try {
      const run = new Function("window", "document", SRC);
      run(window, window.document);
      await tick(30); // initial ping (old boot) settles
      const stats = window.AcroxaAdminRuntime.stats();
      assert.equal(stats.rev, 72);

      phase = "new"; // server restarted under the open tab
      events.length = 0;
      await window.AcroxaAdminRuntime.sync();
      await tick(30);

      const container = window.document.getElementById("acrx-content");
      assert.ok(container.innerHTML.includes("fresh dashboard"), "content swapped to new boot render");
      assert.equal(container.hasAttribute("data-acrx-stale"), false, "no refresh demanded");
      assert.ok(events.includes("resync"), `resync traced, got [${events.join(",")}]`);
      assert.ok(events.includes("swapped"), `swap traced, got [${events.join(",")}]`);
      assert.ok(!events.includes("deferred"), "guard did not block a clean page");
    } finally {
      globalThis.fetch = realFetch;
      globalThis.CustomEvent = realCustomEvent;
      if (realCSS === undefined) delete globalThis.CSS;
      else globalThis.CSS = realCSS;
    }
  });

  it("marks stale only when the guard blocks the resync swap", async () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><body><div id="acrx-content"><input id="q" value=""></div></body>`,
      { url: "http://localhost/acrx/dashboard" }
    );
    const { window } = dom;
    const events = [];
    window.addEventListener("acrx:update", (e) => events.push(e.detail && e.detail.status));

    // Dirty focused input inside the content region: default guard defers.
    // (Assign .value like real typing — never touch .defaultValue, which
    // would reset the value per spec and make the field look clean.)
    const input = window.document.getElementById("q");
    input.value = "typed";
    input.focus();

    let phase = "old";
    const routes = {
      old: {
        ping: { rev: 9, bootId: "b1" },
        sync: { success: true, rev: 9, bootId: "b1", missed: [] },
        frag: { success: true, html: "<p>v9</p>", rev: 9, css: [], js: [] },
      },
      new: {
        ping: { rev: 1, bootId: "b2" },
        sync: { success: true, rev: 1, bootId: "b2", missed: [] },
        frag: { success: true, html: "<p>v1</p>", rev: 1, css: [], js: [] },
      },
    };
    const realFetch = globalThis.fetch;
    const realCustomEvent = globalThis.CustomEvent;
    const realCSS = globalThis.CSS;
    globalThis.fetch = async (url) => {
      const u = String(url);
      const r = routes[phase];
      const body = u.includes("_frag=content") ? r.frag : u.includes("/sync") ? r.sync : r.ping;
      return { ok: true, status: 200, json: async () => body };
    };
    globalThis.CustomEvent = window.CustomEvent;
    globalThis.CSS = { escape: (s) => String(s) };
    try {
      const run = new Function("window", "document", SRC);
      run(window, window.document);
      await tick(30);
      phase = "new";
      events.length = 0;
      await window.AcroxaAdminRuntime.sync();
      await tick(30);

      const container = window.document.getElementById("acrx-content");
      // Guard blocked: user input preserved, staleness visible, traced.
      assert.equal(window.document.getElementById("q").value, "typed");
      assert.equal(container.getAttribute("data-acrx-stale") !== null, true);
      assert.ok(events.includes("deferred"), `deferral traced, got [${events.join(",")}]`);
    } finally {
      globalThis.fetch = realFetch;
      globalThis.CustomEvent = realCustomEvent;
      if (realCSS === undefined) delete globalThis.CSS;
      else globalThis.CSS = realCSS;
    }
  });
});
