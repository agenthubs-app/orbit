/**
 * GET /api/account/usage（2026-11-27 分档）：当前用户的档位与界面上计数展示的三项本月用量，以及两档对照表。
 * 数值全部来自 features/ai-quota/tiers.ts（唯一来源）。供套餐页与「我的用量」使用。
 */
export type AccountTierContract = "free" | "pro";
export type AccountUsageFeatureContract = "agent_chat" | "card_scan" | "plan_new_goal";
export type AccountUsageUnitContract = "round" | "image" | "plan" | "operation" | "batch";

export interface AccountUsageItemContract {
  feature: AccountUsageFeatureContract;
  period: "month";
  unit: AccountUsageUnitContract;
  used: number;
  limit: number;
  /** Pro 的同项上限（只在当前是 free 且 Pro 更高时有）。 */
  upgradeLimit: number | null;
  /** 恢复时间：下个东京月 1 日 00:00（UTC ISO）。 */
  retryOn: string;
}

export interface AccountUsageTierLimitContract {
  day?: number;
  month?: number;
}

export interface AccountUsageContract {
  tier: AccountTierContract;
  items: AccountUsageItemContract[];
  /** 两档对照（每项的日 / 月上限）。 */
  tiers: Record<AccountTierContract, Record<string, AccountUsageTierLimitContract>>;
}
