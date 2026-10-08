// ABOUTME: Captures real Pagepaint extension interactions for the Chrome Web Store listing.
// ABOUTME: Uses a disposable profile and fixture-only permissions outside the shipped package.
import { chromium } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import http from "node:http";
import path from "node:path";

const fixture = await readFile("store/fixture.html");
const server = http.createServer((_, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(fixture);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const temp = await mkdtemp(path.join(tmpdir(), "pagepaint-store-"));
const extension = path.join(temp, "extension");
await cp("dist/extension", extension, { recursive: true });
const manifest = JSON.parse(
  await readFile(path.join(extension, "manifest.json"), "utf8"),
);
// captureVisibleTab needs activeTab or all_urls. This disposable profile substitutes
// for the toolbar gesture that a headless browser cannot perform.
manifest.host_permissions = ["<all_urls>"];
await writeFile(
  path.join(extension, "manifest.json"),
  JSON.stringify(manifest),
);
await mkdir("store/assets", { recursive: true });
const context = await chromium.launchPersistentContext(
  path.join(temp, "profile"),
  {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  },
);
try {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`${origin}/checkout?variant=compact&review=qa`);
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await chrome.storage.session.set({
      [`enabled:${tab.id}`]: new URL(tab.url).origin,
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Use this color", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Draw & capture", exact: true })
    .click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const button = await page.locator("#broken-button").boundingBox();
  await page.mouse.move(button.x - 12, button.y - 12);
  await page.mouse.down();
  await page.mouse.move(
    button.x + button.width + 12,
    button.y + button.height + 12,
    { steps: 10 },
  );
  await page.mouse.up();
  await page.screenshot({ path: "store/assets/screenshot-annotations.png" });
  await page
    .getByRole("button", { name: "Capture & attach", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit attached screenshot", exact: true })
    .waitFor();
  await page
    .getByLabel("YOUR FEEDBACK")
    .fill(
      "The Confirm order button is clipped in the compact checkout layout. Keep the full label visible.",
    );
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => {
      throw new DOMException("Canceled", "AbortError");
    };
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByText(
      "The Confirm order button is clipped in the compact checkout layout. Keep the full label visible.",
      { exact: true },
    )
    .waitFor();
  const projects = await worker.evaluate(
    async () => (await chrome.storage.local.get("projects")).projects,
  );
  const projectId = Object.keys(projects)[0];
  const library = await context.newPage();
  await library.goto(
    `chrome-extension://${id}/workspace.html?project=${projectId}`,
  );
  await library
    .getByText(
      "The Confirm order button is clipped in the compact checkout layout. Keep the full label visible.",
      { exact: true },
    )
    .waitFor();
  await library.screenshot({
    path: "store/assets/screenshot-project-library.png",
  });
  console.log(
    "Saved two 1280×800 screenshots of actual extension annotations and persisted feedback.",
  );
} catch (error) {
  const failedPage = context.pages().at(-1);
  if (failedPage) {
    await failedPage.screenshot({ path: ".logs/store-capture-failure.png" });
    console.error(await failedPage.locator("body").innerText());
    console.error(
      await failedPage.locator("[data-review-tool-root]").innerText(),
    );
  }
  throw error;
} finally {
  await context.close();
  await rm(temp, { recursive: true, force: true });
  await new Promise((resolve) => server.close(resolve));
}
