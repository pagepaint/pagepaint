// ABOUTME: Keeps GitHub credentials inside a trusted connection window and previews local threads.
// ABOUTME: Publishes issues directly to GitHub only after the user reviews their destination.
import {
  GitHubClient,
  issueTitle,
  repositoryName,
  projectReference,
  validateThread,
} from "../src/github.js";
const element = (id) => document.getElementById(id);
const parameters = new URLSearchParams(location.hash.slice(1));
const nonce = parameters.get("nonce");
const operation = parameters.get("operation");
let payload, sourceOrigin, client, account, result, signingIn, publishing;
const mediaUrls = [];
async function api(path, method = "GET") {
  const response = await fetch(`/github/api/${path}`, {
    method,
    headers: { "X-Pagepaint": "github" },
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "GitHub connection failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}
function showError(error) {
  element("error").textContent = error.message || String(error);
  element("error").hidden = false;
  element("status").textContent = "";
}
function finish(value) {
  window.opener.postMessage(
    { type: "pagepaint:github-result", nonce, result: value },
    sourceOrigin,
  );
}
function populate() {
  if (!account || !payload) return;
  if (operation === "connect") {
    element("continue").hidden = false;
    return;
  }
  if (operation !== "create") return;
  const configuration = payload.configuration;
  const select = element("repository");
  select.replaceChildren();
  for (const repo of account.repositories) {
    const option = document.createElement("option");
    option.value = repo.full_name;
    option.textContent = `${repo.full_name} · ${repo.private ? "Private" : "Public"}`;
    select.append(option);
  }
  select.value = configuration.repository;
  element("title").value = issueTitle(payload.records);
  element("project").value = configuration.projectUrl || "";
  element("labels").value = configuration.labels?.join(", ") || "";
  element("attachments").checked = !!configuration.includeAttachments;
  // Lock the saved repository mapping: changing it belongs in the app's settings.
  select.disabled = true;
  if (!select.value)
    throw new Error(
      "This repository is unavailable to your GitHub account. Reconnect in Pagepaint settings to select another.",
    );
  element("source").textContent =
    `Received from ${sourceOrigin} · ${payload.projectName}`;
  const clips = payload.records.filter((record) => record.video).length;
  const captures = payload.records.filter((record) => record.capture).length;
  element("attachment-info").textContent =
    `${captures} screenshots · ${clips} recordings. Uploads are ${account.repositories.find((repo) => repo.full_name === select.value)?.private ? "private to this repository" : "publicly accessible"}.`;
  element("preview").replaceChildren();
  for (const url of mediaUrls.splice(0)) URL.revokeObjectURL(url);
  for (const record of payload.records) {
    const note = document.createElement("article");
    note.className = "note";
    const author = document.createElement("small");
    author.textContent = `${record.author || "Reviewer"} · ${record.createdAt}`;
    const text = document.createElement("p");
    text.textContent = record.text || "Attachment only";
    const context = document.createElement("small");
    context.textContent = record.context?.url || "";
    note.append(author, text, context);
    if (record.capture) {
      const image = document.createElement("img");
      image.src = record.capture.annotated;
      image.alt = "Annotated screenshot";
      note.append(image);
    }
    if (record.video?.blob instanceof Blob) {
      const video = document.createElement("video");
      video.controls = true;
      video.src = URL.createObjectURL(record.video.blob);
      mediaUrls.push(video.src);
      note.append(video);
    }
    element("preview").append(note);
  }
  element("review").hidden = false;
}
async function session() {
  try {
    const { token } = await api("session");
    client = new GitHubClient(token);
    const [user, repositories] = await Promise.all([
      client.user(),
      client.repositories(),
    ]);
    account = {
      login: user.login,
      repositories: repositories.map((repo) => ({
        full_name: repo.full_name,
        private: repo.private,
      })),
    };
    element("account").textContent = `Signed in as @${account.login}`;
    element("sign-in").hidden = true;
    element("permission-info").hidden = true;
    element("error").hidden = true;
    populate();
    return true;
  } catch (error) {
    client = null;
    if (error.status === 401) {
      element("account").textContent =
        "Sign in to connect your GitHub account.";
      element("sign-in").hidden = false;
      return false;
    }
    showError(error);
    return false;
  }
}
element("sign-in").addEventListener("click", async () => {
  if (signingIn) return;
  const login = window.open(
    "about:blank",
    "_blank",
    "popup,width=700,height=800",
  );
  if (!login)
    return showError(new Error("Allow the GitHub sign-in window to open."));
  signingIn = new AbortController();
  const signal = signingIn.signal;
  element("sign-in").disabled = true;
  element("cancel-sign-in").hidden = false;
  element("error").hidden = true;
  try {
    const { url } = await api("login", "POST");
    login.location.href = url;
    element("status").textContent = "Complete sign-in in the GitHub window.";
    // The review window remains open, so redirects cannot lose the thread or opener.
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (signal.aborted) {
        element("status").textContent = "Sign-in canceled. You can try again.";
        return;
      }
      if (await session()) {
        element("status").textContent = "";
        return;
      }
      // OAuth isolation can make a live popup report closed; the session is authoritative.
    }
    throw new Error("GitHub sign-in timed out. Try again.");
  } catch (error) {
    showError(error);
  } finally {
    login.close();
    signingIn = null;
    element("sign-in").disabled = false;
    element("cancel-sign-in").hidden = true;
  }
});
element("cancel-sign-in").addEventListener("click", () => signingIn?.abort());
element("continue").addEventListener("click", () => finish(account));
element("done").addEventListener("click", () => finish(result));
element("publish").addEventListener("click", async () => {
  if (publishing || !payload || !client) return;
  publishing = true;
  element("publish").disabled = true;
  element("error").hidden = true;
  element("status").textContent = "Creating your issue…";
  try {
    const repository = repositoryName(element("repository").value);
    const projectUrl = element("project").value.trim();
    projectReference(projectUrl);
    const title = element("title").value.trim();
    if (!title) throw new Error("Enter an issue title.");
    const labels = [
      ...new Set(
        element("labels")
          .value.split(",")
          .map((label) => label.trim())
          .filter(Boolean),
      ),
    ];
    if (labels.length > 20 || labels.some((label) => label.length > 50))
      throw new Error("Use up to 20 labels of 50 characters each.");
    result = await client.createIssue({
      repository,
      title,
      labels,
      projectUrl,
      records: payload.records,
      projectName: payload.projectName,
      includeAttachments: element("attachments").checked,
    });
    element("review").hidden = true;
    element("outcome").hidden = false;
    element("issue-link").href = result.url;
    element("issue-link").textContent =
      `${result.repository} #${result.number}`;
    element("project-result").textContent =
      result.projectError ||
      (result.projectUrl ? "Added to the GitHub Project." : "");
    element("status").textContent = "";
    // Report the link immediately: closing this window cannot leave the local thread unlinked.
    finish(result);
  } catch (error) {
    showError(error);
    if (error.status === 401) {
      element("sign-in").hidden = false;
      element("account").textContent =
        "Your connection expired. Sign in again.";
    }
  } finally {
    publishing = false;
    element("publish").disabled = false;
  }
});
window.addEventListener("message", async (event) => {
  if (
    payload ||
    event.source !== window.opener ||
    !event.origin ||
    event.origin === "null" ||
    event.data?.type !== "pagepaint:github-request" ||
    event.data.nonce !== nonce ||
    event.data.operation !== operation
  )
    return;
  try {
    sourceOrigin = event.origin;
    payload = event.data.payload;
    if (operation === "disconnect") {
      await api("logout", "POST");
      finish({ signedOut: true });
      return;
    }
    if (operation === "create") {
      validateThread(payload.records);
      repositoryName(payload.configuration.repository);
    }
    await session();
  } catch (error) {
    showError(error);
  }
});
window.addEventListener("pagehide", () => {
  for (const url of mediaUrls) URL.revokeObjectURL(url);
});
if (
  window.opener &&
  /^[a-f\d-]{36}$/i.test(nonce) &&
  ["connect", "create", "disconnect"].includes(operation)
) {
  window.opener.postMessage({ type: "pagepaint:github-ready", nonce }, "*");
} else {
  element("account").textContent =
    "Open this window from Pagepaint Settings → GitHub.";
  element("permission-info").hidden = true;
}
