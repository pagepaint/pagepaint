// ABOUTME: Filters GitHub repositories in an accessible keyboard-operated picker.
// ABOUTME: Keeps the selected destination separate from the temporary search query.
export class RepositoryPicker {
  constructor(root, signal, onToggle) {
    this.container = root.getElementById("repository-picker");
    this.trigger = root.getElementById("github-repository");
    this.menu = root.getElementById("github-repository-menu");
    this.search = root.getElementById("github-repository-search");
    this.list = root.getElementById("github-repository-results");
    this.status = root.getElementById("github-repository-status");
    this.onToggle = onToggle;
    this.repositories = [];
    this.value = "";
    const settings = { signal };
    this.trigger.addEventListener(
      "click",
      () => (this.menu.hidden ? this.open() : this.close()),
      settings,
    );
    this.search.addEventListener("input", () => this.render(), settings);
    this.search.addEventListener(
      "keydown",
      (event) => {
        if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") return this.close(true);
          if (event.key === "Enter")
            return this.select(this.matches[this.active]);
          if (this.matches.length)
            this.activate(
              (this.active +
                (event.key === "ArrowDown" ? 1 : -1) +
                this.matches.length) %
                this.matches.length,
            );
        }
        if (event.key === "Tab") this.close();
      },
      settings,
    );
    this.list.addEventListener(
      "pointerdown",
      (event) => event.preventDefault(),
      settings,
    );
    this.list.addEventListener(
      "click",
      (event) => {
        const option = event.target.closest("[data-repository-index]");
        if (option)
          this.select(this.matches[Number(option.dataset.repositoryIndex)]);
      },
      settings,
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.menu.hidden && !event.composedPath().includes(this.container))
          this.close();
      },
      settings,
    );
  }
  setRepositories(repositories, selected) {
    this.repositories = repositories;
    this.value = repositories.some((repo) => repo.full_name === selected)
      ? selected
      : "";
    this.trigger.disabled = !repositories.length;
    this.updateLabel();
    this.close();
  }
  updateLabel() {
    this.trigger.querySelector("span").textContent =
      this.value ||
      (this.repositories.length
        ? "Choose a repository"
        : "Connect GitHub first");
  }
  open() {
    this.menu.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.search.setAttribute("aria-expanded", "true");
    this.search.value = "";
    this.render();
    this.search.focus();
    this.onToggle();
  }
  close(focus = false) {
    this.menu.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    this.search.setAttribute("aria-expanded", "false");
    this.search.removeAttribute("aria-activedescendant");
    if (focus) this.trigger.focus();
    this.onToggle();
  }
  render() {
    const terms = this.search.value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const matches = this.repositories.filter((repo) =>
      terms.every((term) => repo.full_name.toLowerCase().includes(term)),
    );
    this.matches = matches.slice(0, 50);
    this.list.replaceChildren();
    for (const [index, repo] of this.matches.entries()) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "repository-option";
      option.id = `github-repository-option-${index}`;
      option.dataset.repositoryIndex = index;
      option.setAttribute("role", "option");
      option.setAttribute(
        "aria-selected",
        String(repo.full_name === this.value),
      );
      option.tabIndex = -1;
      const name = document.createElement("span");
      name.textContent = repo.full_name;
      const visibility = document.createElement("small");
      visibility.textContent =
        repo.private === true
          ? "Private"
          : repo.private === false
            ? "Public"
            : "";
      option.append(name, visibility);
      this.list.append(option);
    }
    this.status.textContent =
      matches.length > 50
        ? `${matches.length} matches. Type more to narrow the list.`
        : matches.length
          ? `${matches.length} ${matches.length === 1 ? "repository" : "repositories"}`
          : "No matching repositories.";
    this.active = 0;
    this.activate(0);
  }
  activate(index) {
    this.active = index;
    [...this.list.children].forEach((option, current) => {
      option.toggleAttribute("data-active", current === index);
    });
    const option = this.list.children[index];
    if (option) {
      this.search.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else this.search.removeAttribute("aria-activedescendant");
  }
  select(repo) {
    if (!repo) return;
    this.value = repo.full_name;
    this.updateLabel();
    this.close(true);
  }
}
