import { test, expect } from "@playwright/test";
import { watchRuntime, assertHealthy } from "./helpers";

// AcroxaJS demo invariants (§48/§49): patching one boundary must not
// recreate unrelated boundaries; form state must survive; text updates
// must reuse nodes. Served via the dev-only testing router (no auth).
test.describe("acroxajs demo", () => {
  test("counter patch preserves form node and sibling boundaries", async ({ page }) => {
    const runtime = watchRuntime(page);
    await page.goto("/acrx/testing/__acroxajs-demo");
    for (const b of ["demo.counter", "demo.clock", "demo.data", "demo.nested", "demo.form", "demo.style"]) {
      await expect(page.locator(`[data-acrx-id="boundary:core:${b}"]`)).toBeVisible();
    }
    // Stash live node references before the patch.
    await page.evaluate(() => {
      const pick = (sel: string) => document.querySelector(sel);
      (window as unknown as Record<string, unknown>).__stash = {
        form: pick('[data-demo="form-input"]'),
        clock: pick('[data-acrx-id="boundary:core:demo.clock"]'),
        data: pick('[data-acrx-id="boundary:core:demo.data"]'),
        value: (pick('[data-demo="form-input"]') as HTMLInputElement | null)?.value ?? null,
      };
    });
    await page.locator('[data-demo="form-input"]').fill("keep-me");
    await page.locator('[data-demo="counter-inc"]').click();
    await expect(page.locator('[data-acrx-id="element:core:demo.counter.value"]')).toHaveText("1");
    const check = await page.evaluate(() => {
      const s = (window as unknown as Record<string, { form: Node; clock: Node; data: Node }>).__stash;
      return {
        formSame: document.querySelector('[data-demo="form-input"]') === s.form,
        clockSame: document.querySelector('[data-acrx-id="boundary:core:demo.clock"]') === s.clock,
        dataSame: document.querySelector('[data-acrx-id="boundary:core:demo.data"]') === s.data,
        formValue: (document.querySelector('[data-demo="form-input"]') as HTMLInputElement).value,
      };
    });
    expect(check.formSame).toBe(true);
    expect(check.clockSame).toBe(true);
    expect(check.dataSame).toBe(true);
    expect(check.formValue).toBe("keep-me");
    // Testing router has no session: main.js profile/menu fetches 401.
    // Same ignore pattern as the login guard spec; authed runs cover clean.
    assertHealthy(runtime, [/401 \(Unauthorized\)/, /Failed to fetch user profile/]);
  });

  test("rapid counter clicks stay consistent, keyboard works", async ({ page }) => {
    const runtime = watchRuntime(page);
    await page.goto("/acrx/testing/__acroxajs-demo");
    const btn = page.locator('[data-demo="counter-inc"]');
    await expect(btn).toBeVisible();
    await btn.click({ clickCount: 3 });
    await expect(page.locator('[data-acrx-id="element:core:demo.counter.value"]')).toHaveText("3");
    // Keyboard: focus the button and activate with Enter.
    await btn.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-acrx-id="element:core:demo.counter.value"]')).toHaveText("4");
    const intact = await page.evaluate(() => {
      const root = document.querySelector('[data-demo="root"]');
      const ids = [...root!.querySelectorAll("[data-acrx-id]")].map((n) => n.getAttribute("data-acrx-id"));
      return { count: ids.length, unique: new Set(ids).size };
    });
    expect(intact.count).toBeGreaterThan(10);
    expect(intact.unique).toBe(intact.count); // no duplicated identities
    assertHealthy(runtime, [/401 \(Unauthorized\)/, /Failed to fetch user profile/]);
  });
});
