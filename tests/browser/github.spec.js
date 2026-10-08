// ABOUTME: Exercises the real GitHub popup bridge, configuration persistence, and thread conversion.
// ABOUTME: Mocks authentication and GitHub writes while using real screenshots and browser storage.
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function setup(page, context, { signedIn = true } = {}) {
  const calls = [];
  let connected = signedIn;
  await context.route("**/github/api/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    if (name === "session")
      return route.fulfill({
        status: connected ? 200 : 401,
        json: connected
          ? { token: "test-window-token" }
          : { error: "Sign in to continue" },
      });
    if (name === "login") {
      connected = true;
      return route.fulfill({
        json: { url: "http://127.0.0.1:4319/github/signed-in.html" },
      });
    }
    if (name === "logout") {
      connected = false;
      return route.fulfill({ json: { signedOut: true } });
    }
    return route.fulfill({ status: 404 });
  });
  await context.route("https://api.github.com/**", async (route) => {
    const req = route.request();
    expect(req.headers().authorization).toBe("Bearer test-window-token");
    const url = new URL(req.url());
    const call = {
      path: url.pathname,
      method: req.method(),
      body: req.postDataJSON(),
    };
    calls.push(call);
    if (url.pathname === "/user")
      return route.fulfill({ json: { login: "timo" } });
    if (url.pathname === "/user/repos")
      return route.fulfill({
        json: [
          { full_name: "team/app", private: true, has_issues: true },
          { full_name: "team/public-app", private: false, has_issues: true },
        ],
      });
    if (url.pathname === "/repos/team/app/issues")
      return route.fulfill({
        json:
          call.method === "GET"
            ? []
            : {
                number: 42,
                html_url: "https://github.com/team/app/issues/42",
                node_id: "I_test",
              },
      });
    if (url.pathname === "/graphql")
      return route.fulfill({
        json: call.body.query.startsWith("query")
          ? {
              data: {
                organization: {
                  projectV2: {
                    id: "P_test",
                    title: "Roadmap",
                    url: "https://github.com/orgs/team/projects/1",
                  },
                },
              },
            }
          : { data: { addProjectV2ItemById: { item: { id: "item" } } } },
      });
    if (url.pathname.includes("/contents/"))
      return route.fulfill({
        status: call.method === "GET" ? 404 : 201,
        json: call.method === "GET" ? { message: "Not found" } : {},
      });
    return route.fulfill({ json: {} });
  });
  await page.goto("/?github=1");
  const projectId = `github-${randomUUID()}`;
  await page.evaluate(async (projectId) => {
    Pagepaint.getInstance()?.destroy();
    window.testReview = Pagepaint.init({
      projectId,
      repo: false,
      githubUrl: `${location.origin}/github/`,
    });
    await testReview.ready;
  }, projectId);
  await page
    .getByRole("button", { name: "Use this color", exact: true })
    .click();
  return { calls, projectId };
}
async function configure(page) {
  await page
    .getByRole("button", { name: "Feedback settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "GitHub", exact: true }).click();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Sign in with GitHub", exact: true })
    .click();
  const popup = await popupPromise;
  return popup;
}

test("keeps sign-in pending when browser isolation detaches the authorization popup", async ({
  page,
  context,
}) => {
  await setup(page, context, { signedIn: false });
  let connected = false;
  await context.route("**/github/api/session", (route) =>
    route.fulfill({
      status: connected ? 200 : 401,
      json: connected
        ? { token: "test-window-token" }
        : { error: "Sign in to continue" },
    }),
  );
  await context.route("**/github/api/login", (route) =>
    route.fulfill({
      json: { url: "http://localhost:4319/mock-authorization" },
    }),
  );
  await context.route("http://localhost:4319/mock-authorization", (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: { "Cross-Origin-Opener-Policy": "same-origin" },
      body: '<h1>Mock authorization</h1><a href="http://127.0.0.1:4319/mock-callback">Complete mock authorization</a>',
    }),
  );
  await context.route("**/mock-callback", (route) => {
    connected = true;
    return route.fulfill({
      contentType: "text/html",
      body: "<h1>Mock sign-in completed</h1>",
    });
  });
  const connection = await configure(page);
  const authorizationPromise = context.waitForEvent("page");
  await connection
    .getByRole("button", { name: "Sign in with GitHub ↗" })
    .click();
  const authorization = await authorizationPromise;
  await expect(
    authorization.getByRole("heading", { name: "Mock authorization" }),
  ).toBeVisible();
  // Let the first two-second session poll encounter the detached WindowProxy.
  await authorization.waitForTimeout(2500);
  expect(authorization.isClosed()).toBe(false);
  await expect(connection.locator("#error")).toBeHidden();
  await authorization
    .getByRole("link", { name: "Complete mock authorization" })
    .click();
  await expect(
    connection.getByText("Signed in as @timo", { exact: true }),
  ).toBeVisible();
  await connection
    .getByRole("button", { name: "Use this GitHub account", exact: true })
    .click();
  await expect(
    page.getByText("Connected as @timo", { exact: true }),
  ).toBeVisible();
});

