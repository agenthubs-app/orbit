/**
 * W0010 SC-01 / SC-02（真实 PostgreSQL）：名片批次完成时写匹配任务、单张补录按东京自然日聚合、
 * worker 的规则层与 AI 层（mock provider：正常、越界、超时、重试不重复计费）、
 * 维护任务在没有浏览器的情况下完成 pending 任务。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { Pool } from "pg";

import { PlanAiMatcherError, type PlanAiMatcher, type PlanAiMatchProposal } from "../../features/plans/ai-matcher";
import { createPlanMatchMaintenanceTask } from "../../features/plans/match-maintenance-task";
import { runDueMatchJobs, runMatchJobForBatch, type PlanMatchWorkerDeps } from "../../features/plans/match-worker";
import { PLAN_MATCHING_MIGRATIONS, runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import { enqueuePlanMatchJob, type PlanMatchRepository } from "../../features/plans/matching-repository";
import { runMaintenancePass } from "../../features/operations/maintenance/pass";
import {
  ALICE,
  BOB,
  confirmItem,
  databaseTest,
  extractedBatch,
  jobRows,
  matchingPlanInput,
  NEED_INVESTOR,
  NEED_SAAS,
  withMatchingDatabase,
  WORKSPACE,
  type MatchingHarness,
} from "../support/plan-matching-harness";

type Behaviour = "normal" | "timeout" | "invalid";

function fakeMatcher(
  behaviour: Behaviour,
  proposals: (ids: { saasNeed: string; investorNeed: string }) => PlanAiMatchProposal[] = () => [],
  ids: { saasNeed: string; investorNeed: string } = { investorNeed: "", saasNeed: "" },
): PlanAiMatcher & { calls: number } {
  const matcher = {
    calls: 0,
    model: "fake-text-model",
    providerName: "fake",
    async match({ signal }: { signal?: AbortSignal }) {
      matcher.calls += 1;
      if (behaviour === "timeout") {
        await new Promise<void>((resolve) => {
          if (signal?.aborted) resolve();
          signal?.addEventListener("abort", () => resolve(), { once: true });
        });
        throw new PlanAiMatcherError("PROVIDER_TIMEOUT", "timed out");
      }
      if (behaviour === "invalid") {
        throw new PlanAiMatcherError("INVALID_OUTPUT", "bad json", { inputTokens: 300, latencyMs: 5, outputTokens: 2 });
      }
      return { model: "fake-text-model", proposals: proposals(ids), usage: { inputTokens: 420, latencyMs: 12, outputTokens: 36 } };
    },
  };
  return matcher;
}

async function planWithNeeds(harness: MatchingHarness, actorId = ALICE) {
  const snapshot = await harness.planServiceFor(actorId).createVersion(matchingPlanInput());
  const saasNeed = snapshot.items.find((item) => item.title === NEED_SAAS)!.id;
  const investorNeed = snapshot.items.find((item) => item.title === NEED_INVESTOR)!.id;
  return { investorNeed, planId: snapshot.plan.id, saasNeed };
}

async function withTx<T>(pool: Pool, fn: (client: { query: Pool["query"] }) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const value = await fn(client as never);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function candidates(pool: Pool) {
  return (
    await pool.query(
      `select need_item_id, contact_id, tier, strength, reason, status from plan_match_candidates order by contact_id, need_item_id`,
    )
  ).rows as Array<{ need_item_id: string; contact_id: string; tier: string; strength: string; reason: string | null; status: string }>;
}

/** 让单张补录的当天任务「到期」。 */
async function makeDue(pool: Pool): Promise<void> {
  await pool.query(`update plan_match_jobs set not_before = now() - interval '1 second'`);
}

function worker(matches: PlanMatchRepository, aiMatcher: PlanAiMatcher | null, aiTimeoutMs = 5_000): PlanMatchWorkerDeps {
  return { aiMatcher, aiTimeoutMs, repository: matches };
}

/* ── SC-01：任务落库 ─────────────────────────────────────────────────── */

