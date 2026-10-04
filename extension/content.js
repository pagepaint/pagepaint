// ABOUTME: Mounts the shared Pagepaint widget on an explicitly activated browser tab.
// ABOUTME: Uses native tab screenshots and extension storage without remote scripts.
import { ReviewWidget } from "../src/widget.js";
import { originProjectId } from "../src/projects.js";
import { RemoteStore, rpc, resolveVideo } from "./remote-store.js";
async function mount() {
  if (globalThis.__pagepaintExtension) {
    globalThis.__pagepaintExtension.open();
  } else {
    const projectId = await originProjectId(location.origin);
    const widget = new ReviewWidget({
      projectId,
      store: new RemoteStore(projectId),
      repo: false,
      resolveVideo,
      openLibrary: () => rpc("library", { projectId }),
      captureViewport: () => rpc("capture"),
      startRecording: (data) => rpc("record", { ...data, projectId }),
      stopRecording: () => rpc("stop-recording"),
    });
    globalThis.__pagepaintExtension = widget;
    widget.host.dataset.pagepaintExtension = "";
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "recording-tick")
        widget.recordingTick(message.seconds);
      if (message.type === "recording-finished") {
        widget.recording = false;
        widget.updateSend();
        widget.element("recording-bar").hidden = true;
        widget
          .receivePendingVideo()
          .then(() => widget.open())
          .catch((error) => widget.notice(error.message));
      }
      if (message.type === "recording-error") {
        widget.recording = false;
        widget.updateSend();
        widget.element("recording-bar").hidden = true;
        widget.notice(message.error);
        widget.open();
      }
    });
    await widget.ready;
    await rpc("remember-project", {
      projectId,
      projectName: widget.projectName,
      context: widget.context(),
    });
    const recording = await rpc("recording-state");
    if (recording?.projectId === projectId) {
      widget.recording = true;
      widget.updateSend();
      widget.close();
      widget.element("recording-bar").hidden = false;
    } else await widget.open();
  }
}
mount().catch((error) => console.error("Pagepaint:", error));
