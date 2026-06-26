import {
  WANT_CONNECT_ERROR_DEFINITIONS,
  mockEmptyWantConnectFixture,
  mockEmptyWantConnectMatchesFixture,
  mockPendingWantConnectFixture,
  mockPendingWantConnectMatchesFixture,
  mockWantConnectFailureProvenance,
  mockWantConnectFixture,
  mockWantConnectMatchesFixture,
  type WantConnectErrorCode,
  type WantConnectFailure,
  type WantConnectIntentInput,
  type WantConnectMatchesInput,
  type WantConnectMatchesPayload,
  type WantConnectMatchesResult,
  type WantConnectPayload,
  type WantConnectResult,
  type WantConnectScenario,
  type WantConnectService,
  type WantConnectSuccess,
  type WantConnectMatchesSuccess,
} from "./want-connect-contract";

const defaultEventId = "demo-event-1";

const supportedScenarios = new Set<WantConnectScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function intentSuccess(payload: WantConnectPayload): WantConnectSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function matchesSuccess(
  payload: WantConnectMatchesPayload,
): WantConnectMatchesSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: WantConnectErrorCode): WantConnectFailure {
  const definition = WANT_CONNECT_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockWantConnectFailureProvenance,
      evidenceIds: mockWantConnectFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: WantConnectIntentInput["scenario"],
): WantConnectScenario {
  if (scenario && supportedScenarios.has(scenario as WantConnectScenario)) {
    return scenario as WantConnectScenario;
  }

  return "success";
}

function normalizeEventId(eventId?: string | null): string {
  if (eventId === undefined) {
    return defaultEventId;
  }

  return eventId?.trim() ?? "";
}

function normalizeContactId(contactId?: string | null): string {
  return contactId?.trim() ?? "";
}

function eventFailure(
  input: WantConnectIntentInput | WantConnectMatchesInput,
): WantConnectFailure | null {
  const eventId = normalizeEventId(input.eventId);

  if (!eventId) {
    return failure("WANT_CONNECT_EVENT_ID_REQUIRED");
  }

  if (eventId !== defaultEventId) {
    return failure("WANT_CONNECT_EVENT_NOT_FOUND");
  }

  return null;
}

function scenarioIntentResult(
  scenario: WantConnectScenario,
): WantConnectResult | null {
  switch (scenario) {
    case "empty":
      return intentSuccess(mockEmptyWantConnectFixture);
    case "pending":
      return intentSuccess(mockPendingWantConnectFixture);
    case "failure":
      return failure("WANT_CONNECT_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioMatchesResult(
  scenario: WantConnectScenario,
): WantConnectMatchesResult | null {
  switch (scenario) {
    case "empty":
      return matchesSuccess(mockEmptyWantConnectMatchesFixture);
    case "pending":
      return matchesSuccess(mockPendingWantConnectMatchesFixture);
    case "failure":
      return failure("WANT_CONNECT_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function targetFailure(input: WantConnectIntentInput): WantConnectFailure | null {
  return normalizeContactId(input.targetContactId)
    ? null
    : failure("WANT_CONNECT_TARGET_REQUIRED");
}

function ruleBasedIntentResult(input: WantConnectIntentInput): WantConnectResult {
  const targetContactId = normalizeContactId(input.targetContactId);

  if (targetContactId === "contact:aiko-mori") {
    return intentSuccess(mockPendingWantConnectFixture);
  }

  return intentSuccess(mockWantConnectFixture);
}

export function createMockWantConnectService(): WantConnectService {
  return {
    createWantToConnectIntent(input = {}): WantConnectResult {
      const scenarioResult = scenarioIntentResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      const targetFailureResult = targetFailure(input);

      if (targetFailureResult) {
        return targetFailureResult;
      }

      return ruleBasedIntentResult(input);
    },

    listMatches(input = {}): WantConnectMatchesResult {
      const scenarioResult = scenarioMatchesResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      return matchesSuccess(mockWantConnectMatchesFixture);
    },
  };
}
