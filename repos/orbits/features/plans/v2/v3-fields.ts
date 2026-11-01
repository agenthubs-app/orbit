/**
 * R35：计划 v3 字段（`PlanV3Fields`：outcome / summary / verdict / confidence / orderReasons / comparison / keyNumbers / risks /
 * sources + schemaVersion）在草稿内容、`plans.analysis`、详情之间搬运的小工具。只搬「有的」字段：v2 的内容 / 计划一个键都不多出来，
 * 读取方按 `schemaVersion === 3` 判断是否是 v3（DESIGN §2.1：v2 行读出时新字段为 undefined）。
 */
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { PlanRisk, PlanV3Fields } from "../../../shared/contract/plan-v2";

export const PLAN_V3_FIELD_KEYS = ["schemaVersion", "outcome", "summary", "verdict", "confidence", "orderReasons", "comparison", "keyNumbers", "risks", "sources"] as const satisfies readonly (keyof PlanV3Fields)[];

/** 只在 `schemaVersion === 3` 时拷贝定义了的 v3 字段（`comparison: null` 算定义了）；v2 的输入（含 `schemaVersion: 2`）返回 `{}`。 */
export function pickPlanV3Fields(source: Partial<PlanV3Fields> | null | undefined): PlanV3Fields {
  const picked: Record<string, unknown> = {};
  if (!source || source.schemaVersion !== 3) return picked;
  for (const key of PLAN_V3_FIELD_KEYS) if (source[key] !== undefined) picked[key] = source[key];
  return picked as PlanV3Fields;
}

export function isPlanV3(source: Partial<PlanV3Fields> | null | undefined): boolean {
  return source?.schemaVersion === 3;
}

/** `risks` 的上限（DESIGN §2.1：0–3）。 */
export const PLAN_V3_RISKS_LIMIT = 3;

/** 没传搜索依赖 / 搜索 `unavailable` / 搜索抛错时追加的风险文案（R36a / R36b 显示用；按文案去重，幂等回放不重复）。 */
export const PLAN_V3_UNVERIFIED_NETWORK_RISK: Record<PlanCopyLanguage, string> = {
  en: "Could not check this online this time.",
  ja: "今回はインターネットで確認できませんでした",
  zh: "本次未能联网核实",
};

/** 追加「本次未能联网核实」：已有同文案不重复；超过上限时丢掉最后一条，保留这条提示（它是对用户的必要披露）。 */
export function withUnverifiedNetworkRisk(risks: readonly PlanRisk[], language: PlanCopyLanguage): PlanRisk[] {
  const text = PLAN_V3_UNVERIFIED_NETWORK_RISK[language];
  if (risks.some((risk) => risk.kind === "unverified" && risk.text === text)) return [...risks];
  return [...risks.slice(0, PLAN_V3_RISKS_LIMIT - 1), { kind: "unverified", text }];
}
