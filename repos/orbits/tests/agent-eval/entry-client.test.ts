import assert from "node:assert/strict";
import { test } from "node:test";

import { sessionDelivered, waitForChannelEvent } from "./lib/entry-client";
import { eventIndexLine } from "./lib/judging";

/**
 * AE-ENT-006 (AG01 repair round 2): a disconnect during a running turn happens only after the
 * client has seen at least one channel event of that turn, so the reconnect resumes after a seq > 0.
 */

test("waits until the client has an event of the running turn, then disconnects in time", async () => {
  let events = 0;
  setTimeout(() => { events = 1; }, 30);
  const outcome = await waitForChannelEvent({ hasEvent: () => events > 0, isRunning: async () => true, pollMs: 5, timeoutMs: 1_000 });
  assert.deepEqual(outcome, { late: false });
});

test("the turn ending before any event arrives is reported as late, with the reason", async () => {
  let running = true;
  setTimeout(() => { running = false; }, 20);
  const outcome = await waitForChannelEvent({ hasEvent: () => false, isRunning: async () => running, pollMs: 5, timeoutMs: 1_000 });
  assert.equal(outcome.late, true);
  assert.match(String(outcome.reason), /turn ended before the client received any channel event/u);
});

test("an event that arrives together with the end still counts as in time; a timeout is late", async () => {
  assert.deepEqual(await waitForChannelEvent({ hasEvent: () => true, isRunning: async () => false, pollMs: 5, timeoutMs: 100 }), { late: false });
  const timedOut = await waitForChannelEvent({ hasEvent: () => false, isRunning: async () => true, pollMs: 5, timeoutMs: 30 });
  assert.equal(timedOut.late, true);
  assert.match(String(timedOut.reason), /no channel event within 30 ms/u);
});

test("the judge's event index shows the seq a client resumed from and what the server pushed", () => {
  assert.equal(eventIndexLine({ after: 2, client: "app", seq: 9, step: 2, type: "turn.reconnect" }), "9 · turn.reconnect · app · Last-Event-ID 2");
  assert.equal(eventIndexLine({ after: 2, seq: 10, sessionId: "s", stream: true, type: "entry.channel.open" }), "10 · entry.channel.open · after 2");
  assert.equal(eventIndexLine({ after: 2, seq: 11, seqs: [3], sessionId: "s", stream: true, type: "entry.channel.push" }), "11 · entry.channel.push · after 2 → 3");
  assert.equal(eventIndexLine({ channelSeq: 3, client: "app", duplicate: false, kind: "document", requestId: "r", seq: 12, status: "completed", type: "client.channel_event" }), "12 · client.channel_event · app 收到 #3 document completed");
  assert.equal(eventIndexLine({ client: "app", lastSeq: 2, seq: 8, step: 1, type: "turn.disconnect" }), "8 · turn.disconnect · app · 最后收到 #2");
});

/**
 * AG14 UI run (judge finding on AE-MEM-003, 008, AE-FN-002): the row of a request reads "completed" a moment before its
 * result document reaches the channel; the runner leaves a conversation only once each online client holds it.
 */
test("a conversation is left only after each online client holds the documents of its ended requests", () => {
  const doc = { requestId: "r1", status: "completed" } as never;
  const rows = [
    { document: doc, requestId: "r1", sessionId: "s1", status: "completed" },
    { document: null as never, requestId: "r2", sessionId: "s1", status: "running" },
    { document: { requestId: "r9" } as never, requestId: "r9", sessionId: "s0", status: "completed" },
  ];
  const empty = { docs: new Map(), online: true };
  const holding = { docs: new Map([["r1", doc]]), online: true };
  assert.equal(sessionDelivered(rows, "s1", [empty]), false, "the stored answer has not reached the client yet");
  assert.equal(sessionDelivered(rows, "s1", [holding, { docs: new Map(), online: false }]), true, "an offline client is not waited for; a running request and another conversation are not waited for");
  assert.equal(sessionDelivered(rows, "s1", [holding, empty]), false, "every online client");
});
