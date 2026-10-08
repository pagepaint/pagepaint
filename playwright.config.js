// ABOUTME: Runs browser integration tests against a separate local static server.
// ABOUTME: Keeps browser artifacts and test feedback separate from playground data.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 2,
  use: {
    channel: "chromium",
    baseURL: "http://127.0.0.1:4319",
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/serve-assets.js",
    url: "http://127.0.0.1:4319/",
    reuseExistingServer: false,
    env: { HOST: "127.0.0.1", PORT: "4319", TEST_FIXTURE: "1" },
  },
});
