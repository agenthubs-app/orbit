import type {
  AttendeePostEventAiArtifactReader,
  AttendeePostEventAiArtifactView,
} from "../post-event-artifact/contract";
import type { EventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";
import type {
  EventAnalyticsAppointmentCounts,
  EventAnalyticsAttendeeGrouping,
  EventAnalyticsAttendeeReport,
  EventAnalyticsContactRequestCounts,
  EventAnalyticsEncounterAggregate,
  EventAnalyticsOrganizerAggregate,
  EventAnalyticsReadModel,
} from "./contract";

type Row = Record<string, unknown>;

export type EventAnalyticsReadModelErrorCode =
  | "EVENT_ANALYTICS_ACTIVE_REGISTRATION_REQUIRED"
  | "EVENT_ANALYTICS_INVALID_SCOPE";

export class EventAnalyticsReadModelError extends Error {
  constructor(readonly code: EventAnalyticsReadModelErrorCode) {
    super(
      code === "EVENT_ANALYTICS_ACTIVE_REGISTRATION_REQUIRED"
        ? "An active registration is required for this attendee report."
        : "The event analytics read scope is invalid.",
    );
    this.name = "EventAnalyticsReadModelError";
  }
}

function requiredScope(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512) {
    throw new EventAnalyticsReadModelError("EVENT_ANALYTICS_INVALID_SCOPE");
  }
  return normalized;
}

function nonNegativeInteger(row: Row, field: string): number {
  const parsed = Number(row[field]);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Event analytics SQL row has an invalid ${field}.`);
  }
  return parsed;
}

function optionalTimestamp(row: Row, field: string): string | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Event analytics SQL row has an invalid ${field}.`);
  }
  return new Date(parsed).toISOString();
}

function contactRequestCounts(row: Row): EventAnalyticsContactRequestCounts {
  return {
    accepted: nonNegativeInteger(row, "contacts_accepted"),
    awaitingTargetConsent: nonNegativeInteger(
      row,
      "contacts_awaiting_target_consent",
    ),
    declined: nonNegativeInteger(row, "contacts_declined"),
    withdrawn: nonNegativeInteger(row, "contacts_withdrawn"),
  };
}

function appointmentCounts(row: Row): EventAnalyticsAppointmentCounts {
  return {
    awaitingResponse: nonNegativeInteger(row, "appointments_awaiting_response"),
    cancelled: nonNegativeInteger(row, "appointments_cancelled"),
    completed: nonNegativeInteger(row, "appointments_completed"),
    confirmed: nonNegativeInteger(row, "appointments_confirmed"),
    draft: nonNegativeInteger(row, "appointments_draft"),
    negotiating: nonNegativeInteger(row, "appointments_negotiating"),
    reschedulePending: nonNegativeInteger(
      row,
      "appointments_reschedule_pending",
    ),
  };
}

function encounterAggregate(row: Row): EventAnalyticsEncounterAggregate {
  return {
    captured: nonNegativeInteger(row, "encounters_captured"),
    projected: nonNegativeInteger(row, "encounters_projected"),
  };
}

function emptyArtifact(eventId: string): AttendeePostEventAiArtifactView {
  return {
    artifact: null,
    eventId,
    failureCode: null,
    status: "unconfigured",
    updatedAt: null,
  };
}

interface PublishedGroupingTable {
  memberParticipantIds: readonly string[];
  tableNumber: number;
}

interface PublishedGroupingSnapshot {
  resultsAvailableAt: number;
  roundOne: readonly PublishedGroupingTable[];
  roundTwo: readonly PublishedGroupingTable[];
}

function invalidPublishedGrouping(): never {
  throw new Error("Event analytics published grouping snapshot is invalid.");
}

function jsonObject(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidPublishedGrouping();
  }
  return value as Row;
}

function jsonArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return invalidPublishedGrouping();
  return value;
}

function nonEmptyJsonString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return invalidPublishedGrouping();
  }
  return value;
}

function positiveJsonInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return invalidPublishedGrouping();
  }
  return value;
}

