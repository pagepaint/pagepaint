// ABOUTME: Verifies first-visit project naming and extension origin isolation.
// ABOUTME: Keeps localhost ports separate without coupling names to project identifiers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultProjectName, originProjectId } from "../src/projects.js";
test("localhost uses the first title and hosted sites use their hostname", async () => {
  assert.equal(
    defaultProjectName({ url: "http://localhost:3000/a", title: "Studio" }),
    "Studio",
  );
  assert.equal(
    defaultProjectName({ url: "http://localhost:3000", title: "" }),
    "localhost:3000",
  );
  assert.equal(
    defaultProjectName({ url: "http://[::1]:3000", title: "IPv6 app" }),
    "IPv6 app",
  );
  assert.equal(
    defaultProjectName({
      url: "https://www.example.com/any",
      title: "Changing page",
    }),
    "example.com",
  );
  assert.notEqual(
    await originProjectId("http://localhost:3000"),
    await originProjectId("http://localhost:3001"),
  );
  assert.equal((await originProjectId("https://example.com")).length, 69);
});
