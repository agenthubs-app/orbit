import assert from "node:assert/strict";
import test from "node:test";

import { agentCardPreview } from "../../features/agent/runtime/card-view";
import { cardPayloadHash } from "../../features/agent/runtime/decision";
import { ACTOR, createCardKit, decide, freeze } from "./agent-ledger-card-kit";

/**
 * agent-design AG02-1 and AG02-3 on the ledger service (decideAction):
 * a resent decision returns the first result marked replayed; a second click reads the first
 * one's result; the old decision shape cannot decide a card with an origin; a click checks what
 * the card showed and issues a new revision instead of executing old content; a stale revision or
 * hash returns the latest card; the SHA-256 hash covers the visible text.
 */

test("the same clientDecisionId sent again returns the first result, marked replayed, with one approval", async () => {
  const kit = createCardKit();
  const card = await freeze(kit, [{ capability: "todo.create", set: { plannedDate: "2026-11-30", title: "Book the meeting room" } }]);
  const first = await decide(kit, card, "confirm", "decision:1");
  assert.equal(first?.outcome, "accepted");
  assert.equal(first?.replayed, false);
  const again = await decide(kit, card, "confirm", "decision:1");
  assert.equal(again?.outcome, "accepted");
  assert.equal(again?.replayed, true);
  assert.equal(again?.decisionId, first?.decisionId);
  assert.equal(again?.decidedAt, first?.decidedAt);
  const run = await kit.runtime.getRun(card.runId);
  assert.equal(run?.outbox.length, 1, "one outbox event for the one item");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal((await kit.listTasks()).filter((task) => task.title === "Book the meeting room").length, 1);
});

test("a second click with a new clientDecisionId reads the first one's result and does not fail", async () => {
  const kit = createCardKit();
  const card = await freeze(kit, [{ capability: "todo.create", set: { plannedDate: "2026-11-17", title: "交停车费" } }]);
  assert.equal((await decide(kit, card, "confirm", "decision:web"))?.outcome, "accepted");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const second = await decide(kit, card, "confirm", "decision:app");
  assert.equal(second?.outcome, "already_decided");
  assert.equal(second?.accepted, false);
  assert.equal(second?.replayed, false);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "completed");
  assert.equal((await kit.runtime.getRun(card.runId))?.outbox.length, 1);
  assert.equal(kit.executorCalls.length, 1);
  assert.equal((await kit.listTasks()).length, 1);
});

test("the old decision shape cannot approve, reject or retry a card that has an origin", async () => {
  const kit = createCardKit();
  const card = await freeze(kit, [{ capability: "todo.create", set: { title: "续订域名" } }]);
  await assert.rejects(() => kit.runtime.approveAction({ actionId: card.actionId, actorLabel: "Orbit user" }), /button decisions only/u);
  await assert.rejects(() => kit.runtime.rejectAction(card.actionId), /button decisions only/u);
  await assert.rejects(() => kit.runtime.deferAction(card.actionId), /button decisions only/u);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "awaiting_confirmation");
  assert.equal((await kit.runtime.getRun(card.runId))?.outbox.length, 0);
});

test("the value being changed was changed elsewhere: CARD_CONTENT_CHANGED, revision 2 from the current data, nothing executed", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("给小林发修订报价", "2026-11-18");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: todo.id }]);
  assert.deepEqual(card.operations[0].before, { plannedDate: "2026-11-18" });
  const current = await kit.tasks.get({ actorId: ACTOR, taskId: todo.id });
  await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: current!.updatedAt, idempotencyKey: "elsewhere", now: kit.now(), patch: { plannedDate: "2026-11-19" }, taskId: todo.id });
  const result = await decide(kit, card, "confirm", "decision:1");
  assert.equal(result?.outcome, "refused");
  assert.equal(result?.reason, "CARD_CONTENT_CHANGED");
  assert.equal(result?.revision, 2);
  assert.deepEqual(result?.changes?.map((change) => [change.field, change.shownBefore, change.now, change.to]), [["plannedDate", "2026-11-18", "2026-11-19", "2026-11-20"]]);
  const latest = (await kit.runtime.getAction(card.actionId))!;
  assert.equal(latest.status, "awaiting_confirmation");
  assert.equal(latest.revision, 2);
  assert.deepEqual(latest.operations[0].before, { plannedDate: "2026-11-19" });
  assert.deepEqual(latest.operations[0].after, { plannedDate: "2026-11-20" });
  assert.match(latest.operations[0].preview, /11月19日（周四） → 11月20日（周五）/u);
  assert.equal(latest.revisions?.[0].revision, 1, "the old revision's payload is kept");
  assert.equal(latest.revisions?.[0].operations[0].before?.plannedDate, "2026-11-18");
  assert.notEqual(latest.payloadHash, card.payloadHash);
  assert.equal((await kit.runtime.getRun(card.runId))?.outbox.length, 0);
  assert.equal(kit.executorCalls.length, 0);
  assert.equal((await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))?.plannedDate, "2026-11-19");
});

