// ABOUTME: Bundles the framework-free widget and its capture and ZIP dependencies.
// ABOUTME: Produces standalone script-tag and ES module distributions.
import { build } from "esbuild";
import { cp, readFile, writeFile } from "node:fs/promises";

for (const format of ["iife", "esm"]) {
  await build({
    entryPoints: ["src/index.js"],
    outfile: `dist/review-tool.${format === "esm" ? "mjs" : "js"}`,
    bundle: true,
    minify: true,
    sourcemap: true,
    format,
    target: ["es2020"],
    legalComments: "external",
    banner: {
      js: "// ABOUTME: Embeds a feedback chat and screenshot annotation widget.\n// ABOUTME: Includes browser persistence, saved appearance, and ZIP export.",
    },
  });
  const legal = `dist/review-tool.${format === "esm" ? "mjs" : "js"}.LEGAL.txt`;
  await writeFile(
    legal,
    `${await readFile("LICENSE", "utf8")}\n${await readFile(legal, "utf8")}`,
  );
}
console.log("Built dist/review-tool.js and dist/review-tool.mjs");

await build({
  entryPoints: ["github/github.js"],
  outfile: "dist/github.js",
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020"],
  banner: {
    js: "// ABOUTME: Reviews local feedback before creating GitHub issues.\n// ABOUTME: Keeps GitHub access tokens inside the trusted Pagepaint window.",
  },
});

for (const extension of ["js", "mjs"]) {
  for (const suffix of ["", ".map", ".LEGAL.txt"])
    await cp(
      `dist/review-tool.${extension}${suffix}`,
      `dist/pagepaint.${extension}${suffix}`,
    );
}
