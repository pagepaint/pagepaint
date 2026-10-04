// ABOUTME: Runs browser integration tests against a separate local test backend.
// ABOUTME: Keeps browser artifacts and test feedback separate from playground data.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:4319",
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server/index.js",
    url: "http://127.0.0.1:4319/api/health",
    reuseExistingServer: false,
    env: { HOST: "127.0.0.1", PORT: "4319", DATA_DIR: ".logs/e2e-data" },
  },
});
