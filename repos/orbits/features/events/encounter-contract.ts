import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const EVENT_ENCOUNTER_NOTE_FIXTURE_SOURCE =
  "fixture:features/events/encounter-contract.ts" as const;

export const EVENT_ENCOUNTER_NOTE_ERROR_CODES = [
  "EVENT_ENCOUNTER_NOTE_EVENT_ID_REQUIRED",
  "EVENT_ENCOUNTER_NOTE_EVENT_NOT_FOUND",
  "EVENT_ENCOUNTER_NOTE_ENCOUNTER_ID_REQUIRED",
  "EVENT_ENCOUNTER_NOTE_EMPTY",
  "EVENT_ENCOUNTER_NOTE_PENDING",
  "EVENT_ENCOUNTER_NOTE_MOCK_FAILED",
] as const;

export type EventEncounterNoteErrorCode =
  (typeof EVENT_ENCOUNTER_NOTE_ERROR_CODES)[number];

export type EventEncounterNoteScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";
export type EventEncounterNoteState = "success" | "empty" | "pending";

export interface EventEncounterNoteInput {
  eventId?: string | null;
  contactId?: string | null;
  noteText?: string | null;
  scenario?: EventEncounterNoteScenario | string | null;
}

export interface EventEncounterEvidenceInput {
  eventId?: string | null;
  encounterId?: string | null;
  scenario?: EventEncounterNoteScenario | string | null;
}

export interface EventEncounterNoteErrorDefinition {
  code: EventEncounterNoteErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS = {
  EVENT_ENCOUNTER_NOTE_EVENT_ID_REQUIRED: {
    code: "EVENT_ENCOUNTER_NOTE_EVENT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "An event id is required before capturing an encounter note.",
    recovery:
      "Keep the encounter note surface empty until a known local event fixture is selected.",
  },
  EVENT_ENCOUNTER_NOTE_EVENT_NOT_FOUND: {
    code: "EVENT_ENCOUNTER_NOTE_EVENT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock event encounter note fixture matches that event id.",
    recovery:
      "Render the missing-event envelope and avoid live note storage, databases, devices, or external provider work.",
  },
  EVENT_ENCOUNTER_NOTE_ENCOUNTER_ID_REQUIRED: {
    code: "EVENT_ENCOUNTER_NOTE_ENCOUNTER_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "An encounter id is required before creating encounter evidence.",
    recovery:
      "Wait until the local encounter note fixture exists before creating evidence from it.",
  },
  EVENT_ENCOUNTER_NOTE_EMPTY: {
    code: "EVENT_ENCOUNTER_NOTE_EMPTY",
    appCode: "VALIDATION_ERROR",
    message: "The mock encounter note has no typed or voice-note content.",
    recovery:
      "Render the empty state and ask the operator to capture a local typed note before evidence is created.",
  },
  EVENT_ENCOUNTER_NOTE_PENDING: {
    code: "EVENT_ENCOUNTER_NOTE_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock encounter note is waiting on a voice-note placeholder review.",
    recovery:
      "Render the pending state without starting speech-to-text, audio upload, or live note storage.",
  },
  EVENT_ENCOUNTER_NOTE_MOCK_FAILED: {
    code: "EVENT_ENCOUNTER_NOTE_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock event encounter note capture boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry speech-to-text, audio upload, live note storage, databases, calendar, email, notification, device, network, or model work.",
  },
} as const satisfies Record<
  EventEncounterNoteErrorCode,
  EventEncounterNoteErrorDefinition
>;

export type EventEncounterNoteSourceReference = SourceReferenceDTO & {
  type: "event_import";
  label: string;
  eventId: string;
  encounterId?: string;
  contactId?: string;
  generatedBy: "mock-encounter-note-service";
};

export interface EventEncounterNoteEventSummary {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  source: EventEncounterNoteSourceReference;
  calendarProviderRequested: false;
  liveDatabaseWriteExecuted: false;
}

export interface EventEncounterParticipant {
  contactId: string;
  displayName: string;
  organization: string;
  role: string;
  eventContext: string;
  source: EventEncounterNoteSourceReference;
  evidenceIds: readonly string[];
  externalLookupExecuted: false;
  notificationDelivered: false;
}

export interface EventEncounterNoteProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-event-encounter-note-only";
  generationMethod:
    | "fixture"
    | "rule-based-empty"
    | "rule-based-pending"
    | "rule-based-evidence"
    | "rule-based-failure";
  speechToTextRequested: false;
  audioUploadRequested: false;
  liveNoteStorageExecuted: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
  deviceMicrophoneRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
  aiProviderRequested: false;
}

