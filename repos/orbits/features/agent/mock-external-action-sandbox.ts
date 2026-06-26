import {
  EXTERNAL_ACTION_SANDBOX_ERROR_DEFINITIONS,
  mockCreateCalendarEventNoOpFixture,
  mockEmptyExternalActionAuditFixture,
  mockExternalActionSandboxFailureProvenance,
  mockExternalActionSandboxFixture,
  mockExternalActionSandboxActions,
  mockNotificationDeliveryNoOpFixture,
  mockPendingExternalActionSandboxFixture,
  mockSendMessageNoOpFixture,
  type ExternalActionAuditListInput,
  type ExternalActionAuditResult,
  type ExternalActionNoOpPayload,
  type ExternalActionNoOpResult,
  type ExternalActionSandboxAction,
  type ExternalActionSandboxActionType,
  type ExternalActionSandboxErrorCode,
  type ExternalActionSandboxFailure,
  type ExternalActionSandboxInput,
  type ExternalActionSandboxScenario,
  type ExternalActionSandboxService,
} from "./external-action-contract";

const supportedScenarios = new Set<ExternalActionSandboxScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function auditSuccess(data = mockExternalActionSandboxFixture): ExternalActionAuditResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function noOpSuccess(data: ExternalActionNoOpPayload): ExternalActionNoOpResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: ExternalActionSandboxErrorCode,
): ExternalActionSandboxFailure {
  const definition = EXTERNAL_ACTION_SANDBOX_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockExternalActionSandboxFailureProvenance,
      evidenceIds: mockExternalActionSandboxFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?:
    | ExternalActionSandboxInput["scenario"]
    | ExternalActionAuditListInput["scenario"],
): ExternalActionSandboxScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ExternalActionSandboxScenario)
  ) {
    return scenario as ExternalActionSandboxScenario;
  }

  return "success";
}

function findAction(
  actionType: ExternalActionSandboxActionType,
): ExternalActionSandboxAction {
  const action = mockExternalActionSandboxActions.find(
    (candidate) => candidate.actionType === actionType,
  );

  if (!action) {
    throw new Error(`Missing mock external action fixture for ${actionType}`);
  }

  return action;
}

function hasMismatchedActionId(
  expectedAction: ExternalActionSandboxAction,
  input: ExternalActionSandboxInput,
): boolean {
  return Boolean(input.actionId && input.actionId !== expectedAction.actionId);
}

function hasBlankActionId(input: ExternalActionSandboxInput): boolean {
  return typeof input.actionId === "string" && input.actionId.trim() === "";
}

function operationResult(
  actionType: ExternalActionSandboxActionType,
  fixture: ExternalActionNoOpPayload,
  input: ExternalActionSandboxInput = {},
): ExternalActionNoOpResult {
  const scenario = normalizeScenario(input.scenario);

  if (scenario === "failure") {
    return failure("EXTERNAL_ACTION_SANDBOX_MOCK_FAILED");
  }

  if (scenario === "empty") {
    return failure("EXTERNAL_ACTION_SANDBOX_EMPTY");
  }

  if (scenario === "pending") {
    return failure("EXTERNAL_ACTION_SANDBOX_PENDING");
  }

  if (hasBlankActionId(input)) {
    return failure("EXTERNAL_ACTION_SANDBOX_ACTION_ID_REQUIRED");
  }

  const expectedAction = findAction(actionType);

  if (hasMismatchedActionId(expectedAction, input)) {
    return failure("EXTERNAL_ACTION_SANDBOX_ACTION_NOT_FOUND");
  }

  const payload = clonePayload(fixture);
  const actorLabel = input.actorLabel?.trim();

  if (actorLabel) {
    payload.actorLabel = actorLabel;
    payload.auditRecord.actorLabel = actorLabel;
  }

  if (input.targetLabel?.trim()) {
    payload.targetLabel = input.targetLabel.trim();
    payload.auditRecord.targetLabel = input.targetLabel.trim();
  }

  return noOpSuccess(payload);
}

function auditResult(input: ExternalActionAuditListInput = {}): ExternalActionAuditResult {
  const scenario = normalizeScenario(input.scenario);

  switch (scenario) {
    case "empty":
      return auditSuccess(mockEmptyExternalActionAuditFixture);
    case "pending":
      return auditSuccess(mockPendingExternalActionSandboxFixture);
    case "failure":
      return failure("EXTERNAL_ACTION_SANDBOX_MOCK_FAILED");
    case "success":
    default:
      return auditSuccess(mockExternalActionSandboxFixture);
  }
}

export function createMockExternalActionSandboxService(): ExternalActionSandboxService {
  return {
    sendMessage(input = {}): ExternalActionNoOpResult {
      return operationResult("send_message", mockSendMessageNoOpFixture, input);
    },

    createCalendarEvent(input = {}): ExternalActionNoOpResult {
      return operationResult(
        "create_calendar_event",
        mockCreateCalendarEventNoOpFixture,
        input,
      );
    },

    deliverNotification(input = {}): ExternalActionNoOpResult {
      return operationResult(
        "deliver_notification",
        mockNotificationDeliveryNoOpFixture,
        input,
      );
    },

    listAuditRecords(input = {}): ExternalActionAuditResult {
      return auditResult(input);
    },
  };
}

export type {
  ExternalActionAuditResult,
  ExternalActionNoOpResult,
  ExternalActionSandboxService,
};
