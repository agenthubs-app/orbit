/**
 * W0010 SC-03 / SC-04（真实 PostgreSQL）：候选接口、确认后「约 TA」行动与进展记录、忽略后不再提示、
 * 手动关联、记一次互动；接口严格按 actor 隔离（他人批次、他人候选、他人计划、他人联系人一律 404）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPlanCandidateRouteHandlers } from "../../app/api/agent/plans/candidates/route-handlers";
import type { LinkNeedContactResult, RecordInteractionResult } from "../../features/plans/contract";
import type { PlanMatchCandidatesView } from "../../features/plans/matching-service";
import { createPlanMatchingService } from "../../features/plans/matching-service";
import {
  ALICE,
  BOB,
  confirmItem,
  databaseTest,
  extractedBatch,
  matchingPlanInput,
  NEED_INVESTOR,
  NEED_SAAS,
  withMatchingDatabase,
  type MatchingHarness,
} from "../support/plan-matching-harness";

type Envelope<T> = { success: boolean; data?: T; error?: { code: string } };

function routes(harness: MatchingHarness, actorId: string | null, options: { unavailable?: boolean } = {}) {
  const service = createPlanMatchingService({
    planServiceFor: harness.planServiceFor,
    repository: harness.matches,
    worker: { aiMatcher: null, repository: harness.matches },
  });
  return createPlanCandidateRouteHandlers({
    matchingService: () => (options.unavailable ? null : service),
    resolveActor: async () => (actorId ? ({ id: actorId } as never) : null),
    serviceForActor: (id) => ({ mode: "live", service: harness.planServiceFor(id), success: true }),
  });
}

async function call<T>(response: Promise<Response>): Promise<{ status: number; body: Envelope<T> }> {
  const resolved = await response;
  return { body: (await resolved.json()) as Envelope<T>, status: resolved.status };
}

const post = (url: string, body: unknown) =>
  new Request(`https://orbit.test${url}`, { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });

/** alice 的计划 + 一批两张名片（SaaS 强候选、VC 候选），任务已在确认完成时落库。 */
async function aliceWithBatch(harness: MatchingHarness) {
  const snapshot = await harness.planServiceFor(ALICE).createVersion(matchingPlanInput());
  await harness.planServiceFor(BOB).createVersion(matchingPlanInput());
  const saasNeed = snapshot.items.find((item) => item.title === NEED_SAAS)!.id;
  const investorNeed = snapshot.items.find((item) => item.title === NEED_INVESTOR)!.id;
  const { batch, items } = await extractedBatch(harness.ingest, ALICE, 2);
  await confirmItem(harness.ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:saas", itemId: items[0]!.id });
  await confirmItem(harness.ingest, { actorId: ALICE, batchId: batch.id, contactId: "contact:vc", itemId: items[1]!.id });
  return { batchId: batch.id, investorNeed, planId: snapshot.plan.id, saasNeed };
}

test("unauthenticated requests get 401 and an unavailable matching service gets a 503 envelope", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const anonymous = await call(routes(harness, null).GET(new Request("https://orbit.test/api/agent/plans/candidates")));
    assert.equal(anonymous.status, 401);
    const unavailable = await call(routes(harness, ALICE, { unavailable: true }).GET(new Request("https://orbit.test/api/agent/plans/candidates")));
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.success, false);
    const bad = await call(routes(harness, ALICE).POST_RUN(post("/api/agent/plans/candidates/run", { batchId: "" })));
    assert.equal(bad.status, 400);
  });
});

