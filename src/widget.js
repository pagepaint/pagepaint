// ABOUTME: Embeds a feedback conversation with capture, annotation, and ZIP download.
// ABOUTME: Isolates the interface in Shadow DOM and keeps feedback on the current device.
import html2canvas from "html2canvas-pro";
import { version as libraryVersion } from "../package.json";
import { waitForCaptureStyles } from "./capture-styles.js";
import { AnnotationCanvas } from "./annotations.js";
import { createArchive } from "./archive.js";
import { captureContext, makeId, validProjectId } from "./context.js";
import { FeedbackStore } from "./storage.js";
import { icon } from "./icons.js";
import { styles } from "./styles.js";
import { RepositoryStore, selectorAt } from "./repository.js";
import { ACCENTS } from "./appearance.js";
import { defaultProjectName } from "./projects.js";
import { VideoRecorder } from "./recording.js";
import { GitHubBridge } from "./github-bridge.js";
import { repositoryName, projectReference } from "./github.js";
import { RepositoryPicker } from "./repository-picker.js";
import {
  HOTKEYS,
  hotkeySettings,
  matchesHotkey,
  shortcutFromEvent,
} from "./hotkeys.js";

const COLORS = [
  ["Red", "#ef4444"],
  ["Orange", "#f97316"],
  ["Yellow", "#eab308"],
  ["Green", "#22c55e"],
  ["Teal", "#14b8a6"],
  ["Blue", "#3b82f6"],
  ["Purple", "#a855f7"],
  ["Charcoal", "#1f2937"],
];
const CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"];

function accountDetails(value) {
  if (!value?.login || !Array.isArray(value.repositories)) return null;
  return {
    login: String(value.login),
    repositories: value.repositories.flatMap((repo) => {
      try {
        return [
          {
            full_name: repositoryName(repo.full_name),
            private: !!repo.private,
          },
        ];
      } catch {
        return [];
      }
    }),
    ...(Number.isFinite(value.expiresAt) ? { expiresAt: value.expiresAt } : {}),
  };
}

export class ReviewWidget {
  constructor(options = {}) {
    this.options = {
      projectId: "default",
      position: "bottom-right",
      offset: 24,
      label: "Feedback",
      author: "You",
      ...options,
    };
    if (!validProjectId(this.options.projectId))
      throw new Error(
        "projectId must be 1–80 letters, numbers, underscores, or hyphens, starting with a letter or number.",
      );
    this.records = [];
    this.accent = ACCENTS[0].id;
    this.draftCapture = null;
    this.saveQueue = Promise.resolve();
    this.preferenceQueue = Promise.resolve();
    this.preferences = {};
    this.github =
      this.options.github || new GitHubBridge(this.options.githubUrl);
    this.hotkeys = hotkeySettings(this.options.hotkeys);
    this.events = new AbortController();
    this.store =
      this.options.store || new FeedbackStore(this.options.projectId);
    this.mediaUrls = new Set();
    this.repository = new RepositoryStore(
      this.store,
      this.options.repo !== false,
    );
    this.host = document.createElement("div");
    this.host.dataset.reviewToolRoot = "";
    this.host.dataset.html2canvasIgnore = "";
    this.host.style.cssText =
      'all:initial!important;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;color:var(--ink)!important;color-scheme:dark!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important;';
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = this.template();
    this.repositoryPicker = new RepositoryPicker(
      this.root,
      this.events.signal,
      () => this.place(),
    );
    document.documentElement.append(this.host);
    this.element("fab").querySelector("span").textContent = this.options.label;
    this.element("fab").setAttribute(
      "aria-label",
      `Open ${this.options.label}`,
    );
    this.setPosition(this.options.position);
    this.bind();
    this.ready = this.load();
  }

  element(id) {
    return this.root.getElementById(id);
  }

  context() {
    return this.options.context?.() || captureContext();
  }

