import assert from "node:assert/strict";
import test from "node:test";

import { abortableWait } from "../../scripts/abortable-wait";

test("worker wait resolves immediately when its shutdown signal aborts", async () => {
  const controller = new AbortController();
  const startedAt = performance.now();
  const waiting = abortableWait(60_000, controller.signal);
  controller.abort();
  await waiting;
  assert.ok(performance.now() - startedAt < 250);
});
