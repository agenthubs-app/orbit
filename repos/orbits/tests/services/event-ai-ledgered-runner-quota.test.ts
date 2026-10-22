import assert from "node:assert/strict";
import test from "node:test";

import type { AiQuotaGate } from "../../features/ai-quota/gate";
import { AI_QUOTA_MONTHLY_LIMITS, AI_QUOTA_PURPOSE_POOLS } from "../../features/ai-quota/constants";
import { createLedgeredRunner } from "../../features/events/journey/ledgered-runner";

// LF4: the registration persona / self-introduction used to bill on every submit with no cap; it now has a monthly
// limit and the runner sends nothing once the ledger says the quota is used up. LF13: an unavailable ledger refuses too.
function gate(reservation: unknown): AiQuotaGate {
  return { reserve: async () => reservation, beginCall: async () => ({ callId: "c" }), endCall: async () => undefined, finish: async () => undefined } as unknown as AiQuotaGate;
}

test("LF4: the registration interview purpose has a monthly limit in the system pool", () => {
  assert.equal(AI_QUOTA_MONTHLY_LIMITS.event_registration_interview, 30);
  assert.equal(AI_QUOTA_PURPOSE_POOLS.event_registration_interview, "system");
});

test("LF4: a used-up quota sends no model request", async () => {
  let calls = 0;
  const runner = createLedgeredRunner({ actorId: "a", purpose: "event_registration_interview", idempotencyKey: "k",
    gate: gate({ ok: false, reason: "monthly_limit", limit: "monthly" }),
    runner: (async () => { calls += 1; return { success: true, data: { text: "x" } }; }) as never });
  const result = await runner.run({ prompt: "p" } as never) as unknown as { success: boolean; retryable: boolean };
  assert.equal(calls, 0);
  assert.equal(result.success, false);
  assert.equal(result.retryable, false);
});

test("LF13: an unavailable ledger refuses the call (it used to run unledgered, A5)", async () => {
  for (const unavailable of [gate({ ok: false, reason: "disabled" }), gate({ ok: true, operationId: "op", owner: false, status: "reserved" }), { ...gate(null), reserve: async () => { throw new Error("check constraint"); } } as unknown as AiQuotaGate]) {
    let calls = 0;
    const runner = createLedgeredRunner({ actorId: "a", purpose: "event_registration_question", idempotencyKey: "k", gate: unavailable, refuseWithoutLedger: true,
      runner: (async () => { calls += 1; return { success: true, data: { text: "x" } }; }) as never });
    const result = await runner.run({ prompt: "p" } as never) as unknown as { success: boolean };
    assert.equal(calls, 0);
    assert.equal(result.success, false);
    assert.equal(runner.refusal(), "unavailable");
  }
});

test("LF13: a used-up quota reports quota; no ledger injected (tests, local mock) still runs", async () => {
  const quota = createLedgeredRunner({ actorId: "a", purpose: "event_registration_question", idempotencyKey: "k", gate: gate({ ok: false, reason: "daily_limit", limit: "purpose" }), runner: (async () => ({ success: true })) as never });
  await quota.run({ prompt: "p" } as never);
  assert.equal(quota.refusal(), "quota");
  let calls = 0;
  const none = createLedgeredRunner({ actorId: "a", purpose: "event_registration_question", idempotencyKey: "k", gate: null, runner: (async () => { calls += 1; return { success: true, text: "x" }; }) as never });
  await none.run({ prompt: "p" } as never);
  assert.equal(calls, 1);
  assert.equal(none.refusal(), null);
});

test("LF13: interview questions are their own purpose — 40 a Tokyo day, system pool", async () => {
  const { AI_QUOTA_DAILY_PURPOSE_LIMITS } = await import("../../features/ai-quota/constants");
  assert.equal(AI_QUOTA_DAILY_PURPOSE_LIMITS.event_registration_question, 40);
  assert.equal(AI_QUOTA_PURPOSE_POOLS.event_registration_question, "system");
});
