// ABOUTME: Opens extension projects with the same widget and repository writer as CDN embeds.
// ABOUTME: Recovers videos saved after a tab navigates or closes during recording.
import { ReviewWidget } from "../src/widget.js";
import { FeedbackStore } from "../src/storage.js";
let widget;
const select = document.getElementById("projects");
const { projects = {} } = await chrome.storage.local.get("projects");
for (const project of Object.values(projects)) {
  const store = new FeedbackStore(project.projectId);
  project.projectName =
    (await store.preferences())?.projectName || project.projectName;
  store.close();
  const option = document.createElement("option");
  option.value = project.projectId;
  option.textContent = `${project.projectName} · ${project.context.origin}`;
  select.append(option);
}
document.getElementById("empty").hidden = Object.keys(projects).length > 0;
async function open(projectId) {
  if (widget) {
    widget.destroy();
    await Promise.allSettled([widget.saveQueue, widget.preferenceQueue]);
  }
  if (!projects[projectId]) return;
  history.replaceState(null, "", `?project=${encodeURIComponent(projectId)}`);
  const project = projects[projectId];
  widget = new ReviewWidget({
    projectId,
    projectName: project.projectName,
    context: () => project.context,
    captureViewport: () => {
      throw new Error("Capture on the app tab using the extension.");
    },
    startRecording: () => {
      throw new Error("Start recording on the app tab using the extension.");
    },
  });
  await widget.ready;
  await widget.open();
  const pending = document.getElementById("pending");
  pending.replaceChildren();
  for (const entry of await widget.store.pendingVideos()) {
    const button = document.createElement("button");
    button.textContent = `Attach saved recording · ${Math.ceil(entry.video.durationMs / 1000)} sec`;
    button.onclick = async () => {
      try {
        await widget.switchThread(entry.threadId || null);
        await widget.acceptVideo(entry.video);
        await widget.store.remove(entry.id);
        button.remove();
      } catch (error) {
        document.getElementById("error").textContent = error.message;
      }
    };
    pending.append(button);
  }
}
select.addEventListener("change", () =>
  open(select.value).catch((error) => {
    document.getElementById("error").textContent = error.message;
  }),
);
const initial = new URL(location.href).searchParams.get("project");
if (projects[initial]) {
  select.value = initial;
  await open(initial);
}
