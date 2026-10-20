import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
import { inboxNotificationWriteSchema } from "../../../../shared/api-schema/inbox-notifications";
import { acquireSyncCommitOrderLock } from "../../../../features/sync/commit-order-lock";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";

const PERSONAL_COLLECTIONS = ["notes", "memo_extractions", "tasks", "task_mutations", "personal_schedule_items",
  "personal_schedule_mutations", "personal_schedule_occurrence_exceptions", "reminderPlans", "meetings"];

async function remove(sql: TransactionalSqlExecutor, statement: string, values: readonly unknown[]): Promise<number> {
  const result = await sql.query<{ count: string }>(`with removed as (${statement} returning 1) select count(*)::text as count from removed`, values);
  return Number(result.rows[0]?.count ?? 0);
}

function scrubActor(value: unknown, actorId: string): unknown {
  if (typeof value === "string") return value.replaceAll(actorId, "deleted-account");
  if (Array.isArray(value)) return value.map(item => scrubActor(item, actorId));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== actorId)
    .map(([key, item]) => [key, scrubActor(item, actorId)]));
}

function redactSharedAppointment(raw: unknown, actorId: string, ownerId: string, inviteeId: string, at: string) {
  const source = typeof raw === "string" ? JSON.parse(raw) as Record<string, unknown> : raw as Record<string, unknown>;
  if (!source || typeof source !== "object" || !Array.isArray(source.proposals) || !Array.isArray(source.history)) {
    throw new Error("APPOINTMENT_REDACTION_SOURCE_INVALID");
  }
  const contacts = source.contactIdsByActor && typeof source.contactIdsByActor === "object"
    ? Object.fromEntries(Object.entries(source.contactIdsByActor).filter(([key]) => key !== actorId)) : {};
  const sanitized: Record<string, unknown> = {
    ...source,
    ownerActorId: ownerId === actorId ? "deleted-inviter" : ownerId,
    inviteeActorId: inviteeId === actorId ? "deleted-invitee" : inviteeId,
    createdByActorId: source.createdByActorId === actorId ? "deleted-account" : source.createdByActorId,
    contactIdsByActor: contacts,
    // 主会话代定 §R18c-1: keep the counterparty's appointment, erase the
    // departing participant's writing and revoke all pending projections.
    proposals: source.proposals.filter((proposal: { proposedByActorId?: string }) => proposal.proposedByActorId !== actorId),
    history: source.history.filter((entry: { actorId?: string }) => entry.actorId !== actorId),
    confirmed: null,
    pendingProposalRevision: null,
    projection: { calendar: "not_synced", meeting: "not_synced", revision: null },
    reminders: { cancelled: true, currentRevision: null },
    relationshipPairId: `deleted-appointment:${source.appointmentId}`,
    authorityRequestId: `deleted-appointment:${source.appointmentId}`,
    status: "cancelled",
    version: Number(source.version) + 1,
    updatedAt: at,
  };
  if (source.detailsUpdatedByActorId === actorId || source.createdByActorId === actorId) {
    delete sanitized.details;
    delete sanitized.detailsUpdatedAt;
    delete sanitized.detailsUpdatedByActorId;
  }
  return scrubActor(sanitized, actorId);
}

