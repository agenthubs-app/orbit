/**
 * W0048a：`AiQuotaGate` 的账本实现（`ai_usage_ledger` 操作行 + `ai_usage_calls` 成本子账）。
 *
 * - `reserve`：在按 (workspace, actor, pool) 的 advisory lock 事务里数当日（东京）未释放的操作；
 *   后台池对比 60，用户主动池对比 10（总熔断）与手动重新分析 3（仅 snapshot／manual）；`system` 池不设限。
 *   同一幂等键重放返回原操作（不新增行、不再计次）；原操作已 released（0 次响应、未计次）时按新预留重新开启
 *   （同样受额度约束），这样 memo 提取等「以内容为键」的作业在一次未发出后仍可重试。
 *   不够时返回 daily_limit + 次日 00:00 东京，不调用模型。
 * - `beginCall`：一条语句插入 `started` 子账，同时校验「操作仍在 reserved、当前 epoch 的全部子账（含 no_response）
 *   < max_calls」；超出即拒绝、不发请求。released 操作同键重开时 epoch + 1，历史子账保留。
 * - `endCall`：拿到响应（含输出无效）记 responded + token；无响应记 no_response。
 * - `finish`：只由持有 operationId 的发起方调用一次：有 ≥1 条 responded → 记 succeeded／failed 并计次；
 *   0 条 → released 不计次；重复调用为 no-op。
 * 表还没迁移（42P01）时 `reserve` 返回 disabled（0 次调用），与 W0046「始终拒绝」同一语义。
 */
import { randomUUID } from "node:crypto";

import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import {
  AI_QUOTA_MAX_CALLS,
  BACKGROUND_POOL_DAILY_LIMIT,
  MANUAL_REANALYSIS_DAILY_LIMIT,
  nextTokyoMidnight,
  tokyoUsageDay,
  USER_POOL_DAILY_LIMIT,
} from "./constants";
import type { AiQuotaGate, AiQuotaReservation, AiQuotaReserveInput } from "./gate";

export class AiQuotaCallRejectedError extends Error {
  constructor(readonly code: "MAX_CALLS" | "OPERATION_NOT_OPEN", message: string) {
    super(message);
    this.name = "AiQuotaCallRejectedError";
  }
}

export interface AiQuotaUsageToday {
  /** 手动重新分析（snapshot／manual）当日已用次数。 */
  manual: number;
  /** 用户主动池当日已用次数（含手动）。 */
  user: number;
  /** 后台自动池当日已用次数。 */
  background: number;
}

export interface AiUsageOperationState {
  id: string;
  status: "reserved" | "succeeded" | "failed" | "released";
  /** 当前 epoch 的子账数。 */
  calls: number;
  /** 全部 epoch 中拿到响应的子账数。 */
  responded: number;
  /** 仍在进行（started 且在给定时窗内发出）的子账数：持有者可能还活着。 */
  inflight: number;
}

export interface AiUsageLedger extends AiQuotaGate {
  /** 在调用方已开的事务里预留（worker 用：同一事务把 operation_id 写回 job）。 */
  reserveWith(executor: TransactionalSqlExecutor, input: AiQuotaReserveInput): Promise<AiQuotaReservation>;
  readUsageToday(actorId: string, now: Date): Promise<AiQuotaUsageToday>;
  readOperation(operationId: string, options?: { inflightWindowMs?: number }): Promise<AiUsageOperationState | null>;
}

type Row = Record<string, unknown>;

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const USAGE_SQL = `/* ai-quota:usage-today */
  select
    count(*) filter (where pool = 'user')::int as user_used,
    count(*) filter (where pool = 'user' and purpose = 'snapshot' and trigger = 'manual')::int as manual_used,
    count(*) filter (where pool = 'background')::int as background_used
  from ai_usage_ledger
  where workspace_id = $1 and actor_id = $2 and usage_day = $3::date and status <> 'released'`;

