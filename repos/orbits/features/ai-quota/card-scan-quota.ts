/**
 * 扫名片的按档月上限（2026-11-27 分档：free 30 / pro 300 张，按图片张数，tiers.ts）。所有扫名片入口共用：
 * v2 批量（按整张名片受理，超出的部分不受理并在响应里列出）、单张识别、旧的 v1 批量与导入（放不下就整批拒绝）。
 *
 * 只有「明确用完」才拒绝；计数表没迁移、没有库或出错：照常受理、不计数，留一条告警日志（fail-open）。
 */
import { randomUUID } from "node:crypto";

import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { overLimitContext, overLimitNotice, overLimitText, type OverLimitNotice } from "./over-limit";
import { chargeTierUsage, refundTierUsage } from "./tier-usage";
import { DEFAULT_ACCOUNT_TIER, type AccountTier } from "./tiers";

export const CARD_SCAN_LIMIT_CODE = "CARD_SCAN_MONTHLY_LIMIT";

export type CardScanCharge =
  | { kind: "accepted"; acceptedChunks: number; notice: OverLimitNotice | null; refund(): Promise<void> }
  | { kind: "limited"; notice: OverLimitNotice };

export interface CardScanQuotaDeps {
  client?: TransactionalPostgresClient | null;
  workspaceId?: string;
  now?: () => Date;
}

function configured(deps: CardScanQuotaDeps): { client: TransactionalPostgresClient; workspaceId: string } | null {
  if (deps.client === null) return null;
  if (deps.client && deps.workspaceId) return { client: deps.client, workspaceId: deps.workspaceId };
  const runtime = createConfiguredTransactionalPostgresRuntime();
  return runtime ? { client: runtime.client, workspaceId: runtime.workspaceId } : null;
}

/**
 * Charges `chunks` (images per card, in order) against this month's limit. Some chunks fit: `accepted` with how many
 * (and a notice when not all did); none fit: `limited`. `chargeKey` makes a replayed request count once.
 */
export async function chargeCardScan(input: { actorId: string; tier?: AccountTier; chargeKey?: string; chunks: readonly number[] }, deps: CardScanQuotaDeps = {}): Promise<CardScanCharge> {
  const all = { acceptedChunks: input.chunks.length, kind: "accepted" as const, notice: null, refund: async () => undefined };
  const target = configured(deps);
  if (!target) return all;
  const tier = input.tier ?? DEFAULT_ACCOUNT_TIER;
  const chargeKey = (input.chargeKey ?? randomUUID()).slice(0, 300);
  const now = (deps.now ?? (() => new Date()))();
  try {
    const charge = await chargeTierUsage(target.client, { actorId: input.actorId, chargeKey, chunks: input.chunks, feature: "card_scan", now, tier, workspaceId: target.workspaceId });
    const notice = charge.acceptedChunks < input.chunks.length
      ? overLimitNotice({ cap: charge.limit, feature: "card_scan", period: "month", retryOn: charge.retryOn, tier, used: charge.used })
      : null;
    if (charge.acceptedChunks === 0 && input.chunks.length > 0) return { kind: "limited", notice: notice! };
    return {
      acceptedChunks: charge.acceptedChunks,
      kind: "accepted",
      notice,
      // A replayed request's charge belongs to the first attempt: it is never given back here.
      refund: async () => charge.replay ? undefined : refundTierUsage(target.client, { actorId: input.actorId, chargeKey, feature: "card_scan", workspaceId: target.workspaceId }).catch((error: unknown) => {
        console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "card_scan_quota_refund_failed" }));
      }),
    };
  } catch (error) {
    console.warn(JSON.stringify({ code: (error as { code?: unknown })?.code ?? null, error: error instanceof Error ? error.name : "unknown", event: "card_scan_quota_unavailable" }));
    return all;
  }
}

/** The error body for a scan refused by the monthly limit (nothing was accepted, no OCR runs). */
export function cardScanLimitError(notice: OverLimitNotice): { code: string; message: string; context: Record<string, string> } {
  return { code: CARD_SCAN_LIMIT_CODE, context: { reason: CARD_SCAN_LIMIT_CODE, ...overLimitContext(notice) }, message: overLimitText("en", notice) };
}

/** Groups manifest entries into cards (front and back together), in the order they were sent. */
export function cardChunks<T extends { cardId?: string | null; seq: number }>(entries: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const entry of [...entries].sort((a, b) => a.seq - b.seq)) {
    const key = entry.cardId?.trim() || `legacy:${entry.seq}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.values()];
}
