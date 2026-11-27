/**
 * 受控改档（2026-11-27 分档：pro 只能由运营侧设置，没有任何公网可调用的改档接口）。只由 scripts/account-ops.ts 调用，
 * 跑在 `runInControlledAccountOpsScope` 里（只在部署构建内 / 本机）。档位写在 auth_users 那行的 payload.tier：每个已登录
 * 请求的会话检查本来就读这一行，所以读档位不多一次库往返；下一次请求即生效。free = 去掉这个字段（缺省即 free）。
 * 不带 apply 一律只读预演；输出里邮箱打码。
 */
import { acquireSyncCommitOrderLock } from "../../sync/commit-order-lock";
import { accountTierOf, type AccountTier } from "../../ai-quota/tiers";
import { runInControlledAccountOpsScope } from "../data-rights/purge/local-gate";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { maskEmail, resolveControlledAccountTarget } from "./target";

export interface ControlledTierChangeResult {
  kind: "dry-run" | "changed" | "unchanged";
  userId: string;
  actorId: string;
  email: string;
  from: AccountTier;
  to: AccountTier;
}

export function runControlledTierChange(input: { db: TransactionalPostgresClient; workspaceId: string; email: string; userId: string; tier: string; apply?: boolean; now?: () => Date }): Promise<ControlledTierChangeResult> {
  return runInControlledAccountOpsScope(async () => {
    if (input.tier !== "free" && input.tier !== "pro") throw new Error("TIER_INVALID");
    const to: AccountTier = input.tier;
    const now = (input.now ?? (() => new Date()))().toISOString();
    const run = async (sql: TransactionalSqlExecutor): Promise<ControlledTierChangeResult> => {
      const target = await resolveControlledAccountTarget(sql, input.workspaceId, { email: input.email, userId: input.userId });
      const current = await sql.query<{ tier: unknown }>(`select payload->'tier' as tier from orbit_records where workspace_id=$1
        and collection_name='auth_users' and record_id=$2 and payload->>'id'=$3`, [input.workspaceId, target.authRecordId, target.userId]);
      const from = accountTierOf(current.rows[0]?.tier);
      const base = { actorId: target.actorId, email: maskEmail(target.email), from, to, userId: target.userId };
      if (input.apply !== true) return { kind: "dry-run", ...base };
      if (from === to) return { kind: "unchanged", ...base };
      await acquireSyncCommitOrderLock(sql);
      const updated = await sql.query(`update orbit_records set
          payload = case when $4::text = 'free' then (payload - 'tier') else payload || jsonb_build_object('tier', $4::text) end
            || jsonb_build_object('tierChangedAt', $5::text),
          updated_at = $5::timestamptz
        where workspace_id=$1 and collection_name='auth_users' and record_id=$2 and payload->>'id'=$3 and lifecycle_state='active'
        returning record_id`, [input.workspaceId, target.authRecordId, target.userId, to, now]);
      if (updated.rows.length !== 1) throw new Error("TARGET_IDENTITY_CHANGED");
      return { kind: "changed", ...base };
    };
    return input.apply === true
      ? input.db.transaction(run, { isolation: "serializable" })
      : input.db.transaction(async (sql) => {
        await sql.query("set transaction read only");
        return run(sql);
      }, { isolation: "serializable" });
  });
}
