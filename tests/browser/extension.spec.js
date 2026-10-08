// ABOUTME: Loads the actual packaged MV3 extension in a persistent Chromium profile.
// ABOUTME: Exercises injected feedback, native screenshots, and centralized project recovery.
import { createHash, generateKeyPairSync } from "node:crypto";
import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, rm, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("unpacked extension captures real tab pixels and shares feedback with its library", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "pagepaint-extension-"));
  const extension = path.join(profile, "extension");
  await cp(path.resolve("dist/extension"), extension, { recursive: true });
  // Automation cannot click Chrome's toolbar. Grant the fixture permission to inject;
  // the distributed manifest continues to require an explicit activeTab invocation.
  // Chromium’s test allowlist substitutes that invocation for native tab recording.
  const manifest = JSON.parse(
    await readFile(path.join(extension, "manifest.json"), "utf8"),
  );
  expect(manifest.host_permissions).toBeUndefined();
  manifest.host_permissions = ["<all_urls>"];
  const key = generateKeyPairSync("rsa", {
    modulusLength: 1024,
  }).publicKey.export({ type: "spki", format: "der" });
  manifest.key = key.toString("base64");
  await writeFile(
    path.join(extension, "manifest.json"),
    JSON.stringify(manifest),
  );
  const fixtureId = createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) =>
      String.fromCharCode(97 + parseInt(digit, 16)),
    );
  const context = await chromium.launchPersistentContext(
    path.join(profile, "profile"),
    {
      channel: "chromium",
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        `--allowlisted-extension-id=${fixtureId}`,
      ],
    },
  );
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    expect(id).toBe(fixtureId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4319/?extension=1");
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      await chrome.storage.session.set({
        [`enabled:${tabs[0].id}`]: new URL(tabs[0].url).origin,
      });
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Use this color", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Capture screen", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Show what you mean" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    const box = await page.locator("#canvas").boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 220, box.y + 180);
    await page.mouse.up();
    await page
      .getByRole("button", { name: "Attach screenshot", exact: true })
      .click();
    await page.getByLabel("YOUR FEEDBACK").fill("Native extension capture");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText("Native extension capture", { exact: true }),
    ).toBeVisible();
    const projects = await worker.evaluate(
      async () => (await chrome.storage.local.get("projects")).projects,
    );
    const projectId = Object.keys(projects)[0];
    const library = await context.newPage();
    await library.goto(
      `chrome-extension://${id}/workspace.html?project=${projectId}`,
    );
    await expect(
      library.getByText("Native extension capture", { exact: true }),
    ).toBeVisible();
    const capture = await library.evaluate(async () => {
      const record = await new Promise((resolve, reject) => {
        const req = indexedDB.open("review-tool", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction("records");
          const query = tx.objectStore("records").getAll();
          query.onsuccess = () => {
            resolve(
              query.result.find(
                (item) => item.text === "Native extension capture",
              ),
            );
            req.result.close();
          };
        };
      });
      return record.capture;
    });
    expect(capture.renderer).toBe("browser-tab");
    expect(capture.width).toBe(1280);
    expect(capture.annotations).toHaveLength(1);
    expect(capture.context.search).toBe("?extension=1");
    await page.bringToFront();
    await page
      .getByRole("button", { name: "Record video", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Stop & attach", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#recording-time")).toHaveText(
      "Recording 0:01 / 1:00",
    );
    await page.goto("http://127.0.0.1:4319/index.html?recording=navigation");
    await expect(
      page.getByRole("button", { name: "Stop & attach", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        worker.evaluate(
          async () =>
            (await chrome.storage.session.get("recording")).recording
              ?.projectId,
        ),
      )
      .toBe(projectId);
    await worker.evaluate(async () =>
      chrome.runtime.sendMessage({ target: "offscreen", type: "stop" }),
    );
    await expect
      .poll(() =>
        worker.evaluate(
          async () => (await chrome.storage.session.get("recording")).recording,
        ),
      )
      .toBeUndefined();
    await page
      .getByRole("button", { name: "Preview recording", exact: true })
      .click();
    await expect
      .poll(() =>
        page.locator("#video-player").evaluate((video) => video.videoWidth),
      )
      .toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Close recording", exact: true })
      .click();
    await library.reload();
    await expect(
      library.getByRole("button", { name: "Preview recording", exact: true }),
    ).toBeVisible();
    await library
      .getByRole("button", { name: "Preview recording", exact: true })
      .click();
    await expect
      .poll(() =>
        library.locator("#video-player").evaluate((video) => video.videoWidth),
      )
      .toBeGreaterThan(0);
    await library
      .getByRole("button", { name: "Close recording", exact: true })
      .click();

    await library.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle("extension-repo", {
        create: true,
      });
      window.showDirectoryPicker = async () => folder;
    });
    await library
      .getByLabel("YOUR FEEDBACK")
      .fill("Recording survives navigation");
    await library.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      library.getByText("Recording survives navigation", { exact: true }),
    ).toBeVisible();
    const file = await library.evaluate(async () => {
      const folder = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("extension-repo");
      const annotations = await folder.getDirectoryHandle(".annotations");
      for await (const [name, handle] of annotations.entries()) {
        if (!name.endsWith(".json")) continue;
        const data = JSON.parse(await (await handle.getFile()).text());
        if (data.comment === "Recording survives navigation")
          return {
            data,
            bytes: (
              await (await annotations.getFileHandle(data.video.file)).getFile()
            ).size,
          };
      }
    });
    expect(file.data.video.context.search).toBe("?extension=1");
    expect(file.bytes).toBe(file.data.video.size);
    expect(file.bytes).toBeGreaterThan(0);
    await library.reload();
    await expect(
      library.getByText("Native extension capture", { exact: true }),
    ).toBeVisible();
    // Account metadata belongs to the extension origin, so an app refresh can recover it.
    await library.evaluate(async (projectId) => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("review-tool", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("records", "readwrite");
          const store = transaction.objectStore("records");
          const preferences = store.get(`${projectId}:preferences`);
          preferences.onsuccess = () =>
            store.put({
              ...preferences.result,
              githubAccount: {
                login: "fixture-reviewer",
                repositories: [{ full_name: "fixture/app", private: true }],
                expiresAt: Date.now() + 3600000,
              },
            });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error);
          };
        };
      });
    }, projectId);
    await page.reload();
    await page
      .getByRole("button", { name: "Feedback settings", exact: true })
      .click();
    await page.getByRole("tab", { name: "GitHub", exact: true }).click();
    await expect(
      page.getByText("Connected as @fixture-reviewer", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "GitHub repository", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Search GitHub repositories" })
      .fill("fixture");
    await expect(
      page.getByRole("option", { name: "fixture/app Private", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
