/**
 * 对外额度清单（2026-11-27，用户定：上限是公开的，会写进使用规则给用户看）。
 *
 * 每一项的数值都直接取自拦截用的常量（tiers.ts 与由它派生的 constants.ts），不在这里另写数字：改一个数，拦截、超限提示、
 * 这份清单同时变。2026-11-27 分档：按档不同的项（对话月上限、扫名片、新建计划）各有 free / pro 两行（`tier`）。
 * 供以后的使用规则页面与「我的用量」引用；这次不做页面。完整性由 tests/capabilities/ai-quota-public-limits.test.ts
 * 守住：constants.ts 里每一道日上限 / 月上限都必须在这里出现且数值相同。
 */
import {
  AGENT_CHAT_DAILY_LIMIT,
  AI_QUOTA_DAILY_PURPOSE_LIMITS,
  AI_QUOTA_MONTHLY_LIMITS,
  BACKGROUND_INSIGHT_MONTHLY_LIMIT,
  BACKGROUND_POOL_DAILY_LIMIT,
  EVENT_ASSESSMENT_DAILY_LIMIT,
  INSTANT_INSIGHT_DAILY_LIMIT,
  INSTANT_INSIGHT_MONTHLY_LIMIT,
  MANUAL_REANALYSIS_DAILY_LIMIT,
  MANUAL_REANALYSIS_MONTHLY_LIMIT,
  PLAN_FLOW_DAILY_LIMIT,
  PLAN_PREP_INITIAL_CARDS_LIMIT,
  PLAN_SEARCH_PER_PLAN_LIMIT,
  USER_POOL_DAILY_LIMIT,
  type AiQuotaPurpose,
} from "./constants";
import { ACCOUNT_TIERS, tierLimit, type AccountTier } from "./tiers";

type Text = Readonly<{ zh: string; ja: string; en: string }>;

/** 周期：东京自然日、东京自然月、每份计划。 */
export type PublicLimitPeriod = "day" | "month" | "plan";
/** 计数单位：一轮对话、一次 AI 操作、一批（≤20 人）、一次搜索、一张准备卡、一张名片图片、一份新计划。 */
export type PublicLimitUnit = "round" | "operation" | "batch" | "search" | "card" | "image" | "plan";

export interface PublicLimit {
  /** 稳定的键：`<功能>.<周期>`。 */
  id: string;
  feature: Text;
  period: PublicLimitPeriod;
  limit: number;
  unit: PublicLimitUnit;
  /** 只适用于这一档（不写 = 两档相同）。 */
  tier?: AccountTier;
}

export const PUBLIC_LIMIT_UNIT_LABELS: Readonly<Record<PublicLimitUnit, Text>> = {
  batch: { en: "batches", ja: "回", zh: "批" },
  card: { en: "cards", ja: "枚", zh: "张" },
  image: { en: "card images", ja: "枚", zh: "张" },
  plan: { en: "new plans", ja: "件", zh: "份" },
  operation: { en: "times", ja: "回", zh: "次" },
  round: { en: "conversations", ja: "回", zh: "轮" },
  search: { en: "searches", ja: "回", zh: "次" },
};

const FEATURES = {
  agent_chat: { en: "iOrbit conversation", ja: "iOrbit との会話", zh: "iOrbit 对话" },
  background_insight: { en: "Contact insights (background)", ja: "連絡先の見立て（自動更新）", zh: "联系人洞察（后台更新）" },
  card_scan: { en: "Business card scans", ja: "名刺のスキャン", zh: "扫名片" },
  plan_new_goal: { en: "New plans", ja: "新しい計画", zh: "新建计划" },
  background_pool: { en: "Background AI, all features", ja: "自動で動く AI（合計）", zh: "后台 AI（合计）" },
  draft_assist: { en: "Intro drafts, \"looking for\" suggestions and email drafts", ja: "自己紹介の下書き・「探している」の提案・メール下書き", zh: "简介草稿、「我在寻找」建议与邮件草稿" },
  event_assessment: { en: "Event assessment", ja: "イベントの見極め", zh: "活动评估" },
  event_registration_interview: { en: "Event registration profile", ja: "イベント申込みの自己紹介", zh: "活动报名的自我介绍" },
  event_registration_question: { en: "Event registration questions", ja: "イベント申込みの質問", zh: "活动报名的提问" },
  instant_insight: { en: "Contact insights (right after adding)", ja: "連絡先の見立て（追加直後）", zh: "联系人洞察（添加后当场）" },
  manual_reanalysis: { en: "Network re-analysis", ja: "人脈の見直し", zh: "人脉重新分析" },
  memo_extraction: { en: "Reading notes", ja: "メモの読み取り", zh: "笔记提取" },
  plan_background: { en: "New plan: background", ja: "計画づくり：背景", zh: "新建计划：背景" },
  plan_draft: { en: "Plan drafts", ja: "計画の下書き", zh: "计划初稿" },
  plan_flow: { en: "Plan generation, all steps", ja: "計画の生成（合計）", zh: "计划生成（合计）" },
  plan_intake: { en: "Plan intake", ja: "計画の聞き取り", zh: "计划问询" },
  plan_prep: { en: "Plan preparation cards", ja: "計画の準備カード", zh: "计划准备卡" },
  plan_review: { en: "Plan review", ja: "計画の見直し", zh: "计划复盘" },
  plan_review_mark: { en: "Plan review notes", ja: "計画の見直しメモ", zh: "计划复盘标记" },
  plan_revise: { en: "Plan edits", ja: "計画の修正", zh: "计划修改" },
  plan_search: { en: "Plan web search", ja: "計画のウェブ検索", zh: "计划联网搜索" },
  user_pool: { en: "Other AI you start, all features", ja: "その他の AI（合計）", zh: "其他主动使用的 AI（合计）" },
} as const satisfies Record<string, Text>;

