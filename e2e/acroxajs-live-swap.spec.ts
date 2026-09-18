import { test, expect } from "@playwright/test";
import { watchRuntime, assertHealthy } from "./helpers";
import * as fs from "node:fs";
import * as path from "node:path";

// Self-contained live file-change proof (no agent timing needed): the test
// itself edits the demo tagline, watches the page follow it in realtime,
// then restores and watches it follow back — zero reloads throughout.
const VIEW = path.resolve("src/views/acroxajsDemo.js");
const TAG_RE = /p\(\{\},\s*"([^"]+)"\)/;
const PROBE = "LIVE-PROBE";

async function swaps(page: import("@playwright/test").Page): Promise<number> {
  return (await page.evaluate(
    () => (window as unknown as { AcroxaAdminRuntime: { stats: () => { swaps: number } } }).AcroxaAdminRuntime.stats()
  )).swaps;
}

test.describe("acroxajs live file swap (no reload)", () => {
  test("tagline edit -> realtime swap -> restore -> realtime swap back", async ({ page }) => {
    const original = fs.readFileSync(VIEW, "utf-8");
    const base = original.match(TAG_RE)?.[1];
    if (!base || base.includes(PROBE)) throw new Error("unexpected tagline state in acroxajsDemo.js");
    const edited = original.replace(TAG_RE, `p({}, "${base} [${PROBE}]")`);

    const runtime = watchRuntime(page);
    const staged: string[] = [];
    page.on("console", (msg) => {
      const t = msg.text();
      if (t.includes("[Acroxa:")) staged.push(t.slice(0, 160));
    });

    await page.goto("/acrx/testing/__acroxajs-demo?acrx_debug=1", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".acrx-demo > p").first()).toHaveText(base);
    const urlBefore = page.url();
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__probe = "alive"; });
    await page.locator('[data-demo="counter-inc"]').click();
    await page.locator('[data-demo="counter-inc"]').click();
    await expect(page.locator('[data-acrx-id="element:core:demo.counter.value"]')).toHaveText("2");
    const swaps0 = await swaps(page);

    try {
      // 1) Change the file -> page must follow without reload.
      fs.writeFileSync(VIEW, edited);
      await expect(page.locator(".acrx-demo > p").first()).toHaveText(`${base} [${PROBE}]`, { timeout: 25000 });
      await page.waitForFunction((n) => (window as unknown as { AcroxaAdminRuntime: { stats: () => { swaps: number } } }).AcroxaAdminRuntime.stats().swaps > n, swaps0, { timeout: 25000 });
      // Swap proof: server render replaced the DOM (client counter reset)...
      await expect(page.locator('[data-acrx-id="element:core:demo.counter.value"]')).toHaveText("0");
      // ...and the page never reloaded.
      expect(page.url()).toBe(urlBefore);
      expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__probe)).toBe("alive");

      // 2) Restore the file -> page must follow back, still no reload.
      const swaps1 = await swaps(page);
      fs.writeFileSync(VIEW, original);
      await expect(page.locator(".acrx-demo > p").first()).toHaveText(base, { timeout: 25000 });
      await page.waitForFunction((n) => (window as unknown as { AcroxaAdminRuntime: { stats: () => { swaps: number } } }).AcroxaAdminRuntime.stats().swaps > n, swaps1, { timeout: 25000 });
      expect(page.url()).toBe(urlBefore);
      expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__probe)).toBe("alive");
    } finally {
      fs.writeFileSync(VIEW, original);
    }

    // Staged client trace: the full update pipeline, in order.
    const has = (re: RegExp) => staged.some((l) => re.test(l));
    expect(has(/\[Acroxa:BOOT\]/), `BOOT traced, got:\n${staged.join("\n")}`).toBe(true);
    expect(has(/\[Acroxa:SSE-EVENT\]/), `SSE-EVENT traced, got:\n${staged.join("\n")}`).toBe(true);
    expect(has(/\[Acroxa:(RELEVANCE-OK|GUARD-OK)\]/), `relevance/guard traced, got:\n${staged.join("\n")}`).toBe(true);
    expect(has(/\[Acroxa:FRAG-OK\]/), `FRAG-OK traced, got:\n${staged.join("\n")}`).toBe(true);
    expect(has(/\[Acroxa:SWAP-OK\]/), `SWAP-OK traced, got:\n${staged.join("\n")}`).toBe(true);

    // Staged server trace via the dev-only logs alias.
    const logs = await page.request.get("/acrx/testing/api/system/logs?limit=500");
    expect(logs.ok()).toBeTruthy();
    const body = await logs.json();
    const lines: string[] = (body.entries || []).map((e: { message: unknown[] }) => (e.message || []).join(" "));
    const hasSrv = (re: RegExp) => lines.some((l) => re.test(l));
    expect(hasSrv(/\[Acroxa:WATCH\] change .*acroxajsDemo\.js/), "server WATCH staged").toBe(true);
    expect(hasSrv(/\[Acroxa:CLASSIFY\] acroxajsDemo\.js/), "server CLASSIFY staged").toBe(true);
    expect(hasSrv(/\[Acroxa:REBUILD\] pages router swapped ok/), "server REBUILD staged").toBe(true);
    expect(hasSrv(/\[Acroxa:INVALIDATE\] v\d+ view .*acroxajsDemo\.js/), "server INVALIDATE staged").toBe(true);
    expect(hasSrv(/\[Acroxa:SSE\] broadcast runtime\.invalidated/), "server SSE broadcast staged").toBe(true);

    assertHealthy(runtime, [/401 \(Unauthorized\)/, /Failed to fetch user profile/]);
  });
});
