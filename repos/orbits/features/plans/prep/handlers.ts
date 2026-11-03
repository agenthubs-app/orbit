/**
 * R37a 主页「先做的事」的路由（app/api/agent/plans/v2/[planId]/home/** 与 app/api/contacts/[id]/facts 只 re-export 这里）。
 *
 * - `schedulePlanHome`：概要读取 / 确定成功后在 `after()` 里补生成（不阻塞响应；生成服务自己判断要不要做）。
 * - 勾选、重新生成：响应 = 更新后的 `PlanHomeView`。重新生成用完每日次数 → 409 `LIMIT`。
 * - 手动补事实：写 `contact_facts`（`field: manual`），并把该联系人的准备卡标为「资料有更新」。
 */
import { after, NextResponse } from "next/server";
import type { ZodType } from "zod";

import { contactManualFactRequestSchema, contactManualFactResultSchema, planHomeDoneRequestSchema, planHomeRegenerateRequestSchema, planHomeViewSchema } from "../../../shared/api-schema/plan-v2";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { DEMO_ACTOR_ID } from "../../../shared/mock/demo-world/fixtures";
import { AppError, getHttpStatusForAppErrorCode, SAFE_INTERNAL_ERROR_MESSAGE } from "../../../shared/errors/app-error";
import type { ServiceResolution } from "../../../shared/services/module-mode";
import { redesignContractMode } from "../../redesign-contracts/route";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { addManualContactFact, ContactFactError } from "../../contacts/facts/accumulate";
import { createConfiguredContactFactStore } from "../../contacts/facts/store";
import type { ContactFactStore } from "../../contacts/facts/types";
import { markPlanPrepStale, resolvePlanPrepService } from "./factory";
import { PlanPrepError, type PlanPrepService } from "./service";

export interface PlanHomeScheduleInput {
  actorId: string;
  mode: FeatureMode | string;
  planId: string;
  language: PlanCopyLanguage;
}

/** 默认：`after()` 里跑一次 `ensure`（失败只记日志）。 */
export function schedulePlanHome(input: PlanHomeScheduleInput, schedule: (task: () => Promise<void>) => void = after): void {
  const task = async () => {
    try {
      const resolution = resolvePlanPrepService({ actorId: input.actorId, mode: input.mode });
      if (resolution.success === true) await resolution.service.ensure(input.planId, input.language);
    } catch (error) {
      console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "plan_prep_ensure_failed" }));
    }
  };
  try {
    schedule(task);
  } catch {
    // 不在请求作用域（脚本 / 测试直接调路由函数）：不补生成，下次读概要时再来。
  }
}

export interface PlanHomeRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  resolveMode?: () => FeatureMode;
  resolveService?: (input: { actorId: string; mode: FeatureMode }) => ServiceResolution<PlanPrepService>;
  /** 手动补事实：事实库（live = 配置的 record store；mock 模式没有 → 503）。 */
  factStore?: () => ContactFactStore | null;
  /** 补事实后的置旧（默认 = 本人生效计划里这个人的卡）。 */
  markStale?: (input: { actorId: string; contactId: string; mode: FeatureMode }) => Promise<number>;
  now?: () => Date;
}

/** 与 `flow-handlers.requestContext` 同一规则（`?lang=` / `x-orbit-lang`，缺省日文）。 */
function languageOf(request: Request): PlanCopyLanguage {
  const lang = (new URL(request.url).searchParams.get("lang") ?? request.headers.get("x-orbit-lang") ?? "ja").toLowerCase();
  return lang.startsWith("zh") ? "zh" : lang.startsWith("en") ? "en" : "ja";
}

type Params = Record<string, string>;
type Reply = { data: unknown; status?: number };

