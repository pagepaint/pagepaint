// ABOUTME: Waits for cloned page stylesheets before rendering a screenshot.
// ABOUTME: Prevents slow external CSS from producing an unstyled page capture.
export async function waitForCaptureStyles(document) {
  await Promise.all(
    Array.from(document.querySelectorAll('link[rel~="stylesheet"]'))
      .filter((link) => !link.disabled)
      .map((link) => {
        if (link.sheet) return Promise.resolve();
        return new Promise((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timer);
            link.removeEventListener("load", loaded);
            link.removeEventListener("error", failed);
          };
          const loaded = () => {
            cleanup();
            resolve();
          };
          const failed = () => {
            cleanup();
            reject(
              new Error(
                "A page stylesheet could not load for the screenshot. Please try capturing again.",
              ),
            );
          };
          const timer = setTimeout(failed, 15000);
          link.addEventListener("load", loaded, { once: true });
          link.addEventListener("error", failed, { once: true });
          if (link.sheet) loaded();
        });
      }),
  );
  // Force layout so font faces introduced by the stylesheets begin loading.
  document.body.getBoundingClientRect();
  await document.fonts?.ready;
}
