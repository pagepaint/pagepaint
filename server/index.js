// ABOUTME: Serves the embeddable widget, test page, and local feedback storage API.
// ABOUTME: Provides configurable CORS, optional bearer authentication, and project ZIP export.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { createArchive } from "../src/archive.js";
import { FileStore } from "./store.js";
import {
  HttpError,
  validateFeedback,
  validateProjectId,
} from "./validation.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/demo/demo.css", ["demo/demo.css", "text/css; charset=utf-8"]],
  ["/demo/demo.js", ["demo/demo.js", "text/javascript; charset=utf-8"]],
  ...[
    "dm-sans-400.ttf",
    "dm-sans-500.ttf",
    "dm-sans-600.ttf",
    "dm-sans-700.ttf",
    "instrument-serif.ttf",
    "instrument-serif-italic.ttf",
  ].map((file) => [`/demo/fonts/${file}`, [`demo/fonts/${file}`, "font/ttf"]]),
  ...[
    "review-tool.js",
    "review-tool.mjs",
    "review-tool.js.map",
    "review-tool.mjs.map",
    "review-tool.js.LEGAL.txt",
    "review-tool.mjs.LEGAL.txt",
  ].flatMap((file) => [
    [
      `/${file}`,
      [
        `dist/${file}`,
        file.endsWith(".map")
          ? "application/json"
          : file.endsWith(".txt")
            ? "text/plain"
            : "text/javascript; charset=utf-8",
      ],
    ],
    [
      `/dist/${file}`,
      [
        `dist/${file}`,
        file.endsWith(".map")
          ? "application/json"
          : file.endsWith(".txt")
            ? "text/plain"
            : "text/javascript; charset=utf-8",
      ],
    ],
  ]),
]);

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  if (
    !request.headers["content-type"]
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "Use Content-Type: application/json.");
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length <= 32 * 1024 * 1024) chunks.push(chunk);
  }
  if (length > 32 * 1024 * 1024)
    throw new HttpError(413, "Feedback payload exceeds 32 MB.");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON payload.");
  }
}

function authorized(request, token) {
  if (!token) return true;
  const provided = Buffer.from(request.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${token}`);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export function createReviewServer({
  dataDir = process.env.DATA_DIR || path.join(root, "data"),
  allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) || [],
  token = process.env.REVIEW_TOKEN || "",
  host = process.env.HOST || "127.0.0.1",
} = {}) {
  const store = new FileStore(dataDir);
  const allowOrigin = (origin) => {
    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin))
      return true;
    if (allowedOrigins.length) return false;
    try {
      const url = new URL(origin);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      );
    } catch {
      return false;
    }
  };
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "[::1]",
    host,
    ...allowedOrigins.flatMap((origin) => {
      try {
        return [new URL(origin).hostname];
      } catch {
        return [];
      }
    }),
  ]);
  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const requestHost = new URL(`http://${request.headers.host}`).hostname;
      if (!allowedOrigins.includes("*") && !allowedHosts.has(requestHost))
        throw new HttpError(
          403,
          "Host is not allowed. Configure ALLOWED_ORIGINS for this host.",
        );
      const url = new URL(request.url, `http://${request.headers.host}`);
      const origin = request.headers.origin;
      if (origin && url.pathname.startsWith("/api/")) {
        if (!allowOrigin(origin))
          throw new HttpError(
            403,
            "Origin is not allowed. Configure ALLOWED_ORIGINS for this app.",
          );
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
      }
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "600",
        });
        response.end();
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        if (!authorized(request, token))
          throw new HttpError(401, "A valid backend token is required.");
        if (url.pathname === "/api/health" && request.method === "GET")
          return sendJson(response, 200, { ok: true, version: "0.1.0" });
        if (url.pathname === "/api/feedback" && request.method === "POST") {
          const entry = validateFeedback(await readJson(request));
          const created = await store.save(entry);
          return sendJson(response, created ? 201 : 200, {
            id: entry.id,
            saved: true,
          });
        }
        if (url.pathname === "/api/feedback" && request.method === "GET") {
          const projectId = validateProjectId(
            url.searchParams.get("projectId"),
          );
          return sendJson(response, 200, {
            schemaVersion: 1,
            projectId,
            feedback: await store.list(projectId),
          });
        }
        if (url.pathname === "/api/export" && request.method === "GET") {
          const projectId = validateProjectId(
            url.searchParams.get("projectId"),
          );
          const archive = await createArchive(
            await store.list(projectId),
            projectId,
            "nodebuffer",
          );
          response.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${projectId}-feedback.zip"`,
            "Content-Length": archive.length,
            "Cache-Control": "no-store",
          });
          response.end(archive);
          return;
        }
        throw new HttpError(404, "API route not found.");
      }
      if (!["GET", "HEAD"].includes(request.method))
        throw new HttpError(405, "Method not allowed.");
      const file = staticFiles.get(url.pathname);
      if (!file) throw new HttpError(404, "Not found.");
      const bytes = await readFile(path.join(root, file[0])).catch((error) => {
        if (error.code === "ENOENT")
          throw new HttpError(
            404,
            "Build the widget first with npm run build.",
          );
        throw error;
      });
      response.writeHead(200, {
        "Content-Type": file[1],
        "Content-Length": bytes.length,
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      if (!error.status) console.error(error);
      if (!response.headersSent)
        sendJson(response, error.status || 500, {
          error: error.status
            ? error.message
            : "Backend could not complete this request.",
        });
      else response.end();
    }
  });
  server.requestTimeout = 30000;
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 4318);
  const server = createReviewServer({ host });
  server.listen(port, host, () => {
    console.log(`Review Tool playground: http://${host}:${port}`);
    console.log(
      `Local feedback directory: ${path.resolve(process.env.DATA_DIR || path.join(root, "data"))}`,
    );
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.close(() => process.exit(0)));
}
