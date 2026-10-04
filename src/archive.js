// ABOUTME: Packages feedback, page context, and original and annotated captures in a ZIP.
// ABOUTME: Includes page context and unsent drafts for a portable feedback handoff.
import JSZip from "jszip";
import { videoExtension } from "./recording.js";

export async function createArchive(
  records,
  projectId,
  type = "blob",
  draft = null,
  projectName = projectId,
) {
  const zip = new JSZip();
  const feedback = [];
  const entries = [...records];
  for (const item of Array.isArray(draft)
    ? draft
    : draft
      ? [{ ...draft, id: "draft" }]
      : []) {
    if (item.text || item.capture || item.video)
      entries.push({ ...item, draft: true });
  }
  for (const record of entries) {
    const { key, synced, repoSaved, ...entry } = record;
    if (entry.video) {
      const { blob, ...video } = entry.video;
      const file = `recordings/${entry.id.replace(/:/g, "-")}.${videoExtension(video)}`;
      zip.file(file, new Uint8Array(await blob.arrayBuffer()), {
        compression: "STORE",
      });
      entry.video = { ...video, file };
    }
    if (entry.capture) {
      const { original, annotated, ...capture } = entry.capture;
      const directory = `captures/${entry.id.replace(/:/g, "-")}`;
      zip.file(`${directory}/original.png`, original.split(",")[1], {
        base64: true,
      });
      zip.file(`${directory}/annotated.png`, annotated.split(",")[1], {
        base64: true,
      });
      zip.file(
        `${directory}/annotations.json`,
        JSON.stringify(capture.annotations, null, 2),
      );
      entry.capture = {
        ...capture,
        original: `${directory}/original.png`,
        annotated: `${directory}/annotated.png`,
      };
    }
    feedback.push(entry);
  }
  zip.file(
    "feedback.json",
    JSON.stringify(
      {
        schemaVersion: 1,
        projectId,
        projectName,
        exportedAt: new Date().toISOString(),
        feedback,
      },
      null,
      2,
    ),
  );
  const transcript = [`# Feedback: ${projectName}`, ""];
  for (const entry of feedback) {
    transcript.push(
      `## ${entry.draft ? "Unsent draft" : entry.author || "Reviewer"} · ${entry.createdAt || entry.updatedAt}`,
      "",
      entry.text || "(Screenshot only)",
      "",
      `URL: ${entry.context?.url || entry.capture?.context?.url || ""}`,
      "",
      `Thread: ${entry.threadId || entry.id} · ${entry.status || "open"}${entry.area ? ` · Area: ${entry.area}` : ""}`,
      "",
    );
    if (entry.video) transcript.push(`Recording: ${entry.video.file}`, "");
    if (entry.capture)
      transcript.push(
        `Original: ${entry.capture.original}`,
        `Annotated: ${entry.capture.annotated}`,
        `Screenshot URL: ${entry.capture.context.url}`,
        "",
      );
  }
  zip.file("transcript.md", transcript.join("\n"));
  zip.file(
    "README.txt",
    "This archive contains feedback.json (complete metadata), transcript.md, and original/annotated PNG captures with editable annotation coordinates.\nMessages and screenshots each carry their own page context. Browser exports include any unsent draft.\n",
  );
  return zip.generateAsync({
    type,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