function timestampMilliseconds(value: unknown): number {
  const timestamp = nonEmptyJsonString(value);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return invalidPublishedGrouping();
  return parsed;
}

function publishedRound(value: unknown): readonly PublishedGroupingTable[] {
  const tableNumbers = new Set<number>();
  const participantIds = new Set<string>();

  return jsonArray(value).map((tableValue) => {
    const table = jsonObject(tableValue);
    const tableNumber = positiveJsonInteger(table.tableNumber);
    if (tableNumbers.has(tableNumber)) return invalidPublishedGrouping();
    tableNumbers.add(tableNumber);

    const seats = new Set<string>();
    const memberParticipantIds = jsonArray(table.members);
    if (memberParticipantIds.length === 0) return invalidPublishedGrouping();

    const members = memberParticipantIds.map((memberValue) => {
      const member = jsonObject(memberValue);
      const participantId = nonEmptyJsonString(member.participantId);
      const seat = nonEmptyJsonString(member.seat);
      if (participantIds.has(participantId) || seats.has(seat)) {
        return invalidPublishedGrouping();
      }
      participantIds.add(participantId);
      seats.add(seat);
      return participantId;
    });

    return { memberParticipantIds: members, tableNumber };
  });
}

function publishedGroupingFromRow(
  row: Row,
  eventId: string,
): PublishedGroupingSnapshot | null {
  if (row.grouping_generation_id === null || row.grouping_generation_id === undefined) {
    if (
      row.grouping_snapshot !== null &&
      row.grouping_snapshot !== undefined
    ) {
      return invalidPublishedGrouping();
    }
    return null;
  }

  const generationId = nonEmptyJsonString(row.grouping_generation_id);
  if (
    nonEmptyJsonString(row.grouping_event_id) !== eventId ||
    nonEmptyJsonString(row.grouping_published_generation_id) !== generationId
  ) {
    return invalidPublishedGrouping();
  }

  const grouping = jsonObject(row.grouping_snapshot);
  const roundOne = publishedRound(grouping.roundOne);
  const roundTwo = publishedRound(grouping.roundTwo);
  const roundOneParticipants = new Set(
    roundOne.flatMap((table) => table.memberParticipantIds),
  );
  const roundTwoParticipants = new Set(
    roundTwo.flatMap((table) => table.memberParticipantIds),
  );
  if (
    roundOneParticipants.size !== roundTwoParticipants.size ||
    [...roundOneParticipants].some(
      (participantId) => !roundTwoParticipants.has(participantId),
    )
  ) {
    return invalidPublishedGrouping();
  }
  return {
    resultsAvailableAt: timestampMilliseconds(row.grouping_results_available_at),
    roundOne,
    roundTwo,
  };
}

function groupingAggregateFromRow(
  row: Row,
  eventId: string,
): EventAnalyticsOrganizerAggregate["grouping"] {
  const published = publishedGroupingFromRow(row, eventId);
  if (!published) {
    return {
      published: false,
      roundOne: { assignedParticipants: 0, tables: 0 },
      roundTwo: { assignedParticipants: 0, tables: 0 },
    };
  }
  return {
    published: true,
    roundOne: {
      assignedParticipants: published.roundOne.reduce(
        (total, table) => total + table.memberParticipantIds.length,
        0,
      ),
      tables: published.roundOne.length,
    },
    roundTwo: {
      assignedParticipants: published.roundTwo.reduce(
        (total, table) => total + table.memberParticipantIds.length,
        0,
      ),
      tables: published.roundTwo.length,
    },
  };
}

