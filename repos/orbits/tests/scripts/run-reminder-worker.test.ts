import assert from "node:assert/strict";
import test from "node:test";

import { parseReminderWorkerCommand } from "../../scripts/run-reminder-worker";

test("reminder worker defaults to one safe dispatch pass", () => {
  assert.deepEqual(parseReminderWorkerCommand([]), { intervalMs: 30_000, watch: false });
});

test("reminder worker accepts a bounded polling interval", () => {
  assert.deepEqual(parseReminderWorkerCommand(["--watch", "--interval-ms", "45000"]), {
    intervalMs: 45_000,
    watch: true,
  });
  assert.throws(() => parseReminderWorkerCommand(["--watch", "--interval-ms", "500"]), /at least 5000/u);
});
