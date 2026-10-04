# Review Tool

A framework-free JavaScript feedback widget for reviewing AI-built apps. A floating button opens a conversation; reviewers can capture the current viewport, draw on it, and attach it to a note. Browser drafts and messages persist in IndexedDB. The included Node.js backend also saves sent feedback as local JSON and PNG files.

## Run the sample

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open [the playground](http://localhost:4318). The sample is the root `index.html`; it loads the same standalone library you embed in another app. No frontend framework or runtime build is required in the host app.

The demo fonts are bundled locally, with their SIL Open Font Licenses in `demo/fonts/`. The library and playground make no external dependency or font requests.

## Embed with one script

```html
<script
  src="http://localhost:4318/review-tool.js"
  data-review-tool
  data-project="my-app"
  data-endpoint="http://localhost:4318"
  defer
></script>
```

`npm run build` produces `dist/review-tool.js` and `dist/review-tool.mjs`. Capture and ZIP dependencies are bundled. Serve `review-tool.js` from your own CDN, static hosting, or the included backend; there are no runtime CDN dependency requests. For HTTPS apps, use an HTTPS backend. This project has not been published to a public CDN or npm registry.

Omit `data-endpoint` for browser-only storage. Script attributes also support `data-position`, `data-offset`, `data-label`, `data-author`, and `data-token`. Load the script once per page; repeated initialization returns the active widget.

## JavaScript / ES modules

```js
// With a script tag, use window.ReviewTool.init(options).
import { init } from "./dist/review-tool.mjs";

const review = init({
  projectId: "my-app",
  endpoint: "http://localhost:4318", // Optional; backend base URL.
  position: "bottom-right",
  offset: 24,
  label: "Feedback",
  author: "Timo",
  // token: 'your-backend-access-token',
});

await review.ready;
review.open();
review.close();
await review.drawOnPage(); // Draw over the real page, then capture and attach.
await review.capture();
await review.exportZip();
const feedback = await review.getFeedback();
review.setPosition("top-left");
review.setPosition({ bottom: 100, right: 32 });
review.destroy();
```

The default is bottom right, 24px from the edges. All four corners work. Custom positions use one vertical and one horizontal numeric pixel offset. The widget clamps its position on smaller screens. Styles are isolated in Shadow DOM; the screenshot editor uses a native modal dialog.

`review-tool:feedback` and `review-tool:error` events bubble to `document`, with details in `event.detail`. Error actions are `capture` and `sync`.

## Drawing and chat

- **Draw & capture** opens a transparent canvas over the live page. Doodle first, then choose **Capture & attach** to capture the current page and composite your marks. The drawing toolbar is excluded. No browser extension is required.
- Scrolling and page interaction pause during drawing. A recovery capture saves completed strokes before the final capture. Cancel restores the previous attachment; a viewport resize attaches the existing recovery capture to preserve alignment.
- The camera button captures immediately and opens a separate screenshot editor. Attached screenshots can be reopened and edited.
- Freehand pen, translucent highlighter, rectangle, and circle/ellipse.
- Eight preset colors, undo, redo, and clear.
- Draw with a mouse, pen, or touch. Undo with Ctrl/⌘ Z; redo with Ctrl/⌘ Shift Z.
- A screenshot can be sent by itself or with text. Ctrl/⌘ Enter sends a note.
- Draft text, attachments, and each completed stroke autosave in this browser.
- Each note records its own full URL, origin, path, query string, repeated query entries, hash, title, viewport, pixel ratio, scroll, browser, language, timezone, and timestamp. A screenshot records the page context at capture time, even if the URL changes before sending.
- The conversation is feedback between reviewers sharing a project. It does not call an AI model. Use the exported bundle as context for a coding agent.

## Storage and exports

Browser storage: IndexedDB database `review-tool`, keyed by project. Data remains on that browser/origin. The backend joins sent notes from different browsers using `projectId`; open conversations refresh every 15 seconds. Drafts remain private to their browser. Offline notes retry on reopening the widget, reconnecting, and periodic refresh. If browser persistence is unavailable, the widget reports memory-only storage and ZIP export still works.

Backend storage defaults to:

```text
data/<projectId>/<feedback-id>/feedback.json
data/<projectId>/<feedback-id>/original.png
data/<projectId>/<feedback-id>/annotated.png
```

Writes are atomic and retries are idempotent. Existing entries cannot be overwritten by a different message. `data/` is ignored by Git.

**Download ZIP** includes all locally known project messages, merges backend messages when available, and includes an unsent draft. It contains `feedback.json`, `transcript.md`, original and annotated PNGs, and per-capture annotation JSON. PNG coordinates refer to the image pixel dimensions. The server export contains all sent backend entries, excluding browser drafts.

## Backend configuration

| Variable          | Default           | Purpose                                                   |
| ----------------- | ----------------- | --------------------------------------------------------- |
| `HOST`            | `127.0.0.1`       | Bind address                                              |
| `PORT`            | `4318`            | Server port                                               |
| `DATA_DIR`        | `./data`          | Local feedback directory                                  |
| `ALLOWED_ORIGINS` | Localhost origins | Comma-separated app origins allowed to access the backend |
| `REVIEW_TOKEN`    | Unset             | Optional bearer token for all API routes                  |

```sh
ALLOWED_ORIGINS=https://preview.example.com,https://feedback.example.com \
REVIEW_TOKEN=your-access-token \
HOST=0.0.0.0 \
DATA_DIR=/absolute/path/to/feedback \
npm start
```

Include the backend's own origin in `ALLOWED_ORIGINS` when hosting it on a custom hostname. Use `ALLOWED_ORIGINS='*'` only if you intentionally want access from every origin. Tokens supplied to a browser widget are visible to that browser; this is a project access gate, not individual-user authentication. For public deployment, put the backend behind HTTPS and your access controls. Nothing is deployed automatically.

| Route                                | Behavior                                |
| ------------------------------------ | --------------------------------------- |
| `GET /api/health`                    | Server health                           |
| `POST /api/feedback`                 | Save a version 1 feedback entry         |
| `GET /api/feedback?projectId=my-app` | Get all sent feedback and PNG data URLs |
| `GET /api/export?projectId=my-app`   | Download the full backend project ZIP   |

Payloads are limited to 32 MiB; each PNG to 8 MiB. The frontend caps capture scale at 2× and approximately 6 million pixels. Identifiers, page context, PNG dimensions, and annotation coordinates are validated. Static routes expose only the demo and distribution files.

## Capture limits

Capture uses [html2canvas-pro](https://github.com/yorickshan/html2canvas-pro), a DOM-based renderer with support for modern CSS color functions. It captures only the visible viewport, excluding the widget. It does not request screen-recording permissions.

DOM rendering can differ from the actual browser view. Cross-origin iframes, video frames, protected canvases, and images without suitable CORS headers may be omitted; some CSS effects may differ. Add `data-review-tool-ignore` or `data-html2canvas-ignore` to elements you want excluded. The original PNG means the unannotated DOM capture.

Browser storage can be cleared or evicted by the browser. Keep the backend data directory or download a ZIP for a durable handoff. Full URLs and visible page content are deliberately included in feedback, including any sensitive query values or content visible to the reviewer.

## Development checks

```sh
npx playwright install chromium
npm run check
npm run format:check
```

The Node tests exercise persistence, validation, idempotent retries, CORS/authentication, project isolation, and ZIP contents. Browser tests exercise the standalone script, actual viewport capture, annotations, draft recovery, backend sync, offline feedback, exports, positions, and small-screen layout.

The source is plain JavaScript under `src/` and `server/`. `scripts/build.js` only bundles the distribution. `index.html` and `demo/` are separate sample assets.
