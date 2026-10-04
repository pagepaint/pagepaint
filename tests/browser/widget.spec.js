// ABOUTME: Exercises the embeddable library with actual browser capture and pointer drawing.
// ABOUTME: Verifies local recovery, offline storage, archive contents, positioning, and modules.
import { test, expect, chromium } from "@playwright/test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";

async function initialize(
  page,
  { projectId = `browser-${randomUUID()}`, onboarding = false } = {},
) {
  await page.evaluate(
    async ({ projectId }) => {
      window.ReviewTool.getInstance()?.destroy();
      window.testReview = window.ReviewTool.init({
        projectId,
        author: "Timo",
        repo: false,
      });
      await window.testReview.ready;
    },
    { projectId },
  );
  if (
    !onboarding &&
    (await page
      .getByRole("button", { name: "Use this color", exact: true })
      .isVisible())
  ) {
    await page
      .getByRole("button", { name: "Use this color", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close feedback", exact: true })
      .click();
  }
  return projectId;
}
async function open(page) {
  await page
    .getByRole("button", { name: "Open Feedback", exact: true })
    .click();
}
async function draw(
  page,
  tool,
  start = [0.25, 0.3],
  finish = [0.6, 0.5],
  canvasId = "canvas",
) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  const bounds = await page.locator(`#${canvasId}`).boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * start[0],
    bounds.y + bounds.height * start[1],
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * finish[0],
    bounds.y + bounds.height * finish[1],
    { steps: 8 },
  );
  await page.mouse.up();
}
async function archive(page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ZIP", exact: true }).click();
  return JSZip.loadAsync(await readFile(await (await download).path()));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("sample loads its fonts and widget without external requests", async ({
  page,
}) => {
  const external = [];
  page.on("request", (request) => {
    if (
      request.url().startsWith("http") &&
      new URL(request.url()).hostname !== "127.0.0.1"
    )
      external.push(request.url());
  });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  expect(external).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        Array.from(document.fonts).filter((font) => font.status === "loaded")
          .length,
    ),
  ).toBeGreaterThanOrEqual(5);
});

test("conversation sends, persists through reload, and keeps the full URL context", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await initialize(page);
  await page.evaluate(() =>
    history.pushState(
      {},
      "",
      "/index.html?filter=review&tag=ui&tag=mobile#details",
    ),
  );
  await open(page);
  await page
    .getByLabel("YOUR FEEDBACK")
    .fill("The primary action needs more emphasis.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("The primary action needs more emphasis.", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.testReview.getFeedback()).length),
    )
    .toBe(1);
  const [record] = await page.evaluate(() => window.testReview.getFeedback());
  expect(record.context.query).toEqual([
    ["filter", "review"],
    ["tag", "ui"],
    ["tag", "mobile"],
  ]);
  expect(record.context.hash).toBe("#details");
  await page.reload();
  await initialize(page, { projectId });
  await open(page);
  await expect(
    page.getByText("The primary action needs more emphasis.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("captures current view, draws all tools and colors, supports history, and exports everything", async ({
  page,
}) => {
  const projectId = await initialize(page);
  await open(page);
  await page
    .getByRole("button", { name: "Capture screen", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Show what you mean" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Drawing color" }).getByRole("button"),
  ).toHaveCount(8);
  await draw(page, "Freehand pen");
  await page.getByRole("button", { name: "Yellow", exact: true }).click();
  await draw(page, "Highlighter", [0.1, 0.65], [0.5, 0.65]);
  await page.getByRole("button", { name: "Blue", exact: true }).click();
  await draw(page, "Rectangle");
  await draw(page, "Circle", [0.6, 0.25], [0.9, 0.55]);
  await page.getByRole("button", { name: "Undo drawing", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.testReview.draftCapture.annotations.length),
    )
    .toBe(3);
  await page.getByRole("button", { name: "Redo drawing", exact: true }).click();
  expect(
    await page.evaluate(() =>
      window.testReview.draftCapture.annotations.map((item) => item.tool),
    ),
  ).toEqual(["pen", "highlight", "rectangle", "ellipse"]);
  await page
    .getByRole("button", { name: "Attach screenshot", exact: true })
    .click();
  await page.evaluate(() =>
    history.pushState({}, "", "/index.html?after=capture#new-route"),
  );
  await page
    .getByLabel("YOUR FEEDBACK")
    .fill("Please fix the highlighted details.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.testReview.getFeedback()).length),
    )
    .toBe(1);
  const [record] = await page.evaluate(() => window.testReview.getFeedback());
  expect(record.capture.original).not.toBe(record.capture.annotated);
  expect(record.capture.width).toBe(1440);
  expect(record.capture.height).toBe(960);
  expect(record.capture.context.pathname).toBe("/");
  expect(record.context.search).toBe("?after=capture");
  await page
    .getByLabel("YOUR FEEDBACK")
    .fill("This draft should be in the ZIP too.");
  const zip = await archive(page);
  const manifest = JSON.parse(await zip.file("feedback.json").async("string"));
  expect(manifest.feedback).toHaveLength(2);
  expect(manifest.feedback[1].draft).toBe(true);
  expect(
    await zip.file(`captures/${record.id}/original.png`).async("base64"),
  ).toBe(record.capture.original.split(",")[1]);
  expect(
    await zip.file(`captures/${record.id}/annotated.png`).async("base64"),
  ).toBe(record.capture.annotated.split(",")[1]);
  expect(
    JSON.parse(
      await zip.file(`captures/${record.id}/annotations.json`).async("string"),
    ),
  ).toHaveLength(4);
  await page
    .getByRole("button", { name: "View annotated screenshot", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Annotated screenshot" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Annotated screenshot" }),
  ).not.toBeVisible();
});

