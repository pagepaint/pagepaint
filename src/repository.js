// ABOUTME: Writes feedback and WebP captures into a user-selected repository folder.
// ABOUTME: Remembers directory handles and reads agent-updated resolution statuses.
const AGENT_INSTRUCTION =
  "Check `.annotations/` for open items; set status to resolved when done.";
const RECORD_ID = /^[0-9a-f-]{36}$/i;
import { videoExtension } from "./recording.js";

async function writeFile(directory, name, body) {
  const file = await directory.getFileHandle(name, { create: true });
  const writer = await file.createWritable();
  try {
    await writer.write(body);
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  }
}
async function webp(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d").drawImage(image, 0, 0);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.92),
  );
  if (!blob || blob.type !== "image/webp")
    throw new Error("This browser cannot encode WebP. Download a ZIP instead.");
  return blob;
}
export function selectorAt(x, y) {
  // Modal drawing makes the underlying page inert, so native hit testing omits it.
  // Use visible element bounds as a best-effort target when hit testing cannot reach it.
  const allowed = (item) =>
    !item.closest(
      "[data-review-tool-root], [data-review-tool-ignore], [data-html2canvas-ignore]",
    );
  let element = document
    .elementsFromPoint(x, y)
    .find((item) => allowed(item) && item !== document.documentElement);
  if (!element)
    element = Array.from(document.querySelectorAll("body *"))
      .reverse()
      .find((item) => {
        if (!allowed(item)) return false;
        const bounds = item.getBoundingClientRect();
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          x >= bounds.left &&
          x <= bounds.right &&
          y >= bounds.top &&
          y <= bounds.bottom &&
          getComputedStyle(item).visibility === "visible"
        );
      });
  const parts = [];
  while (element && element !== document.documentElement && parts.length < 8) {
    if (element.id) {
      parts.unshift(`#${CSS.escape(element.id)}`);
      break;
    }
    const testId = element.getAttribute("data-testid");
    if (testId) {
      parts.unshift(`[data-testid="${CSS.escape(testId)}"]`);
      break;
    }
    const siblings = Array.from(element.parentElement?.children || []).filter(
      (item) => item.tagName === element.tagName,
    );
    parts.unshift(
      `${element.localName}:nth-of-type(${siblings.indexOf(element) + 1})`,
    );
    element = element.parentElement;
  }
  return parts.join(" > ") || null;
}
export class RepositoryStore {
  constructor(store, enabled = true) {
    this.store = store;
    this.supported =
      enabled &&
      isSecureContext &&
      typeof window.showDirectoryPicker === "function";
  }
  async load() {
    this.handle = (await this.store.folder())?.handle || null;
  }
  async choose() {
    if (!this.supported) return false;
    try {
      // Open the picker before any storage work so the click's activation is retained.
      this.handle = await window.showDirectoryPicker({
        mode: "readwrite",
        id: "review-tool-repo",
      });
      await this.store.put({ id: "folder", handle: this.handle });
      return true;
    } catch (error) {
      if (error.name === "AbortError") return false;
      throw error;
    }
  }
  async prepare() {
    if (!this.supported) return false;
    if (!this.handle) return this.choose();
    return (
      (await this.handle.requestPermission({ mode: "readwrite" })) === "granted"
    );
  }
  async directory() {
    return this.handle.getDirectoryHandle(".annotations", { create: true });
  }
  async save(record) {
    if (!RECORD_ID.test(record.id))
      throw new Error("Invalid annotation identifier.");
    const directory = await this.directory();
    try {
      await directory.getFileHandle(`${record.id}.json`);
      // Never replace agent-edited records during a retry.
      return;
    } catch (error) {
      if (error.name !== "NotFoundError") throw error;
    }
    const { key, synced, repoSaved, ...data } = record;
    const shapes = data.capture?.annotations || [];
    if (data.video) {
      const { blob, ...video } = data.video;
      const file = `${record.id}.${videoExtension(video)}`;
      await writeFile(directory, file, blob);
      data.video = { ...video, file };
    }
    if (data.capture) {
      const { original, annotated, annotations, ...capture } = data.capture;
      await writeFile(directory, `${record.id}.webp`, await webp(annotated));
      await writeFile(
        directory,
        `${record.id}.original.webp`,
        await webp(original),
      );
      data.capture = {
        ...capture,
        original: `${record.id}.original.webp`,
        annotated: `${record.id}.webp`,
      };
    }
    // Write metadata last; its presence marks a completed annotation.
    await writeFile(
      directory,
      `${record.id}.json`,
      JSON.stringify(
        {
          ...data,
          url: data.context.url,
          viewport: data.context.viewport,
          selector: shapes.find((shape) => shape.selector)?.selector || null,
          shapes,
          comment: data.text,
          status: data.status || "open",
        },
        null,
        2,
      ),
    );
  }
  async readStatuses(records) {
    if (
      !this.handle ||
      (await this.handle.queryPermission({ mode: "read" })) !== "granted"
    )
      return [];
    let directory;
    try {
      directory = await this.handle.getDirectoryHandle(".annotations");
    } catch (error) {
      if (error.name === "NotFoundError") return [];
      throw error;
    }
    const changes = [];
    for (const record of records.filter((item) => item.repoSaved)) {
      try {
        const file = await (
          await directory.getFileHandle(`${record.id}.json`)
        ).getFile();
        const data = JSON.parse(await file.text());
        if (
          data.id === record.id &&
          ["open", "resolved"].includes(data.status) &&
          data.status !== record.status
        )
          changes.push({ id: record.id, status: data.status });
      } catch (error) {
        if (error.name !== "NotFoundError") throw error;
      }
    }
    return changes;
  }

  async setStatus(record, status) {
    if (!RECORD_ID.test(record.id) || !["open", "resolved"].includes(status))
      throw new Error("Invalid annotation status.");
    const directory = await this.directory();
    const file = await (
      await directory.getFileHandle(`${record.id}.json`)
    ).getFile();
    const data = JSON.parse(await file.text());
    if (data.id !== record.id)
      throw new Error("Annotation identifier does not match its file.");
    await writeFile(
      directory,
      `${record.id}.json`,
      JSON.stringify({ ...data, status }, null, 2),
    );
  }
  async addInstructions() {
    const existing = [];
    for (const name of ["AGENTS.md", "CLAUDE.md"]) {
      try {
        existing.push([
          name,
          await (
            await (await this.handle.getFileHandle(name)).getFile()
          ).text(),
        ]);
      } catch (error) {
        if (error.name !== "NotFoundError") throw error;
      }
    }
    for (const [name, text] of existing.length
      ? existing
      : [["AGENTS.md", ""]]) {
      if (!text.includes(AGENT_INSTRUCTION))
        await writeFile(
          this.handle,
          name,
          `${text}${text.endsWith("\n") || !text ? "" : "\n"}\n${AGENT_INSTRUCTION}\n`,
        );
    }
  }
}