export interface EventEncounterRecord {
  encounterId: string;
  eventId: string;
  contactId: string;
  capturedAt: string;
  captureMode: "typed_note_with_voice_placeholder";
  locationHint: string;
  source: EventEncounterNoteSourceReference;
  evidenceIds: readonly string[];
  audioUploadRequested: false;
  liveNoteStorageExecuted: false;
}

export interface EventEncounterTypedNote {
  noteId: string;
  encounterId: string;
  kind: "typed_note";
  text: string;
  capturedAt: string;
  createdBy: "mock-encounter-note-service";
  source: EventEncounterNoteSourceReference;
  evidenceIds: readonly string[];
  speechToTextRequested: false;
  liveNoteStorageExecuted: false;
}

export interface EventEncounterVoiceNotePlaceholder {
  status: "placeholder";
  placeholderText: string;
  reason: string;
  source: EventEncounterNoteSourceReference;
  evidenceIds: readonly string[];
  speechToTextRequested: false;
  audioUploadRequested: false;
  audioBlobStored: false;
}

export interface EventEncounterConversationSummarySeed {
  seedId: string;
  encounterId: string;
  contactId: string;
  promptContext: string;
  sourceExcerpt: string;
  suggestedSummary: string;
  generatedBy: "mock-encounter-note-rules";
  source: EventEncounterNoteSourceReference;
  evidenceIds: readonly string[];
  aiProviderRequested: false;
  modelProviderRequested: false;
}

export interface EventEncounterEvidenceRecord {
  evidenceId: string;
  kind: "encounter_note";
  eventId: string;
  encounterId: string;
  contactId: string;
  source: EventEncounterNoteSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "mock-encounter-note-service";
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
}

export interface EventEncounterNotePayload {
  state: EventEncounterNoteState;
  event: EventEncounterNoteEventSummary;
  participant: EventEncounterParticipant | null;
  encounter: EventEncounterRecord | null;
  note: EventEncounterTypedNote | null;
  voiceNote: EventEncounterVoiceNotePlaceholder | null;
  conversationSummarySeed: EventEncounterConversationSummarySeed | null;
  evidenceDraft: EventEncounterEvidenceRecord | null;
  summary: string;
  provenance: EventEncounterNoteProvenance;
  nextAction: string;
}

export interface EventEncounterEvidencePayload {
  state: "success";
  event: EventEncounterNoteEventSummary;
  eventId: string;
  encounterId: string;
  evidence: EventEncounterEvidenceRecord;
  summary: string;
  provenance: EventEncounterNoteProvenance;
  nextAction: string;
}

export interface EventEncounterNoteSuccess {
  success: true;
  data: EventEncounterNotePayload;
}

export interface EventEncounterEvidenceSuccess {
  success: true;
  data: EventEncounterEvidencePayload;
}

export interface EventEncounterNoteFailure {
  success: false;
  error: EventEncounterNoteErrorDefinition & {
    state: "failure";
    provenance: EventEncounterNoteProvenance;
    evidenceIds: readonly string[];
  };
}

export type EventEncounterNoteResult =
  | EventEncounterNoteSuccess
  | EventEncounterNoteFailure;
export type EventEncounterEvidenceResult =
  | EventEncounterEvidenceSuccess
  | EventEncounterNoteFailure;

export interface EventEncounterNoteService {
  createEncounterNote: (
    input?: EventEncounterNoteInput,
  ) => EventEncounterNoteResult;
  createEncounterEvidence: (
    input?: EventEncounterEvidenceInput,
  ) => EventEncounterEvidenceResult;
}

const fixtureCollectedAt = "2026-06-25T20:12:00.000+09:00";
const fixtureCapturedAt = "2026-06-25T20:18:00.000+09:00";

export const mockEventEncounterNoteSource: EventEncounterNoteSourceReference = {
  type: "event_import",
  id: "source:event-encounter-note:demo-event-1:demo-encounter-1",
  label: "event encounter note fixture",
  eventId: "demo-event-1",
  encounterId: "demo-encounter-1",
  contactId: "contact:priya-shah",
  generatedBy: "mock-encounter-note-service",
};

export const mockEventEncounterNoteEvent: EventEncounterNoteEventSummary = {
  id: "demo-event-1",
  name: "Climate founders dinner",
  venue: "Daikanyama Founders Room",
  startsAt: "2026-06-25T19:00:00.000+09:00",
  source: mockEventEncounterNoteSource,
  calendarProviderRequested: false,
  liveDatabaseWriteExecuted: false,
};

