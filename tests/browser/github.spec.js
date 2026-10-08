// ABOUTME: Exercises the real GitHub popup bridge, configuration persistence, and thread conversion.
// ABOUTME: Mocks authentication and GitHub writes while using real screenshots and browser storage.
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function setup(
  page,
  context,
  { signedIn = true, existingIssues = [], failIssueTitle = null } = {},
) {
  const calls = [];
  let connected = signedIn;
  let failed = false,
    created = 0;
  await context.route("**/github/api/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    if (name === "session")
      return route.fulfill({
        status: connected ? 200 : 401,
        json: connected
          ? { token: "test-window-token", expiresAt: Date.now() + 3600000 }
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
    if (url.pathname === "/repos/team/app/issues") {
      if (call.method === "GET") {
        expect(url.searchParams.get("state")).toBe("all");
        return route.fulfill({ json: existingIssues });
      }
      if (call.body.title === failIssueTitle && !failed) {
        failed = true;
        return route.fulfill({
          status: 503,
          json: { message: "Simulated temporary GitHub failure" },
        });
      }
      const issue = {
        number: 42 + created++,
        html_url: `https://github.com/team/app/issues/${41 + created}`,
        node_id: `I_test_${created}`,
        state: "open",
        ...call.body,
      };
      existingIssues.push(issue);
      return route.fulfill({ status: 201, json: issue });
    }
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

async function reloadProject(page, projectId) {
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
  await page
    .getByRole("button", { name: "Feedback settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "GitHub", exact: true }).click();
}

test("restores sign-in before repository configuration and filters repositories with keyboard selection", async ({
  page,
  context,
}) => {
  const { projectId, calls } = await setup(page, context, { signedIn: false });
  const connection = await configure(page);
  await connection
    .getByRole("button", { name: "Sign in with GitHub ↗" })
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
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await testReview.store.preferences()).githubAccount?.login,
      ),
    )
    .toBe("timo");
  expect(
    await page.evaluate(() => testReview.preferences.github),
  ).toBeUndefined();
  expect(
    JSON.stringify(await page.evaluate(() => testReview.preferences)),
  ).not.toContain("test-window-token");
  await reloadProject(page, projectId);
  await expect(
    page.getByText("Connected as @timo", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "GitHub repository", exact: true })
    .click();
  const search = page.getByRole("combobox", {
    name: "Search GitHub repositories",
  });
  await search.fill("TEAM public");
  await expect(
    page
      .getByRole("listbox", { name: "GitHub repositories" })
      .getByRole("option"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("option", { name: "team/public-app Public", exact: true }),
  ).toBeVisible();
  await search.fill("missing-repository");
  await expect(
    page.getByText("No matching repositories.", { exact: true }),
  ).toBeVisible();
  await search.press("Escape");
  await expect(
    page.getByRole("button", { name: "GitHub repository", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "GitHub repository", exact: true })
    .click();
  await search.fill("team");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(
    page.getByRole("button", { name: "GitHub repository", exact: true }),
  ).toContainText("team/public-app");
  const reads = calls.filter((call) => call.path === "/user").length;
  const refreshPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Refresh connection", exact: true })
    .click();
  const refresh = await refreshPromise;
  await expect.poll(() => refresh.isClosed()).toBe(true);
  await expect
    .poll(() => calls.filter((call) => call.path === "/user").length)
    .toBeGreaterThan(reads);
  await expect(
    page.getByText("Connected as @timo", { exact: true }),
  ).toBeVisible();
});

test("restores an expired connection through one-click refresh", async ({
  page,
  context,
}) => {
  const { projectId } = await setup(page, context);
  await page.evaluate(async () =>
    testReview.savePreferences({
      githubAccount: {
        login: "timo",
        repositories: [{ full_name: "team/app", private: true }],
        expiresAt: 1,
      },
    }),
  );
  await reloadProject(page, projectId);
  await expect(
    page.getByText("Connection for @timo needs a refresh.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "GitHub repository", exact: true }),
  ).toBeDisabled();
  const refreshPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Refresh connection", exact: true })
    .click();
  const refresh = await refreshPromise;
  await expect.poll(() => refresh.isClosed()).toBe(true);
  await expect(
    page.getByText("Connected as @timo", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => testReview.preferences.githubAccount.expiresAt),
  ).toBeGreaterThan(Date.now());
});

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
    .getByRole("button", { name: "GitHub repository", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search GitHub repositories" })
    .fill("team/app");
  await page
    .getByRole("option", { name: "team/app Private", exact: true })
    .click();
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
    page.getByRole("button", { name: "GitHub repository", exact: true }),
  ).toContainText("team/app");
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
    .getByRole("button", { name: "GitHub repository", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search GitHub repositories" })
    .fill("team/app");
  await page
    .getByRole("option", { name: "team/app Private", exact: true })
    .click();
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
    .getByRole("button", { name: "Send to GitHub", exact: true })
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
  expect(creation.body.body).toMatch(
    /!\[Annotated screenshot\]\(\.\.\/blob\/pagepaint-feedback\/\.pagepaint\/.+\.png\?raw=true\)/,
  );
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
    .getByRole("button", { name: "GitHub repository", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search GitHub repositories" })
    .fill("team/app");
  await page
    .getByRole("option", { name: "team/app Private", exact: true })
    .click();
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
    .getByRole("button", { name: "Send to GitHub", exact: true })
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

test("sends directly from a card and links an exact closed-title match without losing a draft", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { calls, projectId } = await setup(page, context, {
    existingIssues: [
      {
        number: 7,
        title: "Fix the clipped button",
        state: "closed",
        html_url: "https://github.com/team/app/issues/7",
        node_id: "I_existing",
      },
    ],
  });
  await page.evaluate(() =>
    testReview.savePreferences({
      github: { repository: "team/app", labels: [], includeAttachments: false },
    }),
  );
  await page
    .getByRole("button", { name: "Capture screen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Attach screenshot", exact: true })
    .click();
  await page.getByLabel("YOUR FEEDBACK").fill("Fix the clipped button");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open thread", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create all in GitHub", exact: true }),
  ).toBeVisible();
  await page.getByLabel("YOUR FEEDBACK").fill("My next unsaved note");
  await page.screenshot({ path: ".logs/github-direct-mobile.png" });
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Send to GitHub", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(
    popup.getByRole("link", { name: "#7 · Fix the clipped button · closed" }),
  ).toBeVisible();
  await popup.setViewportSize({ width: 375, height: 812 });
  expect(
    await popup.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await popup.screenshot({
    path: ".logs/github-existing-review-mobile.png",
    fullPage: true,
  });
  await popup
    .getByRole("button", { name: "Link existing issue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "GitHub #7 ↗", exact: true }),
  ).toBeVisible();
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
  expect(await page.evaluate(() => testReview.activeThreadId)).toBeFalsy();
  await expect(page.getByLabel("YOUR FEEDBACK")).toHaveValue(
    "My next unsaved note",
  );
  await reloadProject(page, projectId);
  await page.evaluate(() => testReview.showConversation());
  await expect(
    page.getByRole("button", { name: "GitHub #7 ↗", exact: true }),
  ).toBeVisible();
  const messages = await page.locator("#messages").boundingBox();
  const github = await page
    .getByRole("button", { name: "GitHub #7 ↗", exact: true })
    .boundingBox();
  expect(github.y).toBeGreaterThanOrEqual(messages.y);
  expect(github.y + github.height).toBeLessThanOrEqual(
    messages.y + messages.height,
  );
});

test("reviews a batch, persists each success, and retries remaining threads without duplicate writes", async ({
  page,
  context,
}) => {
  const { calls, projectId } = await setup(page, context, {
    failIssueTitle: "Fix the footer",
  });
  await page.evaluate(() =>
    testReview.savePreferences({
      github: {
        repository: "team/app",
        labels: ["feedback"],
        includeAttachments: false,
      },
    }),
  );
  for (const text of ["Fix the header", "Fix the footer"]) {
    await page.getByLabel("YOUR FEEDBACK").fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
  }
  await expect
    .poll(() => page.evaluate(() => testReview.records.length))
    .toBe(2);
  await expect(page.getByLabel("YOUR FEEDBACK")).toHaveValue("");
  await page.screenshot({ path: ".logs/github-direct-desktop.png" });
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Create all in GitHub", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(
    popup.getByRole("button", { name: "Create selected issues", exact: true }),
  ).toBeEnabled();
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
  await popup.getByLabel("Include thread 2").uncheck();
  await expect(popup.locator("#selection-status")).toContainText(
    "1 thread selected",
  );
  await popup.getByLabel("Include thread 2").check();
  await popup.screenshot({
    path: ".logs/github-batch-review.png",
    fullPage: true,
  });
  await popup
    .getByRole("button", { name: "Create selected issues", exact: true })
    .click();
  await expect(popup.getByRole("alert")).toContainText(
    "Simulated temporary GitHub failure",
  );
  await expect(
    page.getByRole("button", { name: "GitHub #42 ↗", exact: true }),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => testReview.getFeedback())).filter(
      (record) => record.github,
    ),
  ).toHaveLength(1);
  expect(
    (await page.evaluate(() => testReview.store.list())).filter(
      (record) => record.github,
    ),
  ).toHaveLength(1);
  await popup
    .getByRole("button", { name: "Create selected issues", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "GitHub #43 ↗", exact: true }),
  ).toBeVisible();
  expect(
    calls.filter(
      (call) => call.method === "POST" && call.body.title === "Fix the header",
    ),
  ).toHaveLength(1);
  expect(
    calls.filter(
      (call) => call.method === "POST" && call.body.title === "Fix the footer",
    ),
  ).toHaveLength(2);
  await reloadProject(page, projectId);
  await page.evaluate(() => testReview.showConversation());
  expect(
    (await page.evaluate(() => testReview.getFeedback())).filter(
      (record) => record.github,
    ),
  ).toHaveLength(2);
  expect(
    JSON.stringify(await page.evaluate(() => testReview.preferences)),
  ).not.toContain("test-window-token");
  const againPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Create all in GitHub", exact: true })
    .click();
  const again = await againPromise;
  await expect(again.getByLabel("Include thread 1")).not.toBeChecked();
  await expect(again.getByLabel("Include thread 2")).not.toBeChecked();
  await expect(
    again.getByRole("button", { name: "Create selected issues", exact: true }),
  ).toBeDisabled();
});

test("requires another review if a matching issue appears before publishing", async ({
  page,
  context,
}) => {
  const existingIssues = [];
  const { calls } = await setup(page, context, { existingIssues });
  await page.evaluate(() =>
    testReview.savePreferences({ github: { repository: "team/app" } }),
  );
  await page.getByLabel("YOUR FEEDBACK").fill("New issue during review");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Send to GitHub", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(
    popup.getByRole("button", { name: "Create GitHub issue", exact: true }),
  ).toBeEnabled();
  existingIssues.push({
    number: 9,
    title: "New issue during review",
    state: "open",
    html_url: "https://github.com/team/app/issues/9",
    node_id: "I_new",
  });
  await popup
    .getByRole("button", { name: "Create GitHub issue", exact: true })
    .click();
  await expect(popup.getByRole("alert")).toContainText(
    "Review the updated matches",
  );
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
  await popup.getByLabel("If an issue already exists").selectOption("create");
  await popup
    .getByRole("button", { name: "Create GitHub issue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "GitHub #42 ↗", exact: true }),
  ).toBeVisible();
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
});

test("bulk review blocks duplicate new titles, includes replies, links closed matches, and respects deselection", async ({
  page,
  context,
}) => {
  const { calls } = await setup(page, context, {
    existingIssues: [
      {
        number: 7,
        title: "Existing closed issue",
        state: "closed",
        html_url: "https://github.com/team/app/issues/7",
        node_id: "I_closed",
      },
    ],
  });
  await page.evaluate(() =>
    testReview.savePreferences({ github: { repository: "team/app" } }),
  );
  await page.getByLabel("YOUR FEEDBACK").fill("Repeated new title");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Open thread", exact: true }).click();
  await page
    .getByLabel("YOUR FEEDBACK")
    .fill("Reply belongs in the same issue");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "All issues", exact: true }).click();
  for (const text of [
    "Repeated new title",
    "Existing closed issue",
    "Leave this local",
  ]) {
    await page.getByLabel("YOUR FEEDBACK").fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
  }
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Create all in GitHub", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(
    popup.getByRole("link", { name: "#7 · Existing closed issue · closed" }),
  ).toBeVisible();
  await popup
    .getByRole("button", { name: "Create selected issues", exact: true })
    .click();
  await expect(popup.getByRole("alert")).toContainText(
    "Two selected threads share a title",
  );
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
  await popup.getByLabel("Issue title for thread 2").fill("Another new issue");
  await popup.getByLabel("Include thread 4").uncheck();
  await popup
    .getByRole("button", { name: "Create selected issues", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "GitHub #7 ↗", exact: true }),
  ).toBeVisible();
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(2);
  expect(
    calls.find(
      (call) =>
        call.method === "POST" && call.body.title === "Repeated new title",
    ).body.body,
  ).toContain("Reply belongs in the same issue");
  const records = await page.evaluate(() => testReview.getFeedback());
  expect(
    records.find((record) => record.text === "Leave this local").github,
  ).toBeUndefined();
  expect(records.filter((record) => record.github)).toHaveLength(3);
});

test("reauthenticates when the duplicate preflight finds an expired connection", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page.evaluate(() =>
    testReview.savePreferences({ github: { repository: "team/app" } }),
  );
  let expired = true;
  await context.route(
    "https://api.github.com/repos/team/app/issues?*",
    (route) => {
      if (!expired) return route.fallback();
      expired = false;
      return route.fulfill({
        status: 401,
        json: { message: "Bad credentials" },
      });
    },
  );
  await page.getByLabel("YOUR FEEDBACK").fill("Check after expiry");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Send to GitHub", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(
    popup.getByText("Your connection expired. Sign in again.", { exact: true }),
  ).toBeVisible();
  await expect(
    popup.getByRole("button", { name: "Create GitHub issue", exact: true }),
  ).toBeDisabled();
  await popup
    .getByRole("button", { name: "Sign in with GitHub ↗", exact: true })
    .click();
  await expect(
    popup.getByRole("button", { name: "Create GitHub issue", exact: true }),
  ).toBeEnabled();
  await expect(popup.getByLabel("Issue title", { exact: true })).toHaveValue(
    "Check after expiry",
  );
});
