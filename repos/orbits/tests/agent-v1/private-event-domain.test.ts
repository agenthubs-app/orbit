import assert from "node:assert/strict";
import test from "node:test";

import { AgentExecutionPermanentError } from "../../features/agent/runtime/service";
import type { AgentActionExecutor } from "../../features/agent/runtime/executor-registry";
import { cardOperationStatus } from "../../features/agent/runtime/decision";
import { agentCardPreview } from "../../features/agent/runtime/card-view";
import { receiptSummary } from "../../features/agent/ledger/card-routes";
import { arrangeEventItems } from "../../features/agent-v1/graph/nodes/propose";
import { ATTENDANCE_COLLECTION, PRIVATE_EVENT_COLLECTION } from "../../features/events/private-events/records";
import { ACTOR, createCardKit, decide, freeze, type CardKit } from "../services/agent-ledger-card-kit";

/**
 * agent-design AG13-1 (设计稿 §4, §5.1, §5.2; PLANNER 易错边界 1): one card creates a private event and records «我去过» on
 * it. The second item points at the first (`localCreateRef: 1`) and waits for it; the runtime puts in the created event's id
 * only after the first item succeeded. The first failing for good skips the second: nothing is left. A replay writes nothing
 * more.
 */

const createEvent = { capability: "privateEvent.create" as const, partId: "p1", set: { startsAt: "2026-11-14T10:00:00.000Z", title: "大学同学聚会", venue: "新宿" } };
const attend = { capability: "attendance.create" as const, dependsOn: [0], partId: "p1", set: { attendedOn: "2026-11-14", dayParts: ["evening" as const], eventRef: { kind: "private" as const, localCreateRef: 1 } }, shown: { event: { kind: "private" as const, startsAt: null, title: "大学同学聚会" } } };

async function items(kit: CardKit, actionId: string) {
  const action = (await kit.runtime.getAction(actionId))!;
  const detail = await kit.runtime.getRun(action.runId);
  return { card: action.status, items: action.operations.map((op) => cardOperationStatus(op.operationId, action, detail)), preview: agentCardPreview(action, detail, kit.now()) };
}

const listOf = async (kit: CardKit, collectionName: string) => kit.store.listRecords({ collectionName, limit: "unbounded", userId: ACTOR, workspaceId: kit.workspaceId });

function failingAlways(key: string): (executor: AgentActionExecutor) => AgentActionExecutor {
  return (executor) => (executor.key !== key ? executor : { ...executor, async execute() { throw new AgentExecutionPermanentError("simulated permanent failure"); } });
}

test("the card: two new items; the second names the first's event and says it waits for it (zh / en)", async () => {
  const kit = createCardKit();
  const card = await freeze(kit, [createEvent, attend]);
  assert.equal(card.title, "新增2项");
  assert.deepEqual(card.operations[1].dependsOn, [card.operations[0].operationId]);
  assert.deepEqual(card.operations[1].after?.eventRef, { kind: "private", localCreateRef: 1 }, "no id before the event exists");
  assert.equal(card.operations[0].display?.record, "私人活动「大学同学聚会」");
  assert.match(card.operations[0].display!.rows.find((row) => row.field === "startsAt")!.after, /11月14日（周六）19:00/u);
  assert.equal(card.operations[1].display?.record, "我去过（自己记的）");
  assert.equal(card.operations[1].display?.rows[0].after, "上面第 1 项新建的这场");
  assert.match(card.operations[1].display!.note!, /第 1 项建好后才记这一项；第 1 项没建成，这项也不记。/u);
  assert.match(card.operations[1].display!.note!, /不会替你签到或报名/u);
  const en = await freeze(kit, [createEvent, attend], "action:en", "en");
  assert.match(en.operations[1].display!.note!, /Recorded only after item 1 is created/u);
});

