/**
 * R22 SC-R22-05 / 06 / 09（真实 PostgreSQL，本机回环库）：v2 计分在并发下同人同类型只记一次；
 * 确定 v2 时归档 v1；v1 的仓储与服务看不到 v2；已有 v2 时不能再生成 v1；v2 计划能入队候补匹配。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService, PlanServiceError } from "../../features/plans/service";
import { ENQUEUE_PLAN_JOB_SQL } from "../../features/plans/plan-match-plan-job";
import { createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";
import { planInput } from "../support/plan-fixture";
import { ANY_REFERENCES, draftInput, steppingClock } from "../plans/v2-fixture";

const ACTOR = "actor:alice";

function services(pool: import("pg").Pool) {
  const scope = { actorId: ACTOR, workspaceId: WORKSPACE };
  let n = 0;
  const v1 = createPlanService({
    references: createAllowListPlanReferenceValidator({ actorId: ACTOR, allowList: { contactsByActor: "any", eventIds: "any" } }),
    repository: createPostgresPlanRepository({ pool }),
    scope,
  });
  const v2 = createPlanV2Service({ newId: () => `pg${(n += 1)}`, now: steppingClock(), references: ANY_REFERENCES, repository: createPostgresPlanV2Repository({ pool }), scope });
  return { v1, v2 };
}

test("confirming a v2 plan archives the v1 plan; v1 reads and writes no longer see it; a new v1 plan is refused", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { v1, v2 } = services(pool);
    const old = await v1.createVersion(planInput({ basePlanId: null }));
    assert.equal((await v1.getCurrent())?.plan.id, old.plan.id);
    const created = await v2.createPlanFromDraft(draftInput());
    assert.equal(created.archivedV1PlanId, old.plan.id);
    assert.equal(await v1.getCurrent(), null);
    assert.equal(await v1.getCurrentView(), null);
    assert.equal(await v1.getPlan(created.plan.planId), null, "a v2 plan does not exist for v1");
    assert.deepEqual((await v1.listVersions()).map((plan) => plan.id), [old.plan.id]);
    const v2Item = created.plan.content.personTypes[0]!.itemId;
    await assert.rejects(v1.updateItem({ change: { contactId: "contact:x", op: "link_contact" }, itemId: v2Item }), (error: unknown) => error instanceof PlanServiceError && error.reason === "ITEM_NOT_FOUND");
    await assert.rejects(v1.createVersion(planInput({ basePlanId: null, creationKey: "again" })), (error: unknown) => error instanceof PlanServiceError && error.reason === "V2_PLAN_ACTIVE");
    const rows = (await pool.query("select id, model_version, status, version from plans order by version")).rows;
    assert.deepEqual(rows.map((row) => [row.model_version, row.status]), [[1, "archived"], [2, "active"]]);
    assert.ok(rows[1].version > rows[0].version);
  });
});

test("two concurrent awards for the same person and type record exactly one score", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { v2 } = services(pool);
    const { plan } = await v2.createPlanFromDraft(draftInput());
    const itemId = plan.content.personTypes.find((type) => type.key === "vc_partner")!.itemId;
    const results = await Promise.all(["k1", "k2", "k3"].map((key) => v2.award({ itemId, planId: plan.planId, request: { basis: "talked", contactId: "contact:t", idempotencyKey: key } })));
    assert.equal(results.filter((result) => result.part === "base").length, 1);
    assert.equal(results.filter((result) => result.reason === "already_counted").length, 2);
    const awarded = (await pool.query("select count(*)::int as n from plan_log where plan_id = $1 and event = 'score_awarded'", [plan.planId])).rows[0].n;
    assert.equal(awarded, 1);
    const detail = await v2.detail(plan.planId);
    assert.equal(detail!.score.total, 10);
    assert.equal(detail!.revision, 1);
    const links = (await pool.query("select contact_links, status from plan_items where id = $1", [itemId])).rows[0];
    assert.equal(links.status, "established");
  });
});

test("undo and re-record use a fresh unique key; skip and unskip round-trip in the database", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { v2 } = services(pool);
    const { plan } = await v2.createPlanFromDraft(draftInput());
    const itemId = plan.content.personTypes.find((type) => type.key === "vc_partner")!.itemId;
    const first = await v2.award({ itemId, planId: plan.planId, request: { basis: "talked", contactId: "contact:t", idempotencyKey: "a" } });
    await v2.undo({ idempotencyKey: "u", logId: first.awardLogId!, planId: plan.planId });
    const again = await v2.award({ itemId, planId: plan.planId, request: { basis: "talked", contactId: "contact:t", idempotencyKey: "b" } });
    assert.equal(again.points, 10);
    const keys = (await pool.query("select idempotency_key from plan_log where plan_id = $1 and event = 'score_awarded' order by seq", [plan.planId])).rows.map((row) => row.idempotency_key);
    assert.deepEqual(keys, [`score:${plan.planId}:vc_partner:contact:t:1`, `score:${plan.planId}:vc_partner:contact:t:2`]);
    const skipped = await v2.skip({ idempotencyKey: "s", itemId, planId: plan.planId });
    assert.equal(skipped.score.total, 30);
    assert.ok((await pool.query("select skipped_at from plan_items where id = $1", [itemId])).rows[0].skipped_at);
    const back = await v2.unskip({ idempotencyKey: "s2", itemId, planId: plan.planId });
    assert.equal(back.score.total, 10);
  });
});

test("R24: v2 types join the matching pipeline (job, needs without skipped types); accepting a v2 candidate only links it", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { v1, v2 } = services(pool);
    const { plan } = await v2.createPlanFromDraft(draftInput());
    const queued = await pool.query(ENQUEUE_PLAN_JOB_SQL, [WORKSPACE, ACTOR, plan.planId, "job-1"]);
    assert.equal(queued.rows.length, 1);
    const { createPostgresPlanMatchRepository } = await import("../../features/plans/matching-repository");
    const { createPlanMatchingService } = await import("../../features/plans/matching-service");
    const repository = createPostgresPlanMatchRepository({ pool, workspaceId: WORKSPACE });
    const types = plan.content.personTypes;
    assert.equal((await repository.readActiveNeeds(ACTOR)).length, types.length);
    await v2.skip({ idempotencyKey: "skip-lawyer", itemId: types.find((type) => type.key === "lawyer")!.itemId, planId: plan.planId });
    const needs = await repository.readActiveNeedViews(ACTOR);
    assert.equal(needs.length, types.length - 1, "a skipped type is not a need");
    assert.equal(await repository.needModelVersion!({ actorId: ACTOR, needItemId: types[0]!.itemId }), 2);
    const vc = types.find((type) => type.key === "vc_partner")!;
    await pool.query(
      `insert into plan_match_candidates (workspace_id, id, actor_id, job_id, plan_id, need_item_id, contact_id, tier, strength)
       values ($1, 'cand-1', $2, 'job-1', $3, $4, 'contact:vc-9', 'rule', 'strong')`,
      [WORKSPACE, ACTOR, plan.planId, vc.itemId],
    );
    const matching = createPlanMatchingService({ planServiceFor: () => v1, planV2For: () => v2, repository, worker: {} as never });
    const decided = await matching.decide({ actorId: ACTOR, candidateId: "cand-1", decision: "accept" });
    assert.equal(decided.status, "accepted");
    assert.equal(decided.link, null, "no v1 「約 TA」 action");
    const replay = await matching.decide({ actorId: ACTOR, candidateId: "cand-1", decision: "accept" });
    assert.equal(replay.replayed, true);
    const item = (await pool.query("select contact_links, status from plan_items where id = $1", [vc.itemId])).rows[0];
    assert.deepEqual(item.contact_links.map((link: { contactId: string; state: string }) => [link.contactId, link.state]), [["contact:vc-9", "linked"]]);
    assert.equal(item.status, "linked");
    assert.equal(Number((await pool.query("select count(*) from plan_items where plan_id = $1 and kind = 'action'", [plan.planId])).rows[0].count), 0);
    const detail = await v2.typeDetail(plan.planId, vc.itemId);
    assert.equal(detail!.candidates.length, 0, "a linked person is no longer a candidate");
  });
});

test("v1 maintenance queries (phase entry, phase refinement, event status, event attribution) skip v2 plans", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { v2 } = services(pool);
    const { plan } = await v2.createPlanFromDraft(draftInput());
    await v2.addEventToPlan({ eventId: "event:1", planId: plan.planId, title: "CFO Night" });
    // 给 v2 计划塞一个像 v1 阶段的 phases（防御：即使形状像，也不能被 v1 维护任务处理）。
    await pool.query(`update plans set phases = '[{"key":"a","startWeek":1,"endWeek":2},{"key":"b","startWeek":1,"endWeek":9}]'::jsonb, analysis = analysis || '{"generator":"ai"}'::jsonb where id = $1`, [plan.planId]);
    await pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
       values ($1, 'contacts', 'contact:met', $2, 'manual', 'x', 'active', '{"metEventId":"event:1"}'::jsonb, now(), now())`,
      [WORKSPACE, ACTOR],
    );
    const { createPostgresPlanMatchRepository } = await import("../../features/plans/matching-repository");
    const repository = createPostgresPlanMatchRepository({ pool, workspaceId: WORKSPACE });
    assert.deepEqual(await repository.listActorsEnteringPhase({ limit: 10, today: "2026-10-20" }), []);
    assert.deepEqual(await repository.listActorsNeedingPhaseRefinement({ aiGeneratorId: "ai", limit: 10, today: "2026-10-20" }), []);
    assert.deepEqual(await repository.listActiveEventItems({ limit: 10 }), []);
    assert.deepEqual(await repository.listUnattendedAttributedEvents({ limit: 10 }), []);
  });
});

test("review M3: the database itself refuses a second score row with the same award key", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { v2 } = services(pool);
    const { plan } = await v2.createPlanFromDraft(draftInput());
    const itemId = plan.content.personTypes.find((type) => type.key === "vc_partner")!.itemId;
    await v2.award({ itemId, planId: plan.planId, request: { basis: "talked", contactId: "contact:t", idempotencyKey: "a" } });
    const insert = () => pool.query(
      `insert into plan_log (workspace_id, id, actor_id, plan_id, item_id, kind, event, author, body, idempotency_key)
       values ($1, $2, $3, $4, $5, 'auto', 'score_awarded', 'user', 'dup', $6)`,
      [WORKSPACE, `dup-${Math.random()}`, ACTOR, plan.planId, itemId, `score:${plan.planId}:vc_partner:contact:t:1`],
    );
    await assert.rejects(insert(), (error: unknown) => (error as { code?: string }).code === "23505");
  });
});

test("review m10: the v1 weekly summary log reader skips v2 score records", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { v1, v2 } = services(pool);
    const old = await v1.createVersion(planInput({ basePlanId: null }));
    const created = await v2.createPlanFromDraft(draftInput());
    const itemId = created.plan.content.personTypes[0]!.itemId;
    await v2.award({ itemId, planId: created.plan.planId, request: { basis: "talked", contactId: "contact:weekly", idempotencyKey: "weekly-1" } });
    const v2Rows = (await pool.query("select count(*)::int as n from plan_log where plan_id = $1", [created.plan.planId])).rows[0].n;
    assert.ok(v2Rows > 0, "the v2 plan has log rows");
    const entries = await createPostgresPlanRepository({ pool }).read({ actorId: ACTOR, workspaceId: WORKSPACE }, (reader) => reader.logBetween("2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z", 500));
    assert.ok(entries.length > 0, "v1 log rows are still read");
    assert.ok(entries.every((entry) => entry.planId === old.plan.id), "no v2 log row reaches the weekly summary");
  });
});