export async function purgeAccountNotes(db: TransactionalPostgresClient, workspaceId: string, actorId: string): Promise<{ deleted: number }> {
  assertLocalAccountPurgeTarget();
  await assertLocalAccountPurgeDatabase(db);
  if (!workspaceId || !actorId) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  return db.transaction(async sql => {
    await acquireSyncCommitOrderLock(sql);
    const params = [workspaceId, actorId];
    let deleted = 0;
    const shared = await sql.query<{ appointment_id: string; owner_actor_id: string; invitee_actor_id: string;
      version: string; payload: Record<string, unknown> | string }>(`select appointment_id,owner_actor_id,invitee_actor_id,
      version,payload from appointment_aggregates where workspace_id=$1 and (owner_actor_id=$2 or invitee_actor_id=$2)
      and (owner_actor_id<>$2 or invitee_actor_id<>$2) for update`, params);
    const lockedEvents = await sql.query<{ status: string }>(`select o.status from appointment_outbox o
      join appointment_aggregates a on a.workspace_id=o.workspace_id and a.appointment_id=o.appointment_id
      where a.workspace_id=$1 and (a.owner_actor_id=$2 or a.invitee_actor_id=$2)
      for update of o`, params);
    if (lockedEvents.rows.some(event => event.status === "processing")) throw new Error("APPOINTMENT_OUTBOX_IN_FLIGHT");
    // REVIEW S2: receipts and queued events belong to their initiating actor,
    // not to the shared appointment as a whole. Keep the counterparty's retry
    // key and scrub its frozen response before changing the aggregate.
    deleted += await remove(sql, `delete from appointment_command_receipts
      where workspace_id=$1 and actor_id=$2`, params);
    deleted += await remove(sql, `delete from appointment_outbox o using appointment_aggregates a
      where o.workspace_id=a.workspace_id and o.appointment_id=a.appointment_id
      and a.workspace_id=$1 and (a.owner_actor_id=$2 or a.invitee_actor_id=$2)
      and o.payload->>'initiatedByActorId'=$2`, params);
    for (const row of shared.rows) {
      const at = new Date().toISOString();
      const payload = redactSharedAppointment(row.payload, actorId, row.owner_actor_id, row.invitee_actor_id, at);
      const receipts = await sql.query<{ actor_id: string; idempotency_key: string; response_snapshot: unknown }>(
        `select actor_id,idempotency_key,response_snapshot from appointment_command_receipts
         where workspace_id=$1 and appointment_id=$2 for update`, [workspaceId, row.appointment_id]);
      for (const receipt of receipts.rows) {
        const snapshot = redactSharedAppointment(receipt.response_snapshot, actorId, row.owner_actor_id, row.invitee_actor_id, at);
        await sql.query(`update appointment_command_receipts set response_snapshot=$4::jsonb
          where workspace_id=$1 and actor_id=$2 and idempotency_key=$3`,
        [workspaceId, receipt.actor_id, receipt.idempotency_key, JSON.stringify(snapshot)]);
      }
      const events = await sql.query<{ outbox_event_id: string; payload: Record<string, unknown> }>(
        `select outbox_event_id,payload from appointment_outbox where workspace_id=$1 and appointment_id=$2 for update`,
        [workspaceId, row.appointment_id]);
      for (const event of events.rows) {
        const source = event.payload;
        if (!source || typeof source !== "object") throw new Error("APPOINTMENT_OUTBOX_REDACTION_SOURCE_INVALID");
        const safe = scrubActor({ appointmentId: row.appointment_id, confirmed: null,
          contactIdsByActor: Object.fromEntries(Object.entries(source.contactIdsByActor && typeof source.contactIdsByActor === "object"
            ? source.contactIdsByActor : {}).filter(([key]) => key !== actorId)),
          eventId: source.eventId ?? null,
          initiatedByActorId: source.initiatedByActorId ?? null,
          notificationRecipientActorIds: Array.isArray(source.notificationRecipientActorIds)
            ? source.notificationRecipientActorIds.filter(id => id !== actorId) : null,
          participantActorIds: Array.isArray(source.participantActorIds) ? source.participantActorIds : [],
          revision: source.revision,
        }, actorId);
        // Old deliveries must not project a cancelled appointment after purge.
        await sql.query(`update appointment_outbox set payload=$3::jsonb,
          status=case when status in ('pending','retry','processing') then 'cancelled' else status end,
          lease_token=null,lease_expires_at=null,last_error=null,updated_at=$4
          where workspace_id=$1 and outbox_event_id=$2`,
        [workspaceId, event.outbox_event_id, JSON.stringify(safe), at]);
      }
      deleted += await remove(sql, `delete from orbit_records r where r.workspace_id=$1 and r.user_id=$2
        and r.collection_name='notifications' and exists(select 1 from unnest(r.evidence_ids) e
          where e like 'appointment:'||$3::text||':revision:%')`, [workspaceId, actorId, row.appointment_id]);
      await sql.query(`update orbit_records r set payload=jsonb_build_object(
        'id',r.record_id,'channel','in_app','title','共有面談は終了しました',
        'body','共有面談は終了しました','status','cancelled','createdAt',r.created_at),
        search_text='共有面談は終了しました',target_type=null,target_id=null,
        lifecycle_state='deleted',deleted_at=$4,updated_at=$4
        where r.workspace_id=$1 and r.user_id<>$2 and r.collection_name='notifications'
          and exists(select 1 from unnest(r.evidence_ids) e where e like 'appointment:'||$3::text||':revision:%')`,
      [workspaceId, actorId, row.appointment_id, at]);
      const inboxNotices = await sql.query<{ record_id: string; payload: Record<string, unknown> }>(
        `select record_id,payload from orbit_records where workspace_id=$1 and collection_name='inboxNotifications'
          and user_id<>$2 and payload->'notification'->>'semanticKey' like 'appointment:'||$3::text||':%'
          for update`, [workspaceId, actorId, row.appointment_id]);
      for (const notice of inboxNotices.rows) {
        const stored = notice.payload;
        const notification = stored?.notification as Record<string, unknown> | undefined;
        if (!notification || !Array.isArray(notification.sources)) throw new Error("APPOINTMENT_INBOX_REDACTION_SOURCE_INVALID");
        const copy = {
          zh: { title: "共享面谈已结束", reason: "此面谈已不再适用。" },
          en: { title: "Shared meeting ended", reason: "This meeting is no longer available." },
          ja: { title: "共有面談は終了しました", reason: "この面談は利用できなくなりました。" },
        };
        const { object: _object, createdTaskId: _task, legacyId: _legacy, ...rest } = notification;
        const safe = inboxNotificationWriteSchema.parse({ ...rest, title: copy.zh.title, reason: copy.zh.reason,
          copy, revision: Number(notification.revision) + 1, updatedAt: at,
          sources: notification.sources.map((source: Record<string, unknown>) => {
            const { authorId: _author, excerpt: _excerpt, objectId: _objectId, ...facts } = source;
            return facts;
          }),
          target: { kind: "appointment", id: row.appointment_id, href: null, status: "unavailable" }, actions: [],
        });
        await sql.query(`update orbit_records set payload=$3::jsonb,search_text=$4,updated_at=$5
          where workspace_id=$1 and collection_name='inboxNotifications' and record_id=$2`,
        [workspaceId, notice.record_id, JSON.stringify({ notification: safe, operations: {}, sourceState: "unavailable" }), copy.zh.title, at]);
      }
      const changed = await sql.query(`update appointment_aggregates set
        owner_actor_id=$4,invitee_actor_id=$5,contact_id=case when owner_actor_id=$2 then null else contact_id end,
        relationship_pair_id=$6,authority_request_id=$6,contact_ids_by_actor=$7::jsonb,
        status='cancelled',version=version+1,payload=$8::jsonb,updated_at=$9
        where workspace_id=$1 and appointment_id=$3 and version=$10 returning 1`,
      [workspaceId, actorId, row.appointment_id,
        row.owner_actor_id === actorId ? "deleted-inviter" : row.owner_actor_id,
        row.invitee_actor_id === actorId ? "deleted-invitee" : row.invitee_actor_id,
        `deleted-appointment:${row.appointment_id}`,
        JSON.stringify((payload as Record<string, unknown>).contactIdsByActor), JSON.stringify(payload), at, row.version]);
      if (changed.rows.length !== 1) throw new Error("APPOINTMENT_REDACTION_CONFLICT");
      deleted += 1;
    }
    deleted += await remove(sql, `delete from appointment_aggregates where workspace_id=$1 and owner_actor_id=$2 and invitee_actor_id=$2`, params);
    deleted += await remove(sql, `delete from orbit_records where workspace_id=$1 and user_id=$2 and collection_name=any($3::text[])`,
      [workspaceId, actorId, PERSONAL_COLLECTIONS]);
    return { deleted };
  }, { isolation: "read committed" });
}
