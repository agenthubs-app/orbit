/**
 * R17（host/DESIGN.md §5、§10 A6）：编组生成的付费 AI 用量补记进账本（只记账，不设上限、不拦调用）。Owner: 甲 (R17).
 * event-ops worker 在每次任务尝试上已记 provider / model / token（v14）；这里把已结束、有 token 的尝试按
 * `event_matching:<generationId>:<taskId>:<attempt>:<lease>` 幂等写成一条 system 池操作（1 次调用），归属主办方。
 */
import type { AiUsageLedger } from "../../ai-quota/ledger";
import type { EventOperationsSqlExecutor } from "../event-operations/storage/postgres-client";

export interface MatchingUsageRow { generationId: string; taskId: string; attempt: number; leaseEpoch: number; organizerActorId: string; provider: string; model: string; promptTokens: number; completionTokens: number; finishedAt: string }

export async function unledgeredMatchingAttempts(executor: EventOperationsSqlExecutor, workspaceId: string, limit = 200): Promise<MatchingUsageRow[]> {
  const result = await executor.query<Record<string, unknown>>(
    `select a.generation_id, a.task_id, a.attempt, a.lease_epoch, g.organizer_actor_id, coalesce(a.provider, 'unknown') as provider, coalesce(a.model, 'unknown') as model,
            coalesce(a.prompt_tokens, 0) as prompt_tokens, coalesce(a.completion_tokens, 0) as completion_tokens, a.finished_at
       from event_ops_task_attempts a join event_ops_generations g on g.workspace_id = a.workspace_id and g.generation_id = a.generation_id
      where a.workspace_id = $1 and a.finished_at is not null and a.prompt_tokens is not null
        and not exists (select 1 from ai_usage_ledger l where l.workspace_id = a.workspace_id and l.purpose = 'event_matching'
                          and l.idempotency_key = 'event_matching:' || a.generation_id || ':' || a.task_id || ':' || a.attempt || ':' || a.lease_epoch)
      order by a.finished_at limit $2`,
    [workspaceId, limit],
  );
  return result.rows.map((row) => ({ attempt: Number(row.attempt), completionTokens: Number(row.completion_tokens), finishedAt: new Date(String(row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at)).toISOString(), generationId: String(row.generation_id), leaseEpoch: Number(row.lease_epoch), model: String(row.model), organizerActorId: String(row.organizer_actor_id), promptTokens: Number(row.prompt_tokens), provider: String(row.provider), taskId: String(row.task_id) }));
}

export async function ledgerMatchingUsage(input: { executor: EventOperationsSqlExecutor; ledger: AiUsageLedger; workspaceId: string; now: Date; limit?: number }): Promise<{ recorded: number }> {
  let recorded = 0;
  for (const row of await unledgeredMatchingAttempts(input.executor, input.workspaceId, input.limit)) {
    const reservation = await input.ledger.reserve({ actorId: row.organizerActorId, idempotencyKey: `event_matching:${row.generationId}:${row.taskId}:${row.attempt}:${row.leaseEpoch}`, now: new Date(row.finishedAt), pool: "system", purpose: "event_matching", trigger: "auto" });
    if (!reservation.ok || !("operationId" in reservation) || reservation.owner === false) continue;
    const { callId } = await input.ledger.beginCall(reservation.operationId, { model: row.model, provider: row.provider });
    await input.ledger.endCall(callId, { inputTokens: row.promptTokens, outputTokens: row.completionTokens });
    await input.ledger.finish(reservation.operationId, "succeeded");
    recorded += 1;
  }
  return { recorded };
}
