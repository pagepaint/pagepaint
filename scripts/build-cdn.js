// ABOUTME: Packages the public widget and playground as Worker static assets.
// ABOUTME: Emits Cloudflare Build Output for deployment with the cf CLI.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const output = ".cloudflare/output/v0";
await rm(output, { recursive: true, force: true });
const worker = path.join(output, "workers/default");
const assets = path.join(worker, "assets");
await mkdir(path.join(assets, `v${version}`), { recursive: true });
await cp("index.html", path.join(assets, "index.html"));
await cp("demo", path.join(assets, "demo"), { recursive: true });
await cp("public", assets, { recursive: true });
await cp("github", path.join(assets, "github"), { recursive: true });
await cp("dist/github.js", path.join(assets, "github/github.js"));
await mkdir(path.join(worker, "bundle"), { recursive: true });
await build({
  entryPoints: ["cloudflare/worker.js"],
  outfile: path.join(worker, "bundle/worker.js"),
  bundle: true,
  format: "esm",
  target: ["es2022"],
  banner: {
    js: "// ABOUTME: Handles GitHub authentication and Pagepaint CDN assets.\n// ABOUTME: Accepts no feedback uploads or synchronization requests.",
  },
});
await cp("LICENSE", path.join(assets, "LICENSE"));
await cp(
  "dist/pagepaint-extension.zip",
  path.join(assets, "pagepaint-extension.zip"),
);
await cp(
  "dist/pagepaint-extension.zip",
  path.join(assets, `v${version}`, "pagepaint-extension.zip"),
);
for (const file of [
  "pagepaint.js",
  "pagepaint.mjs",
  "pagepaint.js.LEGAL.txt",
  "pagepaint.mjs.LEGAL.txt",
  "review-tool.js",
  "review-tool.mjs",
  "review-tool.js.LEGAL.txt",
  "review-tool.mjs.LEGAL.txt",
]) {
  await cp(path.join("dist", file), path.join(assets, file));
  await cp(path.join("dist", file), path.join(assets, `v${version}`, file));
}
// Retain published versioned URLs when deploying a new release.
const retainedVersions = [
  "0.2.0",
  "0.2.1",
  "0.2.2",
  "0.3.0",
  "0.4.0",
  "0.4.1",
  ...(process.argv.includes("--preserve-current-release") ? [version] : []),
];
await Promise.all(
  retainedVersions.map(async (release) => {
    const directory = path.join(assets, `v${release}`);
    await mkdir(directory, { recursive: true });
    await Promise.all(
      [
        "review-tool.js",
        "review-tool.mjs",
        "review-tool.js.LEGAL.txt",
        "review-tool.mjs.LEGAL.txt",
        ...(["0.3.0", "0.4.0", "0.4.1", version].includes(release)
          ? [
              "pagepaint.js",
              "pagepaint.mjs",
              "pagepaint.js.LEGAL.txt",
              "pagepaint.mjs.LEGAL.txt",
              "pagepaint-extension.zip",
            ]
          : []),
      ].map(async (file) => {
        const response = await fetch(
          `https://review-tool.timo-bejan.workers.dev/v${release}/${file}`,
          { signal: AbortSignal.timeout(30000) },
        );
        if (!response.ok)
          throw new Error(
            `Cannot preserve release ${release}: ${file} returned ${response.status}`,
          );
        await writeFile(
          path.join(directory, file),
          new Uint8Array(await response.arrayBuffer()),
        );
      }),
    );
  }),
);
await writeFile(
  path.join(assets, "_headers"),
  `/*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
/review-tool.js
  Cache-Control: public, max-age=300
/review-tool.mjs
  Cache-Control: public, max-age=300
/pagepaint.js
  Cache-Control: public, max-age=300
/pagepaint.mjs
  Cache-Control: public, max-age=300
/pagepaint-extension.zip
  Cache-Control: public, max-age=300
/*.mjs
  Content-Type: text/javascript; charset=utf-8
${[...new Set([...retainedVersions, version])].map((release) => `/v${release}/*\n  Cache-Control: public, max-age=31536000, immutable`).join("\n")}
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
      compatibilityDate: "2026-10-08",
      workersDev: true,
      domains: ["pagepaint.dev"],
      manifest: {
        type: "complete",
        mainModule: "worker.js",
        modules: { "worker.js": { type: "esm" } },
      },
      env: {
        ASSETS: { type: "assets" },
        AUTH_ORIGIN: { type: "text", value: "https://pagepaint.dev" },
      },
      assets: {
        htmlHandling: "auto-trailing-slash",
        notFoundHandling: "none",
        runWorkerFirst: ["/github/*"],
      },
    },
    null,
    2,
  ),
);
console.log(`Prepared CDN assets for review-tool v${version}`);
