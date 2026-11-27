/**
 * 2026-11-27（用户定「加隐藏月上限」）：草稿类 AI（个人简介草稿、「我在寻找」建议、跟进邮件草稿）接进账本。
 *
 * - 一次生成 = 一次操作（`draft_assist`，user 池，manual），每次模型 HTTP 一条子账带 token；三处合计每人每东京月
 *   `AI_QUOTA_MONTHLY_LIMITS.draft_assist` 次，不占任何日上限。
 * - 明确超限：这一次不调用模型，接口回 429 `AI_MONTHLY_LIMIT`（界面显示固定的一句，不显示数字）。
 * - 账本出问题（没有库、表未迁移、约束还没有新用途、出错）：照常生成、不记账（fail-open）。
 */
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import { createLedgeredRunner, type LedgeredRunner } from "../events/journey/ledgered-runner";
import { runOrbitAgentModelText } from "../orbit-ai/gemini-provider";
import type { AiQuotaGate } from "./gate";
import { createPostgresAiUsageLedger } from "./ledger";
import { overLimitContext, overLimitNotice, overLimitText } from "./over-limit";
import { DEFAULT_ACCOUNT_TIER, type AccountTier } from "./tiers";

export type DraftAssistKind = "intro" | "seek" | "email";

/** Error code of a draft refused by the monthly limit; the clients write the numbered line from `error.context`. */
export const AI_MONTHLY_LIMIT_CODE = "AI_MONTHLY_LIMIT";

export function configuredDraftAssistLedger(): AiQuotaGate | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  return runtime ? createPostgresAiUsageLedger({ client: runtime.client, workspaceId: runtime.workspaceId }) : null;
}

export function createDraftAssistRunner(input: { actorId: string; kind: DraftAssistKind; gate: AiQuotaGate | null; runner?: typeof runOrbitAgentModelText }): LedgeredRunner {
  return createLedgeredRunner({
    actorId: input.actorId,
    failOpen: true,
    gate: input.gate,
    idempotencyKey: `draft-assist:${input.kind}:${randomUUID()}`,
    pool: "user",
    purpose: "draft_assist",
    runner: input.runner ?? runOrbitAgentModelText,
    trigger: "manual",
  });
}

/**
 * The 429 for a generation the monthly limit kept off (no model call was made). The limits are public: the notice's
 * machine-readable fields (`error.context.quota*`, features/ai-quota/over-limit.ts) let the clients write the numbered line.
 */
export function aiMonthlyLimitResponse(input: { detail: { cap: number | null; retryOn: string | null } | null; tier?: AccountTier }): Response {
  const notice = overLimitNotice({ cap: input.detail?.cap ?? null, feature: "draft_assist", period: "month", retryOn: input.detail?.retryOn ?? null, tier: input.tier ?? DEFAULT_ACCOUNT_TIER });
  return NextResponse.json({ success: false, error: { code: AI_MONTHLY_LIMIT_CODE, context: overLimitContext(notice), message: overLimitText("en", notice) } }, { status: 429 });
}
