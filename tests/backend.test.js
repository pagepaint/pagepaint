// ABOUTME: Verifies durable feedback storage, API validation, access controls, and ZIP export.
// ABOUTME: Uses temporary directories and actual HTTP requests to exercise the backend.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { createReviewServer } from "../server/index.js";
import { FileStore } from "../server/store.js";
import { createArchive } from "../src/archive.js";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII=";
function feedback({ image = true } = {}) {
  const context = {
    url: "https://example.com/app/board?filter=review&tag=ui&tag=mobile#task-4",
    title: "Board",
    viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
    scroll: { x: 0, y: 120 },
    capturedAt: new Date().toISOString(),
  };
  return {
    schemaVersion: 1,
    id: randomUUID(),
    projectId: "test-app",
    createdAt: new Date().toISOString(),
    author: "Timo",
    text: "Please make this button easier to find.",
    context,
    capture: image
      ? {
          original: PNG,
          annotated: PNG,
          annotations: [
            {
              tool: "rectangle",
              color: "#ef4444",
              width: 1,
              points: [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ],
            },
          ],
          width: 1,
          height: 1,
          context: {
            ...context,
            url: "https://example.com/app/before?mode=capture#original",
          },
          capturedAt: context.capturedAt,
        }
      : null,
  };
}
async function backend(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "review-tool-test-"));
  const server = createReviewServer({ dataDir: directory, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    server,
    url,
    post: (record, headers = {}) =>
      fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(record),
      }),
  };
}

test("persists text, independent screenshot context, PNGs, and repeated query parameters", async (t) => {
  const api = await backend(t);
  const entry = feedback();
  assert.equal((await api.post(entry)).status, 201);
  const result = await (
    await fetch(`${api.url}/api/feedback?projectId=test-app`)
  ).json();
  const [saved] = result.feedback;
  assert.equal(saved.text, entry.text);
  assert.equal(saved.context.pathname, "/app/board");
  assert.equal(saved.context.search, "?filter=review&tag=ui&tag=mobile");
  assert.equal(saved.context.hash, "#task-4");
  assert.deepEqual(saved.context.query, [
    ["filter", "review"],
    ["tag", "ui"],
    ["tag", "mobile"],
  ]);
  assert.equal(saved.capture.context.pathname, "/app/before");
  assert.equal(saved.capture.original, PNG);
  assert.deepEqual(saved.capture.annotations, entry.capture.annotations);
  const directory = path.join(api.directory, "test-app", entry.id);
  const metadata = JSON.parse(
    await readFile(path.join(directory, "feedback.json"), "utf8"),
  );
  assert.equal(metadata.capture.original, "original.png");
  assert.equal(metadata.capture.annotated, "annotated.png");
  assert.ok(
    (await readFile(path.join(directory, "original.png")))
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  );
  assert.deepEqual(
    await new FileStore(api.directory).list("test-app"),
    result.feedback,
  );
  assert.deepEqual(
    (
      await (
        await fetch(`${api.url}/api/feedback?projectId=another-app`)
      ).json()
    ).feedback,
    [],
  );
});

test("retries are idempotent, including concurrent requests, and cannot overwrite an entry", async (t) => {
  const api = await backend(t);
  const entry = feedback({ image: false });
  const results = await Promise.all([api.post(entry), api.post(entry)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]);
  assert.equal((await api.post(entry)).status, 200);
  assert.equal(
    (await api.post({ ...entry, text: "Different content" })).status,
    409,
  );
  assert.equal(
    (await (await fetch(`${api.url}/api/feedback?projectId=test-app`)).json())
      .feedback.length,
    1,
  );
});

