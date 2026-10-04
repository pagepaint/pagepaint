# Contributing to Pagepaint

Pagepaint is prepared for a future public MIT release. The umbrella organization and public repository are still to be chosen. `private: true` prevents accidental npm publication; the current package name is a working name, not a reserved registry name.

Use Node 24 or newer, run `npm ci`, then `npx playwright install chromium`. Before committing, run `npm run check` and `npm run format:check`. Tests start their own temporary static fixture server. Apps using Pagepaint need only the bundled script or extension.

Keep widget behavior in `src/`. The CDN entry point is `src/index.js`; `extension/` contains the MV3 permissions, capture adapter, recorder, and local library. `npm run build` builds both distributions and `dist/pagepaint-extension.zip`. Load `dist/extension` through Chrome or Edge's extensions page with Developer mode enabled.

Prefer small changes that preserve saved records, the existing IndexedDB database, pinned CDN releases, and legacy `ReviewTool` entry points. Start code files with two `ABOUTME:` comments. Add integration coverage for changes affecting capture, persistence, recording, or folder writes. Report bugs with browser/version, Pagepaint version, a minimal page, and expected/actual behavior. Redact URLs, screenshots, and recordings before sharing fixtures.

Before the first public release, choose the organization, package registry name, repository URL, and security reporting contact; review the full Git history for publication; remove the npm publication guard only as part of that release. Chrome Web Store publication is a separate release step. CI checks changes without deploying or publishing them.
