// ABOUTME: Persists feedback and recoverable drafts in a browser IndexedDB database.
// ABOUTME: Keeps projects separate and falls back to memory if storage is unavailable.
export class FeedbackStore {
  constructor(projectId) {
    this.projectId = projectId;
    this.memory = new Map();
    this.persistent = true;
    this.ready = new Promise((resolve) => {
      try {
        const request = indexedDB.open("review-tool", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("records", { keyPath: "key" });
        };
        request.onsuccess = () => {
          this.db = request.result;
          this.db.onversionchange = () => this.db.close();
          resolve();
        };
        request.onerror = request.onblocked = () => {
          this.persistent = false;
          resolve();
        };
      } catch {
        this.persistent = false;
        resolve();
      }
    });
  }

  async run(mode, action) {
    await this.ready;
    if (!this.db) return action(null);
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction("records", mode);
      const request = action(transaction.objectStore("records"));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = transaction.onabort = () =>
        reject(
          transaction.error?.name === "QuotaExceededError"
            ? new Error(
                "Browser storage is full. Download a ZIP backup before clearing site data.",
              )
            : transaction.error ||
                new Error("Browser storage could not save this feedback."),
        );
    });
  }

  async put(record) {
    const value = {
      ...record,
      key: `${this.projectId}:${record.id}`,
      projectId: this.projectId,
    };
    return this.run("readwrite", (store) =>
      store ? store.put(value) : this.memory.set(value.key, value),
    );
  }

  async list() {
    const all = await this.run("readonly", (store) =>
      store ? store.getAll() : Array.from(this.memory.values()),
    );
    return all
      .filter(
        (record) =>
          record.projectId === this.projectId &&
          !["draft", "preferences", "folder"].includes(record.id),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async draft() {
    return this.run("readonly", (store) =>
      store
        ? store.get(`${this.projectId}:draft`)
        : this.memory.get(`${this.projectId}:draft`),
    );
  }

  async folder() {
    return this.run("readonly", (store) =>
      store
        ? store.get(`${this.projectId}:folder`)
        : this.memory.get(`${this.projectId}:folder`),
    );
  }

  async preferences() {
    return this.run("readonly", (store) =>
      store
        ? store.get(`${this.projectId}:preferences`)
        : this.memory.get(`${this.projectId}:preferences`),
    );
  }

  async clearDraft() {
    return this.run("readwrite", (store) =>
      store
        ? store.delete(`${this.projectId}:draft`)
        : this.memory.delete(`${this.projectId}:draft`),
    );
  }

  async commitFeedback(record) {
    const value = {
      ...record,
      key: `${this.projectId}:${record.id}`,
      projectId: this.projectId,
    };
    return this.run("readwrite", (store) => {
      if (store) {
        store.put(value);
        return store.delete(`${this.projectId}:draft`);
      }
      this.memory.set(value.key, value);
      this.memory.delete(`${this.projectId}:draft`);
    });
  }

  close() {
    this.db?.close();
  }
}
