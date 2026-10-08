// ABOUTME: Converts local feedback threads into GitHub issues with optional Project membership.
// ABOUTME: Preserves page context and links attachments uploaded to a dedicated feedback branch.
import { videoExtension } from "./recording.js";

export function repositoryName(value) {
  const name = String(value || "")
    .trim()
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\/$|\.git$/g, "");
  if (!/^[a-z\d](?:[a-z\d-]{0,38})\/[a-z\d_.-]{1,100}$/i.test(name))
    throw new Error("Choose a GitHub repository in owner/repository format.");
  return name;
}

export function projectReference(value) {
  if (!value?.trim()) return null;
  const url = new URL(value);
  const match = url.pathname.match(
    /^\/(orgs|users)\/([a-z\d-]+)\/projects\/([1-9]\d*)\/?$/i,
  );
  if (url.origin !== "https://github.com" || !match)
    throw new Error(
      "Use a GitHub Project URL such as https://github.com/orgs/team/projects/1.",
    );
  return {
    kind: match[1] === "orgs" ? "organization" : "user",
    login: match[2],
    number: Number(match[3]),
    url: url.href,
  };
}

export function validateThread(records) {
  if (!Array.isArray(records) || !records.length || records.length > 100)
    throw new Error("Choose a feedback thread with up to 100 messages.");
  for (const record of records) {
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(record.id))
      throw new Error("This feedback has an invalid identifier.");
    if (
      record.capture &&
      !/^data:image\/png;base64,[a-z\d+/]+=*$/i.test(record.capture.annotated)
    )
      throw new Error("This screenshot is unavailable or invalid.");
    if (
      record.video &&
      (record.video.size > 50 * 1024 * 1024 ||
        record.video.blob?.size > 50 * 1024 * 1024)
    )
      throw new Error("Recordings above 50 MB cannot be uploaded to GitHub.");
  }
}

export function issueTitle(records) {
  const root = records[0];
  const title =
    root?.text?.trim().split("\n")[0] ||
    (root?.capture ? "Review this marked page" : "Review this recording");
  return `${root?.area ? `[${root.area}] ` : ""}${title}`.slice(0, 200);
}

export function findIssueMatch(
  issues,
  { repository, records, title, existingIssue },
) {
  const candidates = issues.filter((issue) => !issue.pull_request);
  const linked =
    existingIssue?.repository?.toLowerCase() === repository.toLowerCase()
      ? candidates.find((issue) => issue.number === existingIssue.number)
      : null;
  const marker = `<!-- pagepaint-thread:${records[0].id} -->`;
  const identified = candidates.find((issue) => issue.body?.includes(marker));
  if (identified || linked)
    return { issue: identified || linked, reason: "thread" };
  const matches = candidates.filter(
    (issue) => issue.title?.trim() === title.trim(),
  );
  return matches.length
    ? { issue: matches[0], matches, reason: "title" }
    : null;
}

function inline(value) {
  return String(value ?? "")
    .replace(/[\r\n]/g, " ")
    .replace(/`/g, "'");
}
export function issueBody(records, projectName, attachments = []) {
  const root = records[0];
  const lines = [
    `Feedback from **${inline(projectName)}**`,
    "",
    `<!-- pagepaint-thread:${root.id} -->`,
  ];
  for (const record of records) {
    lines.push(
      "",
      `### ${inline(record.author || "Reviewer")} · ${inline(record.createdAt)}`,
      "",
      record.text || "(Attachment only)",
      "",
    );
    const context = record.context || {};
    lines.push(
      `Page: ${inline(context.url)}`,
      `Title: ${inline(context.title)}`,
      `Viewport: ${context.viewport?.width || "?"} × ${context.viewport?.height || "?"} · DPR ${context.viewport?.devicePixelRatio || 1}`,
      `Scroll: ${context.scroll?.x || 0}, ${context.scroll?.y || 0}`,
    );
    if (record.area) lines.push(`Area: ${inline(record.area)}`);
    const files = attachments.filter((file) => file.recordId === record.id);
    for (const file of files)
      lines.push(
        "",
        file.imageUrl
          ? `![${file.label}](${file.imageUrl})`
          : `[${file.label}](${file.url})`,
      );
    if (record.capture)
      lines.push(
        "",
        `Capture page: ${inline(record.capture.context?.url || context.url)}`,
        `Annotations: ${record.capture.annotations?.length || 0}`,
      );
    if (record.video)
      lines.push(
        "",
        `Recording page: ${inline(record.video.context?.url || context.url)}`,
        `Recording duration: ${Math.ceil(record.video.durationMs / 1000)} seconds`,
      );
  }
  return lines.join("\n");
}

