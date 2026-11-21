import assert from "node:assert/strict";
import test from "node:test";

import { agentCardPreview } from "../../../features/agent/runtime/card-view";
import { AgentExecutionOutcomeUnknownError } from "../../../features/agent/runtime/service";
import { runWithConfirmBoundary } from "../../../features/agent-v1/entry/confirm-boundary";
import { AgentProposalsPausedError, agentProposalsPaused, isProposalsPausedError, pausedWords, readAgentProposalsState } from "../../../features/agent-v1/rollout/rollback";
import { reconcileList } from "../../../features/agent-v1/rollout/reconcile";
import { createCardKit, decide, freeze } from "../../services/agent-ledger-card-kit";
import { mcpKit } from "../mcp/kit";

/**
 * agent-design AG18-3: the rollback switch (ORBIT_AGENT_V1_PROPOSALS=paused). No entry makes a new card; a waiting card
 * cannot be confirmed ("这项修改现在没有执行"); the queue claims nothing (approved items stay, unknown outcomes stay in
 * review); done cards keep their receipts; typed "确认" writes nothing; restoring goes on with the same operation keys
 * and no second effect.
 */

async function paused<T>(run: () => Promise<T>): Promise<T> {
  const before = process.env.ORBIT_AGENT_V1_PROPOSALS;
  process.env.ORBIT_AGENT_V1_PROPOSALS = "paused";
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.ORBIT_AGENT_V1_PROPOSALS;
    else process.env.ORBIT_AGENT_V1_PROPOSALS = before;
  }
}

test("the switch: open unless set to paused (case and spaces do not matter)", () => {
  assert.equal(readAgentProposalsState({}), "open");
  assert.equal(readAgentProposalsState({ ORBIT_AGENT_V1_PROPOSALS: " Paused " }), "paused");
  assert.equal(readAgentProposalsState({ ORBIT_AGENT_V1_PROPOSALS: "off" }), "open");
  assert.equal(agentProposalsPaused({ ORBIT_AGENT_V1_PROPOSALS: "paused" }), true);
  assert.equal(isProposalsPausedError(new AgentProposalsPausedError()), true);
  assert.equal(isProposalsPausedError(new Error("other")), false);
});

test("paused: no card is frozen from a conversation, a scheduled task or an external connection", async () => {
  const kit = createCardKit();
  const task = await kit.todo("给李薇寄样片", "2026-11-10");
  const intents = [{ capability: "todo.update", set: { plannedDate: "2026-11-21" }, targetId: task.id }] as never;
  await paused(async () => {
    for (const origin of [
      { conversationId: "session:a", kind: "conversation", requestId: "request:a" },
      { firedAt: "2026-11-20T00:00:00.000Z", kind: "automation", ruleId: "rule:a" },
      { connectionId: "connection:a", externalRequestKey: "k1", kind: "connection" },
    ] as const) {
      await assert.rejects(kit.runtime.freezeCard!({ actionId: `action:paused:${origin.kind}`, intents, locale: "zh", origin: origin as never }), (error: unknown) => isProposalsPausedError(error));
    }
  });
  assert.equal((await kit.runtime.listActions({})).length, 0);
  assert.equal((await kit.tasks.get({ actorId: "user_agent_ledger_a", taskId: task.id }))?.plannedDate, "2026-11-10");
});

test("paused: the MCP propose_change makes no card and says so (tool error proposals_paused)", async () => {
  const kit = mcpKit();
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const tokens = await kit.connect({ scopes: ["todos:read", "todos:propose"] });
  const answer = await paused(() => kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "rollback-1", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }] }));
  assert.equal(JSON.stringify(answer).includes("proposals_paused"), true, JSON.stringify(answer));
  assert.equal((await kit.cards.runtime.listActions({})).length, 0);
});

test("paused: a waiting card is not carried out by its button; rejecting it still works; nothing is written", async () => {
  const kit = createCardKit();
  const task = await kit.todo("给李薇寄样片", "2026-11-10");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-21" }, targetId: task.id }] as never);
  const refused = await paused(() => decide(kit, card, "confirm", "decision:paused-1"));
  assert.equal(refused?.outcome, "refused");
  assert.equal(refused?.reason, "PROPOSALS_PAUSED");
  assert.equal(refused?.message, pausedWords("zh").click);
  assert.match(refused!.message, /这项修改现在没有执行/u);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "awaiting_confirmation");
  assert.equal(kit.executorCalls.length, 0);
  assert.equal((await kit.tasks.get({ actorId: "user_agent_ledger_a", taskId: task.id }))?.plannedDate, "2026-11-10");
  // A card revision (regenerate, edit, recheck, revise) is a new proposal too.
  await paused(() => assert.rejects(kit.runtime.recheckCard!({ actionId: card.actionId }), (error: unknown) => isProposalsPausedError(error)));
  const rejected = await paused(() => decide(kit, card, "reject", "decision:paused-2"));
  assert.equal(rejected?.outcome, "accepted");
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "rejected");
});

