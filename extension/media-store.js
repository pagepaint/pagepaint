// ABOUTME: Shares recording blobs between extension pages and its service worker.
// ABOUTME: Sends selected recordings in small chunks rather than large JSON messages.
const ready = new Promise((resolve, reject) => {
  const request = indexedDB.open("pagepaint-media", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("blobs");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function run(mode, action) {
  const db = await ready;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("blobs", mode);
    const request = action(tx.objectStore("blobs"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () =>
      reject(tx.error || new Error("Could not save recording."));
  });
}
export const putMedia = (id, blob) =>
  run("readwrite", (store) => store.put(blob, id));
export const getMedia = (id) => run("readonly", (store) => store.get(id));
export async function wireRecord(record) {
  if (!record?.video?.blob) return record;
  const { blob, ...video } = record.video;
  video.mediaId ||= crypto.randomUUID();
  await putMedia(video.mediaId, blob);
  return { ...record, video };
}
export async function storedRecord(record) {
  if (!record?.video?.mediaId || record.video.blob) return record;
  const blob = await getMedia(record.video.mediaId);
  if (!blob) throw new Error("The recording file is missing.");
  return { ...record, video: { ...record.video, blob } };
}
