// ABOUTME: Renders the vector Pagepaint identity into extension and social PNG assets.
// ABOUTME: Uses the existing browser test runtime so no graphics dependency is required.
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const wordmark = await readFile("public/brand/pagepaint-wordmark.svg", "utf8");
const inverse = wordmark.replaceAll('stroke="#171717"', 'stroke="#fafafa"');
await writeFile("public/brand/pagepaint-wordmark-light.svg", inverse);
const icon = await readFile("public/brand/pagepaint-icon.svg", "utf8");
await mkdir("extension/icons", { recursive: true });
await mkdir("store/assets", { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
try {
  const page = await browser.newPage();
  async function render(svg, width, height, file) {
    await page.setViewportSize({ width, height });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg}`,
    );
    await page.screenshot({ path: file, omitBackground: true });
  }
  for (const size of [16, 32, 48, 128])
    await render(icon, size, size, `extension/icons/pagepaint-${size}.png`);
  await render(icon, 48, 48, "public/brand/favicon.png");
  await render(icon, 180, 180, "public/brand/apple-touch-icon.png");
  await render(icon, 512, 512, "public/brand/pagepaint-avatar.png");
  const letters = inverse.match(/<g[\s\S]*<\/svg>/)[0].replace("</svg>", "");
  const promo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 280"><rect width="440" height="280" fill="#171717"/><g opacity=".3" fill="none" stroke="#888"><path d="M-10 80H250V300M175-10V150H450"/><rect x="283" y="-30" width="170" height="132" rx="12"/><rect x="-18" y="175" width="140" height="132" rx="12"/></g><g transform="translate(44 92) scale(1.05)">${letters}</g><path d="M336 214c20-14 40-10 49 1" fill="none" stroke="#dcff00" stroke-width="7" stroke-linecap="round"/></svg>`;
  await render(promo, 440, 280, "store/assets/promo-440x280.png");
  const social = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#171717"/><g transform="translate(72 40) scale(1.4)">${letters}</g><g fill="#fafafa" font-family="Arial,sans-serif" font-size="76" font-weight="700" letter-spacing="-3"><text x="72" y="330">Review the page.</text><text x="72" y="414">Show the bug.</text></g><text x="76" y="536" font-family="Arial,sans-serif" font-size="25" fill="#bcbcbc">Local visual feedback · One script or browser extension · MIT</text><path d="M770 340c65-35 147-40 204-8" fill="none" stroke="#dcff00" stroke-width="14" stroke-linecap="round"/></svg>`;
  await render(social, 1200, 630, "public/brand/pagepaint-social.png");
  console.log(
    "Rendered Pagepaint icons, wordmarks, promotional tile, and social image.",
  );
} finally {
  await browser.close();
}
