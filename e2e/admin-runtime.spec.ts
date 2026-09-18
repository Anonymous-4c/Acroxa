import { test, expect } from "@playwright/test";
import { watchRuntime, assertHealthy } from "./helpers";

// AcroxaJS admin runtime E2E (§66 killer demonstration, transport half).
// No-auth blocks always run: public protocol surface, security (privileged
// endpoints stay 401), SSE wire shape, public burst consistency.
// Authed blocks (E2E_STORAGE_STATE) prove the flagship: invalidate → swap
// and file-touch → rebuild → auto-swap, with zero navigation.
test.describe("runtime protocol (public)", () => {
  test("ping exposes rev + bootId without auth", async ({ request }) => {
    const res = await request.get("/acr/api/runtime/ping");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.rev).toBe("number");
    expect(typeof body.bootId).toBe("string");
  });

  test("sync replays missed history since a rev", async ({ request }) => {
    const res = await request.get("/acr/api/runtime/sync?since=0");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.rev).toBe("number");
    expect(Array.isArray(body.missed)).toBe(true);
  });

  test("widget echo fragment renders without auth", async ({ request }) => {
    const res = await request.post("/acr/api/runtime/fragment", {
      data: { type: "widget-node", node: { id: "e2e1", type: "divider", attributes: {} } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.html).toBe("string");
    expect(body.html).toContain("wdg-divider");
  });

  test("unknown target fragment is 404, malformed is 400 (never 500)", async ({ request }) => {
    const miss = await request.post("/acr/api/runtime/fragment", {
      data: { type: "target", target: "widget:core:tabs-no-such-widget" },
    });
    expect(miss.status()).toBe(404);
    const bad = await request.post("/acr/api/runtime/fragment", {
      data: { type: "nope" },
    });
    expect(bad.status()).toBe(400);
  });

  test("privileged runtime APIs stay 401 without a session", async ({ request }) => {
    expect((await request.get("/acr/api/system/runtime")).status()).toBe(401);
    expect((await request.get("/acr/api/runtime/capabilities")).status()).toBe(401);
    expect(
      (await request.post("/acr/api/runtime/invalidate", { data: { id: "x" } })).status()
    ).toBe(401);
    expect((await request.get("/acr/api/system/logs/history")).status()).toBe(401);
  });

  test("SSE stream opens with a connected event carrying rev", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" }); // origin only; status irrelevant
    const first = await page.evaluate(async () => {
      const ctrl = new AbortController();
      const kill = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch("/acr/api/runtime/sse", { signal: ctrl.signal });
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          if (buf.includes("event: connected")) break;
          if (buf.length > 2048) break;
        }
        clearTimeout(kill);
        try { ctrl.abort(); } catch { /* closed */ }
        return buf.slice(0, 600);
      } catch (e) {
        clearTimeout(kill);
        return "ERROR:" + String(e);
      }
    });
    expect(first).toContain("event: connected");
    expect(first).toMatch(/"rev":\d+/);
  });

  test("public burst stays consistent (brutal-lite: 60 parallel calls)", async ({ request }) => {
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      jobs.push(request.get("/acr/api/runtime/ping").then(async (r) => ({ s: r.status(), rev: (await r.json()).rev })));
      jobs.push(request.get("/acr/api/runtime/sync?since=0").then(async (r) => ({ s: r.status() })));
      jobs.push(
        request
          .post("/acr/api/runtime/fragment", {
            data: { type: "widget-node", node: { id: "b", type: "divider", attributes: {} } },
          })
          .then(async (r) => ({ s: r.status() }))
      );
    }
    const out = (await Promise.all(jobs)) as { s: number; rev?: number }[];
    expect(out.every((o) => o.s === 200)).toBe(true);
    const revs = new Set(out.map((o) => o.rev).filter((r) => r !== undefined));
    expect(revs.size).toBeLessThanOrEqual(2); // rev may tick once mid-burst, never scatter
  });

  test("login surface shows no runtime knob (self-hides unauthenticated)", async ({ page }) => {
    const runtime = watchRuntime(page);
    const res = await page.goto("/acroxa/login", { waitUntil: "domcontentloaded" });
    expect(res!.status()).toBe(404);
    await expect(page.locator("#acrx-knob")).toHaveCount(0);
    assertHealthy(runtime, [/Failed to load resource.*404/]);
  });
});