function attendeeGroupingFromRow(
  row: Row,
  eventId: string,
  participantId: string,
): EventAnalyticsAttendeeGrouping {
  const published = publishedGroupingFromRow(row, eventId);
  if (!published) {
    return {
      roundOneTableNumber: null,
      roundTwoTableNumber: null,
      status: "not_published",
    };
  }

  const statementTimestamp = optionalTimestamp(
    row,
    "grouping_statement_timestamp",
  );
  if (!statementTimestamp) return invalidPublishedGrouping();
  if (published.resultsAvailableAt > Date.parse(statementTimestamp)) {
    return {
      roundOneTableNumber: null,
      roundTwoTableNumber: null,
      status: "locked",
    };
  }
  const tableFor = (round: readonly PublishedGroupingTable[]) =>
    round.find((table) => table.memberParticipantIds.includes(participantId))
      ?.tableNumber ?? null;

  return {
    roundOneTableNumber: tableFor(published.roundOne),
    roundTwoTableNumber: tableFor(published.roundTwo),
    status: "available",
  };
}

const ORGANIZER_AGGREGATE_SQL = `
  with published_grouping as (
    select
      publication.generation_id as grouping_generation_id,
      publication.published_dto ->> 'eventId' as grouping_event_id,
      publication.published_dto ->> 'generationId'
        as grouping_published_generation_id,
      publication.published_dto -> 'grouping' as grouping_snapshot,
      publication.published_dto ->> 'resultsAvailableAt'
        as grouping_results_available_at
    from event_ops_publication_heads head
    join event_ops_publications publication
      on publication.workspace_id = head.workspace_id
      and publication.publication_id = head.publication_id
    where head.workspace_id = $1 and head.event_id = $2
  )
  select
    (
      select count(*)
      from event_ops_membership_heads membership
      where membership.workspace_id = $1
        and membership.event_id = $2
        and membership.status = 'rsvped'
    )::text as registrations_active,
    (
      select count(*)
      from event_ops_membership_heads membership
      where membership.workspace_id = $1
        and membership.event_id = $2
        and membership.status = 'cancelled'
    )::text as registrations_cancelled,
    (
      select count(*)
      from event_ops_checkins check_in
      where check_in.workspace_id = $1 and check_in.event_id = $2
    )::text as checkins_checked_in,
    (
      select count(*)
      from event_ops_contact_requests request
      where request.workspace_id = $1
        and request.event_id = $2
        and request.status = 'awaiting_target_consent'
    )::text as contacts_awaiting_target_consent,
    (
      select count(*)
      from event_ops_contact_requests request
      where request.workspace_id = $1
        and request.event_id = $2
        and request.status = 'accepted'
    )::text as contacts_accepted,
    (
      select count(*)
      from event_ops_contact_requests request
      where request.workspace_id = $1
        and request.event_id = $2
        and request.status = 'declined'
    )::text as contacts_declined,
    (
      select count(*)
      from event_ops_contact_requests request
      where request.workspace_id = $1
        and request.event_id = $2
        and request.status = 'withdrawn'
    )::text as contacts_withdrawn,
    (
      select grouping_generation_id from published_grouping
    ) as grouping_generation_id,
    (
      select grouping_event_id from published_grouping
    ) as grouping_event_id,
    (
      select grouping_published_generation_id from published_grouping
    ) as grouping_published_generation_id,
    (
      select grouping_snapshot from published_grouping
    ) as grouping_snapshot,
    (
      select grouping_results_available_at from published_grouping
    ) as grouping_results_available_at,
    (
      select count(*)
      from orbit_records encounter
      where encounter.workspace_id = $1
        and encounter.collection_name = 'human_encounters'
        and encounter.lifecycle_state = 'active'
        and encounter.payload ->> 'eventId' = $2
    )::text as encounters_captured,
    (
      select count(*)
      from orbit_records encounter
      where encounter.workspace_id = $1
        and encounter.collection_name = 'human_encounters'
        and encounter.lifecycle_state = 'active'
        and encounter.payload ->> 'eventId' = $2
        and encounter.payload #>> '{projection,status}' = 'completed'
    )::text as encounters_projected,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and appointment.status = 'draft'
    )::text as appointments_draft,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and appointment.status = 'awaiting_response'
    )::text as appointments_awaiting_response,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and appointment.status = 'negotiating'
    )::text as appointments_negotiating,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and appointment.status = 'confirmed'
    )::text as appointments_confirmed,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and appointment.status = 'reschedule_pending'
    )::text as appointments_reschedule_pending,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and appointment.status = 'cancelled'
    )::text as appointments_cancelled,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and appointment.status = 'completed'
    )::text as appointments_completed
`;

