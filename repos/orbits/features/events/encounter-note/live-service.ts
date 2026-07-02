import {
  EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS,
  type EventEncounterEvidencePayload,
  type EventEncounterEvidenceResult,
  type EventEncounterNoteErrorCode,
  type EventEncounterNoteFailure,
  type EventEncounterNoteInput,
  type EventEncounterNotePayload,
  type EventEncounterNoteResult,
  type EventEncounterNoteService,
  type EventEncounterTypedNote,
} from "./contract";
import type { EventCapabilityRecordProvider } from "../storage/event-work-record-provider";

export interface LiveEventEncounterNoteServiceOptions {
  now?: () => string;
  provider?:
    | EventCapabilityRecordProvider<
        EventEncounterNotePayload | EventEncounterEvidencePayload
      >
    | null;
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeEventId(eventId?: string | null): string {
  return eventId?.trim() ?? "";
}

function failure(
  code: EventEncounterNoteErrorCode,
  input: {
    collectedAt: string;
    provider?: EventCapabilityRecordProvider<object> | null;
  },
): EventEncounterNoteFailure {
  const definition = EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS[code];
  const evidenceIds = [`evidence:${code.toLowerCase()}`];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: {
        source: input.provider?.source ?? "live-store:encounter-note:unconfigured",
        sourceLabel:
          input.provider?.sourceLabel ?? "Unconfigured encounter note store",
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
      evidenceIds,
    },
  };
}

function isNotePayload(
  payload: EventEncounterNotePayload | EventEncounterEvidencePayload,
): payload is EventEncounterNotePayload {
  return "participant" in payload;
}

function noteFor(input: {
  baseNote: EventEncounterTypedNote | null;
  contactId: string;
  eventId: string;
  noteText: string;
  now: string;
}): EventEncounterTypedNote {
  return {
    ...(input.baseNote ?? {
      noteId: `note:live:${input.eventId}:${input.contactId}`,
      encounterId: `encounter:live:${input.eventId}:${input.contactId}`,
      kind: "typed_note" as const,
      createdBy: "mock-encounter-note-service" as const,
      source: {
        type: "event_import" as const,
        id: `source:live-encounter:${input.eventId}:${input.contactId}`,
        label: "live encounter note",
        eventId: input.eventId,
        encounterId: `encounter:live:${input.eventId}:${input.contactId}`,
        contactId: input.contactId,
        generatedBy: "mock-encounter-note-service" as const,
      },
      evidenceIds: [`evidence:live-encounter:${input.eventId}:${input.contactId}`],
      speechToTextRequested: false,
      liveNoteStorageExecuted: true,
    }),
    text: input.noteText,
    capturedAt: input.now,
    liveNoteStorageExecuted: true,
  };
}

function withCapturedNote(
  payload: EventEncounterNotePayload,
  input: {
    contactId: string;
    noteText: string;
    now: string;
    provider: EventCapabilityRecordProvider<object>;
  },
): EventEncounterNotePayload {
  const note = noteFor({
    baseNote: payload.note,
    contactId: input.contactId,
    eventId: payload.event.id,
    noteText: input.noteText,
    now: input.now,
  });
  const encounterId =
    payload.encounter?.encounterId ?? note.encounterId;
  const evidenceId =
    payload.evidenceDraft?.evidenceId ??
    note.evidenceIds[0] ??
    `evidence:live-encounter:${payload.event.id}:${input.contactId}`;

  return {
    ...payload,
    state: "success",
    event: {
      ...payload.event,
      liveDatabaseWriteExecuted: true,
    },
    participant: payload.participant
      ? {
          ...payload.participant,
          contactId: input.contactId,
        }
      : null,
    encounter: {
      ...(payload.encounter ?? {
        encounterId,
        eventId: payload.event.id,
        captureMode: "typed_note_with_voice_placeholder" as const,
        locationHint: "Live event note",
        source: note.source,
        evidenceIds: [evidenceId],
        audioUploadRequested: false,
        liveNoteStorageExecuted: true,
      }),
      contactId: input.contactId,
      capturedAt: input.now,
      liveNoteStorageExecuted: true,
    },
    note,
    evidenceDraft: payload.evidenceDraft
      ? {
          ...payload.evidenceDraft,
          eventId: payload.event.id,
          encounterId,
          contactId: input.contactId,
          excerpt: input.noteText,
          createdAt: input.now,
          liveDatabaseWriteExecuted: true,
        }
      : null,
    summary: "Live storage captured an event encounter note.",
    provenance: {
      ...payload.provenance,
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      collectedAt: input.now,
      generationMethod: "live-store-note-capture",
      liveNoteStorageExecuted: true,
      liveDatabaseWriteExecuted: true,
    },
    nextAction:
      "Review the live encounter note before using it as relationship evidence.",
  };
}

