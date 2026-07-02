import {
  EXTERNAL_ACTION_SANDBOX_ERROR_DEFINITIONS,
  type ExternalActionAuditListInput,
  type ExternalActionAuditRecord,
  type ExternalActionAuditResult,
  type ExternalActionNoOpPayload,
  type ExternalActionNoOpResult,
  type ExternalActionSandboxAction,
  type ExternalActionSandboxActionType,
  type ExternalActionSandboxErrorCode,
  type ExternalActionSandboxFailure,
  type ExternalActionSandboxInput,
  type ExternalActionSandboxPayload,
  type ExternalActionSandboxProvenance,
  type ExternalActionSandboxScenario,
  type ExternalActionSandboxService,
} from "./external-action-contract";
import {
  mockEmptyExternalActionAuditFixture,
  mockExternalActionAuditRecords,
  mockExternalActionSandboxActions,
  mockExternalActionSandboxFailureProvenance,
  mockExternalActionSandboxFixture,
  mockPendingExternalActionSandboxFixture,
} from "./external-action-fixtures";

const LIVE_EXTERNAL_ACTION_SANDBOX_SOURCE =
  "live-policy:features/agent/live-external-action-sandbox.ts";
const collectedAt = "2026-07-01T00:00:00.000Z";
const recordedAt = "2026-07-01T00:01:00.000Z";
const supportedScenarios = new Set<ExternalActionSandboxScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);
const liveActionIds: Record<ExternalActionSandboxActionType, string> = {
  create_calendar_event: "live-sandbox-create-calendar-event",
  deliver_notification: "live-sandbox-deliver-notification",
  send_message: "live-sandbox-send-message",
};

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function liveProvenance(input: {
  evidenceIds: readonly string[];
  explicitConfirmationRecorded: boolean;
  generationMethod: ExternalActionSandboxProvenance["generationMethod"];
  sourceLabel: string;
}): ExternalActionSandboxProvenance {
  return {
    ...mockExternalActionSandboxFailureProvenance,
    source: LIVE_EXTERNAL_ACTION_SANDBOX_SOURCE,
    sourceLabel: input.sourceLabel,
    evidenceIds: input.evidenceIds,
    collectedAt,
    privacy: "live-external-action-sandbox-policy",
    generationMethod: input.generationMethod,
    explicitConfirmationRecorded: input.explicitConfirmationRecorded,
  };
}

function liveAction(action: ExternalActionSandboxAction): ExternalActionSandboxAction {
  const actionId = liveActionIds[action.actionType];
  const evidenceIds = [`evidence:external-action:live:${action.actionType}`];

  return {
    ...clonePayload(action),
    actionId,
    confirmationId: `live-confirmation:external-action:${action.actionType}`,
    evidenceIds,
    label: action.label.replace("No-op", "Live no-op"),
    provenance: liveProvenance({
      evidenceIds,
      explicitConfirmationRecorded: true,
      generationMethod: "live-policy-state",
      sourceLabel: "Live external action sandbox policy",
    }),
    suppressedEffect:
      "External provider request suppressed by the live no-op sandbox policy.",
  };
}

const liveActions = mockExternalActionSandboxActions.map(liveAction);

function liveAuditRecord(
  action: ExternalActionSandboxAction,
): ExternalActionAuditRecord {
  return {
    ...clonePayload(
      mockExternalActionAuditRecords.find(
        (record) => record.actionType === action.actionType,
      ) ?? mockExternalActionAuditRecords[0],
    ),
    actionId: action.actionId,
    auditId: `live-audit:external-action:${action.actionType}`,
    actorLabel: "Orbit operator",
    evidenceIds: action.evidenceIds,
    productionAuditPersisted: false,
    provenance: liveProvenance({
      evidenceIds: action.evidenceIds,
      explicitConfirmationRecorded: true,
      generationMethod: "live-policy-no-op",
      sourceLabel: "Live external action sandbox no-op audit",
    }),
    recordedAt,
    relationshipContext: action.relationshipContext,
    targetLabel: action.targetLabel,
  };
}

const liveAuditRecords = liveActions.map(liveAuditRecord);