test("restores an unsent draft with drawings after reload and can clear or retake it", async ({
  page,
}) => {
  const projectId = await initialize(page, {});
  await open(page);
  await page.getByLabel("YOUR FEEDBACK").fill("Keep my draft.");
  await page
    .getByRole("button", { name: "Capture screen", exact: true })
    .click();
  await draw(page, "Rectangle");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.testReview.saveQueue);
  await page.reload();
  await initialize(page, { projectId });
  await open(page);
  await expect(page.getByLabel("YOUR FEEDBACK")).toHaveValue("Keep my draft.");
  await page
    .getByRole("button", { name: "Edit attached screenshot", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => window.testReview.draftCapture.annotations.length,
    ),
  ).toBe(1);
  await page
    .getByRole("button", { name: "Clear drawings", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => window.testReview.draftCapture.annotations.length,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Show what you mean" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Attach screenshot", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove attached screenshot", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit attached screenshot", exact: true }),
  ).not.toBeVisible();
  expect(await page.evaluate(() => window.testReview.draftCapture)).toBeNull();
});

test("offline feedback saves and exports without any network requests", async ({
  page,
  context,
}) => {
  await initialize(page);
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await context.setOffline(true);
  await open(page);
  await page.getByLabel("YOUR FEEDBACK").fill("A note written offline.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Saved in this browser", { exact: true }),
  ).toBeVisible();
  const zip = await archive(page);
  expect(
    JSON.parse(await zip.file("feedback.json").async("string")).feedback[0]
      .text,
  ).toBe("A note written offline.");
  expect(requests).toEqual([]);
  await context.setOffline(false);
});

test("viewport crop respects scroll, fixed content, and excludes the widget", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 400 });
  await page.evaluate(() => window.ReviewTool.getInstance()?.destroy());
  await page.setContent(
    '<html><head><title>Capture fixture</title><style>body{margin:0}section{height:600px}.first{background:rgb(240,20,20)}.second{background:rgb(20,40,240)}header{position:fixed;top:0;width:100%;height:40px;background:rgb(20,20,20)}</style></head><body><section class="first"></section><section class="second"></section><header></header></body></html>',
  );
  await page.addScriptTag({ url: "/review-tool.js" });
  await initialize(page, {});
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.evaluate(() => window.testReview.capture());
  const pixels = await page.evaluate(async () => {
    const image = new Image();
    image.src = window.testReview.draftCapture.original;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return {
      width: image.width,
      height: image.height,
      top: Array.from(context.getImageData(10, 10, 1, 1).data),
      middle: Array.from(context.getImageData(10, 100, 1, 1).data),
      fab: Array.from(context.getImageData(740, 345, 1, 1).data),
      scroll: window.testReview.draftCapture.context.scroll.y,
    };
  });
  expect(pixels).toEqual({
    width: 800,
    height: 400,
    top: [20, 20, 20, 255],
    middle: [20, 40, 240, 255],
    fab: [20, 40, 240, 255],
    scroll: 600,
  });
});

