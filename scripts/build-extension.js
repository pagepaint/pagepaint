// ABOUTME: Bundles the same widget into a self-contained Manifest V3 browser extension.
// ABOUTME: Produces an unpacked directory and a ZIP with no remotely hosted code.
import { build } from "esbuild";
import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const output = "dist/extension";
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of [
  "manifest.json",
  "offscreen.html",
  "workspace.html",
  "workspace.css",
  "icons",
])
  await cp(`extension/${name}`, `${output}/${name}`, { recursive: true });
const manifest = JSON.parse(await readFile(`${output}/manifest.json`, "utf8"));
manifest.version = version;
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2));
for (const name of ["content", "service-worker", "offscreen", "workspace"])
  await build({
    entryPoints: [`extension/${name}.js`],
    outfile: `${output}/${name}.js`,
    bundle: true,
    minify: true,
    format: name === "content" ? "iife" : "esm",
    target: ["chrome116"],
    legalComments: "external",
    banner: {
      js: "// ABOUTME: Runs Pagepaint using bundled browser extension code.\n// ABOUTME: Keeps feedback and recordings on the current device.",
    },
  });
await cp("LICENSE", `${output}/LICENSE`);
const zip = new JSZip();
for (const file of await readdir(output, { recursive: true })) {
  const fullPath = path.join(output, file);
  if ((await stat(fullPath)).isFile())
    zip.file(file.split(path.sep).join("/"), await readFile(fullPath));
}
await writeFile(
  "dist/pagepaint-extension.zip",
  await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
);
console.log(
  `Built Pagepaint extension ${version} and dist/pagepaint-extension.zip`,
);