test("matching migrations apply forward, rerun idempotently and refuse a changed checksum", databaseTest, async () => {
  await withMatchingDatabase(async ({ pool }) => {
    const ledger = async () => (await pool.query("select version, name, checksum, applied_at from plan_matching_schema_migrations order by version")).rows;
    const before = await ledger();
    assert.deepEqual(
      before.map(({ checksum, name, version }) => ({ checksum, name, version })),
      PLAN_MATCHING_MIGRATIONS.map(({ checksum, name, version }) => ({ checksum, name, version })),
    );
    await runPlanMatchingMigrations(pool);
    assert.deepEqual(await ledger(), before);
    await pool.query("update plan_matching_schema_migrations set checksum = 'tampered' where version = 1");
    await assert.rejects(runPlanMatchingMigrations(pool), /plan matching migration 1 checksum mismatch/);
  });
});

test("the last two concurrent confirmations complete the batch and write exactly one match job", databaseTest, async () => {
  await withMatchingDatabase(async ({ ingest, pool }) => {
    const { batch, items } = await extractedBatch(ingest, ALICE, 2);
    await Promise.all([
      confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[0]!.id }),
      confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:vc", itemId: items[1]!.id }),
    ]);
    const detail = await ingest.getBatch({ actorId: ALICE, batchId: batch.id });
    assert.equal(detail?.batch.status, "completed");
    const jobs = await jobRows(pool);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]!.source_kind, "batch");
    assert.equal(jobs[0]!.source_key, batch.id);
    assert.equal(jobs[0]!.actor_id, ALICE);
    assert.equal(jobs[0]!.status, "pending");
    assert.deepEqual([...jobs[0]!.contact_ids].sort(), ["contact:saas", "contact:vc"]);

    // 批次重放（同一批次再次入队）：仍然只有一条，返回同一个任务。
    const replay = await withTx(pool, (client) =>
      enqueuePlanMatchJob(client, { actorId: ALICE, batchId: batch.id, contactIds: ["contact:saas"], singleCard: false, workspaceId: WORKSPACE }),
    );
    assert.deepEqual(replay, { jobId: jobs[0]!.id, sourceKey: batch.id, sourceKind: "batch", state: "enqueued" });
    assert.equal((await jobRows(pool)).length, 1);
  });
});

test("a completed batch with no confirmed contacts writes no job, and a rolled-back completion writes none", databaseTest, async () => {
  await withMatchingDatabase(async ({ ingest, pool }) => {
    const { batch, items } = await extractedBatch(ingest, ALICE, 2);
    for (const item of items) await ingest.skipItem({ actorId: ALICE, batchId: batch.id, itemId: item.id });
    assert.equal((await ingest.getBatch({ actorId: ALICE, batchId: batch.id }))?.batch.status, "completed");
    assert.equal((await jobRows(pool)).length, 0);

    const second = await extractedBatch(ingest, ALICE, 1);
    await assert.rejects(
      ingest.confirmItem({
        actorId: ALICE,
        allowFrom: ["extracted"] as const,
        batchId: second.batch.id,
        async createContact() {
          throw new Error("contact write failed");
        },
        itemId: second.items[0]!.id,
      }),
      /contact write failed/,
    );
    assert.equal((await jobRows(pool)).length, 0);
  });
});

