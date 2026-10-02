/**
 * W0048a SC-W0048a-04（真实 PostgreSQL）：两池 AI 配额账本。
 *
 * - 后台池 60 次操作用满后自动快照 0 次调用、job deferred 到次日 00:00 东京、视图给 retryOn（主证据）；
 * - 东京日边界；手动 3 次与用户池总熔断 10 次；两池互不占用；system 池不计入；
 * - 同键重放不重复计次；额度剩 1 时两路并发只成功一路；
 * - 一次操作多次 HTTP 只计 1 次，子账条数 = HTTP 次数，超过 max_calls 拒绝；0 条 responded → released；
 * - W0046 闸门换成账本后 memo 提取开闸并计入后台池；后台池满时 memo 提取 0 次调用并顺延。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_POOL_DAILY_LIMIT,
  MANUAL_REANALYSIS_DAILY_LIMIT,
  nextTokyoMidnight,
  tokyoUsageDay,
  USER_POOL_DAILY_LIMIT,
} from "../../features/ai-quota/constants";
import { AiQuotaCallRejectedError, createPostgresAiUsageLedger, type AiUsageLedger } from "../../features/ai-quota/ledger";
import { runMemoExtraction, type MemoExtractionRecord, type MemoExtractionStore } from "../../features/contacts/memo-extraction/job";
import { createDeepseekMemoExtractionProvider, MemoExtractionError, type MemoExtractionProvider } from "../../features/contacts/memo-extraction/provider";
import { createNetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import type { NetworkSnapshotGenerator } from "../../features/network-analysis/snapshot-generator";
import { buildMockSnapshotContent } from "../../features/network-analysis/snapshot-generator";
import { ALICE, BOB, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

const NOW = new Date("2026-10-02T03:00:00.000Z"); // 东京 12:00

function ledgerOf(harness: NetworkHarness): AiUsageLedger {
  return createPostgresAiUsageLedger({ client: harness.client, workspaceId: WORKSPACE });
}

async function fill(ledger: AiUsageLedger, input: { actorId?: string; pool: "user" | "background" | "system"; purpose: "snapshot" | "memo_extraction" | "insight" | "plan"; trigger: "auto" | "manual" | "plan"; count: number; prefix: string; now?: Date }) {
  for (let index = 0; index < input.count; index += 1) {
    const reservation = await ledger.reserve({ actorId: input.actorId ?? ALICE, idempotencyKey: `${input.prefix}:${index}`, now: input.now ?? NOW, pool: input.pool, purpose: input.purpose, trigger: input.trigger });
    assert.equal(reservation.ok, true, `${input.prefix}:${index}`);
  }
}

async function ledgerRows(harness: NetworkHarness, actorId = ALICE) {
  return (await harness.pool.query(`select pool, purpose, trigger, status, usage_day::text as day from ai_usage_ledger where workspace_id = $1 and actor_id = $2 order by created_at, id`, [WORKSPACE, actorId])).rows;
}

/** 计数假生成器：billable（每次 generate 视为一次 HTTP）。 */
function countingGenerator(): NetworkSnapshotGenerator & { calls: number } {
  const generator = {
    billable: true,
    calls: 0,
    model: "fake-model",
    promptVersion: "test-v1",
    provider: "deepseek" as const,
    async generate(input: Parameters<NetworkSnapshotGenerator["generate"]>[0]) {
      generator.calls += 1;
      return { content: buildMockSnapshotContent(input), usage: { inputTokens: 100, outputTokens: 20 } };
    },
  };
  return generator;
}

async function seedContacts(harness: NetworkHarness, actorId: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    await harness.addContact(actorId, `${actorId}:c${index}`, { primaryIndustryId: "technology_internet" });
  }
}

