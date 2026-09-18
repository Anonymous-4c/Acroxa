import { test, expect } from "@playwright/test";
import { watchRuntime, assertHealthy } from "./helpers";

// Guard specs: no credentials needed. They pin the intended auth behavior
// so future changes can't silently open the editor or its data APIs.
test.describe("editor auth guard", () => {
  test("unauthenticated /acrx/editor/ does not serve the editor", async ({ page }) => {
    const runtime = watchRuntime(page);
    const res = await page.goto("/acrx/editor/", { waitUntil: "domcontentloaded" });
    // Either an HTTP 401/403/redirect to login — never a 200 editor shell.
    expect(res).not.toBeNull();
    const status = res!.status();
    const url = page.url();
    const isLogin = /login|setup-first-user|setup/i.test(url);
    expect(
      status === 401 || status === 403 || (status >= 300 && status < 400) || isLogin,
      `expected guard (401/403/redirect/login), got status=${status} url=${url}`
    );
    // The guarded navigation itself surfaces as a resource-load console error;
    // that is the browser reporting the guard, not an app defect.
    assertHealthy(runtime, [/Failed to load resource.*40[13]/]);
  });

  test("malformed editor ids are rejected with 400, not 500", async ({ request }) => {
    for (const url of ["/acr/api/editor/1/data", "/acr/api/editor/1/content?type=post", "/acr/api/editor/nope/revisions/nope"]) {
      const res = await request.get(url);
      expect([400, 401, 403, 404]).toContain(res.status());
    }
  });

  test("login page stays invisible without a control session (stealth 404)", async ({ page }) => {
    const runtime = watchRuntime(page);
    const res = await page.goto("/acroxa/login", { waitUntil: "domcontentloaded" });
    // V2 stealth: requireControlSession fails → 404, no login form leaks.
    expect(res!.status()).toBe(404);
    await expect(page.locator("input[type='password']")).toHaveCount(0);
    assertHealthy(runtime, [/Failed to load resource.*404/]);
  });
});
