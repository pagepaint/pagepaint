# Pagepaint

A plain JavaScript feedback widget for AI-built apps. Load one CDN script, draw over the page, capture the viewport, and save notes directly into a selected local repository. Local feedback needs no backend or local Node server. Optional GitHub sharing uses the hosted authentication service.

## Add it to an app

```html
<script
  src="https://pagepaint.dev/v0.4.0/pagepaint.js"
  data-pagepaint
  data-project="my-app"
  defer
></script>
```

The dependencies are bundled. The script runs in the app's origin, so each domain and localhost port has its own browser storage and folder permission. Use a different `data-project` for separate apps sharing an origin. The display name is saved on first visit: localhost uses the page title, falling back to host and port; hosted apps use the hostname without `www.`. Set `data-project-name` to choose another default, or rename it in Settings. Renaming preserves the project ID and existing history. Your site's CSP must allow the CDN script, the widget's inline styles, data/blob images, and blob media.

The hosted playground is at <https://pagepaint.dev/>. The unversioned `/pagepaint.js` URL follows the current release; the versioned URL pins this release. ES modules are available at `/v0.4.0/pagepaint.mjs`. Existing scripts and pinned versions at the legacy workers.dev domain continue to work.

```js
import { init } from "https://pagepaint.dev/v0.4.0/pagepaint.mjs";

const review = init({
  projectId: "my-app",
  projectName: "My app", // Optional; settings can rename it later.
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
await review.recordVideo(); // Starts screen selection; stop through the visible toolbar.
review.setPosition({ bottom: 100, right: 32 });
review.destroy();
```

Script attributes also support `data-project-name`, `data-position`, `data-offset`, `data-label`, and `data-author`. Positions are `bottom-right`, `bottom-left`, `top-right`, and `top-left`; custom numeric offsets are available through JavaScript. Repeated initialization returns the active instance.

## Repo files and agent workflow

On the first saved note in a supported browser, choose the app's repository folder. The directory handle is remembered in IndexedDB. The browser may require renewed permission on a later visit; saving or a Settings button supplies the necessary user gesture.

Each saved note produces:

```text
.annotations/<id>.json
.annotations/<id>.webp           # Annotated capture, when attached
.annotations/<id>.original.webp  # Unannotated reference, when attached
.annotations/<id>.webm           # Recording, when attached (or .mp4)
```

JSON includes `id`, `projectId`, `projectName`, `threadId`, `area`, `status: "open"`, `comment`, `url`, `viewport`, `selector`, and `shapes`, plus complete message and capture context. Shapes use capture-pixel coordinates. Selectors are best-effort targets from live drawing; screenshot-editor marks may have a null selector. The metadata is written last. Retries preserve existing JSON, including agent changes.

In Settings, **Add agent instructions** appends the following line to existing `AGENTS.md` and/or `CLAUDE.md`, or creates `AGENTS.md` if neither exists. It preserves existing content and avoids duplicate instructions:

> Check `.annotations/` for open items; set status to resolved when done.

An agent on the same filesystem can inspect the images and JSON, make the requested change, and change the JSON status to `"resolved"`. Reopening feedback refreshes statuses for notes in this browser's history. **Save notes to repo** also refreshes statuses and copies browser-only notes into the selected folder. Changing folders requires explicitly saving existing notes to the new folder.

Add `.annotations/` to your app's `.gitignore` if you want feedback excluded from commits. The widget does not change `.gitignore` automatically. Remote agents need access to these files through your usual workspace or file-transfer mechanism.

Folder saving uses the File System Access API. It requires HTTPS or localhost and a browser with `showDirectoryPicker`, typically desktop Chrome or Edge. Firefox, Safari, unsupported webviews, canceled pickers, and denied permissions use browser storage and ZIP export. The user must choose the directory; a website cannot silently discover or access a repository.

## Drawing, appearance, and browser storage