test("ZIP contains complete sent records and both PNGs with annotation source", async (t) => {
  const api = await backend(t);
  const entry = feedback();
  await api.post(entry);
  const response = await fetch(`${api.url}/api/export?projectId=test-app`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const manifest = JSON.parse(await zip.file("feedback.json").async("string"));
  assert.equal(manifest.feedback[0].context.url, entry.context.url);
  assert.equal(
    manifest.feedback[0].capture.original,
    `captures/${entry.id}/original.png`,
  );
  assert.ok(zip.file(`captures/${entry.id}/annotated.png`));
  assert.deepEqual(
    JSON.parse(
      await zip.file(`captures/${entry.id}/annotations.json`).async("string"),
    ),
    entry.capture.annotations,
  );
  assert.match(
    await zip.file("transcript.md").async("string"),
    /Please make this button/,
  );
  assert.ok(zip.file("README.txt"));
});

test("archives include unsent text and capture drafts without persistence internals", async () => {
  const entry = feedback();
  const zip = await JSZip.loadAsync(
    await createArchive(
      [{ ...entry, key: "private-storage-key", synced: true }],
      "test-app",
      "nodebuffer",
      { ...entry, text: "Unsent draft" },
    ),
  );
  const manifest = JSON.parse(await zip.file("feedback.json").async("string"));
  assert.equal(manifest.feedback.length, 2);
  assert.equal(manifest.feedback[0].key, undefined);
  assert.equal(manifest.feedback[0].synced, undefined);
  assert.equal(manifest.feedback[1].draft, true);
  assert.equal(manifest.feedback[1].id, "draft");
  assert.ok(zip.file("captures/draft/original.png"));
});

test("rejects malformed, empty, oversized, and unsafe payloads", async (t) => {
  const api = await backend(t);
  for (const change of [
    { id: "../escape" },
    { projectId: "../escape" },
    { text: "a".repeat(10001) },
    { text: "", capture: null },
    { schemaVersion: 2 },
    { createdAt: "invalid" },
    { context: { ...feedback().context, url: "javascript:alert(1)" } },
    { capture: { ...feedback().capture, width: 2 } },
    {
      capture: {
        ...feedback().capture,
        original: "data:image/png;base64,YmFk",
      },
    },
    {
      capture: {
        ...feedback().capture,
        annotations: [
          {
            tool: "script",
            color: "#ef4444",
            width: 1,
            points: [{ x: 0, y: 0 }],
          },
        ],
      },
    },
    {
      capture: {
        ...feedback().capture,
        annotations: [
          { tool: "pen", color: "#ef4444", width: 1, points: [{ x: 2, y: 0 }] },
        ],
      },
    },
  ])
    assert.equal((await api.post({ ...feedback(), ...change })).status, 400);
  assert.equal(
    (await fetch(`${api.url}/api/feedback?projectId=..%2Fescape`)).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${api.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{broken",
      })
    ).status,
    400,
  );
  assert.equal(
    (await fetch(`${api.url}/api/feedback`, { method: "POST", body: "{}" }))
      .status,
    415,
  );
  assert.equal(
    (
      await api.post({
        ...feedback(),
        capture: {
          ...feedback().capture,
          original: `data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64")}`,
        },
      })
    ).status,
    413,
  );
  assert.equal(
    (await fetch(`${api.url}/data/test-app/feedback.json`)).status,
    404,
  );
});

test("CORS allows local apps and denies unconfigured remote origins; distribution is public", async (t) => {
  const api = await backend(t);
  const local = await fetch(`${api.url}/api/health`, {
    headers: { Origin: "http://localhost:5173" },
  });
  assert.equal(local.status, 200);
  assert.equal(
    local.headers.get("access-control-allow-origin"),
    "http://localhost:5173",
  );
  const denied = await fetch(`${api.url}/api/health`, {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  const preflight = await fetch(`${api.url}/api/feedback`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(preflight.status, 204);
  const script = await fetch(`${api.url}/review-tool.mjs`, {
    headers: { Origin: "https://example.com" },
  });
  assert.equal(script.status, 200);
  assert.equal(script.headers.get("access-control-allow-origin"), "*");
});

test("explicit origin allowlist and bearer token gate backend access", async (t) => {
  const api = await backend(t, {
    allowedOrigins: ["https://preview.example.com"],
    token: "test-token",
  });
  assert.equal(
    (
      await fetch(`${api.url}/api/health`, {
        headers: { Origin: "http://localhost:5173" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${api.url}/api/health`, {
        headers: { Origin: "https://preview.example.com" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await api.post(feedback(), {
        Origin: "https://preview.example.com",
        Authorization: "Bearer test-token",
      })
    ).status,
    201,
  );
  assert.equal(
    (await api.post(feedback(), { Authorization: "Bearer wrong-token" }))
      .status,
    401,
  );
});
