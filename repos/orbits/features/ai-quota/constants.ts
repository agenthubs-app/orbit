/**
 * W0048a：两池 AI 配额的常量（D44 C-5 / W48-2；数值 D45 已定，2026-10-02）。
 *
 * 单位一律是「次操作」：一次 `reserve` = 1 次操作，一次操作内部可发多次 HTTP（上限 `max_calls`），
 * 额度只算 1 次；成本按每次 HTTP 一条子账（`ai_usage_calls`）。用户改数值只改这里的常量。
 */
export type AiQuotaPool = "user" | "background" | "system";
export type AiQuotaPurpose =
  | "plan"
  | "plan_refine"
  | "snapshot"
  | "memo_extraction"
  | "insight"
  | "enrichment"
  // R22（计划 v2.2 DESIGN §3.3）：账本按用途取 max_calls，所以上限不同的计划调用各用一个用途；event_assessment 给 R26。
  | "plan_intake"
  | "plan_background"
  | "plan_draft"
  | "plan_revise"
  | "plan_review_mark"
  | "plan_review"
  | "event_assessment";
export type AiQuotaTrigger = "auto" | "manual" | "plan";

export const AI_QUOTA_POOLS: readonly AiQuotaPool[] = ["user", "background", "system"];
export const AI_QUOTA_PURPOSES: readonly AiQuotaPurpose[] = [
  "plan", "plan_refine", "snapshot", "memo_extraction", "insight", "enrichment",
  "plan_intake", "plan_background", "plan_draft", "plan_revise", "plan_review_mark", "plan_review", "event_assessment",
];
export const AI_QUOTA_TRIGGERS: readonly AiQuotaTrigger[] = ["auto", "manual", "plan"];

/** 用户主动池总熔断：每人每东京日 10 次操作（含手动重新分析；W0057 起不含即时洞察生成，见 `isInstantInsightOperation`）。 */
export const USER_POOL_DAILY_LIMIT = 10;
/** 手动重新分析（snapshot／manual）：每人每东京日 3 次操作，同时受用户池总熔断约束。 */
export const MANUAL_REANALYSIS_DAILY_LIMIT = 3;
/**
 * W0057（D62，W57-1）：即时洞察生成（名片确认／重新分析后当场生成，`pool: user`、`purpose: insight`、`trigger: auto`）
 * 自己的日上限：每人每东京日 20 次操作（每次 ≤20 人）。它**不计入** `USER_POOL_DAILY_LIMIT`（对 D45 总熔断的修订）；
 * 超出时调用方静默退回后台池（只标待更新，由维护任务处理）。
 */
export const INSTANT_INSIGHT_DAILY_LIMIT = 20;
/** 后台自动池：每人每东京日 60 次操作。 */
export const BACKGROUND_POOL_DAILY_LIMIT = 60;
/** 每批（洞察、按文字补全）最多 20 人 = 1 次操作。 */
export const AI_QUOTA_BATCH_SIZE = 20;

/**
 * 每种操作允许的 HTTP 上限（`reserve` 时写定，子账超出即拒绝、不发请求）。
 * 计划生成 4 = 骨架 1 + 前 2 个阶段 + 快照 1（D46②，W0048b 接入）。
 */
export const AI_QUOTA_MAX_CALLS: Readonly<Record<AiQuotaPurpose, number>> = {
  enrichment: 1,
  insight: 1,
  memo_extraction: 1,
  plan: 4,
  plan_refine: 1,
  snapshot: 1,
  // R22：C1 / C3 / C4 / C5 / C10 各 1 次；C2 背景、C7 生成中修正、C9 見直し含 1 次修复；C6 初版 = 初版 + 修复 + 顺带快照。
  plan_intake: 1,
  plan_background: 2,
  plan_draft: 3,
  plan_revise: 2,
  plan_review_mark: 1,
  plan_review: 2,
  // R26 定（活动评估：抓取后抽取事实 1 次 + 修复 1 次）。
  event_assessment: 2,
};

/**
 * R22（DESIGN §5.3）：计划生成流程（背景、初版、AI 修正、見直し）在用户主动池里有自己的日上限，
 * 不占 `USER_POOL_DAILY_LIMIT` 的 10 次总熔断（先例：W0057 即时洞察）。一次完整生成 = 5 次操作。
 */
export const PLAN_FLOW_PURPOSES: readonly AiQuotaPurpose[] = ["plan_background", "plan_draft", "plan_revise", "plan_review"];
export const PLAN_FLOW_DAILY_LIMIT = 15;

/**
 * R22（DESIGN §5.3、§10 用户已确认 2026-10-10）：每用户每东京自然月的操作上限（不含 released）。
 * `plan_review` 3 = 見直し月 3 次（Free）。
 * R23（R22 复核 m11 的决定）：「每月最多新建 10 个目标」按新建的生成流程计（`flow-service.ts` 的
 * `PLAN_NEW_GOAL_MONTHLY_LIMIT`，「もう一度」不重复计）；`plan_background` 这里只是成本上限，留出重试余量为 20。
 */
export const AI_QUOTA_MONTHLY_LIMITS: Readonly<Partial<Record<AiQuotaPurpose, number>>> = {
  plan_intake: 60,
  plan_background: 20,
  plan_draft: 30,
  plan_revise: 30,
  plan_review_mark: 20,
  plan_review: 3,
};

/**
 * R22（复核 m11）：有月上限的新用途固定从一个池预留。月度计数在按池的锁下进行，固定池才不会有两个池并发各算各的。
 */
export const AI_QUOTA_PURPOSE_POOLS: Readonly<Partial<Record<AiQuotaPurpose, AiQuotaPool>>> = {
  plan_intake: "background",
  plan_background: "user",
  plan_draft: "user",
  plan_revise: "user",
  plan_review_mark: "background",
  plan_review: "user",
  event_assessment: "user",
};

export function isPlanFlowOperation(input: { pool: AiQuotaPool; purpose: AiQuotaPurpose }): boolean {
  return input.pool === "user" && PLAN_FLOW_PURPOSES.includes(input.purpose);
}

/** W0057：用户池里的即时洞察生成（独立计数，不占 10 次总熔断）。 */
export function isInstantInsightOperation(input: { pool: AiQuotaPool; purpose: AiQuotaPurpose; trigger: AiQuotaTrigger }): boolean {
  return input.pool === "user" && input.purpose === "insight" && input.trigger === "auto";
}

const TOKYO_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;

/** 东京自然月（YYYY-MM）。 */
export function tokyoUsageMonth(now: Date): string {
  return tokyoUsageDay(now).slice(0, 7);
}

/** 下个月 1 日 00:00 东京（UTC ISO）：月上限的 `retryOn`。 */
export function nextTokyoMonthStart(now: Date): string {
  const [year, month] = tokyoUsageMonth(now).split("-").map(Number) as [number, number];
  return new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1) - TOKYO_OFFSET_MS).toISOString();
}

/** 东京自然日（YYYY-MM-DD）。 */
export function tokyoUsageDay(now: Date): string {
  return new Date(Math.floor((now.getTime() + TOKYO_OFFSET_MS) / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

/** 次日 00:00 东京（UTC ISO）：超限顺延与 `retryOn` 的统一口径。 */
export function nextTokyoMidnight(now: Date): string {
  const day = Math.floor((now.getTime() + TOKYO_OFFSET_MS) / DAY_MS);
  return new Date((day + 1) * DAY_MS - TOKYO_OFFSET_MS).toISOString();
}