test("the review trigger runs only the actor's own batch and returns its candidates", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { batchId, investorNeed, saasNeed } = await aliceWithBatch(harness);

    const bobRun = await call<PlanMatchCandidatesView & { run: { state: string } }>(
      routes(harness, BOB).POST_RUN(post("/api/agent/plans/candidates/run", { batchId })),
    );
    assert.equal(bobRun.status, 200);
    assert.equal(bobRun.body.data!.run.state, "missing");
    assert.deepEqual(bobRun.body.data!.candidates, []);

    const run = await call<PlanMatchCandidatesView & { run: { state: string; aiState?: string } }>(
      routes(harness, ALICE).POST_RUN(post("/api/agent/plans/candidates/run", { batchId })),
    );
    assert.equal(run.status, 200);
    assert.deepEqual(run.body.data!.run, { aiState: "skipped", state: "ran", status: "completed" });
    const view = run.body.data!;
    assert.deepEqual(
      view.candidates.map((candidate) => [candidate.contactName, candidate.needTitle, candidate.strength, candidate.industry?.zh]),
      // 新到旧：同一任务里强候选先写入，所以排在后面。
      [
        ["鈴木 一郎", NEED_INVESTOR, "candidate", "金融与投资"],
        ["佐藤 健", NEED_SAAS, "strong", "企业软件与 SaaS"],
      ],
    );
    assert.equal(view.candidates[1]!.contactSubtitle, "Cloudline KK · SaaS 事业部长");
    assert.deepEqual(view.pendingByNeed, { [investorNeed]: 1, [saasNeed]: 1 });
    assert.equal(view.contactCount, 2);

    // 他人读不到 alice 的候选。
    const bobList = await call<PlanMatchCandidatesView>(routes(harness, BOB).GET(new Request("https://orbit.test/api/agent/plans/candidates")));
    assert.deepEqual(bobList.body.data!.candidates, []);
  });
});

test("accepting links the contact, creates this week's 约 TA action with a log entry, and is idempotent", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { batchId, planId, saasNeed } = await aliceWithBatch(harness);
    const alice = routes(harness, ALICE);
    const view = (await call<PlanMatchCandidatesView>(alice.POST_RUN(post("/api/agent/plans/candidates/run", { batchId })))).body.data!;
    const saas = view.candidates.find((candidate) => candidate.needId === saasNeed)!;

    // 他人不能确认／忽略 alice 的候选。
    for (const decision of ["accept", "dismiss"]) {
      const denied = await call(routes(harness, BOB).POST(post("/api/agent/plans/candidates", { candidateId: saas.id, decision })));
      assert.equal(denied.status, 404);
    }

    const accepted = await call<{ status: string; link: LinkNeedContactResult }>(
      alice.POST(post("/api/agent/plans/candidates", { candidateId: saas.id, decision: "accept" })),
    );
    assert.equal(accepted.status, 200);
    const { link } = accepted.body.data!;
    assert.equal(accepted.body.data!.status, "accepted");
    assert.equal(link.need.status, "linked");
    assert.deepEqual(link.need.linkedContactIds, ["contact:saas"]);
    assert.equal(link.action.kind, "action");
    assert.equal(link.action.title, "约 佐藤 健");
    assert.equal(link.action.suggestedWeek, 1, "the plan starts this week");
    assert.equal(link.action.planId, planId);
    assert.deepEqual(link.action.linkedContactIds, ["contact:saas"]);
    assert.equal(link.log?.event, "contact_linked");
    assert.equal(link.log?.targetItemId, link.action.id);

    // 再点一次（响应丢失后重试）：回放同一个行动，不重复生成。
    const replay = await call<{ link: LinkNeedContactResult }>(alice.POST(post("/api/agent/plans/candidates", { candidateId: saas.id, decision: "accept" })));
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data!.link.action.id, link.action.id);
    const snapshot = (await harness.planServiceFor(ALICE).getCurrent())!;
    assert.equal(snapshot.items.filter((item) => item.meta.source === "network_match").length, 1);
    assert.equal(snapshot.log.filter((entry) => entry.event === "contact_linked").length, 1);

    // 已确认的候选不再出现；忽略已确认的候选是冲突。
    const after = (await call<PlanMatchCandidatesView>(alice.GET(new Request("https://orbit.test/api/agent/plans/candidates")))).body.data!;
    assert.deepEqual(after.candidates.map((candidate) => candidate.contactId), ["contact:vc"]);
    const conflict = await call(alice.POST(post("/api/agent/plans/candidates", { candidateId: saas.id, decision: "dismiss" })));
    assert.equal(conflict.status, 409);
  });
});

