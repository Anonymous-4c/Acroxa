import { defineConfig, devices } from "@playwright/test";

// Acroxa E2E. The API + pages require auth; specs that need a session use
// the storage state at E2E_STORAGE_STATE when provided and skip otherwise.
// Unauthenticated guard specs always run.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: undefined, // Server is started separately (npm start); see e2e/README.
});
