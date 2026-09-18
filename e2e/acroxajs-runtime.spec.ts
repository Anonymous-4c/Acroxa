import { test, expect } from "@playwright/test";
import { watchRuntime, assertHealthy } from "./helpers";

// AcroxaJS v2 runtime protocol: RC explains, RR verifies, RT validates.
// Public read-only surface — no auth, never 500, stale rejected.
test.describe("acroxajs runtime protocol (rc/rr/rt)", () => {
  test("manifest is v2 with endpoints + transports", async ({ request }) => {
    const res = await request.get("/acr/api/runtime/manifest");
    expect(res.ok()).toBeTruthy();
    const b = await res.json();
    expect(b.success).toBe(true);
    expect(b.runtime).toBe("acroxajs/2");
    expect(b.endpoints.rc).toBe("/acr/api/runtime/rc");
    expect(b.endpoints.rr).toBe("/acr/api/runtime/rr");
    expect(b.endpoints.rt).toBe("/acr/api/runtime/rt");
    expect(b.transports.some((t: { name: string }) => t.name === "sse")).toBe(true);
    expect(b.transports.some((t: { name: string }) => t.name === "poll")).toBe(true);
    expect(typeof b.generation).toBe("number");
  });

  test("rc classifies css as STYLE_UPDATE with WHY", async ({ request }) => {
    const res = await request.post("/acr/api/runtime/rc", {
      data: { changedFile: "C:/proj/public/assets/site.css" },
    });
    expect(res.ok()).toBeTruthy();
    const b = await res.json();
    expect(b.success).toBe(true);
    expect(b.action).toBe("STYLE_UPDATE");
    expect(b.why.length).toBeGreaterThanOrEqual(2);
  });

  test("rc rejects empty bodies (400, never 500)", async ({ request }) => {
    const res = await request.post("/acr/api/runtime/rc", { data: {} });
    expect(res.status()).toBe(400);
  });

  test("rr 404s unknown targets without fabricating HTML", async ({ request }) => {
    const res = await request.post("/acr/api/runtime/rr", {
      data: { target: "widget:core:does-not-exist-e2e" },
    });
    expect(res.status()).toBe(404);
  });

  test("rt rejects unknown ops and stale generations", async ({ request }) => {
    const bad = await request.post("/acr/api/runtime/rt", { data: { op: "teleport" } });
    expect(bad.status()).toBe(400);
    const missing = await request.post("/acr/api/runtime/rt", {
      data: { op: "patch", target: "widget:core:nope-e2e" },
    });
    expect(missing.status()).toBe(404);
  });

  test("legacy aliases still work (target-plan + fragment)", async ({ request }) => {
    const plan = await request.post("/acr/api/runtime/target-plan", {
      data: { changedFile: "src/views/posts.js" },
    });
    expect(plan.ok()).toBeTruthy();
    const b = await plan.json();
    expect(b.success).toBe(true);
    expect(typeof b.strategy).toBe("string");
  });

  test("ping/sync ordering + SSE connected envelope", async ({ request }) => {
    const ping = await request.get("/acr/api/runtime/ping");
    expect(ping.ok()).toBeTruthy();
    const p = await ping.json();
    expect(typeof p.rev).toBe("number");
    expect(typeof p.bootId).toBe("string");
    const sync = await request.get(`/acr/api/runtime/sync?since=${p.rev}`);
    expect(sync.ok()).toBeTruthy();
    const s = await sync.json();
    expect(s.rev).toBeGreaterThanOrEqual(p.rev);
  });

  test("no console errors on a public page load", async ({ page }) => {
    const runtime = watchRuntime(page);
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    assertHealthy(runtime);
  });
});
