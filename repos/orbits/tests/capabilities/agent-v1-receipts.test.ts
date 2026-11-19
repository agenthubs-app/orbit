import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_V1_CARD_EXECUTOR_KEYS } from "../../features/agent/capabilities/contract";
import type { AgentActionExecutor } from "../../features/agent/runtime/executor-registry";
import { AgentExecutionPermanentError } from "../../features/agent/runtime/service";
import { cardOperationStatus } from "../../features/agent/runtime/decision";
import { cardWriteExecutors } from "../../features/agent-v1/domains/writes";
import { agentCardPreview } from "../../features/agent/runtime/card-view";
import { handleCardDecision, receiptSummary } from "../../features/agent/ledger/card-routes";
import { ACTOR, createCardKit, decide, freeze, type CardKit } from "../services/agent-ledger-card-kit";

/**
 * agent-design AG06-4 (设计稿 §5.1, §5.2, 附录 D): one card, several items, a receipt per item.
 * - An item that waits for another (the user said so, AE-XL-008) is skipped when that one fails; the
 *   whole card is failed when nothing succeeded.
 * - A permanent failure is not retried (AE-XL-007 fail_always); a passing one is retried with the same
 *   operation key, and a memo is never written twice.
 * - Some items succeeding and some failing is a partially failed card; a succeeded item is never redone.
 * - The card's count sentence and the item that waits are written by code, in the frozen payload.
 */

const interaction = { actualContactIds: ["contact:c17"], channel: "phone" as const, direction: "incoming" as const, occurredOn: "2026-11-15", precision: "day" as const };
const memoIntent = (dependsOn?: number[]) => ({ capability: "memo.create" as const, partId: "p3", set: { body: "他今天来过电话", contactIds: ["contact:c17"], interaction, names: { "contact:c17": "小林健" }, title: "他今天来过电话" }, ...(dependsOn ? { dependsOn } : {}) });

function failing(key: string, mode: "always" | "once", seen: string[]): (executor: AgentActionExecutor) => AgentActionExecutor {
  let failures = 0;
  return (executor) => (executor.key !== key ? executor : {
    ...executor,
    async execute(payload, context) {
      seen.push(context.idempotencyKey);
      if (mode === "always") throw new AgentExecutionPermanentError("simulated permanent failure");
      if (failures === 0) {
        failures += 1;
        throw new Error("simulated passing failure");
      }
      return executor.execute(payload, context);
    },
  });
}

async function statuses(kit: CardKit, actionId: string) {
  const action = (await kit.runtime.getAction(actionId))!;
  const detail = await kit.runtime.getRun(action.runId);
  return { card: action.status, items: action.operations.map((op) => cardOperationStatus(op.operationId, action, detail)) };
}

test("the card executors are exactly the registered card keys, one adapter each", () => {
  const unused = async () => { throw new Error("unused"); };
  // AG13: with the private-event, «我去过» and schedule services and the to-do verbs, every registered key has its adapter.
  // AG14: and with the memory service, the three memory items.
  const keys = cardWriteExecutors({ actorId: ACTOR, memory: {} as never, events: { attendance: {} as never, privateEvents: {} as never, schedule: {} as never }, notes: { create: unused, update: unused }, tasks: { complete: unused, create: unused, delete: unused, get: async () => null, reopen: unused, update: unused }, contacts: { access: { findDeleted: async () => [], listActive: async () => [], read: async () => null }, deletes: null, imports: null, manual: null, store: { getRecord: async () => null }, workspaceId: "w" }, rules: { automations: { create: unused, get: async () => null, remove: unused, update: unused } } }).map((executor) => executor.key);
  assert.deepEqual(keys.sort(), [...AGENT_V1_CARD_EXECUTOR_KEYS].sort());
});

test("the second item waits for the first: the first fails for good, the second is skipped, nothing is written, the card failed", async () => {
  const seen: string[] = [];
  const kit = createCardKit({ wrapExecutor: failing("memo.create", "always", seen) });
  const todo = await kit.todo("给小林发修订报价", "2026-11-18");
  const card = await freeze(kit, [memoIntent(), { capability: "todo.update", dependsOn: [0], partId: "p2", set: { plannedDate: "2026-11-20" }, targetId: todo.id }]);
  assert.deepEqual(card.operations[1].dependsOn, [card.operations[0].operationId]);
  assert.match(card.operations[1].preview, /第1项成功后才执行/u, "the card says the second item waits for the first");
  assert.equal(card.title, "修改1项，新增1项");
  const decision = await decide(kit, card, "confirm", "decision:1");
  assert.equal(decision?.accepted, true);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.deepEqual(await statuses(kit, card.actionId), { card: "failed", items: ["failed", "skipped"] });
  assert.equal(seen.length, 1, "a permanent failure is tried once");
  kit.advance(60 * 60 * 1000);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal(seen.length, 1, "and never again");
  assert.equal(kit.executorCalls.filter((call) => call.key === "todo.update").length, 0, "the skipped item never ran");
  assert.equal((await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))?.plannedDate, "2026-11-18");
  assert.equal((await kit.notes.list({ actorId: ACTOR })).length, 0);
});

