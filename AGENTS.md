# Pagepaint

Work with Timo as a pragmatic engineering colleague. Preserve shared work. Every code file starts with two ABOUTME comment lines. Use MIT licensing. The repository is public; npm publication remains a separate task (`private: true`). The broader umbrella for Timo's other open-source projects is still pending.

The GitHub organization is [pagepaint](https://github.com/pagepaint). The public repository and remote are [pagepaint/pagepaint](https://github.com/pagepaint/pagepaint). GitHub Actions run checks, without automatic deployment or npm publication.

## Architecture

- `src/` is the framework-free CDN widget. `extension/` bundles the same widget in a Manifest V3 extension. `github/` is the trusted GitHub connection and issue review window.
- `index.html` is the single-page installation homepage. Five design alternatives live under `public/directions/`; shared interactions live under `public/homepage/`. The Claude Code product film and poster live under `public/video/`, with reproducible sources in `scripts/demo-video/`.
- Feedback, captures, and recordings stay in browser IndexedDB, a user-selected `.annotations/` directory, or ZIP exports. No feedback backend or synchronization exists.
- `cloudflare/worker.js` handles only GitHub OAuth and CDN assets. It stores no feedback or database records. GitHub access tokens are encrypted in short-lived HttpOnly cookies and read only by the same-origin GitHub window. Never send credentials back to host apps or store them in widget preferences or exports.
- Issue creation and optional uploads go directly from that trusted window to GitHub. Uploads use `.pagepaint/` on the `pagepaint-feedback` branch. Creating an issue requires an explicit review click. Preserve the thread marker used to recover from lost responses without duplicating issues.
- Project identity is independent of its editable display name. Localhost defaults to the first page title; hosted apps default to the hostname. CDN and extension storage are separate.

## Verification

Use Node 24 or newer for development. Run `npm run check` and `npm run format:check` for changes to behavior. Tests use a separate static fixture on port 4319 and mocked GitHub writes. Never create real GitHub issues to test without a named authorized target. Long checks should write complete logs under `.logs/`.

The browser integration server uses `TEST_FIXTURE=1` to serve `tests/fixtures/playground.html` at `/` for stable capture regression checks. Homepage checks use `/homepage/` and `/directions/`. Without that environment flag, the development server serves the actual homepage at `/`.

## Cloudflare deployment with `cf`

Use Cloudflare's new **`cf` CLI**, not the Wrangler CLI. The installed CLI was `1.0.0-beta.12` when verified on October 8, 2026. Its commands and Build Output format are beta: inspect current help/schema for unfamiliar options.

- Discover commands with `cf cli search "<action and resource type>"`. Search queries must be anonymous: omit domain names, account IDs, resource names, email addresses, and secrets. Then inspect the returned command with `--help`, or replace the leading `cf` with `cf schema` for the exact API request. Do not discover commands by chaining nested help calls.
- `cf auth login` authenticates. The DevPlant account is `f8801c7e8853a113a25f8b52fd9ceec1`; `pagepaint.dev` is its active zone (`ce2109c74287b47abf696a3e4c75358e`).
- `npm run build:cdn` generates `.cloudflare/output/v0/` with a bundled Worker, static assets, and `worker.config.json`. Use **`cf deploy --prebuilt`**. Without `--prebuilt`, `cf` may auto-configure or install build tooling and does not run the project's npm build script.
- Validate with `CLOUDFLARE_ACCOUNT_ID=f8801c7e8853a113a25f8b52fd9ceec1 cf deploy --prebuilt --dry-run`. Deploy with the same command without `--dry-run` after authorized rollout. This build records no mode; do not add `--mode`.
- The Worker is named `review-tool` for continuity. Its custom domain is `https://pagepaint.dev`; the existing `https://review-tool.timo-bejan.workers.dev` CDN remains available. GitHub authentication uses only the custom domain, with callback `https://pagepaint.dev/github/callback`.
- Worker secrets are `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a random `SESSION_SECRET` of at least 32 characters. Use `cf deploy --prebuilt --secrets-file /private/path/pagepaint-secrets.json` or a discovered Worker-secret command. Keep secrets outside git, output, bundles, screenshots, and chat. OAuth asks for `repo` and `project` scopes; expiring user tokens should remain enabled.
- Never overwrite published versioned URLs. The CDN build preserves existing releases from the legacy CDN before adding a new version, including the 0.3.0 extension ZIP. Test old pinned URLs after deployment.
- For website-only deployments, run `npm run build && node scripts/build-cdn.js --preserve-current-release`. This also retains the already-published current version, including ZIP bytes whose packaging timestamps otherwise change during a rebuild.
- Smoke-test the deployed demo, script, module, extension ZIP, GitHub configuration/status, and OAuth callbacks after deployment. Green local checks alone do not verify deployment.

Official references: [cf CLI](https://developers.cloudflare.com/cf/), [deployment and prebuilt output](https://developers.cloudflare.com/cf/projects/), [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
