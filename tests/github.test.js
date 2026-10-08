// ABOUTME: Verifies GitHub issue conversion, retry recovery, and explicit attachment uploads.
// ABOUTME: Uses mocked REST and GraphQL responses without writing real issues or repositories.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GitHubClient,
  repositoryName,
  projectReference,
  issueBody,
  validateThread,
  findIssueMatch,
} from "../src/github.js";
const id = "12345678-1234-1234-1234-123456789abc";
const records = [
  {
    id,
    threadId: id,
    text: "The button is clipped\nPlease add spacing.",
    area: "Checkout",
    author: "Timo",
    createdAt: "2026-10-08T10:00:00Z",
    context: {
      url: "https://example.com/cart?view=mobile#pay",
      title: "Cart",
      viewport: { width: 390, height: 844, devicePixelRatio: 2 },
      scroll: { x: 0, y: 200 },
    },
  },
];
function fixture(handle) {
  const calls = [];
  const client = new GitHubClient("test-access-token", async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer test-access-token");
    assert.equal(options.headers["X-GitHub-Api-Version"], "2026-03-10");
    const call = {
      path: new URL(url).pathname + new URL(url).search,
      method: options.method,
      body: options.body && JSON.parse(options.body),
    };
    calls.push(call);
    const value = await handle(call);
    return Response.json(value?.status ? value.data : value, {
      status: value?.status || 200,
    });
  });
  return { client, calls };
}
const issue = {
  number: 12,
  html_url: "https://github.com/team/app/issues/12",
  node_id: "I_test",
};
test("validates repository and personal or organization Project destinations", () => {
  assert.equal(repositoryName("https://github.com/team/app.git"), "team/app");
  assert.throws(() => repositoryName("team/app/../../other"));
  assert.equal(
    projectReference("https://github.com/orgs/team/projects/2").kind,
    "organization",
  );
  assert.equal(
    projectReference("https://github.com/users/timo/projects/3").kind,
    "user",
  );
  assert.throws(() =>
    projectReference("https://evil.test/orgs/team/projects/2"),
  );
  assert.throws(() => validateThread([{ id: "../secret", text: "no" }]));
});
test("creates one issue with the complete thread and page context, without attachment writes by default", async () => {
  const { client, calls } = fixture((call) =>
    call.method === "POST" ? issue : [],
  );
  const replies = [
    ...records,
    {
      ...records[0],
      id: "22345678-1234-1234-1234-123456789abc",
      text: "Also on desktop",
    },
  ];
  const result = await client.createIssue({
    repository: "team/app",
    records: replies,
    projectName: "Studio",
    labels: ["feedback"],
  });
  const create = calls.find((call) => call.method === "POST");
  assert.equal(create.path, "/repos/team/app/issues");
  assert.equal(create.body.title, "[Checkout] The button is clipped");
  assert.deepEqual(create.body.labels, ["feedback"]);
  assert.match(create.body.body, /cart\?view=mobile#pay/);
  assert.match(create.body.body, /Also on desktop/);
  assert.match(create.body.body, /390 × 844 · DPR 2/);
  assert.equal(result.url, issue.html_url);
  assert.equal(calls.filter((call) => call.method !== "GET").length, 1);
});
test("recovers an issue created before a lost response and adds it to the Project without duplicating", async () => {
  const { client, calls } = fixture((call) => {
    if (call.path === "/graphql")
      return call.body.query.startsWith("query")
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
        : { data: { addProjectV2ItemById: { item: { id: "item" } } } };
    return [{ ...issue, body: issueBody(records, "Studio") }];
  });
  const result = await client.createIssue({
    repository: "team/app",
    records,
    projectName: "Studio",
    projectUrl: "https://github.com/orgs/team/projects/1",
    includeAttachments: true,
  });
  assert.equal(result.number, 12);
  assert.equal(result.projectUrl, "https://github.com/orgs/team/projects/1");
  assert.equal(
    calls.filter((call) => call.method === "POST" && call.path !== "/graphql")
      .length,
    0,
  );
  assert.deepEqual(calls.at(-1).body.variables, {
    project: "P_test",
    issue: "I_test",
  });
});
test("keeps the created issue link if adding it to a Project fails", async () => {
  const { client } = fixture((call) => {
    if (call.path === "/graphql")
      return call.body.query.startsWith("query")
        ? {
            data: {
              user: {
                projectV2: {
                  id: "P_test",
                  url: "https://github.com/users/timo/projects/1",
                },
              },
            },
          }
        : { errors: [{ message: "Project write denied" }] };
    return call.method === "POST" ? issue : [];
  });
  const result = await client.createIssue({
    repository: "team/app",
    records,
    projectName: "Studio",
    projectUrl: "https://github.com/users/timo/projects/1",
  });
  assert.equal(result.url, issue.html_url);
  assert.match(result.projectError, /Project write denied/);
});
test("uploads annotated and original captures, shapes, and video only to the feedback branch", async () => {
  const { client, calls } = fixture((call) => {
    if (call.path.includes("/contents/") && call.method === "GET")
      return { status: 404, data: { message: "Not found" } };
    if (call.path.endsWith("/issues"))
      return call.method === "POST" ? issue : [];
    if (call.path.includes("/issues?")) return [];
    return {};
  });
  const enriched = [
    {
      ...records[0],
      capture: {
        annotated: "data:image/png;base64,YW5ub3RhdGVk",
        original: "data:image/png;base64,b3JpZ2luYWw=",
        annotations: [{ type: "rectangle", color: "yellow" }],
        context: records[0].context,
      },
      video: {
        blob: new Blob(["video-test"], { type: "video/webm" }),
        mimeType: "video/webm",
        size: 10,
        durationMs: 2000,
      },
    },
  ];
  const result = await client.createIssue({
    repository: "team/app",
    records: enriched,
    projectName: "Studio",
    includeAttachments: true,
  });
  const writes = calls.filter((call) => call.method === "PUT");
  assert.equal(writes.length, 4);
  for (const write of writes) {
    assert.equal(write.body.branch, "pagepaint-feedback");
    assert.match(write.path, /^\/repos\/team\/app\/contents\/\.pagepaint\//);
  }
  assert.match(calls.at(-1).body.body, /Original screenshot/);
  assert.match(
    calls.at(-1).body.body,
    /!\[Annotated screenshot\]\(\.\.\/blob\/pagepaint-feedback\/\.pagepaint\/[a-f\d-]+\.png\?raw=true\)/,
  );
  assert.match(
    calls.at(-1).body.body,
    /!\[Original screenshot\]\(\.\.\/blob\/pagepaint-feedback\/\.pagepaint\/[a-f\d-]+-original\.png\?raw=true\)/,
  );
  assert.match(
    calls.at(-1).body.body,
    /\n\[Page context and editable annotations\]\(https:\/\/github\.com/,
  );
  assert.doesNotMatch(calls.at(-1).body.body, /!\[Video recording\]/);
  assert.match(calls.at(-1).body.body, /Video recording/);
  assert.equal(
    Buffer.from(writes.at(-1).body.content, "base64").toString(),
    "video-test",
  );
  assert.equal(result.number, 12);
});
test("denies invalid attachment paths and expired authorization", async () => {
  const { client, calls } = fixture(() => ({
    status: 401,
    data: { message: "Bad credentials" },
  }));
  await assert.rejects(
    client.upload("team/app", "../../private.txt", "no"),
    /filename/,
  );
  assert.equal(calls.length, 0);
  await assert.rejects(client.user(), /Sign in again/);
});
test("matches exact titles across closed issues while ignoring pull requests and changed cached links", async () => {
  const inventory = [
    { ...issue, title: "Same title", pull_request: {} },
    { ...issue, number: 13, title: "Same title", state: "closed" },
    { ...issue, number: 14, title: "same title", state: "open" },
  ];
  const match = findIssueMatch(inventory, {
    repository: "team/app",
    records,
    title: "Same title",
    existingIssue: { repository: "team/other", number: 14 },
  });
  assert.equal(match.reason, "title");
  assert.equal(match.issue.number, 13);
  assert.equal(match.matches.length, 1);
});
test("paginates all issues and recovers a closed thread before creating", async () => {
  const { client, calls } = fixture((call) =>
    call.path.endsWith("page=1")
      ? Array.from({ length: 100 }, (_, index) => ({
          ...issue,
          number: index + 100,
          title: "Other issue",
        }))
      : [{ ...issue, state: "closed", body: issueBody(records, "Studio") }],
  );
  const result = await client.createIssue({
    repository: "team/app",
    records,
    projectName: "Studio",
  });
  assert.equal(result.reused, true);
  assert.equal(result.number, 12);
  assert.equal(calls.length, 2);
  assert(
    calls.every(
      (call) => call.path.includes("state=all") && call.method === "GET",
    ),
  );
});
test("verifies cached issue existence and shares newly created markers within a batch inventory", async () => {
  const { client, calls } = fixture(() => issue);
  const inventory = [];
  const options = {
    repository: "team/app",
    records,
    projectName: "Studio",
    issues: inventory,
    existingIssue: { repository: "team/app", number: 99 },
  };
  assert.equal((await client.createIssue(options)).reused, false);
  assert.equal((await client.createIssue(options)).reused, true);
  assert.equal(calls.length, 1);
  assert.equal(inventory.length, 1);
});
test("allows an explicit separate issue for a title match but always recovers the same thread", async () => {
  const { client, calls } = fixture((call) =>
    call.method === "POST"
      ? { ...issue, number: 15 }
      : [{ ...issue, title: "Same title", state: "closed" }],
  );
  const options = {
    repository: "team/app",
    records,
    title: "Same title",
    projectName: "Studio",
  };
  assert.equal((await client.createIssue(options)).reused, true);
  assert.equal(
    (await client.createIssue({ ...options, reuseTitle: false })).reused,
    false,
  );
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  const recovered = await client.createIssue({
    ...options,
    reuseTitle: false,
    issues: [{ ...issue, body: issueBody(records, "Studio") }],
  });
  assert.equal(recovered.reused, true);
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
});