test("signs in through the trusted window and persists non-secret project configuration", async ({
  page,
  context,
}) => {
  const { projectId } = await setup(page, context, { signedIn: false });
  const popup = await configure(page);
  await expect(
    popup.getByRole("button", { name: "Sign in with GitHub ↗" }),
  ).toBeVisible();
  // A message from the host window cannot impersonate the trusted popup.
  await page.evaluate(
    (nonce) =>
      window.postMessage(
        { type: "pagepaint:github-result", nonce, result: { login: "forged" } },
        location.origin,
      ),
    new URLSearchParams(new URL(popup.url()).hash.slice(1)).get("nonce"),
  );
  await expect(page.locator("#github-account")).not.toContainText("forged");
  await popup.getByRole("button", { name: "Sign in with GitHub ↗" }).click();
  await expect(
    popup.getByText("Signed in as @timo", { exact: true }),
  ).toBeVisible();
  await popup
    .getByRole("button", { name: "Use this GitHub account", exact: true })
    .click();
  await expect(
    page.getByText("Connected as @timo", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("GitHub repository", { exact: true })
    .selectOption("team/app");
  await page
    .getByLabel("GitHub Project URL (optional)")
    .fill("https://github.com/orgs/team/projects/1");
  await page.getByLabel("Issue labels (comma separated)").fill("feedback, bug");
  await page
    .getByRole("button", { name: "Save GitHub configuration", exact: true })
    .click();
  const saved = await page.evaluate(() => testReview.preferences.github);
  expect(saved).toMatchObject({
    repository: "team/app",
    projectUrl: "https://github.com/orgs/team/projects/1",
    labels: ["feedback", "bug"],
    login: "timo",
    includeAttachments: false,
  });
  expect(
    JSON.stringify(await page.evaluate(() => testReview.preferences)),
  ).not.toContain("test-window-token");
  expect(
    await page.evaluate(
      async () => (await testReview.store.preferences()).github,
    ),
  ).toEqual(saved);
  await page.reload();
  await page.evaluate(async (projectId) => {
    Pagepaint.getInstance()?.destroy();
    window.testReview = Pagepaint.init({
      projectId,
      repo: false,
      githubUrl: `${location.origin}/github/`,
    });
    await testReview.ready;
    testReview.open();
  }, projectId);
  expect(await page.evaluate(() => testReview.preferences.github)).toEqual(
    saved,
  );
  await page
    .getByRole("button", { name: "Feedback settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "GitHub", exact: true }).click();
  await expect(
    page.getByLabel("GitHub repository", { exact: true }),
  ).toHaveValue("team/app");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText("GitHub is not connected.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => testReview.preferences.github.repository),
  ).toBe("team/app");
});

test("cancels pending sign-in and permits a fresh authorization attempt", async ({
  page,
  context,
}) => {
  await setup(page, context, { signedIn: false });
  let attempts = 0;
  await context.route("**/github/api/login", (route) => {
    if (++attempts > 1) return route.fallback();
    return route.fulfill({
      json: { url: "http://127.0.0.1:4319/mock-pending-authorization" },
    });
  });
  await context.route("**/mock-pending-authorization", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Waiting for mock authorization</h1>",
    }),
  );
  const connection = await configure(page);
  const authorizationPromise = connection.waitForEvent("popup");
  await connection
    .getByRole("button", { name: "Sign in with GitHub ↗" })
    .click();
  const authorization = await authorizationPromise;
  await expect(
    authorization.getByRole("heading", {
      name: "Waiting for mock authorization",
    }),
  ).toBeVisible();
  await connection
    .getByRole("button", { name: "Cancel sign-in", exact: true })
    .click();
  await expect(
    connection.getByRole("button", { name: "Sign in with GitHub ↗" }),
  ).toBeEnabled();
  await expect(connection.locator("#status")).toHaveText(
    "Sign-in canceled. You can try again.",
  );
  await expect(connection.locator("#error")).toBeHidden();
  await expect.poll(() => authorization.isClosed()).toBe(true);
  await connection
    .getByRole("button", { name: "Sign in with GitHub ↗" })
    .click();
  await expect(
    connection.getByText("Signed in as @timo", { exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
});

test("reviews a screenshot, annotation, and complete thread before creating and linking an issue", async ({
  page,
  context,
}) => {
  const { calls } = await setup(page, context);
  const connection = await configure(page);
  await connection
    .getByRole("button", { name: "Use this GitHub account", exact: true })
    .click();
  await page
    .getByLabel("GitHub repository", { exact: true })
    .selectOption("team/app");
  await page
    .getByLabel("GitHub Project URL (optional)")
    .fill("https://github.com/orgs/team/projects/1");
  await page.getByLabel("Include screenshots and recordings").check();
  await page
    .getByRole("button", { name: "Save GitHub configuration", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Capture screen", exact: true })
    .click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const bounds = await page.locator("#canvas").boundingBox();
  await page.mouse.move(bounds.x + 150, bounds.y + 150);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 300, bounds.y + 240, { steps: 5 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Attach screenshot", exact: true })
    .click();
  await page.getByLabel("Area (optional)").fill("Checkout");
  await page.getByLabel("YOUR FEEDBACK").fill("Fix the clipped button");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("button", { name: "Checkout · Open thread", exact: true })
    .click();
  await page.getByLabel("YOUR FEEDBACK").fill("Keep the yellow highlight");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Create GitHub issue", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(
    popup.getByText("Fix the clipped button", { exact: true }),
  ).toBeVisible();
  await expect(
    popup.getByText("Keep the yellow highlight", { exact: true }),
  ).toBeVisible();
  await expect(
    popup.getByRole("img", { name: "Annotated screenshot" }),
  ).toBeVisible();
  await expect(popup.getByLabel("Repository", { exact: true })).toHaveValue(
    "team/app",
  );
  expect(calls.filter((call) => ["POST", "PUT"].includes(call.method))).toEqual(
    [],
  );
  await popup
    .getByLabel("Issue title", { exact: true })
    .fill("[Checkout] Fix spacing");
  await popup.screenshot({
    path: ".logs/github-issue-preview.png",
    fullPage: true,
  });
  await popup
    .getByRole("button", { name: "Create GitHub issue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "GitHub #42", exact: true }),
  ).toBeVisible();
  const creation = calls.find(
    (call) => call.method === "POST" && call.path.endsWith("/issues"),
  );
  expect(creation.body.title).toBe("[Checkout] Fix spacing");
  expect(creation.body.body).toContain("Keep the yellow highlight");
  expect(creation.body.body).toContain("?github=1");
  expect(calls.filter((call) => call.method === "PUT")).toHaveLength(3);
  const records = await page.evaluate(() => testReview.getFeedback());
  expect(records[0].github).toMatchObject({
    number: 42,
    projectUrl: "https://github.com/orgs/team/projects/1",
  });
  expect(records[0].capture.annotations).toHaveLength(1);
  expect(records).toHaveLength(2);
  expect(JSON.stringify(records)).not.toContain("test-window-token");
});

test("converts a lazy recording through a connection window on a different origin", async ({
  page,
  context,
}) => {
  const { calls } = await setup(page, context);
  await page.evaluate(async () => {
    testReview.github.destroy();
    testReview.github.url = new URL("http://localhost:4319/github/");
    testReview.options.resolveVideo = async (video) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        ...video,
        blob: new Blob(["test-clip-bytes"], { type: "video/webm" }),
      };
    };
  });
  const connection = await configure(page);
  await connection
    .getByRole("button", { name: "Use this GitHub account", exact: true })
    .click();
  await page
    .getByLabel("GitHub repository", { exact: true })
    .selectOption("team/app");
  await page
    .getByRole("button", { name: "Save GitHub configuration", exact: true })
    .click();
  await page.evaluate(() => {
    testReview.draftVideo = {
      mediaId: "test-media",
      mimeType: "video/webm",
      size: 15,
      durationMs: 2000,
      context: testReview.context(),
    };
    testReview.updateAttachment();
  });
  await page.getByLabel("Area (optional)").fill("Recording");
  await page.getByLabel("YOUR FEEDBACK").fill("See this recording");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("button", { name: "Recording · Open thread", exact: true })
    .click();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Create GitHub issue", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(
    popup.getByText("See this recording", { exact: true }),
  ).toBeVisible();
  expect(new URL(popup.url()).origin).toBe("http://localhost:4319");
  await expect(popup.locator("#source")).toContainText("http://127.0.0.1:4319");
  await expect(popup.locator("video")).toHaveCount(1);
  await popup.getByLabel("Upload screenshots and recordings").check();
  await popup
    .getByRole("button", { name: "Create GitHub issue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "GitHub #42", exact: true }),
  ).toBeVisible();
  const writes = calls.filter((call) => call.method === "PUT");
  expect(writes).toHaveLength(1);
  expect(Buffer.from(writes[0].body.content, "base64").toString()).toBe(
    "test-clip-bytes",
  );
  expect(
    (await page.evaluate(() => testReview.getFeedback()))[0].video.mediaId,
  ).toBe("test-media");
});
