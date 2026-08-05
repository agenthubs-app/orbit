import { createHash } from "node:crypto";

import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../../shared/domain/contracts";
import {
  EventOperationsError,
  type EventContactRequest,
  type EventOperationsCheckIn,
  type EventOperationsParticipant,
  type EventOperationsPublishedResult,
} from "../contract";
import type { EventOperationsLimitedCheckInRosterItem } from "../check-in-roster";
import type {
  CreateEventContactRequestInput,
  CreateEventOperationsCheckInInput,
  EventOperationsRepository,
  ListEventOperationsLimitedCheckInRosterInput,
  RespondToEventContactRequestInput,
  WithdrawEventContactRequestInput,
} from "../repository";
import { canAccessEventCapability } from "../../event-access/capability-policy";
import type {
  EventAccessAssignmentState,
  EventAccessRole,
} from "../../event-access/contract";
import { requireEventAccessRepositoryReadiness } from "../../event-access/storage/postgres-repository";
import type {
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "./postgres-client";

type SqlRow = Record<string, unknown>;

type OnsiteOperationsMethods = Pick<
  EventOperationsRepository,
  | "checkInAtomically"
  | "createContactRequestAtomically"
  | "listContactRequests"
  | "listLimitedCheckInRoster"
  | "respondToContactRequestAtomically"
  | "withdrawContactRequestAtomically"
>;

interface ContactParticipantRow extends SqlRow {
  actor_id: string;
  participant_id: string;
  participant_payload: unknown;
}

interface StaffAuthorizationSnapshot {
  capability: "check_in.roster.write";
  kind: "staff";
  owner: boolean;
  revision: number;
  role: EventAccessRole | null;
  state: EventAccessAssignmentState | null;
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function digest(...values: readonly string[]): string {
  const hash = createHash("sha256");
  for (const value of values) hash.update(value).update("\u0000");
  return hash.digest("hex").slice(0, 28);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function payloadHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function text(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Event onsite SQL row is missing ${key}.`);
  }
  return value;
}

function optionalText(row: SqlRow, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined ? null : text(row, key);
}

function timestamp(row: SqlRow, key: string): string {
  const value = row[key];
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Event onsite SQL row has an invalid ${key}.`);
  }
  return new Date(parsed).toISOString();
}

function optionalTimestamp(row: SqlRow, key: string): string | null {
  return row[key] === null || row[key] === undefined
    ? null
    : timestamp(row, key);
}

function positiveRevision(row: SqlRow): number {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Contact request revision is invalid.");
  }
  return revision;
}