test("single-card batches aggregate into one job per actor and Tokyo calendar day", databaseTest, async () => {
  await withMatchingDatabase(async ({ ingest, pool }) => {
    const first = await extractedBatch(ingest, ALICE, 1);
    await confirmItem(ingest, { actorId: ALICE, batchId: first.batch.id, contactId: "contact:saas", itemId: first.items[0]!.id });
    const second = await extractedBatch(ingest, ALICE, 1);
    await confirmItem(ingest, { actorId: ALICE, batchId: second.batch.id, contactId: "contact:ai", itemId: second.items[0]!.id });
    const bobs = await extractedBatch(ingest, BOB, 1);
    await confirmItem(ingest, { actorId: BOB, batchId: bobs.batch.id, contactId: "contact:bob-only", itemId: bobs.items[0]!.id });

    const jobs = await jobRows(pool);
    assert.equal(jobs.length, 2, "one day job for alice, one for bob");
    const alice = jobs.find((job) => job.actor_id === ALICE)!;
    assert.equal(alice.source_kind, "day");
    assert.match(alice.source_key, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual([...alice.batch_ids].sort(), [first.batch.id, second.batch.id].sort());
    assert.deepEqual([...alice.contact_ids].sort(), ["contact:ai", "contact:saas"]);
    // 当天结束（次日 00:00 JST）之后才到期。
    assert.ok(alice.not_before.getTime() > Date.now());
  });
});

test("the Tokyo day boundary, not the UTC day, splits single-card jobs", databaseTest, async () => {
  await withMatchingDatabase(async ({ pool }) => {
    const enqueue = (batchId: string, contactId: string, at: string) =>
      withTx(pool, (client) =>
        enqueuePlanMatchJob(client, { actorId: ALICE, at: new Date(at), batchId, contactIds: [contactId], singleCard: true, workspaceId: WORKSPACE }),
      );
    // 东京 9/28 01:00（UTC 9/27）与 东京 9/28 23:00（UTC 9/28）→ 同一天。
    const a = await enqueue("batch:a", "contact:saas", "2026-09-27T16:00:00Z");
    const b = await enqueue("batch:b", "contact:ai", "2026-09-28T14:00:00Z");
    // 东京 9/29 00:01 → 下一天。
    const c = await enqueue("batch:c", "contact:vc", "2026-09-28T15:01:00Z");
    assert.equal(a.state === "enqueued" && b.state === "enqueued" && a.jobId === b.jobId, true);
    assert.equal(c.state === "enqueued" && a.state === "enqueued" && c.jobId !== a.jobId, true);
    const jobs = await jobRows(pool);
    assert.deepEqual(
      jobs.map((job) => [job.source_key, [...job.batch_ids].sort(), [...job.contact_ids].sort(), job.not_before.toISOString()]),
      [
        ["2026-09-28", ["batch:a", "batch:b"], ["contact:ai", "contact:saas"], "2026-09-28T15:00:00.000Z"],
        ["2026-09-29", ["batch:c"], ["contact:vc"], "2026-09-29T15:00:00.000Z"],
      ],
    );
  });
});

test("batch completion still succeeds when the matching migration has not run yet", databaseTest, async () => {
  await withMatchingDatabase(async ({ ingest, pool }) => {
    await pool.query("drop table plan_match_candidates; drop table plan_match_job_contacts; drop table plan_match_jobs");
    const { batch, items } = await extractedBatch(ingest, ALICE, 1);
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[0]!.id });
    assert.equal((await ingest.getBatch({ actorId: ALICE, batchId: batch.id }))?.batch.status, "completed");
  });
});

/* ── SC-02：规则层 + AI 层 ──────────────────────────────────────────── */

