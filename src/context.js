// ABOUTME: Records page identity and viewport details alongside each feedback message.
// ABOUTME: Preserves complete URLs and repeated query parameters for reproduction.
export function captureContext() {
  const url = new URL(window.location.href);
  return {
    url: url.href,
    origin: url.origin,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    query: Array.from(url.searchParams.entries()),
    title: document.title,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    scroll: { x: window.scrollX, y: window.scrollY },
    capturedAt: new Date().toISOString(),
  };
}

export function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const number = Math.floor(Math.random() * 16);
      return (character === "x" ? number : (number & 3) | 8).toString(16);
    },
  );
}

export function validProjectId(value) {
  return (
    typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)
  );
}
