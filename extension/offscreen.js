// ABOUTME: Records the selected tab in an offscreen extension document.
// ABOUTME: Saves completed video drafts on the device and reports recording progress.
import { VideoRecorder } from "../src/recording.js";
import { FeedbackStore } from "../src/storage.js";
import { putMedia } from "./media-store.js";
let recorder;
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target !== "offscreen") return;
  if (message.type === "stop") {
    recorder?.stop();
    respond({ ok: true });
    return;
  }
  if (message.type === "start") {
    start(message).then(
      () => respond({ ok: true }),
      (error) => respond({ ok: false, error: error.message }),
    );
    return true;
  }
});
async function start(message) {
  if (recorder) throw new Error("A recording is already running.");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: message.streamId,
      },
    },
    audio: false,
  });
  recorder = new VideoRecorder({
    onTick: (seconds) =>
      chrome.runtime
        .sendMessage({ target: "worker", type: "recording-tick", seconds })
        .catch(() => {}),
  });
  const finished = recorder.start(stream);
  // Reply immediately so the injected toolbar can offer Stop.
  finished
    .then(async (video) => {
      const mediaId = crypto.randomUUID();
      await putMedia(mediaId, video.blob);
      const store = new FeedbackStore(message.projectId);
      try {
        await store.put({
          id: `video:${mediaId}`,
          threadId: message.threadId || null,
          video: { ...video, mediaId, context: message.context },
          context: message.context,
          createdAt: video.createdAt,
        });
      } finally {
        store.close();
      }
      await chrome.runtime.sendMessage({
        target: "worker",
        type: "recording-finished",
        projectId: message.projectId,
      });
    })
    .catch((error) =>
      chrome.runtime
        .sendMessage({
          target: "worker",
          type: "recording-error",
          error: error.message,
        })
        .catch(() => {}),
    )
    .finally(() => {
      recorder = null;
    });
}