const ACTIVE_PARTICIPANT_SQL = `
  select participant_id
  from event_ops_membership_heads
  where workspace_id = $1
    and event_id = $2
    and actor_id = $3
    and status = 'rsvped'
`;

const ATTENDEE_EVIDENCE_SQL = `
  select
    (
      select checked_in_at
      from event_ops_checkins check_in
      where check_in.workspace_id = $1
        and check_in.event_id = $2
        and check_in.actor_id = $3
      limit 1
    ) as checked_in_at,
    (
      select count(*)
      from event_ops_contact_requests request
      where request.workspace_id = $1
        and request.event_id = $2
        and (request.requester_actor_id = $3 or request.target_actor_id = $3)
        and request.status = 'awaiting_target_consent'
    )::text as contacts_awaiting_target_consent,
    (
      select count(*)
      from event_ops_contact_requests request
      where request.workspace_id = $1
        and request.event_id = $2
        and (request.requester_actor_id = $3 or request.target_actor_id = $3)
        and request.status = 'accepted'
    )::text as contacts_accepted,
    (
      select count(*)
      from event_ops_contact_requests request
      where request.workspace_id = $1
        and request.event_id = $2
        and (request.requester_actor_id = $3 or request.target_actor_id = $3)
        and request.status = 'declined'
    )::text as contacts_declined,
    (
      select count(*)
      from event_ops_contact_requests request
      where request.workspace_id = $1
        and request.event_id = $2
        and (request.requester_actor_id = $3 or request.target_actor_id = $3)
        and request.status = 'withdrawn'
    )::text as contacts_withdrawn,
    (
      select count(*)
      from orbit_records encounter
      where encounter.workspace_id = $1
        and encounter.collection_name = 'human_encounters'
        and encounter.lifecycle_state = 'active'
        and encounter.user_id = $3
        and encounter.payload ->> 'eventId' = $2
        and encounter.payload ->> 'actorId' = $3
    )::text as encounters_captured,
    (
      select count(*)
      from orbit_records encounter
      where encounter.workspace_id = $1
        and encounter.collection_name = 'human_encounters'
        and encounter.lifecycle_state = 'active'
        and encounter.user_id = $3
        and encounter.payload ->> 'eventId' = $2
        and encounter.payload ->> 'actorId' = $3
        and encounter.payload #>> '{projection,status}' = 'completed'
    )::text as encounters_projected,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and (appointment.owner_actor_id = $3 or appointment.invitee_actor_id = $3)
        and appointment.status = 'draft'
    )::text as appointments_draft,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and (appointment.owner_actor_id = $3 or appointment.invitee_actor_id = $3)
        and appointment.status = 'awaiting_response'
    )::text as appointments_awaiting_response,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and (appointment.owner_actor_id = $3 or appointment.invitee_actor_id = $3)
        and appointment.status = 'negotiating'
    )::text as appointments_negotiating,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and (appointment.owner_actor_id = $3 or appointment.invitee_actor_id = $3)
        and appointment.status = 'confirmed'
    )::text as appointments_confirmed,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and (appointment.owner_actor_id = $3 or appointment.invitee_actor_id = $3)
        and appointment.status = 'reschedule_pending'
    )::text as appointments_reschedule_pending,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and (appointment.owner_actor_id = $3 or appointment.invitee_actor_id = $3)
        and appointment.status = 'cancelled'
    )::text as appointments_cancelled,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and (appointment.owner_actor_id = $3 or appointment.invitee_actor_id = $3)
        and appointment.status = 'completed'
    )::text as appointments_completed
`;

