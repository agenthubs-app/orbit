/**
 * W0050 SC-02（真实 PostgreSQL，`ORBIT_EVENT_DATABASE_URL` 回环库、随机 schema）：现有联系人进「待确认」（W50-2、D46③）。
 *
 * - 迁移 v4（source_kind 加 'plan'）可重复执行，约束接受 'plan'、拒绝其他值；
 * - 计划保存后入队 1 个 'plan' 任务（重复保存同一版本仍 1 个），ai_state = skipped；执行 0 次 AI、每条需求 ≤3 个候选
 *   （强匹配优先、再按添加时间新到旧），已 dismissed 与已关联的不动；
 * - `plan-match` 维护任务兜底：生效计划缺 'plan' 任务时一轮补入队 1 个（重复跑仍 1 个），随后照常领取、0 次 AI；
 *   每轮不超过 PLAN_MATCH_PLAN_BACKFILL_LIMIT。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { Pool } from "pg";

import type { PlanAiMatcher } from "../../features/plans/ai-matcher";
import { createPlanMatchMaintenanceTask } from "../../features/plans/match-maintenance-task";
import type { PlanMatchWorkerDeps } from "../../features/plans/match-worker";
import { PLAN_MATCHING_MIGRATIONS, runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import type { PlanMatchRepository } from "../../features/plans/matching-repository";
import { enqueuePlanSourceMatchAfterSave } from "../../features/plans/matching-runtime";
import { PLAN_MATCH_PLAN_BACKFILL_LIMIT } from "../../features/plans/plan-match-plan-job";
import { runMaintenancePass } from "../../features/operations/maintenance/pass";
import {
  ALICE,
  BOB,
  databaseTest,
  jobRows,
  matchingPlanInput,
  NEED_INVESTOR,
  NEED_SAAS,
  withMatchingDatabase,
  WORKSPACE,
  type MatchingHarness,
} from "../support/plan-matching-harness";

function countingMatcher(): PlanAiMatcher & { calls: number } {
  const matcher = {
    calls: 0,
    model: "fake-text-model",
    providerName: "fake",
    async match() {
      matcher.calls += 1;
      return { model: "fake-text-model", proposals: [], usage: { inputTokens: 1, latencyMs: 1, outputTokens: 1 } };
    },
  };
  return matcher;
}

function worker(matches: PlanMatchRepository, aiMatcher: PlanAiMatcher): PlanMatchWorkerDeps {
  return { aiMatcher, aiTimeoutMs: 5_000, repository: matches };
}

async function addContact(pool: Pool, actorId: string, id: string, at: string, payload: Record<string, unknown>) {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
     values ($1, 'contacts', $2, $3, 'manual', 'w0050-test', 'active', $4::jsonb, $5, $5)`,
    [WORKSPACE, id, actorId, JSON.stringify({ displayName: id, id, ...payload }), at],
  );
}

async function candidates(pool: Pool) {
  return (await pool.query(`select need_item_id, contact_id, strength, status, job_id from plan_match_candidates order by need_item_id, contact_id`)).rows as Array<{
    need_item_id: string; contact_id: string; strength: string; status: string; job_id: string;
  }>;
}

async function planWithNeeds(harness: MatchingHarness, actorId = ALICE) {
  const snapshot = await harness.planServiceFor(actorId).createVersion(matchingPlanInput());
  return {
    investorNeed: snapshot.items.find((item) => item.title === NEED_INVESTOR)!.id,
    planId: snapshot.plan.id,
    saasNeed: snapshot.items.find((item) => item.title === NEED_SAAS)!.id,
  };
}

test("migration v4: reruns idempotently and the source_kind check accepts 'plan' but nothing else", databaseTest, async () => {
  await withMatchingDatabase(async ({ pool }) => {
    assert.deepEqual(PLAN_MATCHING_MIGRATIONS.map((migration) => migration.version), [1, 2, 3, 4]);
    const ledger = async () => (await pool.query("select version, checksum, applied_at from plan_matching_schema_migrations order by version")).rows;
    const before = await ledger();
    assert.equal(before.length, 4);
    await runPlanMatchingMigrations(pool);
    await runPlanMatchingMigrations(pool);
    assert.deepEqual(await ledger(), before);
    const checks = (await pool.query(`select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'plan_match_jobs'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%source_kind%'`)).rows;
    assert.equal(checks.length, 1);
    assert.match(String(checks[0]!.def), /'plan'/);
    const insert = (kind: string) => pool.query(
      `insert into plan_match_jobs (workspace_id, id, actor_id, source_kind, source_key) values ($1, $2, $3, $4, $2)`,
      [WORKSPACE, `job:${kind}`, ALICE, kind],
    );
    await insert("plan");
    await assert.rejects(insert("bogus"), /check constraint/);
  });
});

test("after a plan is saved one 'plan' job is enqueued (repeat saves keep one); it runs the rule layer only — 0 AI, ≤3 per need, dismissed and linked untouched", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { matches, pool } = harness;
    // alice 再添三位科技联系人（规则命中 SaaS 需求的候选，添加时间新到旧：t3 > t2 > t1）
    await addContact(pool, ALICE, "contact:t1", "2099-09-01T00:00:00Z", { primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" });
    await addContact(pool, ALICE, "contact:t2", "2099-09-02T00:00:00Z", { primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" });
    await addContact(pool, ALICE, "contact:t3", "2099-09-03T00:00:00Z", { primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" });
    const { investorNeed, planId, saasNeed } = await planWithNeeds(harness);
    // 已关联：vc 关联到投资人需求（不应再成为候选）
    await harness.planServiceFor(ALICE).linkNeedContact({ contactId: "contact:vc", contactName: "鈴木", needItemId: investorNeed });
    // 已忽略：一个旧批次任务留下的 dismissed 候选 (SaaS 需求, contact:ai)
    await pool.query(`insert into plan_match_jobs (workspace_id, id, actor_id, source_kind, source_key, status, completed_at) values ($1, 'job:old', $2, 'batch', 'batch:old', 'completed', now())`, [WORKSPACE, ALICE]);
    await pool.query(
      `insert into plan_match_candidates (workspace_id, id, actor_id, job_id, plan_id, need_item_id, contact_id, tier, strength, status, decided_at)
       values ($1, 'cand:dismissed', $2, 'job:old', $3, $4, 'contact:ai', 'rule', 'candidate', 'dismissed', now())`,
      [WORKSPACE, ALICE, planId, saasNeed],
    );

    const matcher = countingMatcher();
    const tasks: Array<() => Promise<void>> = [];
    const runtime = { repository: matches, worker: worker(matches, matcher) } as never;
    await enqueuePlanSourceMatchAfterSave({ actorId: ALICE, planId }, { after: (task) => tasks.push(task), runtime });
    await enqueuePlanSourceMatchAfterSave({ actorId: ALICE, planId }, { after: (task) => tasks.push(task), runtime });
    const jobs = (await jobRows(pool)).filter((job) => job.source_kind === "plan");
    assert.equal(jobs.length, 1, "the same plan version keeps one 'plan' job");
    assert.equal(jobs[0]!.source_key, planId);
    assert.equal(jobs[0]!.ai_state, "skipped");
    assert.equal(jobs[0]!.contact_ids[0], "contact:t3", "contacts newest first");
    assert.ok(!jobs[0]!.contact_ids.includes("contact:bob-only"), "only the actor's own contacts");
    assert.equal(tasks.length, 1, "only the first save schedules a run");

    await tasks[0]!();
    const [job] = (await jobRows(pool)).filter((row) => row.source_kind === "plan");
    assert.equal(job!.status, "completed");
    assert.equal(job!.ai_state, "skipped");
    assert.equal(matcher.calls, 0, "no AI call");
    const rows = await candidates(pool);
    const saas = rows.filter((row) => row.need_item_id === saasNeed && row.job_id === job!.id);
    assert.ok(saas.length <= 3);
    // 强匹配（二级行业相同）contact:saas 在前，其余按添加时间新到旧：t3、t2；ai 已忽略、t1 被裁掉
    assert.deepEqual(saas.map((row) => row.contact_id).sort(), ["contact:saas", "contact:t2", "contact:t3"]);
    assert.deepEqual(rows.filter((row) => row.contact_id === "contact:ai" && row.need_item_id === saasNeed).map((row) => row.status), ["dismissed"], "dismissed stays dismissed, no duplicate");
    assert.equal(rows.filter((row) => row.need_item_id === investorNeed && row.contact_id === "contact:vc").length, 0, "linked contact is not suggested again");
    assert.ok(rows.every((row) => row.contact_id !== "contact:bob-only"));
  });
});

test("D46③: the plan-match maintenance task enqueues a missing 'plan' job once (reruns keep one), then runs it with 0 AI; each round is capped", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { matches, pool } = harness;
    await planWithNeeds(harness);
    await planWithNeeds(harness, BOB);
    const matcher = countingMatcher();
    const task = createPlanMatchMaintenanceTask({ resolveWorker: () => worker(matches, matcher) });
    const first = await runMaintenancePass({ log: () => undefined, tasks: [task] });
    assert.equal(first.tasks[0]!.status, "ok");
    assert.equal(first.tasks[0]!.summary?.planJobsEnqueued, 2);
    assert.equal(first.tasks[0]!.summary?.completed, 2);
    assert.equal(first.tasks[0]!.summary?.aiCalls, 0);
    const second = await runMaintenancePass({ log: () => undefined, tasks: [task] });
    assert.equal(second.tasks[0]!.summary?.planJobsEnqueued, 0);
    const jobs = (await jobRows(pool)).filter((job) => job.source_kind === "plan");
    assert.equal(jobs.length, 2, "one per active plan");
    assert.ok(jobs.every((job) => job.status === "completed" && job.ai_state === "skipped"));
    assert.equal(matcher.calls, 0);

    // 每轮上限：再造 PLAN_MATCH_PLAN_BACKFILL_LIMIT + 2 份生效计划，第一轮只补上限份，第二轮补剩下的。
    for (let index = 0; index < PLAN_MATCH_PLAN_BACKFILL_LIMIT + 2; index += 1) await planWithNeeds(harness, `actor:extra-${index}`);
    assert.equal(await matches.enqueueMissingPlanJobs!({ limit: 100 }), PLAN_MATCH_PLAN_BACKFILL_LIMIT, "the cap holds even if a larger limit is asked");
    assert.equal(await matches.enqueueMissingPlanJobs!({ limit: PLAN_MATCH_PLAN_BACKFILL_LIMIT }), 2);
    assert.equal(await matches.enqueueMissingPlanJobs!({ limit: PLAN_MATCH_PLAN_BACKFILL_LIMIT }), 0);
  });
});
