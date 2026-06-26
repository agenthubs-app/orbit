import {
  EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS,
  mockEmptyEventEncounterNoteProvenance,
  mockEmptyEventEncounterNoteFixture,
  mockEventEncounterEvidenceFixture,
  mockEventEncounterNoteFailureProvenance,
  mockEventEncounterNoteFixture,
  mockPendingEventEncounterNoteProvenance,
  mockPendingEventEncounterNoteFixture,
  type EventEncounterEvidenceInput,
  type EventEncounterEvidenceResult,
  type EventEncounterEvidenceSuccess,
  type EventEncounterNoteErrorCode,
  type EventEncounterNoteFailure,
  type EventEncounterNoteInput,
  type EventEncounterNotePayload,
  type EventEncounterNoteProvenance,
  type EventEncounterNoteResult,
  type EventEncounterNoteScenario,
  type EventEncounterNoteService,
  type EventEncounterNoteSuccess,
} from "./encounter-contract";

const defaultEventId = "demo-event-1";
const defaultEncounterId = "demo-encounter-1";

const supportedScenarios = new Set<EventEncounterNoteScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function noteSuccess(
  payload: EventEncounterNotePayload,
): EventEncounterNoteSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function evidenceSuccess(): EventEncounterEvidenceSuccess {
  return {
    success: true,
    data: clonePayload(mockEventEncounterEvidenceFixture),
  };
}

function failure(
  code: EventEncounterNoteErrorCode,
  provenance: EventEncounterNoteProvenance = mockEventEncounterNoteFailureProvenance,
): EventEncounterNoteFailure {
  const definition = EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: EventEncounterNoteInput["scenario"],
): EventEncounterNoteScenario {
  if (scenario && supportedScenarios.has(scenario as EventEncounterNoteScenario)) {
    return scenario as EventEncounterNoteScenario;
  }

  return "success";
}

function normalizeEventId(eventId?: string | null): string {
  if (eventId === undefined) {
    return defaultEventId;
  }

  return eventId?.trim() ?? "";
}

function normalizeEncounterId(encounterId?: string | null): string {
  if (encounterId === undefined) {
    return defaultEncounterId;
  }

  return encounterId?.trim() ?? "";
}

function normalizeNoteText(noteText?: string | null): string {
  return noteText?.trim() ?? mockEventEncounterNoteFixture.note?.text ?? "";
}

function eventFailure(
  input: EventEncounterNoteInput | EventEncounterEvidenceInput,
): EventEncounterNoteFailure | null {
  const eventId = normalizeEventId(input.eventId);

  if (!eventId) {
    return failure("EVENT_ENCOUNTER_NOTE_EVENT_ID_REQUIRED");
  }

  if (eventId !== defaultEventId) {
    return failure("EVENT_ENCOUNTER_NOTE_EVENT_NOT_FOUND");
  }

  return null;
}

function encounterFailure(
  input: EventEncounterEvidenceInput,
): EventEncounterNoteFailure | null {
  const encounterId = normalizeEncounterId(input.encounterId);

  if (!encounterId) {
    return failure("EVENT_ENCOUNTER_NOTE_ENCOUNTER_ID_REQUIRED");
  }

  if (encounterId !== defaultEncounterId) {
    return failure("EVENT_ENCOUNTER_NOTE_ENCOUNTER_ID_REQUIRED");
  }

  return null;
}

function scenarioNoteResult(
  scenario: EventEncounterNoteScenario,
): EventEncounterNoteResult | null {
  switch (scenario) {
    case "empty":
      return noteSuccess(mockEmptyEventEncounterNoteFixture);
    case "pending":
      return noteSuccess(mockPendingEventEncounterNoteFixture);
    case "failure":
      return failure("EVENT_ENCOUNTER_NOTE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioEvidenceResult(
  scenario: EventEncounterNoteScenario,
): EventEncounterEvidenceResult | null {
  switch (scenario) {
    case "empty":
      return failure(
        "EVENT_ENCOUNTER_NOTE_EMPTY",
        mockEmptyEventEncounterNoteProvenance,
      );
    case "pending":
      return failure(
        "EVENT_ENCOUNTER_NOTE_PENDING",
        mockPendingEventEncounterNoteProvenance,
      );
    case "failure":
      return failure("EVENT_ENCOUNTER_NOTE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function ruleBasedNoteResult(input: EventEncounterNoteInput): EventEncounterNoteResult {
  if (!normalizeNoteText(input.noteText)) {
    return noteSuccess(mockEmptyEventEncounterNoteFixture);
  }

  return noteSuccess(mockEventEncounterNoteFixture);
}

export function createMockEventEncounterNoteService(): EventEncounterNoteService {
  return {
    createEncounterNote(input = {}): EventEncounterNoteResult {
      const scenarioResult = scenarioNoteResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      return ruleBasedNoteResult(input);
    },

    createEncounterEvidence(input = {}): EventEncounterEvidenceResult {
      const scenarioResult = scenarioEvidenceResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      const encounterFailureResult = encounterFailure(input);

      if (encounterFailureResult) {
        return encounterFailureResult;
      }

      return evidenceSuccess();
    },
  };
}