function jsonValue<TValue>(value: unknown, field: string): TValue {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Event onsite SQL row has an invalid ${field}.`);
  }
  return clone(parsed) as TValue;
}

function checkInFromRow(row: SqlRow): EventOperationsCheckIn {
  return {
    actorId: text(row, "actor_id"),
    checkedInAt: timestamp(row, "checked_in_at"),
    eventId: text(row, "event_id"),
    evidenceId: text(row, "evidence_id"),
    participantId: text(row, "participant_id"),
  };
}

function contactRequestFromSafeRow(row: SqlRow): EventContactRequest {
  const status = text(row, "status");
  if (
    status !== "awaiting_target_consent" &&
    status !== "accepted" &&
    status !== "declined" &&
    status !== "withdrawn"
  ) {
    throw new Error(`Event onsite SQL row has an invalid status ${status}.`);
  }
  return {
    acceptedAt: optionalTimestamp(row, "accepted_at"),
    contactId: status === "accepted" ? optionalText(row, "contact_id") : null,
    createdAt: timestamp(row, "created_at"),
    declinedAt: optionalTimestamp(row, "declined_at"),
    eventId: text(row, "event_id"),
    requestId: text(row, "request_id"),
    revision: positiveRevision(row),
    requesterParticipantId: text(row, "requester_participant_id"),
    status,
    targetParticipantId: text(row, "target_participant_id"),
    updatedAt: timestamp(row, "updated_at"),
    withdrawnAt: optionalTimestamp(row, "withdrawn_at"),
  };
}

async function readContactRequestForViewer(input: {
  eventId: string;
  executor: EventOperationsSqlExecutor;
  requestId: string;
  viewerActorId: string | null;
  workspaceId: string;
}): Promise<EventContactRequest | null> {
  const result = await input.executor.query<SqlRow>(
    `
      select
        request.request_id,
        request.event_id,
        request.requester_participant_id,
        request.target_participant_id,
        request.status,
        request.accepted_at,
        request.declined_at,
        request.withdrawn_at,
        request.revision,
        request.created_at,
        request.updated_at,
        viewer_side.contact_id
      from event_ops_contact_requests request
      left join event_ops_relationship_sides viewer_side
        on viewer_side.workspace_id = request.workspace_id
        and viewer_side.relationship_pair_id = request.relationship_pair_id
        and viewer_side.owner_actor_id = $4
      where request.workspace_id = $1
        and request.event_id = $2
        and request.request_id = $3
        and (
          $4::text is null
          or request.requester_actor_id = $4
          or request.target_actor_id = $4
        )
    `,
    [
      input.workspaceId,
      input.eventId,
      input.requestId,
      input.viewerActorId,
    ],
  );
  return result.rows[0] ? contactRequestFromSafeRow(result.rows[0]) : null;
}

function contactFor(input: {
  evidenceId: string;
  eventId: string;
  ownerActorId: string;
  participant: EventOperationsParticipant;
  timestamp: string;
}): ContactDTO {
  return {
    createdAt: input.timestamp,
    displayName: input.participant.displayName,
    evidenceIds: [input.evidenceId],
    id: `contact:event-consent:${digest(
      input.eventId,
      input.ownerActorId,
      input.participant.actorId,
    )}`,
    organization: input.participant.company ?? undefined,
    personId: input.participant.actorId,
    profileSnippet: [
      ...input.participant.offers.map((value) => `Offers: ${value}`),
      ...input.participant.needs.map((value) => `Needs: ${value}`),
    ].join(" · "),
    publicProfile: {
      industry: input.participant.industry ?? undefined,
      offering: input.participant.offers,
      seeking: input.participant.needs,
      topics: input.participant.topics,
    },
    role: input.participant.role ?? undefined,
    source: {
      id: input.eventId,
      label: "Accepted event business-card request",
      type: "event_import",
    },
    stage: "active",
    updatedAt: input.timestamp,
  };
}

function connectionFor(input: {
  contact: ContactDTO;
  evidenceId: string;
  eventId: string;
  ownerActorId: string;
  participant: EventOperationsParticipant;
  timestamp: string;
}): ConnectionDTO {
  return {
    accountId: input.ownerActorId,
    contactId: input.contact.id,
    createdAt: input.timestamp,
    evidenceIds: [input.evidenceId],
    id: `connection:event-consent:${digest(
      input.eventId,
      input.ownerActorId,
      input.participant.actorId,
    )}`,
    relationshipStrength: 55,
    sharedTopics: input.participant.topics,
    source: {
      id: input.eventId,
      label: "Mutually accepted event connection",
      type: "event_import",
    },
    stage: "active",
    suggestedActions: ["Follow up on the mutually accepted event connection."],
    summary: `Mutual business-card consent at event ${input.eventId}.`,
    updatedAt: input.timestamp,
    valueTypes: ["community_context", "knowledge_exchange"],
  };
}

async function insertOutbox(input: {
  aggregateId: string;
  aggregateType: string;
  eventId: string;
  eventType: string;
  executor: EventOperationsSqlExecutor;
  outboxId: string;
  payload: unknown;
  timestamp: string;
  workspaceId: string;
}): Promise<void> {
  await input.executor.query(
    `
      insert into event_ops_outbox (
        workspace_id, outbox_id, event_id, aggregate_type, aggregate_id,
        event_type, payload, status, attempts, available_at, created_at,
        updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7::jsonb, 'pending', 0, $8, $8, $8
      )
    `,
    [
      input.workspaceId,
      input.outboxId,
      input.eventId,
      input.aggregateType,
      input.aggregateId,
      input.eventType,
      JSON.stringify(input.payload),
      input.timestamp,
    ],
  );
}

async function publishedDirectoryForEvent(input: {
  eventId: string;
  executor: EventOperationsSqlExecutor;
  workspaceId: string;
}): Promise<readonly EventOperationsParticipant[] | null> {
  await input.executor.query(
    `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [
      `event-operations-publication-head:${input.workspaceId}:${input.eventId}`,
    ],
  );
  const publication = await input.executor.query<{ published_dto: unknown }>(
    `
      select publication.published_dto
      from event_ops_publication_heads head
      join event_ops_publications publication
        on publication.workspace_id = head.workspace_id
        and publication.publication_id = head.publication_id
      where head.workspace_id = $1 and head.event_id = $2
      for update of head
    `,
    [input.workspaceId, input.eventId],
  );
  if (!publication.rows[0]) return null;
  return jsonValue<EventOperationsPublishedResult>(
    publication.rows[0].published_dto,
    "published_dto",
  ).directory;
}

async function currentContactParticipantIdentities(input: {
  eventId: string;
  executor: EventOperationsSqlExecutor;
  requesterActorId: string;
  targetParticipantId: string;
  workspaceId: string;
}): Promise<readonly [ContactParticipantRow, ContactParticipantRow]> {
  const participants = await input.executor.query<ContactParticipantRow>(
    `
      select actor_id, participant_id, '{}'::jsonb as participant_payload
      from event_ops_membership_heads
      where workspace_id = $1 and event_id = $2 and status = 'rsvped'
        and (actor_id = $3 or participant_id = $4)
      order by actor_id
    `,
    [
      input.workspaceId,
      input.eventId,
      input.requesterActorId,
      input.targetParticipantId,
    ],
  );
  const requester = participants.rows.find(
    (row) => row.actor_id === input.requesterActorId,
  );
  const target = participants.rows.find(
    (row) => row.participant_id === input.targetParticipantId,
  );
  if (!requester || !target || requester.actor_id === target.actor_id) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
      "A business-card request requires two distinct active event registrations.",
    );
  }
  return [requester, target];
}

