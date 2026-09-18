import { test, expect } from "@playwright/test";
import { watchRuntime, assertHealthy } from "./helpers";

// Authenticated editor specs. Provide a logged-in session via:
//   npx playwright codegen / manual login, then save storage state, then
//   E2E_STORAGE_STATE=/path/to/state.json npx playwright test editor-shell
// They skip (not fail) when no session is configured, so CI stays green
// until credentials are wired.
const STATE = process.env.E2E_STORAGE_STATE || "";
const DOC = process.env.E2E_DOC || ""; // e.g. "/acrx/editor/?id=123&type=post"

test.describe("editor shell", () => {
  test.skip(!STATE || !DOC, "needs E2E_STORAGE_STATE + E2E_DOC");

  test.use(STATE ? { storageState: STATE } : {});

  test("toolbar exposes the full P0 mark set incl. link", async ({ page }) => {
    const runtime = watchRuntime(page);
    await page.goto(DOC, { waitUntil: "domcontentloaded" });
    for (const id of [
      "toolbar-bold",
      "toolbar-italic",
      "toolbar-underline",
      "toolbar-strike",
      "toolbar-inline-code",
      "toolbar-link",
      "toolbar-blockquote",
    ]) {
      await expect(page.locator(`#${id}`), id).toBeVisible({ timeout: 20000 });
    }
    assertHealthy(runtime);
  });

  test("editor boots with no console errors", async ({ page }) => {
    const runtime = watchRuntime(page);
    await page.goto(DOC, { waitUntil: "networkidle" });
    await expect(page.locator("#editor-canvas")).toBeVisible({ timeout: 20000 });
    assertHealthy(runtime);
  });
});
