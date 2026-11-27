/**
 * 账户分档与按档限额（2026-11-27 用户定稿）。这是所有对外上限的唯一来源：拦截（ledger / 计划 / 扫名片）、超限提示、
 * 对外额度清单（public-limits.ts）与用量接口都从这里取数——改一个数，三处同时变。
 *
 * - 两档：free / pro。现在所有账户都是 free（缺省即 free，存量不回填）；pro 只能由运营侧设置（scripts/account-tier.ts）。
 * - 月 = 东京自然月，日 = 东京自然日；每人计。
 * - 这里不 import constants.ts（constants.ts 从这里取数，避免循环）。
 */
export type AccountTier = "free" | "pro";
export const ACCOUNT_TIERS: readonly AccountTier[] = ["free", "pro"];
export const DEFAULT_ACCOUNT_TIER: AccountTier = "free";

export function accountTierOf(value: unknown): AccountTier {
  return value === "pro" ? "pro" : DEFAULT_ACCOUNT_TIER;
}

export type TierFeature =
  | "agent_chat"
  | "card_scan"
  | "plan_new_goal"
  | "plan_revise"
  | "plan_review"
  | "event_assessment"
  | "manual_reanalysis"
  | "instant_insight"
  | "background_insight"
  | "memo_extraction"
  | "draft_assist";

export type TierPeriod = "day" | "month";
export type TierLimit = Readonly<Partial<Record<TierPeriod, number>>>;

/** 计数单位：轮对话、张图片、份计划、次操作、批（≤20 人）。 */
export type TierUnit = "round" | "image" | "plan" | "operation" | "batch";

export const TIER_FEATURE_UNITS: Readonly<Record<TierFeature, TierUnit>> = {
  agent_chat: "round",
  background_insight: "batch",
  card_scan: "image",
  draft_assist: "operation",
  event_assessment: "operation",
  instant_insight: "batch",
  manual_reanalysis: "operation",
  memo_extraction: "operation",
  plan_new_goal: "plan",
  plan_review: "operation",
  plan_revise: "operation",
};

/** 两档相同的上限（写进规则）。 */
const SHARED: Readonly<Record<Exclude<TierFeature, "agent_chat" | "card_scan" | "plan_new_goal">, TierLimit>> = {
  background_insight: { month: 40 },
  draft_assist: { month: 60 },
  event_assessment: { day: 5, month: 10 },
  instant_insight: { day: 20, month: 60 },
  manual_reanalysis: { day: 3, month: 10 },
  memo_extraction: { month: 300 },
  plan_review: { month: 3 },
  plan_revise: { month: 30 },
};

export const TIER_LIMITS: Readonly<Record<AccountTier, Readonly<Record<TierFeature, TierLimit>>>> = {
  free: { ...SHARED, agent_chat: { day: 100, month: 100 }, card_scan: { month: 30 }, plan_new_goal: { month: 1 } },
  pro: { ...SHARED, agent_chat: { day: 100, month: 1000 }, card_scan: { month: 300 }, plan_new_goal: { month: 10 } },
};

/** 界面上计数展示的三项（套餐页、「我的用量」）。 */
export const TIER_DISPLAYED_FEATURES: readonly TierFeature[] = ["agent_chat", "card_scan", "plan_new_goal"];

export function tierLimit(tier: AccountTier, feature: TierFeature, period: TierPeriod): number | null {
  return TIER_LIMITS[tier][feature][period] ?? null;
}

/** 两档相同的上限（拦截不需要知道档位时用；两档不同时抛错，防止把按档的上限当成固定值）。 */
export function sharedTierLimit(feature: TierFeature, period: TierPeriod): number {
  const free = TIER_LIMITS.free[feature][period];
  const pro = TIER_LIMITS.pro[feature][period];
  if (free === undefined || free !== pro) throw new Error(`${feature}/${period} is not the same for every tier`);
  return free;
}

/** 升级后同一项的上限（只有 free 且 pro 更高时才有）。 */
export function upgradeLimit(tier: AccountTier, feature: TierFeature, period: TierPeriod): number | null {
  if (tier !== "free") return null;
  const here = tierLimit("free", feature, period);
  const there = tierLimit("pro", feature, period);
  return here !== null && there !== null && there > here ? there : null;
}
