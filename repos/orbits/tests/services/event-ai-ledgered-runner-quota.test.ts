import assert from "node:assert/strict";
import test from "node:test";

import type { AiQuotaGate } from "../../features/ai-quota/gate";
import { AI_QUOTA_MONTHLY_LIMITS, AI_QUOTA_PURPOSE_POOLS } from "../../features/ai-quota/constants";
import { createLedgeredRunner } from "../../features/events/journey/ledgered-runner";

// LF4: the registration persona / self-introduction used to bill on every submit with no cap; it now has a monthly
// limit and the runner sends nothing once the ledger says the quota is used up (a missing ledger still runs, A5).
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

test("LF4: an unavailable ledger still runs (bookkeeping never blocks a shipped feature)", async () => {
  let calls = 0;
  const runner = createLedgeredRunner({ actorId: "a", purpose: "event_registration_interview", idempotencyKey: "k",
    gate: gate({ ok: false, reason: "disabled" }),
    runner: (async () => { calls += 1; return { success: true, data: { text: "x" } }; }) as never });
  await runner.run({ prompt: "p" } as never);
  assert.equal(calls, 1);
});
