/**
 * R23 生成流程的路由处理（`app/api/agent/plans/{goal-kind,intakes,drafts}/**` 只 re-export 这里）。
 * 写法同 `handlers.ts`：live 要登录、mock 用演示账号；请求体 schema 严格，响应先过 schema；
 * 界面语言取 `x-orbit-lang` 或 `?lang`，深链平台取 `x-orbit-platform` 或 `?platform`（`app` / 默认 `web`）。
 */
import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";

import {
  planConfirmResultSchema,
  planDraftFixRequestSchema,
  planDraftManualEditRequestSchema,
  planDraftViewSchema,
  planFlowStepRequestSchema,
  planGoalKindRequestSchema,
  planGoalKindResultSchema,
  planIntakeAnswersRequestSchema,
  planIntakeBlockRequestSchema,
  planIntakeCreateRequestSchema,
  planIntakeLadderRequestSchema,
  planIntakeListResponseSchema,
  planIntakeMembersRequestSchema,
  planIntakePremiseRequestSchema,
  planIntakeViewSchema,
  planAchieveRequestSchema,
  planGoalEditRequestSchema,
  planGoalEditResultSchema,
  planNextGoalsResponseSchema,
  planQuotaResponseSchema,
  planReviewFixRequestSchema,
  planReviewStartRequestSchema,
  planReviewToggleRequestSchema,
  planReviewViewSchema,
} from "../../../shared/api-schema/plan-v2";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { PlanHrefPlatform } from "../../../shared/compute/plan-href";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { DEMO_ACTOR_ID } from "../../../shared/mock/demo-world/fixtures";
import { AppError, getHttpStatusForAppErrorCode, SAFE_INTERNAL_ERROR_MESSAGE } from "../../../shared/errors/app-error";
import type { ServiceResolution } from "../../../shared/services/module-mode";
import { redesignContractMode } from "../../redesign-contracts/route";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { resolvePlanFlowService } from "./flow-factory";
import { PlanFlowError, type PlanFlowRequestContext, type PlanFlowService } from "./flow-service";

type Params = Record<string, string>;
type Reply = { data: unknown; status?: number };

export interface PlanFlowRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  resolveMode?: () => FeatureMode;
  resolveService?: (input: { actorId: string; mode: FeatureMode }) => ServiceResolution<PlanFlowService>;
}

export function requestContext(request: Request): PlanFlowRequestContext {
  const url = new URL(request.url);
  const lang = (url.searchParams.get("lang") ?? request.headers.get("x-orbit-lang") ?? "ja").toLowerCase();
  const platform = (url.searchParams.get("platform") ?? request.headers.get("x-orbit-platform") ?? "web").toLowerCase();
  const language: PlanCopyLanguage = lang.startsWith("zh") ? "zh" : lang.startsWith("en") ? "en" : "ja";
  return { language, platform: (platform === "app" ? "app" : "web") as PlanHrefPlatform };
}

function flowRoute<T>(schema: ZodType<T>, handle: (service: PlanFlowService, request: Request, params: Params, context: PlanFlowRequestContext) => Promise<Reply>, dependencies: PlanFlowRouteDependencies) {
  return async function route(request: Request, routeContext?: { params?: Promise<Params> }): Promise<Response> {
    const mode = (dependencies.resolveMode ?? (() => redesignContractMode("plan-v2-summary")))();
    const headers = runtimeBoundaryHeaders(mode);
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor && mode === "live") return authenticatedApiActorRequiredResponse(mode);
    const resolution = (dependencies.resolveService ?? ((input) => resolvePlanFlowService(input)))({ actorId: actor?.id ?? DEMO_ACTOR_ID, mode });
    if (resolution.success === false) {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", resolution.error.message), { capabilityId: resolution.error.capabilityId, reason: resolution.error.code, requestedMode: resolution.error.requestedMode }), { headers, status: getHttpStatusForAppErrorCode("SERVICE_UNAVAILABLE") });
    }
    let reply: Reply;
    try {
      reply = await handle(resolution.service, request, (await routeContext?.params) ?? {}, requestContext(request));
    } catch (error) {
      if (error instanceof PlanFlowError) {
        return NextResponse.json(failure(error, { reason: error.reason, ...error.details }), { headers, status: getHttpStatusForAppErrorCode(error.code) });
      }
      if (error instanceof AppError && "reason" in error) {
        return NextResponse.json(failure(error, { reason: (error as AppError & { reason: string }).reason }), { headers, status: getHttpStatusForAppErrorCode(error.code) });
      }
      console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "plan_flow_route_failed" }));
      return NextResponse.json(failure(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE)), { headers, status: 500 });
    }
    const checked = schema.safeParse(reply.data);
    if (!checked.success) {
      console.error("[plan-flow] response failed its schema", checked.error.issues.slice(0, 5));
      return NextResponse.json(failure(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE)), { headers, status: 500 });
    }
    return NextResponse.json(success(checked.data), { headers, status: reply.status ?? 200 });
  };
}

