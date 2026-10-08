/**
 * W0048a：两池 AI 配额的常量（D44 C-5 / W48-2；数值 D45 已定，2026-10-02）。
 *
 * 单位一律是「次操作」：一次 `reserve` = 1 次操作，一次操作内部可发多次 HTTP（上限 `max_calls`），
 * 额度只算 1 次；成本按每次 HTTP 一条子账（`ai_usage_calls`）。用户改数值只改这里的常量。
 */
export type AiQuotaPool = "user" | "background" | "system";
export type AiQuotaPurpose = "plan" | "plan_refine" | "snapshot" | "memo_extraction" | "insight" | "enrichment";
export type AiQuotaTrigger = "auto" | "manual" | "plan";

export const AI_QUOTA_POOLS: readonly AiQuotaPool[] = ["user", "background", "system"];
export const AI_QUOTA_PURPOSES: readonly AiQuotaPurpose[] = ["plan", "plan_refine", "snapshot", "memo_extraction", "insight", "enrichment"];
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
};

/** W0057：用户池里的即时洞察生成（独立计数，不占 10 次总熔断）。 */
export function isInstantInsightOperation(input: { pool: AiQuotaPool; purpose: AiQuotaPurpose; trigger: AiQuotaTrigger }): boolean {
  return input.pool === "user" && input.purpose === "insight" && input.trigger === "auto";
}

const TOKYO_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;

/** 东京自然日（YYYY-MM-DD）。 */
export function tokyoUsageDay(now: Date): string {
  return new Date(Math.floor((now.getTime() + TOKYO_OFFSET_MS) / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

/** 次日 00:00 东京（UTC ISO）：超限顺延与 `retryOn` 的统一口径。 */
export function nextTokyoMidnight(now: Date): string {
  const day = Math.floor((now.getTime() + TOKYO_OFFSET_MS) / DAY_MS);
  return new Date((day + 1) * DAY_MS - TOKYO_OFFSET_MS).toISOString();
}