test("the worker stores rule candidates and only in-scope AI pairs, billing exactly one call", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { ingest, matches, pool } = harness;
    const needs = await planWithNeeds(harness);
    await planWithNeeds(harness, BOB); // bob 也有计划：他的需求 id 不能被 alice 的任务用上
    const bobNeed = (await harness.planServiceFor(BOB).getCurrent())!.items.find((item) => item.kind === "network_need")!.id;
    const { batch, items } = await extractedBatch(ingest, ALICE, 5);
    const ids = ["contact:saas", "contact:ai", "contact:vc", "contact:none", "contact:other"];
    for (const [index, item] of items.entries()) {
      await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: ids[index]!, itemId: item.id });
    }
    const matcher = fakeMatcher(
      "normal",
      ({ investorNeed, saasNeed }) => [
        { contactId: "contact:none", needId: saasNeed, reason: "渠道经理，能介绍 SaaS 采购方" },
        { contactId: "contact:saas", needId: saasNeed, reason: "规则层已给出，重复丢弃" },
        { contactId: "contact:bob-only", needId: investorNeed, reason: "别人的联系人（越界）" },
        { contactId: "contact:none", needId: bobNeed, reason: "别人的需求（越界）" },
        { contactId: "contact:none", needId: "need:invented", reason: "编造的 id" },
        { contactId: 42, needId: saasNeed },
      ],
      needs,
    );
    const run = await runMatchJobForBatch(worker(matches, matcher), { actorId: ALICE, batchId: batch.id });
    assert.equal(run.state, "ran");
    assert.equal(matcher.calls, 1);

    const rows = await candidates(pool);
    assert.deepEqual(
      rows.map((row) => [row.contact_id, row.need_item_id === needs.saasNeed ? "saas" : row.need_item_id === needs.investorNeed ? "investor" : row.need_item_id, row.tier, row.strength]),
      [
        ["contact:ai", "saas", "rule", "candidate"],
        ["contact:none", "saas", "ai", "candidate"],
        ["contact:saas", "saas", "rule", "strong"],
        ["contact:vc", "investor", "rule", "candidate"],
      ],
    );
    const [job] = await jobRows(pool);
    assert.equal(job!.status, "completed");
    assert.equal(job!.ai_state, "succeeded");
    assert.equal(job!.rule_hits, 3);
    assert.equal(job!.ai_hits, 1);
    assert.deepEqual(job!.ai_usage, { inputTokens: 420, latencyMs: 12, outputTokens: 36 });

    // 再触发一次（审阅页刷新）：任务已完成，不再调用。
    const again = await runMatchJobForBatch(worker(matches, matcher), { actorId: ALICE, batchId: batch.id });
    assert.equal(again.state, "completed");
    assert.equal(matcher.calls, 1);
  });
});

test("an AI timeout keeps the rule results and marks the AI layer failed", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { ingest, matches, pool } = harness;
    await planWithNeeds(harness);
    const { batch, items } = await extractedBatch(ingest, ALICE, 2);
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[0]!.id });
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:vc", itemId: items[1]!.id });
    const matcher = fakeMatcher("timeout");
    const run = await runMatchJobForBatch(worker(matches, matcher, 30), { actorId: ALICE, batchId: batch.id });
    assert.equal(run.state === "ran" && run.outcome.aiState, "failed");
    assert.equal((await candidates(pool)).length, 2);
    const [job] = await jobRows(pool);
    assert.equal(job!.status, "completed");
    assert.equal(job!.ai_state, "failed");
    assert.equal(matcher.calls, 1);
  });
});

test("a crashed attempt is retried by the sweeper without a second billed call", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { ingest, matches, pool } = harness;
    await planWithNeeds(harness);
    const { batch, items } = await extractedBatch(ingest, ALICE, 2);
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[0]!.id });
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:none", itemId: items[1]!.id });
    const matcher = fakeMatcher("normal");
    // 第一次：AI 已调用（计费已发生），之后写库失败，任务回到 pending。
    let failOnce = true;
    const flaky: PlanMatchRepository = {
      ...matches,
      async finishAi(input) {
        if (failOnce && input.state === "succeeded") {
          failOnce = false;
          throw new Error("connection reset");
        }
        return matches.finishAi(input);
      },
    };
    const first = await runMatchJobForBatch(worker(flaky, matcher), { actorId: ALICE, batchId: batch.id });
    assert.equal(first.state === "ran" && first.outcome.status, "retry");
    let [job] = await jobRows(pool);
    assert.equal(job!.status, "pending");
    assert.equal(job!.ai_state, "started");
    assert.equal(matcher.calls, 1);

    // 维护任务重试：规则结果照常写入，AI 不再调用。
    const summary = await runDueMatchJobs(worker(matches, matcher), { deadline: Date.now() + 10_000, limit: 5 });
    assert.deepEqual(summary, { aiCalls: 0, completed: 1, examined: 1, retried: 0 });
    assert.equal(matcher.calls, 1);
    [job] = await jobRows(pool);
    assert.equal(job!.status, "completed");
    assert.equal(job!.ai_state, "started");
    assert.equal(job!.attempt_count, 2);
    assert.equal((await candidates(pool)).length, 1);

    // 执行者在调用中途消失（租约过期、ai_state 已是 started）：同样不再调用。
    await pool.query(`update plan_match_jobs set status = 'running', lease_token = 'dead', lease_expires_at = now() - interval '1 second', completed_at = null`);
    await runDueMatchJobs(worker(matches, matcher), { deadline: Date.now() + 10_000, limit: 5 });
    assert.equal(matcher.calls, 1);
    assert.equal((await jobRows(pool))[0]!.status, "completed");
  });
});

