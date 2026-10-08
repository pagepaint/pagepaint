// ABOUTME: Opens a trusted GitHub connection window without sharing credentials with host apps.
// ABOUTME: Exchanges only configuration, local feedback, and resulting issue links.
export class GitHubBridge {
  constructor(url) {
    this.url = new URL(url || "https://pagepaint.dev/github/");
    if (
      this.url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(this.url.hostname)
    )
      throw new Error("The GitHub connection URL must use HTTPS.");
    this.operations = new Set();
  }
  open(operation, payload) {
    const nonce = crypto.randomUUID();
    const url = new URL(this.url);
    url.hash = new URLSearchParams({ operation, nonce }).toString();
    const popup = window.open(url.href, "_blank", "popup,width=760,height=860");
    if (!popup)
      return Promise.reject(
        new Error(
          "Allow the Pagepaint connection window to open, then try again.",
        ),
      );
    const data = Promise.resolve(payload);
    // Handle loading failures immediately, even before the connection window is ready.
    data.catch(() => {});
    return new Promise((resolve, reject) => {
      let closed;
      let active = true;
      let delivered = false;
      const cleanup = () => {
        active = false;
        window.removeEventListener("message", receive);
        clearInterval(closed);
        this.operations.delete(cancel);
      };
      const cancel = () => {
        cleanup();
        popup.close();
        reject(new Error("The GitHub connection was canceled."));
      };
      const receive = async (event) => {
        if (
          event.source !== popup ||
          event.origin !== this.url.origin ||
          event.data?.nonce !== nonce
        )
          return;
        if (event.data.type === "pagepaint:github-ready" && !delivered) {
          delivered = true;
          try {
            const payload = await data;
            if (active)
              popup.postMessage(
                { type: "pagepaint:github-request", nonce, operation, payload },
                this.url.origin,
              );
          } catch (error) {
            cleanup();
            popup.close();
            reject(error);
          }
        }
        if (event.data.type === "pagepaint:github-result") {
          cleanup();
          popup.close();
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data.result);
        }
      };
      this.operations.add(cancel);
      window.addEventListener("message", receive);
      closed = setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(
            new Error("The GitHub window closed before completing the action."),
          );
        }
      }, 500);
    });
  }
  connect(login) {
    return this.open("connect", { login, autoConnect: !!login });
  }
  createIssue(payload) {
    return this.open("create", payload);
  }
  disconnect() {
    return this.open("disconnect", {});
  }
  destroy() {
    for (const cancel of [...this.operations]) cancel();
  }
}
