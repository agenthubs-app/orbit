import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
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
    const params = [workspaceId, actorId];
    let deleted = 0;
    const shared = await sql.query<{ appointment_id: string; owner_actor_id: string; invitee_actor_id: string;
      version: string; payload: Record<string, unknown> | string }>(`select appointment_id,owner_actor_id,invitee_actor_id,
      version,payload from appointment_aggregates where workspace_id=$1 and (owner_actor_id=$2 or invitee_actor_id=$2)
      and (owner_actor_id<>$2 or invitee_actor_id<>$2) for update`, params);
    deleted += await remove(sql, `delete from appointment_outbox o using appointment_aggregates a
      where o.workspace_id=a.workspace_id and o.appointment_id=a.appointment_id
      and a.workspace_id=$1 and (a.owner_actor_id=$2 or a.invitee_actor_id=$2)`, params);
    deleted += await remove(sql, `delete from appointment_command_receipts r using appointment_aggregates a
      where r.workspace_id=a.workspace_id and r.appointment_id=a.appointment_id
      and a.workspace_id=$1 and (a.owner_actor_id=$2 or a.invitee_actor_id=$2)`, params);
    for (const row of shared.rows) {
      const at = new Date().toISOString();
      const payload = redactSharedAppointment(row.payload, actorId, row.owner_actor_id, row.invitee_actor_id, at);
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
