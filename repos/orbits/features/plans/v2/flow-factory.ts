/**
 * R23：生成流程服务的装配。仓储与 v2 服务共用（`resolvePlanV2Parts`）；AI 按开关选择：
 * `ORBIT_PLAN_V2_AI=ai` 且有 `DEEPSEEK_API_KEY`、live 数据库（账本）时用 DeepSeek，否则 mock（DESIGN §5.1：授权前一律 mock；
 * 生产默认 mock）。mock 模块模式下联系人与资料来自演示世界。
 */
import { getConfiguredNetworkAnalysisRuntime } from "../../network-analysis/runtime";
import { DEFAULT_BUSINESS_CARD_TEXT_MODEL } from "../../acquisition/deepseek-business-card-ocr-provider";
import { bindDeepseekPlanChat } from "../ai-generator";
import type { ModuleMode, ServiceResolution } from "../../../shared/services/module-mode";
import type { PlanPoolLike } from "../repository";
import { createDeepseekPlanFlowAi } from "./ai/deepseek";
import { createMockPlanFlowAi } from "./ai/mock";
import type { PlanFlowAi } from "./ai/types";
import { createLivePlanFlowContext, createMockPlanFlowContext } from "./flow-context";
import { createPlanFlowService, type PlanFlowService } from "./flow-service";
import { resolvePlanV2Parts } from "./service-factory";

export const PLAN_V2_AI_ENV = "ORBIT_PLAN_V2_AI";

export function configuredPlanFlowAi(env: Record<string, string | undefined> = process.env): PlanFlowAi {
  if ((env[PLAN_V2_AI_ENV] ?? "").trim().toLowerCase() !== "ai") return createMockPlanFlowAi();
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  const runtime = apiKey ? getConfiguredNetworkAnalysisRuntime() : null;
  if (!apiKey || !runtime) return createMockPlanFlowAi();
  const model = env.ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL?.trim() || DEFAULT_BUSINESS_CARD_TEXT_MODEL;
  return createDeepseekPlanFlowAi({ chat: bindDeepseekPlanChat({ apiKey, model }), ledger: runtime.ledger, model });
}

export function resolvePlanFlowService(input: { actorId: string; mode?: ModuleMode | string; now?: () => Date; ai?: PlanFlowAi }): ServiceResolution<PlanFlowService> {
  const parts = resolvePlanV2Parts(input);
  if (parts.success === false) return parts;
  const { pool, repository, scope, service } = parts.service;
  const live = Boolean(pool);
  return {
    mode: parts.mode,
    service: createPlanFlowService({
      ai: input.ai ?? (live ? configuredPlanFlowAi() : createMockPlanFlowAi()),
      context: live ? createLivePlanFlowContext({ mode: "live", pool: pool as PlanPoolLike, workspaceId: scope.workspaceId }) : createMockPlanFlowContext(),
      now: input.now,
      planService: service,
      repository,
      scope,
    }),
    success: true,
  };
}
