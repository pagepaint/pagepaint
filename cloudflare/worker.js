// ABOUTME: Exchanges GitHub OAuth codes and keeps short-lived credentials in encrypted cookies.
// ABOUTME: Serves the CDN without accepting or storing feedback, screenshots, or recordings.
const SESSION = "__Host-pagepaint-session";
const FLOW = "__Host-pagepaint-oauth";
const encoder = new TextEncoder();
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

function json(data, status = 200, extra = {}) {
  return Response.json(data, { status, headers: { ...headers, ...extra } });
}
function cookie(name, value, seconds) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
function bytes(value) {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}
function base64(value) {
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
async function key(secret) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
async function seal(value, secret, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(purpose) },
    await key(secret),
    encoder.encode(JSON.stringify(value)),
  );
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}
async function unseal(request, name, secret) {
  try {
    const value = request.headers
      .get("Cookie")
      ?.split("; ")
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    if (!value || value.length > 5000) return null;
    const [iv, encrypted] = value.split(".");
    const decoded = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(iv), additionalData: encoder.encode(name) },
      await key(secret),
      bytes(encrypted),
    );
    const data = JSON.parse(new TextDecoder().decode(decoded));
    return data.expiresAt > Date.now() ? data : null;
  } catch {
    return null;
  }
}
function trusted(request, origin) {
  return (
    request.headers.get("X-Pagepaint") === "github" &&
    (!request.headers.has("Origin") ||
      request.headers.get("Origin") === origin) &&
    request.headers.get("Sec-Fetch-Site") === "same-origin"
  );
}
function configured(env) {
  return !!(
    env.GITHUB_CLIENT_ID &&
    env.GITHUB_CLIENT_SECRET &&
    env.SESSION_SECRET?.length >= 32
  );
}
export async function auth(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const origin = env.AUTH_ORIGIN || "https://pagepaint.dev";
  if (url.origin !== origin)
    return json({ error: "Open GitHub settings at pagepaint.dev." }, 403);
  if (url.pathname === "/github/api/status" && request.method === "GET")
    return json({ configured: configured(env) });
  if (url.pathname !== "/github/callback" && !trusted(request, origin))
    return json({ error: "Use the Pagepaint GitHub window." }, 403);
  if (!configured(env))
    return json(
      {
        error:
          "GitHub sign-in is awaiting application registration. See the GitHub setup guide.",
      },
      503,
    );
  if (url.pathname === "/github/api/login" && request.method === "POST") {
    const state = crypto.randomUUID();
    const verifier = base64(crypto.getRandomValues(new Uint8Array(32)));
    const flow = await seal(
      { state, verifier, expiresAt: Date.now() + 600000 },
      env.SESSION_SECRET,
      FLOW,
    );
    const target = new URL("https://github.com/login/oauth/authorize");
    target.search = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: `${origin}/github/callback`,
      scope: "repo project",
      state,
      code_challenge: base64(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", encoder.encode(verifier)),
        ),
      ),
      code_challenge_method: "S256",
    }).toString();
    return json({ url: target.href }, 200, {
      "Set-Cookie": cookie(FLOW, flow, 600),
    });
  }
  if (url.pathname === "/github/callback" && request.method === "GET") {
    const flow = await unseal(request, FLOW, env.SESSION_SECRET);
    if (!flow || flow.state !== url.searchParams.get("state"))
      return json(
        {
          error:
            "GitHub sign-in expired or failed its security check. Start again.",
        },
        400,
      );
    if (url.searchParams.has("error"))
      return json(
        {
          error:
            "GitHub sign-in was canceled. Close this window and try again.",
        },
        401,
        { "Set-Cookie": cookie(FLOW, "", 0) },
      );
    const code = url.searchParams.get("code");
    if (!code || code.length > 200)
      return json({ error: "Missing GitHub authorization code." }, 400);
    const response = await fetcher(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${origin}/github/callback`,
          code_verifier: flow.verifier,
        }),
      },
    );
    const token = await response.json();
    if (!response.ok || !token.access_token)
      return json(
        { error: "GitHub could not complete sign-in. Start again." },
        401,
      );
    const seconds = Math.min(Number(token.expires_in) || 28800, 28800);
    const session = await seal(
      { token: token.access_token, expiresAt: Date.now() + seconds * 1000 },
      env.SESSION_SECRET,
      SESSION,
    );
    const output = new Headers({
      ...headers,
      Location: `${origin}/github/signed-in.html`,
    });
    output.append("Set-Cookie", cookie(SESSION, session, seconds));
    output.append("Set-Cookie", cookie(FLOW, "", 0));
    return new Response(null, { status: 303, headers: output });
  }
  if (url.pathname === "/github/api/session" && request.method === "GET") {
    const session = await unseal(request, SESSION, env.SESSION_SECRET);
    return session
      ? json({ token: session.token })
      : json({ error: "Sign in with GitHub to continue." }, 401);
  }
  if (url.pathname === "/github/api/logout" && request.method === "POST")
    return json({ signedOut: true }, 200, {
      "Set-Cookie": cookie(SESSION, "", 0),
    });
  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/github/api/") ||
      url.pathname === "/github/callback"
    ) {
      try {
        return await auth(request, env);
      } catch {
        return json(
          { error: "GitHub sign-in could not complete. Please try again." },
          502,
        );
      }
    }
    const response = await env.ASSETS.fetch(request);
    if (!url.pathname.startsWith("/github/")) return response;
    const secured = new Response(response.body, response);
    secured.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.github.com; img-src 'self' data: blob:; media-src blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    secured.headers.set("Referrer-Policy", "no-referrer");
    secured.headers.set("Cache-Control", "no-store");
    secured.headers.delete("Access-Control-Allow-Origin");
    return secured;
  },
};
