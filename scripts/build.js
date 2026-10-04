// ABOUTME: Bundles the framework-free widget and its capture and ZIP dependencies.
// ABOUTME: Produces standalone script-tag and ES module distributions.
import { build } from "esbuild";

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
}
console.log("Built dist/review-tool.js and dist/review-tool.mjs");