async function activeParticipantRows(input: {
  eventId: string;
  executor: EventOperationsSqlExecutor;
  requesterActorId: string;
  targetParticipantId: string;
  workspaceId: string;
}): Promise<readonly [ContactParticipantRow, ContactParticipantRow]> {
  const event = await input.executor.query<SqlRow>(
    `
      select registration_migration_state
      from event_ops_events
      where workspace_id = $1 and event_id = $2
      for update
    `,
    [input.workspaceId, input.eventId],
  );
  if (event.rows[0]?.registration_migration_state !== "canonical") {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_NOT_CONFIGURED",
      "Canonical event registration is required for onsite operations.",
    );
  }

  const participants = await input.executor.query<ContactParticipantRow>(
    `
      select
        membership.actor_id,
        membership.participant_id,
        profile.profile_payload -> 'participant' as participant_payload
      from event_ops_membership_heads membership
      join event_ops_profile_versions profile
        on profile.workspace_id = membership.workspace_id
        and profile.event_id = membership.event_id
        and profile.participant_id = membership.participant_id
        and profile.profile_version = membership.profile_version
      where membership.workspace_id = $1
        and membership.event_id = $2
        and membership.status = 'rsvped'
        and (
          membership.actor_id = $3
          or membership.participant_id = $4
        )
      order by membership.actor_id
      for update of membership
    `,
    [
      input.workspaceId,
      input.eventId,
      input.requesterActorId,
      input.targetParticipantId,
    ],
  );
  const requester = participants.rows.find(
    (row) => row.actor_id === input.requesterActorId,
  );
  const target = participants.rows.find(
    (row) => row.participant_id === input.targetParticipantId,
  );
  if (!requester || !target || requester.actor_id === target.actor_id) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
      "A business-card request requires two distinct active event registrations.",
    );
  }
  const publishedDirectory = await publishedDirectoryForEvent({
    eventId: input.eventId,
    executor: input.executor,
    workspaceId: input.workspaceId,
  });
  if (
    publishedDirectory &&
    (!publishedDirectory.some(
      (participant) =>
        participant.actorId === requester.actor_id &&
        participant.participantId === requester.participant_id,
    ) ||
      !publishedDirectory.some(
        (participant) =>
          participant.actorId === target.actor_id &&
          participant.participantId === target.participant_id,
      ))
  ) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
      "Published contact targets must belong to the immutable published directory.",
    );
  }
  return [requester, target];
}

async function participantsForAcceptedPair(input: {
  eventId: string;
  executor: EventOperationsSqlExecutor;
  requesterActorId: string;
  requesterParticipantId: string;
  targetActorId: string;
  targetParticipantId: string;
  workspaceId: string;
}): Promise<readonly [EventOperationsParticipant, EventOperationsParticipant]> {
  const active = await input.executor.query<ContactParticipantRow>(
    `
      select
        membership.actor_id,
        membership.participant_id,
        profile.profile_payload -> 'participant' as participant_payload
      from event_ops_membership_heads membership
      join event_ops_profile_versions profile
        on profile.workspace_id = membership.workspace_id
        and profile.event_id = membership.event_id
        and profile.participant_id = membership.participant_id
        and profile.profile_version = membership.profile_version
      where membership.workspace_id = $1
        and membership.event_id = $2
        and membership.status = 'rsvped'
        and (
          (membership.actor_id = $3 and membership.participant_id = $4)
          or (membership.actor_id = $5 and membership.participant_id = $6)
        )
      for update of membership
    `,
    [
      input.workspaceId,
      input.eventId,
      input.requesterActorId,
      input.requesterParticipantId,
      input.targetActorId,
      input.targetParticipantId,
    ],
  );
  const requesterRow = active.rows.find(
    (row) =>
      row.actor_id === input.requesterActorId &&
      row.participant_id === input.requesterParticipantId,
  );
  const targetRow = active.rows.find(
    (row) =>
      row.actor_id === input.targetActorId &&
      row.participant_id === input.targetParticipantId,
  );
  if (!requesterRow || !targetRow) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND",
      "Both participants must have active registrations when consent is recorded.",
    );
  }

  const publishedDirectory = await publishedDirectoryForEvent({
    eventId: input.eventId,
    executor: input.executor,
    workspaceId: input.workspaceId,
  });
  if (publishedDirectory) {
    const requester = publishedDirectory.find(
      (participant) =>
        participant.actorId === input.requesterActorId &&
        participant.participantId === input.requesterParticipantId,
    );
    const target = publishedDirectory.find(
      (participant) =>
        participant.actorId === input.targetActorId &&
        participant.participantId === input.targetParticipantId,
    );
    if (!requester || !target) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND",
        "Published contact targets must belong to the immutable published directory.",
      );
    }
    return [clone(requester), clone(target)];
  }
  return [
    jsonValue<EventOperationsParticipant>(
      requesterRow.participant_payload,
      "requester participant_payload",
    ),
    jsonValue<EventOperationsParticipant>(
      targetRow.participant_payload,
      "target participant_payload",
    ),
  ];
}

