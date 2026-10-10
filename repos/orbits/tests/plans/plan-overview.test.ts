import assert from "node:assert/strict";
import test from "node:test";

import { summarizePlanScore } from "../../shared/compute/plan-score";
import { planV2DetailSchema, planPersonTypeDetailSchema } from "../../shared/api-schema/plan-v2";
import { DEMO_PLAN } from "../../shared/mock/demo-world";
import { demoPlanEventFacts } from "../../features/plans/v2/event-facts";
import { demoPlanV2State } from "../../features/plans/v2/mock-seed";
import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service, PlanV2Error } from "../../features/plans/v2/service";
import { ANY_REFERENCES, SCOPE, steppingClock } from "./v2-fixture";

// R24 SC-R24-01 / 02 / 03 / 05 / 07：概要、人物类型详情、候补、线下聊过、草稿、待确认、fit（演示世界的示例计划）。
function world(createContact?: (input: { name: string }) => Promise<string | null>) {
  const repository = createMemoryPlanV2Repository();
  repository.seed(SCOPE, demoPlanV2State());
  let n = 0;
  const service = createPlanV2Service({ createContact, events: demoPlanEventFacts, newId: () => `r24-${(n += 1)}`, now: steppingClock("2026-10-07T03:00:00.000Z"), references: ANY_REFERENCES, repository, scope: SCOPE });
  return { repository, service };
}
const PLAN = DEMO_PLAN.id;
const rejects = (reason: string) => (error: unknown) => error instanceof PlanV2Error && error.reason === reason;
async function itemId(service: ReturnType<typeof world>["service"], key: string) {
  return (await service.detail(PLAN))!.content.personTypes.find((type) => type.key === key)!.itemId;
}

test("the overview carries the same score as the home summary, plus three-cell stats, step progress and recent awards", async () => {
  const { service } = world();
  const overview = planV2DetailSchema.parse(await service.overview(PLAN, { language: "ja", platform: "web" }));
  const summary = await service.summary();
  assert.deepEqual(overview.score, summary.current!.score);
  assert.equal(overview.typeStats!.length, overview.content.personTypes.length);
  const cvc = overview.typeStats!.find((stats) => stats.itemId === overview.content.personTypes.find((type) => type.key === "cvc")!.itemId)!;
  assert.equal(cvc.candidates, 1);
  assert.equal(cvc.events, 1, "the SaaS Summit is expected to have CVC people");
  assert.equal(overview.stepProgress!.length, overview.content.steps.length);
  assert.ok(overview.recentAwards!.length > 0 && overview.recentAwards!.length <= 5);
  assert.ok(overview.todayChance && overview.todayChance.href.startsWith(`/app/plans/${PLAN}/types/`));
});

test("type detail: candidates by recommendation, talked people, intro routes, events scored by rule; skipped types still readable", async () => {
  const { service } = world();
  const vc = planPersonTypeDetailSchema.parse(await service.typeDetail(PLAN, await itemId(service, "vc_partner"), { language: "ja", platform: "app" }));
  assert.equal(vc.letter, "D");
  assert.equal(vc.talked.length, 2);
  assert.ok(vc.candidates.every((candidate, index, list) => index === 0 || list[index - 1]!.recommendScore >= candidate.recommendScore));
  assert.ok(vc.events.every((event) => event.score.scoreBreakdown.length === 5 && event.score.scoreBreakdown.reduce((sum, item) => sum + item.score, 0) === event.score.total));
  assert.deepEqual(vc.unitPoints, [10, 10, 10]);
  assert.equal(vc.next.points, 10);
  const lawyer = await service.typeDetail(PLAN, await itemId(service, "lawyer"));
  assert.equal(lawyer!.skipped, true);
  assert.equal(await service.typeDetail(PLAN, "nope"), null);
  assert.equal(await service.typeDetail("someone-else", await itemId(service, "cfo")), null);
});

test("accepting a candidate only links the contact (no action), and is idempotent; dismissing keeps it out of the list", async () => {
  const { repository, service } = world();
  const cvc = await itemId(service, "cvc");
  const first = await service.decideCandidate({ contactId: "demo-person-sasaki", decision: "accept", idempotencyKey: "c1", itemId: cvc, planId: PLAN });
  const again = await service.decideCandidate({ contactId: "demo-person-sasaki", decision: "accept", idempotencyKey: "c1", itemId: cvc, planId: PLAN });
  assert.equal(first.status, "accepted");
  assert.equal(again.replayed, true);
  const state = repository.dump(SCOPE);
  const type = state.typeItems.find((item) => item.id === cvc)!;
  assert.deepEqual(type.contactLinks.map((link) => [link.contactId, link.state]), [["demo-person-sasaki", "linked"]]);
  assert.equal(state.log.filter((entry) => entry.event === "score_awarded" && entry.itemId === cvc).length, 0, "accepting is not talking: no points");
  assert.equal((await service.typeDetail(PLAN, cvc))!.candidates.length, 0);
  const angel = await itemId(service, "angel");
  assert.equal((await service.decideCandidate({ contactId: "demo-person-kobayashi", decision: "dismiss", idempotencyKey: "c2", itemId: angel, planId: PLAN })).status, "dismissed");
  await assert.rejects(service.decideCandidate({ contactId: "demo-person-watanabe", decision: "accept", idempotencyKey: "c3", itemId: angel, planId: PLAN }), rejects("CANDIDATE_NOT_FOUND"));
});

