import type { Page } from "@playwright/test";

// Collect console errors + failed requests during a spec so every test can
// assert the app is observably healthy, not just visually fine.
export function watchRuntime(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 500));
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 500)}`));
  page.on("response", (res) => {
    if (res.status() >= 500) failedRequests.push(`${res.status()} ${res.url().slice(0, 200)}`);
  });
  return { consoleErrors, failedRequests };
}

export function assertHealthy(
  runtime: ReturnType<typeof watchRuntime>,
  ignore: RegExp[] = []
) {
  const errors = runtime.consoleErrors.filter((e) => !ignore.some((re) => re.test(e)));
  if (errors.length > 0) {
    throw new Error(`console errors:\n${errors.slice(0, 10).join("\n")}`);
  }
  if (runtime.failedRequests.length > 0) {
    throw new Error(`5xx responses:\n${runtime.failedRequests.slice(0, 10).join("\n")}`);
  }
}