test("after the click: the event is created, then «我去过» on it with its real id; a replay writes nothing more", async () => {
  const kit = createCardKit();
  const card = await freeze(kit, [createEvent, attend]);
  await decide(kit, card, "confirm", "d1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const state = await items(kit, card.actionId);
  assert.deepEqual([state.card, ...state.items], ["completed", "succeeded", "succeeded"]);
  const events = await listOf(kit, PRIVATE_EVENT_COLLECTION);
  const notes = await listOf(kit, ATTENDANCE_COLLECTION);
  assert.equal(events.length, 1);
  assert.equal(notes.length, 1);
  assert.deepEqual(notes[0].payload.eventRef, { id: events[0].recordId, kind: "private" }, "localCreateRef became the new event's id");
  assert.equal(notes[0].payload.attendedOn, "2026-11-14");
  // Replaying the outbox and the decision changes nothing.
  kit.advance(60_000);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  await decide(kit, card, "confirm", "d1");
  assert.equal((await listOf(kit, PRIVATE_EVENT_COLLECTION)).length, 1);
  assert.equal((await listOf(kit, ATTENDANCE_COLLECTION)).length, 1);
  assert.equal(kit.executorCalls.filter((call) => call.key === "attendance.create").length, 1);
});

test("the event item fails for good: «我去过» is skipped, nothing at all is written, the receipt says it item by item", async () => {
  const kit = createCardKit({ wrapExecutor: failingAlways("privateEvent.create") });
  const card = await freeze(kit, [createEvent, attend]);
  await decide(kit, card, "confirm", "d1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  kit.advance(60 * 60 * 1000);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const state = await items(kit, card.actionId);
  assert.deepEqual([state.card, ...state.items], ["failed", "failed", "skipped"]);
  assert.equal((await listOf(kit, PRIVATE_EVENT_COLLECTION)).length, 0);
  assert.equal((await listOf(kit, ATTENDANCE_COLLECTION)).length, 0, "no note left without its event");
  assert.equal(kit.executorCalls.filter((call) => call.key === "attendance.create").length, 0);
  assert.match(receiptSummary(state.preview, "en"), /item 1 could not be done.*item 2 skipped, because the item it waits for did not succeed/u);
});

test("an attendance item never runs with a local ref left (its event has no receipt): it fails, nothing written", async () => {
  const kit = createCardKit();
  // No dependsOn: the runtime would run it at once; the reference it cannot resolve fails it instead of writing.
  const card = await freeze(kit, [{ ...attend, dependsOn: undefined }]);
  await decide(kit, card, "confirm", "d1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.deepEqual((await items(kit, card.actionId)).items, ["failed"]);
  assert.equal((await listOf(kit, ATTENDANCE_COLLECTION)).length, 0);
});

test("card order: a private event's deletion goes last; «我去过» on a new event points at its position and waits for it", () => {
  const owners = ["a", "b", "c", "d"].map((localId) => ({ localId })) as never[];
  const intents = [
    { capability: "privateEvent.delete", localIdOfItem: "w1:delete", partId: "p1", targetId: "private_event:x" },
    { capability: "attendance.delete", localIdOfItem: "w2", partId: "p2", targetId: "attendance:y" },
    { capability: "privateEvent.create", localIdOfItem: "w3", partId: "p3", set: { title: "聚会" } },
    { capability: "attendance.create", localIdOfItem: "w4", partId: "p3", set: { eventRef: { kind: "private", localCreateRef: "w3" } } },
  ] as never[];
  arrangeEventItems(intents, owners);
  assert.deepEqual((intents as { capability: string }[]).map((intent) => intent.capability), ["attendance.delete", "privateEvent.create", "attendance.create", "privateEvent.delete"]);
  assert.deepEqual((intents[2] as { set: { eventRef: unknown } }).set.eventRef, { kind: "private", localCreateRef: 2 });
  assert.deepEqual((intents[2] as { dependsOn: number[] }).dependsOn, [1]);
  assert.ok(!(intents as Record<string, unknown>[]).some((intent) => "localIdOfItem" in intent));
  assert.deepEqual((owners as { localId: string }[]).map((owner) => owner.localId), ["b", "c", "d", "a"]);
});
