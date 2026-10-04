// ABOUTME: Embeds a feedback conversation with capture, annotation, and ZIP download.
// ABOUTME: Isolates the interface in Shadow DOM and syncs durable local feedback to a backend.
import html2canvas from "html2canvas-pro";
import { AnnotationCanvas } from "./annotations.js";
import { createArchive } from "./archive.js";
import { captureContext, makeId, validProjectId } from "./context.js";
import { FeedbackStore } from "./storage.js";
import { icon } from "./icons.js";
import { styles } from "./styles.js";

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

export class ReviewWidget {
  constructor(options = {}) {
    this.options = {
      projectId: "default",
      position: "bottom-right",
      offset: 24,
      label: "Feedback",
      author: "You",
      endpoint: null,
      ...options,
    };
    if (!validProjectId(this.options.projectId))
      throw new Error(
        "projectId must be 1–80 letters, numbers, underscores, or hyphens, starting with a letter or number.",
      );
    if (this.options.endpoint) {
      const endpoint = new URL(this.options.endpoint, location.href);
      if (!["http:", "https:"].includes(endpoint.protocol))
        throw new Error("endpoint must be an HTTP or HTTPS URL.");
      this.options.endpoint = endpoint.href.replace(/\/$/, "");
    }
    this.records = [];
    this.draftCapture = null;
    this.saveQueue = Promise.resolve();
    this.events = new AbortController();
    this.store = new FeedbackStore(this.options.projectId);
    this.host = document.createElement("div");
    this.host.dataset.reviewToolRoot = "";
    this.host.dataset.html2canvasIgnore = "";
    this.host.style.cssText =
      'all:initial!important;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;color:#20332d!important;color-scheme:light!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important;';
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = this.template();
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

  template() {
    return `<style>${styles}</style>
      <button id="fab" class="fab" aria-expanded="false" aria-controls="panel" data-action="toggle">${icon("chat")}<span>Feedback</span></button>
      <section id="panel" class="panel" role="dialog" aria-labelledby="panel-title" hidden>
        <header class="panel-header"><div class="brand"><span class="brand-mark">${icon("chat")}</span><div><h2 id="panel-title">Leave a little feedback</h2><p class="subtitle">A note. A screenshot. A clearer next step.</p></div></div><button class="icon-button" data-action="close" aria-label="Close feedback">${icon("close")}</button></header>
        <div class="context-bar">${icon("link")}<span id="page-path" class="page-path"></span></div>
        <p id="notice" class="notice" role="alert" hidden></p>
        <div id="messages" class="messages" role="log" aria-label="Feedback conversation" aria-live="polite"></div>
        <form id="composer" class="composer">
          <div id="attachment" class="attachment" hidden><button class="attachment-preview" data-action="edit" type="button" aria-label="Edit attached screenshot"><img id="attachment-image" alt="Attached screenshot"/></button><div class="attachment-copy"><strong>Screenshot attached</strong><p id="attachment-detail">Click to edit your marks</p></div><button class="icon-button" data-action="remove-capture" type="button" aria-label="Remove attached screenshot">${icon("close")}</button></div>
          <div class="input-box"><label class="input-label" for="message">YOUR FEEDBACK</label><textarea id="message" rows="3" maxlength="10000" placeholder="What should we change?" aria-describedby="composer-hint"></textarea><div class="composer-actions"><div class="capture-actions"><button id="draw-button" class="capture-button" data-action="draw-page" type="button">${icon("pen")}<span>Draw & capture</span></button><button id="capture-button" class="icon-button" data-action="capture" type="button" aria-label="Capture screen" title="Capture screen without drawing on the page">${icon("camera")}</button></div><button id="send" class="primary" type="submit" disabled>Send ${icon("send")}</button></div></div>
          <span id="composer-hint" class="sr-only">Attach a screenshot or send a message. Press Control or Command and Enter to send.</span>
        </form>
        <footer class="panel-footer"><span id="save-status" class="save-status" role="status"><span class="status-dot"></span><span id="status-text">Loading feedback…</span></span><button id="export" class="export-button" data-action="export">${icon("download")}Download ZIP</button></footer>
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
      <dialog id="viewer-dialog" aria-labelledby="viewer-title"><div class="viewer"><div class="viewer-header"><h2 id="viewer-title">Annotated screenshot</h2><button class="icon-button" data-action="close-viewer" aria-label="Close screenshot">${icon("close")}</button></div><img id="viewer-image" alt="Full annotated screenshot"/></div></dialog>`;
  }

  bind() {
    const settings = { signal: this.events.signal };
    this.root.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest("button");
        if (!button || button.disabled) return;
        if (button.dataset.tool && this.annotation) {
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
    this.element("message").addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          this.send().catch((error) => this.notice(error.message));
        }
      },
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
    this.root.addEventListener(
      "keydown",
      (event) => {
        if (
          (this.element("editor-dialog").open ||
            this.element("page-dialog").open) &&
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "z"
        ) {
          event.preventDefault();
          event.shiftKey ? this.annotation?.redo() : this.annotation?.undo();
        } else if (
          event.key === "Escape" &&
          !this.element("editor-dialog").open &&
          !this.element("viewer-dialog").open &&
          !this.element("page-dialog").open
        )
          this.close();
      },
      settings,
    );
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
    window.addEventListener("online", () => this.sync(), settings);
    document.addEventListener(
      "visibilitychange",
      () => {
        if (!document.hidden) this.sync();
      },
      settings,
    );
    this.poll = setInterval(() => {
      if (!this.element("panel").hidden && !document.hidden) this.sync();
    }, 15000);
  }

