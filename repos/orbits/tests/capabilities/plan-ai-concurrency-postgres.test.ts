/**
 * W0048b review P1（真实 PostgreSQL）：同一幂等键的并发请求只有一个拿到账本操作的所有权。
 *
 * - 账本：两个并发 reserve 恰好一个 owner；重放不转让所有权，只有 takeover（租约持有者）能接管 reserved；
 * - 计划流水线：同键两个 bootstrap 同时进入 → 一个生成并结算，另一个 in-progress、0 次调用、不结算；
 * - W0048a 手动重新分析：同键重放在进行中时返回 in_progress，不执行、不结算。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的回环库，随机 schema，用完即删；模型一律假回复。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { createNetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import { createMockSnapshotGenerator } from "../../features/network-analysis/snapshot-generator";
import { createPlanBootstrapService } from "../../features/plans/bootstrap";
import { PlanGenerationInProgressError } from "../../features/plans/generator";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository, type PlanPoolLike } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { ALICE, databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";
import { aiGenerator, fakeDeepseek } from "../support/plan-ai-fixture";
import { CONTACTS, EVENTS, NOW } from "../support/plan-bootstrap-fixture";

const reserveInput = (key: string) => ({ actorId: ALICE, idempotencyKey: key, now: NOW, pool: "user" as const, purpose: "plan" as const, trigger: "plan" as const });

test("ledger: two concurrent reserves with one key → exactly one owner; replays never transfer ownership except takeover", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = createPostgresAiUsageLedger({ client: harness.client, workspaceId: WORKSPACE });
    const results = await Promise.all([ledger.reserve(reserveInput("same")), ledger.reserve(reserveInput("same"))]);
    const granted = results.filter((result): result is Extract<typeof result, { ok: true }> => result.ok === true);
    assert.equal(granted.length, 2);
    assert.equal(new Set(granted.map((result) => result.operationId)).size, 1);
    assert.deepEqual(granted.map((result) => result.owner).sort(), [false, true]);
    assert.ok(granted.every((result) => result.status === "reserved"));
    const takeover = await ledger.reserve({ ...reserveInput("same"), takeover: true });
    assert.ok(takeover.ok === true && takeover.owner === true);
    await ledger.beginCall(granted[0]!.operationId, { model: "m", provider: "deepseek" }).then(({ callId }) => ledger.endCall(callId, { inputTokens: 1, outputTokens: 1 }));
    await ledger.finish(granted[0]!.operationId, "succeeded");
    const settled = await ledger.reserve({ ...reserveInput("same"), takeover: true });
    assert.ok(settled.ok === true && settled.owner === false && settled.status === "succeeded", "a settled operation is never re-owned");
  });
});

test("plan pipeline: two same-key bootstraps at once → one generation, one in-progress (0 calls, no settlement)", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const ledger = createPostgresAiUsageLedger({ client: harness.client, workspaceId: WORKSPACE });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const deepseek = fakeDeepseek({});
    const generator = aiGenerator({
      fetchImplementation: (async (url: string, init?: RequestInit) => {
        await gate;
        return deepseek.fetchImplementation(url, init);
      }) as unknown as typeof fetch,
      ledger: ledger as never,
    });
    const references = createAllowListPlanReferenceValidator({ actorId: ALICE, allowList: { contactsByActor: "any", eventIds: "any" } });
    const plans = createPlanService({
      references,
      repository: createPostgresPlanRepository({ pool: harness.pool as unknown as PlanPoolLike }),
      scope: { actorId: ALICE, workspaceId: WORKSPACE },
    });
    const service = createPlanBootstrapService({
      actorId: ALICE,
      generator,
      now: () => NOW,
      plans,
      references,
      source: { listContacts: async () => ({ contacts: CONTACTS.map((entry) => ({ ...entry, ownerId: ALICE })), total: CONTACTS.length }), listEvents: async () => EVENTS },
    });
    const request = { goal: { horizon: "quarter" as const, snapshot: "g", text: "三个月内拿到 10 家企业客户的试用" }, idempotencyKey: "pg-dup", locale: "zh" as const, supplement: null };
    const first = service.bootstrap(request);
    // 等第一条链拿到所有权并卡在第一次 HTTP 上。
    for (let wait = 0; wait < 50 && deepseek.requests.length === 0; wait += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if ((await harness.pool.query("select count(*)::int as n from ai_usage_calls")).rows[0].n > 0) break;
    }
    await assert.rejects(service.bootstrap(request), PlanGenerationInProgressError);
    release();
    const saved = await first;
    assert.equal(saved.replayed, false);
    const ops = (await harness.pool.query("select id, status, max_calls from ai_usage_ledger where actor_id = $1", [ALICE])).rows;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].status, "succeeded");
    const calls = (await harness.pool.query("select status from ai_usage_calls where operation_id = $1", [ops[0].id])).rows;
    assert.equal(calls.length, deepseek.requests.length, "HTTP = sub-ledger rows");
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call: { status: string }) => call.status === "responded"));
    assert.equal((await service.bootstrap(request)).replayed, true);
  });
});

test("W0048a manual re-analysis: a same-key replay while the owner is running returns in_progress without executing or settling", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    for (const id of ["c1", "c2", "c3"]) await harness.addContact(ALICE, `contact:${id}`);
    const runtime = createNetworkAnalysisRuntime({
      client: harness.client,
      generator: createMockSnapshotGenerator(),
      now: () => NOW,
      readCurrentPlan: async () => null,
      readProfile: async () => ({ goal: "g", profileSection: { profile: { relationshipGoal: "g" }, state: "ready" } }),
      workspaceId: WORKSPACE,
    });
    const key = `snapshot:manual:${ALICE}:k1`;
    const owner = await runtime.ledger.reserve({ actorId: ALICE, idempotencyKey: key, now: NOW, pool: "user", purpose: "snapshot", trigger: "manual" });
    assert.ok(owner.ok === true && owner.owner);
    assert.deepEqual(await runtime.service.recomputeManually(ALICE, { idempotencyKey: key }), { status: "in_progress" });
    const state = await runtime.ledger.readOperation((owner as { operationId: string }).operationId);
    assert.equal(state?.status, "reserved", "the non-owner did not settle the shared operation");
    // 所有者 0 次响应结束 → released；同键再来的请求重开并成为所有者。
    await runtime.ledger.finish((owner as { operationId: string }).operationId, "failed");
    const again = await runtime.service.recomputeManually(ALICE, { idempotencyKey: key });
    assert.equal(again.status, "succeeded");
  }, { syncRevision: true });
});
