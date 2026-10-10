import assert from "node:assert/strict";
import test from "node:test";

import { createPlanFlowHandlers } from "../../features/plans/v2/flow-handlers";
import { createPlanV2Handlers } from "../../features/plans/v2/handlers";
import { resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { createPlanV1RetiredHandler } from "../../features/plans/v2/v1-retired";
import {
  planAchievementViewSchema,
  planConfirmResultSchema,
  planDraftViewSchema,
  planGoalEditResultSchema,
  planLegacyListResponseSchema,
  planNextGoalsResponseSchema,
  planQuotaResponseSchema,
  planReviewViewSchema,
  planV2SummaryResponseSchema,
} from "../../shared/api-schema/plan-v2";

// R25 SC-R25-01 / 03 / 04 / 09（mock）：見直し、配额、达成、改目标、以前のプラン与 v1 入口关闭都经路由走一遍，响应过契约 schema。
type Handler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
const call = (handler: Handler, method: string, params: Record<string, string> = {}, body?: unknown, headers: Record<string, string> = {}) =>
  handler(new Request("http://localhost/api/agent/plans/v2", { method, ...(body ? { body: JSON.stringify(body) } : {}), headers: { "content-type": "application/json", ...headers } }), { params: Promise.resolve(params) });
const data = async (response: Response) => (await response.json()).data;

test("mock: review → send → toggle → confirm, quota, goal edit, achieve → done → next goals, legacy", async () => {
  resetPlansV2MockRepositoryForTests();
  const flow = createPlanFlowHandlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const plans = createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const summary = planV2SummaryResponseSchema.parse(await data(await call(plans.summary, "GET")));
  const planId = summary.current!.planId;

  const quota = planQuotaResponseSchema.parse(await data(await call(flow.quota, "GET")));
  assert.equal(quota.reviewLeftThisMonth, 3);
  assert.equal(quota.activeGoalLimit, 2);

  const opened = await call(flow.startReview, "POST", { planId }, { idempotencyKey: "r1" });
  assert.equal(opened.status, 201);
  let review = planReviewViewSchema.parse(await data(opened));
  const current = planReviewViewSchema.parse(await data(await call(flow.currentReview, "GET", { planId })));
  assert.equal(current.draft.draftId, review.draft.draftId);
  const draftId = review.draft.draftId;
  review = planReviewViewSchema.parse(await data(await call(flow.reviewFix, "POST", { draftId }, { idempotencyKey: "rf1", premise: [], text: "投資家にもっと寄せたい" })));
  assert.equal(review.reviewLeftThisMonth, 2);
  const change = review.draft.turns.at(-1)!.changes[0]!;
  review = planReviewViewSchema.parse(await data(await call(flow.toggleChange, "POST", { changeId: change.id!, draftId }, { accepted: false, idempotencyKey: "t1" })));
  assert.equal(review.draft.turns.at(-1)!.changes[0]!.accepted, false);
  planReviewViewSchema.parse(await data(await call(flow.getReview, "GET", { draftId })));
  const confirmed = await call(flow.confirm, "POST", { draftId }, { idempotencyKey: "rc1" });
  assert.equal(confirmed.status, 201);
  planConfirmResultSchema.parse(await data(confirmed));

  const detail = await data(await call(plans.detail, "GET", { planId }));
  const edited = planGoalEditResultSchema.parse(await data(await call(flow.editGoal, "PATCH", { planId }, { expectedRevision: detail.revision, goalText: "新しい目標文", idempotencyKey: "g1", mode: "save_only" })));
  assert.equal(edited.reviewDraftId, null);

  const manual = await call(flow.openManualEdit, "POST", { planId }, { idempotencyKey: "m1" });
  assert.equal(manual.status, 201);
  planDraftViewSchema.parse(await data(manual));

  const achieved = await call(flow.achieve, "POST", { planId }, { expectedRevision: edited.revision, idempotencyKey: "a1" });
  assert.equal(achieved.status, 200);
  const done = planAchievementViewSchema.parse(await data(await call(plans.achievement, "GET", { planId })));
  assert.equal(done.planId, planId);
  const next = planNextGoalsResponseSchema.parse(await data(await call(flow.nextGoals, "GET", { planId })));
  assert.equal(next.source, "ai");
  const reviewAfter = await call(flow.startReview, "POST", { planId }, { idempotencyKey: "r2" });
  assert.equal(reviewAfter.status, 409, "an achieved goal cannot be reviewed");

  planLegacyListResponseSchema.parse(await data(await call(plans.legacyList, "GET")));
  assert.equal((await call(plans.legacyDetail, "GET", { planId: "nope" })).status, 404);
  resetPlansV2MockRepositoryForTests();
});

test("the review limit answers 409 REVIEW_LIMIT with the reset date", async () => {
  resetPlansV2MockRepositoryForTests();
  const flow = createPlanFlowHandlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const plans = createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const planId = planV2SummaryResponseSchema.parse(await data(await call(plans.summary, "GET"))).current!.planId;
  const review = planReviewViewSchema.parse(await data(await call(flow.startReview, "POST", { planId }, { idempotencyKey: "x1" })));
  for (const n of [1, 2, 3]) await call(flow.reviewFix, "POST", { draftId: review.draft.draftId }, { idempotencyKey: `x-send-${n}`, premise: [], text: "そのままでいい" });
  const refused = await call(flow.reviewFix, "POST", { draftId: review.draft.draftId }, { idempotencyKey: "x-send-4", premise: [], text: "そのままでいい" });
  assert.equal(refused.status, 409);
  const body = await refused.json();
  assert.equal(body.error.context.reason, "REVIEW_LIMIT");
  assert.ok(body.error.context.retryOn);
  resetPlansV2MockRepositoryForTests();
});

test("v1 creation is closed: bootstrap / POST plans / reanalyze answer 409 PLAN_V1_RETIRED with the v2 goal input", async () => {
  const post = createPlanV1RetiredHandler({ resolveActor: async () => ({ id: "actor:new" }) as never, resolveMode: () => "live" });
  const web = await post(new Request("http://localhost/api/agent/plans/bootstrap", { body: "{}", method: "POST" }));
  assert.equal(web.status, 409);
  const body = await web.json();
  assert.equal(body.error.context.reason, "PLAN_V1_RETIRED");
  assert.equal(body.error.context.href, "/app/tasks?tab=plan&new=1");
  const app = await post(new Request("http://localhost/api/agent/plans", { body: "{}", headers: { "x-orbit-platform": "app" }, method: "POST" }));
  assert.equal((await app.json()).error.context.href, "/task?seg=plan&new=1");
  const anonymous = createPlanV1RetiredHandler({ resolveActor: async () => null, resolveMode: () => "live" });
  assert.equal((await anonymous(new Request("http://localhost/api/agent/plans/reanalyze", { method: "POST" }))).status, 401);
});

test("the three v1 creation routes are wired to the retired handler", async () => {
  const routes = await Promise.all([
    import("../../app/api/agent/plans/route"),
    import("../../app/api/agent/plans/bootstrap/route"),
    import("../../app/api/agent/plans/reanalyze/route"),
  ]);
  const { planV1RetiredPost } = await import("../../features/plans/v2/v1-retired");
  for (const route of routes) assert.equal(route.POST, planV1RetiredPost);
});
