// ABOUTME: Coordinates explicit tab activation, native capture, and background recording.
// ABOUTME: Keeps all feedback in extension IndexedDB and grants no blanket site access.
import { FeedbackStore } from "../src/storage.js";
import { originProjectId } from "../src/projects.js";
import { getMedia, wireRecord, storedRecord } from "./media-store.js";
const stores = new Map();
const allowedMethods = new Set([
  "list",
  "draft",
  "drafts",
  "pendingVideos",
  "preferences",
  "put",
  "remove",
  "clearDraft",
  "commitFeedback",
]);
let creatingOffscreen;
function storeFor(projectId) {
  if (!/^site-[a-f0-9]{64}$/.test(projectId))
    throw new Error("Invalid project identifier.");
  if (!stores.has(projectId))
    stores.set(projectId, new FeedbackStore(projectId));
  return stores.get(projectId);
}
async function library(projectId) {
  const suffix = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`workspace.html${suffix}`),
  });
}
async function inject(tabId) {
  // Replace an embedded copy for this page session to avoid duplicate toolbars and hotkeys.
  // Its IndexedDB history and queued drafts remain in the app's origin.
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const widget =
        window.Pagepaint?.getInstance?.() || window.ReviewTool?.getInstance?.();
      if (widget?.host?.matches?.("[data-review-tool-root]")) widget.destroy();
    },
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}
async function notify(type, data = {}) {
  const { recording } = await chrome.storage.session.get("recording");
  if (recording)
    await chrome.tabs
      .sendMessage(recording.tabId, { type, ...data })
      .catch(() => {});
}
async function handle(message, sender) {
  if (message.type === "store") {
    if (!allowedMethods.has(message.method))
      throw new Error("Unsupported storage action.");
    if (
      sender.tab &&
      sender.url &&
      !sender.url.startsWith(chrome.runtime.getURL("")) &&
      (await originProjectId(new URL(sender.url).origin)) !== message.projectId
    )
      throw new Error("Project does not match this page.");
    const args = [...(message.args || [])];
    if (["put", "commitFeedback"].includes(message.method))
      args[0] = await storedRecord(args[0]);
    const value = await storeFor(message.projectId)[message.method](...args);
    return Array.isArray(value)
      ? Promise.all(value.map(wireRecord))
      : wireRecord(value);
  }
  if (message.type === "media-chunk") {
    const blob = await getMedia(message.mediaId);
    if (!blob || !Number.isInteger(message.offset) || message.offset < 0)
      throw new Error("Recording is unavailable.");
    const bytes = new Uint8Array(
      await blob
        .slice(message.offset, message.offset + 192 * 1024)
        .arrayBuffer(),
    );
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  if (message.type === "remember-project") {
    const { projects = {} } = await chrome.storage.local.get("projects");
    projects[message.projectId] = {
      projectId: message.projectId,
      projectName: message.projectName,
      context: message.context,
    };
    await chrome.storage.local.set({ projects });
    return;
  }
  if (message.type === "library") return library(message.projectId);
  if (message.type === "capture") {
    const tab = await chrome.tabs.get(sender.tab.id);
    if (!tab.active) throw new Error("Keep this tab active while capturing.");
    const original = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
    const bitmap = await createImageBitmap(
      await (await fetch(original)).blob(),
    );
    const result = { original, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }
  if (message.type === "record") {
    const { recording } = await chrome.storage.session.get("recording");
    if (recording) throw new Error("Stop the current recording first.");
    if (!creatingOffscreen)
      creatingOffscreen = (async () => {
        const existing = await chrome.runtime.getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT"],
        });
        if (!existing.length)
          await chrome.offscreen.createDocument({
            url: "offscreen.html",
            reasons: ["USER_MEDIA"],
            justification:
              "Record a tab across page navigation after the user presses Record.",
          });
      })().finally(() => {
        creatingOffscreen = null;
      });
    await creatingOffscreen;
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: sender.tab.id,
    });
    const response = await chrome.runtime.sendMessage({
      ...message,
      target: "offscreen",
      type: "start",
      streamId,
    });
    if (!response?.ok)
      throw new Error(response?.error || "Could not start recording.");
    await chrome.storage.session.set({
      recording: { tabId: sender.tab.id, projectId: message.projectId },
    });
    await chrome.action.setBadgeText({ text: "REC" });
    return;
  }
  if (message.type === "stop-recording")
    return chrome.runtime.sendMessage({ target: "offscreen", type: "stop" });
  if (message.type === "recording-state")
    return (await chrome.storage.session.get("recording")).recording;
  if (message.type === "recording-tick")
    return notify("recording-tick", { seconds: message.seconds });
  if (["recording-finished", "recording-error"].includes(message.type)) {
    await notify(message.type, { error: message.error });
    await chrome.storage.session.remove("recording");
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  throw new Error("Unknown Pagepaint action.");
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target !== "worker" || sender.id !== chrome.runtime.id) return;
  handle(message, sender).then(
    (value) => respond({ ok: true, value }),
    (error) => respond({ ok: false, error: error.message }),
  );
  return true;
});
chrome.action.onClicked.addListener(async (tab) => {
  const { recording } = await chrome.storage.session.get("recording");
  if (recording) {
    await chrome.runtime.sendMessage({ target: "offscreen", type: "stop" });
    return;
  }
  try {
    if (!/^https?:/.test(tab.url || "")) return library();
    await chrome.storage.session.set({
      [`enabled:${tab.id}`]: new URL(tab.url).origin,
    });
    await inject(tab.id);
  } catch (error) {
    console.error("Pagepaint:", error);
    await library();
  }
});
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== "complete" || !/^https?:/.test(tab.url || "")) return;
  const state = await chrome.storage.session.get(`enabled:${tabId}`);
  if (state[`enabled:${tabId}`] === new URL(tab.url).origin)
    await inject(tabId).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) =>
  chrome.storage.session.remove(`enabled:${tabId}`),
);
