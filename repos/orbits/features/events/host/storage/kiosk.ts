/**
 * R17 受付 kiosk 的写操作（host/DESIGN.md §2.6）。Owner: 甲 (R17).
 * - 到着 / QR：走现有 `checkInParticipant`（权限、时间窗、代签计分 R26-04 都在那里），这里只加幂等键与番号、卓次回读。
 * - QR v2：验签、跨活动、过期都拒绝；旧明文不接受。
 * - 取り消す：只能撤销 30 分钟内的签到；记 `event_ops_checkin_undos` 后删签到行（可再签），计分按 R24 撤销规则对冲。
 * - 当日枠：キャンセル待ち → admitted（满员要显式确认，记 over_capacity）→ 签到；权限 `check_in.walk_in`。
 * - 心跳：最近 60 秒有心跳的设备数 =「N台で受付中」。
 * 同一幂等键重放返回第一次的结果（离线补发、两台同时签同一人只记一次）。
 */
import { randomUUID } from "node:crypto";

import type { HostCheckInResult } from "../../../../shared/contract/host-console";
import type { EventAdmissionRepository } from "../../admission/repository";
import { acquireSyncCommitOrderLock } from "../../../sync/commit-order-lock";
import type { EventOperationsPostgresClient, EventOperationsSqlExecutor } from "../../event-operations/storage/postgres-client";
import { verifyCheckInToken } from "../checkin-token-server";
import { HostError } from "../service";
import { assignReceptionNumber } from "./admission-hooks";

export const CHECK_IN_UNDO_WINDOW_MS = 30 * 60 * 1000;
export const KIOSK_DEVICE_WINDOW_SECONDS = 60;

type Operation = "check_in" | "scan" | "undo" | "admit_on_site";

export interface HostKioskDeps {
  client: EventOperationsPostgresClient;
  workspaceId: string;
  /** 现有代签（`EventOperationsService.checkInParticipant`）。 */
  checkInParticipant(input: { actorId: string; eventId: string; participantId: string }): Promise<unknown>;
  admission: Pick<EventAdmissionRepository, "admitOnSite">;
  requireCapability(actorId: string, eventId: string, capability: "check_in.roster.write" | "check_in.walk_in"): Promise<void>;
  /** 撤销后回退计划加分（失败只记日志）。 */
  revertPlanAttendance?(input: { actorId: string; eventId: string }): Promise<void>;
  now?: () => Date;
  tokenSecret?: string | null;
}

interface ParticipantRow { actorId: string; participantId: string; name: string }