const STATE = process.env.E2E_STORAGE_STATE;
test.describe("admin runtime (authed)", () => {
  test.skip(!STATE, "needs E2E_STORAGE_STATE (see e2e pattern in editor-shell.spec.ts)");
  test.use({ storageState: STATE });

  test("dashboard hosts content anchor, runtime, knob; fragment JSON works", async ({ page }) => {
    const runtime = watchRuntime(page);
    await page.goto("/acrx/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#acrx-content")).toHaveCount(1);
    expect(await page.evaluate(() => !!(window as unknown as { AcroxaAdminRuntime?: unknown }).AcroxaAdminRuntime)).toBe(true);

    const rev: number = await page.evaluate(async () => {
      const r = await fetch("/acr/api/runtime/ping");
      return (await r.json()).rev as number;
    });
    const stats = await page.evaluate(
      () => (window as unknown as { AcroxaAdminRuntime: { stats: () => { rev: number } } }).AcroxaAdminRuntime.stats()
    );
    expect(stats.rev).toBe(rev);

    const frag = await page.evaluate(async () => {
      const r = await fetch(window.location.pathname + "?_frag=content", {
        headers: { Accept: "application/json" },
      });
      return { status: r.status, json: (await r.json()) as { success: boolean; html: unknown; title: unknown } };
    });
    expect(frag.status).toBe(200);
    expect(frag.json.success).toBe(true);
    expect(typeof frag.json.html).toBe("string");

    await expect(page.locator("#acrx-knob-dot")).toBeVisible();
    await page.locator("#acrx-knob-dot").click();
    await expect(page.locator("#acrx-knob-panel.open")).toBeVisible();
    assertHealthy(runtime);
  });

  test("invalidate → content swap with zero navigation", async ({ page }) => {
    const runtime = watchRuntime(page);
    await page.goto("/acrx/dashboard", { waitUntil: "domcontentloaded" });
    const urlBefore = page.url();
    await page.evaluate(() => {
      (window as unknown as { __e2e?: number }).__e2e = 1;
    });
    const swaps0 = (await page.evaluate(
      () => (window as unknown as { AcroxaAdminRuntime: { stats: () => { swaps: number } } }).AcroxaAdminRuntime.stats()
    )).swaps;

    const inv = await page.request.post("/acr/api/runtime/invalidate", {
      data: { type: "view", id: "view:e2e-probe", scope: "view", reason: "e2e" },
    });
    expect(inv.ok()).toBe(true);

    await page.waitForFunction(
      (n) =>
        (window as unknown as { AcroxaAdminRuntime: { stats: () => { swaps: number } } }).AcroxaAdminRuntime.stats().swaps > n,
      swaps0,
      { timeout: 15000 }
    );
    expect(page.url()).toBe(urlBefore); // no navigation happened
    expect(await page.evaluate(() => (window as unknown as { __e2e?: number }).__e2e)).toBe(1); // JS state alive
    await expect(page.locator("#acrx-content")).toHaveCount(1);
    assertHealthy(runtime);
  });

  test("view file touch → rebuild → auto swap (flagship chain)", async ({ page }) => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const viewFile = path.resolve("src/views/widgets.js");
    const original = fs.readFileSync(viewFile, "utf-8");

    const runtime = watchRuntime(page);
    await page.goto("/acrx/widgets", { waitUntil: "domcontentloaded" });
    const urlBefore = page.url();
    await page.evaluate(() => {
      (window as unknown as { __e2e?: number }).__e2e = 7;
    });
    const swaps0 = (await page.evaluate(
      () => (window as unknown as { AcroxaAdminRuntime: { stats: () => { swaps: number } } }).AcroxaAdminRuntime.stats()
    )).swaps;

    try {
      fs.writeFileSync(viewFile, original + `\n// e2e-touch ${Date.now()}\n`);
      await page.waitForFunction(
        (n) =>
          (window as unknown as { AcroxaAdminRuntime: { stats: () => { swaps: number } } }).AcroxaAdminRuntime.stats().swaps > n,
        swaps0,
        { timeout: 30000 }
      );
    } finally {
      fs.writeFileSync(viewFile, original);
    }
    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => (window as unknown as { __e2e?: number }).__e2e)).toBe(7);
    assertHealthy(runtime);
  });
});
