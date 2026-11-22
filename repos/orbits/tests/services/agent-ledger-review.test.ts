import assert from "node:assert/strict";
import test from "node:test";

import { cardOperationStatus } from "../../features/agent/runtime/decision";
import type { AgentActionExecutor } from "../../features/agent/runtime/executor-registry";
import { AgentExecutionOutcomeUnknownError } from "../../features/agent/runtime/service";
import { createCardKit, decide, freeze, type CardKit } from "./agent-ledger-card-kit";

/**
 * agent-design AG02-5: an item whose outcome is unknown goes to review (receipt needs_review) and is
 * not retried automatically. Retry reuses the original operation key (the to-do is not created
 * twice), mark_done records user_confirmed without calling the executor, abandon records
 * abandoned and skips the items depending on it.
 */

/** Plays an outcome script per call: "unknown_after_write", "unknown_before_write" or "ok". */
function scripted(script: string[]) {
  return (executor: AgentActionExecutor): AgentActionExecutor => ({
    ...executor,
    async execute(payload, context) {
      const step = script.shift() ?? "ok";
      if (step === "unknown_before_write") throw new AgentExecutionOutcomeUnknownError("connection reset before the answer");
      const result = await executor.execute(payload, context);
      if (step === "unknown_after_write") throw new AgentExecutionOutcomeUnknownError("connection reset after the write");
      return result;
    },
  });
}

async function statusOf(kit: CardKit, actionId: string, operationId: string) {
  const action = (await kit.runtime.getAction(actionId))!;
  return cardOperationStatus(operationId, action, await kit.runtime.getRun(action.runId));
}

test("an unknown outcome is not retried automatically; retry keeps the operation key and the to-do exists once", async () => {
  const kit = createCardKit({ wrapExecutor: scripted(["unknown_after_write", "ok"]) });
  const card = await freeze(kit, [{ capability: "todo.create", set: { plannedDate: "2026-11-19", title: "寄出合同原件" } }]);
  const operationId = card.operations[0].operationId;
  await decide(kit, card, "confirm", "decision:confirm");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal(await statusOf(kit, card.actionId, operationId), "needs_review");
  const receipts = (await kit.runtime.getRun(card.runId))!.receipts;
  assert.deepEqual(receipts.map((receipt) => receipt.status), ["needs_review"]);
  // A later worker pass does not pick it up again.
  kit.advance(60 * 60_000);
  const idle = await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal(idle.processed, 0);
  assert.equal(kit.executorCalls.length, 1);

  const current = (await kit.runtime.getAction(card.actionId))!;
  const retried = await decide(kit, current, "retry", "decision:retry", { operationId });
  assert.equal(retried?.outcome, "accepted");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal(await statusOf(kit, card.actionId, operationId), "succeeded");
  assert.deepEqual(kit.executorCalls.map((call) => call.idempotencyKey), [card.operations[0].idempotencyKey, card.operations[0].idempotencyKey]);
  assert.equal((await kit.listTasks()).filter((task) => task.title === "寄出合同原件").length, 1);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "completed");
});

test("mark_done records user_confirmed and never calls the executor", async () => {
  const kit = createCardKit({ wrapExecutor: scripted(["unknown_after_write"]) });
  const card = await freeze(kit, [{ capability: "todo.create", set: { plannedDate: "2026-11-16", title: "给打印机换墨盒" } }]);
  const operationId = card.operations[0].operationId;
  await decide(kit, card, "confirm", "decision:confirm");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const callsBefore = kit.executorCalls.length;
  const marked = await decide(kit, (await kit.runtime.getAction(card.actionId))!, "mark_done", "decision:done", { operationId });
  assert.equal(marked?.outcome, "accepted");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal(kit.executorCalls.length, callsBefore, "no executor call after mark_done");
  assert.equal(await statusOf(kit, card.actionId, operationId), "user_confirmed");
  const receipts = (await kit.runtime.getRun(card.runId))!.receipts.map((receipt) => receipt.status);
  assert.deepEqual(receipts.sort(), ["needs_review", "user_confirmed"]);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "completed");
});

test("abandon records abandoned; the item depending on it is skipped; the data does not change", async () => {
  const kit = createCardKit({ wrapExecutor: scripted(["unknown_before_write", "unknown_before_write"]) });
  const card = await freeze(kit, [
    { capability: "todo.create", set: { plannedDate: "2026-11-20", title: "预约牙医" } },
    { capability: "todo.create", set: { title: "预约后提醒家人" } },
  ]);
  // The second item depends on the first (a property AG06 sets from the plan; set here directly).
  const [first, second] = card.operations;
  const withDependency = { ...card, operations: [first, { ...second, dependsOn: [first.operationId] }] };
  await kit.repository.saveAction(withDependency);
  await decide(kit, withDependency, "confirm", "decision:confirm");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal(await statusOf(kit, card.actionId, first.operationId), "needs_review");
  assert.equal(await statusOf(kit, card.actionId, second.operationId), "pending", "waits for its prerequisite");

  await decide(kit, (await kit.runtime.getAction(card.actionId))!, "retry", "decision:retry", { operationId: first.operationId });
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal(await statusOf(kit, card.actionId, first.operationId), "needs_review", "still unknown after the retry");

  const abandoned = await decide(kit, (await kit.runtime.getAction(card.actionId))!, "abandon", "decision:abandon", { operationId: first.operationId });
  assert.equal(abandoned?.outcome, "accepted");
  assert.equal(await statusOf(kit, card.actionId, first.operationId), "abandoned");
  assert.equal(await statusOf(kit, card.actionId, second.operationId), "skipped");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal((await kit.listTasks()).length, 0);
  assert.equal(kit.executorCalls.length, 2);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "canceled", "every item given up: the user stopped this card");
});

test("an item that is not under review cannot be retried, marked done or abandoned", async () => {
  const kit = createCardKit();
  const card = await freeze(kit, [{ capability: "todo.create", set: { title: "整理发票" } }]);
  await decide(kit, card, "confirm", "decision:confirm");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const result = await decide(kit, (await kit.runtime.getAction(card.actionId))!, "mark_done", "decision:done", { operationId: card.operations[0].operationId });
  assert.equal(result?.outcome, "refused");
  assert.equal(result?.reason, "OPERATION_NOT_IN_REVIEW");
});