test("draws transparently on the live page and captures the latest view with the marks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.evaluate(() => window.ReviewTool.getInstance()?.destroy());
  await page.setContent(
    "<html><head><title>Live drawing fixture</title><style>body{margin:0;background:white;min-height:1500px}h1{font:32px sans-serif;margin:50px}</style></head><body><h1>Draw on this real page</h1></body></html>",
  );
  await page.addScriptTag({ url: "/review-tool.js" });
  const projectId = await initialize(page);
  await open(page);
  await page
    .getByRole("button", { name: "Draw & capture", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Draw on this page" }),
  ).toBeVisible();
  await draw(page, "Rectangle", [0.2, 0.25], [0.5, 0.5], "page-canvas");
  expect(
    await page
      .locator("#page-canvas")
      .evaluate((canvas) =>
        Array.from(canvas.getContext("2d").getImageData(10, 10, 1, 1).data),
      ),
  ).toEqual([0, 0, 0, 0]);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  // The final capture must reflect live page changes, not the initial recovery image.
  await page.evaluate(() => {
    document.body.style.background = "rgb(230,240,250)";
    history.pushState({}, "", "/index.html?draw=live#marked");
  });
  await page
    .getByRole("button", { name: "Capture & attach", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Draw on this page" }),
  ).not.toBeVisible();
  const result = await page.evaluate(async () => {
    const capture = window.testReview.draftCapture;
    const pixel = async (source, x, y) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(x, y, 1, 1).data);
    };
    return {
      original: await pixel(capture.original, 160, 180),
      marked: await pixel(capture.annotated, 160, 180),
      toolbar: await pixel(capture.original, 400, 550),
      query: capture.context.search,
    };
  });
  expect(result.original).toEqual([230, 240, 250, 255]);
  expect(result.marked).toEqual([239, 68, 68, 255]);
  expect(result.toolbar).toEqual([230, 240, 250, 255]);
  expect(result.query).toBe("?draw=live");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.testReview.getFeedback()).length),
    )
    .toBe(1);
});

