// ABOUTME: Serves only the library and playground assets during local development.
// ABOUTME: Keeps feedback entirely in the browser and exposes no storage API.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const playground =
  process.env.TEST_FIXTURE === "1"
    ? "tests/fixtures/playground.html"
    : "index.html";
const staticFiles = new Map([
  ["/", [playground, "text/html; charset=utf-8"]],
  ["/index.html", [playground, "text/html; charset=utf-8"]],
  ["/homepage/", ["index.html", "text/html; charset=utf-8"]],
  ["/privacy/", ["public/privacy/index.html", "text/html; charset=utf-8"]],
  ["/terms/", ["public/terms/index.html", "text/html; charset=utf-8"]],
  ["/legal.css", ["public/legal.css", "text/css; charset=utf-8"]],
  ["/LICENSE", ["LICENSE", "text/plain; charset=utf-8"]],
  [
    "/pagepaint-extension.zip",
    ["dist/pagepaint-extension.zip", "application/zip"],
  ],
  ["/github/", ["github/index.html", "text/html; charset=utf-8"]],
  ["/github/github.js", ["dist/github.js", "text/javascript; charset=utf-8"]],
  ["/github/github.css", ["github/github.css", "text/css; charset=utf-8"]],
  [
    "/github/signed-in.html",
    ["github/signed-in.html", "text/html; charset=utf-8"],
  ],
  ["/github/setup.html", ["github/setup.html", "text/html; charset=utf-8"]],
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
    "pagepaint.js",
    "pagepaint.mjs",
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
    [
      `/v${version}/${file}`,
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
const publicTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".webp", "image/webp"],
  [".vtt", "text/vtt; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

export function createReviewServer() {
  return http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "no-cache");
    const url = new URL(request.url, "http://localhost");
    const publicPath = url.pathname.endsWith("/")
      ? `${url.pathname}index.html`
      : url.pathname;
    const type = publicTypes.get(path.extname(publicPath));
    const file =
      staticFiles.get(url.pathname) ||
      (type &&
      (/^\/(directions|homepage|video|brand)\//.test(publicPath) ||
        ["/llms.txt", "/llms-full.txt", "/robots.txt", "/sitemap.xml"].includes(
          publicPath,
        ))
        ? [path.join("public", publicPath), type]
        : null);
    if (!["GET", "HEAD"].includes(request.method) || !file) {
      response.writeHead(file ? 405 : 404);
      response.end("Not found.");
      return;
    }
    try {
      const bytes = await readFile(path.join(root, file[0]));
      response.writeHead(200, {
        "Content-Type": file[1],
        "Content-Length": bytes.length,
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end("Asset unavailable. Run npm run build first.");
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 4318);
  const server = createReviewServer();
  server.listen(port, host, () =>
    console.log(`Review Tool playground: http://${host}:${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.close(() => process.exit(0)));
}