test("talked offline: a name first offers 「この人ですか？」; choosing scores; a new name creates one contact, never a duplicate", async () => {
  const created: string[] = [];
  const { service } = world(async ({ name }) => {
    created.push(name);
    return "contact:new-1";
  });
  const cfo = await itemId(service, "cfo");
  const offered = await service.talkedOffline({ itemId: cfo, planId: PLAN, request: { idempotencyKey: "o1", name: "伊藤" } });
  assert.deepEqual(offered.matches?.map((match) => match.contactId), ["demo-person-ito"]);
  assert.equal(offered.award, undefined);
  const chosen = await service.talkedOffline({ itemId: cfo, planId: PLAN, request: { contactId: "demo-person-ito", idempotencyKey: "o2" } });
  assert.equal(chosen.award!.points, 10);
  const angel = await itemId(service, "angel");
  const fresh = await service.talkedOffline({ itemId: angel, planId: PLAN, request: { idempotencyKey: "o3", name: "見知らぬ 人" } });
  assert.equal(fresh.createdContactId, "contact:new-1");
  assert.deepEqual(created, ["見知らぬ 人"]);
  const anonymous = await service.talkedOffline({ itemId: angel, planId: PLAN, request: { anonymous: true, idempotencyKey: "o4" } });
  assert.equal(anonymous.award!.part, "base");
});

test("proposals and introduction requests are drafts only — nothing is sent", async () => {
  const { service } = world();
  const vc = await itemId(service, "vc_partner");
  const proposal = await service.proposal({ contactId: "demo-person-okada", itemId: vc, language: "ja", planId: PLAN, slots: ["2026-10-09T10:00:00+09:00", "2026-10-10T19:00:00+09:00", "2026-10-13T12:00:00+09:00"] });
  assert.equal(proposal.kind, "draft");
  assert.equal(proposal.requestId, null);
  assert.match(proposal.draft!.body, /岡田 紗希さん/);
  assert.ok(!JSON.stringify(proposal).includes("sent"));
  await assert.rejects(service.introDraft({ itemId: vc, language: "ja", planId: PLAN, viaContactId: "demo-person-watanabe" }), rejects("REFERENCE_NOT_FOUND"));
});

test("memo coverage: ≥2 questions makes a confirm card; confirming scores (memo); <2 makes none; a manual card needs 2 ticks", async () => {
  const { service } = world();
  const angel = await itemId(service, "angel");
  const cfo = await itemId(service, "cfo");
  assert.equal(await service.proposeMemoCoverage({ contactId: "demo-person-kobayashi", coverage: [{ answered: [0], itemId: angel }], memoId: "m1" }), 0);
  assert.equal(await service.proposeMemoCoverage({ contactId: "demo-person-kobayashi", coverage: [{ answered: [0, 2], itemId: angel }], memoId: "m2" }), 1);
  assert.equal(await service.proposeMemoCoverage({ contactId: "demo-person-ito", coverage: [{ answered: [], itemId: cfo }], manual: true, memoId: "m3" }), 1);
  const pending = await service.pending({ language: "ja" });
  const memo = pending.filter((item) => item.kind === "memo_coverage");
  assert.equal(memo.length, 2);
  const auto = memo.find((item) => item.itemId === angel)!;
  const before = (await service.summary()).current!.score.total;
  const accepted = await service.decidePending({ decision: "accept", id: auto.id, idempotencyKey: "p1" });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.award!.points, 5);
  assert.equal((await service.summary()).current!.score.total, before + 5);
  const manual = memo.find((item) => item.manual)!;
  await assert.rejects(service.decidePending({ answered: [1], decision: "accept", id: manual.id, idempotencyKey: "p2" }), rejects("INVALID_INPUT"));
  assert.equal((await service.decidePending({ decision: "dismiss", id: manual.id, idempotencyKey: "p3" })).status, "dismissed");
  assert.equal((await service.pending()).filter((item) => item.kind === "memo_coverage").length, 0);
});

test("contact fit tells R11 where a person stands", async () => {
  const { service } = world();
  const fit = await service.contactFit("demo-person-takahashi");
  assert.deepEqual(fit.fits.map((item) => [item.shortLabel, item.status]), [["VC パートナー", "talked"]]);
  assert.deepEqual((await service.contactFit("demo-person-sasaki")).fits.map((item) => item.status), ["candidate"]);
  assert.deepEqual((await service.contactFit("nobody")).fits, []);
});

test("step suggestions appear only when every linked type is met, and need confirmation", async () => {
  const { service } = world();
  const cfo = await itemId(service, "cfo");
  await service.award({ itemId: cfo, planId: PLAN, request: { basis: "talked", contactId: "demo-person-ito", idempotencyKey: "s1" } });
  const overview = await service.overview(PLAN);
  const suggestion = overview!.stepSuggestions!.find((item) => item.stepKey === "demo-step-1");
  assert.ok(suggestion, "CFO 1 / 1 met → step 1 may be done");
  assert.equal(overview!.content.steps.find((step) => step.key === "demo-step-1")!.completedAt, null, "never auto-completed");
  await service.decidePending({ decision: "accept", id: `step:${PLAN}:demo-step-1`, idempotencyKey: "s2" });
  assert.ok((await service.overview(PLAN))!.content.steps.find((step) => step.key === "demo-step-1")!.completedAt);
});