type Feature = keyof typeof FEATURES;
const entry = (feature: Feature, period: PublicLimitPeriod, limit: number, unit: PublicLimitUnit, tier?: AccountTier): PublicLimit => ({ feature: FEATURES[feature], id: tier ? `${feature}.${period}.${tier}` : `${feature}.${period}`, limit, period, unit, ...(tier ? { tier } : {}) });

/** 按档不同的月上限：每档一行。 */
const TIERED_ENTRIES: readonly PublicLimit[] = (["agent_chat", "card_scan", "plan_new_goal"] as const).flatMap((feature) =>
  ACCOUNT_TIERS.map((tier) => entry(feature, "month", tierLimit(tier, feature, "month")!, feature === "agent_chat" ? "round" : feature === "card_scan" ? "image" : "plan", tier)));

/** 按用途的月上限（`AI_QUOTA_MONTHLY_LIMITS`）逐项展开，单位都是「次操作」。 */
const MONTHLY_PURPOSE_ENTRIES: readonly PublicLimit[] = (Object.entries(AI_QUOTA_MONTHLY_LIMITS) as [AiQuotaPurpose, number][]).map(([purpose, limit]) => entry(purpose as Feature, "month", limit, "operation"));

/** 按用途的日上限（`AI_QUOTA_DAILY_PURPOSE_LIMITS`）。 */
const DAILY_PURPOSE_ENTRIES: readonly PublicLimit[] = (Object.entries(AI_QUOTA_DAILY_PURPOSE_LIMITS) as [AiQuotaPurpose, number][]).map(([purpose, limit]) => entry(purpose as Feature, "day", limit, "operation"));

export const AI_QUOTA_PUBLIC_LIMITS: readonly PublicLimit[] = [
  entry("agent_chat", "day", AGENT_CHAT_DAILY_LIMIT, "round"),
  ...TIERED_ENTRIES,
  entry("user_pool", "day", USER_POOL_DAILY_LIMIT, "operation"),
  entry("manual_reanalysis", "day", MANUAL_REANALYSIS_DAILY_LIMIT, "operation"),
  entry("manual_reanalysis", "month", MANUAL_REANALYSIS_MONTHLY_LIMIT, "operation"),
  entry("instant_insight", "day", INSTANT_INSIGHT_DAILY_LIMIT, "batch"),
  entry("instant_insight", "month", INSTANT_INSIGHT_MONTHLY_LIMIT, "batch"),
  entry("background_insight", "month", BACKGROUND_INSIGHT_MONTHLY_LIMIT, "batch"),
  entry("background_pool", "day", BACKGROUND_POOL_DAILY_LIMIT, "operation"),
  entry("plan_flow", "day", PLAN_FLOW_DAILY_LIMIT, "operation"),
  entry("event_assessment", "day", EVENT_ASSESSMENT_DAILY_LIMIT, "operation"),
  entry("plan_search", "plan", PLAN_SEARCH_PER_PLAN_LIMIT, "search"),
  entry("plan_prep", "plan", PLAN_PREP_INITIAL_CARDS_LIMIT, "card"),
  ...DAILY_PURPOSE_ENTRIES,
  ...MONTHLY_PURPOSE_ENTRIES,
];

export function publicLimit(id: string): PublicLimit | null {
  return AI_QUOTA_PUBLIC_LIMITS.find((item) => item.id === id) ?? null;
}
