// ABOUTME: Stores each feedback entry atomically as JSON and separate PNG files.
// ABOUTME: Supports idempotent retries while protecting existing feedback from overwrites.
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  HttpError,
  decodePng,
  validId,
  validateProjectId,
} from "./validation.js";

export class FileStore {
  constructor(directory) {
    this.directory = path.resolve(directory);
  }

  async read(projectId, id) {
    validateProjectId(projectId);
    if (!validId(id)) throw new HttpError(400, "Invalid feedback id.");
    const directory = path.join(this.directory, projectId, id);
    const entry = JSON.parse(
      await readFile(path.join(directory, "feedback.json"), "utf8"),
    );
    if (entry.capture) {
      const [original, annotated] = await Promise.all(
        ["original.png", "annotated.png"].map((name) =>
          readFile(path.join(directory, name)),
        ),
      );
      entry.capture = {
        ...entry.capture,
        original: `data:image/png;base64,${original.toString("base64")}`,
        annotated: `data:image/png;base64,${annotated.toString("base64")}`,
      };
    }
    return entry;
  }

  async list(projectId) {
    validateProjectId(projectId);
    let directories;
    try {
      directories = await readdir(path.join(this.directory, projectId), {
        withFileTypes: true,
      });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const entries = await Promise.all(
      directories
        .filter(
          (directory) => directory.isDirectory() && validId(directory.name),
        )
        .map((directory) => this.read(projectId, directory.name)),
    );
    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async save(entry) {
    const existing = await this.read(entry.projectId, entry.id).catch(
      (error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(entry))
        throw new HttpError(
          409,
          "This feedback id already contains a different message.",
        );
      return false;
    }
    const projectDirectory = path.join(this.directory, entry.projectId);
    await mkdir(projectDirectory, { recursive: true });
    const temporary = await mkdtemp(path.join(projectDirectory, ".pending-"));
    const metadata = structuredClone(entry);
    try {
      if (entry.capture) {
        await writeFile(
          path.join(temporary, "original.png"),
          decodePng(
            entry.capture.original,
            entry.capture.width,
            entry.capture.height,
          ),
        );
        await writeFile(
          path.join(temporary, "annotated.png"),
          decodePng(
            entry.capture.annotated,
            entry.capture.width,
            entry.capture.height,
          ),
        );
        metadata.capture.original = "original.png";
        metadata.capture.annotated = "annotated.png";
      }
      await writeFile(
        path.join(temporary, "feedback.json"),
        `${JSON.stringify(metadata, null, 2)}\n`,
      );
      try {
        await rename(temporary, path.join(projectDirectory, entry.id));
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
        const saved = await this.read(entry.projectId, entry.id);
        if (JSON.stringify(saved) !== JSON.stringify(entry))
          throw new HttpError(
            409,
            "This feedback id already contains a different message.",
          );
        return false;
      }
      return true;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}
