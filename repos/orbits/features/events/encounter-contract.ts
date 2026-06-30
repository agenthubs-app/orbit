import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Event Encounter Note contract 描述活动现场遇见某人后的本地记录和证据生成。
// 当前只处理 typed note 和 voice placeholder，不上传音频、不调用 speech-to-text。
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

// note 输入创建 encounter；evidence 输入把既有 encounter 转成证据。
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

// encounter 错误定义保证缺 event/encounter 或 pending 时不写 live note storage。
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

// EventSummary 是 note 所属活动的轻量信息，不代表读取真实日历。
export interface EventEncounterNoteEventSummary {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  source: EventEncounterNoteSourceReference;
  calendarProviderRequested: false;
  liveDatabaseWriteExecuted: false;
}

// participant 是本次遇见的人，externalLookupExecuted=false 表示未查外部资料。
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

// provenance 是现场记录流程的安全账本。
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

// EventEncounterRecord 是一次现场遇见的主记录。
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