export function createLiveEventEncounterNoteService({
  now = () => new Date().toISOString(),
  provider,
}: LiveEventEncounterNoteServiceOptions = {}): EventEncounterNoteService {
  async function loadNote(
    eventId: string,
  ): Promise<EventEncounterNotePayload | null> {
    const payload = provider ? await provider.getPayload(eventId) : null;

    return payload && isNotePayload(payload) ? payload : null;
  }

  return {
    async createEncounterNote(input = {}): Promise<EventEncounterNoteResult> {
      const collectedAt = now();
      const eventId = normalizeEventId(input.eventId);
      const contactId = input.contactId?.trim() ?? "";
      const noteText = input.noteText?.trim() ?? "";

      if (!eventId) {
        return failure("EVENT_ENCOUNTER_NOTE_EVENT_ID_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (!provider) {
        return failure("EVENT_ENCOUNTER_NOTE_LIVE_STORE_UNCONFIGURED", {
          collectedAt,
          provider,
        });
      }

      const payload = await loadNote(eventId);

      if (!payload) {
        return failure("EVENT_ENCOUNTER_NOTE_EVENT_NOT_FOUND", {
          collectedAt,
          provider,
        });
      }

      if (!noteText) {
        return {
          success: true,
          data: clonePayload(payload),
        };
      }

      const data = withCapturedNote(payload, {
        contactId: contactId || payload.participant?.contactId || "contact:unknown",
        noteText,
        now: collectedAt,
        provider,
      });

      await provider.upsertPayload(eventId, data, {
        evidenceIds: data.provenance.evidenceIds,
      });

      return {
        success: true,
        data: clonePayload(data),
      };
    },
    async createEncounterEvidence(input = {}): Promise<EventEncounterEvidenceResult> {
      const collectedAt = now();
      const eventId = normalizeEventId(input.eventId);
      const encounterId = input.encounterId?.trim() ?? "";

      if (!eventId) {
        return failure("EVENT_ENCOUNTER_NOTE_EVENT_ID_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (!encounterId) {
        return failure("EVENT_ENCOUNTER_NOTE_ENCOUNTER_ID_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (!provider) {
        return failure("EVENT_ENCOUNTER_NOTE_LIVE_STORE_UNCONFIGURED", {
          collectedAt,
          provider,
        });
      }

      const payload = await loadNote(eventId);

      if (!payload || !payload.evidenceDraft) {
        return failure("EVENT_ENCOUNTER_NOTE_EVENT_NOT_FOUND", {
          collectedAt,
          provider,
        });
      }

      const data: EventEncounterEvidencePayload = {
        state: "success",
        event: payload.event,
        eventId,
        encounterId,
        evidence: {
          ...payload.evidenceDraft,
          encounterId,
          liveDatabaseWriteExecuted: true,
        },
        summary: "Live storage created encounter evidence from the note.",
        provenance: {
          ...payload.provenance,
          source: provider.source,
          sourceLabel: provider.sourceLabel,
          collectedAt,
          generationMethod: "live-store-evidence",
          liveDatabaseWriteExecuted: true,
        },
        nextAction:
          "Attach the live encounter evidence to the relationship before drafting follow-up.",
      };

      return {
        success: true,
        data: clonePayload(data),
      };
    },
  };
}
