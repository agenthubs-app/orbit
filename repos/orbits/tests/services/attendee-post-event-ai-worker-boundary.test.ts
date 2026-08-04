import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerPath = new URL("../../scripts/run-attendee-post-event-ai-worker.ts", import.meta.url);

test("post-event AI daemon loads local env, backs off, and closes on termination", async () => {
  const source = await readFile(workerPath, "utf8");
  assert.match(source, /loadLocalEnv\(\)/);
  assert.match(source, /SIGINT/);
  assert.match(source, /SIGTERM/);
  assert.match(source, /consecutiveFailures/);
  assert.match(source, /configured\.client\.close\(\)/);
  assert.match(source, /processAttendeePostEventAiTask/);
});
