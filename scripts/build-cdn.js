// ABOUTME: Packages the public widget and playground as Worker static assets.
// ABOUTME: Emits Cloudflare Build Output for deployment with the cf CLI.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const output = ".cloudflare/output/v0";
await rm(output, { recursive: true, force: true });
const worker = path.join(output, "workers/default");
const assets = path.join(worker, "assets");
await mkdir(path.join(assets, `v${version}`), { recursive: true });
await cp("index.html", path.join(assets, "index.html"));
await cp("demo", path.join(assets, "demo"), { recursive: true });
for (const file of [
  "review-tool.js",
  "review-tool.mjs",
  "review-tool.js.LEGAL.txt",
  "review-tool.mjs.LEGAL.txt",
]) {
  await cp(path.join("dist", file), path.join(assets, file));
  await cp(path.join("dist", file), path.join(assets, `v${version}`, file));
}
await writeFile(
  path.join(assets, "_headers"),
  `/*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
/review-tool.js
  Cache-Control: public, max-age=300
/review-tool.mjs
  Cache-Control: public, max-age=300
/*.mjs
  Content-Type: text/javascript; charset=utf-8
/v${version}/*
  Cache-Control: public, max-age=31536000, immutable
`,
);
await writeFile(
  path.join(output, "config.json"),
  JSON.stringify({ buildContext: { isPreview: false } }, null, 2),
);
await writeFile(
  path.join(worker, "worker.config.json"),
  JSON.stringify(
    {
      name: "review-tool",
      compatibilityDate: "2026-10-04",
      workersDev: true,
      assets: { htmlHandling: "auto-trailing-slash", notFoundHandling: "none" },
    },
    null,
    2,
  ),
);
console.log(`Prepared CDN assets for review-tool v${version}`);