test("SC-04 main: background pool at 60 operations → an auto snapshot makes 0 calls, the job is deferred to next 00:00 Tokyo, the view shows retryOn", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 4);
    const generator = countingGenerator();
    const runtime = createNetworkAnalysisRuntime({
      client: harness.client,
      generator,
      now: () => NOW,
      readCurrentPlan: async () => null,
      readProfile: async () => ({ goal: "goal", profileSection: { profile: { relationshipGoal: "goal" }, state: "ready" } }),
      workspaceId: WORKSPACE,
    });
    await fill(runtime.ledger, { count: BACKGROUND_POOL_DAILY_LIMIT, pool: "background", prefix: "bg", purpose: "memo_extraction", trigger: "auto" });
    const view = await runtime.service.readView(ALICE, "zh");
    assert.equal(view.freshness.job, "queued");
    const outcome = await runtime.service.runWorker(ALICE, { owner: "w1" });
    assert.deepEqual(outcome, { retryOn: nextTokyoMidnight(NOW), status: "deferred" });
    assert.equal(generator.calls, 0);
    const job = (await harness.pool.query(`select status, not_before, operation_id from network_analysis_jobs where workspace_id = $1 and actor_id = $2`, [WORKSPACE, ALICE])).rows[0];
    assert.equal(job.status, "deferred");
    assert.equal(new Date(job.not_before).toISOString(), "2026-10-02T15:00:00.000Z");
    assert.equal(job.operation_id, null);
    const after = await runtime.service.readView(ALICE, "zh");
    assert.equal(after.freshness.job, "deferred");
    assert.equal(after.freshness.retryOn, "2026-10-02T15:00:00.000Z");
    assert.equal(after.quota.background.usedToday, 60);
    assert.equal(after.quota.background.retryOn, "2026-10-02T15:00:00.000Z");
    assert.equal((await ledgerRows(harness)).length, 60, "no 61st operation row");
    // 次日维护任务：job 到期 → 领取 → 预留后台池一次 → 生成。
    const nextDay = new Date("2026-10-02T15:00:01.000Z");
    const tomorrow = createNetworkAnalysisRuntime({
      client: harness.client, generator, now: () => nextDay, readCurrentPlan: async () => null,
      readProfile: async () => ({ goal: "goal", profileSection: { profile: { relationshipGoal: "goal" }, state: "ready" } }), workspaceId: WORKSPACE,
    });
    const jobs = await tomorrow.repository.claimDueJobs("maint", nextDay, 180_000, 10);
    assert.equal(jobs.length, 1);
    const result = await tomorrow.service.processClaimedJob(jobs[0]!, "maint");
    assert.equal(result.status, "succeeded");
    assert.equal(generator.calls, 1);
  });
});

test("SC-04 Tokyo day boundary: 23:59:59 JST counts for that day, 00:00 JST starts a new day", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = ledgerOf(harness);
    const lateNight = new Date("2026-10-02T14:59:59.000Z");
    assert.equal(tokyoUsageDay(lateNight), "2026-10-02");
    await fill(ledger, { count: BACKGROUND_POOL_DAILY_LIMIT, now: lateNight, pool: "background", prefix: "late", purpose: "insight", trigger: "auto" });
    const denied = await ledger.reserve({ actorId: ALICE, idempotencyKey: "late:x", now: lateNight, pool: "background", purpose: "insight", trigger: "auto" });
    assert.deepEqual(denied, { limit: "background", ok: false, reason: "daily_limit", retryOn: "2026-10-02T15:00:00.000Z" });
    const midnight = new Date("2026-10-02T15:00:00.000Z");
    assert.equal(tokyoUsageDay(midnight), "2026-10-03");
    const allowed = await ledger.reserve({ actorId: ALICE, idempotencyKey: "midnight", now: midnight, pool: "background", purpose: "insight", trigger: "auto" });
    assert.equal(allowed.ok, true);
  });
});