  async act(action) {
    switch (action) {
      case "toggle":
        return this.element("panel").hidden ? this.open() : this.close();
      case "close":
        return this.close();
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

  async load() {
    try {
      await this.store.ready;
      const [records, draft] = await Promise.all([
        this.store.list(),
        this.store.draft(),
      ]);
      if (this.destroyed) return this;
      this.records = records;
      if (draft) {
        this.element("message").value = draft.text || "";
        this.draftCapture = draft.capture || null;
        this.draftContext = draft.context;
      }
      this.renderMessages();
      this.updateAttachment();
      this.localStatus();
      if (!this.store.persistent)
        this.notice(
          "Browser storage is unavailable. Download a ZIP before leaving this page.",
        );
      this.sync();
    } catch (error) {
      this.notice(error.message);
    }
    return this;
  }

  async open() {
    await this.ready;
    if (this.destroyed) return;
    this.element("panel").hidden = false;
    this.element("fab").setAttribute("aria-expanded", "true");
    const context = captureContext();
    this.element("page-path").textContent =
      `${context.pathname}${context.search}${context.hash}`;
    this.element("page-path").title = context.url;
    this.place();
    this.element("message").focus();
    this.sync();
  }

  close() {
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
      edges.left !== undefined ? trigger.left : trigger.right - width;
    const top =
      edges.top !== undefined ? trigger.bottom + 12 : trigger.top - height - 12;
    panel.style.left = `${Math.max(margin, Math.min(innerWidth - width - margin, left))}px`;
    panel.style.top = `${Math.max(margin, Math.min(innerHeight - height - margin, top))}px`;
  }

  updateSend() {
    this.element("send").disabled =
      this.sending ||
      this.capturing ||
      (!this.element("message").value.trim() && !this.draftCapture);
  }

  updateAttachment() {
    this.element("attachment").hidden = !this.draftCapture;
    if (this.draftCapture) {
      this.element("attachment-image").src = this.draftCapture.annotated;
      this.element("attachment-detail").textContent =
        `${this.draftCapture.annotations.length} marks · Click to edit`;
    } else this.element("attachment-image").removeAttribute("src");
    this.updateSend();
  }

  draftRecord() {
    return {
      id: "draft",
      schemaVersion: 1,
      author: this.options.author,
      text: this.element("message").value,
      capture: this.draftCapture,
      context: this.draftContext || captureContext(),
      updatedAt: new Date().toISOString(),
    };
  }

  queueDraft() {
    this.draftContext = captureContext();
    const draft = structuredClone(this.draftRecord());
    this.saveQueue = this.saveQueue
      .catch(() => {})
      .then(() => this.store.put(draft));
    this.saveQueue
      .then(() => {
        if (!this.destroyed && !this.sending && !this.syncing)
          this.localStatus();
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
    await this.ready;
    if (
      this.sending ||
      this.capturing ||
      (!this.element("message").value.trim() && !this.draftCapture)
    )
      return;
    this.sending = true;
    this.element("message").disabled = true;
    this.element("capture-button").disabled = true;
    this.element("draw-button").disabled = true;
    this.updateSend();
    try {
      await this.saveQueue;
      const record = {
        schemaVersion: 1,
        id: makeId(),
        projectId: this.options.projectId,
        createdAt: new Date().toISOString(),
        author: this.options.author,
        text: this.element("message").value.trim(),
        capture: this.draftCapture,
        context: captureContext(),
        synced: false,
      };
      await this.store.commitFeedback(record);
      this.records.push(record);
      this.element("message").value = "";
      this.draftCapture = null;
      this.updateAttachment();
      this.renderMessages();
      this.notice("");
      this.localStatus();
      this.emit("feedback", record);
      this.sync();
    } finally {
      this.sending = false;
      this.element("message").disabled = false;
      this.element("capture-button").disabled = this.capturing;
      this.element("draw-button").disabled = this.capturing;
      this.updateSend();
      this.element("message").focus();
    }
  }

  renderMessages() {
    const messages = this.element("messages");
    messages.replaceChildren();
    if (!this.records.length) {
      messages.innerHTML = `<div class="empty"><div class="empty-illustration">${icon("pen")}</div><h3>Good feedback starts here.</h3><p>Tell us what’s on your mind, or capture the page and mark it up.</p></div>`;
      return;
    }
    for (const record of this.records) {
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
      meta.append(avatar, author, document.createTextNode("·"), time);
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
      messages.append(article);
    }
    messages.scrollTop = messages.scrollHeight;
  }

  async renderViewport() {
    const context = captureContext();
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
      ignoreElements: (element) =>
        element.hasAttribute("data-review-tool-root") ||
        element.hasAttribute("data-review-tool-ignore"),
    });
    const original = canvas.toDataURL("image/png");
    return {
      original,
      annotated: original,
      annotations: [],
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
      { showBackground: mode !== "page" },
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

  async request(path, options = {}) {
    const headers = { ...options.headers };
    if (this.options.token)
      headers.Authorization = `Bearer ${this.options.token}`;
    const response = await fetch(`${this.options.endpoint}${path}`, {
      ...options,
      headers,
      credentials: "omit",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Backend returned ${response.status}`);
    }
    return response.json();
  }

  sync() {
    if (!this.options.endpoint || this.destroyed) return Promise.resolve();
    if (this.syncPromise) return this.syncPromise;
    this.syncing = true;
    this.syncPromise = (async () => {
      try {
        await this.store.ready;
        this.status("Syncing to backend…");
        // Recheck the queue so messages submitted during a sync are included.
        let pending;
        while ((pending = this.records.find((record) => !record.synced))) {
          const { synced, key, ...record } = pending;
          await this.request("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record),
          });
          pending.synced = true;
          await this.store.put(pending);
          if (this.destroyed) return;
        }
        const remote = await this.request(
          `/api/feedback?projectId=${encodeURIComponent(this.options.projectId)}`,
        );
        let changed = false;
        for (const record of remote.feedback) {
          if (!this.records.some((local) => local.id === record.id)) {
            const value = { ...record, synced: true };
            await this.store.put(value);
            this.records.push(value);
            changed = true;
          }
        }
        this.records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (changed && !this.destroyed) this.renderMessages();
        this.backendError = null;
        if (!this.destroyed) this.localStatus();
      } catch (error) {
        this.backendError = error.message;
        if (!this.destroyed)
          this.status("Saved locally · Backend unavailable", true);
        this.emit("error", { action: "sync", message: error.message });
      } finally {
        this.syncing = false;
        this.syncPromise = null;
      }
    })();
    return this.syncPromise;
  }

  localStatus() {
    if (!this.store.persistent)
      return this.status("Stored in memory · Download to keep", true);
    if (!this.options.endpoint) return this.status("Saved in this browser");
    const pending = this.records.some((record) => !record.synced);
    this.status(
      this.backendError
        ? "Saved locally · Backend unavailable"
        : pending
          ? "Saved locally · Sync pending"
          : "Saved locally · Backend connected",
      Boolean(this.backendError),
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
      await this.sync();
      const blob = await createArchive(
        this.records,
        this.options.projectId,
        "blob",
        this.draftRecord(),
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
    clearInterval(this.poll);
    this.events.abort();
    this.annotation?.destroy();
    this.element("editor-dialog").close();
    this.element("page-dialog").close();
    this.element("viewer-dialog").close();
    this.host.remove();
    Promise.allSettled([this.ready, this.saveQueue, this.syncPromise]).then(
      () => this.store.close(),
    );
    this.options.onDestroy?.();
  }
}
