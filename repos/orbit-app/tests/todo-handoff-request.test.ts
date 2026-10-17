import assert from "node:assert/strict";
import test from "node:test";

import { todoHandoffTarget, todoHandoffRetryTarget, todoHandoffTaskReceipt, todoEncounterReceipt } from "../src/screens/todo/todo-handoff-request";

const item = { key: "agent_signal:signal-1", source: "agent_signal" as const, sourceId: "signal-1",
  titlePreview: "A message", createdAt: "2026-10-18T01:00:00.000Z", draftAvailable: false, contactId: "contact-1" };
const task = { id: "task-1", accountId: "actor-1", ownerUserId: "actor-1", title: "Follow up", status: "open",
  category: "relationship", priority: "normal", source: "manual", relatedContactId: "contact-1",
  createdAt: "2026-10-18T01:00:00.000Z", updatedAt: "2026-10-18T01:00:00.000Z" };

test("untasked signals use only their explicit contact target", () => {
  assert.deepEqual(todoHandoffTarget(item, null, "actor-1"), { contactId: "contact-1", taskId: null });
  assert.equal(todoHandoffTarget({ ...item, contactId: "" }, null, "actor-1"), null);
});

test("task-linked signals require an open actor-owned task with the same contact", () => {
  const linked = { ...item, taskId: "task-1" };
  assert.deepEqual(todoHandoffTarget(linked, { task }, "actor-1"), { contactId: "contact-1", taskId: "task-1" });
  for (const changed of [{ ...task, ownerUserId: "actor-2" }, { ...task, status: "completed" },
    { ...task, relatedContactId: "contact-2" }, { ...task, relatedContactId: undefined }]) {
    assert.equal(todoHandoffTarget(linked, { task: changed }, "actor-1"), null);
  }
  assert.equal(todoHandoffTarget(linked, { task: { ...task, id: "task-2" } }, "actor-1"), null);
});

test("a persisted retry keeps its original target after the task was completed", () => {
  const linked = { ...item, taskId: "task-1" };
  const record = { sourceId: "signal-1", handedOffAt: item.createdAt, confirmation: {
    contactId: "contact-1", taskId: "task-1", idempotencyKey: "ios:sent:key-1", observedAt: item.createdAt, taskCompleted: true,
  } };
  assert.deepEqual(todoHandoffRetryTarget(record, linked), { contactId: "contact-1", taskId: "task-1" });
  assert.equal(todoHandoffRetryTarget(record, { ...linked, contactId: "contact-2" }), null);
  assert.equal(todoHandoffRetryTarget(record, { ...linked, taskId: "task-2" }), null);
  assert.equal(todoHandoffRetryTarget({ ...record, confirmation: { ...record.confirmation, taskId: null } },
    { ...item, contactId: undefined }), null, "an untasked signal cannot lose its direct contact authority");
});

test("task completion receipt keeps the same contact across the read/write race", () => {
  const payload = { task: { ...task, status: "completed", completedBy: "actor-1" }, activity: { type: "completed", taskId: "task-1",
    accountId: "actor-1", ownerUserId: "actor-1", taskSnapshot: { relatedContactId: "contact-1" } } };
  assert.equal(todoHandoffTaskReceipt(payload, "actor-1", "task-1", "contact-1"), true);
  assert.equal(todoHandoffTaskReceipt({ ...payload, task: { ...payload.task, relatedContactId: "contact-2" } }, "actor-1", "task-1", "contact-1"), false);
  assert.equal(todoHandoffTaskReceipt({ ...payload, activity: { ...payload.activity,
    taskSnapshot: { relatedContactId: "contact-2" } } }, "actor-1", "task-1", "contact-1"), false);
});

test("encounter receipt must be the same contact and confirmation instant", () => {
  const at = "2026-10-18T01:00:00.000Z";
  assert.equal(todoEncounterReceipt({ encounterId: "encounter:1", contactId: "contact-1", observedAt: at,
    privacy: "private", talked: "uncertain" }, "contact-1", at), true);
  assert.equal(todoEncounterReceipt({ encounterId: "encounter:1", contactId: "contact-2", observedAt: at,
    privacy: "private", talked: "uncertain" }, "contact-1", at), false);
  assert.equal(todoEncounterReceipt({}, "contact-1", at), false);
});