test("canceling direct drawing preserves the previous attachment and scroll resumes", async ({
  page,
}) => {
  await initialize(page, {});
  await open(page);
  await page
    .getByRole("button", { name: "Capture screen", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Show what you mean" })
    .waitFor({ state: "visible" });
  await page
    .getByRole("button", { name: "Attach screenshot", exact: true })
    .click();
  const previous = await page.evaluate(
    () => window.testReview.draftCapture.original,
  );
  await page
    .getByRole("button", { name: "Draw & capture", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Draw on this page" })
    .waitFor({ state: "visible" });
  await draw(page, "Freehand pen", [0.1, 0.25], [0.5, 0.5], "page-canvas");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Draw on this page" }),
  ).not.toBeVisible();
  expect(
    await page.evaluate(() => window.testReview.draftCapture.original),
  ).toBe(previous);
  expect(
    await page.evaluate(
      () => window.testReview.draftCapture.annotations.length,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Close feedback", exact: true })
    .click();
  await page.mouse.move(100, 100);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 960 },
]) {
  test(`positions and editor stay usable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await initialize(page, {});
    await open(page);
    for (const position of [
      "bottom-right",
      "bottom-left",
      "top-left",
      "top-right",
      { bottom: 120, right: 32 },
      { top: 10000, left: 10000 },
    ]) {
      await page.evaluate(
        (value) => window.testReview.setPosition(value),
        position,
      );
      for (const id of ["fab", "panel"]) {
        const bounds = await page.locator(`#${id}`).boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(7);
        expect(bounds.y).toBeGreaterThanOrEqual(7);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 7);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(
          viewport.height - 7,
        );
      }
    }
    await page
      .getByRole("button", { name: "Capture screen", exact: true })
      .click();
    const editor = await page
      .getByRole("dialog", { name: "Show what you mean" })
      .boundingBox();
    expect(editor.x).toBeGreaterThanOrEqual(0);
    expect(editor.y).toBeGreaterThanOrEqual(0);
    expect(editor.height).toBeLessThan(viewport.height);
    await draw(page, "Circle");
    await page
      .getByRole("button", { name: "Attach screenshot", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Send", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Draw & capture", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Draw on this page" })
      .waitFor({ state: "visible" });
    const toolbar = await page.locator(".page-toolbar").boundingBox();
    expect(toolbar.x).toBeGreaterThanOrEqual(0);
    expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(viewport.width);
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(viewport.height);
    await draw(page, "Freehand pen", [0.1, 0.2], [0.5, 0.35], "page-canvas");
    await page
      .getByRole("button", { name: "Capture & attach", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Draw on this page" }),
    ).not.toBeVisible();
  });
}

test("declarative script and ES module entry points initialize and clean up independently", async ({
  page,
}) => {
  await page.evaluate(() => window.ReviewTool.getInstance()?.destroy());
  await page.addScriptTag({
    content: `const script = document.createElement('script'); script.src='/review-tool.js'; script.dataset.reviewTool=''; script.dataset.project='declarative'; script.dataset.position='top-left'; script.dataset.label='Review'; document.body.append(script);`,
  });
  await expect(
    page.getByRole("button", { name: "Open Review", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await window.ReviewTool.getInstance().ready;
    window.ReviewTool.getInstance().destroy();
    const { init } = await import("/review-tool.mjs");
    window.testReview = init({
      projectId: "module-test",
      label: "Module feedback",
    });
    await window.testReview.ready;
    if (init() !== window.testReview)
      throw new Error("Duplicate initialization");
  });
  await expect(
    page.getByRole("button", { name: "Open Module feedback", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.testReview.destroy());
  await expect(page.locator("[data-review-tool-root]")).toHaveCount(0);
});

test("first-load color choice persists, settings preserves drafts, and preferences stay out of exports", async ({
  page,
}) => {
  const projectId = await initialize(page, { onboarding: true });
  await expect(
    page.getByRole("heading", { name: "Make it your color", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Accent color" }).getByRole("button"),
  ).toHaveCount(6);
  await page
    .getByRole("button", { name: "Electric blue", exact: true })
    .click();
  const accent = () =>
    page
      .locator("#fab")
      .evaluate((fab) => getComputedStyle(fab).backgroundColor);
  const selectedColor = "rgb(122, 184, 255)";
  await expect.poll(accent).toBe(selectedColor);
  await page
    .getByRole("button", { name: "Use this color", exact: true })
    .click();
  await page
    .getByLabel("YOUR FEEDBACK")
    .fill("Keep this draft while changing settings.");
  await page
    .getByRole("button", { name: "Feedback settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Coral", exact: true }).click();
  await expect.poll(accent).toBe("rgb(255, 150, 134)");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect.poll(accent).toBe(selectedColor);
  await expect(page.getByLabel("YOUR FEEDBACK")).toHaveValue(
    "Keep this draft while changing settings.",
  );
  await page
    .getByRole("button", { name: "Feedback settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Pink", exact: true }).click();
  const savedColor = "rgb(255, 145, 200)";
  await expect.poll(accent).toBe(savedColor);
  await page
    .getByRole("button", { name: "Use this color", exact: true })
    .click();
  await expect(page.getByLabel("YOUR FEEDBACK")).toBeVisible();
  await page.reload();
  await initialize(page, { projectId, onboarding: true });
  await expect(
    page.getByRole("heading", { name: "Make it your color", exact: true }),
  ).not.toBeVisible();
  await expect.poll(accent).toBe(savedColor);
  await open(page);
  const zip = await archive(page);
  const manifest = JSON.parse(await zip.file("feedback.json").async("string"));
  expect(manifest.feedback).toHaveLength(1);
  expect(manifest.feedback[0].id).toBe("draft");
  await initialize(page, { onboarding: true });
  await expect(
    page.getByRole("heading", { name: "Make it your color", exact: true }),
  ).toBeVisible();
});

test("failed storage writes keep the draft exportable and do not pretend it was saved", async ({
  page,
}) => {
  await initialize(page);
  await open(page);
  await page.evaluate(() => {
    window.testReview.store.put = async () => {
      throw new DOMException("Storage quota reached", "QuotaExceededError");
    };
  });
  await page
    .getByLabel("YOUR FEEDBACK")
    .fill("Keep this when storage is full.");
  await expect(
    page.getByText("Could not save draft", { exact: true }),
  ).toBeVisible();
  const zip = await archive(page);
  expect(
    JSON.parse(await zip.file("feedback.json").async("string")).feedback[0]
      .text,
  ).toBe("Keep this when storage is full.");
});

test("repo saving writes real files, remembers the handle, and reads agent resolution without overwriting it", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "review-repo-browser-"));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    viewport: { width: 1440, height: 960 },
    baseURL: "http://127.0.0.1:4319",
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle("repo-fixture", {
        create: true,
      });
      const file = await folder.getFileHandle("CLAUDE.md", { create: true });
      const stream = await file.createWritable();
      await stream.write("# Existing agent guidance\n");
      await stream.close();
      window.showDirectoryPicker = async () => folder;
      window.ReviewTool.getInstance()?.destroy();
      window.testReview = window.ReviewTool.init({
        projectId: "repository",
        author: "Timo",
      });
      await window.testReview.ready;
    });
    await page
      .getByRole("button", { name: "Use this color", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Draw & capture", exact: true })
      .click();
    await draw(page, "Rectangle", [0.4, 0.35], [0.6, 0.45], "page-canvas");
    await page
      .getByRole("button", { name: "Capture & attach", exact: true })
      .click();
    await page.getByLabel("YOUR FEEDBACK").fill("Fix this marked area.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText("Saved in repo", { exact: true }),
    ).toBeVisible();
    const result = await page.evaluate(async () => {
      const record = (await window.testReview.getFeedback())[0];
      const folder = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("repo-fixture");
      const directory = await folder.getDirectoryHandle(".annotations");
      const metadata = JSON.parse(
        await (
          await (await directory.getFileHandle(`${record.id}.json`)).getFile()
        ).text(),
      );
      const image = await (
        await directory.getFileHandle(`${record.id}.webp`)
      ).getFile();
      const original = await (
        await directory.getFileHandle(`${record.id}.original.webp`)
      ).getFile();
      const bytes = [...new Uint8Array(await image.arrayBuffer()).slice(0, 12)];
      return {
        metadata,
        bytes,
        originalBytes: original.size,
        remembered: window.testReview.repository.handle.name,
      };
    });
    expect(result.metadata.status).toBe("open");
    expect(result.metadata.comment).toBe("Fix this marked area.");
    expect(result.metadata.url).toContain("127.0.0.1");
    expect(result.metadata.viewport.width).toBe(1440);
    expect(result.metadata.shapes).toHaveLength(1);
    expect(result.metadata.selector).toBeTruthy();
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...result.bytes.slice(8))).toBe("WEBP");
    expect(result.originalBytes).toBeGreaterThan(0);
    expect(result.remembered).toBe("repo-fixture");
    await page
      .getByRole("button", { name: "Feedback settings", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add agent instructions", exact: true })
      .click();
    await expect(page.locator("#repo-status")).toContainText(
      "Agent instructions added",
    );
    expect(
      await page.evaluate(async () => {
        const folder = await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle("repo-fixture");
        return (
          await (await folder.getFileHandle("CLAUDE.md")).getFile()
        ).text();
      }),
    ).toBe(
      "# Existing agent guidance\n\nCheck `.annotations/` for open items; set status to resolved when done.\n",
    );
    await page.evaluate(async () => {
      const record = (await window.testReview.getFeedback())[0];
      const directory = await (
        await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle("repo-fixture")
      ).getDirectoryHandle(".annotations");
      const file = await directory.getFileHandle(`${record.id}.json`);
      const metadata = JSON.parse(await (await file.getFile()).text());
      metadata.status = "resolved";
      metadata.agentNote = "Fixed in the app.";
      const stream = await file.createWritable();
      await stream.write(JSON.stringify(metadata));
      await stream.close();
    });
    await page
      .getByRole("button", { name: "Save notes to repo", exact: true })
      .click();
    await expect(page.locator("#repo-status")).toContainText("Saved 1 notes");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
    await page.reload();
    await page.evaluate(async () => {
      window.ReviewTool.getInstance()?.destroy();
      window.testReview = window.ReviewTool.init({ projectId: "repository" });
      await window.testReview.ready;
    });
    expect(
      await page.evaluate(() => window.testReview.repository.handle.name),
    ).toBe("repo-fixture");
    await open(page);
    await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(async () => {
        const record = (await window.testReview.getFeedback())[0];
        const directory = await window.testReview.repository.directory();
        return JSON.parse(
          await (
            await (await directory.getFileHandle(`${record.id}.json`)).getFile()
          ).text(),
        ).agentNote;
      }),
    ).toBe("Fixed in the app.");
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("canceling repo picker keeps feedback in browser and ZIP, with an explicit fallback", async ({
  page,
}) => {
  await page.evaluate(async () => {
    window.showDirectoryPicker = async () => {
      throw new DOMException("Canceled", "AbortError");
    };
    window.ReviewTool.getInstance()?.destroy();
    window.testReview = window.ReviewTool.init({ projectId: "canceled-repo" });
    await window.testReview.ready;
  });
  await page
    .getByRole("button", { name: "Use this color", exact: true })
    .click();
  await page.getByLabel("YOUR FEEDBACK").fill("Do not lose this note.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Saved in this browser", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Choose a repo folder in Settings",
  );
  const zip = await archive(page);
  expect(
    JSON.parse(await zip.file("feedback.json").async("string")).feedback[0]
      .text,
  ).toBe("Do not lose this note.");
});

test("capture waits for external stylesheets in the cloned document", async ({
  page,
}) => {
  await initialize(page);
  await page.route("**/demo/demo.css", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await open(page);
  await page
    .getByRole("button", { name: "Capture screen", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Show what you mean", exact: true }),
  ).toBeVisible();
  const pixel = await page.evaluate(async () => {
    const image = new Image();
    image.src = window.testReview.draftCapture.original;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return [...context.getImageData(5, 5, 1, 1).data];
  });
  expect(pixel).toEqual([247, 247, 239, 255]);
});
