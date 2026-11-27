/**
 * 2026-11-27：超过上限时的 429（草稿类 `AI_MONTHLY_LIMIT`、重新分析 reason `MONTHLY_LIMIT`、扫名片 `CARD_SCAN_MONTHLY_LIMIT`、
 * 新建计划 reason `GOAL_MONTHLY_LIMIT`）。上限是公开的：提示写出数字、恢复日期，free 且 Pro 更高时写出 Pro 的数字。
 * 这些都来自服务端 `error.context` 的 `quota*` 字段（数值取自服务端 features/ai-quota/tiers.ts），App 不写死数字；
 * 文案在 i18n（参数 count / date / upgrade），与服务端 features/ai-quota/over-limit.ts 同文。
 */
import type { OrbitLanguage } from "./contract/language";

export const AI_MONTHLY_LIMIT_CODE = "AI_MONTHLY_LIMIT";
export const CARD_SCAN_LIMIT_CODE = "CARD_SCAN_MONTHLY_LIMIT";

export interface AiLimitDetail {
  limit: number | null;
  retryOn: string | null;
  /** Pro 的同项上限（只在当前是 free 且 Pro 更高时有）。 */
  upgradeLimit: number | null;
}

const LOCALES: Readonly<Record<OrbitLanguage, string>> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };

const positive = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/** Reads the notice fields (`quota*`) of a 429's context. */
export function aiLimitDetailOf(context: Readonly<Record<string, string>> | undefined): AiLimitDetail {
  return {
    limit: positive(context?.quotaLimit),
    retryOn: typeof context?.quotaRetryOn === "string" ? context.quotaRetryOn : typeof context?.retryOn === "string" ? context.retryOn : null,
    upgradeLimit: context?.quotaUpgradable === "true" ? positive(context.quotaUpgradeLimit) : null,
  };
}

/**
 * The params of the notice: the count, the Tokyo calendar date of the reset (00:00 JST on the 1st, sent as UTC) and the Pro
 * count, written by Intl in the interface language. Without a reset time it is the 1st of the month after now.
 */
export function aiLimitParams(detail: AiLimitDetail | null, language: OrbitLanguage, now: Date = new Date()): { count: string; date: string; upgrade: string } {
  const at = detail?.retryOn ? Date.parse(detail.retryOn) : NaN;
  const tokyoNow = new Date(now.getTime() + 9 * 3_600_000);
  const reset = Number.isFinite(at) ? new Date(at) : new Date(Date.UTC(tokyoNow.getUTCFullYear(), tokyoNow.getUTCMonth() + 1, 1) - 9 * 3_600_000);
  const date = new Intl.DateTimeFormat(LOCALES[language], { day: "numeric", month: "long", timeZone: "Asia/Tokyo" }).format(reset);
  const number = (value: number | null | undefined) => (value === null || value === undefined ? "" : new Intl.NumberFormat(LOCALES[language]).format(value));
  return { count: number(detail?.limit), date, upgrade: number(detail?.upgradeLimit) };
}
