import type { LiveDatabaseEnv } from "../../../../shared/storage/live-database-config";
import { createConfiguredPostgresLiveRecordStore } from "../../../../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../../../../shared/storage/live-record-store";
import {
  createGeneratedEventAttendeeRosterProvider,
} from "../../attendee-roster/storage/generated-attendee-roster-live-record-provider";
import type {
  EventAttendeeRosterPayload,
  EventAttendeeRosterRecord,
} from "../../attendee-roster/contract";
import type {
  EventEncounterConversationSummarySeed,
  EventEncounterEvidencePayload,
  EventEncounterEvidenceRecord,
  EventEncounterNoteEventSummary,
  EventEncounterNotePayload,
  EventEncounterNoteSourceReference,
  EventEncounterParticipant,
  EventEncounterRecord,
} from "../contract";
import {
  createEventCapabilityRecordProvider,
  EVENT_WORK_RECORD_COLLECTIONS,
  type EventCapabilityRecordProvider,
} from "../../storage/event-work-record-provider";

export interface GeneratedEventEncounterNoteProviderOptions {
  now?: () => string;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredGeneratedEventEncounterNoteProviderOptions {
  env?: LiveDatabaseEnv;
  now?: () => string;
  sourceLabel?: string;
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
}

function selectedAttendee(
  roster: EventAttendeeRosterPayload,
): EventAttendeeRosterRecord | null {
  return (
    roster.attendees.find(
      (attendee) => attendee.knownContactMarker.contactId !== null,
    ) ??
    roster.attendees[0] ??
    null
  );
}

function contactIdFor(attendee: EventAttendeeRosterRecord): string {
  return attendee.knownContactMarker.contactId ?? `contact:generated:${attendee.attendeeId}`;
}

function encounterIdFor(input: {
  contactId: string;
  eventId: string;
}): string {
  return `encounter:live:${input.eventId}:${input.contactId}`;
}

function evidenceIdFor(input: {
  contactId: string;
  eventId: string;
}): string {
  return `evidence:live-encounter:${input.eventId}:${input.contactId}`;
}

function sourceFor(input: {
  contactId?: string;
  encounterId?: string;
  eventId: string;
  label: string;
  sourceId: string;
}): EventEncounterNoteSourceReference {
  return {
    type: "event_import",
    id: input.sourceId,
    label: input.label,
    eventId: input.eventId,
    encounterId: input.encounterId,
    contactId: input.contactId,
    generatedBy: "mock-encounter-note-service",
  };
}

function eventForRoster(roster: EventAttendeeRosterPayload): EventEncounterNoteEventSummary {
  return {
    id: roster.event.id,
    name: roster.event.name,
    venue: roster.event.venue,
    startsAt: roster.event.startsAt,
    source: sourceFor({
      eventId: roster.event.id,
      label: roster.event.source.label,
      sourceId: roster.event.source.id,
    }),
    calendarProviderRequested: false,
    liveDatabaseWriteExecuted: false,
  };
}

function participantFor(input: {
  attendee: EventAttendeeRosterRecord;
  contactId: string;
  event: EventEncounterNoteEventSummary;
}): EventEncounterParticipant {
  return {
    contactId: input.contactId,
    displayName: input.attendee.displayName,
    organization: input.attendee.organization,
    role: input.attendee.role,
    eventContext: input.attendee.relationshipContext,
    source: sourceFor({
      contactId: input.contactId,
      eventId: input.event.id,
      label: input.attendee.source.label,
      sourceId: input.attendee.source.id,
    }),
    evidenceIds: input.attendee.evidenceIds,
    externalLookupExecuted: false,
    notificationDelivered: false,
  };
}

function encounterFor(input: {
  contactId: string;
  event: EventEncounterNoteEventSummary;
  evidenceId: string;
  now: string;
}): EventEncounterRecord {
  const encounterId = encounterIdFor({
    contactId: input.contactId,
    eventId: input.event.id,
  });

  return {
    encounterId,
    eventId: input.event.id,
    contactId: input.contactId,
    capturedAt: input.now,
    captureMode: "typed_note_with_voice_placeholder",
    locationHint: input.event.venue,
    source: sourceFor({
      contactId: input.contactId,
      encounterId,
      eventId: input.event.id,
      label: "Generated live encounter note",
      sourceId: input.event.source.id,
    }),
    evidenceIds: [input.evidenceId],
    audioUploadRequested: false,
    liveNoteStorageExecuted: false,
  };
}

function summarySeedFor(input: {
  contactId: string;
  encounterId: string;
  event: EventEncounterNoteEventSummary;
  participant: EventEncounterParticipant;
}): EventEncounterConversationSummarySeed {
  return {
    seedId: `summary-seed:live:${input.event.id}:${input.contactId}`,
    encounterId: input.encounterId,
    contactId: input.contactId,
    promptContext: input.participant.eventContext,
    sourceExcerpt: input.participant.eventContext,
    suggestedSummary: `${input.participant.displayName} discussed ${input.participant.eventContext}`,
    generatedBy: "mock-encounter-note-rules",
    source: input.participant.source,
    evidenceIds: input.participant.evidenceIds,
    aiProviderRequested: false,
    modelProviderRequested: false,
  };
}

function evidenceDraftFor(input: {
  contactId: string;
  encounterId: string;
  event: EventEncounterNoteEventSummary;
  evidenceId: string;
  participant: EventEncounterParticipant;
  now: string;
}): EventEncounterEvidenceRecord {
  return {
    evidenceId: input.evidenceId,
    kind: "encounter_note",
    eventId: input.event.id,
    encounterId: input.encounterId,
    contactId: input.contactId,
    source: input.participant.source,
    sourceLabel: input.participant.source.label,
    excerpt: input.participant.eventContext,
    capturedFields: ["noteText", "eventContext", "participant"],
    createdAt: input.now,
    createdBy: "mock-encounter-note-service",
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
  };
}

function payloadFor(input: {
  collectedAt: string;
  providerSource: string;
  providerSourceLabel: string;
  roster: EventAttendeeRosterPayload;
}): EventEncounterNotePayload {
  const event = eventForRoster(input.roster);
  const attendee = selectedAttendee(input.roster);
  const contactId = attendee ? contactIdFor(attendee) : "contact:generated:unknown";
  const encounterId = encounterIdFor({
    contactId,
    eventId: event.id,
  });
  const evidenceId = evidenceIdFor({
    contactId,
    eventId: event.id,
  });
  const participant = attendee
    ? participantFor({
        attendee,
        contactId,
        event,
      })
    : null;
  const encounter = encounterFor({
    contactId,
    event,
    evidenceId,
    now: input.collectedAt,
  });
  const evidenceIds = uniqueStrings([
    ...input.roster.provenance.evidenceIds,
    ...(participant?.evidenceIds ?? []),
    evidenceId,
  ]);

  return {
    state: "empty",
    event,
    participant,
    encounter,
    note: null,
    voiceNote: null,
    conversationSummarySeed: participant
      ? summarySeedFor({
          contactId,
          encounterId,
          event,
          participant,
        })
      : null,
    evidenceDraft: participant
      ? evidenceDraftFor({
          contactId,
          encounterId,
          event,
          evidenceId,
          participant,
          now: input.collectedAt,
        })
      : null,
    summary:
      "Generated live attendee context is ready for operator encounter note capture.",
    provenance: {
      source: input.providerSource,
      sourceLabel: input.providerSourceLabel,
      evidenceIds,
      collectedAt: input.collectedAt,
      privacy: "demo-event-encounter-note-only",
      generationMethod: "live-store-query",
      speechToTextRequested: false,
      audioUploadRequested: false,
      liveNoteStorageExecuted: false,
      liveDatabaseWriteExecuted: false,
      externalNetworkRequested: false,
      deviceMicrophoneRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
      aiProviderRequested: false,
    },
    nextAction:
      "Capture a typed encounter note before converting it into relationship evidence.",
  };
}

export function createGeneratedEventEncounterNoteProvider({
  now = () => new Date().toISOString(),
  source,
  sourceLabel = "Generated event encounter note shared live storage",
  store,
  workspaceId,
}: GeneratedEventEncounterNoteProviderOptions): EventCapabilityRecordProvider<
  EventEncounterNotePayload | EventEncounterEvidencePayload
> {
  const providerSource = source ?? `live-record-store:event-encounter-note:${workspaceId}`;
  const workRecordProvider = createEventCapabilityRecordProvider<
    EventEncounterNotePayload | EventEncounterEvidencePayload
  >({
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.encounterNotes,
    now,
    source: providerSource,
    sourceLabel,
    store,
    workspaceId,
  });
  const attendeeRosterProvider = createGeneratedEventAttendeeRosterProvider({
    now,
    store,
    workspaceId,
  });

  return {
    source: providerSource,
    sourceLabel,
    async getPayload(eventId) {
      const storedPayload = await workRecordProvider.getPayload(eventId);

      if (storedPayload) {
        return clonePayload(storedPayload);
      }

      const roster = await attendeeRosterProvider.getPayload(eventId);

      if (!roster) {
        return null;
      }

      return clonePayload(
        payloadFor({
          collectedAt: now(),
          providerSource,
          providerSourceLabel: sourceLabel,
          roster,
        }),
      );
    },
    upsertPayload: workRecordProvider.upsertPayload,
  };
}

export function createConfiguredGeneratedEventEncounterNoteProvider({
  env,
  now,
  sourceLabel = "Generated event encounter note Postgres live storage",
}: ConfiguredGeneratedEventEncounterNoteProviderOptions = {}): EventCapabilityRecordProvider<
  EventEncounterNotePayload | EventEncounterEvidencePayload
> | null {
  const configured = createConfiguredPostgresLiveRecordStore<
    Record<string, unknown>
  >({ env });

  if (!configured) {
    return null;
  }

  return createGeneratedEventEncounterNoteProvider({
    now,
    source: `postgres-live-record-store:event-encounter-note:${configured.workspaceId}`,
    sourceLabel,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
}