test("dismissed candidates are never prompted again, even when a later job finds the same pair", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { batchId } = await aliceWithBatch(harness);
    const alice = routes(harness, ALICE);
    const view = (await call<PlanMatchCandidatesView>(alice.POST_RUN(post("/api/agent/plans/candidates/run", { batchId })))).body.data!;
    const vc = view.candidates.find((candidate) => candidate.contactId === "contact:vc")!;
    const dismissed = await call<{ status: string }>(alice.POST(post("/api/agent/plans/candidates", { candidateId: vc.id, decision: "dismiss" })));
    assert.equal(dismissed.body.data!.status, "dismissed");

    // 同一个人又出现在下一批里：这一对已经忽略过，不再提示。
    const next = await extractedBatch(harness.ingest, ALICE, 2);
    await confirmItem(harness.ingest, { actorId: ALICE, batchId: next.batch.id, contactId: "contact:vc", itemId: next.items[0]!.id });
    await confirmItem(harness.ingest, { actorId: ALICE, batchId: next.batch.id, contactId: "contact:ai", itemId: next.items[1]!.id });
    const nextView = (await call<PlanMatchCandidatesView>(alice.POST_RUN(post("/api/agent/plans/candidates/run", { batchId: next.batch.id })))).body.data!;
    assert.deepEqual(nextView.candidates.map((candidate) => candidate.contactId), ["contact:ai"]);
    const all = (await call<PlanMatchCandidatesView>(alice.GET(new Request("https://orbit.test/api/agent/plans/candidates")))).body.data!;
    assert.ok(!all.candidates.some((candidate) => candidate.contactId === "contact:vc"));
  });
});

test("manual linking from the contact detail accepts only the actor's own need and own contact", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { batchId, investorNeed, saasNeed } = await aliceWithBatch(harness);
    const alice = routes(harness, ALICE);
    const bobNeed = (await harness.planServiceFor(BOB).getCurrent())!.items.find((item) => item.kind === "network_need")!.id;
    const view = (await call<PlanMatchCandidatesView>(alice.POST_RUN(post("/api/agent/plans/candidates/run", { batchId })))).body.data!;
    const pendingSaas = view.candidates.find((candidate) => candidate.needId === saasNeed)!;

    const linked = await call<LinkNeedContactResult>(
      alice.POST(post("/api/agent/plans/candidates", { action: "link", contactId: "contact:none", idempotencyKey: "manual-1", needItemId: investorNeed })),
    );
    assert.equal(linked.status, 200);
    assert.equal(linked.body.data!.action.title, "约 高橋 花子");
    assert.deepEqual(linked.body.data!.need.linkedContactIds, ["contact:none"]);

    // 手动关联了一对正在待确认的候选：候选随之标为已接受，不再提示。
    const manualSaas = await call<LinkNeedContactResult>(
      alice.POST(post("/api/agent/plans/candidates", { action: "link", contactId: pendingSaas.contactId, needItemId: saasNeed })),
    );
    assert.equal(manualSaas.status, 200);
    assert.equal((await harness.matches.getCandidate({ actorId: ALICE, candidateId: pendingSaas.id }))!.status, "accepted");

    // 他人的联系人 → 404；他人的需求 → 404；都不写库。
    const otherContact = await call(alice.POST(post("/api/agent/plans/candidates", { action: "link", contactId: "contact:bob-only", needItemId: investorNeed })));
    assert.equal(otherContact.status, 404);
    const otherNeed = await call(alice.POST(post("/api/agent/plans/candidates", { action: "link", contactId: "contact:none", needItemId: bobNeed })));
    assert.equal(otherNeed.status, 404);
    const bobSnapshot = (await harness.planServiceFor(BOB).getCurrent())!;
    assert.ok(bobSnapshot.items.every((item) => item.linkedContactIds.length === 0));
    const aliceInvestor = (await harness.planServiceFor(ALICE).getCurrent())!.items.find((item) => item.id === investorNeed)!;
    assert.deepEqual(aliceInvestor.linkedContactIds, ["contact:none"]);
  });
});

