import assert from "node:assert/strict";
import test from "node:test";

import { contactVersionOf, withNextContactVersion } from "../../../features/contacts/contact-version";
import { createCardKit, ACTOR } from "../../services/agent-ledger-card-kit";

/**
 * agent-design AG18-1 (设计稿 §4「拒绝旧端用全对象覆盖新字段」, §8 第 5 步「旧端提交局部更新时保护多值数据」): an old client
 * that sends only the fields it knows — one field, or every old field it read — never narrows or clears the new ones.
 * The rules live in each domain service (AG13: tasks/task-links.ts, notes/service.ts, personal-schedule/service.ts,
 * contacts/contact-version.ts); these tests hold them for the old clients' two ways of submitting.
 */

const OLD_TASK_FIELDS = ["title", "notes", "location", "category", "plannedDate", "dueAt", "priority", "relatedContactId", "relatedEventId", "relatedMeetingId", "relatedConversationId"] as const;

async function linkedTodo(kit: ReturnType<typeof createCardKit>) {
  const created = await kit.tasks.create({ actorId: ACTOR, category: "relationship", idempotencyKey: "todo:t42", now: kit.now(), plannedDate: "2026-11-18", relatedContactIds: ["contact:c17", "contact:c21"], relatedEventRefs: [{ id: "event:e103", kind: "platform" }], title: "给小林发修订报价" });
  return created.task;
}

test("to-do: the old title-only edit keeps both people and the event; its single field still reads C17", async () => {
  const kit = createCardKit();
  const task = await linkedTodo(kit);
  const updated = await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: task.updatedAt, idempotencyKey: "old:title", now: kit.now(), patch: { title: "给小林发修订报价（第二版）" }, taskId: task.id });
  const after = updated.task;
  assert.equal(after.title, "给小林发修订报价（第二版）");
  assert.equal(after.relatedContactId, "contact:c17");
  assert.deepEqual(after.relatedContactIds, ["contact:c17", "contact:c21"]);
  assert.deepEqual(after.relatedEventRefs, [{ id: "event:e103", kind: "platform" }]);
});

test("to-do: the old whole-record submit (single fields, no lists) neither narrows nor clears the lists", async () => {
  const kit = createCardKit();
  const task = await linkedTodo(kit);
  const read = (await kit.tasks.get({ actorId: ACTOR, taskId: task.id }))! as unknown as Record<string, unknown>;
  const whole = Object.fromEntries(OLD_TASK_FIELDS.filter((field) => read[field] !== undefined).map((field) => [field, read[field]]));
  assert.equal(whole.relatedContactId, "contact:c17");
  assert.equal("relatedContactIds" in whole, false);
  const updated = await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: task.updatedAt, idempotencyKey: "old:whole", now: kit.now(), patch: whole as never, taskId: task.id });
  assert.deepEqual(updated.task.relatedContactIds, ["contact:c17", "contact:c21"]);
  assert.deepEqual(updated.task.relatedEventRefs, [{ id: "event:e103", kind: "platform" }]);
  // An old client that changes its single person replaces only the mirrored first one.
  const moved = await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: updated.task.updatedAt, idempotencyKey: "old:person", now: kit.now(), patch: { relatedContactId: "contact:c30" }, taskId: task.id });
  assert.deepEqual(moved.task.relatedContactIds, ["contact:c30", "contact:c21"]);
});

test("memo: the old edit (title, or the old eventIds and contactIds) keeps the interaction and the private event links", async () => {
  const kit = createCardKit();
  const interaction = { actualContactIds: ["contact:c17"], channel: "phone" as const, direction: "incoming" as const, occurredOn: "2026-11-15", precision: "day" as const };
  const note = await kit.notes.create({ actorId: ACTOR, body: "小林今天来过电话，想把实施费单列。", contactIds: ["contact:c17"], eventIds: ["event:e103"], idempotencyKey: "memo:m1", interaction, now: kit.now() });
  // A private event linked by an earlier card (the memo service only lets a card add one): put it on the stored memo.
  const stored = await kit.store.getRecord({ collectionName: "notes", recordId: note.id, workspaceId: kit.workspaceId });
  const payload = stored!.payload as { note: Record<string, unknown> };
  await kit.store.upsertRecord({ ...stored!, payload: { ...payload, note: { ...payload.note, eventRefs: [{ id: "event:e103", kind: "platform" }, { id: "private_event:p1", kind: "private" }] } } });
  const titled = await kit.notes.update({ actorId: ACTOR, expectedVersion: note.version, idempotencyKey: "old:memo-title", noteId: note.id, now: kit.now(), title: "小林来电" });
  assert.deepEqual(titled.interaction, interaction);
  assert.deepEqual(titled.eventRefs, [{ id: "event:e103", kind: "platform" }, { id: "private_event:p1", kind: "private" }]);
  const whole = await kit.notes.update({ actorId: ACTOR, body: titled.body, contactIds: ["contact:c17"], eventIds: ["event:e103"], expectedVersion: titled.version, idempotencyKey: "old:memo-whole", noteId: note.id, now: kit.now(), title: titled.title });
  assert.deepEqual(whole.interaction, interaction);
  assert.deepEqual(whole.eventRefs?.map((ref) => ref.id).sort(), ["event:e103", "private_event:p1"]);
  assert.deepEqual(whole.eventIds, ["event:e103"]);
});

test("schedule: an old edit without eventRefs keeps them", async () => {
  const kit = createCardKit();
  const created = await kit.schedule.create(ACTOR, { eventRefs: [{ id: "event:e103", kind: "platform" }], idempotencyKey: "schedule:s1", startsAt: "2026-11-19T03:00:00.000Z", endsAt: "2026-11-19T04:00:00.000Z", title: "和田中午餐" } as never);
  const item = (created as { scheduleItem: { id: string; updatedAt: string } }).scheduleItem;
  const updated = await kit.schedule.update(ACTOR, item.id, { expectedUpdatedAt: item.updatedAt, idempotencyKey: "old:schedule", patch: { title: "和田中浩午餐", location: "梅田" } } as never);
  assert.deepEqual((updated as { scheduleItem: { eventRefs?: unknown } }).scheduleItem.eventRefs, [{ id: "event:e103", kind: "platform" }]);
});

test("contact: an old whole-record write carries no version, and the stored version still only goes up", () => {
  const stored = { displayName: "小林健", version: 7 };
  const oldClientWrite = { displayName: "小林 健", organization: "甲方" };
  assert.equal(contactVersionOf(withNextContactVersion(stored, oldClientWrite)), 8);
  // An old contact without a version reads as 0 and is not backfilled (relationship initialization relies on it).
  assert.equal(contactVersionOf({ displayName: "旧联系人" }), 0);
  assert.equal(contactVersionOf(withNextContactVersion({ displayName: "旧联系人" }, { displayName: "旧联系人" })), 1);
});
