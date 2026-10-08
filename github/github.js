// ABOUTME: Keeps GitHub credentials inside a trusted connection window and previews local threads.
// ABOUTME: Publishes issues directly to GitHub only after the user reviews their destination.
import {
  GitHubClient,
  issueTitle,
  findIssueMatch,
  repositoryName,
  projectReference,
  validateThread,
} from "../src/github.js";
const element = (id) => document.getElementById(id);
const parameters = new URLSearchParams(location.hash.slice(1));
const nonce = parameters.get("nonce");
const operation = parameters.get("operation");
let payload, sourceOrigin, client, account, signingIn, publishing;
const mediaUrls = [];
let entries = [],
  inventory = null,
  checking = false;
const batch = operation === "create-all";
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
  if (error.status === 401) {
    client = null;
    element("sign-in").hidden = false;
    element("account").textContent = "Your connection expired. Sign in again.";
  }
}
function finish(value) {
  window.opener.postMessage(
    { type: "pagepaint:github-result", nonce, result: value },
    sourceOrigin,
  );
}
function preview(records, container) {
  for (const record of records) {
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
    container.append(note);
  }
}
function selectedEntries() {
  return entries.filter((entry) => entry.selected && !entry.result);
}
function updatePublish() {
  const selected = selectedEntries();
  element("publish").disabled =
    publishing || checking || !client || !inventory || !selected.length;
  element("publish").textContent = batch
    ? "Create selected issues"
    : entries[0]?.match && entries[0].choice !== "create"
      ? "Link existing issue"
      : "Create GitHub issue";
  element("selection-status").textContent =
    `${selected.length} ${selected.length === 1 ? "thread" : "threads"} selected. Existing issues are linked without changing their content. Nothing is sent until you confirm.`;
  element("return-results").hidden =
    !batch || !entries.some((entry) => entry.result);
}
function matchKey(match) {
  return match
    ? `${match.reason}:${(match.matches || [match.issue])
        .map((issue) => issue.number)
        .sort((a, b) => a - b)
        .join(",")}`
    : "";
}
function matchEntry(entry, issues) {
  return findIssueMatch(issues, {
    repository: payload.configuration.repository,
    records: entry.records,
    title: entry.title,
    existingIssue: entry.records[0].github,
  });
}
function renderMatch(entry) {
  const container = entry.matchElement;
  container.replaceChildren();
  if (entry.result) {
    const link = document.createElement("a");
    link.href = entry.result.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = `${entry.result.reused ? "Linked" : "Created"} #${entry.result.number}`;
    container.append(link);
    if (entry.result.projectError) {
      const warning = document.createElement("p");
      warning.textContent = entry.result.projectError;
      container.append(warning);
    }
    return;
  }
  if (!entry.match) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = inventory
      ? "No matching issue found, including closed issues."
      : "Checking open and closed issues…";
    container.append(hint);
    return;
  }
  const box = document.createElement("div");
  box.className = "match";
  const description = document.createElement("p");
  description.textContent =
    entry.match.reason === "thread"
      ? "This thread already has a GitHub issue. Link it instead of creating another."
      : "An issue with this exact title already exists. Choose whether to link it or create a separate issue.";
  box.append(description);
  for (const issue of entry.match.matches || [entry.match.issue]) {
    const p = document.createElement("p");
    const link = document.createElement("a");
    link.href = issue.html_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = `#${issue.number} · ${issue.title || entry.title} · ${issue.state || "open"}`;
    p.append(link);
    box.append(p);
  }
  if (entry.match.reason === "title") {
    const label = document.createElement("label");
    label.textContent = "If an issue already exists";
    const select = document.createElement("select");
    for (const issue of entry.match.matches) {
      const option = document.createElement("option");
      option.value = String(issue.number);
      option.textContent = `Link existing #${issue.number} (${issue.state || "open"})`;
      select.append(option);
    }
    const separate = document.createElement("option");
    separate.value = "create";
    separate.textContent = "Create a separate issue";
    select.append(separate);
    select.value = entry.choice;
    select.addEventListener("change", () => {
      entry.choice = select.value;
      updatePublish();
    });
    label.append(select);
    box.append(label);
  }
  container.append(box);
}
function applyMatch(entry, match) {
  const changed = matchKey(entry.match) !== matchKey(match);
  entry.match = match;
  if (changed || !entry.choice)
    entry.choice = match ? String(match.issue.number) : "create";
  renderMatch(entry);
  return changed;
}
async function checkExisting() {
  if (checking || publishing || !client) return;
  checking = true;
  updatePublish();
  element("check-existing").disabled = true;
  element("status").textContent = "Checking open and closed GitHub issues…";
  try {
    inventory = await client.issues(payload.configuration.repository);
    for (const entry of entries)
      if (!entry.result) applyMatch(entry, matchEntry(entry, inventory));
    element("error").hidden = true;
    element("status").textContent =
      "Existing issues checked. Review your selection below.";
  } catch (error) {
    inventory = null;
    showError(error);
  } finally {
    checking = false;
    element("check-existing").disabled = false;
    updatePublish();
  }
}
async function populate() {
  if (!account || !payload) return;
  if (operation === "connect") {
    if (payload.autoConnect && payload.login === account.login) {
      finish(account);
      return;
    }
    element("continue").hidden = false;
    return;
  }
  if (!["create", "create-all"].includes(operation)) return;
  if (entries.length) {
    await checkExisting();
    return;
  }
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
  select.disabled = true;
  if (!select.value)
    throw new Error(
      "This repository is unavailable to your GitHub account. Reconnect in Pagepaint settings to select another.",
    );
  element("project").value = configuration.projectUrl || "";
  element("labels").value = configuration.labels?.join(", ") || "";
  element("attachments").checked = !!configuration.includeAttachments;
  element("source").textContent =
    `Received from ${sourceOrigin} · ${payload.projectName}`;
  entries = (batch ? payload.threads : [payload.records]).map((records) => ({
    records,
    title: issueTitle(records),
    selected: true,
  }));
  const records = entries.flatMap((entry) => entry.records);
  element("attachment-info").textContent =
    `${records.filter((record) => record.capture).length} screenshots · ${records.filter((record) => record.video).length} recordings. New uploads are ${account.repositories.find((repo) => repo.full_name === select.value)?.private ? "private to this repository" : "publicly accessible"}.`;
  element("title-label").hidden = batch;
  element("preview-heading").textContent = batch
    ? "Choose threads to send"
    : "Thread preview";
  if (batch) {
    for (const [index, entry] of entries.entries()) {
      const article = document.createElement("article");
      article.className = "batch-thread";
      const label = document.createElement("label");
      label.className = "check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.setAttribute("aria-label", `Include thread ${index + 1}`);
      checkbox.addEventListener("change", () => {
        entry.selected = checkbox.checked;
        updatePublish();
      });
      entry.checkbox = checkbox;
      label.append(
        checkbox,
        document.createTextNode(
          `Thread ${index + 1} · ${entry.records.length} ${entry.records.length === 1 ? "message" : "messages"}`,
        ),
      );
      const titleLabel = document.createElement("label");
      titleLabel.textContent = "Issue title";
      const input = document.createElement("input");
      input.maxLength = 200;
      input.value = entry.title;
      input.setAttribute("aria-label", `Issue title for thread ${index + 1}`);
      input.addEventListener("input", () => {
        entry.title = input.value;
        if (inventory) applyMatch(entry, matchEntry(entry, inventory));
        updatePublish();
      });
      titleLabel.append(input);
      entry.matchElement = document.createElement("div");
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "View thread and attachments";
      details.append(summary);
      preview(entry.records, details);
      article.append(label, titleLabel, entry.matchElement, details);
      element("batch-list").append(article);
      entry.article = article;
    }
  } else {
    element("title").value = entries[0].title;
    entries[0].matchElement = element("match");
    preview(entries[0].records, element("preview"));
  }
  element("review").hidden = false;
  document.body.classList.add("reviewing");
  await checkExisting();
  for (const entry of entries)
    if (batch && entry.records[0].github && entry.match?.reason === "thread") {
      entry.selected = false;
      entry.checkbox.checked = false;
    }
  updatePublish();
}
async function session() {
  try {
    const { token, expiresAt } = await api("session");
    client = new GitHubClient(token);
    const [user, repositories] = await Promise.all([
      client.user(),
      client.repositories(),
    ]);
    account = {
      login: user.login,
      ...(Number.isFinite(expiresAt) ? { expiresAt } : {}),
      repositories: repositories.map((repo) => ({
        full_name: repo.full_name,
        private: repo.private,
      })),
    };
    element("account").textContent = `Signed in as @${account.login}`;
    element("sign-in").hidden = true;
    element("permission-info").hidden = true;
    element("error").hidden = true;
    await populate();
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
element("title").addEventListener("input", () => {
  if (!entries.length) return;
  entries[0].title = element("title").value;
  if (inventory) applyMatch(entries[0], matchEntry(entries[0], inventory));
  updatePublish();
});
element("check-existing").addEventListener("click", checkExisting);
element("return-results").addEventListener("click", () =>
  finish({
    issues: entries
      .filter((entry) => entry.result)
      .map((entry) => ({
        threadId: entry.records[0].id,
        result: entry.result,
      })),
  }),
);
element("publish").addEventListener("click", async () => {
  if (publishing || checking || !payload || !client || !inventory) return;
  const selected = selectedEntries();
  if (!selected.length) return;
  publishing = true;
  element("review-fields").disabled = true;
  element("return-results").disabled = true;
  updatePublish();
  element("error").hidden = true;
  element("status").textContent = "Rechecking existing issues…";
  try {
    const repository = repositoryName(element("repository").value);
    const projectUrl = element("project").value.trim();
    projectReference(projectUrl);
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
    if (selected.some((entry) => !entry.title.trim()))
      throw new Error("Enter a title for every selected issue.");
    const fresh = await client.issues(repository);
    const changed = selected
      .map((entry) => applyMatch(entry, matchEntry(entry, fresh)))
      .some(Boolean);
    inventory = fresh;
    if (changed)
      throw new Error(
        "Matching issues changed since the last check. Review the updated matches, then confirm again.",
      );
    const newTitles = selected
      .filter((entry) => !entry.match || entry.choice === "create")
      .map((entry) => entry.title.trim());
    if (new Set(newTitles).size !== newTitles.length)
      throw new Error(
        "Two selected threads share a title. Rename one or deselect it before creating issues.",
      );
    for (const [index, entry] of selected.entries()) {
      element("status").textContent =
        `Sending ${index + 1} of ${selected.length}…`;
      const matched =
        entry.match && entry.choice !== "create"
          ? (entry.match.matches || [entry.match.issue]).find(
              (issue) => String(issue.number) === entry.choice,
            )
          : null;
      entry.result = await client.createIssue({
        repository,
        title: entry.title.trim(),
        labels,
        projectUrl,
        records: entry.records,
        projectName: payload.projectName,
        includeAttachments: element("attachments").checked,
        existingIssue: matched
          ? { repository, number: matched.number }
          : entry.records[0].github,
        issues: inventory,
        reuseTitle: entry.choice !== "create",
      });
      if (!batch) {
        finish(entry.result);
        return;
      }
      window.opener.postMessage(
        {
          type: "pagepaint:github-progress",
          nonce,
          progress: { threadId: entry.records[0].id, result: entry.result },
        },
        sourceOrigin,
      );
      entry.selected = false;
      entry.checkbox.checked = false;
      entry.article.querySelectorAll("input, select").forEach((input) => {
        input.disabled = true;
      });
      renderMatch(entry);
    }
    finish({
      issues: entries
        .filter((entry) => entry.result)
        .map((entry) => ({
          threadId: entry.records[0].id,
          result: entry.result,
        })),
    });
  } catch (error) {
    showError(error);
  } finally {
    publishing = false;
    element("review-fields").disabled = false;
    element("return-results").disabled = false;
    updatePublish();
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
    if (["create", "create-all"].includes(operation)) {
      if (batch) {
        if (!Array.isArray(payload.threads) || !payload.threads.length)
          throw new Error("Choose at least one thread.");
        for (const records of payload.threads) validateThread(records);
        if (
          new Set(payload.threads.map((records) => records[0].id)).size !==
          payload.threads.length
        )
          throw new Error(
            "The selected threads contain duplicate identifiers.",
          );
      } else validateThread(payload.records);
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
  ["connect", "create", "create-all", "disconnect"].includes(operation)
) {
  window.opener.postMessage({ type: "pagepaint:github-ready", nonce }, "*");
} else {
  element("account").textContent =
    "Open this window from Pagepaint Settings → GitHub.";
  element("permission-info").hidden = true;
}
