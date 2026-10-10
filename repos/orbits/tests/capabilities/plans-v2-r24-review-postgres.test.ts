/**
 * R24 独立复核（真实 PostgreSQL，本机回环库 `ORBIT_EVENT_DATABASE_URL`）：
 * - S1：memo 提议 → pending → 确认（计分）/ 不采用 → Step 建议「まだ」整条链在表约束下可用；
 * - M1：不采用后再确认不加分；确认重放只加一次；
 * - M2：线下聊过「新しく登録」同键重试（含并发）只建一人；建联系人失败报 CONTACT_CREATE_FAILED；
 * - M4：v2 的イベント枠对账（名片归属 metEventId → 计分；撤销过的不补回）；
 * - M7：R24 新接口的他人隔离回归；「已撤销的计分不算互动」对关系强度（时间线、stamp）、信号条目、近期记录各一条。
 * 由复核人探针 r24-probe.test.ts 改写。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { Pool } from "pg";

import { reconcileEventAttendanceBatch } from "../../features/plans/event-attendance-reconcile";
import { createPostgresPlanMatchRepository } from "../../features/plans/matching-repository";
import { ENQUEUE_PLAN_JOB_SQL } from "../../features/plans/plan-match-plan-job";
import { createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service, PlanV2Error } from "../../features/plans/v2/service";
import { readRecentRecordsForContacts } from "../../features/network-analysis/recent-records";
import { relationshipStrengthStampSql } from "../../features/relationship-strength/read-model";
import { readRelationshipSignalItems } from "../../features/relationship-strength/signal-items";
import { readRelationshipTimelinesForActor } from "../../features/relationship-strength/timelines";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";
import { ANY_REFERENCES, draftInput, steppingClock } from "../plans/v2-fixture";

const ALICE = "actor:alice";
const BOB = "actor:bob";
const rejects = (reason: string) => (error: unknown) => error instanceof PlanV2Error && error.reason === reason;

function serviceFor(pool: Pool, actorId: string, extra: Partial<Parameters<typeof createPlanV2Service>[0]> = {}) {
  let n = 0;
  return createPlanV2Service({ newId: () => `${actorId.slice(-3)}${(n += 1)}`, now: steppingClock(), references: ANY_REFERENCES, repository: createPostgresPlanV2Repository({ pool }), scope: { actorId, workspaceId: WORKSPACE }, ...extra });
}
const itemOf = (plan: { content: { personTypes: ReadonlyArray<{ key: string; itemId: string }> } }, key: string) => plan.content.personTypes.find((type) => type.key === key)!.itemId;

test("S1: memo proposal → pending → accept (scores) / dismiss → step suggestion 「まだ」 all work under the plan_log constraints", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool, addContact }) => {
    const alice = serviceFor(pool, ALICE);
    await addContact(ALICE, "contact:a1");
    await addContact(ALICE, "contact:a2");
    const { plan } = await alice.createPlanFromDraft(draftInput());
    const cfo = itemOf(plan, "cfo");
    const vc = itemOf(plan, "vc_partner");
    await alice.linkTypeContact({ contactId: "contact:a1", itemId: cfo });
    await alice.linkTypeContact({ contactId: "contact:a2", itemId: vc });
    assert.equal(await alice.proposeMemoCoverage({ contactId: "contact:a1", coverage: [{ answered: [0, 1], itemId: cfo }], memoId: "memo:1" }), 1);
    assert.equal(await alice.proposeMemoCoverage({ contactId: "contact:a2", coverage: [{ answered: [], itemId: vc }], manual: true, memoId: "memo:2" }), 1);
    const cards = (await alice.pending()).filter((item) => item.kind === "memo_coverage");
    assert.equal(cards.length, 2);
    const auto = cards.find((item) => item.itemId === cfo)!;
    assert.equal(auto.points, 10);
    const accepted = await alice.decidePending({ decision: "accept", id: auto.id, idempotencyKey: "acc-1" });
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.award!.points, 10);
    const manual = cards.find((item) => item.itemId === vc)!;
    assert.equal((await alice.decidePending({ decision: "dismiss", id: manual.id, idempotencyKey: "dis-1" })).status, "dismissed");
    // CFO 1 / 1 → Step 1 的建议卡；「まだ」可以收起。
    const step = (await alice.pending()).find((item) => item.kind === "step_suggestion")!;
    assert.equal(step.id, `step:${plan.planId}:s1`);
    assert.equal((await alice.decidePending({ decision: "dismiss", id: step.id, idempotencyKey: "step-1" })).status, "dismissed");
    assert.equal((await alice.pending()).filter((item) => item.kind !== "candidate").length, 0);
    const rows = (await pool.query("select event, body, payload->>'basis' as basis from plan_log where plan_id = $1 order by seq", [plan.planId])).rows;
    assert.deepEqual(rows.map((row) => row.event).filter((event) => event !== "plan_created"), [
      "memo_coverage_proposed", "memo_coverage_proposed", "score_awarded", "pending_accepted", "pending_dismissed", "pending_dismissed",
    ]);
    assert.ok(rows.every((row) => row.body.length >= 1 && row.body.length <= 2000));
    assert.equal(rows.find((row) => row.event === "score_awarded")!.basis, "memo");
  });
});

test("M1: on Postgres a dismissed memo card cannot score later; an accepted one replays once and refuses a second key", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool, addContact }) => {
    const alice = serviceFor(pool, ALICE);
    await addContact(ALICE, "contact:a1");
    await addContact(ALICE, "contact:a2");
    const { plan } = await alice.createPlanFromDraft(draftInput());
    const cfo = itemOf(plan, "cfo");
    const vc = itemOf(plan, "vc_partner");
    await alice.linkTypeContact({ contactId: "contact:a1", itemId: cfo });
    await alice.linkTypeContact({ contactId: "contact:a2", itemId: vc });
    await alice.proposeMemoCoverage({ contactId: "contact:a1", coverage: [{ answered: [0, 2], itemId: cfo }], memoId: "memo:d" });
    await alice.proposeMemoCoverage({ contactId: "contact:a2", coverage: [{ answered: [1, 2], itemId: vc }], memoId: "memo:a" });
    const cards = (await alice.pending()).filter((item) => item.kind === "memo_coverage");
    const dismissed = cards.find((item) => item.itemId === cfo)!;
    const toAccept = cards.find((item) => item.itemId === vc)!;
    await alice.decidePending({ decision: "dismiss", id: dismissed.id, idempotencyKey: "d" });
    const before = (await alice.summary()).current!.score.total;
    await assert.rejects(alice.decidePending({ decision: "accept", id: dismissed.id, idempotencyKey: "late" }), rejects("PENDING_DECIDED"));
    assert.equal((await alice.summary()).current!.score.total, before);
    const [first, second] = [await alice.decidePending({ decision: "accept", id: toAccept.id, idempotencyKey: "a" }), await alice.decidePending({ decision: "accept", id: toAccept.id, idempotencyKey: "a" })];
    assert.equal(second.replayed, true);
    await assert.rejects(alice.decidePending({ decision: "accept", id: toAccept.id, idempotencyKey: "a2" }), rejects("PENDING_DECIDED"));
    assert.equal((await alice.summary()).current!.score.total, before + first.award!.points);
    const memoAwards = (await pool.query("select count(*)::int as n from plan_log where plan_id = $1 and event = 'score_awarded' and payload->>'basis' = 'memo'", [plan.planId])).rows[0].n;
    assert.equal(memoAwards, 1);
  });
});

test("M2: on Postgres the same key (sequential and concurrent) creates one contact; a failure is CONTACT_CREATE_FAILED with nothing scored", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const created: string[] = [];
    const alice = serviceFor(pool, ALICE, {
      createContact: async ({ name }) => {
        created.push(name);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return `contact:new-${created.length}`;
      },
    });
    const { plan } = await alice.createPlanFromDraft(draftInput());
    const angel = itemOf(plan, "angel");
    const request = { createContact: true, idempotencyKey: "same", name: "新しい 人" };
    const first = await alice.talkedOffline({ itemId: angel, planId: plan.planId, request });
    const again = await alice.talkedOffline({ itemId: angel, planId: plan.planId, request });
    assert.equal(created.length, 1);
    assert.equal(again.createdContactId, first.createdContactId);
    assert.equal(again.award!.replayed, true);
    // 并发同键：只有一个建联系人，另一个是「进行中」或重放。
    const settled = await Promise.allSettled([1, 2].map(() => alice.talkedOffline({ itemId: angel, planId: plan.planId, request: { ...request, idempotencyKey: "race" } })));
    assert.equal(created.length, 2, "exactly one more contact for the concurrent pair");
    assert.ok(settled.some((result) => result.status === "fulfilled"));
    for (const result of settled) {
      if (result.status === "rejected") assert.ok(rejects("REQUEST_IN_PROGRESS")(result.reason) || /duplicate key/.test(String(result.reason)), String(result.reason));
    }
    const awards = (await pool.query("select count(*)::int as n from plan_log where plan_id = $1 and event = 'score_awarded'", [plan.planId])).rows[0].n;
    assert.equal(awards, 2);

    const failing = serviceFor(pool, ALICE, { createContact: async () => null });
    await assert.rejects(failing.talkedOffline({ itemId: angel, planId: plan.planId, request: { ...request, idempotencyKey: "fail" } }), rejects("CONTACT_CREATE_FAILED"));
    await assert.rejects(failing.talkedOffline({ itemId: angel, planId: plan.planId, request: { ...request, idempotencyKey: "fail" } }), rejects("CONTACT_CREATE_FAILED"));
    assert.equal((await pool.query("select count(*)::int as n from plan_log where plan_id = $1 and event = 'score_awarded'", [plan.planId])).rows[0].n, 2, "a failure scores nothing (no silent anonymous)");
  });
});

test("M4: the attendance reconcile scores the v2 event slot for a card met at the event; an undone event score is not put back", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool, insertRecord }) => {
    const alice = serviceFor(pool, ALICE);
    const { plan } = await alice.createPlanFromDraft(draftInput());
    await pool.query("update plans set created_at = '2026-10-01T00:00:00Z' where id = $1", [plan.planId]);
    await insertRecord({ at: "2026-10-05T00:00:00.000Z", collection: "contacts", id: "contact:met", payload: { accountId: ALICE, displayName: "会った人", metEventId: "event:1" }, userId: ALICE });
    // 计划开始前就记着这场活动的联系人不补。
    await insertRecord({ at: "2026-09-01T00:00:00.000Z", collection: "contacts", id: "contact:old", payload: { accountId: ALICE, displayName: "昔の人", metEventId: "event:old" }, userId: ALICE });
    const repository = createPostgresPlanMatchRepository({ pool, workspaceId: WORKSPACE });
    assert.deepEqual(await repository.listUnscoredAttributedEventsV2({ limit: 10 }), [{ actorId: ALICE, eventId: "event:1" }]);
    const deps = {
      planServiceFor: () => { throw new Error("no v1 plan"); },
      planV2ServiceFor: async () => alice,
      repository,
    };
    const batch = await reconcileEventAttendanceBatch(deps as never, { limit: 10 });
    assert.equal(batch.summary.v2Marked, 1);
    const segment = () => alice.summary().then((summary) => summary.current!.score.segments.find((item) => item.key === "event")!);
    assert.ok((await segment()).earned > 0);
    assert.deepEqual(await repository.listUnscoredAttributedEventsV2({ limit: 10 }), []);
    // 用户撤销了活动计分：对账不补回。
    const award = (await pool.query("select id from plan_log where plan_id = $1 and event = 'score_awarded' and linked_event_id = 'event:1'", [plan.planId])).rows[0].id;
    await alice.undo({ idempotencyKey: "u", logId: award, planId: plan.planId });
    assert.deepEqual(await repository.listUnscoredAttributedEventsV2({ limit: 10 }), []);
    assert.deepEqual(await alice.recordEventAttendanceForPlans({ eventId: "event:1", skipIfEverScored: true }), []);
    assert.equal((await segment()).earned, 0);
  });
});

test("M7: R24 endpoints never let another person read or act on someone's plan (Postgres)", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool, addContact }) => {
    const alice = serviceFor(pool, ALICE);
    const bob = serviceFor(pool, BOB);
    await addContact(ALICE, "contact:a1", { displayName: "伊藤 一郎" });
    await addContact(BOB, "contact:b1", { displayName: "伊藤 次郎" });
    const input = draftInput();
    input.content.personTypes[0] = { ...input.content.personTypes[0]!, introRoutes: [{ viaContactId: "contact:a1", why: "w" }] } as never;
    const { plan } = await alice.createPlanFromDraft(input);
    const cfo = itemOf(plan, "cfo");
    await pool.query(ENQUEUE_PLAN_JOB_SQL, [WORKSPACE, ALICE, plan.planId, "job"]);
    await pool.query(`insert into plan_match_candidates (workspace_id, id, actor_id, job_id, plan_id, need_item_id, contact_id, tier, strength) values ($1, 'cand-a', $2, 'job', $3, $4, 'contact:a1', 'rule', 'strong')`, [WORKSPACE, ALICE, plan.planId, cfo]);
    await alice.proposeMemoCoverage({ contactId: "contact:a1", coverage: [{ answered: [0, 1], itemId: cfo }], memoId: "memo:x" });
    const memoCard = (await alice.pending()).find((item) => item.kind === "memo_coverage")!;

    assert.equal(await bob.overview(plan.planId), null);
    assert.equal(await bob.typeDetail(plan.planId, cfo), null);
    await assert.rejects(bob.decideCandidate({ contactId: "contact:a1", decision: "accept", idempotencyKey: "x", itemId: cfo, planId: plan.planId }), rejects("PLAN_NOT_FOUND"));
    await assert.rejects(bob.talkedOffline({ itemId: cfo, planId: plan.planId, request: { contactId: "contact:b1", idempotencyKey: "x2" } }), rejects("PLAN_NOT_FOUND"));
    await assert.rejects(bob.talkedOffline({ itemId: cfo, planId: plan.planId, request: { createContact: true, idempotencyKey: "x2b", name: "誰か" } }), rejects("PLAN_NOT_FOUND"));
    await assert.rejects(bob.proposal({ contactId: "contact:a1", itemId: cfo, language: "ja", planId: plan.planId, slots: [] }), rejects("PLAN_NOT_FOUND"));
    await assert.rejects(bob.introDraft({ itemId: cfo, language: "ja", planId: plan.planId, viaContactId: "contact:a1" }), rejects("PLAN_NOT_FOUND"));
    assert.deepEqual(await bob.pending(), []);
    assert.deepEqual((await bob.contactFit("contact:a1")).fits, []);
    await assert.rejects(bob.decidePending({ decision: "accept", id: "candidate:cand-a", idempotencyKey: "x3" }), rejects("PENDING_NOT_FOUND"));
    await assert.rejects(bob.decidePending({ decision: "accept", id: `step:${plan.planId}:s1`, idempotencyKey: "x4" }), rejects("PLAN_NOT_FOUND"));
    await assert.rejects(bob.decidePending({ decision: "accept", id: memoCard.id, idempotencyKey: "x5" }), rejects("PENDING_NOT_FOUND"));
    assert.equal(await bob.proposeMemoCoverage({ contactId: "contact:a1", coverage: [{ answered: [0, 1], itemId: cfo }], memoId: "memo:y" }), 0);
    assert.equal(await bob.decideCandidateById({ candidateId: "cand-a", decision: "accept" }), null);
    assert.equal(await bob.linkTypeContact({ contactId: "contact:b1", itemId: cfo }), null);
    // alice 看不到 bob 的联系人；对 bob 的联系人出提案是 REFERENCE_NOT_FOUND。
    const offered = await alice.talkedOffline({ itemId: cfo, planId: plan.planId, request: { idempotencyKey: "o1", name: "伊藤" } });
    assert.deepEqual(offered.matches!.map((match) => match.contactId), ["contact:a1"]);
    await assert.rejects(alice.proposal({ contactId: "contact:b1", itemId: cfo, language: "ja", planId: plan.planId, slots: [] }), rejects("REFERENCE_NOT_FOUND"));
    // alice 的数据没被 bob 动过。
    assert.equal((await pool.query("select status from plan_match_candidates where id = 'cand-a'")).rows[0].status, "pending");
    assert.equal((await alice.pending()).filter((item) => item.kind === "memo_coverage").length, 1);
    const detail = await alice.typeDetail(plan.planId, cfo);
    assert.equal(detail!.introRoutes.length, 1);
    assert.equal(detail!.candidates.length, 1);
  });
});

test("M7: an undone plan score is not an interaction for relationship strength (timeline + stamp), signal items or recent records", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool, addContact }) => {
    const alice = serviceFor(pool, ALICE);
    await addContact(ALICE, "contact:c");
    const { plan } = await alice.createPlanFromDraft(draftInput());
    const kept = await alice.award({ itemId: itemOf(plan, "vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "contact:c", idempotencyKey: "k" } });
    const undone = await alice.award({ itemId: itemOf(plan, "cfo"), planId: plan.planId, request: { basis: "talked", contactId: "contact:c", idempotencyKey: "u" } });
    const stamp = async () => (await pool.query(relationshipStrengthStampSql("timestamp"), [WORKSPACE, ALICE, "state"])).rows[0].plan_count;
    assert.equal(await stamp(), "2");
    await alice.undo({ idempotencyKey: "undo", logId: undone.awardLogId!, planId: plan.planId });
    const keptId = `plan:${kept.awardLogId}`;
    const undoneId = `plan:${undone.awardLogId}`;
    const now = new Date("2026-10-20T00:00:00.000Z");

    // 关系强度：stamp 的计划行数随撤销变化（会重算），时间线只剩保留的那条。
    assert.equal(await stamp(), "1");
    const strength = await readRelationshipTimelinesForActor(pool as never, WORKSPACE, { actorId: ALICE, now });
    const strengthIds = (strength.timelines.get("contact:c") ?? []).map((item) => item.id);
    assert.ok(strengthIds.includes(keptId), strengthIds.join(","));
    assert.ok(!strengthIds.includes(undoneId), strengthIds.join(","));

    // 信号条目：按 id 读回时，撤销的那条不出现。
    const signals = await readRelationshipSignalItems(pool as never, WORKSPACE, { actorId: ALICE, contactId: "contact:c", timelineItemIds: [keptId, undoneId] });
    assert.deepEqual(signals.map((item) => item.id), [keptId]);

    // 近期记录（人脉分析 / 洞察输入）。
    const recent = await readRecentRecordsForContacts(pool as never, WORKSPACE, { actorId: ALICE, contacts: [{ createdAt: "2026-09-01T00:00:00.000Z", id: "contact:c" }], now });
    const recentIds = (recent.get("contact:c") ?? []).map((item) => item.id);
    assert.ok(recentIds.includes(keptId), recentIds.join(","));
    assert.ok(!recentIds.includes(undoneId), recentIds.join(","));
  });
});