test("the name the card showed changed: CARD_CONTENT_CHANGED with the new name", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("约山本吃饭");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-21" }, targetId: todo.id }]);
  const current = await kit.tasks.get({ actorId: ACTOR, taskId: todo.id });
  await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: current!.updatedAt, idempotencyKey: "rename", now: kit.now(), patch: { title: "约山本吃午饭" }, taskId: todo.id });
  const result = await decide(kit, card, "confirm", "decision:app");
  assert.equal(result?.reason, "CARD_CONTENT_CHANGED");
  assert.deepEqual(result?.changes?.map((change) => [change.field, change.shownBefore, change.now]), [["title", "约山本吃饭", "约山本吃午饭"]]);
  const latest = (await kit.runtime.getAction(card.actionId))!;
  assert.equal(latest.operations[0].shown?.title, "约山本吃午饭");
  assert.equal(latest.revision, 2);
});

test("the record is gone: CARD_CONTENT_CHANGED, nothing executed", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("寄出样品", "2026-11-18");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: todo.id }]);
  await kit.tasks.cancel({ actorId: ACTOR, idempotencyKey: "cancel", now: kit.now(), taskId: todo.id });
  const result = await decide(kit, card, "confirm", "decision:1");
  assert.equal(result?.reason, "CARD_CONTENT_CHANGED");
  assert.equal(result?.changes?.[0].field, "record");
  assert.equal(kit.executorCalls.length, 0);
  assert.equal((await kit.runtime.getRun(card.runId))?.outbox.length, 0);
});

test("another field of the record changing does not stop the card; the update executes against the current version", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("准备季度回顾", "2026-11-18");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: todo.id }]);
  const current = await kit.tasks.get({ actorId: ACTOR, taskId: todo.id });
  await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: current!.updatedAt, idempotencyKey: "other-field", now: kit.now(), patch: { notes: "带上上季度数据" }, taskId: todo.id });
  assert.equal((await decide(kit, card, "confirm", "decision:1"))?.outcome, "accepted");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const after = await kit.tasks.get({ actorId: ACTOR, taskId: todo.id });
  assert.equal(after?.plannedDate, "2026-11-20");
  assert.equal(after?.notes, "带上上季度数据");
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "completed");
});

test("an old revision or an old hash returns CARD_REVISION_CHANGED with the latest card", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("约山本吃饭");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-21" }, targetId: todo.id }]);
  const current = await kit.tasks.get({ actorId: ACTOR, taskId: todo.id });
  await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: current!.updatedAt, idempotencyKey: "rename", now: kit.now(), patch: { title: "约山本吃午饭" }, taskId: todo.id });
  await decide(kit, card, "confirm", "decision:app");
  const stale = await decide(kit, card, "confirm", "decision:web", { payloadHash: card.payloadHash, revision: 1 });
  assert.equal(stale?.outcome, "refused");
  assert.equal(stale?.reason, "CARD_REVISION_CHANGED");
  assert.equal(stale?.revision, 2);
  const latest = (await kit.runtime.getAction(card.actionId))!;
  const wrongHash = await decide(kit, latest, "confirm", "decision:web-2", { payloadHash: card.payloadHash, revision: 2 });
  assert.equal(wrongHash?.reason, "CARD_REVISION_CHANGED");
  const preview = agentCardPreview(latest, await kit.runtime.getRun(latest.runId), kit.now());
  assert.equal(preview.revision, 2);
  assert.deepEqual(preview.revisions.map((item) => item.revision), [1]);
  assert.match(preview.operations[0].text, /约山本吃午饭/u);
  assert.equal(kit.executorCalls.length, 0);
});

test("the SHA-256 card hash changes when only the visible text changes", () => {
  const operations = [{ after: { title: "A" }, capability: "todo.create", compensation: { supported: false }, executorKey: "todo.create", idempotencyKey: "k", operationId: "op1", operationType: "create_todo" as const, payload: { title: "A" }, payloadVersion: 1, preview: "新增待办「A」", riskLevel: "write" as const }];
  const base = cardPayloadHash({ operations, preview: "新增待办「A」", revision: 1, title: "新增一条待办" });
  assert.match(base, /^sha256:[0-9a-f]{64}$/u);
  assert.notEqual(cardPayloadHash({ operations, preview: "新增待办「A」！", revision: 1, title: "新增一条待办" }), base);
  assert.notEqual(cardPayloadHash({ operations: [{ ...operations[0], preview: "新增待办「A」，计划日 11月30日" }], preview: "新增待办「A」", revision: 1, title: "新增一条待办" }), base);
  assert.notEqual(cardPayloadHash({ operations, preview: "新增待办「A」", revision: 2, title: "新增一条待办" }), base);
});
