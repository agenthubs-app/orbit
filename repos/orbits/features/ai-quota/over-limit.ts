/**
 * 超额提示（2026-11-27 用户定稿：按档限额，超了提示「已用完，请升级」）。纯函数，无 IO：服务端（对话的固定回答）与 Web
 * 客户端都 import 它；App 用 i18n 里的同文模板（src/api/over-limit.ts）。
 *
 * - 机器可读字段（`OverLimitNotice`）随 429 / 固定回答一起给：哪项、周期、上限、已用、恢复时间、档位、是否可升级、升级后的上限。
 *   放进 `error.context` 时全部转成字符串（`overLimitContext`），客户端用 `overLimitNoticeOf` 读回。
 * - 文案朴素、无感叹号：写明数字和恢复时间；free 且 Pro 更高时引导升级，其余（pro、两档相同）只说恢复时间。
 * - 数字全部来自 tiers.ts：改一个数，拦截、提示、清单同时变。
 */
import { tierLimit, upgradeLimit, accountTierOf, TIER_FEATURE_UNITS, type AccountTier, type TierFeature, type TierPeriod } from "./tiers";

export type OverLimitLanguage = "zh" | "ja" | "en";

export interface OverLimitNotice {
  feature: TierFeature;
  period: TierPeriod;
  limit: number;
  used: number;
  /** 恢复时间（UTC ISO；东京次日 / 下月 1 日 00:00）。 */
  retryOn: string | null;
  tier: AccountTier;
  upgradable: boolean;
  /** Pro 的同项上限（只在可升级时有）。 */
  upgradeLimit: number | null;
}

/** 由档位表补齐一条提示：上限缺省取档位表，已用缺省即上限（被拦时已用 ≥ 上限）。 */
export function overLimitNotice(input: { feature: TierFeature; period: TierPeriod; tier: AccountTier; cap?: number | null; used?: number | null; retryOn?: string | null }): OverLimitNotice {
  const limit = input.cap ?? tierLimit(input.tier, input.feature, input.period) ?? 0;
  const up = upgradeLimit(input.tier, input.feature, input.period);
  return { feature: input.feature, limit, period: input.period, retryOn: input.retryOn ?? null, tier: input.tier, upgradable: up !== null, upgradeLimit: up, used: input.used ?? limit };
}

/**
 * `error.context` 里的机器可读字段（全部字符串，键带 `quota` 前缀，不和计划接口已有的 `limit: "daily" | "monthly"` 冲突）：
 * 哪项、周期、上限、已用、恢复时间、档位、是否可升级、Pro 的上限。另带一个通用的 `retryOn`。
 */
export function overLimitContext(notice: OverLimitNotice): Record<string, string> {
  return {
    quotaFeature: notice.feature,
    quotaLimit: String(notice.limit),
    quotaPeriod: notice.period,
    quotaTier: notice.tier,
    quotaUpgradable: notice.upgradable ? "true" : "false",
    quotaUsed: String(notice.used),
    ...(notice.retryOn ? { quotaRetryOn: notice.retryOn, retryOn: notice.retryOn } : {}),
    ...(notice.upgradeLimit !== null ? { quotaUpgradeLimit: String(notice.upgradeLimit) } : {}),
  };
}

const FEATURES: readonly TierFeature[] = ["agent_chat", "card_scan", "plan_new_goal", "plan_revise", "plan_review", "event_assessment", "manual_reanalysis", "instant_insight", "background_insight", "memo_extraction", "draft_assist"];

/** Reads a notice back from a 429's `error.context` (null when it is not one). */
export function overLimitNoticeOf(context: unknown): OverLimitNotice | null {
  if (typeof context !== "object" || context === null) return null;
  const value = context as Record<string, unknown>;
  const feature = FEATURES.find((item) => item === value.quotaFeature);
  const period = value.quotaPeriod === "day" || value.quotaPeriod === "month" ? value.quotaPeriod : null;
  const limit = Number(value.quotaLimit);
  if (!feature || !period || !Number.isInteger(limit) || limit <= 0) return null;
  const used = Number(value.quotaUsed);
  const up = Number(value.quotaUpgradeLimit);
  return {
    feature,
    limit,
    period,
    retryOn: typeof value.quotaRetryOn === "string" ? value.quotaRetryOn : null,
    tier: accountTierOf(value.quotaTier),
    upgradable: value.quotaUpgradable === "true" || value.quotaUpgradable === true,
    upgradeLimit: Number.isInteger(up) && up > 0 ? up : null,
    used: Number.isInteger(used) ? used : limit,
  };
}

