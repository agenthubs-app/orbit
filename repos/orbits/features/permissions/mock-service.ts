import {
  PERMISSION_CAPABILITIES,
  PERMISSION_STATE_ERROR_DEFINITIONS,
  type PermissionCapability,
  type PermissionIntent,
  type PermissionRequestInput,
  type PermissionRequestPayload,
  type PermissionRequestResult,
  type PermissionRequestScenario,
  type PermissionRequestSuccess,
  type PermissionStateErrorCode,
  type PermissionStateFailure,
  type PermissionStateInput,
  type PermissionStatePayload,
  type PermissionStateResult,
  type PermissionStateScenario,
  type PermissionStateSuccess,
} from "./contract";
import {
  mockCalendarPermissionRequestFixture,
  mockEmptyPermissionStateFixture,
  mockPendingPermissionStateFixture,
  mockPermissionStateFailureProvenance,
  mockPermissionStateFixture,
  mockPermissionStates,
} from "./fixtures";
import type { PermissionStateService } from "./service";

const supportedStateScenarios = new Set<PermissionStateScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedRequestScenarios = new Set<PermissionRequestScenario>([
  "success",
  "empty",
  "pending",
  "failure",
  "blocked",
]);

const supportedCapabilities = new Set<PermissionCapability>(
  PERMISSION_CAPABILITIES,
);

const supportedIntents = new Set<PermissionIntent>([
  "sync-contacts",
  "connect-event-calendar",
  "review-email-context",
  "enable-notifications",
  "scan-business-card",
  "import-event-data",
  "analyze-chat-context",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(payload: PermissionStatePayload): PermissionStateSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function requestSuccess(
  payload: PermissionRequestPayload,
): PermissionRequestSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: PermissionStateErrorCode): PermissionStateFailure {
  const definition = PERMISSION_STATE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockPermissionStateFailureProvenance,
      evidenceIds: mockPermissionStateFailureProvenance.evidenceIds,
    },
  };
}

function normalizeStateScenario(
  scenario?: PermissionStateInput["scenario"],
): PermissionStateScenario {
  if (scenario && supportedStateScenarios.has(scenario as PermissionStateScenario)) {
    return scenario as PermissionStateScenario;
  }

  return "success";
}

function normalizeRequestScenario(
  scenario?: PermissionRequestInput["scenario"],
): PermissionRequestScenario {
  if (
    scenario &&
    supportedRequestScenarios.has(scenario as PermissionRequestScenario)
  ) {
    return scenario as PermissionRequestScenario;
  }

  return "pending";
}

function normalizeCapability(
  capability: PermissionRequestInput["capability"],
): PermissionCapability | null {
  if (supportedCapabilities.has(capability as PermissionCapability)) {
    return capability as PermissionCapability;
  }

  return null;
}

function normalizeIntent(intent?: PermissionRequestInput["intent"]): PermissionIntent {
  if (intent && supportedIntents.has(intent as PermissionIntent)) {
    return intent as PermissionIntent;
  }

  return "connect-event-calendar";
}

function buildRequestPayload(
  capability: PermissionCapability,
  intent: PermissionIntent,
): PermissionRequestPayload {
  if (capability === "calendar" && intent === "connect-event-calendar") {
    return mockCalendarPermissionRequestFixture;
  }

  const permission =
    mockPermissionStates.find((record) => record.capability === capability) ??
    mockPendingPermissionStateFixture.permissions[0];

  return {
    ...mockCalendarPermissionRequestFixture,
    request: {
      ...mockCalendarPermissionRequestFixture.request,
      id: `permission-request:${capability}:${intent}`,
      capability,
      intent,
      reviewLabel: `${permission.label} staged authorization review`,
      evidenceIds: permission.provenance.evidenceIds,
    },
    permission: {
      ...permission,
      status: "pending",
      authorizationStage: "staged-review",
      actionLabel: `Review ${permission.label.toLowerCase()} request`,
    },
    provenance: permission.provenance,
  };
}

export function createMockPermissionStateService(): PermissionStateService {
  return {
    listPermissionStates(input = {}): PermissionStateResult {
      switch (normalizeStateScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyPermissionStateFixture);
        case "pending":
          return success(mockPendingPermissionStateFixture);
        case "failure":
          return failure("PERMISSION_STATE_MOCK_FAILED");
        case "success":
        default:
          return success(mockPermissionStateFixture);
      }
    },

    requestPermission(input): PermissionRequestResult {
      const scenario = normalizeRequestScenario(input.scenario);
      const capability = normalizeCapability(input.capability);

      if (!capability) {
        return failure("PERMISSION_CAPABILITY_NOT_FOUND");
      }

      if (scenario === "blocked") {
        return failure("PERMISSION_REQUEST_NOT_ALLOWED");
      }

      if (scenario === "failure") {
        return failure("PERMISSION_STATE_MOCK_FAILED");
      }

      return requestSuccess(
        buildRequestPayload(capability, normalizeIntent(input.intent)),
      );
    },
  };
}

export type { PermissionRequestResult, PermissionStateResult };
