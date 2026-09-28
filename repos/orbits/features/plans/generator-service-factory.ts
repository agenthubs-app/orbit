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
 * 接真实 AI 时：新增 `ai-generator.ts` 实现 `PlanGenerator`，在 `PROVIDERS` 里注册，
 * 并在目标环境设置 `ORBIT_PLAN_GENERATOR=ai`（需要新的预算决定）。
 */
import {
  createNotImplementedFailure,
  type ServiceResolution,
} from "../../shared/services/module-mode";
import type { PlanGenerator } from "./generator";
import { createMockPlanGenerator } from "./mock-generator";

export const PLAN_GENERATOR_CAPABILITY_ID = "plan-generator";
export const DEFAULT_PLAN_GENERATOR_PROVIDER = "mock";

const PROVIDERS: Record<string, () => PlanGenerator> = {
  mock: createMockPlanGenerator,
};

export function resolvePlanGenerator(
  input: { provider?: string | null } = {},
): ServiceResolution<PlanGenerator> {
  const provider = (input.provider ?? process.env.ORBIT_PLAN_GENERATOR ?? DEFAULT_PLAN_GENERATOR_PROVIDER)
    .trim()
    .toLowerCase() || DEFAULT_PLAN_GENERATOR_PROVIDER;
  const create = Object.prototype.hasOwnProperty.call(PROVIDERS, provider) ? PROVIDERS[provider] : undefined;
  if (!create) return createNotImplementedFailure(PLAN_GENERATOR_CAPABILITY_ID, "live", ["mock"]);
  return { mode: "mock", service: create(), success: true };
}