export class GitHubClient {
  constructor(token, fetcher = fetch) {
    this.token = token;
    this.fetcher = (...args) => fetcher(...args);
  }
  async request(path, { method = "GET", body } = {}) {
    const response = await this.fetcher(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2026-03-10",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? "Your GitHub connection expired. Sign in again."
          : `${data.message || "GitHub request failed"} (${response.status}).`,
      );
      error.status = response.status;
      throw error;
    }
    return data;
  }
  user() {
    return this.request("/user");
  }
  async issues(repository) {
    const repo = repositoryName(repository);
    const issues = [];
    for (let page = 1; ; page++) {
      const batch = await this.request(
        `/repos/${repo}/issues?state=all&per_page=100&page=${page}`,
      );
      issues.push(...batch.filter((issue) => !issue.pull_request));
      if (batch.length < 100) return issues;
    }
  }
  async repositories() {
    const repositories = [];
    for (let page = 1; ; page++) {
      const batch = await this.request(
        `/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&page=${page}`,
      );
      repositories.push(
        ...batch.filter((repo) => repo.has_issues && !repo.archived),
      );
      if (batch.length < 100) return repositories;
    }
  }
  async graphql(query, variables) {
    const data = await this.request("/graphql", {
      method: "POST",
      body: { query, variables },
    });
    if (data.errors?.length)
      throw new Error(data.errors.map((error) => error.message).join(" "));
    return data.data;
  }
  async project(value) {
    const reference = projectReference(value);
    if (!reference) return null;
    const data = await this.graphql(
      `query($login:String!,$number:Int!){${reference.kind}(login:$login){projectV2(number:$number){id title url}}}`,
      { login: reference.login, number: reference.number },
    );
    const project = data[reference.kind]?.projectV2;
    if (!project)
      throw new Error("This GitHub Project is unavailable to your account.");
    return project;
  }
  addToProject(projectId, issueId) {
    return this.graphql(
      "mutation($project:ID!,$issue:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$issue}){item{id}}}",
      { project: projectId, issue: issueId },
    );
  }
  async feedbackBranch(repository) {
    const repo = repositoryName(repository);
    const path = `/repos/${repo}`;
    try {
      await this.request(`${path}/git/ref/heads/pagepaint-feedback`);
      return;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    const metadata = await this.request(path);
    const base = await this.request(
      `${path}/git/ref/heads/${encodeURIComponent(metadata.default_branch)}`,
    );
    try {
      await this.request(`${path}/git/refs`, {
        method: "POST",
        body: { ref: "refs/heads/pagepaint-feedback", sha: base.object.sha },
      });
    } catch (error) {
      // Another conversion may have created the branch in the meantime.
      if (error.status !== 422) throw error;
      await this.request(`${path}/git/ref/heads/pagepaint-feedback`);
    }
  }
  async upload(repository, filename, content) {
    const repo = repositoryName(repository);
    if (!/^[a-f\d-]+(?:-original)?\.(png|json|webm|mp4)$/i.test(filename))
      throw new Error("Invalid attachment filename.");
    const path = `.pagepaint/${filename}`;
    const endpoint = `/repos/${repo}/contents/${path}`;
    try {
      await this.request(`${endpoint}?ref=pagepaint-feedback`);
    } catch (error) {
      if (error.status !== 404) throw error;
      try {
        await this.request(endpoint, {
          method: "PUT",
          body: {
            message: `Add Pagepaint feedback ${filename}`,
            branch: "pagepaint-feedback",
            content,
          },
        });
      } catch (writeError) {
        if (![409, 422].includes(writeError.status)) throw writeError;
        await this.request(`${endpoint}?ref=pagepaint-feedback`);
      }
    }
    return `https://github.com/${repo}/blob/pagepaint-feedback/${path}`;
  }
  async createIssue({
    repository,
    records,
    projectName,
    title,
    labels = [],
    projectUrl = "",
    includeAttachments = false,
    existingIssue = null,
    issues = null,
    reuseTitle = true,
  }) {
    validateThread(records);
    const repo = repositoryName(repository);
    const project = projectUrl ? await this.project(projectUrl) : null;
    const inventory = issues || (await this.issues(repo));
    const match = findIssueMatch(inventory, {
      repository: repo,
      records,
      title: title?.trim() || issueTitle(records),
      existingIssue,
    });
    // Cached links are verified against live issues; markers recover a lost create response.
    let issue =
      match && (match.reason === "thread" || reuseTitle) ? match.issue : null;
    const reused = !!issue;
    const attachments = [];
    if (
      !issue &&
      includeAttachments &&
      records.some((record) => record.capture || record.video)
    ) {
      await this.feedbackBranch(repo);
      for (const record of records) {
        if (record.capture) {
          const url = await this.upload(
            repo,
            `${record.id}.png`,
            record.capture.annotated.split(",")[1],
          );
          attachments.push({
            recordId: record.id,
            label: "Annotated screenshot",
            url,
            imageUrl: `../blob/pagepaint-feedback/.pagepaint/${record.id}.png?raw=true`,
          });
          if (
            /^data:image\/png;base64,[a-z\d+/]+=*$/i.test(
              record.capture.original,
            )
          ) {
            attachments.push({
              recordId: record.id,
              label: "Original screenshot",
              imageUrl: `../blob/pagepaint-feedback/.pagepaint/${record.id}-original.png?raw=true`,
              url: await this.upload(
                repo,
                `${record.id}-original.png`,
                record.capture.original.split(",")[1],
              ),
            });
          }
          const annotations = new TextEncoder().encode(
            JSON.stringify(
              {
                context: record.capture.context,
                shapes: record.capture.annotations,
              },
              null,
              2,
            ),
          );
          const metadataUrl = await this.upload(
            repo,
            `${record.id}.json`,
            base64(annotations),
          );
          attachments.push({
            recordId: record.id,
            label: "Page context and editable annotations",
            url: metadataUrl,
          });
        }
        if (record.video?.blob) {
          const content = base64(
            new Uint8Array(await record.video.blob.arrayBuffer()),
          );
          const url = await this.upload(
            repo,
            `${record.id}.${videoExtension(record.video)}`,
            content,
          );
          attachments.push({
            recordId: record.id,
            label: "Video recording",
            url,
          });
        }
      }
    }
    if (!issue)
      issue = await this.request(`/repos/${repo}/issues`, {
        method: "POST",
        body: {
          title: title?.trim() || issueTitle(records),
          body: issueBody(records, projectName, attachments),
          labels,
        },
      });
    if (!reused)
      inventory.push({
        ...issue,
        body: issueBody(records, projectName, attachments),
      });
    const result = {
      number: issue.number,
      url: issue.html_url || issue.url,
      nodeId: issue.node_id || issue.nodeId,
      repository: repo,
      createdAt: new Date().toISOString(),
      reused,
    };
    if (project) {
      try {
        await this.addToProject(project.id, result.nodeId);
        result.projectUrl = project.url;
      } catch (error) {
        result.projectError = `Issue created, but it could not be added to the Project: ${error.message}`;
      }
    }
    return result;
  }
}

function base64(bytes) {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 16384)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(value);
}
