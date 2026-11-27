/**
 * 不走 AI 账本的按档用量（2026-11-27 分档）：扫名片按图片张数，每人每东京月 free 30 / pro 300 张（tiers.ts）。
 *
 * - 一次受理 = `ai_quota_charges` 一行，以请求的幂等键（`chargeKey`）去重：同一请求重放返回原来受理的部分，不重复计数。
 * - 受理按「块」进行（一张名片的正反面是一块，不拆开）：在剩余额度内按顺序放入整块，放不下的块不受理。
 * - 本月已用 = 本东京月各行 units 之和（库里算）。同一人同一功能的受理在一把 advisory lock 下串行，上限在并发下严格成立。
 * - 表还没迁移（42P01）或出错：调用方照常受理、不计数并留日志（fail-open）；只有明确用完才拒绝。
 */
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { nextTokyoMonthStart, tokyoUsageMonth } from "./constants";
import { tierLimit, type AccountTier } from "./tiers";

export type ChargedFeature = "card_scan";

export interface TierCharge {
  /** 受理了前几块（0 = 一块都没受理）。 */
  acceptedChunks: number;
  /** 这次计入的单位数（重放时是原来那次的）。 */
  units: number;
  /** 计入之后本月已用。 */
  used: number;
  limit: number;
  retryOn: string;
  replay: boolean;
}

type Row = Record<string, unknown>;
const count = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const USED_SQL = `/* ai-quota:tier-used */
  select coalesce(sum(units), 0)::int as used from ai_quota_charges
  where workspace_id = $1 and actor_id = $2 and feature = $3 and usage_month = $4`;

export async function chargeTierUsage(
  client: TransactionalPostgresClient,
  input: { workspaceId: string; actorId: string; feature: ChargedFeature; tier: AccountTier; chargeKey: string; chunks: readonly number[]; now: Date },
): Promise<TierCharge> {
  const limit = tierLimit(input.tier, input.feature, "month") ?? 0;
  const month = tokyoUsageMonth(input.now);
  const retryOn = nextTokyoMonthStart(input.now);
  return client.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`ai-quota-charge:${input.workspaceId}:${input.actorId}:${input.feature}`]);
    const prior = (await tx.query<Row>(
      `/* ai-quota:tier-replay */ select units from ai_quota_charges where workspace_id = $1 and actor_id = $2 and feature = $3 and charge_key = $4`,
      [input.workspaceId, input.actorId, input.feature, input.chargeKey],
    )).rows[0];
    const usedBefore = count((await tx.query<Row>(USED_SQL, [input.workspaceId, input.actorId, input.feature, month])).rows[0]?.used);
    if (prior) {
      const units = count(prior.units);
      return { acceptedChunks: chunksWithin(input.chunks, units), limit, replay: true, retryOn, units, used: usedBefore };
    }
    const acceptedChunks = chunksWithin(input.chunks, Math.max(0, limit - usedBefore));
    const units = input.chunks.slice(0, acceptedChunks).reduce((sum, value) => sum + value, 0);
    await tx.query(
      `/* ai-quota:tier-charge */ insert into ai_quota_charges (workspace_id, actor_id, feature, charge_key, usage_month, units, created_at) values ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
      [input.workspaceId, input.actorId, input.feature, input.chargeKey, month, units, input.now.toISOString()],
    );
    return { acceptedChunks, limit, replay: false, retryOn, units, used: usedBefore + units };
  }, { isolation: "read committed" });
}

/** How many whole chunks, in order, fit in `room` units. */
function chunksWithin(chunks: readonly number[], room: number): number {
  let total = 0;
  let index = 0;
  for (; index < chunks.length; index += 1) {
    if (total + chunks[index]! > room) break;
    total += chunks[index]!;
  }
  return index;
}

/** A charge whose request then failed is given back (the same key can be charged again on retry). */
export async function refundTierUsage(client: TransactionalPostgresClient, input: { workspaceId: string; actorId: string; feature: ChargedFeature; chargeKey: string }): Promise<void> {
  await client.query(
    `/* ai-quota:tier-refund */ delete from ai_quota_charges where workspace_id = $1 and actor_id = $2 and feature = $3 and charge_key = $4`,
    [input.workspaceId, input.actorId, input.feature, input.chargeKey],
  );
}

export async function readTierUsed(client: Pick<TransactionalPostgresClient, "query">, input: { workspaceId: string; actorId: string; feature: ChargedFeature; now: Date }): Promise<number> {
  return count((await client.query<Row>(USED_SQL, [input.workspaceId, input.actorId, input.feature, tokyoUsageMonth(input.now)])).rows[0]?.used);
}