test("paused: approved items stay in the queue; restored, they run once with the same keys (no second effect)", async () => {
  const kit = createCardKit();
  const task = await kit.todo("更新报价模板", "2026-11-10");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-30" }, targetId: task.id }] as never);
  const accepted = await decide(kit, card, "confirm", "decision:approve-1");
  assert.equal(accepted?.outcome, "accepted");
  const stalled = await paused(() => kit.runtime.processOutbox({ limit: 20, workerId: "test" }));
  assert.equal(stalled.processed, 0);
  assert.equal(kit.executorCalls.length, 0);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "approved");
  const items = await paused(() => reconcileList(kit.runtime, kit.now()));
  assert.equal(items.find((item) => item.actionId === card.actionId)?.group, "approved_not_run");
  assert.ok(items.find((item) => item.actionId === card.actionId)?.approval.approvedAt);
  const keys = items.find((item) => item.actionId === card.actionId)!.operations[0].idempotencyKeys;
  assert.equal(keys.length, 1);
  // Restored: it runs, with the key the reconcile list showed; running the queue again changes nothing.
  await kit.runtime.processOutbox({ limit: 20, workerId: "test" });
  await kit.runtime.processOutbox({ limit: 20, workerId: "test" });
  assert.equal(kit.executorCalls.length, 1);
  assert.equal(kit.executorCalls[0].idempotencyKey, keys[0]);
  assert.equal((await kit.tasks.get({ actorId: "user_agent_ledger_a", taskId: task.id }))?.plannedDate, "2026-11-30");
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "completed");
});

test("paused: a done card keeps its receipts; an unknown outcome stays in review; the reconcile list shows each kind", async () => {
  let unknownOnce = true;
  const kit = createCardKit({
    wrapExecutor: (executor) => ({ ...executor, execute: async (payload, context) => {
      if (unknownOnce && JSON.stringify(payload).includes("预订会议室")) {
        unknownOnce = false;
        throw new AgentExecutionOutcomeUnknownError("the write may or may not have happened");
      }
      return executor.execute(payload, context);
    } }),
  });
  const done = await freeze(kit, [{ capability: "todo.create", set: { plannedDate: "2026-11-30", title: "更新报价模板" } }] as never);
  await decide(kit, done, "confirm", "decision:done");
  await kit.runtime.processOutbox({ limit: 20, workerId: "test" });
  const unknown = await freeze(kit, [{ capability: "todo.create", set: { title: "预订会议室" } }] as never);
  await decide(kit, unknown, "confirm", "decision:unknown");
  await kit.runtime.processOutbox({ limit: 20, workerId: "test" });
  const waiting = await freeze(kit, [{ capability: "todo.create", set: { title: "寄样片" } }] as never);
  const items = await paused(async () => {
    const run = await kit.runtime.getRun(done.runId);
    const preview = agentCardPreview((await kit.runtime.getAction(done.actionId))!, run, kit.now());
    assert.equal(preview.status, "completed");
    assert.equal(preview.operations[0].status, "succeeded");
    return reconcileList(kit.runtime, kit.now());
  });
  const groupOf = (id: string) => items.find((item) => item.actionId === id)?.group;
  assert.equal(groupOf(done.actionId), "done");
  assert.equal(groupOf(unknown.actionId), "in_review");
  assert.equal(groupOf(waiting.actionId), "waiting");
  assert.ok(items.find((item) => item.actionId === done.actionId)!.operations[0].receipts.some((receipt) => receipt.status === "completed"));
});

test("paused: a bare typed 确认 while a card waits says nothing will be carried out, and decides nothing", async () => {
  const kit = createCardKit();
  const task = await kit.todo("给李薇寄样片", "2026-11-10");
  await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-21" }, targetId: task.id }] as never);
  // The kit's cards belong to the conversation session:test.
  const result = await paused(() => runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, { locale: "zh", message: "确认", requestId: "request:typed", run: async () => ({ reply: "不该调用", sourceRefs: [] }), sessionId: "session:test" }));
  assert.equal(result.modelCalled, false);
  assert.equal(result.text, pausedWords("zh").typedConfirm);
  assert.doesNotMatch(result.text, /已修改|已完成/u);
  assert.equal(kit.executorCalls.length, 0);
  assert.equal((await kit.tasks.get({ actorId: "user_agent_ledger_a", taskId: task.id }))?.plannedDate, "2026-11-10");
});