function liveAuditPayload(
  payload: ExternalActionSandboxPayload,
  sourceLabel: string,
): ExternalActionSandboxPayload {
  const cloned = clonePayload(payload);
  const evidenceIds =
    cloned.state === "success"
      ? liveActions.flatMap((action) => action.evidenceIds)
      : cloned.provenance.evidenceIds;

  return {
    ...cloned,
    actions: cloned.state === "success" ? liveActions : [],
    auditRecords: cloned.state === "success" ? liveAuditRecords : [],
    provenance: liveProvenance({
      evidenceIds,
      explicitConfirmationRecorded: cloned.state === "success",
      generationMethod: "live-policy-state",
      sourceLabel,
    }),
    summary: cloned.summary.replace(/^Mock/, "Live no-op policy"),
  };
}

function noOpPayload(
  action: ExternalActionSandboxAction,
  input: ExternalActionSandboxInput,
): ExternalActionNoOpPayload {
  const auditRecord = liveAuditRecord(action);
  const actorLabel = input.actorLabel?.trim() || auditRecord.actorLabel;
  const targetLabel = input.targetLabel?.trim() || action.targetLabel;

  return {
    state: "success",
    actionId: action.actionId,
    actionType: action.actionType,
    actorLabel,
    auditRecord: {
      ...auditRecord,
      actorLabel,
      targetLabel,
    },
    evidenceIds: action.evidenceIds,
    externalSideEffectExecuted: false,
    label: action.label,
    nextAction:
      "Keep the action in review; the live sandbox did not request an external provider.",
    noOp: true,
    providerKind: action.providerKind,
    providerRequestIssued: false,
    provenance: liveProvenance({
      evidenceIds: action.evidenceIds,
      explicitConfirmationRecorded: true,
      generationMethod: "live-policy-no-op",
      sourceLabel: "Live external action sandbox no-op result",
    }),
    relationshipContext: action.relationshipContext,
    targetLabel,
  };
}

function failure(code: ExternalActionSandboxErrorCode): ExternalActionSandboxFailure {
  const definition = EXTERNAL_ACTION_SANDBOX_ERROR_DEFINITIONS[code];
  const provenance = liveProvenance({
    evidenceIds: ["evidence:external-action:live-policy-failure"],
    explicitConfirmationRecorded: false,
    generationMethod: "live-policy-state",
    sourceLabel: "Live external action sandbox policy failure",
  });

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

function actionForType(
  actionType: ExternalActionSandboxActionType,
): ExternalActionSandboxAction {
  const action = liveActions.find(
    (candidate) => candidate.actionType === actionType,
  );

  if (!action) {
    throw new Error(`Missing live sandbox action for ${actionType}`);
  }

  return action;
}

function operationResult(
  actionType: ExternalActionSandboxActionType,
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

  if (typeof input.actionId === "string" && input.actionId.trim() === "") {
    return failure("EXTERNAL_ACTION_SANDBOX_ACTION_ID_REQUIRED");
  }

  const action = actionForType(actionType);

  if (input.actionId && input.actionId !== action.actionId) {
    return failure("EXTERNAL_ACTION_SANDBOX_ACTION_NOT_FOUND");
  }

  return {
    success: true,
    data: noOpPayload(action, input),
  };
}

function auditResult(input: ExternalActionAuditListInput = {}): ExternalActionAuditResult {
  switch (normalizeScenario(input.scenario)) {
    case "empty":
      return {
        success: true,
        data: liveAuditPayload(
          mockEmptyExternalActionAuditFixture,
          "Live empty external action sandbox policy",
        ),
      };
    case "pending":
      return {
        success: true,
        data: liveAuditPayload(
          mockPendingExternalActionSandboxFixture,
          "Live pending external action sandbox policy",
        ),
      };
    case "failure":
      return failure("EXTERNAL_ACTION_SANDBOX_MOCK_FAILED");
    case "success":
    default:
      return {
        success: true,
        data: liveAuditPayload(
          mockExternalActionSandboxFixture,
          "Live external action sandbox policy",
        ),
      };
  }
}

export function createLiveExternalActionSandboxService(): ExternalActionSandboxService {
  return {
    createCalendarEvent(input = {}) {
      return operationResult("create_calendar_event", input);
    },
    deliverNotification(input = {}) {
      return operationResult("deliver_notification", input);
    },
    listAuditRecords(input = {}) {
      return auditResult(input);
    },
    sendMessage(input = {}) {
      return operationResult("send_message", input);
    },
  };
}
