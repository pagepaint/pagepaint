# Contributing to Pagepaint

Pagepaint is an MIT-licensed project in [pagepaint/pagepaint](https://github.com/pagepaint/pagepaint), with the hosted toolkit at [pagepaint.dev](https://pagepaint.dev). `private: true` prevents accidental npm publication; npm and Chrome Web Store releases are separate tasks.

Use Node 24 or newer, run `npm ci`, then `npx playwright install chromium`. Before committing, run `npm run check` and `npm run format:check`. Tests start their own temporary static fixture server. Apps using Pagepaint need only the bundled script or extension.

Keep widget behavior in `src/`. The CDN entry point is `src/index.js`; `extension/` contains the MV3 permissions, capture adapter, recorder, and local library. `npm run build` builds both distributions and `dist/pagepaint-extension.zip`. Load `dist/extension` through Chrome or Edge's extensions page with Developer mode enabled.

Prefer small changes that preserve saved records, the existing IndexedDB database, pinned CDN releases, and legacy `ReviewTool` entry points. Start code files with two `ABOUTME:` comments. Add integration coverage for changes affecting capture, persistence, recording, or folder writes. Report bugs with browser/version, Pagepaint version, a minimal page, and expected/actual behavior. Redact URLs, screenshots, and recordings before sharing fixtures.

Use the repository's issues to report bugs and propose changes. GitHub authentication lives in `cloudflare/worker.js` and the trusted `github/` window; credentials must never reach host apps, widget preferences, exports, or git. The API tests mock GitHub writes; live issue creation requires a named test destination. [AGENTS.md](AGENTS.md) documents the `cf` CLI deployment workflow and pinned-release preservation. CI checks changes without deploying or publishing them.