  template() {
    return `<style>${styles}</style>
      <button id="fab" class="fab" aria-expanded="false" aria-controls="panel" data-action="toggle">${icon("chat")}<span>Feedback</span></button>
      <section id="panel" class="panel" role="dialog" aria-labelledby="panel-title" hidden>
        <header class="panel-header"><div id="panel-handle" class="brand" role="button" tabindex="0" aria-label="Move feedback menu" title="Drag to move. Arrow keys move; Shift moves faster."><span class="brand-mark">${icon("chat")}</span><div><h2 id="panel-title">Leave a little feedback</h2><p class="subtitle">A note. A screenshot. A clearer next step.</p></div></div><div class="header-actions"><button id="settings" class="icon-button" data-action="settings" aria-label="Feedback settings">${icon("settings")}</button><button class="icon-button" data-action="close" aria-label="Close feedback">${icon("close")}</button></div></header>
        <section id="appearance" class="appearance" aria-label="Feedback appearance" hidden><label class="project-setting">Project name<input id="project-name" maxlength="120" /></label><div class="config-tabs" role="tablist" aria-label="Feedback configuration"><button role="tab" id="general-tab" aria-selected="true" aria-controls="general-config" data-action="general-config">General</button><button role="tab" id="github-tab" aria-selected="false" aria-controls="github-config" data-action="github-config">GitHub</button></div><div id="general-config" role="tabpanel" aria-labelledby="general-tab"><p class="appearance-intro">Pick an accent for your feedback tools. You can change it in Settings anytime.</p><div class="accent-options" role="group" aria-label="Accent color">${ACCENTS.map(({ id, name, color }) => `<button class="accent-option" data-accent="${id}" style="--choice:${color}" aria-pressed="${id === this.accent}"><span class="accent-dot">${icon("check")}</span><span>${name}</span></button>`).join("")}</div><div class="shortcut-info"><strong>Keyboard shortcuts</strong><p>Click a field and press your combination. Backspace clears it. Mod means Ctrl or Command. Browser shortcuts may take priority.</p><div class="shortcut-fields">${HOTKEYS.map(([action, label]) => `<label class="shortcut-row"><span>${label}</span><input data-hotkey="${action}" aria-label="${label} shortcut" readonly placeholder="Disabled" /></label>`).join("")}</div><div class="repo-actions"><button class="storage-button" data-action="reset-hotkeys">Reset shortcuts</button><button class="storage-button" data-action="reset-panel">Reset menu position</button></div><p id="shortcut-error" role="alert" hidden></p></div><button id="open-library" class="storage-button" data-action="open-library" hidden>Open Pagepaint library</button><div class="repo-info"><strong>Save into your app’s repo</strong><p id="repo-status"></p><div class="repo-actions"><button id="choose-repo" class="storage-button" data-action="choose-repo">Choose repo folder</button><button id="write-repo" class="storage-button" data-action="write-repo">Save notes to repo</button><button id="agent-instructions" class="storage-button" data-action="agent-instructions">Add agent instructions</button></div><p class="storage-hint">Files go into .annotations/. Your agent can mark items resolved in the JSON.</p></div><div class="storage-info"><strong>Saved on this device</strong><p id="storage-usage">Checking browser storage…</p><p id="storage-protection"></p><button id="persist-storage" class="storage-button" data-action="persist-storage">Keep data on this device</button><p class="storage-hint">Clearing site data removes feedback. Download a ZIP to keep a copy or share it.</p></div></div><section id="github-config" role="tabpanel" aria-labelledby="github-tab" hidden><p class="appearance-intro">Connect this Pagepaint project to a repository. Turn a feedback thread into an issue when you’re ready to share it.</p><p id="github-account" class="github-account">GitHub is not connected.</p><div class="repo-actions"><button id="github-connect" class="primary" data-action="github-connect">Sign in with GitHub</button><button id="github-disconnect" class="storage-button" data-action="github-disconnect" hidden>Sign out</button></div><div class="project-setting"><span>GitHub repository</span><div id="repository-picker" class="repository-picker"><button id="github-repository" class="repository-trigger" aria-label="GitHub repository" aria-haspopup="dialog" aria-expanded="false" aria-controls="github-repository-menu"><span>Connect GitHub first</span><span aria-hidden="true">⌄</span></button><div id="github-repository-menu" class="repository-menu" role="dialog" aria-label="Choose GitHub repository" hidden><input id="github-repository-search" type="search" role="combobox" aria-label="Search GitHub repositories" aria-autocomplete="list" aria-expanded="false" aria-controls="github-repository-results" autocomplete="off" placeholder="Search owner or repository…" /><div id="github-repository-results" class="repository-results" role="listbox" aria-label="GitHub repositories"></div><p id="github-repository-status" class="repository-status" role="status"></p></div></div></div><label class="project-setting">GitHub Project URL (optional)<input id="github-project" type="url" placeholder="https://github.com/orgs/team/projects/1" /></label><label class="project-setting">Issue labels (comma separated)<input id="github-labels" maxlength="300" placeholder="feedback, bug" /></label><label class="github-check"><input id="github-attachments" type="checkbox" />Include screenshots and recordings</label><p class="storage-hint">Attachments are committed to the selected repository’s pagepaint-feedback branch. The issue contains links to these files. Your local copies stay here.</p><p id="github-error" role="alert" hidden></p><button class="primary" data-action="save-github">Save GitHub configuration</button></section><div id="general-actions" class="appearance-actions"><button class="secondary" data-action="cancel-appearance">Cancel</button><button id="save-appearance" class="primary" data-action="save-appearance">Use this color ${icon("check")}</button></div></section>
        <div class="context-bar">${icon("link")}<span id="page-path" class="page-path"></span></div>
        <p id="notice" class="notice" role="alert" hidden></p>
        <nav id="thread-nav" class="thread-nav"><button class="storage-button" data-action="new-thread">New issue</button><button id="github-issue" class="primary github-button" data-action="github-issue" hidden>Send to GitHub</button><span id="thread-label">Issues</span><button id="resolve-thread" class="storage-button" data-action="resolve-thread" hidden>Resolve issue</button><button id="all-threads" class="storage-button" data-action="all-threads" hidden>All issues</button></nav><div id="messages" class="messages" role="log" aria-label="Feedback conversation" aria-live="polite"></div>
        <form id="composer" class="composer">
          <div id="attachment" class="attachment" hidden><button class="attachment-preview" data-action="edit" type="button" aria-label="Edit attached screenshot"><img id="attachment-image" alt="Attached screenshot"/></button><div class="attachment-copy"><strong>Screenshot attached</strong><p id="attachment-detail">Click to edit your marks</p></div><button class="icon-button" data-action="remove-capture" type="button" aria-label="Remove attached screenshot">${icon("close")}</button></div>
          <div id="video-attachment" class="attachment" hidden><button class="storage-button" data-action="preview-video" type="button">Preview recording</button><span id="video-detail" class="attachment-copy"></span><button class="icon-button" data-action="remove-video" type="button" aria-label="Remove recording">${icon("close")}</button></div><label id="area-label" class="area-label">Area (optional)<input id="area" maxlength="80" placeholder="e.g. Checkout" /></label><div class="input-box"><label class="input-label" for="message">YOUR FEEDBACK</label><textarea id="message" rows="3" maxlength="10000" placeholder="What should we change?" aria-describedby="composer-hint"></textarea><div class="composer-actions"><div class="capture-actions"><button id="draw-button" class="capture-button" data-action="draw-page" type="button">${icon("pen")}<span>Draw & capture</span></button><button id="capture-button" class="icon-button" data-action="capture" type="button" aria-label="Capture screen" title="Capture screen without drawing on the page">${icon("camera")}</button><button id="record-button" class="icon-button" data-action="record-video" type="button" aria-label="Record video" title="Record up to one minute">${icon("video")}</button></div><button id="send" class="primary" type="submit" disabled>Send ${icon("send")}</button></div></div>
          <span id="composer-hint" class="sr-only">Attach a screenshot or send a message. Press Control or Command and Enter to send.</span>
        </form>
        <footer class="panel-footer"><span id="save-status" class="save-status" role="status"><span class="status-dot"></span><span id="status-text">Loading feedback…</span></span><div class="footer-actions"><button id="export" class="export-button" data-action="export">${icon("download")}Download ZIP</button><button id="github-all" class="primary github-button" data-action="github-all" disabled>Create all in GitHub</button></div></footer>
      </section>
      <dialog id="editor-dialog" aria-labelledby="editor-title"><div class="editor">
        <header class="editor-header"><div class="editor-heading"><h2 id="editor-title">Show what you mean</h2><p id="capture-path"></p></div><button class="icon-button" data-action="finish-editor" aria-label="Close screenshot editor">${icon("close")}</button></header>
        <div id="editor-tools-slot"><div id="editor-tools" class="editor-toolbar" role="toolbar" aria-label="Annotation tools">
          <div class="tool-group">${[
            ["pen", "Freehand pen"],
            ["highlight", "Highlighter"],
            ["rectangle", "Rectangle"],
            ["ellipse", "Circle"],
          ]
            .map(
              ([tool, label]) =>
                `<button class="tool" data-tool="${tool}" aria-label="${label}" title="${label}" aria-pressed="${tool === "pen"}">${icon(tool)}</button>`,
            )
            .join("")}</div>
          <span class="divider"></span><div class="colors" role="group" aria-label="Drawing color">${COLORS.map(([name, color], index) => `<button class="swatch" style="--swatch:${color}" data-color="${color}" aria-label="${name}" title="${name}" aria-pressed="${index === 0}"></button>`).join("")}</div>
          <div class="tool-group history"><button id="undo" class="tool" data-action="undo" aria-label="Undo drawing" title="Undo (Ctrl/⌘ Z)" disabled>${icon("undo")}</button><button id="redo" class="tool" data-action="redo" aria-label="Redo drawing" title="Redo (Ctrl/⌘ Shift Z)" disabled>${icon("redo")}</button><button id="clear" class="tool" data-action="clear" aria-label="Clear drawings" title="Clear drawings" disabled>${icon("trash")}</button></div>
        </div></div>
        <div class="canvas-stage"><canvas id="canvas" tabindex="0" aria-label="Screenshot drawing canvas. Choose a tool, then drag to mark the screenshot."></canvas></div>
        <footer class="editor-footer"><p class="editor-hint">Draw attention to the details.<br>Every mark saves automatically.</p><div class="editor-actions"><button class="secondary" data-action="recapture">${icon("camera")}Retake</button><button class="primary" data-action="finish-editor">Attach screenshot ${icon("check")}</button></div></footer>
      </div></dialog>
      <dialog id="page-dialog" class="page-dialog" aria-labelledby="page-title"><canvas id="page-canvas" class="page-canvas" tabindex="0" aria-label="Draw directly over the page. Choose a tool, then drag to make a mark."></canvas><div class="page-toolbar"><div class="page-toolbar-heading"><div><h2 id="page-title">Draw on this page</h2><p id="page-drawing-status">Draw, then capture.</p></div><div class="page-drawing-actions"><button class="secondary" data-action="cancel-page">Cancel</button><button id="finish-page" class="primary" data-action="finish-page">${icon("camera")}Capture & attach</button></div></div><div id="page-tools-slot"></div></div></dialog>
      <div id="recording-bar" class="recording-bar" role="status" hidden><span class="recording-dot"></span><span id="recording-time">Recording 0:00 / 1:00</span><button class="primary" data-action="stop-video">Stop & attach</button></div><dialog id="video-dialog" aria-label="Video recording"><div class="viewer-header"><h2>Recording</h2><button class="icon-button" data-action="close-video" aria-label="Close recording">${icon("close")}</button></div><video id="video-player" controls playsinline></video></dialog><dialog id="viewer-dialog" aria-labelledby="viewer-title"><div class="viewer"><div class="viewer-header"><h2 id="viewer-title">Annotated screenshot</h2><button class="icon-button" data-action="close-viewer" aria-label="Close screenshot">${icon("close")}</button></div><img id="viewer-image" alt="Full annotated screenshot"/></div></dialog>`;
  }

