/**
 * 2026-11-27 分档：新建计划的月上限是公开的（free 1 / pro 10 份，服务端 features/ai-quota/tiers.ts）。用完时写出份数、
 * 恢复日期，free 时写出 Pro 的份数。数字只来自服务端：被拒时 429 的 quota* 字段，提前提示时读 GET /api/account/usage。
 */
import { useEffect, useState } from "react";

import { aiLimitDetailOf, aiLimitParams, type AiLimitDetail } from "../../api/ai-limit";
import type { OrbitLanguage } from "../../api/contract/language";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import type { MessageKey, OrbitTranslator } from "../../i18n/messages";

export const ACCOUNT_USAGE_PATH = "/api/account/usage";

/** The plan-count line for a used-up month (null without a number: the caller keeps its plain line). */
export function goalMonthlyText(t: OrbitTranslator, detail: AiLimitDetail | null | undefined, language: OrbitLanguage): string | null {
  if (!detail?.limit) return null;
  const one = detail.limit === 1;
  const key: MessageKey = detail.upgradeLimit ? (one ? "plan.limit.goalMonthlyUpgradeOne" : "plan.limit.goalMonthlyUpgrade") : (one ? "plan.limit.goalMonthlyProOne" : "plan.limit.goalMonthlyPro");
  return t(key, aiLimitParams(detail, language));
}

/** Reads this month's plan limit once while `active` (the month is used up). */
export function useGoalMonthlyQuota(active: boolean): AiLimitDetail | null {
  const client = useOrbitApiClient();
  const [detail, setDetail] = useState<AiLimitDetail | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    void client.get<unknown>(ACCOUNT_USAGE_PATH).then((result) => {
      if (!live || !result.success) return;
      const data = result.data as { tier?: unknown; items?: { feature?: unknown; limit?: unknown; upgradeLimit?: unknown; retryOn?: unknown }[] } | null;
      const item = Array.isArray(data?.items) ? data.items.find((entry) => entry.feature === "plan_new_goal") : undefined;
      if (!item) return;
      setDetail(aiLimitDetailOf({
        quotaLimit: String(item.limit ?? ""),
        ...(typeof item.retryOn === "string" ? { quotaRetryOn: item.retryOn } : {}),
        quotaUpgradable: typeof item.upgradeLimit === "number" ? "true" : "false",
        ...(typeof item.upgradeLimit === "number" ? { quotaUpgradeLimit: String(item.upgradeLimit) } : {}),
      }));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [active, client]);
  return detail;
}