async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new PlanFlowError("INVALID_INPUT", "The request body is not valid.");
  return parsed.data;
}

const notFound = (what: string) => {
  throw new PlanFlowError(what === "draft" ? "DRAFT_NOT_FOUND" : what === "plan" ? "PLAN_NOT_FOUND" : "INTAKE_NOT_FOUND", "Not found.");
};

const planAchievedSchema = z.object({ planId: z.string().min(1), achievedAt: z.string().min(1) });

export function createPlanFlowHandlers(dependencies: PlanFlowRouteDependencies = {}) {
  return {
    /** POST /api/agent/plans/goal-kind：目标类型推测（C1）。 */
    goalKind: flowRoute(planGoalKindResultSchema, async (service, request, _params, context) => ({ data: await service.guessGoalKind((await body(request, planGoalKindRequestSchema)).text, context) }), dependencies),
    /** GET /api/agent/plans/intakes：未完成的流程 + 新目标余量。 */
    listIntakes: flowRoute(planIntakeListResponseSchema, async (service, _request, _params, context) => ({ data: await service.listIntakes(context) }), dependencies),
    /** POST /api/agent/plans/intakes：新建流程并下书背景（C2）。 */
    createIntake: flowRoute(planIntakeViewSchema, async (service, request, _params, context) => ({ data: await service.createIntake(await body(request, planIntakeCreateRequestSchema), context), status: 201 }), dependencies),
    /** GET /api/agent/plans/intakes/[intakeId]。 */
    getIntake: flowRoute(planIntakeViewSchema, async (service, _request, params, context) => ({ data: (await service.getIntake(params.intakeId ?? "", context)) ?? notFound("intake") }), dependencies),
    /** PATCH /api/agent/plans/intakes/[intakeId]：逐块确认。 */
    confirmBlock: flowRoute(planIntakeViewSchema, async (service, request, params, context) => ({ data: await service.confirmBlock(params.intakeId ?? "", await body(request, planIntakeBlockRequestSchema), context) }), dependencies),
    /** POST …/background：背景下书「もう一度」。 */
    retryBackground: flowRoute(planIntakeViewSchema, async (service, request, params, context) => ({ data: await service.retryBackground(params.intakeId ?? "", (await body(request, planFlowStepRequestSchema)).idempotencyKey, context) }), dependencies),
    /** POST …/members：加成员（人脈から C3 / 自分で書く）。 */
    addMembers: flowRoute(planIntakeViewSchema, async (service, request, params, context) => ({ data: await service.addMembers(params.intakeId ?? "", await body(request, planIntakeMembersRequestSchema), context) }), dependencies),
    /** POST …/ladder：改「やりたいこと」后重算阶梯（C4）。 */
    ladder: flowRoute(planIntakeViewSchema, async (service, request, params, context) => ({ data: await service.recomputeLadder(params.intakeId ?? "", await body(request, planIntakeLadderRequestSchema), context) }), dependencies),
    /** POST …/questions：选题（C5）。 */
    questions: flowRoute(planIntakeViewSchema, async (service, request, params, context) => ({ data: await service.chooseQuestions(params.intakeId ?? "", (await body(request, planFlowStepRequestSchema)).idempotencyKey, context) }), dependencies),
    /** POST …/answers：一次提交回答 → 前提。 */
    answers: flowRoute(planIntakeViewSchema, async (service, request, params, context) => ({ data: await service.submitAnswers(params.intakeId ?? "", await body(request, planIntakeAnswersRequestSchema), context) }), dependencies),
    /** PATCH …/premise：改前提的一行。 */
    premise: flowRoute(planIntakeViewSchema, async (service, request, params, context) => ({ data: await service.editPremise(params.intakeId ?? "", await body(request, planIntakePremiseRequestSchema), context) }), dependencies),
    /** POST …/draft：初版（C6）。 */
    draft: flowRoute(planDraftViewSchema, async (service, request, params, context) => ({ data: await service.makeDraft(params.intakeId ?? "", (await body(request, planFlowStepRequestSchema)).idempotencyKey, context), status: 201 }), dependencies),
    /** GET /api/agent/plans/drafts/[draftId]。 */
    getDraft: flowRoute(planDraftViewSchema, async (service, _request, params, context) => ({ data: (await service.getDraft(params.draftId ?? "", context)) ?? notFound("draft") }), dependencies),
    /** POST …/fix：AI 修正（C7）。 */
    fix: flowRoute(planDraftViewSchema, async (service, request, params, context) => ({ data: await service.fix(params.draftId ?? "", await body(request, planDraftFixRequestSchema), context) }), dependencies),
    /** POST …/reset：恢复到 AI 方案。 */
    reset: flowRoute(planDraftViewSchema, async (service, request, params, context) => ({ data: await service.reset(params.draftId ?? "", (await body(request, planFlowStepRequestSchema)).idempotencyKey, context) }), dependencies),
    /** POST …/manual-edit：手动编辑并确定。 */
    manualEdit: flowRoute(planConfirmResultSchema, async (service, request, params, context) => ({ data: await service.manualEdit(params.draftId ?? "", await body(request, planDraftManualEditRequestSchema), context), status: 201 }), dependencies),
    /** POST …/confirm：确定。 */
    confirm: flowRoute(planConfirmResultSchema, async (service, request, params, context) => {
      const result = await service.confirm(params.draftId ?? "", (await body(request, planFlowStepRequestSchema)).idempotencyKey, context);
      return { data: result, status: result.replayed ? 200 : 201 };
    }, dependencies),

    /* ---------- R25 見直し、配额、达成、改目标 ---------- */
    /** POST /api/agent/plans/v2/[planId]/reviews：开始見直し（不扣次数；C8 预标当天缓存）。 */
    startReview: flowRoute(planReviewViewSchema, async (service, request, params, context) => ({ data: await service.startReview(params.planId ?? "", (await body(request, planReviewStartRequestSchema)).idempotencyKey, context), status: 201 }), dependencies),
    /** GET /api/agent/plans/v2/[planId]/reviews/current：进行中的見直し。 */
    currentReview: flowRoute(planReviewViewSchema, async (service, _request, params, context) => ({ data: (await service.currentReview(params.planId ?? "", context)) ?? notFound("draft") }), dependencies),
    /** GET /api/agent/plans/drafts/[draftId]/review。 */
    getReview: flowRoute(planReviewViewSchema, async (service, _request, params, context) => ({ data: (await service.getReview(params.draftId ?? "", context)) ?? notFound("draft") }), dependencies),
    /** POST /api/agent/plans/drafts/[draftId]/review/fix：发出修正（C9，扣月配额；失败不扣）。 */
    reviewFix: flowRoute(planReviewViewSchema, async (service, request, params, context) => ({ data: await service.reviewFix(params.draftId ?? "", await body(request, planReviewFixRequestSchema), context) }), dependencies),
    /** POST /api/agent/plans/drafts/[draftId]/changes/[changeId]/toggle：逐条采用 / 不采用。 */
    toggleChange: flowRoute(planReviewViewSchema, async (service, request, params, context) => ({ data: await service.toggleChange(params.draftId ?? "", params.changeId ?? "", await body(request, planReviewToggleRequestSchema), context) }), dependencies),
    /** GET /api/agent/plans/v2/quota。 */
    quota: flowRoute(planQuotaResponseSchema, async (service) => ({ data: await service.quota() }), dependencies),
    /** POST /api/agent/plans/v2/[planId]/manual-edit：确定后的手动编辑（开 review 草稿，不调 AI）。 */
    openManualEdit: flowRoute(planDraftViewSchema, async (service, request, params, context) => ({ data: await service.openManualEdit(params.planId ?? "", (await body(request, planFlowStepRequestSchema)).idempotencyKey, context), status: 201 }), dependencies),
    /** POST /api/agent/plans/v2/[planId]/achieve。 */
    achieve: flowRoute(planAchievedSchema, async (service, request, params) => ({ data: await service.achieve(params.planId ?? "", await body(request, planAchieveRequestSchema)) }), dependencies),
    /** GET /api/agent/plans/v2/[planId]/next-goals（C10，每计划一次）。 */
    nextGoals: flowRoute(planNextGoalsResponseSchema, async (service, _request, params, context) => ({ data: await service.nextGoals(params.planId ?? "", context) }), dependencies),
    /** PATCH /api/agent/plans/v2/[planId]/goal。 */
    editGoal: flowRoute(planGoalEditResultSchema, async (service, request, params, context) => ({ data: await service.editGoal(params.planId ?? "", await body(request, planGoalEditRequestSchema), context) }), dependencies),
  };
}

export const planFlowHandlers = createPlanFlowHandlers();
