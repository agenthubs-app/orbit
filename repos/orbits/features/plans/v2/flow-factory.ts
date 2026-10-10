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
import { createDisabledPlanFlowAi } from "./ai/disabled";
import type { PlanFlowAi } from "./ai/types";
import { createLivePlanFlowContext, createMockPlanFlowContext } from "./flow-context";
import { createPlanFlowService, type PlanFlowService } from "./flow-service";
import { resolvePlanV2Parts } from "./service-factory";
import { enqueuePlanSourceMatchAfterSave } from "../matching-runtime";

export const PLAN_V2_AI_ENV = "ORBIT_PLAN_V2_AI";

/**
 * live 下的 AI（复核 M6）：开关打开且有密钥和账本 → DeepSeek；否则「不可用」——轻量步骤与背景下书走规则，
 * 初版 / 修正返回失败卡。绝不在 live 下用 mock 生成演示内容（那会变成用户的正式计划）。
 */
export function configuredPlanFlowAi(env: Record<string, string | undefined> = process.env): PlanFlowAi {
  if ((env[PLAN_V2_AI_ENV] ?? "").trim().toLowerCase() !== "ai") return createDisabledPlanFlowAi();
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  const runtime = apiKey ? getConfiguredNetworkAnalysisRuntime() : null;
  if (!apiKey || !runtime) return createDisabledPlanFlowAi();
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
      afterConfirmed: live ? (job) => enqueuePlanSourceMatchAfterSave(job) : undefined,
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
