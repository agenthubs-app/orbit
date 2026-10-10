/**
 * R22 计划 v2 的路由处理（每个 app/api/agent/plans/v2/** 的 route.ts 只 re-export 这里的函数）。
 *
 * - live（生产恒为 live）：要登录；服务 = 与 v1 同库的 `PlanV2Service`；数据库未配置时 503 NOT_IMPLEMENTED；
 * - mock（开发 / 测试）：不要求登录（没有登录时用演示账号），读写演示世界装好的示例计划（`sample: true`）；
 *   本机 live 时可用 `ORBIT_REDESIGN_MOCK=plan-v2-summary` 把这组接口切回 mock（同 R08 的做法，生产忽略）。
 * - 响应先过契约 schema 再发出；请求体 schema 严格（README 通用规则 10）。
 */
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import {
  planAwardRequestSchema,
  planAwardResultSchema,
  planCommandResultSchema,
  planGoalListResponseSchema,
  planOpenResultSchema,
  planSkipRequestSchema,
  planStepRequestSchema,
  planUndoRequestSchema,
  planV2DetailSchema,
  planV2SummaryResponseSchema,
  planCandidateDecisionRequestSchema,
  planCandidateDecisionResultSchema,
  planContactFitSchema,
  planIntroDraftRequestSchema,
  planIntroDraftResultSchema,
  planPendingDecisionRequestSchema,
  planPendingDecisionResultSchema,
  planPendingListResponseSchema,
  planPersonTypeDetailSchema,
  planProposalRequestSchema,
  planProposalResultSchema,
  planTalkedOfflineRequestSchema,
  planTalkedOfflineResultSchema,
  planAchievementViewSchema,
  planLegacyDetailSchema,
  planLegacyListResponseSchema,
} from "../../../shared/api-schema/plan-v2";
import { requestContext } from "./flow-handlers";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { DEMO_ACTOR_ID } from "../../../shared/mock/demo-world/fixtures";
import { AppError, getHttpStatusForAppErrorCode, SAFE_INTERNAL_ERROR_MESSAGE } from "../../../shared/errors/app-error";
import type { ServiceResolution } from "../../../shared/services/module-mode";
import { redesignContractMode } from "../../redesign-contracts/route";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { PlanV2Error, type PlanV2Service } from "./service";
import { resolvePlanV2Service } from "./service-factory";

type Params = Record<string, string>;

export interface PlanV2RouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  resolveMode?: () => FeatureMode;
  resolveService?: (input: { actorId: string; mode: FeatureMode }) => ServiceResolution<PlanV2Service>;
}

type Reply = { data: unknown; status?: number } | { error: AppError };

function planV2Route<T>(schema: ZodType<T> | null, handle: (service: PlanV2Service, request: Request, params: Params) => Promise<Reply>, dependencies: PlanV2RouteDependencies = {}) {
  return async function route(request: Request, context?: { params?: Promise<Params> }): Promise<Response> {
    const mode = (dependencies.resolveMode ?? (() => redesignContractMode("plan-v2-summary")))();
    const headers = runtimeBoundaryHeaders(mode);
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor && mode === "live") return authenticatedApiActorRequiredResponse(mode);
    const resolution = (dependencies.resolveService ?? ((input) => resolvePlanV2Service(input)))({ actorId: actor?.id ?? DEMO_ACTOR_ID, mode });
    if (resolution.success === false) {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", resolution.error.message), {
        capabilityId: resolution.error.capabilityId,
        reason: resolution.error.code,
        requestedMode: resolution.error.requestedMode,
      }), { headers, status: getHttpStatusForAppErrorCode("SERVICE_UNAVAILABLE") });
    }
    let reply: Reply;
    try {
      reply = await handle(resolution.service, request, (await context?.params) ?? {});
    } catch (error) {
      if (error instanceof PlanV2Error) {
        return NextResponse.json(failure(error, { reason: error.reason }), { headers, status: getHttpStatusForAppErrorCode(error.code) });
      }
      console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "plan_v2_route_failed" }));
      return NextResponse.json(failure(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE)), { headers, status: 500 });
    }
    if ("error" in reply) return NextResponse.json(failure(reply.error), { headers, status: getHttpStatusForAppErrorCode(reply.error.code) });
    if (!schema) return NextResponse.json(success(reply.data), { headers, status: reply.status ?? 200 });
    const checked = schema.safeParse(reply.data);
    if (!checked.success) {
      console.error("[plan-v2] response failed its schema", checked.error.issues.slice(0, 5));
      return NextResponse.json(failure(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE)), { headers, status: 500 });
    }
    return NextResponse.json(success(checked.data), { headers, status: reply.status ?? 200 });
  };
}