const ATTENDEE_GROUPING_SQL = `
  select
    publication.generation_id as grouping_generation_id,
    publication.published_dto ->> 'eventId' as grouping_event_id,
    publication.published_dto ->> 'generationId'
      as grouping_published_generation_id,
    publication.published_dto -> 'grouping' as grouping_snapshot,
    publication.published_dto ->> 'resultsAvailableAt'
      as grouping_results_available_at,
    statement_timestamp() as grouping_statement_timestamp
  from (values (1)) as scope(value)
  left join event_ops_publication_heads head
    on head.workspace_id = $1 and head.event_id = $2
  left join event_ops_publications publication
    on publication.workspace_id = head.workspace_id
    and publication.publication_id = head.publication_id
`;

export function createEventAnalyticsReadModel(input: {
  artifactReader?: AttendeePostEventAiArtifactReader | null;
  runtime: EventOperationsPostgresRuntime;
}): EventAnalyticsReadModel {
  const artifactReader = input.artifactReader ?? null;

  return {
    async readOrganizerAggregate({ eventId: requestedEventId }) {
      const eventId = requiredScope(requestedEventId, "eventId");
      const result = await input.runtime.client.query<Row>(
        ORGANIZER_AGGREGATE_SQL,
        [input.runtime.workspaceId, eventId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Event analytics aggregate query returned no row.");

      return {
        appointments: appointmentCounts(row),
        checkIns: {
          checkedIn: nonNegativeInteger(row, "checkins_checked_in"),
        },
        contactRequests: contactRequestCounts(row),
        encounters: encounterAggregate(row),
        eventId,
        grouping: groupingAggregateFromRow(row, eventId),
        kind: "organizer_aggregate" as const,
        registrations: {
          active: nonNegativeInteger(row, "registrations_active"),
          cancelled: nonNegativeInteger(row, "registrations_cancelled"),
        },
      };
    },

    async readAttendeeReport({ actorId: requestedActorId, eventId: requestedEventId }) {
      const actorId = requiredScope(requestedActorId, "actorId");
      const eventId = requiredScope(requestedEventId, "eventId");
      const core = await input.runtime.client.transaction(async (transaction) => {
        const membership = await transaction.query<Row>(ACTIVE_PARTICIPANT_SQL, [
          input.runtime.workspaceId,
          eventId,
          actorId,
        ]);
        const participantId = membership.rows[0]?.participant_id;
        if (typeof participantId !== "string" || !participantId) {
          throw new EventAnalyticsReadModelError(
            "EVENT_ANALYTICS_ACTIVE_REGISTRATION_REQUIRED",
          );
        }
        if (membership.rows.length !== 1) {
          throw new Error("Event analytics active registration lookup is ambiguous.");
        }

        const [evidenceResult, groupingResult] = await Promise.all([
          transaction.query<Row>(ATTENDEE_EVIDENCE_SQL, [
            input.runtime.workspaceId,
            eventId,
            actorId,
          ]),
          transaction.query<Row>(ATTENDEE_GROUPING_SQL, [
            input.runtime.workspaceId,
            eventId,
          ]),
        ]);
        const evidence = evidenceResult.rows[0];
        const grouping = groupingResult.rows[0];
        if (!evidence || !grouping) {
          throw new Error("Event analytics attendee query returned no row.");
        }
        return {
          appointments: appointmentCounts(evidence),
          checkIn: {
            checkedInAt: optionalTimestamp(evidence, "checked_in_at"),
            status: evidence.checked_in_at ? "checked_in" as const : "not_checked_in" as const,
          },
          contactRequests: contactRequestCounts(evidence),
          encounters: encounterAggregate(evidence),
          grouping: attendeeGroupingFromRow(grouping, eventId, participantId),
        };
      }, { isolation: "repeatable read" });

      // This is intentionally a reader-only lookup. A missing reader or
      // record is explicit "unconfigured"; a reader failure is not hidden by
      // an invented artifact or provider-based fallback.
      const aiArtifact = artifactReader
        ? await artifactReader.read({ attendeeActorId: actorId, eventId })
        : emptyArtifact(eventId);

      return {
        aiArtifact,
        ...core,
        eventId,
        kind: "attendee_report" as const,
        registration: { status: "active" as const },
      };
    },
  };
}
