/**
 * 用量读取（2026-11-27 分档）：当前用户的档位、界面上计数展示的三项本月「已用 / 上限 / 恢复时间」，以及两档对照表。
 * 一条语句在库里数三项（对话 = 账本里本月未释放的 agent_chat 操作；扫名片 = ai_quota_charges 本月张数；新建计划 =
 * plan_intakes 本月条数），只取页面要显示的。计数表还没迁移（42P01）时扫名片记 0。
 */
import type { AccountUsageContract, AccountUsageItemContract } from "../../shared/contract/account-usage";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { nextTokyoMonthStart, tokyoUsageMonth } from "./constants";
import { TIER_DISPLAYED_FEATURES, TIER_FEATURE_UNITS, TIER_LIMITS, tierLimit, upgradeLimit, type AccountTier, type TierFeature } from "./tiers";

type Row = Record<string, unknown>;
const count = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const TOKYO_OFFSET_MS = 9 * 3_600_000;

/** 00:00 on the 1st of this Tokyo month, as UTC. */
function tokyoMonthStart(now: Date): Date {
  const [year, month] = tokyoUsageMonth(now).split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, 1) - TOKYO_OFFSET_MS);
}

const usageSql = (withCharges: boolean) => `/* ai-quota:usage-read */
  select
    (select count(*)::int from ai_usage_ledger
      where workspace_id = $1 and actor_id = $2 and purpose = 'agent_chat' and status <> 'released'
        and usage_day >= ($3 || '-01')::date and usage_day < (($3 || '-01')::date + interval '1 month')) as agent_chat,
    ${withCharges ? `(select coalesce(sum(units), 0)::int from ai_quota_charges
      where workspace_id = $1 and actor_id = $2 and feature = 'card_scan' and usage_month = $3)` : "0"} as card_scan,
    (select count(*)::int from plan_intakes where workspace_id = $1 and actor_id = $2 and created_at >= $4::timestamptz) as plan_new_goal`;

export async function readAccountUsage(
  client: Pick<TransactionalPostgresClient, "query">,
  input: { workspaceId: string; actorId: string; tier: AccountTier; now: Date },
): Promise<AccountUsageContract> {
  const params = [input.workspaceId, input.actorId, tokyoUsageMonth(input.now), tokyoMonthStart(input.now).toISOString()];
  let row: Row | undefined;
  try {
    row = (await client.query<Row>(usageSql(true), params)).rows[0];
  } catch (error) {
    if ((error as { code?: unknown })?.code !== "42P01") throw error;
    row = (await client.query<Row>(usageSql(false), params)).rows[0];
  }
  return accountUsageView(input.tier, input.now, (feature) => count(row?.[feature]));
}

export function accountUsageView(tier: AccountTier, now: Date, usedOf: (feature: TierFeature) => number): AccountUsageContract {
  const retryOn = nextTokyoMonthStart(now);
  const items: AccountUsageItemContract[] = TIER_DISPLAYED_FEATURES.map((feature) => ({
    feature: feature as AccountUsageItemContract["feature"],
    limit: tierLimit(tier, feature, "month") ?? 0,
    period: "month",
    retryOn,
    unit: TIER_FEATURE_UNITS[feature],
    upgradeLimit: upgradeLimit(tier, feature, "month"),
    used: usedOf(feature),
  }));
  return { items, tier, tiers: { free: { ...TIER_LIMITS.free }, pro: { ...TIER_LIMITS.pro } } };
}