test("记一次互动 logs an interaction, marks the contact established and completes the action", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { investorNeed } = await aliceWithBatch(harness);
    const alice = routes(harness, ALICE);
    const linked = (await call<LinkNeedContactResult>(
      alice.POST(post("/api/agent/plans/candidates", { action: "link", contactId: "contact:vc", needItemId: investorNeed })),
    )).body.data!;
    const context = { params: Promise.resolve({ itemId: linked.action.id }) };

    const denied = await call(routes(harness, BOB).POST_INTERACTION(post("/x", { idempotencyKey: "i-1" }), context));
    assert.equal(denied.status, 404);

    const result = await call<RecordInteractionResult>(alice.POST_INTERACTION(post("/x", { idempotencyKey: "i-1" }), { params: Promise.resolve({ itemId: linked.action.id }) }));
    assert.equal(result.status, 200);
    const data = result.body.data!;
    assert.equal(data.action.status, "done");
    assert.equal(data.need?.status, "established");
    assert.equal(data.need?.contactLinks[0]?.state, "established");
    assert.equal(data.entry.kind, "manual");
    assert.deepEqual(data.entry.linkedContactIds, ["contact:vc"]);
    assert.equal(data.entry.body, "记一次互动：约 鈴木 一郎");

    const replay = await call<RecordInteractionResult>(alice.POST_INTERACTION(post("/x", { idempotencyKey: "i-1" }), { params: Promise.resolve({ itemId: linked.action.id }) }));
    assert.equal(replay.body.data!.replayed, true);
    assert.equal(replay.body.data!.entry.id, data.entry.id);

    // 普通行动不能「记一次互动」。
    const plain = (await harness.planServiceFor(ALICE).getCurrent())!.items.find((item) => item.kind === "action" && item.meta.source !== "network_match")!;
    const illegal = await call(alice.POST_INTERACTION(post("/x", {}), { params: Promise.resolve({ itemId: plain.id }) }));
    assert.equal(illegal.status, 409);
  });
});

test("concurrent 是 and 不是 on one candidate: exactly one wins and the plan matches the winner", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { batchId, saasNeed } = await aliceWithBatch(harness);
    const alice = routes(harness, ALICE);
    const view = (await call<PlanMatchCandidatesView>(alice.POST_RUN(post("/api/agent/plans/candidates/run", { batchId })))).body.data!;
    const target = view.candidates.find((candidate) => candidate.needId === saasNeed);
    assert.ok(target);
    const results = await Promise.all([
      call<{ status: string }>(alice.POST(post("/api/agent/plans/candidates", { candidateId: target.id, decision: "accept" }))),
      call<{ status: string }>(alice.POST(post("/api/agent/plans/candidates", { candidateId: target.id, decision: "dismiss" }))),
    ]);
    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, [200, 409], "one wins, the loser gets 409");
    const winner = results.find((result) => result.status === 200)!.body.data!.status;
    const stored = (await harness.matches.getCandidate({ actorId: ALICE, candidateId: target.id }))!.status;
    assert.equal(stored, winner);
    const snapshot = (await harness.planServiceFor(ALICE).getCurrent())!;
    const need = snapshot.items.find((item) => item.id === saasNeed)!;
    const actions = snapshot.items.filter((item) => item.meta.source === "network_match");
    if (winner === "accepted") {
      assert.deepEqual(need.linkedContactIds, ["contact:saas"]);
      assert.equal(actions.length, 1);
      assert.equal(snapshot.log.filter((entry) => entry.event === "contact_linked").length, 1);
    } else {
      assert.deepEqual(need.linkedContactIds, []);
      assert.equal(actions.length, 0);
    }
  });
});

