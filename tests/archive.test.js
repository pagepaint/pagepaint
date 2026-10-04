// ABOUTME: Verifies portable ZIP contents for notes, captures, and unsent drafts.
// ABOUTME: Ensures browser persistence internals are omitted from exported feedback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
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

test("reply drafts export portable filenames with their thread identity", async () => {
  const record = feedback();
  const draft = { ...record, id: `draft:${record.id}`, threadId: record.id };
  const zip = await JSZip.loadAsync(
    await createArchive([], "app", "nodebuffer", [draft]),
  );
  assert.ok(Object.keys(zip.files).every((file) => !file.includes(":")));
  const manifest = JSON.parse(await zip.file("feedback.json").async("string"));
  assert.equal(manifest.feedback[0].threadId, record.id);
  assert.ok(zip.file(manifest.feedback[0].capture.annotated));
});
