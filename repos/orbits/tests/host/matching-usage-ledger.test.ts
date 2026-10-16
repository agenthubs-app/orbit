/** R17 A6：编组 AI 用量补记账本——每次尝试一条 system 池操作（1 次调用、token 照记），幂等键防重复，不设上限。 */
import assert from "node:assert/strict";
import test from "node:test";

import { AI_QUOTA_MAX_CALLS, AI_QUOTA_MONTHLY_LIMITS, AI_QUOTA_PURPOSE_POOLS } from "../../features/ai-quota/constants";
import { ledgerMatchingUsage } from "../../features/events/host/matching-usage";

test("matching usage is recorded once per attempt in the system pool", async () => {
  assert.deepEqual([AI_QUOTA_MAX_CALLS.event_matching, AI_QUOTA_PURPOSE_POOLS.event_matching, AI_QUOTA_MONTHLY_LIMITS.event_matching], [1, "system", undefined]);
  const rows = [{ attempt: 1, completion_tokens: 40, finished_at: "2026-10-07T01:00:00.000Z", generation_id: "g1", lease_epoch: 1, model: "m", organizer_actor_id: "actor:host", prompt_tokens: 120, provider: "deepseek", task_id: "t1" }];
  const executor = { query: async () => ({ rows }) } as never;
  const calls: string[] = [];
  const ledger = {
    beginCall: async (operationId: string) => { calls.push(`begin:${operationId}`); return { callId: `${operationId}#1` }; },
    endCall: async (callId: string, usage: { inputTokens: number; outputTokens: number }) => { calls.push(`end:${callId}:${usage.inputTokens}/${usage.outputTokens}`); },
    finish: async (operationId: string, outcome: string) => { calls.push(`finish:${operationId}:${outcome}`); },
    reserve: async (input: { idempotencyKey: string; pool: string; purpose: string; actorId: string }) => { calls.push(`reserve:${input.idempotencyKey}:${input.pool}:${input.purpose}:${input.actorId}`); return { ok: true, operationId: "op1", owner: true }; },
  } as never;
  assert.deepEqual(await ledgerMatchingUsage({ executor, ledger, now: new Date(), workspaceId: "w" }), { recorded: 1 });
  assert.deepEqual(calls, ["reserve:event_matching:g1:t1:1:1:system:event_matching:actor:host", "begin:op1", "end:op1#1:120/40", "finish:op1:succeeded"]);
});
