// ABOUTME: Connects the injected widget to storage in the extension's own origin.
// ABOUTME: Fetches video blobs only for preview and export using bounded messages.
export async function rpc(type, data = {}) {
  const response = await chrome.runtime.sendMessage({
    target: "worker",
    type,
    ...data,
  });
  if (!response?.ok)
    throw new Error(
      response?.error || "Pagepaint could not complete this action.",
    );
  return response.value;
}
export class RemoteStore {
  constructor(projectId) {
    this.projectId = projectId;
    this.persistent = true;
    this.ready = Promise.resolve();
  }
  call(method, ...args) {
    return rpc("store", { projectId: this.projectId, method, args });
  }
  put(record) {
    return this.call("put", record);
  }
  list() {
    return this.call("list");
  }
  draft(threadId) {
    return this.call("draft", threadId);
  }
  drafts() {
    return this.call("drafts");
  }
  pendingVideos() {
    return this.call("pendingVideos");
  }
  preferences() {
    return this.call("preferences");
  }
  folder() {
    return Promise.resolve(null);
  }
  remove(id) {
    return this.call("remove", id);
  }
  clearDraft() {
    return this.call("clearDraft");
  }
  commitFeedback(record, draftId) {
    return this.call("commitFeedback", record, draftId);
  }
  close() {}
}
export async function resolveVideo(video) {
  if (video.blob) return video;
  const chunks = [];
  for (let offset = 0; offset < video.size; offset += 192 * 1024) {
    const base64 = await rpc("media-chunk", { mediaId: video.mediaId, offset });
    chunks.push(
      Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
    );
  }
  return { ...video, blob: new Blob(chunks, { type: video.mimeType }) };
}
