# Review Tool

A plain JavaScript feedback widget for AI-built apps. Load one CDN script, draw over the page, capture the viewport, and save notes directly into a selected local repository. No backend or local Node server is required to use it.

## Add it to an app

```html
<script
  src="https://review-tool.timo-bejan.workers.dev/v0.2.1/review-tool.js"
  data-review-tool
  data-project="my-app"
  defer
></script>
```

The dependencies are bundled. The script runs in the app's origin, so each domain and localhost port has its own browser storage and folder permission. Use a different `data-project` for separate apps sharing an origin. Your site's CSP must allow the CDN script, the widget's inline styles, and data/blob images.

The hosted playground is at <https://review-tool.timo-bejan.workers.dev/>. The unversioned `/review-tool.js` URL follows the current release; the versioned URL pins this release. ES modules are available at `/v0.2.1/review-tool.mjs`.

```js
import { init } from "https://review-tool.timo-bejan.workers.dev/v0.2.1/review-tool.mjs";

const review = init({
  projectId: "my-app",
  position: "bottom-right",
  offset: 24,
  label: "Feedback",
  author: "You",
  // repo: false, // Optional: use browser storage and ZIP export only.
});

await review.ready;
review.open();
review.close();
await review.drawOnPage();
await review.capture();
await review.exportZip();
const feedback = await review.getFeedback();
review.setPosition({ bottom: 100, right: 32 });
review.destroy();
```

Script attributes also support `data-position`, `data-offset`, `data-label`, and `data-author`. Positions are `bottom-right`, `bottom-left`, `top-right`, and `top-left`; custom numeric offsets are available through JavaScript. Repeated initialization returns the active instance.

## Repo files and agent workflow

On the first saved note in a supported browser, choose the app's repository folder. The directory handle is remembered in IndexedDB. The browser may require renewed permission on a later visit; saving or a Settings button supplies the necessary user gesture.

Each saved note produces:

```text
.annotations/<id>.json
.annotations/<id>.webp           # Annotated capture, when attached
.annotations/<id>.original.webp  # Unannotated reference, when attached
```

JSON includes `id`, `projectId`, `status: "open"`, `comment`, `url`, `viewport`, `selector`, and `shapes`, plus complete message and capture context. Shapes use capture-pixel coordinates. Selectors are best-effort targets from live drawing; screenshot-editor marks may have a null selector. The metadata is written last. Retries preserve existing JSON, including agent changes.

In Settings, **Add agent instructions** appends the following line to existing `AGENTS.md` and/or `CLAUDE.md`, or creates `AGENTS.md` if neither exists. It preserves existing content and avoids duplicate instructions:

> Check `.annotations/` for open items; set status to resolved when done.

An agent on the same filesystem can inspect the images and JSON, make the requested change, and change the JSON status to `"resolved"`. Reopening feedback refreshes statuses for notes in this browser's history. **Save notes to repo** also refreshes statuses and copies browser-only notes into the selected folder. Changing folders requires explicitly saving existing notes to the new folder.

Add `.annotations/` to your app's `.gitignore` if you want feedback excluded from commits. The widget does not change `.gitignore` automatically. Remote agents need access to these files through your usual workspace or file-transfer mechanism.

Folder saving uses the File System Access API. It requires HTTPS or localhost and a browser with `showDirectoryPicker`, typically desktop Chrome or Edge. Firefox, Safari, unsupported webviews, canceled pickers, and denied permissions use browser storage and ZIP export. The user must choose the directory; a website cannot silently discover or access a repository.

## Drawing, appearance, and browser storage

- **Draw & capture** opens a transparent canvas over the live page. Use pen, highlighter, rectangle, or circle/ellipse, with eight drawing colors and undo/redo. **Capture & attach** captures the latest view and composites the marks, excluding the widget.
- The camera button opens the screenshot editor. Draft text and completed strokes autosave. Cancel restores the previous attachment. A viewport resize retains the recovery capture.
- First load offers six accent colors on a dark interface. The choice is saved per project in IndexedDB and can be changed in Settings.
- Each note and screenshot keeps its own full URL, path, repeated query parameters, hash, viewport, scroll position, title, browser context, and timestamp.
- Feedback, drafts, appearance, and folder handles remain in the current browser's IndexedDB database `review-tool`. Feedback is not uploaded. Settings shows the origin's estimated storage usage/quota and offers persistent storage where supported. Estimates include other data stored by the app and are not guaranteed free disk space.
- Browser data can be cleared or evicted. Repo files are ordinary files on the chosen disk and survive clearing browser data. This release does not rebuild browser history from a repository after browser data is cleared.
- **Download ZIP** includes locally known notes and unsent drafts, `feedback.json`, `transcript.md`, original and annotated PNGs, and annotation coordinates. It remains available without folder access. Large histories and ZIP exports are held in memory, so practical capacity is lower than disk capacity.

The conversation is a local feedback log, not an AI chat or multi-user service. `review-tool:feedback` and `review-tool:error` events bubble to `document`; capture errors include their message in `event.detail`.

## Capture limits

[html2canvas-pro](https://github.com/yorickshan/html2canvas-pro) renders the visible DOM viewport without an extension or screen-recording permission. Cross-origin iframes, video, protected canvases, and images without CORS headers may be omitted; some CSS rendering can differ. Captures are capped at 2× scale and approximately six million pixels. Add `data-review-tool-ignore` or `data-html2canvas-ignore` to exclude page elements. URLs and visible content are deliberately included in exported feedback.

## Library development and deployment

Node is only a build/test dependency for library maintainers. Consumers use the CDN script directly.

```sh
npm ci
npx playwright install chromium
npm run check
npm run format:check
```

Tests launch a temporary static fixture server, exercise real browser capture/drawing, IndexedDB recovery, offline ZIP exports, saved appearance, and repository file operations. The automated repo test substitutes an origin-private directory for the native picker; browser permission UI is not covered by that test.

Build the public static assets and deploy with Cloudflare's `cf` CLI:

```sh
cf auth login
CLOUDFLARE_ACCOUNT_ID=<your-account-id> npm run deploy
```

`scripts/build-cdn.js` produces Cloudflare Build Output in `.cloudflare/output/v0/`; `cf deploy --prebuilt` hosts only the bundled library, playground, and fonts. It uploads no feedback, repo folders, or backend. The deployment targets a Worker named `review-tool`. Build Output is a beta Cloudflare format; the dry-run check is `cf deploy --prebuilt --dry-run` after `npm run build:cdn`.
