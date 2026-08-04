import { AppointmentError, type AppointmentAggregate, type AppointmentOutboxEvent } from "./contract";
import type { AppointmentMutationResult, AppointmentRepository } from "./repository";
import { createConfiguredEventOperationsPostgresRuntime, type EventOperationsPostgresRuntime, type EventOperationsSqlExecutor } from "../events/event-operations/storage/postgres-client";

type Row = Record<string, unknown>;

function payload(row: Row): AppointmentAggregate {
  const value = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  if (!value || typeof value !== "object") throw new Error("Appointment row has an invalid payload.");
  return value as AppointmentAggregate;
}

async function receipt(client: EventOperationsSqlExecutor, workspaceId: string, actorId: string, key: string, command: string, requestHash: string): Promise<AppointmentAggregate | null> {
  const result = await client.query<Row>(`select aggregate.payload
    from appointment_command_receipts receipt
    join appointment_aggregates aggregate
      on aggregate.workspace_id = receipt.workspace_id
      and aggregate.appointment_id = receipt.appointment_id
    where receipt.workspace_id = $1 and receipt.actor_id = $2 and receipt.idempotency_key = $3
      and (aggregate.owner_actor_id = $2 or aggregate.invitee_actor_id = $2)`, [workspaceId, actorId, key]);
  const row = result.rows[0];
  if (!row) return null;
  const receiptResult = await client.query<Row>(`select command, request_hash, response_snapshot
    from appointment_command_receipts
    where workspace_id = $1 and actor_id = $2 and idempotency_key = $3`, [workspaceId, actorId, key]);
  const receiptRow = receiptResult.rows[0];
  if (!receiptRow || receiptRow.command !== command || receiptRow.request_hash !== requestHash) throw new AppointmentError("APPOINTMENT_CONFLICT", "The idempotency key was already used for a different appointment request.");
  return payload({ payload: receiptRow.response_snapshot });
}

async function insertReceipt(client: EventOperationsSqlExecutor, workspaceId: string, actorId: string, key: string, command: string, requestHash: string, appointment: AppointmentAggregate) {
  await client.query(`insert into appointment_command_receipts (
    workspace_id, idempotency_key, actor_id, appointment_id, resource_id,
    command, request_hash, response_snapshot, aggregate_version, created_at
  ) values ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9)`, [workspaceId, key, actorId, appointment.appointmentId, command, requestHash, appointment, appointment.version, appointment.updatedAt]);
}

async function insertOutbox(client: EventOperationsSqlExecutor, workspaceId: string, events: readonly AppointmentOutboxEvent[]) {
  for (const event of events) {
    if (event.eventType === "appointment.reminders.invalidate") {
      await client.query(`update appointment_outbox
        set status = 'cancelled', updated_at = $4
        where workspace_id = $1 and appointment_id = $2
          and payload ->> 'revision' = $3
          and event_type in (
            'appointment.reminder.t24h',
            'appointment.reminder.t1h',
            'appointment.memo.t15m'
          )
          and status in ('pending', 'retry')`, [workspaceId, event.appointmentId, String(event.payload.revision), event.createdAt]);
    }
    await client.query(`insert into appointment_outbox (
      workspace_id, outbox_event_id, appointment_id, aggregate_version,
      event_type, dedupe_key, payload, status, available_at, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $9)
    on conflict (workspace_id, dedupe_key) do nothing`, [workspaceId, event.eventId, event.appointmentId, event.aggregateVersion, event.eventType, event.dedupeKey, event.payload, event.availableAt, event.createdAt]);
  }
}

