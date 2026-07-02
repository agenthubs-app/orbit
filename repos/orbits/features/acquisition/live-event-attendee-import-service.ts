import type {
  ContactDTO,
  EventDTO,
  EventParticipantIntentDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import {
  EVENT_ATTENDEE_IMPORT_ERROR_DEFINITIONS,
  EVENT_ATTENDEE_RELATIONSHIP_STATUS_CODES,
  type EventAttendeeCheckInStatus,
  type EventAttendeeContactDraft,
  type EventAttendeeEvidence,
  type EventAttendeeEventSummary,
  type EventAttendeeImportErrorCode,
  type EventAttendeeImportFailure,
  type EventAttendeeImportInput,
  type EventAttendeeImportPayload,
  type EventAttendeeImportProvenance,
  type EventAttendeeImportResult,
  type EventAttendeeImportService,
  type EventAttendeeRecord,
  type EventAttendeeRelationshipStatus,
  type EventAttendeeRelationshipStatusCode,
  type EventAttendeeRole,
  type EventAttendeeRosterPayload,
  type EventAttendeeRosterResult,
  type EventAttendeeSourceReference,
} from "./event-attendee-contract";

export interface LiveEventAttendeeRecordDTO {
  id: string;
  eventId: string;
  personId?: string;
  contactId?: string;
  displayName: string;
  organization?: string;
  role?: string;
  status: "imported" | "reviewed" | "skipped" | string;
  source: EventDTO["source"];
  evidenceIds: readonly string[];
  createdAt: string;
  updatedAt: string;
}

export interface LiveEventAttendeeImportGraph {
  attendees: readonly LiveEventAttendeeRecordDTO[];
  contacts: readonly ContactDTO[];
  event: EventDTO;
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  intents: readonly EventParticipantIntentDTO[];
  networkPeople: readonly NetworkPersonDTO[];
}

export interface LiveEventAttendeeImportProvider {
  source: string;
  sourceLabel: string;
  readEventAttendeeGraph: (
    eventId: string,
  ) => LiveEventAttendeeImportGraph | null | Promise<LiveEventAttendeeImportGraph | null>;
}

export interface LiveEventAttendeeImportServiceOptions {
  now?: () => string;
  provider?: LiveEventAttendeeImportProvider | null;
}

const relationshipStatusFilters = new Set<EventAttendeeRelationshipStatusCode>(
  EVENT_ATTENDEE_RELATIONSHIP_STATUS_CODES,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeEventId(eventId?: string | null): string {
  return eventId?.trim() ?? "";
}

function normalizeRelationshipStatusFilter(
  value?: EventAttendeeImportInput["relationshipStatusFilter"],
): EventAttendeeRelationshipStatusCode | null {
  return value && relationshipStatusFilters.has(value as EventAttendeeRelationshipStatusCode)
    ? (value as EventAttendeeRelationshipStatusCode)
    : null;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function failure(
  code: EventAttendeeImportErrorCode,
  input: {
    collectedAt: string;
    provider?: LiveEventAttendeeImportProvider | null;
  },
): EventAttendeeImportFailure {
  const definition = EVENT_ATTENDEE_IMPORT_ERROR_DEFINITIONS[code];
  const evidenceIds = [`evidence:${code.toLowerCase()}`];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: {
        source:
          input.provider?.source ??
          "live-store:event-attendee-import:unconfigured",
        sourceLabel:
          input.provider?.sourceLabel ??
          "Unconfigured event attendee import live store",
        evidenceIds,
        collectedAt: input.collectedAt,
        privacy: "live-event-attendee-import-only",
        generationMethod: "live-store-query",
        organizerFeedRequested: false,
        bulkDatabaseImportExecuted: false,
        liveDatabaseReadExecuted: input.provider !== null && input.provider !== undefined,
        externalNetworkRequested: false,
      },
      evidenceIds,
    },
  };
}

function sourceFor(input: {
  attendeeId?: string;
  event: EventDTO;
  label: string;
}): EventAttendeeSourceReference {
  return {
    type: "event_import",
    id: input.event.source.id,
    label: input.label,
    eventId: input.event.id,
    attendeeId: input.attendeeId,
  };
}

function eventSummaryFor(
  graph: LiveEventAttendeeImportGraph,
  attendeeCount: number,
): EventAttendeeEventSummary {
  return {
    id: graph.event.id,
    name: graph.event.name,
    organizer: graph.event.source.label ?? graph.event.source.id,
    venue: graph.event.location ?? "Live event venue",
    startsAt: graph.event.startsAt,
    importStatus: attendeeCount > 0 ? "ready" : "empty",
    source: sourceFor({
      event: graph.event,
      label: graph.event.source.label ?? "Live event import",
    }),
    organizerFeedRequested: false,
    bulkDatabaseImportExecuted: false,
  };
}

function checkInStatusFor(
  attendee: LiveEventAttendeeRecordDTO,
): EventAttendeeCheckInStatus {
  if (attendee.status === "reviewed") {
    return "checked_in";
  }

  if (attendee.status === "skipped") {
    return "pending";
  }

  return "registered";
}

function eventRoleFor(attendee: LiveEventAttendeeRecordDTO): EventAttendeeRole {
  const role = attendee.role?.toLowerCase() ?? "";

  if (role.includes("organizer")) {
    return "organizer";
  }

  if (role.includes("speaker")) {
    return "speaker";
  }

  return "attendee";
}

function contactFor(input: {
  attendee: LiveEventAttendeeRecordDTO;
  contactsById: ReadonlyMap<string, ContactDTO>;
  contactsByPersonId: ReadonlyMap<string, ContactDTO>;
}): ContactDTO | null {
  if (input.attendee.contactId) {
    return input.contactsById.get(input.attendee.contactId) ?? null;
  }

  if (input.attendee.personId) {
    return input.contactsByPersonId.get(input.attendee.personId) ?? null;
  }

  return null;
}

function personFor(input: {
  attendee: LiveEventAttendeeRecordDTO;
  peopleById: ReadonlyMap<string, NetworkPersonDTO>;
}): NetworkPersonDTO | null {
  return input.attendee.personId
    ? input.peopleById.get(input.attendee.personId) ?? null
    : null;
}

function intentFor(input: {
  attendee: LiveEventAttendeeRecordDTO;
  intentsByAttendeeId: ReadonlyMap<string, EventParticipantIntentDTO>;
}): EventParticipantIntentDTO | null {
  return input.intentsByAttendeeId.get(input.attendee.id) ?? null;
}

function relationshipStatusFor(input: {
  contact: ContactDTO | null;
  intent: EventParticipantIntentDTO | null;
}): EventAttendeeRelationshipStatus {
  if (input.contact) {
    return {
      code: "known_contact",
      label: "Known contact",
      rationale: "This attendee is already connected to a source-backed contact.",
      suggestedPriority: "warm",
    };
  }

  if (input.intent && input.intent.confidence >= 0.82) {
    return {
      code: "priority_follow_up",
      label: "Priority follow-up",
      rationale: "The live participant intent has high confidence.",
      suggestedPriority: "high",
    };
  }

  if (
    !input.intent ||
    (input.intent.lookingFor.length === 0 && input.intent.canOffer.length === 0)
  ) {
    return {
      code: "needs_context",
      label: "Needs context",
      rationale: "The live attendee record needs more relationship context.",
      suggestedPriority: "review",
    };
  }

  return {
    code: "new_potential_contact",
    label: "New potential contact",
    rationale: "The attendee has source-backed live intent but is not a known contact.",
    suggestedPriority: "review",
  };
}

function relationshipContextFor(input: {
  attendee: LiveEventAttendeeRecordDTO;
  contact: ContactDTO | null;
  intent: EventParticipantIntentDTO | null;
  person: NetworkPersonDTO | null;
}): string {
  const lookingFor = input.intent?.lookingFor.join("; ");
  const canOffer = input.intent?.canOffer.join("; ");

  return [
    lookingFor ? `Looking for: ${lookingFor}.` : null,
    canOffer ? `Can offer: ${canOffer}.` : null,
    input.contact?.profileSnippet ?? input.person?.profileSnippet ?? null,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function suggestedNextActionFor(status: EventAttendeeRelationshipStatus): string {
  switch (status.code) {
    case "known_contact":
      return "Review the existing contact before staging any follow-up.";
    case "priority_follow_up":
      return "Prepare a high-priority post-event follow-up draft for review.";
    case "needs_context":
      return "Collect more event context before creating a contact draft.";
    case "new_potential_contact":
    default:
      return "Review the attendee intent before confirming a contact draft.";
  }
}

function attendeeRecordFor(input: {
  attendee: LiveEventAttendeeRecordDTO;
  contact: ContactDTO | null;
  event: EventDTO;
  intent: EventParticipantIntentDTO | null;
  person: NetworkPersonDTO | null;
}): EventAttendeeRecord {
  const relationshipStatus = relationshipStatusFor({
    contact: input.contact,
    intent: input.intent,
  });

  return {
    attendeeId: input.attendee.id,
    displayName: input.attendee.displayName,
    role: input.attendee.role ?? input.person?.role ?? input.contact?.role ?? "",
    organization:
      input.attendee.organization ??
      input.person?.organization ??
      input.contact?.organization ??
      "",
    email: input.contact?.primaryEmail ?? input.person?.primaryEmail ?? "",
    eventRole: eventRoleFor(input.attendee),
    checkInStatus: checkInStatusFor(input.attendee),
    relationshipStatus,
    relationshipContext: relationshipContextFor(input),
    suggestedNextAction: suggestedNextActionFor(relationshipStatus),
    source: sourceFor({
      attendeeId: input.attendee.id,
      event: input.event,
      label: input.attendee.source.label ?? input.attendee.displayName,
    }),
    evidenceIds: input.attendee.evidenceIds,
    existingContactId: input.contact?.id ?? null,
    importEligible: true,
    organizerFeedRequested: false,
    externalLookupExecuted: false,
    databaseWriteExecuted: false,
  };
}

function evidenceFor(input: {
  attendee: EventAttendeeRecord;
  evidenceById: ReadonlyMap<string, RelationshipEvidenceDTO>;
}): readonly EventAttendeeEvidence[] {
  return input.attendee.evidenceIds.map((evidenceId) => {
    const evidence = input.evidenceById.get(evidenceId);

    return {
      evidenceId,
      source: input.attendee.source,
      sourceLabel: evidence?.sourceId ?? input.attendee.source.label,
      excerpt:
        evidence?.summary ??
        `${input.attendee.displayName} was loaded from live attendee storage.`,
      capturedFields: ["summary", "relationshipContext"],
      createdAt: evidence?.occurredAt ?? new Date(0).toISOString(),
      createdBy: "live-event-attendee-import-service",
    };
  });
}

function contactDraftFor(input: {
  attendee: EventAttendeeRecord;
  evidenceById: ReadonlyMap<string, RelationshipEvidenceDTO>;
  provenance: EventAttendeeImportProvenance;
}): EventAttendeeContactDraft {
  return {
    id: `event-draft:live:${input.attendee.source.eventId}:${input.attendee.attendeeId}`,
    attendeeId: input.attendee.attendeeId,
    displayName: input.attendee.displayName,
    role: input.attendee.role,
    organization: input.attendee.organization,
    email: input.attendee.email,
    relationshipStatus: input.attendee.relationshipStatus,
    relationshipContext: input.attendee.relationshipContext,
    suggestedNextAction: input.attendee.suggestedNextAction,
    source: input.attendee.source,
    evidence: evidenceFor({
      attendee: input.attendee,
      evidenceById: input.evidenceById,
    }),
    provenance: input.provenance,
    readyForReview: true,
    contactWriteExecuted: false,
    bulkDatabaseImportExecuted: false,
    notificationDelivered: false,
  };
}

function payloadFor(input: {
  collectedAt: string;
  generationMethod: EventAttendeeImportProvenance["generationMethod"];
  graph: LiveEventAttendeeImportGraph;
  provider: LiveEventAttendeeImportProvider;
  relationshipStatusFilter: EventAttendeeRelationshipStatusCode | null;
}): EventAttendeeRosterPayload {
  const contactsById = new Map(input.graph.contacts.map((contact) => [contact.id, contact]));
  const contactsByPersonId = new Map(
    input.graph.contacts
      .filter((contact) => contact.personId)
      .map((contact) => [contact.personId as string, contact]),
  );
  const peopleById = new Map(input.graph.networkPeople.map((person) => [person.id, person]));
  const intentsByAttendeeId = new Map(
    input.graph.intents.map((intent) => [intent.attendeeId, intent]),
  );
  const attendees = input.graph.attendees.map((attendee) =>
    attendeeRecordFor({
      attendee,
      contact: contactFor({
        attendee,
        contactsById,
        contactsByPersonId,
      }),
      event: input.graph.event,
      intent: intentFor({
        attendee,
        intentsByAttendeeId,
      }),
      person: personFor({
        attendee,
        peopleById,
      }),
    }),
  );
  const filteredAttendees = input.relationshipStatusFilter
    ? attendees.filter(
        (attendee) =>
          attendee.relationshipStatus.code === input.relationshipStatusFilter,
      )
    : attendees;
  const evidenceIds = unique([
    ...input.graph.event.evidenceIds,
    ...filteredAttendees.flatMap((attendee) => attendee.evidenceIds),
  ]);
  const state = filteredAttendees.length > 0 ? "success" : "empty";

  return {
    state,
    event: eventSummaryFor(input.graph, filteredAttendees.length),
    attendees: filteredAttendees,
    summary:
      state === "success"
        ? `${filteredAttendees.length} live event attendee(s) were loaded from shared storage.`
        : "No live event attendees matched the request.",
    provenance: {
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      evidenceIds,
      collectedAt: input.collectedAt,
      privacy: "live-event-attendee-import-only",
      generationMethod: input.generationMethod,
      organizerFeedRequested: false,
      bulkDatabaseImportExecuted: false,
      liveDatabaseReadExecuted: true,
      externalNetworkRequested: false,
    },
    nextAction:
      state === "success"
        ? "Review live attendee relationship context before confirming contact drafts."
        : "Clear the attendee filter or verify the live attendee source.",
  };
}

function importPayloadFor(input: {
  evidenceById: ReadonlyMap<string, RelationshipEvidenceDTO>;
  roster: EventAttendeeRosterPayload;
}): EventAttendeeImportPayload {
  return {
    ...input.roster,
    contactDrafts: input.roster.attendees.map((attendee) =>
      contactDraftFor({
        attendee,
        evidenceById: input.evidenceById,
        provenance: input.roster.provenance,
      }),
    ),
  };
}

export function createLiveEventAttendeeImportService({
  now = () => new Date().toISOString(),
  provider,
}: LiveEventAttendeeImportServiceOptions = {}): EventAttendeeImportService {
  async function readRoster(
    input: EventAttendeeImportInput,
    generationMethod: EventAttendeeImportProvenance["generationMethod"],
  ): Promise<EventAttendeeRosterResult> {
    const collectedAt = now();
    const eventId = normalizeEventId(input.eventId);

    if (!eventId) {
      return failure("EVENT_ATTENDEE_EVENT_ID_REQUIRED", {
        collectedAt,
        provider,
      });
    }

    if (!provider) {
      return failure("EVENT_ATTENDEE_IMPORT_LIVE_STORE_UNCONFIGURED", {
        collectedAt,
        provider,
      });
    }

    const graph = await provider.readEventAttendeeGraph(eventId);

    if (!graph) {
      return failure("EVENT_ATTENDEE_EVENT_NOT_FOUND", {
        collectedAt,
        provider,
      });
    }

    return {
      success: true,
      data: clonePayload(
        payloadFor({
          collectedAt,
          generationMethod,
          graph,
          provider,
          relationshipStatusFilter: normalizeRelationshipStatusFilter(
            input.relationshipStatusFilter,
          ),
        }),
      ),
    };
  }

  return {
    listEventAttendees(input = {}) {
      return readRoster(input, "live-store-query");
    },

    async importEventAttendees(input = {}): Promise<EventAttendeeImportResult> {
      const roster = await readRoster(input, "live-store-draft-stage");

      if (roster.success === false) {
        return roster;
      }

      return {
        success: true,
        data: clonePayload(
          importPayloadFor({
            evidenceById: new Map(
              (await provider?.readEventAttendeeGraph(roster.data.event.id))
                ?.evidence.map((evidence) => [evidence.id, evidence]) ?? [],
            ),
            roster: roster.data,
          }),
        ),
      };
    },
  };
}