- **Draw & capture** opens a transparent canvas over the live page. Use pen, highlighter, rectangle, or circle/ellipse, with eight drawing colors and undo/redo. **Capture & attach** captures the latest view and composites the marks, excluding the widget.
- The camera button opens the screenshot editor. Draft text and completed strokes autosave. Cancel restores the previous attachment. A viewport resize retains the recovery capture.
- First load offers six accent colors on a dark interface. The choice is saved per project in IndexedDB and can be changed in Settings.
- Drag the menu header to move the feedback panel. Focus **Move feedback menu** and use arrow keys (Shift for larger steps) for keyboard movement. The position persists per project, stays within the viewport, and can be reset in Settings.
- Settings lets you record or disable shortcuts for opening feedback, drawing, screenshots, sending, undo, and redo. Defaults are Alt+Shift+F, Alt+Shift+D, Alt+Shift+S, Mod+Enter, Mod+Z, and Mod+Shift+Z; Mod means Ctrl or Command. Escape closes or cancels the current view. Host-page text inputs retain their shortcuts. Browser shortcuts may take priority.
- Each note and screenshot keeps its own full URL, path, repeated query parameters, hash, viewport, scroll position, title, browser context, and timestamp.
- Feedback, drafts, appearance, and folder handles remain in the current browser's IndexedDB database `review-tool`. Feedback is not uploaded. Settings shows the origin's estimated storage usage/quota and offers persistent storage where supported. Estimates include other data stored by the app and are not guaranteed free disk space.
- Browser data can be cleared or evicted. Repo files are ordinary files on the chosen disk and survive clearing browser data. This release does not rebuild browser history from a repository after browser data is cleared.
- **Download ZIP** includes locally known notes and unsent drafts, `feedback.json`, `transcript.md`, original and annotated PNGs, annotation coordinates, and original video files with their context. It remains available without folder access. Large histories and ZIP exports are held in memory, so practical capacity is lower than disk capacity.

One issue is one thread: **Open thread** shows its replies, **All issues** returns to the issue list, and **New issue** starts a separate item. Drafts are saved separately for each thread. Optional area labels group context without a subproject hierarchy. Root issue records have `threadId === id`; replies reference that root. The root record’s status is authoritative for the thread. Older notes become independent issues automatically. The conversation is a local feedback log. The compatible `window.ReviewTool` global and `/review-tool.js` URLs remain available. `window.Pagepaint` is the new global. `review-tool:feedback` and `review-tool:error` events bubble to `document`; capture errors include their message in `event.detail`.

JavaScript initialization also accepts a `hotkeys` object. Keys are `toggle`, `draw-page`, `capture`, `send`, `undo`, and `redo`. Use combinations such as `"Alt+Shift+F"` or `"Mod+Enter"`, and `""` to disable an action. Each combination needs Ctrl, Meta, Mod, or Alt; duplicate combinations are rejected. Saved user preferences take precedence over initialization defaults.

## Video and browser extension

The video button records a user-selected screen, window, or tab using `getDisplayMedia` and `MediaRecorder`. It produces a previewable attachment with recording-time context and saves its Blob in IndexedDB. Recordings are video-only, limited to one minute or approximately 50 MB. Stop through **Stop & attach**, add a comment, then Send. ZIPs and repo saves contain the original `.webm` or `.mp4` file. Canceling screen selection leaves the draft intact. Stop before leaving a CDN-embedded page; its recorder cannot survive page navigation.

