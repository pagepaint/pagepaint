// ABOUTME: Records an explicitly selected media stream as a bounded video attachment.
// ABOUTME: Stops timers and media tracks on completion, cancellation, and errors.
export class VideoRecorder {
  constructor({
    maxDuration = 60,
    maxBytes = 50 * 1024 * 1024,
    onTick = () => {},
  } = {}) {
    this.maxDuration = maxDuration;
    this.maxBytes = maxBytes;
    this.onTick = onTick;
  }

  start(stream) {
    this.stream = stream;
    this.startedAt = Date.now();
    this.chunks = [];
    this.bytes = 0;
    const mimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    try {
      this.recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 2500000,
      });
      this.finished = new Promise((resolve, reject) => {
        this.recorder.ondataavailable = ({ data }) => {
          if (data.size) {
            this.chunks.push(data);
            this.bytes += data.size;
          }
          if (this.bytes >= this.maxBytes) this.stop();
        };
        this.recorder.onerror = ({ error }) => {
          this.cleanup();
          reject(error || new Error("Recording failed."));
        };
        this.recorder.onstop = () => {
          const durationMs = Date.now() - this.startedAt;
          const settings = stream.getVideoTracks()[0]?.getSettings() || {};
          const blob = new Blob(this.chunks, {
            type: this.recorder.mimeType || mimeType || "video/webm",
          });
          this.cleanup();
          if (!blob.size)
            reject(
              new Error(
                "The recording was empty. Try recording for a little longer.",
              ),
            );
          else
            resolve({
              blob,
              mimeType: blob.type,
              durationMs,
              size: blob.size,
              width: settings.width,
              height: settings.height,
              createdAt: new Date(this.startedAt).toISOString(),
            });
        };
      });
      for (const track of stream.getVideoTracks())
        track.addEventListener("ended", () => this.stop(), { once: true });
      this.recorder.start(1000);
      this.timer = setInterval(() => {
        const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
        this.onTick(seconds);
        if (seconds >= this.maxDuration) this.stop();
      }, 250);
      return this.finished;
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  stop() {
    if (this.recorder && this.recorder.state !== "inactive")
      this.recorder.stop();
    return this.finished;
  }

  cleanup() {
    clearInterval(this.timer);
    for (const track of this.stream?.getTracks() || []) track.stop();
  }
}

export function videoExtension(video) {
  return video.mimeType?.includes("mp4") ? "mp4" : "webm";
}