test("SC-04 user pool: manual 3/day, then the 10-operation fuse; pools never borrow from each other; system rows count for neither", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = ledgerOf(harness);
    await fill(ledger, { count: BACKGROUND_POOL_DAILY_LIMIT, pool: "background", prefix: "bg", purpose: "insight", trigger: "auto" });
    await fill(ledger, { count: 25, pool: "system", prefix: "sys", purpose: "insight", trigger: "auto" });
    // 后台池满时手动重新分析仍可用。
    await fill(ledger, { count: MANUAL_REANALYSIS_DAILY_LIMIT, pool: "user", prefix: "manual", purpose: "snapshot", trigger: "manual" });
    const fourth = await ledger.reserve({ actorId: ALICE, idempotencyKey: "manual:4", now: NOW, pool: "user", purpose: "snapshot", trigger: "manual" });
    assert.deepEqual(fourth, { limit: "manual", ok: false, reason: "daily_limit", retryOn: nextTokyoMidnight(NOW) });
    // 其余用户主动操作（计划、单人洞察）继续用到总熔断 10。
    await fill(ledger, { count: USER_POOL_DAILY_LIMIT - MANUAL_REANALYSIS_DAILY_LIMIT, pool: "user", prefix: "plan", purpose: "plan", trigger: "plan" });
    const eleventh = await ledger.reserve({ actorId: ALICE, idempotencyKey: "plan:x", now: NOW, pool: "user", purpose: "insight", trigger: "manual" });
    assert.deepEqual(eleventh, { limit: "user", ok: false, reason: "daily_limit", retryOn: nextTokyoMidnight(NOW) });
    assert.deepEqual(await ledger.readUsageToday(ALICE, NOW), { background: 60, manual: 3, user: 10 });
    // system 池不受任何用户额度约束。
    assert.equal((await ledger.reserve({ actorId: ALICE, idempotencyKey: "sys:more", now: NOW, pool: "system", purpose: "enrichment", trigger: "auto" })).ok, true);
    // 用户池满不影响 Bob，也不影响 Alice 的后台池第二天。
    assert.equal((await ledger.reserve({ actorId: BOB, idempotencyKey: "bob", now: NOW, pool: "user", purpose: "snapshot", trigger: "manual" })).ok, true);
  });
});

test("SC-04 user pool fuse: with 10 user operations and fewer than 3 manual, a manual re-analysis is refused as USER_DAILY_LIMIT; background unaffected", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = ledgerOf(harness);
    await fill(ledger, { count: USER_POOL_DAILY_LIMIT, pool: "user", prefix: "plan", purpose: "plan", trigger: "plan" });
    const manual = await ledger.reserve({ actorId: ALICE, idempotencyKey: "m1", now: NOW, pool: "user", purpose: "snapshot", trigger: "manual" });
    assert.equal(manual.ok === false && manual.limit, "user");
    assert.equal((await ledger.reserve({ actorId: ALICE, idempotencyKey: "bg1", now: NOW, pool: "background", purpose: "snapshot", trigger: "auto" })).ok, true);
  });
});

test("SC-04 replaying a key returns the same operation; with one slot left two concurrent reservations grant exactly one", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = ledgerOf(harness);
    const first = await ledger.reserve({ actorId: ALICE, idempotencyKey: "same", now: NOW, pool: "background", purpose: "insight", trigger: "auto" });
    const replay = await ledger.reserve({ actorId: ALICE, idempotencyKey: "same", now: NOW, pool: "background", purpose: "insight", trigger: "auto" });
    assert.ok(first.ok && replay.ok);
    assert.equal(first.ok && first.operationId, replay.ok && replay.operationId);
    assert.equal((await ledgerRows(harness)).length, 1);
    await fill(ledger, { count: BACKGROUND_POOL_DAILY_LIMIT - 2, pool: "background", prefix: "bg", purpose: "insight", trigger: "auto" });
    const results = await Promise.all([0, 1, 2].map((index) =>
      ledger.reserve({ actorId: ALICE, idempotencyKey: `race:${index}`, now: NOW, pool: "background", purpose: "insight", trigger: "auto" })));
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal((await ledger.readUsageToday(ALICE, NOW)).background, BACKGROUND_POOL_DAILY_LIMIT);
  });
});

