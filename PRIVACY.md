# Pagepaint data and permissions

Pagepaint has no feedback backend, accounts, analytics, or synchronization. The CDN host serves static code, a playground, and the extension ZIP. Like any static host, it may receive normal asset request metadata; annotations and recordings are not sent to it.

A CDN embed stores feedback, drafts, settings, and permitted directory handles in the app origin's IndexedDB. Each domain, scheme, and port is separate. The extension stores feedback in its own profile's IndexedDB and identifies projects by the captured app's origin. CDN and extension histories are separate; there is no automatic migration or sync.

Annotations deliberately include full URLs, query parameters, page titles, viewport details, visible content, comments, and timestamps. Recordings contain the selected screen or tab. Review exports before sharing them. A user-selected repo folder receives ordinary `.annotations/` files; folder access requires the browser's permission. ZIP downloads provide the alternative.

The extension requests `activeTab` and `scripting` to mount Pagepaint on an explicitly activated tab and capture its visible pixels; `tabCapture` and `offscreen` to record that tab across navigation; and `storage` to remember projects and recording state. It has no blanket host permission and bundles executable dependencies. Browser-internal pages and protected content may block capture. It keeps activation on same-origin navigations while permitted; invoke the extension again on a different origin.

Recording is video-only in this release and automatically stops at one minute or approximately 50 MB, checked when each encoded chunk arrives. The CDN version prompts you to choose a screen, window, or tab. Leaving its page ends recording; stop first to save the clip. The extension recorder runs outside the app document and saves a recoverable attachment even if that tab navigates or closes. In-progress clips cannot survive browser shutdown. The recording badge/action lets you stop recording after navigation.

Browser storage has browser-defined quotas and can be evicted or cleared. It is not unlimited. Removing the extension also removes its browser data. Use a repo folder or ZIP for durable copies; there is no server recovery. ZIP creation holds the selected history and recordings in memory, which limits very large exports.