async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new PlanV2Error("INVALID_INPUT", "The request body is not valid.");
  return parsed.data;
}

const notFound = () => ({ error: new AppError("NOT_FOUND", "Plan not found.") });

export function createPlanV2Handlers(dependencies: PlanV2RouteDependencies = {}) {
  return {
    /** GET /api/agent/plans/v2/summary：首页「プラン スコア」组件。 */
    summary: planV2Route(planV2SummaryResponseSchema, async (service) => ({ data: await service.summary() }), dependencies),
    /** GET /api/agent/plans/v2：目标列表（生效 + 已达成）。 */
    list: planV2Route(planGoalListResponseSchema, async (service) => ({ data: { goals: await service.listGoals() } }), dependencies),
    /** GET /api/agent/plans/v2/[planId]：概要（R24 带今日のチャンス、三格、Step 进度、最近加分、待确认）。 */
    detail: planV2Route(planV2DetailSchema, async (service, request, params) => {
      const detail = await service.overview(params.planId ?? "", requestContext(request));
      return detail ? { data: detail } : notFound();
    }, dependencies),
    /** GET /api/agent/plans/v2/[planId]/types/[itemId]：人物タイプ詳細。 */
    typeDetail: planV2Route(planPersonTypeDetailSchema, async (service, request, params) => {
      const detail = await service.typeDetail(params.planId ?? "", params.itemId ?? "", requestContext(request));
      return detail ? { data: detail } : notFound();
    }, dependencies),
    /** POST …/types/[itemId]/candidates/[contactId]/decision：候补 ✓ / ✕（只关联，不生成行动）。 */
    candidateDecision: planV2Route(planCandidateDecisionResultSchema, async (service, request, params) => {
      const input = await body(request, planCandidateDecisionRequestSchema);
      return { data: await service.decideCandidate({ contactId: params.contactId ?? "", decision: input.decision, idempotencyKey: input.idempotencyKey, itemId: params.itemId ?? "", planId: params.planId ?? "" }) };
    }, dependencies),
    /** POST …/types/[itemId]/talked-offline：线下聊过（名字可空）。 */
    talkedOffline: planV2Route(planTalkedOfflineResultSchema, async (service, request, params) => {
      const input = await body(request, planTalkedOfflineRequestSchema);
      return { data: await service.talkedOffline({ itemId: params.itemId ?? "", planId: params.planId ?? "", request: input }) };
    }, dependencies),
    /** POST …/types/[itemId]/proposals：面談を提案（草稿）。 */
    proposal: planV2Route(planProposalResultSchema, async (service, request, params) => {
      const input = await body(request, planProposalRequestSchema);
      return { data: await service.proposal({ contactId: input.contactId, itemId: params.itemId ?? "", language: requestContext(request).language, planId: params.planId ?? "", slots: input.slots }) };
    }, dependencies),
    /** POST …/types/[itemId]/intro-drafts：紹介ルートの依頼文（草稿）。 */
    introDraft: planV2Route(planIntroDraftResultSchema, async (service, request, params) => {
      const input = await body(request, planIntroDraftRequestSchema);
      return { data: await service.introDraft({ itemId: params.itemId ?? "", language: requestContext(request).language, planId: params.planId ?? "", viaContactId: input.viaContactId }) };
    }, dependencies),
    /** GET /api/agent/plans/v2/pending：待确认项（给 R20）。 */
    pending: planV2Route(planPendingListResponseSchema, async (service, request) => ({ data: { items: await service.pending(requestContext(request)) } }), dependencies),
    /** POST /api/agent/plans/v2/pending/[id]/accept。 */
    acceptPending: planV2Route(planPendingDecisionResultSchema, async (service, request, params) => {
      const input = await body(request, planPendingDecisionRequestSchema);
      return { data: await service.decidePending({ answered: input.answered, decision: "accept", id: params.id ?? "", idempotencyKey: input.idempotencyKey }) };
    }, dependencies),
    /** POST /api/agent/plans/v2/pending/[id]/dismiss。 */
    dismissPending: planV2Route(planPendingDecisionResultSchema, async (service, request, params) => {
      const input = await body(request, planPendingDecisionRequestSchema);
      return { data: await service.decidePending({ decision: "dismiss", id: params.id ?? "", idempotencyKey: input.idempotencyKey }) };
    }, dependencies),
    /** GET /api/agent/plans/v2/contacts/[contactId]/fit（给 R11）。 */
    contactFit: planV2Route(planContactFitSchema, async (service, _request, params) => ({ data: await service.contactFit(params.contactId ?? "") }), dependencies),
    /** POST /api/agent/plans/v2/[planId]/open：切换目标时记下最近打开。 */
    open: planV2Route(planOpenResultSchema, async (service, _request, params) => {
      await service.markOpened(params.planId ?? "");
      return { data: { planId: params.planId } };
    }, dependencies),
    /** POST /api/agent/plans/v2/[planId]/types/[itemId]/awards：记一次「话过了」。 */
    award: planV2Route(planAwardResultSchema, async (service, request, params) => {
      const input = await body(request, planAwardRequestSchema);
      const result = await service.award({ itemId: params.itemId ?? "", planId: params.planId ?? "", request: input });
      return { data: result, status: result.replayed || result.part === "none" ? 200 : 201 };
    }, dependencies),
    /** POST /api/agent/plans/v2/[planId]/awards/[logId]/undo：撤销一次计分。 */
    undo: planV2Route(planCommandResultSchema, async (service, request, params) => {
      const input = await body(request, planUndoRequestSchema);
      return { data: await service.undo({ idempotencyKey: input.idempotencyKey, logId: params.logId ?? "", planId: params.planId ?? "" }) };
    }, dependencies),
    /** POST /api/agent/plans/v2/[planId]/types/[itemId]/skip：跳过（習熟済み）。 */
    skip: planV2Route(planCommandResultSchema, async (service, request, params) => {
      const input = await body(request, planSkipRequestSchema);
      return { data: await service.skip({ idempotencyKey: input.idempotencyKey, itemId: params.itemId ?? "", planId: params.planId ?? "" }) };
    }, dependencies),
    /** DELETE /api/agent/plans/v2/[planId]/types/[itemId]/skip：撤回跳过。 */
    unskip: planV2Route(planCommandResultSchema, async (service, request, params) => {
      const input = await body(request, planSkipRequestSchema);
      return { data: await service.unskip({ idempotencyKey: input.idempotencyKey, itemId: params.itemId ?? "", planId: params.planId ?? "" }) };
    }, dependencies),
    /** POST /api/agent/plans/v2/[planId]/steps/[stepKey]/complete：Step 完成（用户确认后）。 */
    completeStep: planV2Route(planCommandResultSchema, async (service, request, params) => {
      const input = await body(request, planStepRequestSchema);
      return { data: await service.setStepCompleted({ completed: true, idempotencyKey: input.idempotencyKey, planId: params.planId ?? "", stepKey: params.stepKey ?? "" }) };
    }, dependencies),
    /** DELETE /api/agent/plans/v2/[planId]/steps/[stepKey]/complete：撤回完成。 */
    reopenStep: planV2Route(planCommandResultSchema, async (service, request, params) => {
      const input = await body(request, planStepRequestSchema);
      return { data: await service.setStepCompleted({ completed: false, idempotencyKey: input.idempotencyKey, planId: params.planId ?? "", stepKey: params.stepKey ?? "" }) };
    }, dependencies),
    /** GET /api/agent/plans/v2/[planId]/achievement：完成页（R25）。 */
    achievement: planV2Route(planAchievementViewSchema, async (service, request, params) => {
      const view = await service.achievement(params.planId ?? "", requestContext(request).language);
      return view ? { data: view } : notFound();
    }, dependencies),
    /** GET /api/agent/plans/legacy：v1 计划只读摘要（R25）。 */
    legacyList: planV2Route(planLegacyListResponseSchema, async (service) => ({ data: await service.legacyList() }), dependencies),
    /** GET /api/agent/plans/legacy/[planId]：以前のプラン（只读）。 */
    legacyDetail: planV2Route(planLegacyDetailSchema, async (service, _request, params) => {
      const detail = await service.legacyDetail(params.planId ?? "");
      return detail ? { data: detail } : notFound();
    }, dependencies),
  };
}

export const planV2Handlers = createPlanV2Handlers();
