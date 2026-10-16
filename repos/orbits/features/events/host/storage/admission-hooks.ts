/**
 * R17（host/DESIGN.md §2.5「通知时机」、§2.6「受付番号」、§2.10「可靠投递」）：在状态变化的**同一事务**里
 * 分配受付番号、写定型通知 outbox。Owner: 甲 (R17).
 * - 受付番号：按活动计数（`event_reception_counters`），取消不回收；同一人重复调用返回原号（幂等）。
 * - outbox：幂等键 `notice:<eventId>:<kind>:<actorId>`（同人同活动同类只发一次）；worker 另行投递。
 */
import { randomUUID } from "node:crypto";

import { receptionNumberFor } from "../../../../shared/compute/reception-number";
import type { HostNoticeKind } from "../../../../shared/contract/host-notices";
import type { EventOperationsSqlExecutor } from "../../event-operations/storage/postgres-client";

export async function assignReceptionNumber(executor: EventOperationsSqlExecutor, input: { workspaceId: string; eventId: string; actorId: string }): Promise<string> {
  const existing = await executor.query<{ reception_no: string }>(
    `select reception_no from event_reception_numbers where workspace_id = $1 and event_id = $2 and actor_id = $3`,
    [input.workspaceId, input.eventId, input.actorId],
  );
  if (existing.rows[0]) return existing.rows[0].reception_no;
  const counter = await executor.query<{ sequence: number }>(
    `insert into event_reception_counters (workspace_id, event_id, next_no) values ($1, $2, 2)
     on conflict (workspace_id, event_id) do update set next_no = event_reception_counters.next_no + 1
     returning next_no - 1 as sequence`,
    [input.workspaceId, input.eventId],
  );
  const sequence = Number(counter.rows[0]?.sequence ?? 1);
  const receptionNo = receptionNumberFor(sequence);
  await executor.query(
    `insert into event_reception_numbers (workspace_id, event_id, actor_id, sequence, reception_no) values ($1, $2, $3, $4, $5)`,
    [input.workspaceId, input.eventId, input.actorId, sequence, receptionNo],
  );
  return receptionNo;
}

export async function receptionNumberOf(executor: EventOperationsSqlExecutor, input: { workspaceId: string; eventId: string; actorId: string }): Promise<string | null> {
  const result = await executor.query<{ reception_no: string }>(
    `select reception_no from event_reception_numbers where workspace_id = $1 and event_id = $2 and actor_id = $3`,
    [input.workspaceId, input.eventId, input.actorId],
  );
  return result.rows[0]?.reception_no ?? null;
}

export function hostNoticeIdempotencyKey(eventId: string, kind: HostNoticeKind, actorId: string, suffix?: string): string {
  return `notice:${eventId}:${kind}:${actorId}${suffix ? `:${suffix}` : ""}`;
}

/** 写一条定型通知（同一幂等键只写一次）；返回是否新写入。 */
export async function enqueueHostNotice(executor: EventOperationsSqlExecutor, input: { workspaceId: string; eventId: string; kind: HostNoticeKind; actorId: string; payload?: Record<string, unknown>; idempotencyKey?: string }): Promise<boolean> {
  const result = await executor.query(
    `insert into event_host_notice_outbox (workspace_id, notice_id, event_id, kind, actor_id, idempotency_key, payload)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (workspace_id, idempotency_key) do nothing`,
    [input.workspaceId, `notice_${randomUUID()}`, input.eventId, input.kind, input.actorId, input.idempotencyKey ?? hostNoticeIdempotencyKey(input.eventId, input.kind, input.actorId), JSON.stringify(input.payload ?? {})],
  );
  return (result.rowCount ?? 0) > 0;
}

/** admission 状态变化后的副作用（同一事务）：admitted → 番号 + 通知；waitlisted / rejected → 通知。 */
export async function afterAdmissionTransition(executor: EventOperationsSqlExecutor, input: { workspaceId: string; eventId: string; actorId: string; status: "admitted" | "waitlisted" | "rejected"; via: "decision" | "promotion" | "instant" }): Promise<{ receptionNumber: string | null; notified: boolean }> {
  const receptionNumber = input.status === "admitted" ? await assignReceptionNumber(executor, input) : null;
  if (input.via === "instant") return { notified: false, receptionNumber };
  const kind: HostNoticeKind = input.status === "admitted" ? (input.via === "promotion" ? "admission_promoted" : "admission_approved") : input.status === "waitlisted" ? "admission_waitlisted" : "admission_rejected";
  const notified = await enqueueHostNotice(executor, { actorId: input.actorId, eventId: input.eventId, kind, payload: receptionNumber ? { receptionNumber } : {}, workspaceId: input.workspaceId });
  return { notified, receptionNumber };
}
