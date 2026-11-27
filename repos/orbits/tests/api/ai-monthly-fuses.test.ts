/**
 * 2026-11-27 隐藏月上限（用户定）：入口层的行为——用户主动点的（重新分析、草稿类）明确超限时不调用模型、回 429 和固定的码；
 * 后台的（笔记提取）静默顺延到下月 1 日；账本出问题不拦（fail-open）。账本的计数口径见
 * tests/capabilities/ai-usage-monthly-fuses-postgres.test.ts。不发任何真实模型请求。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createNetworkSnapshotRouteHandlers } from "../../app/api/network/snapshot/handlers";
import { createProfileIntroDraftHandler } from "../../app/api/profile/intro-draft/handler";
import { AI_MONTHLY_LIMIT_CODE, createDraftAssistRunner } from "../../features/ai-quota/draft-assist";
import type { AiQuotaGate, AiQuotaReservation, AiQuotaReserveInput } from "../../features/ai-quota/gate";
import { AiQuotaCallRejectedError } from "../../features/ai-quota/ledger";
import { createMockMemoExtractionProvider } from "../../features/contacts/memo-extraction/provider";
import { runMemoExtraction } from "../../features/contacts/memo-extraction/job";
import { createLiveRecordMemoExtractionStore } from "../../features/contacts/memo-extraction/store";
import type { runOrbitAgentModelText } from "../../features/orbit-ai/gemini-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const MONTHLY: AiQuotaReservation = { cap: 60, limit: "monthly", ok: false, reason: "monthly_limit", retryOn: "2026-11-30T15:00:00.000Z" };

function fakeGate(reply: AiQuotaReservation | Error, options: { beginError?: Error } = {}) {
  const log: string[] = [];
  const reserves: AiQuotaReserveInput[] = [];
  const gate: AiQuotaGate = {
    async reserve(input) { reserves.push(input); if (reply instanceof Error) throw reply; return reply; },
    async beginCall(operationId, call) { if (options.beginError) throw options.beginError; log.push(`begin:${call.provider}`); return { callId: `${operationId}#1` }; },
    async endCall(_callId, usage) { log.push(`end:${usage ? `${usage.inputTokens}/${usage.outputTokens}` : "none"}`); },
    async finish(_operationId, outcome) { log.push(`finish:${outcome}`); },
  };
  return { gate, log, reserves };
}

function fakeModel() {
  let calls = 0;
  const runner = (async () => {
    calls += 1;
    return { model: "fixture", provider: "deepseek", responseMetadata: { finishReason: "stop", providerResponseBytes: 1, usage: { cacheHitTokens: null, completionTokens: 9, promptTokens: 90, reasoningTokens: null } }, source: "env", success: true, text: "{}" };
  }) as unknown as typeof runOrbitAgentModelText;
  return { calls: () => calls, runner };
}

const silent = async <T>(run: () => Promise<T>): Promise<T> => {
  const original = console.warn;
  console.warn = () => undefined;
  try { return await run(); } finally { console.warn = original; }
};

test("draft_assist runner: one user-pool manual operation per generation, tokens recorded", async () => {
  const { gate, log, reserves } = fakeGate({ ok: true, operationId: "op", owner: true, status: "reserved" });
  const model = fakeModel();
  const ledgered = createDraftAssistRunner({ actorId: "alice", gate, kind: "email", runner: model.runner });
  await ledgered.run({ systemInstruction: "s", userText: "u" });
  await ledgered.run({ systemInstruction: "s", userText: "u" });
  await ledgered.finish("succeeded");
  assert.equal(reserves.length, 1, "one reservation for the whole generation");
  assert.deepEqual([reserves[0].pool, reserves[0].purpose, reserves[0].trigger], ["user", "draft_assist", "manual"]);
  assert.match(reserves[0].idempotencyKey, /^draft-assist:email:/u);
  assert.deepEqual(log, ["begin:configured", "end:90/9", "begin:configured", "end:90/9", "finish:succeeded"]);
  assert.equal(model.calls(), 2);
});

test("draft_assist runner: over the monthly limit no model call; a failing ledger never blocks (fail-open); max_calls still refuses", async () => {
  const limited = fakeModel();
  const refused = createDraftAssistRunner({ actorId: "alice", gate: fakeGate(MONTHLY).gate, kind: "intro", runner: limited.runner });
  const result = await silent(() => refused.run({ systemInstruction: "s", userText: "u" }));
  assert.equal(result.success, false);
  assert.equal(limited.calls(), 0);
  assert.equal(refused.refusal(), "quota");

  for (const gate of [fakeGate(new Error("db down")).gate, fakeGate({ ok: false, reason: "disabled" }).gate, fakeGate({ ok: true, operationId: "op", owner: true, status: "reserved" }, { beginError: new Error("db down") }).gate, null]) {
    const model = fakeModel();
    const ledgered = createDraftAssistRunner({ actorId: "alice", gate, kind: "seek", runner: model.runner });
    assert.equal((await silent(() => ledgered.run({ systemInstruction: "s", userText: "u" }))).success, true);
    assert.equal(model.calls(), 1);
    assert.equal(ledgered.refusal(), null);
  }

  const capped = fakeModel();
  const overCalls = createDraftAssistRunner({ actorId: "alice", gate: fakeGate({ ok: true, operationId: "op", owner: true, status: "reserved" }, { beginError: new AiQuotaCallRejectedError("MAX_CALLS", "no calls left") }).gate, kind: "intro", runner: capped.runner });
  assert.equal((await silent(() => overCalls.run({ systemInstruction: "s", userText: "u" }))).success, false);
  assert.equal(capped.calls(), 0);
});

test("intro draft over the monthly limit: 429 AI_MONTHLY_LIMIT, no model call (the settings path)", async () => {
  const post = (body: unknown) => new Request("https://orbit.test/api/profile/intro-draft", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
  let modelCalls = 0;
  const createDraftService = (options: { runModel?: typeof runOrbitAgentModelText }) => ({
    createDraft: async () => {
      const result = await options.runModel!({ systemInstruction: "s", userText: "u" });
      if (result.success) modelCalls += 1;
      return result.success ? { data: { bio: "b", headline: "h", model: "m", provider: "p" }, success: true as const } : { error: { code: "MODEL_REQUEST_FAILED" as const, message: "x" }, success: false as const };
    },
  });
  const direct = createProfileIntroDraftHandler({
    createDraftService: createDraftService as never,
    draftLedger: () => fakeGate(MONTHLY).gate,
    flowForActor: () => ({ get: async () => null }) as never,
    resolveActor: async () => ({ id: "alice" }),
  });
  const response = await silent(() => direct(post({ language: "zh" })));
  assert.equal(response.status, 429);
  const body = (await response.json()) as { error: { code: string; context: Record<string, string> } };
  assert.equal(body.error.code, AI_MONTHLY_LIMIT_CODE);
  assert.deepEqual(body.error.context, { quotaFeature: "draft_assist", quotaLimit: "60", quotaPeriod: "month", quotaRetryOn: "2026-11-30T15:00:00.000Z", quotaTier: "free", quotaUpgradable: "false", quotaUsed: "60", retryOn: "2026-11-30T15:00:00.000Z" }, "the public number, the reset time and whether an upgrade helps");
  assert.equal(modelCalls, 0);
});

test("manual re-analysis over the monthly limit: 429 with reason MONTHLY_LIMIT (the daily reasons are unchanged)", async () => {
  const handlerFor = (outcome: unknown) => createNetworkSnapshotRouteHandlers({
    resolveActor: async () => ({ id: "alice" }),
    runtime: () => ({ service: { recomputeManually: async () => outcome } }) as never,
  }).recompute;
  const request = () => new Request("http://localhost/api/network/snapshot/recompute?lang=zh", { body: "{}", method: "POST" });
  const monthly = await handlerFor({ cap: 10, limit: "monthly", retryOn: "2026-11-30T15:00:00.000Z", status: "limited" })(request());
  assert.equal(monthly.status, 429);
  assert.deepEqual(((await monthly.json()) as { error: { context: unknown } }).error.context, { quotaFeature: "manual_reanalysis", quotaLimit: "10", quotaPeriod: "month", quotaRetryOn: "2026-11-30T15:00:00.000Z", quotaTier: "free", quotaUpgradable: "false", quotaUsed: "10", reason: "MONTHLY_LIMIT", retryOn: "2026-11-30T15:00:00.000Z" });
  const daily = await handlerFor({ limit: "manual", retryOn: "2026-11-27T15:00:00.000Z", status: "limited" })(request());
  assert.equal(((await daily.json()) as { error: { context: { reason: string } } }).error.context.reason, "MANUAL_REFRESH_LIMIT");
});

test("memo extraction over the monthly limit: deferred to the 1st of next month, 0 model calls (silent)", async () => {
  const live = createMemoryLiveRecordStore();
  const store = createLiveRecordMemoExtractionStore({ store: live, workspaceId: "w" });
  const provider = createMockMemoExtractionProvider({ eventTypes: ["met"], offering: ["a"], seeking: ["b"], topics: ["c"] });
  const { gate } = fakeGate(MONTHLY);
  const job = { actorId: "a", body: "她在找 B 轮投资人", contact: { organization: "Nexa", role: "CEO" }, contactId: "own", noteId: "note:m1" };
  const original = console.info;
  console.info = () => undefined;
  try {
    const record = await runMemoExtraction(job, { applyValues: async () => [], gate, now: () => new Date("2026-11-27T03:00:00.000Z"), provider, store });
    assert.equal(record.status, "deferred");
    assert.equal(record.retryOn, "2026-11-30T15:00:00.000Z");
  } finally {
    console.info = original;
  }
  assert.equal(provider.calls.length, 0);
});
