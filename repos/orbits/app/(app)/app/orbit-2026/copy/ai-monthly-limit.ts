/**
 * 2026-11-27 隐藏月上限：用户主动点的 AI（重新分析、个人简介草稿、跟进邮件草稿等）这个月用完时显示的固定一句。
 * 不显示数字（它们是防滥用的保险丝，不是会员额度）。服务端的码：草稿类 `AI_MONTHLY_LIMIT`，重新分析 reason `MONTHLY_LIMIT`。
 * App 端同文：orbit-app/src/i18n 的 `aiLimit.monthly`。
 */
export const AI_MONTHLY_LIMIT_CODE = "AI_MONTHLY_LIMIT";

export const AI_MONTHLY_LIMIT_TEXT = {
  en: "This month's uses are used up. They come back on the 1st of next month. Everything you already have can still be viewed as usual.",
  ja: "今月の利用回数の上限に達しました。来月1日に戻ります。これまでの内容はいつもどおりご覧いただけます。",
  zh: "这个月的次数已经用完，下个月 1 日恢复。已有的内容照常可以查看。",
} as const;
