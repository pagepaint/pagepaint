// ABOUTME: Renders a demo scene in headless Chrome at 60 frames per second and encodes it with ffmpeg and its synthesized soundtrack.
// ABOUTME: node render.ts <scene.html> [--stills 0,60,120] [--out dir] [--web file.mp4] [--poster file.webp] [--rate 60] [--name demo]

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { soundtrack, type Cue } from "./sound.ts";

type Film = {
  unit: number;
  length: number;
  poster: number;
  music: { end: number; chord?: number } | null;
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    stills: { type: "string" },
    out: { type: "string", default: ".generated/demo-video" },
    web: { type: "string" },
    poster: { type: "string" },
    rate: { type: "string", default: "60" },
    name: { type: "string", default: "demo" },
  },
});
if (positionals.length !== 1) {
  console.error(
    "usage: node render.ts <scene.html> [--stills 0,60,120] [--out dir] [--web file.mp4] [--poster file.webp] [--rate 60] [--name demo]",
  );
  process.exit(2);
}
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const RATE = Number(values.rate);
const OUT = values.out!;

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

for (const dir of [
  OUT,
  values.web && dirname(values.web),
  values.poster && dirname(values.poster),
])
  if (dir) mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--font-render-hinting=none", "--force-color-profile=srgb"],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (error) => {
  console.error(error);
  process.exitCode = 1;
});
await page.goto(pathToFileURL(positionals[0]).href);
await page.evaluate(
  () => (window as unknown as { ready: Promise<unknown> }).ready,
);
const { film, cues } = await page.evaluate(() => {
  const w = window as unknown as { FILM: Film; CUES: Cue[] };
  return { film: w.FILM, cues: w.CUES };
});
if (!film?.length)
  throw new Error("the scene must end with film({ length, ... })");

async function frame(t: number) {
  await page.evaluate(
    (u) =>
      (window as unknown as { renderFrame: (t: number) => void }).renderFrame(
        u,
      ),
    t,
  );
  return page.screenshot({ type: "png" });
}

if (values.stills) {
  // Single moments as PNGs, plus a labelled contact sheet of all of them for one look.
  const dir = `${OUT}/stills`;
  mkdirSync(dir, { recursive: true });
  const times = values.stills.split(",").map(Number);
  const tiles = [];
  for (const t of times) {
    const png = await frame(t);
    writeFileSync(`${dir}/t${t}.png`, png);
    const label = Buffer.from(
      `<svg width="480" height="34"><rect width="480" height="34" fill="#10162a" fill-opacity="0.8"/><text x="12" y="23" font-family="sans-serif" font-size="18" fill="#fff">t ${t} · ${(t / film.unit).toFixed(2)} s</text></svg>`,
    );
    tiles.push(
      await sharp(png)
        .resize(480, 270)
        .composite([{ input: label, top: 0, left: 0 }])
        .png()
        .toBuffer(),
    );
  }
  const cols = Math.min(4, tiles.length);
  const rows = Math.ceil(tiles.length / cols);
  await sharp({
    create: {
      width: cols * 488 + 8,
      height: rows * 278 + 8,
      channels: 3,
      background: "#888",
    },
  })
    .composite(
      tiles.map((input, i) => ({
        input,
        left: 8 + (i % cols) * 488,
        top: 8 + Math.floor(i / cols) * 278,
      })),
    )
    .jpeg({ quality: 80 })
    .toFile(`${dir}/sheet.jpg`);
  console.log(`${dir}/sheet.jpg`);
  await browser.close();
  process.exit();
}

const wav = join(tmpdir(), `demo-video-${process.pid}.wav`);
writeFileSync(wav, soundtrack(cues, film.unit, film.length, film.music));

// The master: 1080p at the full frame rate with sound.
const master = `${OUT}/${values.name}-1080p.mp4`;
const ffmpeg = spawn(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    String(RATE),
    "-c:v",
    "png",
    "-i",
    "-",
    "-i",
    wav,
  ]
    .concat([
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
    ])
    .concat([
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-shortest",
      "-movflags",
      "+faststart",
      master,
    ]),
  { stdio: ["pipe", "inherit", "inherit"] },
);
const encoded = new Promise<void>((resolve, reject) =>
  ffmpeg.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)),
  ),
);
const total = Math.round((film.length * RATE) / film.unit);
const posterFrame = Math.round((film.poster * RATE) / film.unit);
const started = Date.now();
for (let n = 0; n < total; n++) {
  const png = await frame((n * film.unit) / RATE);
  if (values.poster && n === posterFrame)
    await sharp(png)
      .resize(1280, 720)
      .webp({ quality: 82 })
      .toFile(values.poster);
  if (!ffmpeg.stdin.write(png))
    await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
  if (n % RATE === 0)
    console.log(
      `frame ${n}/${total} · ${((Date.now() - started) / 1000).toFixed(0)} s`,
    );
}
ffmpeg.stdin.end();
await encoded;
await browser.close();
rmSync(wav);
console.log(master);
if (values.poster) console.log(values.poster);

// The web cut: 720p at the full frame rate with the soundtrack (the page starts it muted), streamable from the first byte.
if (values.web) {
  await run(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-i",
      master,
      "-vf",
      "scale=1280:720:flags=lanczos",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
    ].concat([
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "27",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-movflags",
      "+faststart",
      values.web,
    ]),
  );
  console.log(values.web);
}