export function createPostgresAppointmentRepository(runtime: EventOperationsPostgresRuntime): AppointmentRepository {
  const { client, workspaceId } = runtime;
  return {
    async create(input) {
      return client.transaction(async (tx) => {
        const prior = await receipt(tx, workspaceId, input.appointment.ownerActorId, input.idempotencyKey, input.command, input.requestHash);
        if (prior) return { appointment: prior, replayed: true };
        try {
          await tx.query(`insert into appointment_aggregates (
            workspace_id, appointment_id, owner_actor_id, invitee_actor_id,
            relationship_pair_id, authority_request_id, contact_ids_by_actor,
            event_id, status, version, payload, created_at, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [workspaceId, input.appointment.appointmentId, input.appointment.ownerActorId, input.appointment.inviteeActorId, input.appointment.relationshipPairId, input.appointment.authorityRequestId, input.appointment.contactIdsByActor, input.appointment.eventId, input.appointment.status, input.appointment.version, input.appointment, input.appointment.createdAt, input.appointment.updatedAt]);
        } catch (error) {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new AppointmentError("APPOINTMENT_CONFLICT", "The appointment already exists.");
          throw error;
        }
        await insertReceipt(tx, workspaceId, input.appointment.ownerActorId, input.idempotencyKey, input.command, input.requestHash, input.appointment);
        return { appointment: input.appointment, replayed: false };
      });
    },
    async getForActor(appointmentId, actorId) {
      const result = await client.query<Row>(`select payload from appointment_aggregates
        where workspace_id = $1 and appointment_id = $2
          and (owner_actor_id = $3 or invitee_actor_id = $3)`, [workspaceId, appointmentId, actorId]);
      return result.rows[0] ? payload(result.rows[0]) : null;
    },
    async listForActor(actorId) {
      const result = await client.query<Row>(`select payload from appointment_aggregates
        where workspace_id = $1 and (owner_actor_id = $2 or invitee_actor_id = $2)
        order by updated_at desc`, [workspaceId, actorId]);
      return result.rows.map(payload);
    },
    async mutate(input, operation): Promise<AppointmentMutationResult> {
      return client.transaction(async (tx) => {
        const prior = await receipt(tx, workspaceId, input.actorId, input.idempotencyKey, input.command, input.requestHash);
        if (prior) return { appointment: prior, replayed: true };
        const result = await tx.query<Row>(`select payload from appointment_aggregates
          where workspace_id = $1 and appointment_id = $2 for update`, [workspaceId, input.appointmentId]);
        if (!result.rows[0]) throw new AppointmentError("APPOINTMENT_NOT_FOUND", "The appointment does not exist.");
        const current = payload(result.rows[0]);
        if (current.ownerActorId !== input.actorId && current.inviteeActorId !== input.actorId) throw new AppointmentError("APPOINTMENT_FORBIDDEN", "The actor is not part of this appointment.");
        if (current.version !== input.expectedVersion) throw new AppointmentError("APPOINTMENT_CONFLICT", `Expected version ${input.expectedVersion}, found ${current.version}.`);
        const value = operation(current);
        const updated = await tx.query(`update appointment_aggregates set
          status = $4, version = $5, payload = $6, updated_at = $7
          where workspace_id = $1 and appointment_id = $2 and version = $3`, [workspaceId, input.appointmentId, current.version, value.appointment.status, value.appointment.version, value.appointment, value.appointment.updatedAt]);
        if (updated.rowCount !== 1) throw new AppointmentError("APPOINTMENT_CONFLICT", "The appointment changed concurrently.");
        await insertOutbox(tx, workspaceId, value.outbox);
        await insertReceipt(tx, workspaceId, input.actorId, input.idempotencyKey, input.command, input.requestHash, value.appointment);
        return { appointment: value.appointment, replayed: false };
      });
    },
  };
}

export function createConfiguredAppointmentRepository(): AppointmentRepository | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  return runtime ? createPostgresAppointmentRepository(runtime) : null;
}

export async function resolveAcceptedEventContactContext(input: {
  actorId: string;
  eventId: string;
  requestId: string;
}): Promise<{
  authorityRequestId: string;
  contactIdsByActor: Readonly<Record<string, string>>;
  counterpartyActorId: string;
  relationshipPairId: string;
} | null> {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) return null;
  const result = await runtime.client.query<Row>(`
    select
      case when request.requester_actor_id = $4
        then request.target_actor_id else request.requester_actor_id end as invitee_actor_id,
      request.request_id as authority_request_id,
      request.relationship_pair_id,
      jsonb_object_agg(relationship.owner_actor_id, relationship.contact_id) as contact_ids_by_actor
    from event_ops_contact_requests request
    join event_ops_relationship_sides relationship
      on relationship.workspace_id = request.workspace_id
      and relationship.relationship_pair_id = request.relationship_pair_id
    where request.workspace_id = $1
      and request.event_id = $2
      and request.request_id = $3
      and request.status = 'accepted'
      and (request.requester_actor_id = $4 or request.target_actor_id = $4)
    group by request.request_id, request.relationship_pair_id,
      request.requester_actor_id, request.target_actor_id
  `, [runtime.workspaceId, input.eventId, input.requestId, input.actorId]);
  const row = result.rows[0];
  const contactIdsByActor = typeof row?.contact_ids_by_actor === "string" ? JSON.parse(row.contact_ids_by_actor) : row?.contact_ids_by_actor;
  if (!row || typeof row.authority_request_id !== "string" || typeof row.relationship_pair_id !== "string" || typeof row.invitee_actor_id !== "string" || !contactIdsByActor || typeof contactIdsByActor !== "object") return null;
  return {
    authorityRequestId: row.authority_request_id,
    contactIdsByActor: contactIdsByActor as Readonly<Record<string, string>>,
    counterpartyActorId: row.invitee_actor_id,
    relationshipPairId: row.relationship_pair_id,
  };
}