test("invalid AI output is recorded with its usage and never retried", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { ingest, matches, pool } = harness;
    await planWithNeeds(harness);
    const { batch, items } = await extractedBatch(ingest, ALICE, 2);
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[0]!.id });
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:ai", itemId: items[1]!.id });
    const matcher = fakeMatcher("invalid");
    await runMatchJobForBatch(worker(matches, matcher), { actorId: ALICE, batchId: batch.id });
    const [job] = await jobRows(pool);
    assert.equal(job!.ai_state, "failed");
    assert.deepEqual(job!.ai_usage, { inputTokens: 300, latencyMs: 5, outputTokens: 2 });
    assert.equal((await candidates(pool)).length, 2);
  });
});

test("contacts already linked to a need are not prompted for it again, and no provider means no call", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { ingest, matches, pool } = harness;
    const needs = await planWithNeeds(harness);
    await harness.planServiceFor(ALICE).updateItem({ change: { contactId: "contact:saas", op: "link_contact" }, itemId: needs.saasNeed });
    const { batch, items } = await extractedBatch(ingest, ALICE, 2);
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[0]!.id });
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:ai", itemId: items[1]!.id });
    await runMatchJobForBatch(worker(matches, null), { actorId: ALICE, batchId: batch.id });
    const rows = await candidates(pool);
    assert.deepEqual(rows.map((row) => row.contact_id), ["contact:ai"]);
    assert.equal((await jobRows(pool))[0]!.ai_state, "skipped");
  });
});

test("the review trigger never claims another actor's batch", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { ingest, matches, pool } = harness;
    await planWithNeeds(harness);
    const { batch, items } = await extractedBatch(ingest, ALICE, 2);
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[0]!.id });
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:ai", itemId: items[1]!.id });
    const matcher = fakeMatcher("normal");
    assert.deepEqual(await runMatchJobForBatch(worker(matches, matcher), { actorId: BOB, batchId: batch.id }), { state: "missing" });
    assert.equal(matcher.calls, 0);
    assert.equal((await jobRows(pool))[0]!.status, "pending");
  });
});

test("a single-card day job previews rule matches in-request and bills AI once when the day is over", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { ingest, matches, pool } = harness;
    await planWithNeeds(harness);
    const { batch, items } = await extractedBatch(ingest, ALICE, 1);
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[0]!.id });
    const matcher = fakeMatcher("normal");
    const preview = await runMatchJobForBatch(worker(matches, matcher), { actorId: ALICE, batchId: batch.id });
    assert.deepEqual(preview, { ruleHits: 1, state: "rule_preview" });
    assert.equal(matcher.calls, 0);
    // 当天未结束：维护任务也不领取。
    assert.deepEqual(await runDueMatchJobs(worker(matches, matcher), { deadline: Date.now() + 10_000, limit: 5 }), {
      aiCalls: 0,
      completed: 0,
      examined: 0,
      retried: 0,
    });
    await makeDue(pool);
    const summary = await runDueMatchJobs(worker(matches, matcher), { deadline: Date.now() + 10_000, limit: 5 });
    assert.equal(summary.completed, 1);
    assert.equal(summary.aiCalls, 1);
    assert.equal(matcher.calls, 1);
    assert.equal((await candidates(pool)).length, 1, "the previewed rule pair is not duplicated");
  });
});