  bind() {
    const settings = { signal: this.events.signal };
    this.root.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest("button");
        if (!button || button.disabled) return;
        if (button.dataset.accent) {
          this.applyAccent(button.dataset.accent);
        } else if (button.dataset.tool && this.annotation) {
          this.annotation.tool = button.dataset.tool;
          this.root
            .querySelectorAll("[data-tool]")
            .forEach((tool) =>
              tool.setAttribute("aria-pressed", String(tool === button)),
            );
        } else if (button.dataset.color && this.annotation) {
          this.annotation.color = button.dataset.color;
          this.root
            .querySelectorAll("[data-color]")
            .forEach((color) =>
              color.setAttribute("aria-pressed", String(color === button)),
            );
        } else if (button.dataset.githubThread) {
          this.createGitHubIssue(button.dataset.githubThread).catch((error) =>
            this.notice(error.message),
          );
        } else if (button.dataset.thread) {
          this.switchThread(button.dataset.thread).catch((error) =>
            this.notice(error.message),
          );
        } else if (button.dataset.video) {
          this.previewVideo(
            this.records.find((item) => item.id === button.dataset.video)
              ?.video,
          ).catch((error) => this.notice(error.message));
        } else if (button.dataset.record) {
          const record = this.records.find(
            (item) => item.id === button.dataset.record,
          );
          this.element("viewer-image").src = record.capture.annotated;
          this.element("viewer-dialog").showModal();
        } else {
          this.act(button.dataset.action).catch((error) =>
            this.notice(error.message),
          );
        }
      },
      settings,
    );
    this.element("composer").addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        this.send().catch((error) => this.notice(error.message));
      },
      settings,
    );
    this.element("message").addEventListener(
      "input",
      () => {
        this.updateSend();
        this.queueDraft();
      },
      settings,
    );
    this.element("area").addEventListener(
      "input",
      () => this.queueDraft(),
      settings,
    );
    this.element("video-dialog").addEventListener(
      "close",
      () => this.element("video-player").pause(),
      settings,
    );
    this.element("editor-dialog").addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        this.finishEditor();
      },
      settings,
    );
    this.element("page-dialog").addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        if (!this.capturing) this.cancelPage();
      },
      settings,
    );
    this.element("page-dialog").addEventListener(
      "wheel",
      (event) => event.preventDefault(),
      { ...settings, passive: false },
    );
    this.element("page-dialog").addEventListener(
      "keydown",
      (event) => {
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "PageUp",
            "PageDown",
            "Home",
            "End",
          ].includes(event.key) ||
          (event.key === " " && event.target.tagName === "CANVAS")
        )
          event.preventDefault();
      },
      settings,
    );
    document.addEventListener(
      "keydown",
      (event) => this.handleHotkey(event),
      settings,
    );
    this.root.addEventListener(
      "keydown",
      (event) => {
        const field = event.target.closest("[data-hotkey]");
        if (field) {
          if (["Tab", "Escape"].includes(event.key)) return;
          event.preventDefault();
          try {
            if (
              ["Backspace", "Delete"].includes(event.key) &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            )
              field.dataset.chord = "";
            else field.dataset.chord = shortcutFromEvent(event);
            field.value = field.dataset.chord || "";
            this.shortcutError("");
          } catch (error) {
            this.shortcutError(error.message);
          }
        } else if (event.key === "Escape" && !this.dialogOpen()) this.close();
      },
      settings,
    );
    this.bindPanelDragging(settings);
    window.addEventListener(
      "resize",
      () => {
        this.place();
        if (this.element("page-dialog").open && !this.capturing) {
          this.closePage();
          this.notice(
            "The viewport changed. Your existing marked capture is attached; draw again to capture the new size.",
          );
        }
      },
      settings,
    );
  }

  async act(action) {
    switch (action) {
      case "general-config":
        return this.showConfigTab("general");
      case "github-config":
        return this.showConfigTab("github");
      case "github-connect":
        return this.connectGitHub();
      case "github-disconnect":
        await this.github.disconnect();
        this.githubAccount = null;
        await this.savePreferences({
          github: { ...this.preferences.github, login: null },
          githubAccount: null,
        });
        this.refreshGitHub();
        return;
      case "save-github":
        return this.saveGitHub();
      case "github-issue":
        return this.createGitHubIssue();
      case "github-all":
        return this.createAllGitHubIssues();
      case "open-library":
        return this.options.openLibrary?.();
      case "record-video":
        return this.recordVideo();
      case "stop-video":
        return this.stopVideo();
      case "preview-video":
        return this.previewVideo(this.draftVideo);
      case "close-video":
        this.element("video-dialog").close();
        break;
      case "remove-video":
        this.draftVideo = null;
        this.updateAttachment();
        return this.queueDraft();
      case "new-thread":
        return this.switchThread(null);
      case "all-threads":
        return this.switchThread(null);
      case "resolve-thread":
        return this.resolveThread();
      case "toggle":
        return this.element("panel").hidden ? this.open() : this.close();
      case "close":
        return this.close();
      case "choose-repo":
        return this.chooseRepo();
      case "write-repo":
        return this.writeRepo();
      case "agent-instructions":
        if (await this.repository.prepare()) {
          await this.repository.addInstructions();
          this.element("repo-status").textContent =
            "Agent instructions added. Existing content preserved.";
        }
        break;
      case "settings":
        return this.showAppearance();
      case "reset-hotkeys":
        this.showHotkeys(hotkeySettings(this.options.hotkeys));
        this.shortcutError("");
        break;
      case "reset-panel":
        this.panelPosition = null;
        this.place();
        return this.savePreferences({ panelPosition: null });
      case "save-appearance":
        return this.saveAppearance();
      case "cancel-appearance":
        this.applyAccent(this.accent);
        return this.preferencesSaved ? this.showConversation() : this.close();
      case "persist-storage":
        return this.protectStorage();
      case "capture":
      case "recapture":
        return this.capture();
      case "draw-page":
        return this.drawOnPage();
      case "finish-page":
        return this.finishPage();
      case "cancel-page":
        return this.cancelPage();
      case "edit":
        return this.editCapture();
      case "finish-editor":
        return this.finishEditor();
      case "remove-capture":
        this.draftCapture = null;
        this.updateAttachment();
        this.queueDraft();
        break;
      case "undo":
        this.annotation?.undo();
        break;
      case "redo":
        this.annotation?.redo();
        break;
      case "clear":
        this.annotation?.clear();
        break;
      case "export":
        return this.exportZip();
      case "close-viewer":
        this.element("viewer-dialog").close();
        break;
    }
  }

  dialogOpen() {
    return [
      "editor-dialog",
      "page-dialog",
      "viewer-dialog",
      "video-dialog",
    ].some((id) => this.element(id).open);
  }

  handleHotkey(event) {
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    const target = event.composedPath()[0];
    if (target?.closest?.("[data-hotkey]")) return;
    const inWidget = event.composedPath().includes(this.host);
    if (
      !inWidget &&
      (target?.isContentEditable ||
        target?.closest?.(
          "input,textarea,select,[contenteditable]:not([contenteditable=false])",
        ))
    )
      return;
    const action = HOTKEYS.find(([name]) =>
      matchesHotkey(event, this.hotkeys[name]),
    )?.[0];
    if (!action) return;
    const drawing =
      this.element("editor-dialog").open || this.element("page-dialog").open;
    if (["undo", "redo"].includes(action)) {
      if (!drawing || this.capturing) return;
    } else {
      if (this.dialogOpen() || this.capturing || this.sending) return;
      if (
        action === "send" &&
        (!inWidget ||
          this.element("panel").hidden ||
          this.element("panel").dataset.view !== "conversation")
      )
        return;
      if (["capture", "draw-page"].includes(action) && !this.preferencesSaved)
        return;
      if (
        !this.element("panel").hidden &&
        this.element("panel").dataset.view === "appearance" &&
        action !== "toggle"
      )
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    (action === "send" ? this.send() : this.act(action)).catch((error) =>
      this.notice(error.message),
    );
  }

  showHotkeys(hotkeys) {
    for (const field of this.root.querySelectorAll("[data-hotkey]")) {
      field.dataset.chord = hotkeys[field.dataset.hotkey];
      field.value = field.dataset.chord;
    }
  }

  shortcutError(message) {
    this.element("shortcut-error").textContent = message;
    this.element("shortcut-error").hidden = !message;
  }

  updateHotkeyHints() {
    const controls = {
      toggle: "fab",
      "draw-page": "draw-button",
      capture: "capture-button",
      send: "send",
      undo: "undo",
      redo: "redo",
    };
    for (const [action, label] of HOTKEYS) {
      const control = this.element(controls[action]);
      const shortcut = this.hotkeys[action];
      control.title = shortcut ? `${label} (${shortcut})` : label;
      const ariaShortcut = shortcut
        .replace(
          /Mod/g,
          /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control",
        )
        .replace(/Ctrl/g, "Control");
      if (ariaShortcut) control.setAttribute("aria-keyshortcuts", ariaShortcut);
      else control.removeAttribute("aria-keyshortcuts");
    }
    this.element("composer-hint").textContent =
      `Attach a screenshot or send a message.${this.hotkeys.send ? ` Press ${this.hotkeys.send} to send.` : ""}`;
  }

  savePreferences(patch) {
    this.preferences = { ...this.preferences, ...patch, id: "preferences" };
    const record = structuredClone(this.preferences);
    this.preferenceQueue = this.preferenceQueue
      .catch(() => {})
      .then(() => this.store.put(record));
    return this.preferenceQueue;
  }

  bindPanelDragging(settings) {
    const header = this.root.querySelector(".panel-header");
    const handle = this.element("panel-handle");
    const persist = () =>
      this.savePreferences({ panelPosition: this.panelPosition }).catch(
        (error) => this.notice(error.message),
      );
    header.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || event.target.closest("button")) return;
        const bounds = this.element("panel").getBoundingClientRect();
        this.panelDrag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: bounds.left,
          top: bounds.top,
        };
        header.setPointerCapture(event.pointerId);
        header.dataset.dragging = "";
        event.preventDefault();
      },
      settings,
    );
    header.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId !== this.panelDrag?.id) return;
        this.panelPosition = {
          x: this.panelDrag.left + event.clientX - this.panelDrag.x,
          y: this.panelDrag.top + event.clientY - this.panelDrag.y,
        };
        this.place();
        const bounds = this.element("panel").getBoundingClientRect();
        this.panelPosition = { x: bounds.left, y: bounds.top };
      },
      settings,
    );
    header.addEventListener(
      "lostpointercapture",
      () => {
        if (!this.panelDrag) return;
        this.panelDrag = null;
        delete header.dataset.dragging;
        persist();
      },
      settings,
    );
    handle.addEventListener(
      "keydown",
      (event) => {
        if (
          !event.key.startsWith("Arrow") ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        const bounds = this.element("panel").getBoundingClientRect();
        const distance = event.shiftKey ? 40 : 10;
        this.panelPosition = {
          x:
            bounds.left +
            (event.key === "ArrowLeft"
              ? -distance
              : event.key === "ArrowRight"
                ? distance
                : 0),
          y:
            bounds.top +
            (event.key === "ArrowUp"
              ? -distance
              : event.key === "ArrowDown"
                ? distance
                : 0),
        };
        this.place();
        persist();
      },
      settings,
    );
  }

  async load() {
    try {
      await this.store.ready;
      await this.repository.load().catch(() => {
        this.notice(
          "Reconnect your repo folder in Settings. Browser feedback is still available.",
        );
      });
      const [records, draft, preferences] = await Promise.all([
        this.store.list(),
        this.store.draft(),
        this.store.preferences(),
      ]);
      if (this.destroyed) return this;
      this.records = records;
      this.preferences = preferences || {};
      this.githubAccount = accountDetails(preferences?.githubAccount);
      if (this.githubAccount?.expiresAt <= Date.now())
        this.githubAccount = null;
      this.projectName =
        preferences?.projectName ||
        this.options.projectName?.trim().slice(0, 120) ||
        defaultProjectName(this.context());
      if (!preferences?.projectName)
        await this.savePreferences({ projectName: this.projectName });
      this.element("project-name").value = this.projectName;
      this.element("open-library").hidden = !this.options.openLibrary;
      this.root.querySelector(".storage-info").hidden =
        !!this.options.openLibrary;
      this.hotkeys = hotkeySettings({
        ...this.options.hotkeys,
        ...preferences?.hotkeys,
      });
      if (
        Number.isFinite(preferences?.panelPosition?.x) &&
        Number.isFinite(preferences?.panelPosition?.y)
      )
        this.panelPosition = preferences.panelPosition;
      this.updateHotkeyHints();
      this.preferencesSaved = ACCENTS.some(
        (item) => item.id === preferences?.accent,
      );
      this.accent = this.preferencesSaved ? preferences.accent : ACCENTS[0].id;
      this.applyAccent(this.accent);
      if (draft) {
        this.element("message").value = draft.text || "";
        this.draftCapture = draft.capture || null;
        this.draftContext = draft.context;
        this.draftVideo = draft.video || null;
        this.element("area").value = draft.area || "";
      }
      this.renderMessages();
      this.updateAttachment();
      await this.receivePendingVideo();
      this.localStatus();
      if (!this.store.persistent)
        this.notice(
          "Browser storage is unavailable. Download a ZIP before leaving this page.",
        );
      if (!this.preferencesSaved) this.showAppearance();
    } catch (error) {
      this.notice(error.message);
    }
    return this;
  }

  async open() {
    await this.ready;
    if (this.destroyed) return;
    if (!this.preferencesSaved) return this.showAppearance();
    this.showConversation();
  }

  showConversation() {
    this.setView("conversation");
    const context = this.context();
    this.element("page-path").textContent =
      `${context.pathname}${context.search}${context.hash}`;
    this.element("page-path").title = context.url;
    this.place();
    this.element("message").focus();
    this.readRepoStatuses().catch((error) => this.notice(error.message));
  }

  setView(view) {
    this.element("panel").dataset.view = view;
    this.element("panel").toggleAttribute(
      "data-onboarding",
      !this.preferencesSaved,
    );
    this.element("appearance").hidden = view !== "appearance";
    this.element("settings").hidden = view === "appearance";
    this.element("panel-title").textContent =
      view === "appearance"
        ? this.preferencesSaved
          ? "Feedback settings"
          : "Make it your color"
        : this.projectName || "Pagepaint";
    this.element("save-appearance").innerHTML =
      `${this.preferencesSaved ? "Save settings" : "Use this color"} ${icon("check")}`;
    this.root.querySelector(".subtitle").textContent =
      view === "appearance"
        ? "A little color. Your choice."
        : "A note. A screenshot. A clearer next step.";
    this.element("panel").hidden = false;
    this.element("fab").setAttribute("aria-expanded", "true");
    this.place();
  }

  showAppearance() {
    if (this.destroyed) return;
    this.applyAccent(this.accent);
    this.element("project-name").value = this.projectName;
    this.showHotkeys(this.hotkeys);
    this.showConfigTab("general");
    this.shortcutError("");
    this.setView("appearance");
    this.refreshStorage();
    this.refreshRepo();
    this.root.querySelector(`[data-accent="${this.accent}"]`).focus();
  }

  applyAccent(id) {
    const accent = ACCENTS.find((item) => item.id === id) || ACCENTS[0];
    this.pendingAccent = accent.id;
    this.host.style.setProperty("--accent", accent.color);
    this.root
      .querySelectorAll("[data-accent]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.accent === accent.id),
        ),
      );
  }

  async saveAppearance() {
    const button = this.element("save-appearance");
    button.disabled = true;
    try {
      let hotkeys;
      try {
        hotkeys = hotkeySettings(
          Object.fromEntries(
            Array.from(this.root.querySelectorAll("[data-hotkey]"), (field) => [
              field.dataset.hotkey,
              field.dataset.chord,
            ]),
          ),
        );
      } catch (error) {
        this.shortcutError(error.message);
        return;
      }
      const projectName =
        this.element("project-name").value.trim() ||
        defaultProjectName(this.context());
      await this.savePreferences({
        accent: this.pendingAccent,
        hotkeys,
        projectName,
      });
      this.projectName = projectName;
      this.hotkeys = hotkeys;
      this.updateHotkeyHints();
      if (this.destroyed) return;
      this.accent = this.pendingAccent;
      this.preferencesSaved = true;
      this.showConversation();
    } finally {
      button.disabled = false;
    }
  }

  async refreshStorage() {
    if (this.options.openLibrary) return;
    try {
      const [estimate, protectedData] = await Promise.all([
        navigator.storage?.estimate?.(),
        navigator.storage?.persisted?.(),
      ]);
      if (this.destroyed) return;
      const size = (bytes) =>
        new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
          bytes / (1024 * 1024),
        );
      this.element("storage-usage").textContent = estimate?.quota
        ? `${size(estimate.usage || 0)} MiB used of ~${size(estimate.quota)} MiB available for this site.`
        : "This browser does not report its storage limit.";
      this.element("storage-protection").textContent = !this.store.persistent
        ? "Storage is unavailable. Feedback stays in memory until you leave."
        : protectedData
          ? "Persistent storage enabled."
          : "Browser may clear data when space is low.";
      this.element("persist-storage").hidden =
        !this.store.persistent || protectedData || !navigator.storage?.persist;
      this.place();
    } catch {
      this.element("storage-usage").textContent =
        "Storage estimate unavailable.";
    }
  }

  async protectStorage() {
    const button = this.element("persist-storage");
    button.disabled = true;
    try {
      const granted = await navigator.storage?.persist?.();
      await this.refreshStorage();
      if (!granted)
        this.element("storage-protection").textContent =
          "Browser did not grant persistence. Your feedback still saves; keep a ZIP backup.";
    } finally {
      button.disabled = false;
    }
  }

  close() {
    this.applyAccent(this.accent);
    this.element("panel").hidden = true;
    this.element("fab").setAttribute("aria-expanded", "false");
    this.element("fab").focus();
  }

  setPosition(position = "bottom-right") {
    if (typeof position === "string" && !CORNERS.includes(position))
      throw new Error(
        `position must be ${CORNERS.join(", ")} or an object with top/bottom and left/right offsets.`,
      );
    if (typeof position === "object") {
      if (
        !position ||
        !["top", "bottom"].some((edge) => Number.isFinite(position[edge])) ||
        !["left", "right"].some((edge) => Number.isFinite(position[edge]))
      )
        throw new Error(
          "Custom position needs one vertical and one horizontal numeric offset.",
        );
      if (
        ["top", "bottom"].every((edge) => position[edge] !== undefined) ||
        ["left", "right"].every((edge) => position[edge] !== undefined)
      )
        throw new Error("Choose one vertical and one horizontal edge.");
      if (
        Object.values(position).some(
          (value) => !Number.isFinite(value) || value < 0,
        )
      )
        throw new Error("Position offsets must be non-negative numbers.");
    } else if (typeof position !== "string")
      throw new Error("Invalid widget position.");
    this.options.position = position;
    this.place();
  }

  place() {
    const fab = this.element("fab");
    const panel = this.element("panel");
    const position = this.options.position;
    const offset = Math.max(8, Number(this.options.offset) || 24);
    const edges =
      typeof position === "string"
        ? Object.fromEntries(position.split("-").map((edge) => [edge, offset]))
        : position;
    for (const edge of ["top", "right", "bottom", "left"])
      fab.style[edge] = edges[edge] === undefined ? "auto" : `${edges[edge]}px`;
    // Clamp custom coordinates so the trigger and panel remain reachable on small screens.
    const bounds = fab.getBoundingClientRect();
    if (bounds.left < 8 || bounds.right > innerWidth - 8) {
      fab.style.left = `${Math.max(8, Math.min(innerWidth - bounds.width - 8, bounds.left))}px`;
      fab.style.right = "auto";
    }
    if (bounds.top < 8 || bounds.bottom > innerHeight - 8) {
      fab.style.top = `${Math.max(8, Math.min(innerHeight - bounds.height - 8, bounds.top))}px`;
      fab.style.bottom = "auto";
    }
    if (panel.hidden) return;
    const trigger = fab.getBoundingClientRect();
    const margin = innerWidth <= 600 ? 12 : 16;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const left =
      this.panelPosition?.x ??
      (edges.left !== undefined ? trigger.left : trigger.right - width);
    const top =
      this.panelPosition?.y ??
      (edges.top !== undefined
        ? trigger.bottom + 12
        : trigger.top - height - 12);
    panel.style.left = `${Math.max(margin, Math.min(innerWidth - width - margin, left))}px`;
    panel.style.top = `${Math.max(margin, Math.min(innerHeight - height - margin, top))}px`;
  }

  updateSend() {
    const busy = !!(this.sending || this.capturing || this.switchingThread);
    this.element("record-button").disabled = busy || !!this.recording;
    this.element("area").disabled = busy;
    for (const button of this.root.querySelectorAll(
      "[data-thread], [data-github-thread], #thread-nav button, #github-all",
    ))
      button.disabled = !!(
        this.sending ||
        this.switchingThread ||
        this.convertingGitHub
      );
    this.element("github-all").disabled ||= !this.records.length;
    this.element("send").disabled =
      this.switchingThread ||
      this.sending ||
      this.capturing ||
      (!this.element("message").value.trim() &&
        !this.draftCapture &&
        !this.draftVideo);
  }

  updateAttachment() {
    this.element("attachment").hidden = !this.draftCapture;
    if (this.draftCapture) {
      this.element("attachment-image").src = this.draftCapture.annotated;
      this.element("attachment-detail").textContent =
        `${this.draftCapture.annotations.length} marks · Click to edit`;
    } else this.element("attachment-image").removeAttribute("src");
    this.element("video-attachment").hidden = !this.draftVideo;
    if (this.draftVideo)
      this.element("video-detail").textContent =
        `${Math.ceil(this.draftVideo.durationMs / 1000)} sec · ${(this.draftVideo.size / 1048576).toFixed(1)} MB`;
    this.updateSend();
  }

  draftRecord() {
    return {
      id: this.activeThreadId ? `draft:${this.activeThreadId}` : "draft",
      threadId: this.activeThreadId || null,
      area: this.element("area").value.trim(),
      video: this.draftVideo || null,
      schemaVersion: 1,
      author: this.options.author,
      text: this.element("message").value,
      capture: this.draftCapture,
      context: this.draftContext || this.context(),
      updatedAt: new Date().toISOString(),
    };
  }

  queueDraft() {
    this.draftContext = this.context();
    const draft = structuredClone(this.draftRecord());
    this.saveQueue = this.saveQueue
      .catch(() => {})
      .then(() => this.store.put(draft));
    this.saveQueue
      .then(() => {
        if (!this.destroyed && !this.sending) this.localStatus();
      })
      .catch((error) => {
        if (!this.destroyed) {
          this.status("Could not save draft", true);
          this.notice(`${error.message} Download a ZIP to keep your work.`);
        }
      });
    return this.saveQueue;
  }

  async send() {
    if (
      this.sending ||
      this.capturing ||
      (!this.element("message").value.trim() &&
        !this.draftCapture &&
        !this.draftVideo)
    )
      return;
    this.sending = true;
    this.element("message").disabled = true;
    this.element("capture-button").disabled = true;
    this.element("draw-button").disabled = true;
    this.updateSend();
    try {
      let repoReady = false;
      let repoError = "";
      try {
        repoReady = await this.repository.prepare();
      } catch (error) {
        repoError = error.message;
      }
      await this.ready;
      await this.saveQueue.catch(() => {});
      const record = {
        schemaVersion: 1,
        id: makeId(),
        projectId: this.options.projectId,
        projectName: this.projectName,
        threadId: this.activeThreadId || null,
        area: this.activeThreadId
          ? this.records.find((item) => item.id === this.activeThreadId)
              ?.area || ""
          : this.element("area").value.trim(),
        video: this.draftVideo || null,
        createdAt: new Date().toISOString(),
        author: this.options.author,
        text: this.element("message").value.trim(),
        capture: this.draftCapture,
        context: this.context(),
        status: "open",
      };
      record.threadId ||= record.id;
      if (repoReady) {
        try {
          await this.repository.save(record);
          record.repoSaved = true;
        } catch (error) {
          repoError = error.message;
        }
      }
      try {
        await this.store.commitFeedback(record, this.draftRecord().id);
      } catch (error) {
        if (!record.repoSaved) throw error;
        repoError = `Saved in repo. Browser copy failed: ${error.message}`;
        await this.store.remove(this.draftRecord().id).catch(() => {});
      }
      this.records.push(record);
      this.element("message").value = "";
      this.draftCapture = null;
      this.draftVideo = null;
      this.element("area").value = "";
      this.updateAttachment();
      this.renderMessages();
      this.notice(
        repoError
          ? `Repo or browser save needs attention: ${repoError}`
          : this.repository.supported && !repoReady
            ? "Saved in this browser. Choose a repo folder in Settings to write files for your agent."
            : "",
      );
      this.localStatus();
      this.emit("feedback", record);
    } finally {
      this.sending = false;
      this.element("message").disabled = false;
      this.element("capture-button").disabled = this.capturing;
      this.element("draw-button").disabled = this.capturing;
      this.updateSend();
      this.element("message").focus();
    }
  }

  async switchThread(threadId) {
    if (
      this.sending ||
      this.capturing ||
      this.recording ||
      this.convertingGitHub ||
      this.switchingThread
    )
      return;
    this.switchingThread = true;
    this.element("message").disabled = true;
    this.element("area").disabled = true;
    this.updateSend();
    try {
      await this.queueDraft();
      const draft = await this.store.draft(threadId);
      this.activeThreadId = threadId;
      this.element("message").value = draft?.text || "";
      this.element("area").value = draft?.area || "";
      this.draftCapture = draft?.capture || null;
      this.draftVideo = draft?.video || null;
      this.draftContext = draft?.context;
      this.renderMessages();
      this.updateAttachment();
      this.showConversation();
    } finally {
      this.switchingThread = false;
      this.element("message").disabled = false;
      this.element("area").disabled = false;
      this.updateSend();
      this.element("message").focus();
    }
  }

  showConfigTab(tab) {
    this.element("general-config").hidden = tab !== "general";
    this.element("github-config").hidden = tab !== "github";
    this.element("general-actions").hidden = tab !== "general";
    this.element("general-tab").setAttribute(
      "aria-selected",
      String(tab === "general"),
    );
    this.element("github-tab").setAttribute(
      "aria-selected",
      String(tab === "github"),
    );
    if (tab === "github") this.refreshGitHub();
    this.place();
  }

  refreshGitHub() {
    const configuration = this.preferences.github || {};
    const account = this.githubAccount;
    const rememberedLogin =
      this.preferences.githubAccount?.login || configuration.login;
    this.element("github-account").textContent = account?.login
      ? `Connected as @${account.login}`
      : rememberedLogin
        ? `Connection for @${rememberedLogin} needs a refresh.`
        : "GitHub is not connected.";
    this.element("github-disconnect").hidden = !account && !rememberedLogin;
    this.element("github-connect").textContent =
      account || rememberedLogin ? "Refresh connection" : "Sign in with GitHub";
    const repositories =
      account?.repositories ||
      (configuration.repository
        ? [{ full_name: configuration.repository }]
        : []);
    this.repositoryPicker.setRepositories(
      repositories,
      configuration.repository || "",
    );
    this.element("github-project").value = configuration.projectUrl || "";
    this.element("github-labels").value =
      configuration.labels?.join(", ") || "";
    this.element("github-attachments").checked =
      !!configuration.includeAttachments;
  }

  async connectGitHub() {
    const button = this.element("github-connect");
    button.disabled = true;
    try {
      const login =
        this.githubAccount?.login ||
        this.preferences.githubAccount?.login ||
        this.preferences.github?.login;
      this.githubAccount = accountDetails(await this.github.connect(login));
      if (!this.githubAccount)
        throw new Error("GitHub did not return an account. Try again.");
      await this.savePreferences({ githubAccount: this.githubAccount });
      this.refreshGitHub();
      this.element("github-error").hidden = true;
    } catch (error) {
      this.element("github-error").textContent = error.message;
      this.element("github-error").hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  async saveGitHub() {
    try {
      const repository = repositoryName(this.repositoryPicker.value);
      const projectUrl = this.element("github-project").value.trim();
      projectReference(projectUrl);
      const labels = [
        ...new Set(
          this.element("github-labels")
            .value.split(",")
            .map((label) => label.trim())
            .filter(Boolean),
        ),
      ];
      if (labels.length > 20 || labels.some((label) => label.length > 50))
        throw new Error("Use up to 20 labels of 50 characters each.");
      await this.savePreferences({
        github: {
          repository,
          projectUrl,
          labels,
          includeAttachments: this.element("github-attachments").checked,
          login:
            this.githubAccount?.login || this.preferences.github?.login || null,
        },
      });
      this.showConversation();
      this.notice(`GitHub destination saved: ${repository}.`);
    } catch (error) {
      this.element("github-error").textContent = error.message;
      this.element("github-error").hidden = false;
    }
  }

  async createGitHubIssue(threadId = this.activeThreadId) {
    const root = this.records.find((record) => record.id === threadId);
    if (!root || this.convertingGitHub) return;
    if (root.github?.url) {
      window.open(root.github.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!this.preferences.github?.repository) {
      this.showAppearance();
      this.showConfigTab("github");
      return;
    }
    return this.publishGitHubThreads([root], false);
  }

  async createAllGitHubIssues() {
    const roots = this.records.filter(
      (record) => !record.threadId || record.threadId === record.id,
    );
    if (!roots.length || this.convertingGitHub) return;
    if (!this.preferences.github?.repository) {
      this.showAppearance();
      this.showConfigTab("github");
      return;
    }
    return this.publishGitHubThreads(roots, true);
  }

  async saveGitHubIssue(root, result, configuration) {
    const url = new URL(result.url);
    if (
      url.origin !== "https://github.com" ||
      url.pathname.toLowerCase() !==
        `/${configuration.repository.toLowerCase()}/issues/${result.number}` ||
      !Number.isSafeInteger(result.number) ||
      result.number < 1 ||
      result.repository?.toLowerCase() !==
        configuration.repository.toLowerCase()
    )
      throw new Error("GitHub returned an invalid issue URL.");
    const updated = { ...root, github: result };
    await this.store.put(updated);
    Object.assign(root, updated);
    this.renderMessages();
  }

  async publishGitHubThreads(roots, batch) {
    const configuration = structuredClone(this.preferences.github);
    // Open the connection window before loading attachments so popup activation is retained.
    this.convertingGitHub = true;
    this.updateSend();
    try {
      const threads = Promise.all(
        roots.map((root) =>
          Promise.all(
            this.records
              .filter((record) => (record.threadId || record.id) === root.id)
              .map((record) => this.resolveRecordVideo(record)),
          ),
        ),
      );
      const payload = threads.then((threads) => ({
        configuration,
        projectName: this.projectName,
        ...(batch
          ? { threads: structuredClone(threads) }
          : { records: structuredClone(threads[0]) }),
      }));
      if (batch) {
        const result = await this.github.createIssues(
          payload,
          async ({ threadId, result }) => {
            const root = roots.find((root) => root.id === threadId);
            if (!root) throw new Error("GitHub returned an unknown thread.");
            await this.saveGitHubIssue(root, result, configuration);
          },
        );
        const errors = result.issues
          .map(({ result }) => result.projectError)
          .filter(Boolean);
        this.notice(
          `${result.issues.length} threads linked to GitHub.${errors.length ? ` ${[...new Set(errors)].join(" ")}` : ""}`,
        );
      } else {
        const result = await this.github.createIssue(payload);
        await this.saveGitHubIssue(roots[0], result, configuration);
        this.notice(
          result.projectError ||
            `${result.reused ? "Linked existing" : "Created"} GitHub issue #${result.number}.`,
        );
      }
    } finally {
      this.convertingGitHub = false;
      if (!this.destroyed) this.updateSend();
    }
  }

  async resolveThread() {
    const record = this.records.find((item) => item.id === this.activeThreadId);
    if (!record) return;
    const status = record.status === "resolved" ? "open" : "resolved";
    if (record.repoSaved) {
      if (this.options.openLibrary)
        throw new Error(
          "Open Pagepaint library to update this issue's repo status.",
        );
      if (!(await this.repository.prepare()))
        throw new Error(
          "Folder permission is needed to update this issue's repo status.",
        );
      await this.repository.setStatus(record, status);
    }
    await this.store.put({ ...record, status });
    record.status = status;
    this.renderMessages();
  }

  async recordVideo() {
    if (this.recording || this.sending || this.capturing) return;
    const context = this.context();
    this.recordingTick(0);
    if (this.options.startRecording) {
      await this.queueDraft();
      await this.options.startRecording({
        context,
        threadId: this.activeThreadId,
        projectName: this.projectName,
      });
      this.recording = true;
      this.updateSend();
      this.close();
      this.element("recording-bar").hidden = false;
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia || !globalThis.MediaRecorder)
      throw new Error(
        "Recording needs HTTPS and a browser with screen sharing support.",
      );
    // Screen selection must be requested in the button's user gesture.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    this.recording = true;
    this.updateSend();
    this.close();
    this.element("recording-bar").hidden = false;
    this.recorder = new VideoRecorder({
      onTick: (seconds) => this.recordingTick(seconds),
    });
    try {
      const video = await this.recorder.start(stream);
      if (!this.destroyed) await this.acceptVideo({ ...video, context });
    } finally {
      this.recording = false;
      if (!this.destroyed) {
        this.element("recording-bar").hidden = true;
        this.updateSend();
        this.showConversation();
      }
    }
  }

  recordingTick(seconds) {
    this.element("recording-time").textContent =
      `Recording ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} / 1:00`;
  }

  async stopVideo() {
    if (this.options.stopRecording) return this.options.stopRecording();
    return this.recorder?.stop();
  }

  async acceptVideo(video) {
    this.draftVideo = video;
    this.updateAttachment();
    await this.queueDraft();
  }

  async receivePendingVideo() {
    const pending = await this.store.pendingVideos();
    const item = pending.find(
      (entry) => (entry.threadId || null) === (this.activeThreadId || null),
    );
    if (item && !this.draftVideo) {
      await this.acceptVideo(item.video);
      await this.store.remove(item.id);
    }
  }

  async previewVideo(video) {
    if (video && this.options.resolveVideo)
      video = await this.options.resolveVideo(video);
    if (!video?.blob) return;
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.mediaUrls.delete(this.previewUrl);
    }
    this.previewUrl = URL.createObjectURL(video.blob);
    this.mediaUrls.add(this.previewUrl);
    this.element("video-player").src = this.previewUrl;
    this.element("video-dialog").showModal();
  }

  renderMessages() {
    const messages = this.element("messages");
    this.element("github-all").disabled =
      !!this.convertingGitHub || !this.records.length;
    messages.replaceChildren();
    const visible = this.activeThreadId
      ? this.records.filter(
          (item) => (item.threadId || item.id) === this.activeThreadId,
        )
      : this.records.filter(
          (item) => !item.threadId || item.threadId === item.id,
        );
    const root = this.records.find((item) => item.id === this.activeThreadId);
    this.element("thread-label").textContent = this.activeThreadId
      ? "Issue thread"
      : "Issues";
    this.element("all-threads").hidden = !this.activeThreadId;
    this.element("resolve-thread").hidden = !root;
    this.element("resolve-thread").textContent =
      root?.status === "resolved" ? "Reopen issue" : "Resolve issue";
    this.element("github-issue").hidden = !root;
    this.element("github-issue").textContent = root?.github?.url
      ? `GitHub #${root.github.number}`
      : "Send to GitHub";
    this.element("github-issue").disabled = !!this.convertingGitHub;
    this.element("area-label").hidden = !!this.activeThreadId;
    this.element("message").placeholder = this.activeThreadId
      ? "Add a reply…"
      : "What should we change?";
    if (!visible.length) {
      messages.innerHTML = `<div class="empty"><div class="empty-illustration">${icon("pen")}</div><h3>Good feedback starts here.</h3><p>Tell us what’s on your mind, or capture the page and mark it up.</p></div>`;
      return;
    }
    for (const record of visible) {
      const article = document.createElement("article");
      article.className = "message";
      const meta = document.createElement("div");
      meta.className = "message-meta";
      const avatar = document.createElement("span");
      avatar.className = "avatar";
      avatar.textContent = (record.author || "You").slice(0, 1).toUpperCase();
      const author = document.createElement("span");
      author.textContent = record.author || "You";
      const time = document.createElement("time");
      time.dateTime = record.createdAt;
      time.textContent = new Date(record.createdAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const state = document.createElement("span");
      state.className = "record-status";
      state.textContent = record.status === "resolved" ? "Resolved" : "Open";
      meta.append(avatar, author, document.createTextNode("·"), time, state);
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      if (record.text) {
        const text = document.createElement("p");
        text.className = "message-text";
        text.textContent = record.text;
        bubble.append(text);
      }
      if (record.capture) {
        const button = document.createElement("button");
        button.className = "message-capture";
        button.dataset.record = record.id;
        button.setAttribute("aria-label", "View annotated screenshot");
        const image = document.createElement("img");
        image.src = record.capture.annotated;
        image.alt = "Annotated page capture";
        image.loading = "lazy";
        button.append(image);
        bubble.append(button);
      }
      const path = document.createElement("p");
      path.className = "message-path";
      path.textContent = `${record.context.pathname}${record.context.search}${record.context.hash}`;
      path.title = record.context.url;
      article.append(meta, bubble, path);
      if (record.video) {
        const preview = document.createElement("button");
        preview.className = "storage-button";
        preview.dataset.video = record.id;
        preview.textContent = `Play recording · ${Math.ceil(record.video.durationMs / 1000)} sec`;
        bubble.append(preview);
      }
      if (!this.activeThreadId) {
        const thread = document.createElement("button");
        thread.className = "storage-button";
        thread.dataset.thread = record.id;
        thread.disabled = !!this.convertingGitHub;
        const count = this.records.filter(
          (item) => item.id !== record.id && item.threadId === record.id,
        ).length;
        thread.textContent = `${record.area ? record.area + " · " : ""}Open thread${count ? ` · ${count} replies` : ""}`;
        const github = document.createElement("button");
        github.className = "primary github-button";
        github.dataset.githubThread = record.id;
        github.textContent = record.github?.url
          ? `GitHub #${record.github.number} ↗`
          : "Send to GitHub";
        github.disabled = !!this.convertingGitHub;
        const actions = document.createElement("div");
        actions.className = "thread-actions";
        actions.append(thread, github);
        article.append(actions);
      }
      messages.append(article);
    }
    messages.scrollTop = messages.scrollHeight;
  }

  async renderViewport() {
    const context = this.context();
    if (this.options.captureViewport) {
      const visibility = this.host.style.visibility;
      this.host.style.setProperty("visibility", "hidden", "important");
      const dialogs = Array.from(this.root.querySelectorAll("dialog[open]"));
      for (const dialog of dialogs) dialog.close();
      try {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        const image = await this.options.captureViewport();
        return {
          ...image,
          annotated: image.original,
          annotations: [],
          libraryVersion,
          renderer: "browser-tab",
          context,
          capturedAt: context.capturedAt,
        };
      } finally {
        this.host.style.visibility = visibility;
        for (const dialog of dialogs) if (!this.destroyed) dialog.showModal();
      }
    }
    const canvas = await html2canvas(document.documentElement, {
      x: context.scroll.x,
      y: context.scroll.y,
      width: context.viewport.width,
      height: context.viewport.height,
      windowWidth: context.viewport.width,
      windowHeight: context.viewport.height,
      scrollX: context.scroll.x,
      scrollY: context.scroll.y,
      scale: Math.min(
        context.viewport.devicePixelRatio || 1,
        2,
        Math.sqrt(6000000 / (context.viewport.width * context.viewport.height)),
      ),
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 8000,
      onclone: waitForCaptureStyles,
      ignoreElements: (element) =>
        element.hasAttribute("data-review-tool-root") ||
        element.hasAttribute("data-review-tool-ignore"),
    });
    const original = canvas.toDataURL("image/png");
    return {
      original,
      annotated: original,
      annotations: [],
      libraryVersion,
      renderer: "html2canvas-pro",
      width: canvas.width,
      height: canvas.height,
      context,
      capturedAt: context.capturedAt,
    };
  }

  async drawOnPage() {
    if (this.capturing || this.sending || this.element("page-dialog").open)
      return;
    this.previousCapture = this.draftCapture;
    return this.capture({ mode: "page" });
  }

  async capture({ mode = "editor" } = {}) {
    await this.ready;
    if (
      this.capturing ||
      this.sending ||
      this.destroyed ||
      this.element("page-dialog").open
    )
      return;
    this.capturing = true;
    this.updateSend();
    const wasEditing = this.element("editor-dialog").open;
    if (wasEditing) this.finishEditor();
    const button = this.element("capture-button");
    button.disabled = true;
    this.element("draw-button").disabled = true;
    this.element("draw-button").querySelector("span").textContent =
      "Capturing…";
    this.status("Capturing current view…");
    try {
      const capture = await this.renderViewport();
      if (this.destroyed) return;
      this.draftCapture = capture;
      this.updateAttachment();
      await this.queueDraft();
      await this.editCapture(mode);
      this.notice("");
    } catch (error) {
      this.notice(
        "Could not capture this view. Check whether the page contains blocked images or unsupported content, then try again.",
      );
      this.emit("error", { action: "capture", message: error.message });
      if (wasEditing && this.draftCapture) await this.editCapture();
    } finally {
      this.capturing = false;
      if (!this.destroyed) {
        button.disabled = false;
        this.element("draw-button").disabled = false;
        this.element("draw-button").querySelector("span").textContent =
          "Draw & capture";
        this.localStatus();
        this.updateSend();
      }
    }
  }

  async editCapture(mode = "editor") {
    if (!this.draftCapture || this.destroyed) return;
    const image = new Image();
    image.src = this.draftCapture.original;
    await image.decode();
    if (this.destroyed) return;
    this.annotation?.destroy();
    this.annotation = new AnnotationCanvas(
      this.element(mode === "page" ? "page-canvas" : "canvas"),
      image,
      this.draftCapture.annotations,
      () => this.saveAnnotations(),
      {
        showBackground: mode !== "page",
        getTarget: mode === "page" ? (x, y) => selectorAt(x, y) : () => null,
      },
    );
    this.annotation.tool = this.root.querySelector(
      "[data-tool][aria-pressed=true]",
    ).dataset.tool;
    this.annotation.color = this.root.querySelector(
      "[data-color][aria-pressed=true]",
    ).dataset.color;
    this.element("capture-path").textContent =
      `${this.draftCapture.context.pathname}${this.draftCapture.context.search}${this.draftCapture.context.hash} · ${this.draftCapture.context.viewport.width} × ${this.draftCapture.context.viewport.height}`;
    this.updateHistory();
    if (mode === "page") {
      this.element("page-tools-slot").append(this.element("editor-tools"));
      this.element("panel").hidden = true;
      this.element("fab").hidden = true;
      this.element("page-drawing-status").textContent = "Draw, then capture.";
      this.element("page-dialog").showModal();
      this.element("page-canvas").focus();
    } else if (!this.element("editor-dialog").open)
      this.element("editor-dialog").showModal();
  }

  saveAnnotations() {
    this.draftCapture.annotations = structuredClone(
      this.annotation.annotations,
    );
    this.draftCapture.annotated = this.annotation.toDataURL();
    this.updateHistory();
    this.updateAttachment();
    this.queueDraft();
  }

  updateHistory() {
    this.element("undo").disabled = !this.annotation?.annotations.length;
    this.element("redo").disabled = !this.annotation?.redoStack.length;
    this.element("clear").disabled = !this.annotation?.annotations.length;
  }

  finishEditor() {
    this.element("editor-dialog").close();
    this.annotation?.destroy();
    this.annotation = null;
    this.open();
  }

  async finishPage() {
    if (this.capturing || !this.element("page-dialog").open) return;
    this.capturing = true;
    this.updateSend();
    this.element("finish-page").disabled = true;
    this.element("page-canvas").inert = true;
    this.element("page-drawing-status").textContent =
      "Capturing the page and your marks…";
    try {
      const capture = await this.renderViewport();
      if (this.destroyed) return;
      const oldWidth = this.annotation.canvas.width;
      const oldHeight = this.annotation.canvas.height;
      capture.annotations = structuredClone(this.annotation.annotations).map(
        (stroke) => ({
          ...stroke,
          width: (stroke.width * capture.width) / oldWidth,
          points: stroke.points.map((point) => ({
            x: (point.x * capture.width) / oldWidth,
            y: (point.y * capture.height) / oldHeight,
          })),
        }),
      );
      const image = new Image();
      image.src = capture.original;
      await image.decode();
      this.annotation.image = image;
      this.annotation.annotations = capture.annotations;
      this.annotation.canvas.width = capture.width;
      this.annotation.canvas.height = capture.height;
      this.annotation.render();
      capture.annotated = this.annotation.toDataURL();
      this.draftCapture = capture;
      this.updateAttachment();
      await this.queueDraft();
      this.closePage();
      this.notice("");
    } catch (error) {
      this.element("page-drawing-status").textContent =
        "Capture failed. Your marks are saved; try again.";
      this.emit("error", { action: "capture", message: error.message });
    } finally {
      this.capturing = false;
      if (!this.destroyed) {
        this.element("finish-page").disabled = false;
        this.element("page-canvas").inert = false;
        this.localStatus();
        this.updateSend();
      }
    }
  }

  closePage() {
    this.element("page-dialog").close();
    this.element("editor-tools-slot").append(this.element("editor-tools"));
    this.annotation?.destroy();
    this.annotation = null;
    this.previousCapture = null;
    this.element("fab").hidden = false;
    this.open();
  }

  cancelPage() {
    if (this.capturing) return;
    this.draftCapture = this.previousCapture || null;
    this.updateAttachment();
    this.queueDraft();
    this.closePage();
  }

  async chooseRepo() {
    const previous = this.repository.handle;
    if (!(await this.repository.choose())) return;
    if (!previous || !(await previous.isSameEntry(this.repository.handle))) {
      for (const record of this.records) {
        record.repoSaved = false;
        await this.store.put(record);
      }
    }
    this.refreshRepo();
    this.localStatus();
  }

  refreshRepo() {
    const repo = this.repository;
    this.element("repo-status").textContent = !repo.supported
      ? this.options.openLibrary
        ? "Connect your repo in the Pagepaint library. ZIP export is also available here."
        : "Folder access is unavailable here. Use ZIP export, or Chrome / Edge over HTTPS."
      : repo.handle
        ? `Selected: ${repo.handle.name}/.annotations/`
        : "Choose your app’s folder on first save, or connect it here.";
    this.element("choose-repo").hidden = !repo.supported;
    this.element("choose-repo").textContent = repo.handle
      ? "Change repo folder"
      : "Choose repo folder";
    this.element("write-repo").hidden = !repo.supported || !this.records.length;
    this.element("agent-instructions").hidden = !repo.supported || !repo.handle;
    this.place();
  }

  async writeRepo() {
    if (!(await this.repository.prepare()))
      return this.notice(
        "Folder permission was not granted. Your notes remain in this browser.",
      );
    for (const record of this.records) {
      await this.repository.save(record);
      record.repoSaved = true;
      await this.store.put(record);
    }
    await this.readRepoStatuses();
    this.element("repo-status").textContent =
      `Saved ${this.records.length} notes in ${this.repository.handle.name}/.annotations/.`;
    this.localStatus();
  }

  async readRepoStatuses() {
    const changes = await this.repository.readStatuses(this.records);
    for (const change of changes) {
      const record = this.records.find((item) => item.id === change.id);
      record.status = change.status;
      await this.store.put(record);
    }
    if (changes.length && !this.destroyed) this.renderMessages();
  }

  localStatus() {
    const savedToRepo =
      this.records.length && this.records.every((item) => item.repoSaved);
    this.status(
      savedToRepo
        ? "Saved in repo"
        : this.store.persistent
          ? "Saved in this browser"
          : "Stored in memory · Download to keep",
      !this.store.persistent && !savedToRepo,
    );
  }

  status(message, warning = false) {
    this.element("status-text").textContent = message;
    this.element("save-status").toggleAttribute("data-warning", warning);
  }

  notice(message) {
    this.element("notice").textContent = message;
    this.element("notice").hidden = !message;
  }

  async exportZip() {
    await this.ready;
    if (this.exporting) return;
    this.exporting = true;
    this.element("export").disabled = true;
    try {
      await this.saveQueue.catch(() => {});
      const records = await Promise.all(
        this.records.map((record) => this.resolveRecordVideo(record)),
      );
      const drafts = [
        ...(await this.store.drafts()).filter(
          (item) => item.id !== this.draftRecord().id,
        ),
        this.draftRecord(),
        ...(await this.store.pendingVideos()),
      ];
      const resolvedDrafts = await Promise.all(
        drafts.map((record) => this.resolveRecordVideo(record)),
      );
      const blob = await createArchive(
        records,
        this.options.projectId,
        "blob",
        resolvedDrafts,
        this.projectName,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${this.options.projectId}-feedback-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return blob;
    } finally {
      this.exporting = false;
      if (!this.destroyed) this.element("export").disabled = false;
    }
  }

  async resolveRecordVideo(record) {
    if (!record.video || !this.options.resolveVideo) return record;
    return { ...record, video: await this.options.resolveVideo(record.video) };
  }

  async getFeedback() {
    await this.ready;
    return structuredClone(this.records);
  }

  emit(type, detail) {
    this.host.dispatchEvent(
      new CustomEvent(`review-tool:${type}`, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.events.abort();
    this.recorder?.stop()?.catch(() => {});
    this.element("video-player").pause();
    for (const url of this.mediaUrls) URL.revokeObjectURL(url);
    this.annotation?.destroy();
    this.element("editor-dialog").close();
    this.element("page-dialog").close();
    this.element("viewer-dialog").close();
    this.element("video-dialog").close();
    this.host.remove();
    Promise.allSettled([this.ready, this.saveQueue, this.preferenceQueue]).then(
      () => this.store.close(),
    );
    this.github.destroy?.();
    this.options.onDestroy?.();
  }
}
