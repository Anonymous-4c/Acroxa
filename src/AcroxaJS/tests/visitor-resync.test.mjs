// src/AcroxaJS/tests/visitor-resync.test.mjs
// Visitor runtime restart-resync: old-boot generations are incomparable, so
// the generation space must reset and current targets re-patch — no reload,
// no refresh banner. DB-free jsdom test with a phased fetch mock.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "..", "public", "assets", "acroxa-runtime.js"),
  "utf8"
);

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe("visitor runtime restart resync", () => {
  it("resets generations and re-patches targets on boot change", async () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><body><div data-acrx-id="widget:core:video-v1" data-acrx-generation="72"><p>old</p></div></body>`,
      { url: "http://localhost/" }
    );
    const { window } = dom;

    let phase = "old";
    const realFetch = globalThis.fetch;
    const realCSS = globalThis.CSS;
    globalThis.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes("/ping")) {
        return { ok: true, json: async () => (phase === "old" ? { rev: 72, bootId: "b-old" } : { rev: 3, bootId: "b-new" }) };
      }
      if (u.includes("/sync")) {
        return { ok: true, json: async () => (phase === "old"
          ? { success: true, rev: 72, bootId: "b-old", missed: [] }
          : { success: true, rev: 3, bootId: "b-new", missed: [] }) };
      }
      if (u.includes("/runtime/rr")) {
        const body = JSON.parse((opts && opts.body) || "{}");
        return {
          ok: true,
          json: async () => ({
            success: true, boundary: body.target,
            html: `<div data-acrx-id="${body.target}"><p>fresh</p></div>`,
            rev: 3, bootId: "b-new", generation: 3,
            verify: { hash: "x", bytes: 10 },
          }),
        };
      }
      throw new Error("unexpected fetch " + u);
    };
    globalThis.CSS = { escape: (s) => String(s) };
    try {
      const run = new Function("window", "document", SRC);
      run(window, window.document);
      await tick(30); // initial ping+sync (old boot) settle
      assert.equal(window.AcroxaRuntime.stats().rev, 72);

      phase = "new"; // server restarted under the open tab
      await window.AcroxaRuntime.sync();
      await tick(30);

      const node = window.document.querySelector('[data-acrx-id="widget:core:video-v1"]');
      assert.ok(node, "target still present");
      assert.equal(node.textContent, "fresh", "target re-patched to new boot render");
      assert.equal(window.document.documentElement.hasAttribute("data-acrx-stale"), false, "no refresh banner");
      assert.ok(window.AcroxaRuntime.stats().patched >= 1, "patch counted");
    } finally {
      globalThis.fetch = realFetch;
      if (realCSS === undefined) delete globalThis.CSS;
      else globalThis.CSS = realCSS;
    }
  });
});
