# Pagepaint Chrome Web Store submission

Status: **Version 0.4.4 pending review**, submitted and confirmed by the Chrome Web Store dashboard on October 9, 2026, with automatic publication enabled after approval. The public listing remains on version 0.4.2. Item: `kdjggnmegnnhpdlnogdlbiaakbhgfcjh`. Developer registration, publisher contact verification, listing images, privacy disclosures, reviewer instructions, and free/public distribution are complete.

Public listing: https://chromewebstore.google.com/detail/pagepaint/kdjggnmegnnhpdlnogdlbiaakbhgfcjh

Publisher dashboard: https://chrome.google.com/webstore/devconsole/446ea031-6771-4e92-b734-cd96aafc3445/kdjggnmegnnhpdlnogdlbiaakbhgfcjh/edit

## Listing

Name: Pagepaint

Summary (manifest): Draw, capture, record, and save local feedback for any app.

Category: Developer Tools

Language: English

Homepage: https://pagepaint.dev/

Support: https://github.com/pagepaint/pagepaint/issues

Privacy: https://pagepaint.dev/privacy/

Price: Free

Distribution: Public; all supported regions.

### Detailed description

Show the bug, right on the page.

Pagepaint adds a local visual feedback toolbar to the app you’re reviewing. Click the extension icon, draw over the page, capture the evidence, and leave a comment. Built for developers and QA working on web apps, including AI-built apps.

• Draw with a pen or highlighter, or add rectangles and circles.
• Capture the current view using the browser’s native tab screenshot.
• Record a short video-only clip, up to one minute or approximately 50 MB. Recording can continue across page navigation.
• Keep comments, screenshots, recordings, and drafts together in local issue threads.
• Automatically include the full URL, query parameters, page title, viewport, scroll position, and capture time.
• Rename projects, choose a toolbar color, configure drawing shortcuts, and drag the toolbar where you need it.
• Save ordinary JSON, WebP, and recording files into a selected local repo’s .annotations/ folder, or download a ZIP.
• Open the local project library to revisit feedback from apps you’ve reviewed.

No account or feedback server is required. Feedback stays in this browser profile unless you choose a folder, export a ZIP, or explicitly share it. We do not run analytics, advertising, or automatic synchronization. Browser storage has limits and can be cleared; save a ZIP or repo files for durable copies. Removing the extension removes its browser copies.

Default activation shortcut: Alt+Shift+P. Change it in Chrome’s extension shortcuts. Browser settings pages and protected content may block capture. The extension’s local history is separate from an app using Pagepaint’s CDN script. Recordings have no audio in this release.

Optional GitHub connection and reviewed issue sharing are implemented, with a hosted OAuth service. All local features work without GitHub.

Open source under the MIT license: https://github.com/pagepaint/pagepaint
Installation and demo: https://pagepaint.dev/

## Privacy practices

Single purpose: Capture and annotate user-requested visual feedback about the current web app, with comments and page context saved locally or explicitly exported by the user.

Permissions:

- `activeTab`: Temporarily access the tab the user explicitly activates to read its page context and capture visible pixels. No blanket host permissions.
- `scripting`: Inject the bundled feedback toolbar into that activated tab. No remotely hosted scripts are injected.
- `storage`: Remember project names, project origins, and active recording state within the extension profile. Feedback media and comments remain in IndexedDB.
- `tabCapture`: Record the activated tab after the user presses Record. No background recording and no audio collection.
- `offscreen`: Host the MediaRecorder outside the app document so a user-requested clip continues across navigation and is saved locally.

Remote code: No. All code executing in extension contexts is bundled in the ZIP. Optional GitHub review opens a normal HTTPS web page; it does not execute remote code in an extension context.

Data-handling categories disclosed: website content (screenshots, video, and comments), web history (the URL of pages the user activates and captures), personally identifiable information (the optional author name and GitHub account name), authentication information (optional GitHub OAuth, handled by the trusted HTTPS connection window), personal communications (user-authored feedback messages), and user activity (explicit drawing coordinates and capture-time scroll position). Pagepaint does not passively collect browsing history or monitor activity. Local handling must be disclosed even when the operator receives no feedback.

Certifications supported by the implementation: no data sales; no use or transfer unrelated to the extension’s visual feedback purpose; no creditworthiness or lending use.

## Reviewer test instructions

No login is needed for core features. Open https://pagepaint.dev/, click the extension action, choose a toolbar color, and capture a screenshot. Add a rectangle, attach it, type a comment, and press Send. Cancel the optional folder picker to retain browser-only saving. Reload the page and invoke the action again; feedback persists. Open Settings → Open project library to find the same thread. Download a ZIP, or choose a disposable local folder to verify .annotations/ files. Start Record video on the app tab, navigate within that origin, then use Stop & attach or the extension’s REC action to stop. Preview the clip and export it. Recording is video-only and capped at one minute / approximately 50 MB.

Hosted GitHub OAuth is configured, and Timo verified sign-in in Edge. Core functionality does not depend on sign-in. A real issue write requires a named authorized target and has not been used as a public smoke test.

## Assets and package

- Submitted update: version 0.4.4, using the exact [published ZIP](https://pagepaint.dev/v0.4.4/pagepaint-extension.zip). Its 15 package files match the tested build; permissions are unchanged from 0.4.2. SHA-256: `0cceeaba81a9a51430ea0566169d9124ed470ead574a17caa098a5e25fe17bbb`. The dashboard confirmed the 0.4.4 draft and successful review submission with automatic publication enabled.
- Current published store package: version 0.4.2. Update the website and public documentation after 0.4.4 is approved and the public listing shows that version.
- Icons: bundled in `extension/icons/`; source in `public/brand/`.
- Promotional tile: `store/assets/promo-440x280.png`.
- Actual extension screenshots: `store/assets/screenshot-annotations.png`, `store/assets/screenshot-project-library.png` (1280×800).
- Regenerate vector identity PNGs: `node scripts/brand-assets.js` after installing project dependencies and Playwright Chromium.
- Capture screenshot workflow: `node scripts/store-screenshots.js`; it starts its own temporary fixture server and browser profile. Fixture permissions are never packaged.

The homepage, alternative Release Notes page, README, and agent documentation link to the verified public listing. Reuse this existing item for subsequent store releases; retain a manual ZIP option and distinguish its version from the store package.

Official references: [publishing](https://developer.chrome.com/docs/webstore/publish), [listing images](https://developer.chrome.com/docs/webstore/images), [privacy disclosures](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [local data handling](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
