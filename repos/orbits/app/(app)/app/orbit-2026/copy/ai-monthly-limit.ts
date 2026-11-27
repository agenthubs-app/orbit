/**
 * 2026-11-27：用户主动点的功能超过上限时显示的一句（重新分析、个人简介草稿、跟进邮件草稿、扫名片、新建计划）。上限是公开的：
 * 数字、恢复日期、能否升级都来自服务端 429 的 `error.context`（`quota*` 字段，数值取自 features/ai-quota/tiers.ts），
 * 文案与服务端同一个模块（features/ai-quota/over-limit.ts），这里不写死数字。App 端同文：i18n 的 `quota.*` 键。
 */
import { notAcceptedText, overLimitNotice, overLimitNoticeOf, overLimitText } from "../../../../../features/ai-quota/over-limit";
import { DEFAULT_ACCOUNT_TIER } from "../../../../../features/ai-quota/tiers";

export const AI_MONTHLY_LIMIT_CODE = "AI_MONTHLY_LIMIT";
export const CARD_SCAN_LIMIT_CODE = "CARD_SCAN_MONTHLY_LIMIT";

type Language = "zh" | "ja" | "en";

/** The numbered line for a 429's context; null when the context is not an over-limit notice. */
export function quotaNoticeText(language: Language, context: unknown): string | null {
  const notice = overLimitNoticeOf(context);
  return notice ? overLimitText(language, notice) : null;
}

/** The line for a monthly limit; an older server without the fields still gets a plain line. */
export function aiMonthlyLimitText(language: Language, context?: unknown): string {
  return quotaNoticeText(language, context)
    ?? (language === "en" ? "This month's uses are used up. They come back on the 1st of next month. Everything you already have can still be viewed as usual."
      : language === "ja" ? "今月の利用回数を使い切りました。来月1日に戻ります。これまでの内容はいつもどおりご覧いただけます。"
        : "这个月的次数已用完，下个月 1 日恢复。已有的内容照常可以查看。");
}

/** Part of a card-scan batch was not accepted: how many, then the numbered line. */
export function cardScanPartialText(language: Language, notAccepted: number, context: unknown): string {
  return `${notAcceptedText(language, notAccepted)}${language === "en" ? " " : ""}${aiMonthlyLimitText(language, context)}`;
}

const TOKYO = 9 * 3_600_000;
const DAY = 86_400_000;

/**
 * 活动评估（两档同为每天 5 次、每月 10 次，tiers.ts）用完时的一句：今天用完写「明天恢复」，这个月用完写下月 1 日。
 * 数字取自服务端的 availability（dailyLimit / monthlyLimit），不写死。不是用完时 null。
 */
export function eventAssessmentLimitText(language: Language, availability: { dailyLeft?: number | null; dailyLimit?: number | null; monthlyLeft?: number | null; monthlyLimit?: number | null } | null | undefined, now: Date = new Date()): string | null {
  if (!availability) return null;
  const tokyoNow = new Date(now.getTime() + TOKYO);
  if (availability.monthlyLeft === 0 && availability.monthlyLimit) {
    const retryOn = new Date(Date.UTC(tokyoNow.getUTCFullYear(), tokyoNow.getUTCMonth() + 1, 1) - TOKYO).toISOString();
    return overLimitText(language, overLimitNotice({ cap: availability.monthlyLimit, feature: "event_assessment", period: "month", retryOn, tier: DEFAULT_ACCOUNT_TIER }));
  }
  if (availability.dailyLeft === 0 && availability.dailyLimit) {
    const retryOn = new Date((Math.floor(tokyoNow.getTime() / DAY) + 1) * DAY - TOKYO).toISOString();
    return overLimitText(language, overLimitNotice({ cap: availability.dailyLimit, feature: "event_assessment", period: "day", retryOn, tier: DEFAULT_ACCOUNT_TIER }));
  }
  return null;
}
