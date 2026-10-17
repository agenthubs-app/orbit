import assert from "node:assert/strict";
import test from "node:test";

import {
  beginTodoHandoffConfirmation,
  clearTodoHandoff,
  markTodoHandoff,
  markTodoHandoffTaskCompleted,
  orphanedTodoHandoffs,
  pendingTodoHandoff,
  retryTodoHandoffItem,
  todoHandoffStorageKey,
} from "../src/screens/todo/todo-handoff-state";

const now = "2026-10-18T01:00:00.000Z";
const signal = {
  key: "agent_signal:signal-1", source: "agent_signal" as const, sourceId: "signal-1",
  titlePreview: "Follow up", createdAt: now, draftAvailable: true, contactId: "contact-1",
};

test("only a real signal with an authoritative target can enter the sent reminder", () => {
  assert.deepEqual(markTodoHandoff([], signal, now), [{ sourceId: "signal-1", handedOffAt: now }]);
  for (const item of [
    { ...signal, sample: true as const },
    { ...signal, source: "plan_today_chance" as const },
    { ...signal, sourceId: "" },
    { ...signal, contactId: undefined },
  ]) assert.deepEqual(markTodoHandoff([], item, now), []);
  assert.deepEqual(markTodoHandoff([], { ...signal, draftAvailable: false }, now), [{ sourceId: "signal-1", handedOffAt: now }],
    "a person may handwrite a message while AI drafting is unavailable");
  assert.deepEqual(markTodoHandoff([], { ...signal, contactId: undefined, taskId: "task-1" }, now), [{ sourceId: "signal-1", handedOffAt: now }]);
});

test("the reminder expires at 24 hours and storage is account/server scoped without draft text", () => {
  const records = markTodoHandoff([], signal, now);
  assert.deepEqual(markTodoHandoff(records, signal, "2026-10-18T02:00:00.000Z"), records,
    "copying again must not extend the reminder's 24-hour window");
  assert.equal(pendingTodoHandoff(records, signal, now)?.sourceId, "signal-1");
  assert.equal(pendingTodoHandoff(records, signal, "2026-10-19T00:59:59.999Z")?.sourceId, "signal-1");
  assert.equal(pendingTodoHandoff(records, signal, "2026-10-19T01:00:00.000Z"), null);
  assert.equal(pendingTodoHandoff(records, signal, "2026-10-17T23:59:59.000Z"), null);
  assert.equal(pendingTodoHandoff([{ sourceId: signal.sourceId, handedOffAt: "2026-10-18T01:00:00Z" }], signal, now)?.sourceId,
    signal.sourceId, "a valid UTC timestamp without fractional seconds is still a pending reminder");
  assert.notEqual(todoHandoffStorageKey("actor-1", "https://one.test"), todoHandoffStorageKey("actor-2", "https://one.test"));
  assert.notEqual(todoHandoffStorageKey("actor-1", "https://one.test"), todoHandoffStorageKey("actor-1", "https://two.test"));
  assert.doesNotMatch(JSON.stringify(records), /draft|message|Follow up|contact-1/u);
});

test("confirmation retains its idempotency identity and never silently retargets a retry", () => {
  const pending = markTodoHandoff([], signal, now);
  const begun = beginTodoHandoffConfirmation(pending, signal, {
    contactId: "contact-1", taskId: null, idempotencyKey: "ios:sent:key-1", observedAt: now,
  }, now);
  assert.ok(begun);
  assert.deepEqual(beginTodoHandoffConfirmation(begun, signal, {
    contactId: "contact-1", taskId: null, idempotencyKey: "ios:sent:key-2", observedAt: "2026-10-18T02:00:00.000Z",
  }, now), begun);
  assert.equal(beginTodoHandoffConfirmation(begun, signal, {
    contactId: "contact-2", taskId: null, idempotencyKey: "ios:sent:key-1", observedAt: now,
  }, now), null);
  assert.deepEqual(clearTodoHandoff(begun, signal.sourceId), []);
});

test("task completion is checkpointed before encounter retry and does not clear the reminder", () => {
  const item = { ...signal, contactId: undefined, taskId: "task-1" };
  const begun = beginTodoHandoffConfirmation(markTodoHandoff([], item, now), item, {
    contactId: "contact-1", taskId: "task-1", idempotencyKey: "ios:sent:key-1", observedAt: now,
  }, now);
  assert.ok(begun);
  const completed = markTodoHandoffTaskCompleted(begun, item.sourceId);
  assert.equal(pendingTodoHandoff(completed, item, now)?.confirmation?.taskCompleted, true);
  assert.equal(pendingTodoHandoff(completed, item, now)?.confirmation?.idempotencyKey, "ios:sent:key-1");
  assert.equal(pendingTodoHandoff(completed, item, "2026-10-20T01:00:00.000Z")?.confirmation?.taskCompleted, true,
    "an incomplete encounter remains retryable after the ordinary prompt expires");
});

test("the bounded reminder list never evicts an unfinished encounter checkpoint", () => {
  const pending = Array.from({ length: 50 }, (_, index) => ({
    sourceId: `signal-${index}`, handedOffAt: now,
    confirmation: { contactId: `contact-${index}`, taskId: null, idempotencyKey: `ios:sent:${index}`,
      observedAt: now, taskCompleted: false },
  }));
  assert.deepEqual(markTodoHandoff(pending, { ...signal, sourceId: "signal-new", key: "agent_signal:signal-new" }, now), pending);
});

test("a confirmed encounter remains retryable when its source signal leaves the fresh page", () => {
  const begun = beginTodoHandoffConfirmation(markTodoHandoff([], signal, now), signal, {
    contactId: "contact-1", taskId: null, idempotencyKey: "ios:sent:key-1", observedAt: now,
  }, now);
  assert.ok(begun);
  assert.deepEqual(orphanedTodoHandoffs(begun, [signal]), []);
  assert.deepEqual(orphanedTodoHandoffs(begun, []), begun);
  const retry = retryTodoHandoffItem(begun[0]!);
  assert.ok(retry);
  assert.equal(pendingTodoHandoff(begun, retry, "2026-10-20T01:00:00.000Z")?.confirmation?.idempotencyKey,
    "ios:sent:key-1");
  assert.equal(retryTodoHandoffItem({ sourceId: "signal-2", handedOffAt: now }), null,
    "an unconfirmed reminder cannot become an orphaned write target");
});
