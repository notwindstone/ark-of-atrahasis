import { expect, test as base } from "@playwright/test";

const harnessOrigin = "http://127.0.0.1:4173";

export const test = base.extend({
  browserLedger: async ({ context, page }, use) => {
    const requests = [];
    const navigations = [];

    const onRequest = (request) => {
      requests.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
      });
    };
    const onNavigation = (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    };

    context.on("request", onRequest);
    page.on("framenavigated", onNavigation);
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== harnessOrigin && url.protocol !== "data:") {
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    await use({
      requests,
      navigations,
      reset() {
        requests.length = 0;
        navigations.length = 0;
      },
    });

    context.off("request", onRequest);
    page.off("framenavigated", onNavigation);
    await context.unroute("**/*");
  },
});

export { expect };

export async function openHarness(page, browserLedger) {
  await page.goto("/");
  await page.waitForFunction(() => globalThis.arkHarnessReady === true);
  browserLedger.reset();
}

export async function flushBrowserWork(page) {
  await page.evaluate(async () => {
    const response = await fetch(`/barrier?nonce=${crypto.randomUUID()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`barrier failed with ${response.status}`);
  });
}

export function expectNoUnapprovedActivity(browserLedger, approvedPaths = []) {
  const permittedPaths = new Set(["/barrier", ...approvedPaths]);
  const unapprovedRequests = browserLedger.requests.filter(({ url }) => {
    const parsed = new URL(url);
    return parsed.origin !== harnessOrigin || !permittedPaths.has(parsed.pathname);
  });
  expect(
    unapprovedRequests,
    `expected zero unapproved browser requests; actual ledger: ${JSON.stringify(browserLedger.requests)}`,
  ).toEqual([]);
  expect(
    browserLedger.navigations,
    `expected zero browser navigations; actual ledger: ${JSON.stringify(browserLedger.navigations)}`,
  ).toEqual([]);
}
