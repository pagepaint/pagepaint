// ABOUTME: Verifies the five installation pages against the real product film and widget.
// ABOUTME: Covers playback controls, reduced motion, clipboard installation, and local feedback.
import { test, expect } from "@playwright/test";

const directions = [
  "terminal",
  "field-guide",
  "type-motion",
  "readme",
  "release-notes",
];

for (const direction of directions) {
  test(`${direction} plays its demo, copies the install script, and fits mobile`, async ({
    page,
    context,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/directions/${direction}/`);
    await expect(page.locator("h1")).toBeVisible();
    const video = page.locator("[data-demo-video]");
    await expect
      .poll(() => video.evaluate((element) => element.readyState))
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => video.evaluate((element) => element.currentTime))
      .toBeGreaterThan(0.1);
    expect(
      await video.evaluate(
        (element) => element.muted && element.loop && !element.paused,
      ),
    ).toBe(true);
    await page.locator("[data-video-toggle]").click();
    await expect
      .poll(() => video.evaluate((element) => element.paused))
      .toBe(true);
    await page.locator("[data-video-toggle]").click();
    await expect
      .poll(() => video.evaluate((element) => element.paused))
      .toBe(false);
    await page.locator("[data-video-sound]").click();
    expect(await video.evaluate((element) => element.muted)).toBe(false);
    await page.locator("[data-video-sound]").click();
    expect(await video.evaluate((element) => element.muted)).toBe(true);
    await page.locator("[data-copy-install]").first().click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /https:\/\/pagepaint\.dev\/v0\.4\.2\/pagepaint\.js/,
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "data-pagepaint",
    );
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`${direction} respects reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/directions/${direction}/`);
    const video = page.locator("[data-demo-video]");
    await expect
      .poll(() =>
        video.evaluate(
          (element) => element.controls && element.paused && !element.autoplay,
        ),
      )
      .toBe(true);
    await expect(page.locator("[data-video-sound]")).toBeHidden();
    await page.locator("[data-video-toggle]").click();
    await expect
      .poll(() => video.evaluate((element) => element.paused))
      .toBe(false);
  });
}

test("homepage opens Pagepaint, attaches a rectangle capture and saves the message locally", async ({
  page,
}) => {
  await page.goto("/homepage/?review=home&tag=qa&tag=dev#install");
  await expect(page.locator("h1")).toBeVisible();
  await page.locator("[data-open-feedback]").first().click();
  await page
    .getByRole("button", { name: "Use this color", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Draw & capture", exact: true })
    .click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const bounds = await page.locator("#page-canvas").boundingBox();
  await page.mouse.move(bounds.x + 80, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 320, bounds.y + 210, { steps: 8 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Capture & attach", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit attached screenshot", exact: true }),
  ).toBeVisible();
  await page
    .locator("#message")
    .fill("QA: explain the selected repository step in the install guide.");
  // Decline the folder prompt so this test exercises the automatic browser save.
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => {
      throw new DOMException("User canceled", "AbortError");
    };
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await window.Pagepaint.getInstance().getFeedback()).length,
      ),
    )
    .toBe(1);
  const [record] = await page.evaluate(async () =>
    window.Pagepaint.getInstance().getFeedback(),
  );
  expect(record.text).toContain("QA: explain");
  expect(record.status).toBe("open");
  expect(record.capture.annotations[0].tool).toBe("rectangle");
  expect(record.context.url).toContain("review=home&tag=qa&tag=dev#install");
  await page.reload();
  await page.locator("[data-open-feedback]").first().click();
  await expect(
    page.getByRole("button", { name: "Close feedback", exact: true }),
  ).toBeVisible();
  const [recovered] = await page.evaluate(async () =>
    window.Pagepaint.getInstance().getFeedback(),
  );
  expect(recovered.id).toBe(record.id);
  expect(recovered.capture.annotations[0].tool).toBe("rectangle");
});