test("the plan-match maintenance task completes a pending job without any browser", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { ingest, matches, pool } = harness;
    await planWithNeeds(harness);
    const { batch, items } = await extractedBatch(ingest, ALICE, 2);
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[0]!.id });
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:vc", itemId: items[1]!.id });
    assert.equal((await jobRows(pool))[0]!.status, "pending");
    const matcher = fakeMatcher("normal");
    const lines: string[] = [];
    const pass = await runMaintenancePass({
      log: (line) => lines.push(line),
      tasks: [createPlanMatchMaintenanceTask({ resolveWorker: () => worker(matches, matcher) })],
    });
    assert.equal(pass.ok, 1);
    assert.equal(pass.tasks[0]!.name, "plan-match");
    // W0050（D46③）：同一轮先为生效计划补入队一条 'plan' 任务（只跑规则层、不调 AI），再领取两条任务。
    assert.deepEqual(pass.tasks[0]!.summary, { aiCalls: 1, completed: 2, examined: 2, planJobsEnqueued: 1, retried: 0 });
    const jobs = await jobRows(pool);
    assert.deepEqual(jobs.map((job) => [job.source_kind, job.status]), [["batch", "completed"], ["plan", "completed"]]);
    assert.equal(jobs[1]!.ai_state, "skipped");
    // 批次的两位（saas、vc）+ 'plan' 任务对照现有联系人新增的 ai（SaaS 需求同一级行业）；同一对不重复。
    assert.deepEqual((await candidates(pool)).map((row) => row.contact_id), ["contact:ai", "contact:saas", "contact:vc"]);

    // 表不存在（生产迁移尚未授权执行）：跳过，不报警。
    await pool.query("drop table plan_match_candidates; drop table plan_match_job_contacts; drop table plan_match_jobs");
    const skipped = await runMaintenancePass({
      log: () => undefined,
      tasks: [createPlanMatchMaintenanceTask({ resolveWorker: () => worker(matches, matcher) })],
    });
    assert.equal(skipped.tasks[0]!.status, "skipped");
    assert.equal(skipped.tasks[0]!.reason, "schema_missing");
    // 未配置数据库：跳过。
    const unconfigured = await runMaintenancePass({
      log: () => undefined,
      tasks: [createPlanMatchMaintenanceTask({ resolveWorker: () => null })],
    });
    assert.equal(unconfigured.tasks[0]!.reason, "database_unconfigured");
  });
});

test("the day sweep sends all contacts of the day and every active need (no 40-need cap) in one call, newest need first", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { ingest, matches, pool } = harness;
    const base = matchingPlanInput();
    const extraNeeds = Array.from({ length: 45 }, (_, index) => ({
      criteria: { description: null, primaryIndustryId: null, secondaryIndustryId: null, titleKeywords: [] },
      kind: "network_need" as const,
      phaseKey: "p3",
      title: `额外需求 ${index + 1}`,
    }));
    await harness.planServiceFor(ALICE).createVersion({ ...base, items: [...base.items, ...extraNeeds] });
    for (const contactId of ["contact:saas", "contact:none"]) {
      const { batch, items } = await extractedBatch(ingest, ALICE, 1);
      await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId, itemId: items[0]!.id });
    }
    const seen: Array<{ contacts: number; needs: string[] }> = [];
    const matcher: PlanAiMatcher = {
      model: "fake",
      providerName: "fake",
      async match({ contacts, needs }) {
        seen.push({ contacts: contacts.length, needs: needs.map((need) => need.title) });
        return { model: "fake", proposals: [], usage: { inputTokens: 1, latencyMs: 1, outputTokens: 1 } };
      },
    };
    await makeDue(pool);
    const summary = await runDueMatchJobs(worker(matches, matcher), { deadline: Date.now() + 10_000, limit: 5 });
    assert.equal(summary.aiCalls, 1);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.contacts, 2, "the day job aggregates both single-card batches");
    assert.equal(seen[0]!.needs.length, 47);
    assert.equal(seen[0]!.needs[0], "额外需求 45", "needs are read newest first");
  });
});

/* ── W0015：在活动上认识的人，与该活动关联的需求优先 ───────────────────── */

