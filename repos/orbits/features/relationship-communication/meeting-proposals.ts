import { createHash } from "node:crypto";

import { createContactAppointmentAuthorityVerifier, createRuntimeAppointmentContactAuthorityReader } from "../appointments/contact-authority";
import { AppointmentError, type AppointmentAggregate, type AppointmentProposalInput } from "../appointments/contract";
import { createPostgresAppointmentRepository } from "../appointments/postgres-repository";
import { createAppointmentService } from "../appointments/service";
import type {
  EventOperationsPostgresClient,
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "../events/event-operations/storage/postgres-client";
import type { TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";

/**
 * R39 (contact-reach D1/D2/D2b): the meeting side of relationship messaging.
 *
 * - Who can receive a proposal (`canProposeMeeting`): an accepted bilateral
 *   event exchange, or a live invite-code connection (read again every time).
 *   Only these give the appointment both people's contact ids; a person reached
 *   only through an email invitation can be messaged but not sent a proposal.
 * - One ongoing meeting per pair of people (D2b): any appointment between the
 *   two accounts that is not cancelled/completed blocks a new proposal and is
 *   reported (409 with its id) so the client can offer "reschedule". A
 *   confirmed meeting whose time has ended is completed first.
 * - The proposal is created inside the message send transaction
 *   (message-store `send` → `proposal.attach`): the appointment, its outbox
 *   events, its command receipt and the message commit or roll back together.
 *   Relationship messages and appointments live in the same database
 *   (resolveLiveDatabaseConnectionConfig for both runtimes), so no draft
 *   appointment and no cleanup job are needed.
 */
export class RelationshipMeetingActiveError extends Error {
  readonly code = "MEETING_ALREADY_ACTIVE";
  constructor(readonly appointmentId: string | null) {
    super("An ongoing meeting already exists with this person.");
    this.name = "RelationshipMeetingActiveError";
  }
}

export class RelationshipMeetingUnavailableError extends Error {
  readonly code = "MEETING_NOT_AVAILABLE";
  constructor() {
    super("Meeting proposals are not available for this contact.");
    this.name = "RelationshipMeetingUnavailableError";
  }
}

export interface RelationshipMeetingProposals {
  /** An accepted event exchange or a live invite connection is behind my contact. */
  canPropose(accountId: string, contactId: string): Promise<boolean>;
  /** The ongoing appointment between the two accounts, if any (D2b). */
  activeAppointmentId(accountId: string, peerAccountId: string): Promise<string | null>;
  /** D2b: completes a confirmed meeting between the two accounts whose time has ended. */
  completeEnded(input: { actorId: string; peerAccountId: string; idempotencyKey: string }): Promise<void>;
  /** Inside the send transaction: create the appointment with its first proposal; returns its id. */
  createWithin(tx: TransactionalSqlExecutor, input: { actorId: string; contactId: string; peerAccountId: string; idempotencyKey: string; proposal: AppointmentProposalInput }): Promise<string>;
  /** Inside the send transaction: does the stored appointment carry this proposal from this actor? */
  matchesReplay(tx: TransactionalSqlExecutor, input: { actorId: string; appointmentId: string; proposal: AppointmentProposalInput }): Promise<boolean>;
}

const ACTIVE_SQL = `select appointment_id, payload from appointment_aggregates
  where workspace_id = $1 and status not in ('cancelled', 'completed')
    and ((owner_actor_id = $2 and invitee_actor_id = $3) or (owner_actor_id = $3 and invitee_actor_id = $2))
  order by updated_at desc, appointment_id limit 2`;

type ActiveRow = { appointment_id: string; payload: AppointmentAggregate | string };

function aggregate(row: ActiveRow): AppointmentAggregate {
  return typeof row.payload === "string" ? JSON.parse(row.payload) as AppointmentAggregate : row.payload;
}

async function appointmentsPresent(client: TransactionalSqlExecutor): Promise<boolean> {
  const result = await client.query<{ present: boolean }>("select to_regclass('appointment_aggregates') is not null as present");
  return result.rows[0]?.present === true;
}

/** A transaction executor seen as an event-operations runtime whose "transactions" run in the outer one. */
function runtimeWithin(tx: TransactionalSqlExecutor, workspaceId: string): EventOperationsPostgresRuntime {
  const executor: EventOperationsSqlExecutor = {
    async query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      const result = await tx.query<TRow>(text, values) as { rows: readonly TRow[]; rowCount?: number | null };
      return { rowCount: result.rowCount ?? result.rows.length, rows: result.rows };
    },
  };
  const client: EventOperationsPostgresClient = { ...executor, close: async () => {}, transaction: (operation) => operation(executor) };
  return { client, workspaceId };
}

function normalizedProposal(proposal: { candidateTimes: readonly { startsAtUtc: string }[]; durationMinutes: number; medium: unknown; note?: string | null; timezone: string }) {
  const medium = proposal.medium as Record<string, unknown>;
  return JSON.stringify({
    candidateTimes: proposal.candidateTimes.map((item) => {
      const parsed = Date.parse(item.startsAtUtc);
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : item.startsAtUtc;
    }).sort(),
    durationMinutes: proposal.durationMinutes,
    medium: Object.fromEntries(Object.keys(medium ?? {}).sort().map((key) => [key, medium[key] ?? null])),
    note: (proposal.note ?? "").trim(),
    timezone: proposal.timezone.trim(),
  });
}

export function relationshipProposalKey(kind: "create" | "complete", ...parts: string[]): string {
  return `rel-msg-${kind}:${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 48)}`;
}

export function createPostgresRelationshipMeetingProposals(input: { runtime: EventOperationsPostgresRuntime; now?: () => string }): RelationshipMeetingProposals {
  const { runtime } = input;
  const now = input.now ?? (() => new Date().toISOString());
  const workspaceId = runtime.workspaceId;

  async function active(client: TransactionalSqlExecutor, accountId: string, peerAccountId: string): Promise<AppointmentAggregate[]> {
    if (!(await appointmentsPresent(client))) return [];
    return (await client.query<ActiveRow>(ACTIVE_SQL, [workspaceId, accountId, peerAccountId])).rows.map(aggregate);
  }

  return {
    async canPropose(accountId, contactId) {
      try {
        return (await createRuntimeAppointmentContactAuthorityReader(runtime).read(accountId, contactId)) !== null;
      } catch (error) {
        // More than one accepted event context is ambiguous: no proposal from here.
        if (error instanceof AppointmentError) return false;
        throw error;
      }
    },

    async activeAppointmentId(accountId, peerAccountId) {
      return (await active(runtime.client, accountId, peerAccountId))[0]?.appointmentId ?? null;
    },

    async completeEnded({ actorId, peerAccountId, idempotencyKey }) {
      const service = createAppointmentService({ now, repository: createPostgresAppointmentRepository(runtime),
        authorityVerifier: { resolveAcceptedBilateralContact: async () => null } });
      for (const appointment of await active(runtime.client, actorId, peerAccountId)) {
        const confirmed = appointment.confirmed;
        if (appointment.status !== "confirmed" || !confirmed) continue;
        if (Date.parse(confirmed.startsAtUtc) + confirmed.durationMinutes * 60_000 > Date.parse(now())) continue;
        await service.command({ actorId, appointmentId: appointment.appointmentId, command: "complete", expectedVersion: appointment.version,
          idempotencyKey: relationshipProposalKey("complete", idempotencyKey, appointment.appointmentId, String(appointment.version)) });
      }
    },

    async createWithin(tx, value) {
      const within = runtimeWithin(tx, workspaceId);
      let context;
      try {
        context = await createRuntimeAppointmentContactAuthorityReader(within).read(value.actorId, value.contactId);
      } catch (error) {
        if (error instanceof AppointmentError) throw new RelationshipMeetingUnavailableError();
        throw error;
      }
      if (!context) throw new RelationshipMeetingUnavailableError();
      const ongoing = await active(tx, value.actorId, value.peerAccountId);
      if (ongoing.length) throw new RelationshipMeetingActiveError(ongoing[0]!.appointmentId);
      const verifier = createContactAppointmentAuthorityVerifier(within, value.contactId);
      const service = createAppointmentService({ now, repository: createPostgresAppointmentRepository(within), authorityVerifier: {
        async resolveAcceptedBilateralContact(request) {
          const authority = await verifier.resolveAcceptedBilateralContact(request);
          // The proposal goes to the other member of this conversation, never to someone else.
          return authority?.counterpartyActorId === value.peerAccountId ? authority : null;
        },
      } });
      try {
        const result = await service.createDraft({ actorId: value.actorId, eventId: context.eventId, authorityReference: context.authorityReference,
          idempotencyKey: value.idempotencyKey, initialProposal: value.proposal });
        return result.appointment.appointmentId;
      } catch (error) {
        if (error instanceof AppointmentError && error.code === "APPOINTMENT_FORBIDDEN") throw new RelationshipMeetingUnavailableError();
        // The active-pair unique index: another proposal won a race outside this conversation.
        if (error instanceof AppointmentError && error.code === "APPOINTMENT_CONFLICT") throw new RelationshipMeetingActiveError(null);
        throw error;
      }
    },

    async matchesReplay(tx, value) {
      const result = await tx.query<{ payload: AppointmentAggregate | string }>(
        "select payload from appointment_aggregates where workspace_id = $1 and appointment_id = $2", [workspaceId, value.appointmentId]);
      const row = result.rows[0];
      if (!row) return false;
      const stored = aggregate({ appointment_id: value.appointmentId, payload: row.payload });
      const first = stored.proposals.find((proposal) => proposal.revision === 1);
      return Boolean(first && stored.ownerActorId === value.actorId && first.proposedByActorId === value.actorId
        && normalizedProposal(first) === normalizedProposal(value.proposal));
    },
  };
}
