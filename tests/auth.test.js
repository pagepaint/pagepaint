// ABOUTME: Verifies OAuth state, PKCE, encrypted sessions, and the same-origin credential boundary.
// ABOUTME: Exercises Worker authentication without real credentials, network calls, or feedback storage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { auth } from "../cloudflare/worker.js";
const origin = "https://pagepaint.dev";
const env = {
  GITHUB_CLIENT_ID: "test-client",
  GITHUB_CLIENT_SECRET: "test-client-secret",
  SESSION_SECRET: "a-test-session-secret-with-at-least-thirty-two-characters",
};
function request(path, { method = "GET", cookie, headers = {} } = {}) {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      "Sec-Fetch-Site": "same-origin",
      "X-Pagepaint": "github",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
  });
}
async function flow() {
  const login = await auth(
    request("/github/api/login", { method: "POST" }),
    env,
  );
  const target = new URL((await login.json()).url);
  return { target, cookie: login.headers.get("Set-Cookie").split(";")[0] };
}
test("OAuth uses PKCE and a sealed state cookie without revealing the client secret", async () => {
  const { target, cookie } = await flow();
  assert.equal(target.origin, "https://github.com");
  assert.equal(
    target.searchParams.get("redirect_uri"),
    `${origin}/github/callback`,
  );
  assert.equal(target.searchParams.get("code_challenge_method"), "S256");
  assert.equal(target.searchParams.get("scope"), "repo project");
  assert.equal(target.searchParams.get("client_secret"), null);
  assert.ok(!cookie.includes(target.searchParams.get("state")));
});
test("exchanges a valid code, exposes tokens only to the trusted window, and clears the session", async () => {
  const { target, cookie: flowCookie } = await flow();
  const response = await auth(
    request(
      `/github/callback?code=test-code&state=${target.searchParams.get("state")}`,
      { cookie: flowCookie },
    ),
    env,
    async (url, options) => {
      assert.equal(url, "https://github.com/login/oauth/access_token");
      const body = JSON.parse(options.body);
      assert.equal(body.client_secret, env.GITHUB_CLIENT_SECRET);
      assert.equal(body.code_verifier.length, 43);
      return Response.json({
        access_token: "test-user-token",
        expires_in: 28800,
      });
    },
  );
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("Location"),
    `${origin}/github/signed-in.html`,
  );
  const cookies = response.headers.getSetCookie();
  const cookie = cookies
    .find((value) => value.startsWith("__Host-pagepaint-session="))
    .split(";")[0];
  assert.ok(!cookie.includes("test-user-token"));
  assert.match(cookies[0], /HttpOnly; Secure; SameSite=Lax; Max-Age=28800/);
  const session = await auth(request("/github/api/session", { cookie }), env);
  const sessionData = await session.json();
  assert.equal(sessionData.token, "test-user-token");
  assert.ok(sessionData.expiresAt > Date.now());
  assert.ok(sessionData.expiresAt <= Date.now() + 28800000);
  assert.equal(session.headers.get("Cache-Control"), "no-store");
  assert.equal(session.headers.get("Access-Control-Allow-Origin"), null);
  const blocked = await auth(
    request("/github/api/session", {
      cookie,
      headers: {
        Origin: "https://host-app.test",
        "Sec-Fetch-Site": "cross-site",
      },
    }),
    env,
  );
  assert.equal(blocked.status, 403);
  const logout = await auth(
    request("/github/api/logout", { cookie, method: "POST" }),
    env,
  );
  assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0/);
});
test("rejects mismatched state and tampered cookies before exchange", async () => {
  const { cookie } = await flow();
  const fetcher = () => {
    throw new Error("Must not contact GitHub");
  };
  assert.equal(
    (
      await auth(
        request("/github/callback?code=test&state=wrong", { cookie }),
        env,
        fetcher,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await auth(
        request("/github/callback?code=test&state=wrong", {
          cookie: cookie + "corrupt",
        }),
        env,
        fetcher,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await auth(
        request("/github/api/session", {
          cookie: "__Host-pagepaint-session=bad",
        }),
        env,
      )
    ).status,
    401,
  );
});
test("missing configuration is explicit and untrusted requests never begin sign-in", async () => {
  assert.deepEqual(
    await (await auth(request("/github/api/status"), {})).json(),
    { configured: false },
  );
  assert.equal(
    (await auth(request("/github/api/login", { method: "POST" }), {})).status,
    503,
  );
  assert.equal(
    (
      await auth(
        request("/github/api/login", {
          method: "POST",
          headers: { "Sec-Fetch-Site": "cross-site" },
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await auth(
        new Request(
          "https://review-tool.timo-bejan.workers.dev/github/api/session",
        ),
        env,
      )
    ).status,
    403,
  );
});
