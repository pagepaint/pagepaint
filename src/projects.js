// ABOUTME: Chooses a stable display name for a project's first visit.
// ABOUTME: Identifies extension projects by origin, including localhost ports.
export function defaultProjectName(context) {
  const url = new URL(context.url);
  const local =
    /^(localhost|127\..*|\[::1\])$/.test(url.hostname) ||
    url.hostname.endsWith(".localhost");
  return (
    (local && context.title?.trim()) ||
    url.host.replace(/^www\./, "") ||
    context.title ||
    "Untitled project"
  ).slice(0, 120);
}

export async function originProjectId(origin) {
  // Hash the complete origin so ports stay separate and the key has a fixed length.
  return `site-${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(origin))), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
