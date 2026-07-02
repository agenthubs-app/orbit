import type {
  EventEncounterConversationSummarySeed,
  EventEncounterEvidencePayload,
  EventEncounterEvidenceRecord,
  EventEncounterNoteEventSummary,
  EventEncounterNotePayload,
  EventEncounterNoteProvenance,
  EventEncounterNoteSourceReference,
  EventEncounterParticipant,
  EventEncounterRecord,
  EventEncounterTypedNote,
  EventEncounterVoiceNotePlaceholder,
} from "./contract";

export const EVENT_ENCOUNTER_NOTE_FIXTURE_SOURCE =
  "fixture:features/events/encounter-note/fixtures.ts" as const;

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