test("SC-04 one operation with several HTTP calls counts once; calls rows = HTTP calls; beyond max_calls is refused; 0 responded → released", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = ledgerOf(harness);
    const plan = await ledger.reserve({ actorId: ALICE, idempotencyKey: "plan", now: NOW, pool: "user", purpose: "plan", trigger: "plan" });
    assert.ok(plan.ok);
    const operationId = plan.ok ? plan.operationId : "";
    for (let index = 0; index < 4; index += 1) {
      const { callId } = await ledger.beginCall(operationId, { model: "m", provider: "deepseek" });
      await ledger.endCall(callId, { inputTokens: 100 + index, outputTokens: 10 });
    }
    await assert.rejects(ledger.beginCall(operationId, { model: "m", provider: "deepseek" }), (error: unknown) => error instanceof AiQuotaCallRejectedError && error.code === "MAX_CALLS");
    await ledger.finish(operationId, "succeeded");
    await ledger.finish(operationId, "failed"); // 重复结算 no-op
    const aggregate = (await harness.pool.query(`select count(*)::int as calls, sum(input_tokens)::int as input, sum(output_tokens)::int as output from ai_usage_calls where workspace_id = $1 and operation_id = $2`, [WORKSPACE, operationId])).rows[0];
    assert.deepEqual(aggregate, { calls: 4, input: 406, output: 40 });
    assert.equal((await ledger.readOperation(operationId))?.status, "succeeded");
    assert.equal((await ledger.readUsageToday(ALICE, NOW)).user, 1);

    // 一个快照操作只允许 1 次 HTTP：第二次 beginCall 被拒、不发请求。
    const snapshot = await ledger.reserve({ actorId: ALICE, idempotencyKey: "snap", now: NOW, pool: "background", purpose: "snapshot", trigger: "auto" });
    const snapshotId = snapshot.ok ? snapshot.operationId : "";
    const { callId } = await ledger.beginCall(snapshotId, { model: "m", provider: "deepseek" });
    await assert.rejects(ledger.beginCall(snapshotId, { model: "m", provider: "deepseek" }), AiQuotaCallRejectedError);
    await ledger.endCall(callId, null); // 无响应
    await ledger.finish(snapshotId, "failed");
    assert.equal((await ledger.readOperation(snapshotId))?.status, "released");
    assert.equal((await ledger.readUsageToday(ALICE, NOW)).background, 0, "released operations do not count");
    await assert.rejects(ledger.beginCall(snapshotId, { model: "m", provider: "deepseek" }), (error: unknown) => error instanceof AiQuotaCallRejectedError && error.code === "OPERATION_NOT_OPEN");
    // released 后同键重放 = 重新开启（受额度约束），可再发一次 HTTP。
    const reopened = await ledger.reserve({ actorId: ALICE, idempotencyKey: "snap", now: NOW, pool: "background", purpose: "snapshot", trigger: "auto" });
    assert.equal(reopened.ok && reopened.operationId, snapshotId);
    assert.ok((await ledger.beginCall(snapshotId, { model: "m", provider: "deepseek" })).callId.endsWith("#2"));
  });
});

class MemoryMemoStore implements MemoExtractionStore {
  rows = new Map<string, MemoExtractionRecord>();
  async get({ key }: { actorId: string; key: string }) { return this.rows.get(key) ?? null; }
  async insert(record: MemoExtractionRecord) { if (this.rows.has(record.key)) return false; this.rows.set(record.key, record); return true; }
  async replace(record: MemoExtractionRecord, expected: string) { if (this.rows.get(record.key)?.updatedAt !== expected) return false; this.rows.set(record.key, record); return true; }
}

function fakeMemoProvider(): MemoExtractionProvider & { calls: number } {
  const provider = {
    calls: 0,
    model: "fake-memo",
    providerName: "deepseek-chat-completions",
    async extract() {
      provider.calls += 1;
      return { output: { eventTypes: ["met"], offering: ["SaaS"], seeking: [], topics: ["AI"] }, usage: { inputTokens: 210, latencyMs: 5, outputTokens: 30 } };
    },
  };
  return provider as never;
}

