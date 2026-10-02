/**
 * 计划生成器的替换点（W0008；AGENTS.md「Mock-to-Live Component Replacement」）。
 *
 * 路由只通过 `resolvePlanGenerator()` 取生成器，不直接 import mock。
 *
 * 选择只看 `ORBIT_PLAN_GENERATOR`（缺省 `mock`），**不跟随 `ORBIT_MODULE_MODE`**：
 * D3 决定计划生成先不接 AI，mock 生成器就是现阶段的产品行为——它只把用户自己的真实联系人和
 * 真实活动目录套进模板，不读任何夹具，所以 live 环境（含生产）同样使用它。
 * 其他取值（例如之后的 `ai`）在对应实现注册前一律 fail closed：返回共享的 NOT_IMPLEMENTED
 * 解析失败，路由转成 503，绝不回落到别的 provider，也不会发出任何外部请求。
 *
 * W0048b（D42 推翻 D3）：注册 `ai`（`ai-generator.ts`，DeepSeek 两阶段、按操作计次）。缺 `DEEPSEEK_API_KEY`
 * 或没有 live 数据库（账本）时同样 fail closed，不静默回退 mock。生产仍不设该变量（= mock），切换放 W0055 授权（W48-9）。
 */
import {
  createNotImplementedFailure,
  type ServiceResolution,
} from "../../shared/services/module-mode";
import { AI_PLAN_PROVIDER, createConfiguredAiPlanGenerator } from "./ai-generator";
import type { PlanGenerator } from "./generator";
import { createMockPlanGenerator } from "./mock-generator";

export const PLAN_GENERATOR_CAPABILITY_ID = "plan-generator";
export const DEFAULT_PLAN_GENERATOR_PROVIDER = "mock";

const PROVIDERS: Record<string, () => PlanGenerator | null> = {
  [AI_PLAN_PROVIDER]: () => createConfiguredAiPlanGenerator(),
  mock: createMockPlanGenerator,
};

export function resolvePlanGenerator(
  input: { provider?: string | null } = {},
): ServiceResolution<PlanGenerator> {
  const provider = (input.provider ?? process.env.ORBIT_PLAN_GENERATOR ?? DEFAULT_PLAN_GENERATOR_PROVIDER)
    .trim()
    .toLowerCase() || DEFAULT_PLAN_GENERATOR_PROVIDER;
  const create = Object.prototype.hasOwnProperty.call(PROVIDERS, provider) ? PROVIDERS[provider] : undefined;
  const service = create?.() ?? null;
  if (!service) return createNotImplementedFailure(PLAN_GENERATOR_CAPABILITY_ID, "live", ["mock"]);
  return { mode: provider === DEFAULT_PLAN_GENERATOR_PROVIDER ? "mock" : "live", service, success: true };
}

/** W0048b：计划页用来决定是否显示「AI 重新生成」（只看配置，不构造生成器、不读库）。 */
export function isAiPlanGeneratorConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env.ORBIT_PLAN_GENERATOR ?? "").trim().toLowerCase() === AI_PLAN_PROVIDER && Boolean(env.DEEPSEEK_API_KEY?.trim());
}
