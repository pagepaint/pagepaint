// ABOUTME: Exposes script-tag and ES module entry points for the review widget.
// ABOUTME: Supports declarative initialization and one active widget per host page.
import { ReviewWidget } from "./widget.js";

let instance;
export function init(options = {}) {
  if (!document.documentElement)
    throw new Error("Initialize ReviewTool after the document element exists.");
  if (instance && !instance.destroyed) return instance;
  instance = new ReviewWidget({
    ...options,
    onDestroy: () => {
      instance = null;
    },
  });
  return instance;
}

export function getInstance() {
  return instance || null;
}

if (typeof window !== "undefined") {
  window.ReviewTool = { init, getInstance, version: "0.2.0" };
  const script = document.currentScript;
  if (script?.hasAttribute("data-review-tool")) {
    const start = () =>
      init({
        projectId: script.dataset.project || "default",
        position: script.dataset.position || "bottom-right",
        offset:
          script.dataset.offset === undefined
            ? 24
            : Number(script.dataset.offset),
        label: script.dataset.label || "Feedback",
        author: script.dataset.author || "You",
      });
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
}
