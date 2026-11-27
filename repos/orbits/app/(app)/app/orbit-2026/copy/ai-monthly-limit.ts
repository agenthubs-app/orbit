/**
 * 2026-11-27：用户主动点的 AI（重新分析、个人简介草稿、跟进邮件草稿等）这个月用完时显示的一句。上限是公开的：写出数字和
 * 恢复日期，两者都来自服务端的 429（`error.context.limit` / `retryOn`，数值取自 features/ai-quota 的常量），这里不写死数字。
 * 服务端的码：草稿类 `AI_MONTHLY_LIMIT`，重新分析 reason `MONTHLY_LIMIT`。App 端同文：i18n 的 `*.aiMonthlyLimit` 一组键。
 */
export const AI_MONTHLY_LIMIT_CODE = "AI_MONTHLY_LIMIT";

type Language = "zh" | "ja" | "en";
const LOCALES: Readonly<Record<Language, string>> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };

/** The limit's value and reset time from a 429 body's `error.context` (both optional; an older server sends neither). */
export function aiLimitDetailOf(context: unknown): { limit: number | null; retryOn: string | null } {
  const value = typeof context === "object" && context !== null ? (context as Record<string, unknown>) : {};
  const limit = Number(value.limit);
  return { limit: Number.isInteger(limit) && limit > 0 ? limit : null, retryOn: typeof value.retryOn === "string" ? value.retryOn : null };
}

/** The Tokyo calendar date of the reset (retryOn is 00:00 JST on the 1st, sent as UTC), as the App writes it (Intl). */
function resetDate(retryOn: string | null, language: Language): string | null {
  const at = retryOn ? Date.parse(retryOn) : NaN;
  if (!Number.isFinite(at)) return null;
  return new Intl.DateTimeFormat(LOCALES[language], { day: "numeric", month: "long", timeZone: "Asia/Tokyo" }).format(new Date(at));
}

export function aiMonthlyLimitText(language: Language, detail: { limit: number | null; retryOn: string | null } = { limit: null, retryOn: null }): string {
  const date = resetDate(detail.retryOn, language);
  const n = detail.limit;
  if (language === "en") return `${n === null ? "This month's uses" : `This month's ${n} uses`} are used up. They come back on ${date ?? "the 1st of next month"}. Everything you already have can still be viewed as usual.`;
  if (language === "ja") return `今月の${n === null ? "利用回数" : `${n}回`}を使い切りました。${date ?? "来月1日"}に戻ります。これまでの内容はいつもどおりご覧いただけます。`;
  return `这个月的${n === null ? "次数" : ` ${n} 次`}已用完，${date ?? "下个月 1 日"}恢复。已有的内容照常可以查看。`;
}