test("起草邮件 returns an editable template draft for the actor's own 约 TA action only", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    const { investorNeed } = await aliceWithBatch(harness);
    const alice = routes(harness, ALICE);
    const linked = (await call<LinkNeedContactResult>(
      alice.POST(post("/api/agent/plans/candidates", { action: "link", contactId: "contact:vc", needItemId: investorNeed })),
    )).body.data!;
    const context = () => ({ params: Promise.resolve({ itemId: linked.action.id }) });
    const drafted = await call<{ draft: { subject: string; body: string; provider: string } }>(alice.POST_DRAFT(post("/x", {}), context()));
    assert.equal(drafted.status, 200);
    const draft = drafted.body.data!.draft;
    assert.equal(draft.provider, "template");
    assert.match(draft.subject, /早期投资人/);
    assert.match(draft.body, /^鈴木 一郎您好/);
    assert.match(draft.body, /Sakura Ventures担任Partner/);
    assert.match(draft.body, /三个月内拿到 10 家企业客户的试用/);
    const english = await call<{ draft: { body: string } }>(alice.POST_DRAFT(post("/x", { language: "en" }), context()));
    assert.match(english.body.data!.draft.body, /^Hi 鈴木 一郎,/);
    // 草稿不写库：计划里没有新记录。
    const logs = (await harness.planServiceFor(ALICE).getCurrent())!.log.length;
    await alice.POST_DRAFT(post("/x", {}), context());
    assert.equal((await harness.planServiceFor(ALICE).getCurrent())!.log.length, logs);

    const denied = await call(routes(harness, BOB).POST_DRAFT(post("/x", {}), context()));
    assert.equal(denied.status, 404);
    const plain = (await harness.planServiceFor(ALICE).getCurrent())!.items.find((item) => item.kind === "action" && item.meta.source !== "network_match")!;
    const notMatch = await call(alice.POST_DRAFT(post("/x", {}), { params: Promise.resolve({ itemId: plain.id }) }));
    assert.equal(notMatch.status, 404);
  });
});

test("two single-card batches on one day: the second finish screen shows only its own contacts", databaseTest, async () => {
  await withMatchingDatabase(async (harness) => {
    await harness.planServiceFor(ALICE).createVersion(matchingPlanInput());
    const alice = routes(harness, ALICE);
    const first = await extractedBatch(harness.ingest, ALICE, 1);
    await confirmItem(harness.ingest, { actorId: ALICE, batchId: first.batch.id, contactId: "contact:saas", itemId: first.items[0]!.id });
    const firstView = (await call<PlanMatchCandidatesView & { run: { state: string } }>(alice.POST_RUN(post("/api/agent/plans/candidates/run", { batchId: first.batch.id })))).body.data!;
    assert.equal(firstView.run.state, "rule_preview");
    assert.deepEqual(firstView.candidates.map((candidate) => candidate.contactId), ["contact:saas"]);

    const second = await extractedBatch(harness.ingest, ALICE, 1);
    await confirmItem(harness.ingest, { actorId: ALICE, batchId: second.batch.id, contactId: "contact:vc", itemId: second.items[0]!.id });
    const secondView = (await call<PlanMatchCandidatesView & { run: { state: string } }>(alice.POST_RUN(post("/api/agent/plans/candidates/run", { batchId: second.batch.id })))).body.data!;
    assert.equal(secondView.run.state, "rule_preview");
    assert.deepEqual(secondView.candidates.map((candidate) => candidate.contactId), ["contact:vc"], "the first batch's pending candidate is not shown here");

    // 两批在同一条当天任务里；第一批的候选仍待确认，今日要事能看到两位。
    const jobs = await harness.pool.query("select count(*)::int as n from plan_match_jobs");
    assert.equal(jobs.rows[0].n, 1);
    const all = (await call<PlanMatchCandidatesView>(alice.GET(new Request("https://orbit.test/api/agent/plans/candidates")))).body.data!;
    assert.deepEqual(all.candidates.map((candidate) => candidate.contactId).sort(), ["contact:saas", "contact:vc"]);
  });
});