test("SC-04 the W0046 gate replaced by the ledger opens memo extraction (background pool); a full pool defers with 0 calls", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = ledgerOf(harness);
    const store = new MemoryMemoStore();
    const provider = fakeMemoProvider();
    const job = { actorId: ALICE, body: "Met at the expo; building SaaS for AI teams.", contact: { organization: "Cloudline", role: "CTO" }, contactId: "c1", noteId: "note:live-contact-detail-update:n1" };
    const record = await runMemoExtraction(job, { applyValues: async () => ["offering", "topics"], gate: ledger, now: () => NOW, provider, store });
    assert.equal(record.status, "succeeded");
    assert.equal(provider.calls, 1);
    const rows = await ledgerRows(harness);
    assert.deepEqual(rows.map((row) => [row.pool, row.purpose, row.trigger, row.status]), [["background", "memo_extraction", "auto", "succeeded"]]);
    const calls = (await harness.pool.query(`select status, input_tokens, output_tokens from ai_usage_calls where workspace_id = $1`, [WORKSPACE])).rows;
    assert.deepEqual(calls, [{ input_tokens: 210, output_tokens: 30, status: "responded" }]);

    await fill(ledger, { count: BACKGROUND_POOL_DAILY_LIMIT - 1, pool: "background", prefix: "bg", purpose: "insight", trigger: "auto" });
    const second = await runMemoExtraction({ ...job, noteId: "note:live-contact-detail-update:n2" }, { applyValues: async () => [], gate: ledger, now: () => NOW, provider, store });
    assert.equal(second.status, "deferred");
    assert.equal(second.retryOn, nextTokyoMidnight(NOW));
    assert.equal(provider.calls, 1, "0 calls when the background pool is full");
  });
});

test("SC-04 P2-1 reservation epochs: each reopen allows exactly max_calls HTTP (no_response included); history is kept; a third replay still works", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = ledgerOf(harness);
    const reserve = () => ledger.reserve({ actorId: ALICE, idempotencyKey: "epoch", now: NOW, pool: "background", purpose: "snapshot", trigger: "auto" });
    const first = await reserve();
    const operationId = first.ok ? first.operationId : "";
    for (let round = 1; round <= 3; round += 1) {
      if (round > 1) assert.equal((await reserve()).ok, true, `replay ${round} reopens`);
      const { callId } = await ledger.beginCall(operationId, { model: "m", provider: "deepseek" });
      await ledger.endCall(callId, null);
      await assert.rejects(ledger.beginCall(operationId, { model: "m", provider: "deepseek" }), (error: unknown) => error instanceof AiQuotaCallRejectedError && error.code === "MAX_CALLS", "no_response still uses the epoch's only call");
      await ledger.finish(operationId, "failed");
      assert.equal((await ledger.readOperation(operationId))?.status, "released");
    }
    assert.deepEqual((await harness.pool.query(`select seq, epoch, status from ai_usage_calls order by seq`)).rows, [
      { epoch: 1, seq: 1, status: "no_response" }, { epoch: 2, seq: 2, status: "no_response" }, { epoch: 3, seq: 3, status: "no_response" },
    ]);
    assert.equal((await harness.pool.query(`select epoch from ai_usage_ledger where id = $1`, [operationId])).rows[0].epoch, 3);
  });
});