test("W0015: needs in the same phase as the event where the contact was met are listed first", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { ingest, matches, pool } = harness;
    const { createPlanService } = await import("../../features/plans/service");
    const { createPostgresPlanRepository } = await import("../../features/plans/repository");
    const { createAllowListPlanReferenceValidator } = await import("../../features/plans/reference-validator");
    const { createPlanMatchingService } = await import("../../features/plans/matching-service");
    const { planInput } = await import("../support/plan-fixture");
    const plans = createPlanService({
      references: createAllowListPlanReferenceValidator({ actorId: ALICE, allowList: { contactsByActor: "any", eventIds: ["event:mixer"] } }),
      repository: createPostgresPlanRepository({ pool }),
      scope: { actorId: ALICE, workspaceId: WORKSPACE },
    });
    const snapshot = await plans.createVersion(planInput({
      items: [
        {
          criteria: { description: null, primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.enterprise_software", titleKeywords: [] },
          kind: "network_need",
          phaseKey: "p1",
          title: NEED_SAAS,
        },
        {
          criteria: { description: null, primaryIndustryId: "technology_internet", secondaryIndustryId: null, titleKeywords: [] },
          kind: "network_need",
          phaseKey: "p2",
          title: "活动上的技术人",
        },
        { kind: "event", linkedEventId: "event:mixer", phaseKey: "p2", title: "Tokyo Startup Mixer" },
      ],
    }));
    const saasNeed = snapshot.items.find((item) => item.title === NEED_SAAS)!.id;
    const eventNeed = snapshot.items.find((item) => item.title === "活动上的技术人")!.id;
    // 佐藤是在 Mixer 上认识的（名片确认时写入 metEventId）。
    await pool.query(
      `update orbit_records set payload = payload || '{"metEventId":"event:mixer","metEventTitle":"Tokyo Startup Mixer"}'::jsonb
       where workspace_id = $1 and record_id = 'contact:saas'`,
      [WORKSPACE],
    );

    const needs = await matches.readActiveNeeds(ALICE);
    assert.deepEqual(Object.fromEntries(needs.map((need) => [need.id, need.eventIds])), { [eventNeed]: ["event:mixer"], [saasNeed]: [] });
    const [saas, ai] = await matches.readContacts(ALICE, ["contact:saas", "contact:ai"]);
    assert.equal(saas!.metEventId, "event:mixer");
    assert.equal(ai!.metEventId, null);

    const { batch, items } = await extractedBatch(ingest, ALICE, 2);
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:ai", itemId: items[0]!.id });
    await confirmItem(ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[1]!.id });
    const service = createPlanMatchingService({
      planServiceFor: harness.planServiceFor,
      repository: matches,
      worker: worker(matches, null),
    });
    const { view } = await service.runForBatch({ actorId: ALICE, batchId: batch.id });
    assert.equal(view.candidates.length, 4);
    // 佐藤 × 活动那一阶段的需求（只是一级候选）排在最前；其余保持原有顺序。
    assert.deepEqual([view.candidates[0]!.contactId, view.candidates[0]!.needId], ["contact:saas", eventNeed]);
    assert.equal(view.candidates.filter((candidate) => candidate.contactId === "contact:saas" && candidate.needId === eventNeed).length, 1);

    // 排序在 LIMIT 之前：把活动关联的候选改成最旧的一条，其余三条更新；只取 1 条时仍是它。
    await pool.query(
      `update plan_match_candidates set created_at = case
         when contact_id = 'contact:saas' and need_item_id = $1 then now() - interval '30 days'
         else now() end`,
      [eventNeed],
    );
    const page = await matches.listPendingCandidates({ actorId: ALICE, limit: 1 });
    assert.deepEqual(page.map((candidate) => [candidate.contactId, candidate.needItemId]), [["contact:saas", eventNeed]]);
    const two = await matches.listPendingCandidates({ actorId: ALICE, limit: 2 });
    assert.equal(two.length, 2);
    assert.equal(two[0]!.needItemId, eventNeed);
    // 他人的查询看不到 alice 的候选，也不会因为 alice 的联系人而改变排序。
    assert.deepEqual(await matches.listPendingCandidates({ actorId: BOB, limit: 5 }), []);
  });
});
