// ABOUTME: Connects the landing pages to copyable installation, the demo film, and Pagepaint.
// ABOUTME: Keeps video controls accessible and loads the actual widget when requested.
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const video = document.querySelector("[data-demo-video]");
const toggle = document.querySelector("[data-video-toggle]");
const sound = document.querySelector("[data-video-sound]");

function updateVideoControls() {
  if (toggle) {
    toggle.textContent = video.paused ? "Play demo" : "Pause demo";
    toggle.setAttribute(
      "aria-label",
      video.paused ? "Play demo" : "Pause demo",
    );
  }
  if (sound) {
    sound.textContent = video.muted ? "Sound off" : "Sound on";
    sound.setAttribute("aria-pressed", String(!video.muted));
    sound.setAttribute(
      "aria-label",
      video.muted ? "Turn demo sound on" : "Turn demo sound off",
    );
  }
}

function applyMotionPreference() {
  if (!video) return;
  if (motionPreference.matches) {
    video.removeAttribute("autoplay");
    video.pause();
    video.controls = true;
    if (sound) sound.hidden = true;
  } else {
    video.controls = false;
    video.autoplay = true;
    if (sound) sound.hidden = false;
    video.play().catch(updateVideoControls);
  }
  updateVideoControls();
}

if (video) {
  const captions = document.createElement("track");
  captions.kind = "captions";
  captions.label = "English";
  captions.srclang = "en";
  captions.src = "/video/pagepaint-demo.vtt";
  video.append(captions);
  ["play", "pause", "volumechange", "loadeddata"].forEach((event) =>
    video.addEventListener(event, updateVideoControls),
  );
  applyMotionPreference();
  motionPreference.addEventListener("change", applyMotionPreference);
  toggle?.addEventListener("click", async () => {
    if (!video.paused) video.pause();
    else {
      try {
        await video.play();
      } catch {
        video.controls = true;
      }
    }
    updateVideoControls();
  });
  sound?.addEventListener("click", async () => {
    video.muted = !video.muted;
    if (!video.muted) {
      video.currentTime = 0;
      try {
        await video.play();
      } catch {
        video.controls = true;
      }
    }
    updateVideoControls();
  });
}

const announcement = document.createElement("p");
announcement.className = "homepage-announcement";
announcement.setAttribute("role", "status");
document.body.append(announcement);
const announce = (message) => {
  announcement.textContent = message;
};

document.querySelectorAll("[data-copy-install]").forEach((button) => {
  const label = button.textContent;
  button.addEventListener("click", async () => {
    const code = document.getElementById(
      button.dataset.copyTarget || "install-code",
    );
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent.trim());
      button.textContent = "Copied";
      announce("Installation script copied.");
    } catch {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Code selected";
      announce("Clipboard unavailable. Copy the selected installation script.");
    }
    setTimeout(() => {
      button.textContent = label;
    }, 2200);
  });
});

let library;
function loadLibrary() {
  if (window.Pagepaint) return Promise.resolve(window.Pagepaint);
  if (!library) {
    library = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/v0.4.3/pagepaint.js";
      script.onload = () => resolve(window.Pagepaint);
      script.onerror = () => {
        script.remove();
        library = null;
        reject(new Error("Pagepaint could not load. Try again."));
      };
      document.head.append(script);
    });
  }
  return library;
}

document.querySelectorAll("[data-open-feedback]").forEach((button) => {
  const label = button.textContent;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Loading Pagepaint…";
    try {
      const pagepaint = await loadLibrary();
      const widget = pagepaint.init({
        projectId: "pagepaint-homepage",
        projectName: "Pagepaint homepage",
        author: "You",
      });
      await widget.ready;
      await widget.open();
      announce("Pagepaint opened. Your feedback stays on this device.");
    } catch (error) {
      announce(error.message);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
});
