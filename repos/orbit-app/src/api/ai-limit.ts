/**
 * 2026-11-27：AI 月上限的 429（草稿类 `AI_MONTHLY_LIMIT`、重新分析 reason `MONTHLY_LIMIT`）。上限是公开的：提示写出次数和
 * 恢复日期，两者都来自服务端 `error.context`（`limit` / `retryOn`，数值取自服务端 features/ai-quota 的常量），App 不写死数字。
 * 文案键：`me.aiMonthlyLimit`、`onboarding.v3.introMonthlyLimit`、`networkAnalysis.recomputeMonthlyLimited`（参数 count / date）。
 */
import type { OrbitLanguage } from "./contract/language";

export const AI_MONTHLY_LIMIT_CODE = "AI_MONTHLY_LIMIT";

export interface AiLimitDetail {
  limit: number | null;
  retryOn: string | null;
}

const LOCALES: Readonly<Record<OrbitLanguage, string>> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };

export function aiLimitDetailOf(context: Readonly<Record<string, string>> | undefined): AiLimitDetail {
  const limit = Number(context?.limit);
  return { limit: Number.isInteger(limit) && limit > 0 ? limit : null, retryOn: typeof context?.retryOn === "string" ? context.retryOn : null };
}

/**
 * The params of the notice: the count and the Tokyo calendar date of the reset (00:00 JST on the 1st, sent as UTC), written by
 * Intl in the interface language. Without a reset time it is the 1st of the month after now.
 */
export function aiLimitParams(detail: AiLimitDetail | null, language: OrbitLanguage, now: Date = new Date()): { count: string; date: string } {
  const at = detail?.retryOn ? Date.parse(detail.retryOn) : NaN;
  const tokyoNow = new Date(now.getTime() + 9 * 3_600_000);
  const reset = Number.isFinite(at) ? new Date(at) : new Date(Date.UTC(tokyoNow.getUTCFullYear(), tokyoNow.getUTCMonth() + 1, 1) - 9 * 3_600_000);
  const date = new Intl.DateTimeFormat(LOCALES[language], { day: "numeric", month: "long", timeZone: "Asia/Tokyo" }).format(reset);
  return { count: detail?.limit === null || detail?.limit === undefined ? "" : String(detail.limit), date };
}
