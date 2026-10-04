// ABOUTME: Initializes the review widget and interactive sample task board.
// ABOUTME: Demonstrates live positioning and URL context changes without a framework.
const widget = window.ReviewTool.init({
  projectId: "playground",
  endpoint: location.origin,
  author: "You",
});
window.demoReview = widget;
const snippet = `<script\n  src="${location.origin}/review-tool.js"\n  data-review-tool\n  data-project="my-app"\n  data-endpoint="${location.origin}"\n  defer\n></script>`;
document.getElementById("embed-code").textContent = snippet;
document
  .getElementById("open-feedback")
  .addEventListener("click", () => widget.open());
document
  .getElementById("position")
  .addEventListener("change", (event) =>
    widget.setPosition(
      event.target.value === "custom"
        ? { bottom: 120, right: 32 }
        : event.target.value,
    ),
  );
document
  .getElementById("copy-snippet")
  .addEventListener("click", async (event) => {
    try {
      await navigator.clipboard.writeText(snippet);
      event.target.textContent = "Copied";
    } catch {
      event.target.textContent = "Select code to copy";
    }
    setTimeout(() => {
      event.target.textContent = "Copy";
    }, 2000);
  });
function updateContext() {
  document.getElementById("current-context").textContent =
    `${location.pathname}${location.search}${location.hash}`;
}
document.querySelectorAll("[data-view]").forEach((button) =>
  button.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.set("view", button.dataset.view);
    history.pushState({}, "", url);
    document.querySelectorAll("[data-view]").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.toggleAttribute("aria-current", item === button);
      if (item === button) item.setAttribute("aria-current", "page");
    });
    document.getElementById("sample-title").textContent =
      button.dataset.view === "overview"
        ? "A few good improvements."
        : "Make it feel right.";
    updateContext();
  }),
);
document.getElementById("change-context").addEventListener("click", () => {
  history.pushState(
    {},
    "",
    "/index.html?view=board&filter=review&tag=ui&tag=mobile#iteration-04",
  );
  updateContext();
  document.getElementById("demo-announcement").textContent =
    "Page URL updated. New feedback will include the query parameters and hash.";
});
document.getElementById("board").addEventListener("click", (event) => {
  const task = event.target.closest("[data-stage]");
  if (!task) return;
  const stage = (Number(task.dataset.stage) + 1) % 3;
  task.dataset.stage = stage;
  task.classList.toggle("completed", stage === 2);
  document.querySelector(`[data-column="${stage}"]`).append(task);
  document.querySelectorAll(".column").forEach((column) => {
    column.querySelector(".column-count").textContent =
      column.querySelectorAll(".task").length;
  });
  document.getElementById("demo-announcement").textContent =
    `Moved ${task.querySelector("strong").textContent} to ${["To do", "In progress", "Done"][stage]}.`;
});
window.addEventListener("popstate", updateContext);
updateContext();