function homeRoute<T>(schema: ZodType<T>, handle: (input: { service: PlanPrepService; request: Request; params: Params; actorId: string; mode: FeatureMode }) => Promise<Reply>, dependencies: PlanHomeRouteDependencies) {
  return async function route(request: Request, context?: { params?: Promise<Params> }): Promise<Response> {
    const mode = (dependencies.resolveMode ?? (() => redesignContractMode("plan-v2-summary")))();
    const headers = runtimeBoundaryHeaders(mode);
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor && mode === "live") return authenticatedApiActorRequiredResponse(mode);
    const actorId = actor?.id ?? DEMO_ACTOR_ID;
    const resolution = (dependencies.resolveService ?? ((input) => resolvePlanPrepService(input)))({ actorId, mode });
    if (resolution.success === false) {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", resolution.error.message), { reason: resolution.error.code }), { headers, status: getHttpStatusForAppErrorCode("SERVICE_UNAVAILABLE") });
    }
    let reply: Reply;
    try {
      reply = await handle({ actorId, mode, params: (await context?.params) ?? {}, request, service: resolution.service });
    } catch (error) {
      if (error instanceof PlanPrepError) return NextResponse.json(failure(error, { reason: error.reason }), { headers, status: getHttpStatusForAppErrorCode(error.code) });
      if (error instanceof AppError && "reason" in error) return NextResponse.json(failure(error, { reason: (error as AppError & { reason: string }).reason }), { headers, status: getHttpStatusForAppErrorCode(error.code) });
      console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "plan_home_route_failed" }));
      return NextResponse.json(failure(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE)), { headers, status: 500 });
    }
    const checked = schema.safeParse(reply.data);
    if (!checked.success) {
      console.error("[plan-home] response failed its schema", checked.error.issues.slice(0, 5));
      return NextResponse.json(failure(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE)), { headers, status: 500 });
    }
    return NextResponse.json(success(checked.data), { headers, status: reply.status ?? 200 });
  };
}

class InvalidBody extends AppError {
  readonly reason = "INVALID_INPUT";
  constructor() { super("VALIDATION_ERROR", "The request body is not valid."); }
}

async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new InvalidBody();
  return parsed.data;
}

class FactRefused extends AppError {
  constructor(readonly reason: string, code: "VALIDATION_ERROR" | "SERVICE_UNAVAILABLE" | "NOT_FOUND") { super(code, reason); }
}

export function createPlanHomeHandlers(dependencies: PlanHomeRouteDependencies = {}) {
  return {
    /** POST /api/agent/plans/v2/[planId]/home/actions/[actionKey]/done：勾选 / 取消。 */
    done: homeRoute(planHomeViewSchema, async ({ service, request, params }) => {
      const input = await body(request, planHomeDoneRequestSchema);
      return { data: await service.setDone({ actionKey: params.actionKey ?? "", done: input.done, planId: params.planId ?? "" }) };
    }, dependencies),
    /** POST …/home/actions/[actionKey]/regenerate：重新生成这张准备卡（计入每日 15 次）。 */
    regenerate: homeRoute(planHomeViewSchema, async ({ service, request, params }) => {
      const input = await body(request, planHomeRegenerateRequestSchema);
      return { data: await service.regenerate({ actionKey: params.actionKey ?? "", idempotencyKey: input.idempotencyKey, language: languageOf(request), planId: params.planId ?? "" }) };
    }, dependencies),
    /** POST /api/contacts/[id]/facts：手动补一条事实（≤80 字，同文本合并）。 */
    manualFact: homeRoute(contactManualFactResultSchema, async ({ service, request, params, actorId, mode }) => {
      const input = await body(request, contactManualFactRequestSchema);
      if (!(await service.hasContact(params.id ?? ""))) throw new FactRefused("CONTACT_NOT_FOUND", "NOT_FOUND");
      const store = (dependencies.factStore ?? createConfiguredContactFactStore)();
      if (!store) throw new FactRefused("FACTS_UNAVAILABLE", "SERVICE_UNAVAILABLE");
      const contactId = params.id ?? "";
      let fact;
      try {
        fact = await addManualContactFact(store, { actorId, at: (dependencies.now ?? (() => new Date()))().toISOString(), contactId, text: input.text });
      } catch (error) {
        if (error instanceof ContactFactError) throw new FactRefused(error.code, "VALIDATION_ERROR");
        throw error;
      }
      const staleCards = await (dependencies.markStale ?? markPlanPrepStale)({ actorId, contactId, mode });
      return { data: { factId: fact.id, staleCards, text: fact.text }, status: 201 };
    }, dependencies),
  };
}

export const planHomeHandlers = createPlanHomeHandlers();
