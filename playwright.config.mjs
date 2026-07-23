import { defineConfig } from "@playwright/test";

const origin = "http://127.0.0.1:4173";
const webkitExecutablePath = process.env.ARK_PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH;
const chromiumAutofillTest = "**/autofill-limit.spec.mjs";

export default defineConfig({
  testDir: "./test/browser",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: "line",
  outputDir: ".artifacts/playwright",
  use: {
    baseURL: origin,
    hasTouch: true,
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: chromiumAutofillTest,
      use: { browserName: "chromium" },
    },
    {
      name: "firefox",
      testIgnore: chromiumAutofillTest,
      use: { browserName: "firefox" },
    },
    {
      name: "webkit",
      testIgnore: chromiumAutofillTest,
      use: {
        browserName: "webkit",
        ...(webkitExecutablePath === undefined
          ? {}
          : { launchOptions: { executablePath: webkitExecutablePath } }),
      },
    },
    {
      name: "chromium-autofill",
      testMatch: chromiumAutofillTest,
      use: { browserName: "chromium", channel: "chromium" },
    },
  ],
  webServer: {
    command: "node test/browser/server.mjs",
    url: `${origin}/health`,
    reuseExistingServer: false,
    timeout: 15_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