const BEGIN_CALL_SQL = `/* ai-quota:begin-call */
  insert into ai_usage_calls (workspace_id, operation_id, seq, epoch, provider, model, status, started_at)
  select l.workspace_id, l.id,
    (select count(*) from ai_usage_calls c where c.workspace_id = l.workspace_id and c.operation_id = l.id)::int + 1,
    l.epoch, $3, $4, 'started', now()
  from ai_usage_ledger l
  where l.workspace_id = $1 and l.id = $2 and l.status = 'reserved'
    -- 当前 epoch 的全部子账（含 no_response）严格不超过 max_calls。
    and (select count(*) from ai_usage_calls c where c.workspace_id = l.workspace_id and c.operation_id = l.id and c.epoch = l.epoch) < l.max_calls
  returning seq`;

export function createPostgresAiUsageLedger(input: { client: TransactionalPostgresClient; workspaceId: string }): AiUsageLedger {
  const { client, workspaceId } = input;

  async function reserveWith(executor: TransactionalSqlExecutor, request: AiQuotaReserveInput): Promise<AiQuotaReservation> {
    const actorId = request.actorId.trim();
    const key = request.idempotencyKey.trim();
    if (!actorId || !key) throw new Error("AI quota reservation requires an actor and an idempotency key.");
    await executor.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`ai-quota:${workspaceId}:${actorId}:${request.pool}`]);
    const existing = await executor.query<Row>(
      `/* ai-quota:replay */ select id, status from ai_usage_ledger where workspace_id = $1 and actor_id = $2 and idempotency_key = $3`,
      [workspaceId, actorId, key],
    );
    // 同键重放返回原操作（不新增行、不再计次）；只有已 released（0 次响应、未计次）的操作按新预留重新开启。
    const replay = existing.rows[0];
    if (replay && replay.status !== "released") return { ok: true, operationId: String(replay.id) };
    const day = tokyoUsageDay(request.now);
    if (request.pool !== "system") {
      const usage = (await executor.query<Row>(USAGE_SQL, [workspaceId, actorId, day])).rows[0];
      const retryOn = nextTokyoMidnight(request.now);
      if (request.pool === "background" && count(usage?.background_used) >= BACKGROUND_POOL_DAILY_LIMIT) {
        return { ok: false, reason: "daily_limit", retryOn, limit: "background" };
      }
      if (request.pool === "user") {
        if (request.purpose === "snapshot" && request.trigger === "manual" && count(usage?.manual_used) >= MANUAL_REANALYSIS_DAILY_LIMIT) {
          return { ok: false, reason: "daily_limit", retryOn, limit: "manual" };
        }
        if (count(usage?.user_used) >= USER_POOL_DAILY_LIMIT) return { ok: false, reason: "daily_limit", retryOn, limit: "user" };
      }
    }
    if (replay) {
      await executor.query(
        `/* ai-quota:reopen */
        update ai_usage_ledger set status = 'reserved', finished_at = null, usage_day = $3::date, created_at = $4::timestamptz, epoch = epoch + 1
        where workspace_id = $1 and id = $2 and status = 'released'`,
        [workspaceId, String(replay.id), day, request.now.toISOString()],
      );
      return { ok: true, operationId: String(replay.id) };
    }
    const id = `aiop_${randomUUID()}`;
    const inserted = await executor.query<Row>(
      `/* ai-quota:reserve */
      insert into ai_usage_ledger (workspace_id, id, actor_id, usage_day, pool, purpose, trigger, idempotency_key, status, max_calls, created_at)
      values ($1, $2, $3, $4::date, $5, $6, $7, $8, 'reserved', $9, $10::timestamptz)
      on conflict (workspace_id, actor_id, idempotency_key) do nothing
      returning id`,
      [workspaceId, id, actorId, day, request.pool, request.purpose, request.trigger, key, AI_QUOTA_MAX_CALLS[request.purpose], request.now.toISOString()],
    );
    if (inserted.rows[0]) return { ok: true, operationId: id };
    // 同一键在另一个池的锁下刚刚写入：返回那一行。
    const raced = await executor.query<Row>(
      `select id from ai_usage_ledger where workspace_id = $1 and actor_id = $2 and idempotency_key = $3`,
      [workspaceId, actorId, key],
    );
    if (!raced.rows[0]) throw new Error("AI quota reservation conflict without an existing row.");
    return { ok: true, operationId: String(raced.rows[0].id) };
  }

  async function readOperation(operationId: string, options: { inflightWindowMs?: number } = {}): Promise<AiUsageOperationState | null> {
    const row = (await client.query<Row>(
      `/* ai-quota:operation */
      select l.id, l.status,
        (select count(*) from ai_usage_calls c where c.workspace_id = l.workspace_id and c.operation_id = l.id and c.epoch = l.epoch)::int as calls,
        (select count(*) from ai_usage_calls c where c.workspace_id = l.workspace_id and c.operation_id = l.id and c.status = 'responded')::int as responded,
        (select count(*) from ai_usage_calls c where c.workspace_id = l.workspace_id and c.operation_id = l.id and c.status = 'started'
           and c.started_at > now() - make_interval(secs => $3::double precision / 1000))::int as inflight
      from ai_usage_ledger l where l.workspace_id = $1 and l.id = $2`,
      [workspaceId, operationId, options.inflightWindowMs ?? 0],
    )).rows[0];
    if (!row) return null;
    return { calls: count(row.calls), id: String(row.id), inflight: count(row.inflight), responded: count(row.responded), status: row.status as AiUsageOperationState["status"] };
  }

  return {
    reserveWith,
    async reserve(request) {
      try {
        return await client.transaction((tx) => reserveWith(tx, request), { isolation: "read committed" });
      } catch (error) {
        if (isUndefinedTable(error)) return { ok: false, reason: "disabled" };
        throw error;
      }
    },
    async beginCall(operationId, call) {
      let rows: readonly Row[];
      try {
        rows = (await client.query<Row>(BEGIN_CALL_SQL, [workspaceId, operationId, call.provider.slice(0, 100), call.model.slice(0, 200)])).rows;
      } catch (error) {
        // 并发登记同一操作的同一序号：主键挡住第二条，视为超出上限。
        if ((error as { code?: unknown })?.code === "23505") throw new AiQuotaCallRejectedError("MAX_CALLS", "This AI operation has no calls left.");
        throw error;
      }
      if (!rows[0]) {
        const state = await readOperation(operationId);
        if (!state || state.status !== "reserved") throw new AiQuotaCallRejectedError("OPERATION_NOT_OPEN", "This AI operation is not open.");
        throw new AiQuotaCallRejectedError("MAX_CALLS", "This AI operation has no calls left.");
      }
      return { callId: `${operationId}#${count(rows[0].seq)}` };
    },
    async endCall(callId, usage) {
      const at = callId.lastIndexOf("#");
      const operationId = callId.slice(0, at);
      const seq = Number(callId.slice(at + 1));
      if (at <= 0 || !Number.isSafeInteger(seq)) throw new Error("Unknown AI usage call id.");
      await client.query(
        `/* ai-quota:end-call */
        update ai_usage_calls
        set status = case when $4::boolean then 'responded' else 'no_response' end,
          input_tokens = case when $4::boolean then $5::int else null end,
          output_tokens = case when $4::boolean then $6::int else null end,
          ended_at = now()
        where workspace_id = $1 and operation_id = $2 and seq = $3 and status = 'started'`,
        [workspaceId, operationId, seq, usage !== null, Math.max(0, Math.round(usage?.inputTokens ?? 0)), Math.max(0, Math.round(usage?.outputTokens ?? 0))],
      );
    },
    async finish(operationId, outcome) {
      await client.query(
        `/* ai-quota:finish */
        with closed as (
          update ai_usage_calls set status = 'no_response', ended_at = now()
          where workspace_id = $1 and operation_id = $2 and status = 'started'
            and exists (select 1 from ai_usage_ledger where workspace_id = $1 and id = $2 and status = 'reserved')
        )
        update ai_usage_ledger l
        set status = case
            when exists (select 1 from ai_usage_calls c where c.workspace_id = l.workspace_id and c.operation_id = l.id and c.status = 'responded')
              then $3 else 'released' end,
          finished_at = now()
        where l.workspace_id = $1 and l.id = $2 and l.status = 'reserved'`,
        [workspaceId, operationId, outcome],
      );
    },
    async readUsageToday(actorId, now) {
      try {
        const row = (await client.query<Row>(USAGE_SQL, [workspaceId, actorId, tokyoUsageDay(now)])).rows[0];
        return { background: count(row?.background_used), manual: count(row?.manual_used), user: count(row?.user_used) };
      } catch (error) {
        if (isUndefinedTable(error)) return { background: 0, manual: 0, user: 0 };
        throw error;
      }
    },
    readOperation,
  };
}
