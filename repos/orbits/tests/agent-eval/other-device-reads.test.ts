import assert from "node:assert/strict";
import { test } from "node:test";

import { OTHER_DEVICE_HEADER, readsOfTestedSystem } from "./lib/runner";

/**
 * agent-design AG05 run-02 (coordinator): what the simulated other device reads while it makes an
 * external_change is not the tested system's read. The runner marks that HTTP request with an eval-only
 * header; the preload runs the request in an async context of its own and tags every event emitted in it
 * (`device: "other"`). Exclusion is by that tag, not by a time window — a read of the Agent that happens
 * to fall inside the window still counts.
 */

test("the header name is eval-only", () => {
  assert.equal(OTHER_DEVICE_HEADER, "x-agent-eval-device");
});

test("reads tagged as the other device's are left out; every other read counts, whenever it happened", () => {
  const events = [
    { seq: 1, type: "http.request", purpose: "external change: delete the note on another device" },
    { seq: 2, type: "read.result", device: "other", records: [{ id: "note:m37" }] },
    { seq: 3, type: "read.result", records: [{ id: "task:t42" }] },
    { seq: 4, type: "http.response" },
    { seq: 5, type: "read.result", records: [{ id: "note:m31" }] },
  ];
  assert.deepEqual(readsOfTestedSystem(events as never).map((event) => event.seq), [3, 5]);
});