export const mockEventEncounterNoteParticipant: EventEncounterParticipant = {
  contactId: "contact:priya-shah",
  displayName: "Priya Shah",
  organization: "Solace Battery",
  role: "CEO",
  eventContext:
    "Priya described a storage pilot need after the event talk and asked for a founder introduction.",
  source: mockEventEncounterNoteSource,
  evidenceIds: ["evidence:event-encounter-note-typed"],
  externalLookupExecuted: false,
  notificationDelivered: false,
};

export const mockEventEncounterNoteProvenance: EventEncounterNoteProvenance = {
  source: EVENT_ENCOUNTER_NOTE_FIXTURE_SOURCE,
  sourceLabel: "Mock event encounter note fixture",
  evidenceIds: [
    "evidence:event-encounter-note-typed",
    "evidence:event-encounter-summary-seed",
    "evidence:event-encounter-created",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-event-encounter-note-only",
  generationMethod: "fixture",
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
};

export const mockEmptyEventEncounterNoteProvenance: EventEncounterNoteProvenance = {
  ...mockEventEncounterNoteProvenance,
  sourceLabel: "Mock empty event encounter note rule",
  evidenceIds: ["evidence:event-encounter-empty"],
  generationMethod: "rule-based-empty",
};

export const mockPendingEventEncounterNoteProvenance: EventEncounterNoteProvenance = {
  ...mockEventEncounterNoteProvenance,
  sourceLabel: "Mock pending event encounter note rule",
  evidenceIds: ["evidence:event-encounter-voice-placeholder"],
  generationMethod: "rule-based-pending",
};

export const mockEventEncounterNoteFailureProvenance: EventEncounterNoteProvenance = {
  ...mockEventEncounterNoteProvenance,
  sourceLabel: "Mock event encounter note controlled failure rule",
  evidenceIds: ["evidence:event-encounter-controlled-failure"],
  generationMethod: "rule-based-failure",
};

export const mockEventEncounterRecord: EventEncounterRecord = {
  encounterId: "demo-encounter-1",
  eventId: "demo-event-1",
  contactId: "contact:priya-shah",
  capturedAt: fixtureCapturedAt,
  captureMode: "typed_note_with_voice_placeholder",
  locationHint: "After Priya's storage panel at the venue coffee bar",
  source: mockEventEncounterNoteSource,
  evidenceIds: ["evidence:event-encounter-note-typed"],
  audioUploadRequested: false,
  liveNoteStorageExecuted: false,
};

export const mockEventEncounterTypedNote: EventEncounterTypedNote = {
  noteId: "note:demo-encounter-1",
  encounterId: "demo-encounter-1",
  kind: "typed_note",
  text:
    "Priya asked for a storage pilot introduction and offered to share deployment constraints after the dinner.",
  capturedAt: fixtureCapturedAt,
  createdBy: "mock-encounter-note-service",
  source: mockEventEncounterNoteSource,
  evidenceIds: ["evidence:event-encounter-note-typed"],
  speechToTextRequested: false,
  liveNoteStorageExecuted: false,
};

export const mockEventEncounterVoiceNotePlaceholder: EventEncounterVoiceNotePlaceholder = {
  status: "placeholder",
  placeholderText:
    "Voice note placeholder only. No microphone, speech-to-text, or audio upload has run.",
  reason:
    "Milestone C represents voice capture as deterministic metadata until live device permissions and transcription providers exist.",
  source: mockEventEncounterNoteSource,
  evidenceIds: ["evidence:event-encounter-voice-placeholder"],
  speechToTextRequested: false,
  audioUploadRequested: false,
  audioBlobStored: false,
};

export const mockEventEncounterConversationSummarySeed: EventEncounterConversationSummarySeed = {
  seedId: "summary-seed:demo-encounter-1",
  encounterId: "demo-encounter-1",
  contactId: "contact:priya-shah",
  promptContext:
    "Use the event name, participant context, typed note, and evidence ids when a live summarizer is later approved.",
  sourceExcerpt:
    "Priya asked for a storage pilot introduction and offered deployment constraints.",
  suggestedSummary:
    "Priya is a high-context event follow-up for a storage pilot introduction.",
  generatedBy: "mock-encounter-note-rules",
  source: mockEventEncounterNoteSource,
  evidenceIds: ["evidence:event-encounter-summary-seed"],
  aiProviderRequested: false,
  modelProviderRequested: false,
};

export const mockEventEncounterEvidenceRecord: EventEncounterEvidenceRecord = {
  evidenceId: "evidence:event-encounter-created",
  kind: "encounter_note",
  eventId: "demo-event-1",
  encounterId: "demo-encounter-1",
  contactId: "contact:priya-shah",
  source: mockEventEncounterNoteSource,
  sourceLabel: "Climate founders dinner encounter note",
  excerpt:
    "Priya asked for a storage pilot introduction and offered to share deployment constraints.",
  capturedFields: [
    "eventId",
    "encounterId",
    "contactId",
    "typedNote",
    "conversationSummarySeed",
  ],
  createdAt: fixtureCapturedAt,
  createdBy: "mock-encounter-note-service",
  liveDatabaseWriteExecuted: false,
  externalNetworkRequested: false,
};

export const mockEventEncounterNoteFixture: EventEncounterNotePayload = {
  state: "success",
  event: mockEventEncounterNoteEvent,
  participant: mockEventEncounterNoteParticipant,
  encounter: mockEventEncounterRecord,
  note: mockEventEncounterTypedNote,
  voiceNote: mockEventEncounterVoiceNotePlaceholder,
  conversationSummarySeed: mockEventEncounterConversationSummarySeed,
  evidenceDraft: mockEventEncounterEvidenceRecord,
  summary:
    "A typed on-site note, voice-note placeholder, conversation summary seed, and evidence draft were created from local fixtures.",
  provenance: mockEventEncounterNoteProvenance,
  nextAction:
    "Review the encounter note and create evidence before drafting any follow-up.",
};

export const mockEmptyEventEncounterNoteFixture: EventEncounterNotePayload = {
  state: "empty",
  event: mockEventEncounterNoteEvent,
  participant: null,
  encounter: null,
  note: null,
  voiceNote: null,
  conversationSummarySeed: null,
  evidenceDraft: null,
  summary: "No encounter note has been captured for this local event fixture.",
  provenance: mockEmptyEventEncounterNoteProvenance,
  nextAction:
    "Capture a typed note before creating evidence or preparing a follow-up summary seed.",
};

export const mockPendingEventEncounterNoteFixture: EventEncounterNotePayload = {
  state: "pending",
  event: mockEventEncounterNoteEvent,
  participant: mockEventEncounterNoteParticipant,
  encounter: {
    ...mockEventEncounterRecord,
    evidenceIds: ["evidence:event-encounter-voice-placeholder"],
  },
  note: null,
  voiceNote: mockEventEncounterVoiceNotePlaceholder,
  conversationSummarySeed: null,
  evidenceDraft: null,
  summary:
    "The encounter is represented by a voice-note placeholder until the operator adds typed context.",
  provenance: mockPendingEventEncounterNoteProvenance,
  nextAction:
    "Keep the note pending and avoid speech-to-text, audio upload, live storage, and summary generation.",
};

export const mockEventEncounterEvidenceFixture: EventEncounterEvidencePayload = {
  state: "success",
  event: mockEventEncounterNoteEvent,
  eventId: "demo-event-1",
  encounterId: "demo-encounter-1",
  evidence: mockEventEncounterEvidenceRecord,
  summary:
    "The local encounter note was converted into deterministic relationship evidence.",
  provenance: {
    ...mockEventEncounterNoteProvenance,
    sourceLabel: "Mock event encounter evidence creation rule",
    evidenceIds: ["evidence:event-encounter-created"],
    generationMethod: "rule-based-evidence",
  },
  nextAction:
    "Attach this evidence to the relationship timeline before composing follow-up copy.",
};

export function eventEncounterNoteErrorToAppError(
  errorCode: EventEncounterNoteErrorCode,
): AppError {
  const definition = EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS[errorCode];

  return new AppError(definition.appCode, definition.message);
}

export function eventEncounterNoteFailureToAppError(
  failure: EventEncounterNoteFailure,
): AppError {
  return eventEncounterNoteErrorToAppError(failure.error.code);
}

export function eventEncounterNoteErrorContext(
  errorCode: EventEncounterNoteErrorCode,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    eventEncounterNoteErrorCode: errorCode,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock event encounter note failure came from deterministic fixture rules.",
    service: "event-encounter-note-capture-mock",
  };
}

export function eventEncounterNoteFailureContext(
  failure: EventEncounterNoteFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const baseContext = eventEncounterNoteErrorContext(failure.error.code, mode);

  if (
    failure.error.code === "EVENT_ENCOUNTER_NOTE_EMPTY" ||
    failure.error.code === "EVENT_ENCOUNTER_NOTE_PENDING"
  ) {
    return {
      ...baseContext,
      privacy: failure.error.provenance.privacy,
      provenance: failure.error.provenance.source,
    };
  }

  return baseContext;
}