export function createPostgresOnsiteOperationsMethods({
  client,
  workspaceId,
}: EventOperationsPostgresRuntime): OnsiteOperationsMethods {
  return {
    async checkInAtomically(input: CreateEventOperationsCheckInInput) {
      const actorId = input.actorId.trim();
      const eventId = input.eventId.trim();
      const requestedParticipantId =
        input.kind === "staff" ? input.participantId.trim() : null;
      if (!actorId || !eventId) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND",
          "Event and actor identities are required for check-in.",
        );
      }
      return client.transaction(
        async (transaction) => {
          await transaction.query(
            `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
            [
              `event-onsite-checkin:${workspaceId}:${eventId}:${
                requestedParticipantId ?? actorId
              }`,
            ],
          );
          const scope = await transaction.query<SqlRow>(
            `
              select
                statement_timestamp() as db_now,
                configuration.check_in_opens_at,
                configuration.event_ends_at,
                event_row.organizer_actor_id,
                event_row.registration_migration_state
              from event_ops_events event_row
              join event_ops_configuration_heads configuration_head
                on configuration_head.workspace_id = event_row.workspace_id
                and configuration_head.event_id = event_row.event_id
              join event_ops_configurations configuration
                on configuration.workspace_id = configuration_head.workspace_id
                and configuration.event_id = configuration_head.event_id
                and configuration.configuration_version = configuration_head.configuration_version
              where event_row.workspace_id = $1 and event_row.event_id = $2
              for share of event_row, configuration_head
            `,
            [workspaceId, eventId],
          );
          const row = scope.rows[0];
          if (!row || row.registration_migration_state !== "canonical") {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_NOT_CONFIGURED",
              "Canonical event operations are not configured for check-in.",
            );
          }
          let staffAuthorization: StaffAuthorizationSnapshot | null = null;
          if (input.kind === "staff") {
            await requireEventAccessRepositoryReadiness(transaction);
            const assignment = await transaction.query<{
              revision: number | string;
              role: EventAccessRole;
              state: EventAccessAssignmentState;
            }>(
              `select revision, role, state
                 from event_ops_event_role_assignment_heads
                where workspace_id = $1
                  and event_id = $2
                  and subject_actor_id = $3
                for share`,
              [workspaceId, eventId, actorId],
            );
            const assignmentRow = assignment.rows[0] ?? null;
            const owner = row.organizer_actor_id === actorId;
            const revision = assignmentRow
              ? Number(assignmentRow.revision)
              : 0;
            const role = assignmentRow?.role ?? null;
            const state = assignmentRow?.state ?? null;
            if (
              !Number.isSafeInteger(revision) ||
              !canAccessEventCapability({
                capability: input.capability,
                owner,
                role,
                state,
              })
            ) {
              throw new EventOperationsError(
                "EVENT_OPERATIONS_FORBIDDEN",
                "Event check-in access is denied.",
              );
            }
            staffAuthorization = {
              capability: input.capability,
              kind: "staff",
              owner,
              revision,
              role,
              state,
            };
          }
          const membership = await transaction.query<SqlRow>(
            `
              select actor_id, participant_id, status
              from event_ops_membership_heads
              where workspace_id = $1 and event_id = $2
                and (
                  ($3::text is null and actor_id = $4)
                  or ($3::text is not null and participant_id = $3)
                )
              for update
            `,
            [workspaceId, eventId, requestedParticipantId, actorId],
          );
          const membershipRow = membership.rows[0];
          if (
            membershipRow?.status !== "rsvped" ||
            typeof membershipRow.participant_id !== "string"
          ) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_FORBIDDEN",
              "An active canonical registration is required for check-in.",
            );
          }
          const participantActorId = text(membershipRow, "actor_id");
          const existing = await transaction.query<SqlRow>(
            `
              select * from event_ops_checkins
              where workspace_id = $1 and event_id = $2 and actor_id = $3
            `,
            [workspaceId, eventId, participantActorId],
          );
          if (existing.rows[0]) return checkInFromRow(existing.rows[0]);
          const checkedInAt = timestamp(row, "db_now");
          if (
            Date.parse(checkedInAt) < Date.parse(timestamp(row, "check_in_opens_at")) ||
            Date.parse(checkedInAt) > Date.parse(timestamp(row, "event_ends_at"))
          ) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_CHECK_IN_CLOSED",
              "Event check-in is outside its configured time window according to the database clock.",
            );
          }
          const value: EventOperationsCheckIn = {
            actorId: participantActorId,
            checkedInAt,
            eventId,
            evidenceId: `evidence:event-check-in:${digest(
              eventId,
              participantActorId,
            )}`,
            participantId: text(membershipRow, "participant_id"),
          };
          await transaction.query(
            `
              insert into event_ops_checkins (
                workspace_id, event_id, actor_id, participant_id, evidence_id,
                checked_in_at, revision
              ) values ($1, $2, $3, $4, $5, $6, 1)
            `,
            [
              workspaceId,
              eventId,
              participantActorId,
              value.participantId,
              value.evidenceId,
              checkedInAt,
            ],
          );
          await insertOutbox({
            aggregateId: `${eventId}:${participantActorId}`,
            aggregateType: "event_checkin",
            eventId,
            eventType: "event.checkin.created",
            executor: transaction,
            outboxId: `outbox:event-checkin:${digest(
              eventId,
              participantActorId,
            )}`,
            payload: value,
            timestamp: checkedInAt,
            workspaceId,
          });
          await transaction.query(
            `
              insert into event_ops_audit_log (
                workspace_id, audit_id, event_id, actor_id, action,
                aggregate_type, aggregate_id, before_payload, after_payload,
                evidence_ids, occurred_at
              ) values (
                $1, $2, $3, $4, $5, 'event_checkin',
                $6, null, $7::jsonb, $8::text[], $9
              )
            `,
            [
              workspaceId,
              `audit:event-checkin:${digest(eventId, participantActorId)}`,
              eventId,
              actorId,
              input.kind === "staff"
                ? "event_checkin_marked_by_staff"
                : "event_checkin_created",
              `${eventId}:${participantActorId}`,
              JSON.stringify(
                staffAuthorization
                  ? { ...value, authorization: staffAuthorization }
                  : value,
              ),
              [value.evidenceId],
              checkedInAt,
            ],
          );
          return clone(value);
        },
        { isolation: "read committed" },
      );
    },

    async listLimitedCheckInRoster(
      input: ListEventOperationsLimitedCheckInRosterInput,
    ) {
      const actorId = input.actorId.trim();
      const eventId = input.eventId.trim();
      if (!actorId || !eventId) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "Event check-in roster access is denied.",
        );
      }
      return client.transaction(async (transaction) => {
        await requireEventAccessRepositoryReadiness(transaction);
        const event = await transaction.query<{
          organizer_actor_id: string;
        }>(
          `select organizer_actor_id
             from event_ops_events
            where workspace_id = $1 and event_id = $2
            for share`,
          [workspaceId, eventId],
        );
        const organizerActorId = event.rows[0]?.organizer_actor_id ?? null;
        if (!organizerActorId || event.rows.length !== 1) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_FORBIDDEN",
            "Event check-in roster access is denied.",
          );
        }
        const assignment = await transaction.query<{
          revision: number | string;
          role: EventAccessRole;
          state: EventAccessAssignmentState;
        }>(
          `select revision, role, state
             from event_ops_event_role_assignment_heads
            where workspace_id = $1
              and event_id = $2
              and subject_actor_id = $3
            for share`,
          [workspaceId, eventId, actorId],
        );
        if (assignment.rows.length > 1) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_FORBIDDEN",
            "Event check-in roster access is denied.",
          );
        }
        const assignmentRow = assignment.rows[0] ?? null;
        const owner = organizerActorId === actorId;
        const revision = assignmentRow ? Number(assignmentRow.revision) : 0;
        const role = assignmentRow?.role ?? null;
        const state = assignmentRow?.state ?? null;
        if (
          !Number.isSafeInteger(revision) ||
          (owner && assignmentRow !== null) ||
          !canAccessEventCapability({
            capability: input.capability,
            owner,
            role,
            state,
          })
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_FORBIDDEN",
            "Event check-in roster access is denied.",
          );
        }

        const result = await transaction.query<{
          checked_in_at: Date | string | null;
          display_name: string;
          participant_id: string;
        }>(
          `
            select
              membership.participant_id,
              coalesce(
                nullif(btrim(profile.profile_payload -> 'participant' ->> 'displayName'), ''),
                membership.participant_id
              ) as display_name,
              checkin.checked_in_at
            from event_ops_membership_heads membership
            join event_ops_profile_versions profile
              on profile.workspace_id = membership.workspace_id
              and profile.event_id = membership.event_id
              and profile.participant_id = membership.participant_id
              and profile.profile_version = membership.profile_version
            left join event_ops_checkins checkin
              on checkin.workspace_id = membership.workspace_id
              and checkin.event_id = membership.event_id
              and checkin.participant_id = membership.participant_id
            where membership.workspace_id = $1
              and membership.event_id = $2
              and membership.status = 'rsvped'
            order by
              lower(coalesce(
                nullif(btrim(profile.profile_payload -> 'participant' ->> 'displayName'), ''),
                membership.participant_id
              )),
              membership.participant_id
          `,
          [workspaceId, eventId],
        );
        return result.rows.map(
          (row): EventOperationsLimitedCheckInRosterItem => ({
            checkedIn: row.checked_in_at !== null,
            checkedInAt:
              row.checked_in_at === null
                ? null
                : new Date(row.checked_in_at).toISOString(),
            displayName: row.display_name,
            participantId: row.participant_id,
          }),
        );
      });
    },

    async createContactRequestAtomically(
      input: CreateEventContactRequestInput,
    ) {
      const eventId = input.eventId.trim();
      const requesterActorId = input.requesterActorId.trim();
      const targetParticipantId = input.targetParticipantId.trim();
      if (!eventId || !requesterActorId || !targetParticipantId) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "Event, requester, and target identities are required.",
        );
      }
      return client.transaction(
        async (transaction) => {
          const [observedRequester, observedTarget] =
            await currentContactParticipantIdentities({
              eventId,
              executor: transaction,
              requesterActorId,
              targetParticipantId,
              workspaceId,
            });
          const participantPairKey = digest(
            "participant-pair",
            ...[
              observedRequester.participant_id,
              observedTarget.participant_id,
            ].sort(),
          );
          const requestId = `event-contact-request:${digest(
            eventId,
            participantPairKey,
          )}`;
          await transaction.query(
            `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
            [`event-onsite-contact-request:${workspaceId}:${requestId}`],
          );
          const [requester, target] = await activeParticipantRows({
            eventId,
            executor: transaction,
            requesterActorId,
            targetParticipantId,
            workspaceId,
          });
          if (
            requester.participant_id !== observedRequester.participant_id ||
            target.participant_id !== observedTarget.participant_id
          ) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
              "Participant identities changed while the contact request was being created.",
            );
          }
          const existing = await transaction.query<SqlRow>(
            `
              select request_id, revision, status
              from event_ops_contact_requests
              where workspace_id = $1 and event_id = $2
                and participant_pair_key = $3
              for update
            `,
            [workspaceId, eventId, participantPairKey],
          );
          const clock = await transaction.query<SqlRow>(
            `select statement_timestamp() as db_now`,
          );
          const createdAt = timestamp(clock.rows[0] ?? {}, "db_now");
          const existingRequest = existing.rows[0];
          if (!existingRequest && input.expectedRevision !== null) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
              "The contact request lifecycle changed before it could be created.",
            );
          }
          if (existingRequest && text(existingRequest, "status") !== "withdrawn") {
            if (input.expectedRevision !== null && (
              text(existingRequest, "status") !== "awaiting_target_consent" ||
              positiveRevision(existingRequest) !== input.expectedRevision + 1
            )) {
              throw new EventOperationsError(
                "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
                "The contact request lifecycle changed before it could be created.",
              );
            }
            const value = await readContactRequestForViewer({
              eventId,
              executor: transaction,
              requestId: text(existingRequest, "request_id"),
              viewerActorId: requesterActorId,
              workspaceId,
            });
            if (value) return value;
            throw new EventOperationsError(
              "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
              "The existing contact request is not visible to this participant.",
            );
          }
          const persistedRequestId = existingRequest
            ? text(existingRequest, "request_id")
            : requestId;
          if (
            existingRequest &&
            input.expectedRevision !== positiveRevision(existingRequest)
          ) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
              "The contact request lifecycle changed before it could be reopened.",
            );
          }
          const creationOperationId = digest(
            persistedRequestId,
            ...(existingRequest ? [createdAt] : []),
          );
          if (existingRequest) {
            const reopened = await transaction.query(
              `
                update event_ops_contact_requests
                set requester_actor_id = $5, requester_participant_id = $6,
                  target_actor_id = $7, target_participant_id = $8,
                  status = 'awaiting_target_consent', accepted_at = null,
                  declined_at = null, withdrawn_at = null,
                  relationship_pair_id = null, revision = revision + 1,
                  created_at = $9, updated_at = $9
                where workspace_id = $1 and event_id = $2 and request_id = $3
                  and participant_pair_key = $4 and status = 'withdrawn'
                  and revision = $10
              `,
              [
                workspaceId,
                eventId,
                persistedRequestId,
                participantPairKey,
                requester.actor_id,
                requester.participant_id,
                target.actor_id,
                target.participant_id,
                createdAt,
                input.expectedRevision,
              ],
            );
            if (reopened.rowCount !== 1) {
              throw new EventOperationsError(
                "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
                "The withdrawn contact request changed before it could be reopened.",
              );
            }
          } else await transaction.query(
            `
              insert into event_ops_contact_requests (
                workspace_id, request_id, event_id, participant_pair_key,
                requester_actor_id, requester_participant_id, target_actor_id,
                target_participant_id, status, accepted_at, declined_at,
                withdrawn_at, relationship_pair_id, revision, created_at, updated_at
              ) values (
                $1, $2, $3, $4, $5, $6, $7, $8,
                'awaiting_target_consent', null, null, null, null, 1, $9, $9
              )
            `,
            [
              workspaceId,
              requestId,
              eventId,
              participantPairKey,
              requester.actor_id,
              requester.participant_id,
              target.actor_id,
              target.participant_id,
              createdAt,
            ],
          );
          const value = await readContactRequestForViewer({
            eventId,
            executor: transaction,
            requestId: persistedRequestId,
            viewerActorId: requesterActorId,
            workspaceId,
          });
          if (!value) throw new Error("Created contact request could not be read.");
          await insertOutbox({
            aggregateId: persistedRequestId,
            aggregateType: "event_contact_request",
            eventId,
            eventType: "event.contact_request.created",
            executor: transaction,
            outboxId: `outbox:event-contact-request-created:${creationOperationId}`,
            payload: {
              ...value,
              requesterActorId: requester.actor_id,
              targetActorId: target.actor_id,
            },
            timestamp: createdAt,
            workspaceId,
          });
          await transaction.query(
            `
              insert into event_ops_audit_log (
                workspace_id, audit_id, event_id, actor_id, action,
                aggregate_type, aggregate_id, before_payload, after_payload,
                evidence_ids, occurred_at
              ) values (
                $1, $2, $3, $4, 'event_contact_request_created',
                'event_contact_request', $5, null, $6::jsonb, '{}', $7
              )
            `,
            [
              workspaceId,
              `audit:event-contact-request-created:${creationOperationId}`,
              eventId,
              requesterActorId,
              persistedRequestId,
              JSON.stringify(value),
              createdAt,
            ],
          );
          return value;
        },
        { isolation: "read committed" },
      );
    },

    async listContactRequests(eventId, viewerActorId) {
      const result = await client.query<SqlRow>(
        `
          select
            request.request_id,
            request.event_id,
            request.requester_participant_id,
            request.target_participant_id,
            request.status,
            request.accepted_at,
            request.declined_at,
            request.withdrawn_at,
            request.revision,
            request.created_at,
            request.updated_at,
            viewer_side.contact_id
          from event_ops_contact_requests request
          left join event_ops_relationship_sides viewer_side
            on viewer_side.workspace_id = request.workspace_id
            and viewer_side.relationship_pair_id = request.relationship_pair_id
            and viewer_side.owner_actor_id = $3
          where request.workspace_id = $1 and request.event_id = $2
            and (
              $3::text is null
              or request.requester_actor_id = $3
              or request.target_actor_id = $3
            )
          order by request.created_at, request.request_id
        `,
        [workspaceId, eventId, viewerActorId],
      );
      return result.rows.map(contactRequestFromSafeRow);
    },

    async respondToContactRequestAtomically(
      input: RespondToEventContactRequestInput,
    ) {
      const eventId = input.eventId.trim();
      const requestId = input.requestId.trim();
      const targetActorId = input.targetActorId.trim();
      if (!eventId || !requestId || !targetActorId) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "Event, request, and target identities are required.",
        );
      }
      return client.transaction(
        async (transaction) => {
          await transaction.query(
            `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
            [`event-onsite-contact-request:${workspaceId}:${requestId}`],
          );
          const locked = await transaction.query<SqlRow>(
            `
              select request.*, statement_timestamp() as db_now
              from event_ops_contact_requests request
              where request.workspace_id = $1 and request.request_id = $2
              for update
            `,
            [workspaceId, requestId],
          );
          const request = locked.rows[0];
          if (
            !request ||
            request.event_id !== eventId ||
            request.target_actor_id !== targetActorId
          ) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_FORBIDDEN",
              "Only the target participant can respond to this business-card request.",
            );
          }
          const status = text(request, "status");
          const revision = positiveRevision(request);
          if (
            ((status === "accepted" && input.accept) ||
              (status === "declined" && !input.accept)) &&
            revision === input.expectedRevision + 1
          ) {
            const value = await readContactRequestForViewer({
              eventId,
              executor: transaction,
              requestId,
              viewerActorId: targetActorId,
              workspaceId,
            });
            if (value) return value;
            throw new Error("Final contact request could not be read.");
          }
          if (
            status !== "awaiting_target_consent" ||
            revision !== input.expectedRevision
          ) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
              "The contact request has an unsupported state.",
            );
          }
          const respondedAt = timestamp(request, "db_now");
          if (!input.accept) {
            const updated = await transaction.query(
              `
                update event_ops_contact_requests
                set status = 'declined', declined_at = $5,
                  revision = revision + 1, updated_at = $5
                where workspace_id = $1 and event_id = $2 and request_id = $3
                  and status = 'awaiting_target_consent' and revision = $4
              `,
              [workspaceId, eventId, requestId, revision, respondedAt],
            );
            if (updated.rowCount !== 1) {
              throw new EventOperationsError(
                "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
                "The contact request changed before decline could commit.",
              );
            }
            const value = await readContactRequestForViewer({
              eventId,
              executor: transaction,
              requestId,
              viewerActorId: targetActorId,
              workspaceId,
            });
            if (!value) throw new Error("Declined contact request could not be read.");
            await insertOutbox({
              aggregateId: requestId,
              aggregateType: "event_contact_request",
              eventId,
              eventType: "event.contact_request.declined",
              executor: transaction,
              outboxId: `outbox:event-contact-request-declined:${digest(requestId)}`,
              payload: {
                ...value,
                requesterActorId: text(request, "requester_actor_id"),
                targetActorId,
              },
              timestamp: respondedAt,
              workspaceId,
            });
            await transaction.query(
              `
                insert into event_ops_audit_log (
                  workspace_id, audit_id, event_id, actor_id, action,
                  aggregate_type, aggregate_id, before_payload, after_payload,
                  evidence_ids, occurred_at
                ) values (
                  $1, $2, $3, $4, 'event_contact_request_declined',
                  'event_contact_request', $5, $6::jsonb, $7::jsonb, '{}', $8
                )
              `,
              [
                workspaceId,
                `audit:event-contact-request-declined:${digest(requestId)}`,
                eventId,
                targetActorId,
                requestId,
                JSON.stringify({ status: "awaiting_target_consent", revision }),
                JSON.stringify(value),
                respondedAt,
              ],
            );
            return value;
          }

          const requesterActorId = text(request, "requester_actor_id");
          const requesterParticipantId = text(
            request,
            "requester_participant_id",
          );
          const targetParticipantId = text(request, "target_participant_id");
          const [requesterParticipant, targetParticipant] =
            await participantsForAcceptedPair({
              eventId,
              executor: transaction,
              requesterActorId,
              requesterParticipantId,
              targetActorId,
              targetParticipantId,
              workspaceId,
            });
          const participantPairKey = text(request, "participant_pair_key");
          const relationshipPairId = `event-relationship-pair:${digest(
            eventId,
            participantPairKey,
          )}`;
          await transaction.query(
            `
              insert into event_ops_relationship_pairs (
                workspace_id, relationship_pair_id, event_id, request_id,
                participant_pair_key, accepted_at, created_at
              ) values ($1, $2, $3, $4, $5, $6, $6)
            `,
            [
              workspaceId,
              relationshipPairId,
              eventId,
              requestId,
              participantPairKey,
              respondedAt,
            ],
          );

          const sides = [
            { owner: requesterParticipant, other: targetParticipant },
            { owner: targetParticipant, other: requesterParticipant },
          ] as const;
          const contactIdsByActor: Record<string, string> = {};
          const evidenceIds: string[] = [];
          for (const side of sides) {
            const evidenceId = `evidence:event-contact-consent:${digest(
              eventId,
              requestId,
              side.owner.actorId,
            )}`;
            const evidence: RelationshipEvidenceDTO = {
              confidence: 1,
              createdBy: targetActorId,
              id: evidenceId,
              occurredAt: respondedAt,
              sourceId: eventId,
              sourceType: "event_import",
              summary: `${requesterParticipant.displayName} and ${targetParticipant.displayName} mutually accepted an event business-card connection.`,
            };
            const contact = contactFor({
              evidenceId,
              eventId,
              ownerActorId: side.owner.actorId,
              participant: side.other,
              timestamp: respondedAt,
            });
            const connection = connectionFor({
              contact,
              evidenceId,
              eventId,
              ownerActorId: side.owner.actorId,
              participant: side.other,
              timestamp: respondedAt,
            });
            contactIdsByActor[side.owner.actorId] = contact.id;
            await transaction.query(
              `
                insert into event_ops_relationship_sides (
                  workspace_id, relationship_pair_id, owner_actor_id,
                  other_actor_id, contact_id, connection_id, side_payload,
                  created_at
                ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
              `,
              [
                workspaceId,
                relationshipPairId,
                side.owner.actorId,
                side.other.actorId,
                contact.id,
                connection.id,
                JSON.stringify({ connection, contact }),
                respondedAt,
              ],
            );
            await transaction.query(
              `
                insert into event_ops_relationship_evidence (
                  workspace_id, evidence_id, relationship_pair_id,
                  owner_actor_id, evidence_payload, evidence_hash, created_at
                ) values ($1, $2, $3, $4, $5::jsonb, $6, $7)
              `,
              [
                workspaceId,
                evidenceId,
                relationshipPairId,
                side.owner.actorId,
                JSON.stringify(evidence),
                payloadHash(evidence),
                respondedAt,
              ],
            );
            await insertOutbox({
              aggregateId: relationshipPairId,
              aggregateType: "event_relationship_side",
              eventId,
              eventType: "event.relationship_side.project",
              executor: transaction,
              outboxId: `outbox:event-relationship-side:${digest(
                requestId,
                side.owner.actorId,
              )}`,
              payload: {
                connection,
                contact,
                evidence,
                ownerActorId: side.owner.actorId,
                relationshipPairId,
                requestId,
              },
              timestamp: respondedAt,
              workspaceId,
            });
            evidenceIds.push(evidenceId);
          }

          const updated = await transaction.query(
            `
              update event_ops_contact_requests
              set status = 'accepted', accepted_at = $6,
                relationship_pair_id = $5, revision = revision + 1,
                updated_at = $6
              where workspace_id = $1 and event_id = $2 and request_id = $3
                and status = 'awaiting_target_consent' and revision = $4
            `,
            [
              workspaceId,
              eventId,
              requestId,
              revision,
              relationshipPairId,
              respondedAt,
            ],
          );
          if (updated.rowCount !== 1) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
              "The contact request changed before acceptance could commit.",
            );
          }
          const value = await readContactRequestForViewer({
            eventId,
            executor: transaction,
            requestId,
            viewerActorId: targetActorId,
            workspaceId,
          });
          if (!value?.contactId) {
            throw new Error("Accepted contact request has no owner contact side.");
          }
          await insertOutbox({
            aggregateId: requestId,
            aggregateType: "event_contact_request",
            eventId,
            eventType: "event.contact_request.accepted",
            executor: transaction,
            outboxId: `outbox:event-contact-request-accepted:${digest(requestId)}`,
            payload: {
              contactIdsByActor,
              relationshipPairId,
              requestId,
              requesterActorId,
              revision: revision + 1,
              status: "accepted",
              targetActorId,
              updatedAt: respondedAt,
            },
            timestamp: respondedAt,
            workspaceId,
          });
          await transaction.query(
            `
              insert into event_ops_audit_log (
                workspace_id, audit_id, event_id, actor_id, action,
                aggregate_type, aggregate_id, before_payload, after_payload,
                evidence_ids, occurred_at
              ) values (
                $1, $2, $3, $4, 'event_contact_request_accepted',
                'event_contact_request', $5, $6::jsonb, $7::jsonb,
                $8::text[], $9
              )
            `,
            [
              workspaceId,
              `audit:event-contact-request-accepted:${digest(requestId)}`,
              eventId,
              targetActorId,
              requestId,
              JSON.stringify({ status: "awaiting_target_consent", revision }),
              JSON.stringify({ relationshipPairId, status: "accepted" }),
              evidenceIds,
              respondedAt,
            ],
          );
          return value;
        },
        { isolation: "read committed" },
      );
    },

    async withdrawContactRequestAtomically(
      input: WithdrawEventContactRequestInput,
    ) {
      const eventId = input.eventId.trim();
      const requestId = input.requestId.trim();
      const requesterActorId = input.requesterActorId.trim();
      if (!eventId || !requestId || !requesterActorId) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "Event, request, and requester identities are required.",
        );
      }
      return client.transaction(
        async (transaction) => {
          await transaction.query(
            `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
            [`event-onsite-contact-request:${workspaceId}:${requestId}`],
          );
          const locked = await transaction.query<SqlRow>(
            `
              select request.*, statement_timestamp() as db_now
              from event_ops_contact_requests request
              where request.workspace_id = $1 and request.request_id = $2
              for update
            `,
            [workspaceId, requestId],
          );
          const request = locked.rows[0];
          if (
            !request ||
            request.event_id !== eventId ||
            request.requester_actor_id !== requesterActorId
          ) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_FORBIDDEN",
              "Only the requester can withdraw this business-card request.",
            );
          }
          const status = text(request, "status");
          const revision = positiveRevision(request);
          if (
            status === "withdrawn" &&
            revision === input.expectedRevision + 1
          ) {
            const value = await readContactRequestForViewer({
              eventId,
              executor: transaction,
              requestId,
              viewerActorId: requesterActorId,
              workspaceId,
            });
            if (value) return value;
            throw new Error("Withdrawn contact request could not be read.");
          }
          if (
            status !== "awaiting_target_consent" ||
            revision !== input.expectedRevision
          ) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
              "Only a pending business-card request can be withdrawn.",
            );
          }
          const withdrawnAt = timestamp(request, "db_now");
          const updated = await transaction.query(
            `
              update event_ops_contact_requests
              set status = 'withdrawn', withdrawn_at = $5,
                revision = revision + 1, updated_at = $5
              where workspace_id = $1 and event_id = $2 and request_id = $3
                and status = 'awaiting_target_consent' and revision = $4
            `,
            [workspaceId, eventId, requestId, revision, withdrawnAt],
          );
          if (updated.rowCount !== 1) {
            throw new EventOperationsError(
              "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
              "The contact request changed before withdrawal could commit.",
            );
          }
          const value = await readContactRequestForViewer({
            eventId,
            executor: transaction,
            requestId,
            viewerActorId: requesterActorId,
            workspaceId,
          });
          if (!value) throw new Error("Withdrawn contact request could not be read.");
          await insertOutbox({
            aggregateId: requestId,
            aggregateType: "event_contact_request",
            eventId,
            eventType: "event.contact_request.withdrawn",
            executor: transaction,
            outboxId: `outbox:event-contact-request-withdrawn:${digest(requestId, String(revision + 1))}`,
            payload: {
              ...value,
              requesterActorId,
              targetActorId: text(request, "target_actor_id"),
            },
            timestamp: withdrawnAt,
            workspaceId,
          });
          await transaction.query(
            `
              insert into event_ops_audit_log (
                workspace_id, audit_id, event_id, actor_id, action,
                aggregate_type, aggregate_id, before_payload, after_payload,
                evidence_ids, occurred_at
              ) values (
                $1, $2, $3, $4, 'event_contact_request_withdrawn',
                'event_contact_request', $5, $6::jsonb, $7::jsonb, '{}', $8
              )
            `,
            [
              workspaceId,
              `audit:event-contact-request-withdrawn:${digest(requestId, String(revision + 1))}`,
              eventId,
              requesterActorId,
              requestId,
              JSON.stringify({ status: "awaiting_target_consent", revision }),
              JSON.stringify(value),
              withdrawnAt,
            ],
          );
          return value;
        },
        { isolation: "read committed" },
      );
    },
  };
}

export const __eventOperationsOnsiteTestExports = {
  digest,
  payloadHash,
};