Download [the Chrome / Edge extension ZIP](https://pagepaint.dev/v0.4.0/pagepaint-extension.zip), extract it, enable Developer mode at `chrome://extensions` or `edge://extensions`, and choose **Load unpacked** with that folder. Click the extension icon on an app, or use Alt+Shift+P (configurable in the browser’s extension shortcuts). Browser-internal pages may block capture. A Chrome Web Store release will follow public repository preparation.

The extension bundles the shared library, uses native tab screenshots instead of DOM reconstruction, and records in an offscreen document so a clip can continue across navigations. Click its recording badge/action to stop if the on-page toolbar is unavailable. Completed clips are recoverable in its local project library. **Open Pagepaint library** in Settings provides centralized project history, repo folder saving, and ZIP export. Projects are separated by full origin, including localhost port. CDN embeds and the extension have separate storage histories. Activating the extension replaces a mounted CDN widget for that page session, preserving its app-origin data and avoiding duplicate controls.

See [PRIVACY.md](PRIVACY.md) for storage, capture permissions, and deletion behavior. Everything lives in one repository: shared source in `src/`, extension adapters in `extension/`, playground in `index.html` / `demo/`, and builds in `scripts/`.

## Capture limits

[html2canvas-pro](https://github.com/yorickshan/html2canvas-pro) renders the visible DOM viewport without an extension or screen-recording permission. Cross-origin iframes, video, protected canvases, and images without CORS headers may be omitted; some CSS rendering can differ. Captures are capped at 2× scale and approximately six million pixels. Add `data-pagepaint-ignore` or `data-html2canvas-ignore` to exclude page elements. URLs and visible content are deliberately included in exported feedback.

Capture cloning waits for external stylesheets and fonts, and suppresses the hidden contents of closed HTML disclosures (`details`). It does not change the live page. New captures include the library version and renderer in their metadata for troubleshooting. Older screenshots cannot be repaired from their PNGs; capture them again after updating the embedding script.

## Library development and deployment

### GitHub issues and Projects

Open **Settings → GitHub**, sign in, select a repository, and save its configuration. Each Pagepaint project keeps its own destination, optional GitHub Project URL, labels, and attachment preference. Open a feedback thread and choose **Create GitHub issue** to review the title, full thread, URLs, and attachments in a trusted Pagepaint window before posting. The local thread retains its history and gains a GitHub issue link. Retrying after a lost response recovers the existing issue using the thread identifier.

Attachments are optional and use a `pagepaint-feedback` branch in the chosen repository. Annotated and original screenshots, editable shape metadata, and video clips are linked from the issue. Both personal and organization GitHub Projects are supported. If adding a created issue to a board fails, Pagepaint keeps the issue link and reports the board error.

The CDN embed and extension share the hosted authentication service. Feedback never passes through it: the connection window calls GitHub directly. OAuth credentials must first be registered and provisioned; see the [GitHub setup guide](https://pagepaint.dev/github/setup.html). For self-hosting, set the widget's `githubUrl` option (or `data-github-url`) to your `/github/` window and update `AUTH_ORIGIN`, the Worker custom domain, and the OAuth callback together. Sign out ends the browser session; revoke the app in GitHub to remove authorization entirely.

Node 24+ is only a build/test dependency for library maintainers. Consumers use the CDN script directly.

```sh
npm ci
npx playwright install chromium
npm run check
npm run format:check
```

Tests launch a temporary static fixture server, exercise real browser capture/drawing, IndexedDB recovery, offline ZIP exports, saved appearance, and repository file operations. The automated repo test substitutes an origin-private directory for the native picker; browser permission UI is not covered by that test. Video tests use real MediaRecorder encoding; the CDN selector is replaced by a canvas stream. Extension tests exercise real native tab capture and offscreen recording across navigation, using fixture permissions and a Chromium test allowlist instead of clicking the browser toolbar.

Build the public static assets and deploy with Cloudflare's `cf` CLI:

```sh
cf auth login
CLOUDFLARE_ACCOUNT_ID=<your-account-id> npm run deploy
```

`scripts/build-cdn.js` produces Cloudflare Build Output in `.cloudflare/output/v0/`; `cf deploy --prebuilt` deploys the library, playground, fonts, licenses, extension ZIP, and GitHub authentication Worker. It uploads no feedback or repo folders. The Worker retains the name `review-tool` and adds `pagepaint.dev` as its custom domain. Validate with `cf deploy --prebuilt --dry-run` after `npm run build:cdn`. Provision OAuth secrets with `--secrets-file` using a private JSON file containing `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a random `SESSION_SECRET` of at least 32 characters. See [AGENTS.md](AGENTS.md) for the maintained `cf` deployment workflow.

## License and public release

[MIT](LICENSE). Source code is public at [pagepaint/pagepaint](https://github.com/pagepaint/pagepaint). Existing copyright attribution is preserved. npm and Chrome Web Store publication are separate release steps; `private: true` protects against accidental npm publication. [CONTRIBUTING.md](CONTRIBUTING.md) covers development and reporting bugs. CI checks code without deploying it.