test("SC-04 P2-1 different keys that never get a response: each operation sends at most max_calls HTTP and is released (not billed)", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = ledgerOf(harness);
    for (let index = 0; index < 3; index += 1) {
      const reservation = await ledger.reserve({ actorId: ALICE, idempotencyKey: `timeout:${index}`, now: NOW, pool: "user", purpose: "snapshot", trigger: "manual" });
      const operationId = reservation.ok ? reservation.operationId : "";
      const { callId } = await ledger.beginCall(operationId, { model: "m", provider: "deepseek" });
      await ledger.endCall(callId, null);
      await assert.rejects(ledger.beginCall(operationId, { model: "m", provider: "deepseek" }), AiQuotaCallRejectedError);
      await ledger.finish(operationId, "failed");
    }
    const rows = (await harness.pool.query(`select l.status, count(c.seq)::int as calls from ai_usage_ledger l join ai_usage_calls c on c.operation_id = l.id group by l.id, l.status`)).rows;
    assert.deepEqual(rows.map((row) => [row.status, row.calls]), [["released", 1], ["released", 1], ["released", 1]]);
    assert.equal((await ledger.readUsageToday(ALICE, NOW)).manual, 0);
  });
});

test("SC-04 P2-2 the memo provider reports a non-2xx response with usage (tokens 0) so the gate bills it; a connection failure has no usage", async () => {
  const busy = createDeepseekMemoExtractionProvider({ apiKey: "k", fetchImplementation: (async () => new Response("busy", { status: 429 })) as unknown as typeof fetch });
  await assert.rejects(busy.extract({ contact: {}, memo: "m" }), (error: unknown) =>
    error instanceof MemoExtractionError && error.code === "PROVIDER_REQUEST_FAILED" && error.usage?.inputTokens === 0 && error.usage?.outputTokens === 0);
  const down = createDeepseekMemoExtractionProvider({ apiKey: "k", fetchImplementation: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
  await assert.rejects(down.extract({ contact: {}, memo: "m" }), (error: unknown) => error instanceof MemoExtractionError && error.usage === null);
});

/* ── W0048b 合并后修复：同一操作并发 beginCall（行锁分配序号） ───────────────────── */

test("W0048b fix: concurrent beginCall on one operation — all within max_calls succeed with consecutive seqs, the rest are strictly refused", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = ledgerOf(harness);
    const reservation = await ledger.reserve({ actorId: ALICE, idempotencyKey: "race:burst", now: NOW, pool: "user", purpose: "plan", trigger: "plan" });
    assert.ok(reservation.ok === true);
    const operationId = reservation.operationId;
    // max_calls(plan) = 4；同时发 7 次登记。
    const results = await Promise.allSettled(Array.from({ length: 7 }, () => ledger.beginCall(operationId, { model: "m", provider: "deepseek" })));
    const granted = results.filter((result): result is PromiseFulfilledResult<{ callId: string }> => result.status === "fulfilled");
    const refused = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal(granted.length, 4);
    assert.deepEqual(granted.map((result) => Number(result.value.callId.split("#")[1])).sort((a, b) => a - b), [1, 2, 3, 4]);
    assert.equal(refused.length, 3);
    for (const result of refused) {
      assert.ok(result.reason instanceof AiQuotaCallRejectedError && result.reason.code === "MAX_CALLS", String(result.reason));
    }
    const rows = (await harness.pool.query("select seq from ai_usage_calls where operation_id = $1 order by seq", [operationId])).rows.map((row) => Number(row.seq));
    assert.deepEqual(rows, [1, 2, 3, 4]);
  });
});

test("W0048b fix: 200 rounds of two parallel beginCalls (1 of 4 already used) — 0 false refusals", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = ledgerOf(harness);
    let falseRefusals = 0;
    for (let round = 0; round < 200; round += 1) {
      const reservation = await ledger.reserve({ actorId: ALICE, idempotencyKey: `race:${round}`, now: NOW, pool: "system", purpose: "plan", trigger: "plan" });
      assert.ok(reservation.ok === true);
      await ledger.beginCall(reservation.operationId, { model: "m", provider: "p" });
      const pair = await Promise.allSettled([
        ledger.beginCall(reservation.operationId, { model: "m", provider: "p" }),
        ledger.beginCall(reservation.operationId, { model: "m", provider: "p" }),
      ]);
      falseRefusals += pair.filter((result) => result.status === "rejected").length;
    }
    assert.equal(falseRefusals, 0);
  });
});