export function createHostKiosk(deps: HostKioskDeps) {
  const { client, workspaceId } = deps;
  const now = deps.now ?? (() => new Date());

  async function replay(eventId: string, key: string): Promise<HostCheckInResult | null> {
    const result = await client.query<{ result: HostCheckInResult | string }>(`select result from event_kiosk_requests where workspace_id = $1 and event_id = $2 and idempotency_key = $3`, [workspaceId, eventId, key]);
    const raw = result.rows[0]?.result;
    return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) as HostCheckInResult : null;
  }

  async function remember(eventId: string, key: string, operation: Operation, value: HostCheckInResult): Promise<HostCheckInResult> {
    await client.query(`insert into event_kiosk_requests (workspace_id, event_id, idempotency_key, operation, result) values ($1, $2, $3, $4, $5::jsonb) on conflict do nothing`, [workspaceId, eventId, key, operation, JSON.stringify(value)]);
    return (await replay(eventId, key)) ?? value;
  }

  async function participant(eventId: string, participantId: string): Promise<ParticipantRow | null> {
    const result = await client.query<{ actor_id: string; participant_id: string; display_name: string | null }>(
      `select head.actor_id, head.participant_id, coalesce(application.profile_payload ->> 'displayName', '') as display_name
         from event_ops_membership_heads head
         left join event_ops_admission_application_heads application
           on application.workspace_id = head.workspace_id and application.event_id = head.event_id and application.actor_id = head.actor_id
        where head.workspace_id = $1 and head.event_id = $2 and head.participant_id = $3`,
      [workspaceId, eventId, participantId],
    );
    const row = result.rows[0];
    return row ? { actorId: row.actor_id, name: row.display_name ?? "", participantId: row.participant_id } : null;
  }

  async function tableOf(eventId: string, participantId: string): Promise<string | null> {
    const result = await client.query<{ table_number: number | string }>(
      `select (tables.value ->> 'tableNumber') as table_number
         from event_ops_publication_heads head
         join event_ops_publications publication
           on publication.workspace_id = head.workspace_id and publication.publication_id = head.publication_id
         cross join lateral jsonb_array_elements(coalesce(publication.published_dto -> 'grouping' -> 'roundOne', '[]'::jsonb)) tables(value)
        where head.workspace_id = $1 and head.event_id = $2
          and exists (select 1 from jsonb_array_elements(tables.value -> 'members') member where member ->> 'participantId' = $3)
        limit 1`,
      [workspaceId, eventId, participantId],
    ).catch(() => ({ rows: [] as Array<{ table_number: number | string }> }));
    const number = Number(result.rows[0]?.table_number);
    return Number.isFinite(number) && number > 0 ? String.fromCharCode(64 + Math.min(26, number)) : null;
  }

  async function checkedInAt(eventId: string, participantId: string): Promise<string | null> {
    const result = await client.query<{ checked_in_at: unknown }>(`select checked_in_at from event_ops_checkins where workspace_id = $1 and event_id = $2 and participant_id = $3`, [workspaceId, eventId, participantId]);
    const value = result.rows[0]?.checked_in_at;
    return value ? new Date(value instanceof Date ? value : String(value)).toISOString() : null;
  }

  async function checkInOnce(actorId: string, eventId: string, participantId: string, overCapacity: boolean): Promise<HostCheckInResult> {
    const person = await participant(eventId, participantId);
    if (!person) throw new HostError("NOT_FOUND");
    const before = await checkedInAt(eventId, participantId);
    if (!before) await deps.checkInParticipant({ actorId, eventId, participantId });
    const at = await checkedInAt(eventId, participantId);
    const receptionNumber = await client.transaction((executor) => assignReceptionNumber(executor, { actorId: person.actorId, eventId, workspaceId }));
    return { checkedInAt: at, duplicate: Boolean(before), name: person.name, overCapacity, participantId, receptionNumber, status: "checked_in", table: await tableOf(eventId, participantId) };
  }

  return {
    async checkIn(actorId: string, eventId: string, participantId: string, idempotencyKey: string): Promise<HostCheckInResult> {
      const replayed = await replay(eventId, idempotencyKey);
      if (replayed) return { ...replayed, duplicate: true };
      return remember(eventId, idempotencyKey, "check_in", await checkInOnce(actorId, eventId, participantId, false));
    },

    async scan(actorId: string, eventId: string, payload: string, idempotencyKey: string): Promise<HostCheckInResult> {
      const replayed = await replay(eventId, idempotencyKey);
      if (replayed) return { ...replayed, duplicate: true };
      const check = verifyCheckInToken(payload, { eventId, now: now() }, deps.tokenSecret === undefined ? undefined : deps.tokenSecret);
      if (check.ok === false) throw new HostError("TOKEN_INVALID", `QR_${check.reason.toUpperCase()}`);
      return remember(eventId, idempotencyKey, "scan", await checkInOnce(actorId, eventId, check.participantId, false));
    },

    async undo(actorId: string, eventId: string, participantId: string, idempotencyKey: string): Promise<HostCheckInResult> {
      const replayed = await replay(eventId, idempotencyKey);
      if (replayed) return replayed;
      await deps.requireCapability(actorId, eventId, "check_in.roster.write");
      const person = await participant(eventId, participantId);
      if (!person) throw new HostError("NOT_FOUND");
      const undone = await client.transaction(async (executor: EventOperationsSqlExecutor) => {
        await acquireSyncCommitOrderLock(executor);
        const row = await executor.query<{ actor_id: string; checked_in_at: unknown; evidence_id: string }>(`select actor_id, checked_in_at, evidence_id from event_ops_checkins where workspace_id = $1 and event_id = $2 and participant_id = $3 for update`, [workspaceId, eventId, participantId]);
        const checkIn = row.rows[0];
        if (!checkIn) throw new HostError("INVALID_STATE", "NOT_CHECKED_IN");
        const at = new Date(checkIn.checked_in_at instanceof Date ? checkIn.checked_in_at : String(checkIn.checked_in_at));
        if (now().getTime() - at.getTime() > CHECK_IN_UNDO_WINDOW_MS) throw new HostError("UNDO_EXPIRED");
        const undoId = `undo_${randomUUID()}`;
        await executor.query(`insert into event_ops_checkin_undos (workspace_id, event_id, undo_id, actor_id, participant_id, checked_in_at, evidence_id, undone_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [workspaceId, eventId, undoId, checkIn.actor_id, participantId, at.toISOString(), checkIn.evidence_id, actorId]);
        // 签到写的 outbox / audit 行用的是按 (活动, 人) 确定的 id；改名留档，再签时才能写新的一行。
        const suffix = `:undone:${undoId}`;
        await executor.query(`update event_ops_outbox set outbox_id = outbox_id || $4 where workspace_id = $1 and event_id = $2 and aggregate_type = 'event_checkin' and aggregate_id = $3 and outbox_id not like '%:undone:%'`, [workspaceId, eventId, `${eventId}:${checkIn.actor_id}`, suffix]);
        await executor.query(`update event_ops_audit_log set audit_id = audit_id || $4 where workspace_id = $1 and event_id = $2 and aggregate_type = 'event_checkin' and aggregate_id = $3 and audit_id like 'audit:event-checkin:%' and audit_id not like '%:undone:%'`, [workspaceId, eventId, `${eventId}:${checkIn.actor_id}`, suffix]);
        await executor.query(`delete from event_ops_checkins where workspace_id = $1 and event_id = $2 and participant_id = $3`, [workspaceId, eventId, participantId]);
        await executor.query(
          `insert into event_ops_audit_log (workspace_id, audit_id, event_id, actor_id, action, aggregate_type, aggregate_id, before_payload, after_payload, evidence_ids, occurred_at)
           values ($1, $2, $3, $4, 'event.check_in.undone', 'event_check_in', $5, $6::jsonb, '{}'::jsonb, '{}', statement_timestamp())`,
          [workspaceId, `audit_${randomUUID()}`, eventId, actorId, participantId, JSON.stringify({ checkedInAt: at.toISOString() })],
        );
        return checkIn.actor_id;
      });
      await deps.revertPlanAttendance?.({ actorId: undone, eventId }).catch((error: unknown) => console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "host_check_in_undo_plan_revert_failed" })));
      const receptionNumber = await client.query<{ reception_no: string }>(`select reception_no from event_reception_numbers where workspace_id = $1 and event_id = $2 and actor_id = $3`, [workspaceId, eventId, person.actorId]);
      // 番号不回收：撤销后再签还是同一个号。
      return remember(eventId, idempotencyKey, "undo", { checkedInAt: null, duplicate: false, name: person.name, overCapacity: false, participantId, receptionNumber: receptionNumber.rows[0]?.reception_no ?? null, status: "not_arrived", table: null });
    },

    /** 当日枠：`subjectActorId` 是キャンセル待ち的申込者（候补没有 participant 行，按 actor 认）。 */
    async admitOnSite(actorId: string, eventId: string, subjectActorId: string, input: { idempotencyKey: string; confirmOverCapacity?: boolean }): Promise<HostCheckInResult> {
      const replayed = await replay(eventId, input.idempotencyKey);
      if (replayed) return replayed;
      await deps.requireCapability(actorId, eventId, "check_in.walk_in");
      if (!deps.admission.admitOnSite) throw new HostError("NOT_CONFIGURED");
      let admitted: Awaited<ReturnType<NonNullable<EventAdmissionRepository["admitOnSite"]>>>;
      try {
        admitted = await deps.admission.admitOnSite({ actorId: subjectActorId, allowOverCapacity: input.confirmOverCapacity === true, decisionActorId: actorId, eventId });
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === "CAPACITY_FULL") throw new HostError("CAPACITY_FULL");
        if (code === "INVALID_TRANSITION") throw new HostError("INVALID_STATE", "NOT_WAITLISTED");
        throw error;
      }
      const membership = await client.query<{ participant_id: string }>(`select participant_id from event_ops_membership_heads where workspace_id = $1 and event_id = $2 and actor_id = $3`, [workspaceId, eventId, subjectActorId]);
      const participantId = membership.rows[0]?.participant_id;
      if (!participantId) throw new HostError("INVALID_STATE", "NO_MEMBERSHIP");
      return remember(eventId, input.idempotencyKey, "admit_on_site", await checkInOnce(actorId, eventId, participantId, admitted.overCapacity));
    },

    async heartbeat(actorId: string, eventId: string, deviceId: string): Promise<{ devices: number }> {
      await deps.requireCapability(actorId, eventId, "check_in.roster.write");
      await client.query(
        `insert into event_kiosk_heartbeats (workspace_id, event_id, device_id, actor_id, seen_at) values ($1, $2, $3, $4, $5)
         on conflict (workspace_id, event_id, device_id) do update set seen_at = excluded.seen_at, actor_id = excluded.actor_id`,
        [workspaceId, eventId, deviceId, actorId, now().toISOString()],
      );
      return { devices: await this.devices(eventId) };
    },

    async devices(eventId: string): Promise<number> {
      const result = await client.query<{ n: number }>(`select count(*)::int as n from event_kiosk_heartbeats where workspace_id = $1 and event_id = $2 and seen_at > $3`, [workspaceId, eventId, new Date(now().getTime() - KIOSK_DEVICE_WINDOW_SECONDS * 1000).toISOString()]);
      return Number(result.rows[0]?.n ?? 0);
    },
  };
}

export type HostKiosk = ReturnType<typeof createHostKiosk>;