test("independent items: the to-do changes, the memo fails for good — partially failed; the succeeded item is not redone", async () => {
  const seen: string[] = [];
  const kit = createCardKit({ wrapExecutor: failing("memo.create", "always", seen) });
  const todo = await kit.todo("给小林发修订报价", "2026-11-18");
  const card = await freeze(kit, [{ capability: "todo.update", partId: "p2", set: { plannedDate: "2026-11-20" }, targetId: todo.id }, memoIntent()]);
  await decide(kit, card, "confirm", "decision:1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.deepEqual(await statuses(kit, card.actionId), { card: "partially_failed", items: ["succeeded", "failed"] });
  kit.advance(60 * 60 * 1000);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal(kit.executorCalls.filter((call) => call.key === "todo.update").length, 1, "the succeeded item ran once");
  assert.equal((await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))?.plannedDate, "2026-11-20");
  const action = (await kit.runtime.getAction(card.actionId))!;
  const preview = agentCardPreview(action, await kit.runtime.getRun(action.runId), kit.now());
  assert.equal(receiptSummary(preview, "zh"), "执行结果：第 1 项已完成；第 2 项没能完成（不会自动重试）。", "code says item by item; never 'all done'");
});

test("the receipt sentence through the decision route: a skipped item says why (zh, ja, en)", async () => {
  const kit = createCardKit({ wrapExecutor: failing("memo.create", "always", []) });
  const todo = await kit.todo("给小林发修订报价", "2026-11-18");
  const card = await freeze(kit, [memoIntent(), { capability: "todo.update", dependsOn: [0], partId: "p2", set: { plannedDate: "2026-11-20" }, targetId: todo.id }]);
  const result = await handleCardDecision({ actionId: card.actionId, body: { clientDecisionId: "d1", payloadHash: card.payloadHash, revision: 1, transition: "confirm" }, now: kit.now, processNow: true, runtime: kit.runtime, workerId: "test" });
  const message = String(((result.body.data as Record<string, unknown>).decision as { message: string }).message);
  assert.match(message, /第 1 项没能完成（不会自动重试）；第 2 项因为它要等的那一项没成功，没有执行。$/u);
  const action = (await kit.runtime.getAction(card.actionId))!;
  const preview = agentCardPreview(action, await kit.runtime.getRun(action.runId), kit.now());
  assert.match(receiptSummary(preview, "ja"), /^結果：1 件目は完了できませんでした/u);
  assert.match(receiptSummary(preview, "en"), /^Result: item 1 could not be done .*item 2 skipped/u);
});

test("a passing failure is retried with the same operation key and makes one memo", async () => {
  const seen: string[] = [];
  const kit = createCardKit({ wrapExecutor: failing("memo.create", "once", seen) });
  const card = await freeze(kit, [memoIntent()]);
  await decide(kit, card, "confirm", "decision:1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.deepEqual((await statuses(kit, card.actionId)).items, ["pending"], "waiting for its retry");
  kit.advance(31_000);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.deepEqual(await statuses(kit, card.actionId), { card: "completed", items: ["succeeded"] });
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1], "the retry uses the original operation key");
  const notes = await kit.notes.list({ actorId: ACTOR });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].autoExtraction, "suppressed");
  assert.deepEqual(notes[0].interaction?.actualContactIds, ["contact:c17"]);
});

test("the same memo key run twice (a lost receipt) gives the first memo back, not a second one", async () => {
  const kit = createCardKit();
  const [memo] = cardWriteExecutors({ actorId: ACTOR, notes: kit.notes, tasks: null });
  const payload = { autoExtraction: "suppressed", body: "小林今天来过电话", contactIds: ["contact:c17"], interaction, title: "小林今天来过电话" };
  const context = { actionId: "a", idempotencyKey: "action:x:r1:op1", now: kit.now(), operationId: "op1", runId: "r" };
  const first = await memo.execute(payload, context);
  const second = await memo.execute(payload, { ...context, now: kit.now() });
  assert.equal(second.resultRef, first.resultRef);
  assert.equal((await kit.notes.list({ actorId: ACTOR })).length, 1);
});

test("taking an item off the card freezes the rest again (revision 2, the count follows) and only that item runs", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("给小林发修订报价", "2026-11-18");
  const card = await freeze(kit, [{ capability: "todo.update", partId: "p2", set: { plannedDate: "2026-11-20" }, targetId: todo.id }, memoIntent()]);
  const edited = await kit.runtime.editCard!({ actionId: card.actionId, payloadHash: card.payloadHash!, removeOperationId: card.operations[1].operationId, revision: 1 });
  assert.equal(edited?.outcome, "edited");
  const latest = (await kit.runtime.getAction(card.actionId))!;
  assert.equal(latest.revision, 2);
  assert.equal(latest.title, "修改1项");
  assert.deepEqual(latest.operations.map((op) => op.capability), ["todo.update"]);
  const stale = await kit.runtime.editCard!({ actionId: card.actionId, payloadHash: card.payloadHash!, removeOperationId: card.operations[0].operationId, revision: 1 });
  assert.equal(stale?.reason, "CARD_REVISION_CHANGED", "an edit from the old version is refused");
  assert.equal((await decide(kit, latest, "confirm", "decision:1"))?.accepted, true);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal((await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))?.plannedDate, "2026-11-20");
  assert.equal((await kit.notes.list({ actorId: ACTOR })).length, 0, "the removed memo is never written");
});