const LOCALES: Readonly<Record<OverLimitLanguage, string>> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };
const number = (value: number, language: OverLimitLanguage) => new Intl.NumberFormat(LOCALES[language]).format(value);

/** The Tokyo calendar date of the reset (00:00 JST, sent as UTC). */
function resetDate(retryOn: string | null, language: OverLimitLanguage): string | null {
  const at = retryOn ? Date.parse(retryOn) : NaN;
  return Number.isFinite(at) ? new Intl.DateTimeFormat(LOCALES[language], { day: "numeric", month: "long", timeZone: "Asia/Tokyo" }).format(new Date(at)) : null;
}

/** 「N 张」这类计数短语（中文、日文按单位写；英文复数）。 */
function amount(feature: TierFeature, n: number, language: OverLimitLanguage): string {
  const unit = TIER_FEATURE_UNITS[feature];
  const v = number(n, language);
  if (language === "zh") return { batch: `${v} 批`, image: `${v} 张`, operation: `${v} 次`, plan: `${v} 份新计划`, round: `${v} 轮对话` }[unit];
  if (language === "ja") return { batch: `${v}回`, image: `${v}枚`, operation: `${v}回`, plan: `新しい計画${v}件`, round: `会話${v}回` }[unit];
  const one = n === 1;
  return { batch: `${v} ${one ? "batch" : "batches"}`, image: `${v} card ${one ? "scan" : "scans"}`, operation: `${v} ${one ? "use" : "uses"}`, plan: `${v} new ${one ? "plan" : "plans"}`, round: `${v} ${one ? "conversation" : "conversations"}` }[unit];
}

function upgradeSentence(feature: TierFeature, up: number, language: OverLimitLanguage): string {
  const v = number(up, language);
  if (language === "zh") return feature === "agent_chat" ? `升级到 Pro 每月可对话 ${v} 轮。` : feature === "card_scan" ? `升级到 Pro 每月可扫 ${v} 张。` : feature === "plan_new_goal" ? `升级到 Pro 每月可新建 ${v} 份计划。` : `升级到 Pro 每月可用 ${v} 次。`;
  if (language === "ja") return feature === "agent_chat" ? `Pro にすると毎月${v}回まで会話できます。` : feature === "card_scan" ? `Pro にすると毎月${v}枚までスキャンできます。` : feature === "plan_new_goal" ? `Pro にすると毎月${v}件まで新しい計画をつくれます。` : `Pro にすると毎月${v}回まで使えます。`;
  return `Pro allows ${amount(feature, up, "en")} a month.`;
}

export function overLimitText(language: OverLimitLanguage, notice: OverLimitNotice): string {
  const what = amount(notice.feature, notice.limit, language);
  const one = notice.limit === 1;
  const date = notice.period === "month" ? resetDate(notice.retryOn, language) : null;
  let head: string;
  if (language === "zh") head = notice.period === "day" ? `今天的 ${what}已用完，明天恢复。` : `这个月的 ${what}已用完，${date ?? "下个月 1 日"}恢复。`;
  else if (language === "ja") head = notice.period === "day" ? `本日の${what}を使い切りました。明日また使えます。` : `今月の${what}を使い切りました。${date ?? "来月1日"}に戻ります。`;
  else head = notice.period === "day" ? `Today's ${what} ${one ? "is" : "are"} used up. ${one ? "It comes" : "They come"} back tomorrow.` : `This month's ${what} ${one ? "is" : "are"} used up. ${one ? "It comes" : "They come"} back on ${date ?? "the 1st of next month"}.`;
  const tail = notice.upgradable && notice.upgradeLimit !== null
    ? upgradeSentence(notice.feature, notice.upgradeLimit, language)
    : language === "zh" ? "已有的内容照常可以查看。" : language === "ja" ? "これまでの内容はいつもどおりご覧いただけます。" : "Everything you already have can still be viewed as usual.";
  // 中文、日文句与句之间不加空格；英文加一个空格。
  return language === "en" ? `${head} ${tail}` : `${head}${tail}`;
}
