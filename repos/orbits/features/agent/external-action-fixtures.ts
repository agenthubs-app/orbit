import type {
  ExternalActionAuditRecord,
  ExternalActionNoOpPayload,
  ExternalActionRelationshipContext,
  ExternalActionSandboxAction,
  ExternalActionSandboxActionType,
  ExternalActionSandboxPayload,
  ExternalActionSandboxProvenance,
} from "./external-action-contract";

export const EXTERNAL_ACTION_SANDBOX_FIXTURE_SOURCE =
  "fixture:features/agent/external-action-fixtures.ts" as const;

const collectedAt = "2026-06-25T23:58:00.000+09:00";
const recordedAt = "2026-06-25T23:59:00.000+09:00";

export const mockExternalActionSandboxProvenance: ExternalActionSandboxProvenance =
  {
    source: EXTERNAL_ACTION_SANDBOX_FIXTURE_SOURCE,
    sourceLabel: "Mock external action sandbox fixture",
    evidenceIds: [
      "evidence:external-action:message:maya-chen",
      "evidence:external-action:calendar:diego-rivera",
      "evidence:external-action:notification:aiko-tanaka",
    ],
    collectedAt,
    privacy: "demo-external-action-sandbox-only",
    generationMethod: "fixture",
    explicitConfirmationRequired: true,
    explicitConfirmationRecorded: true,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    aiProviderRequested: false,
    messageProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    pushProviderRequested: false,
    deviceRequested: false,
  };

export const mockExternalActionSandboxNoOpProvenance: ExternalActionSandboxProvenance =
  {
    ...mockExternalActionSandboxProvenance,
    sourceLabel: "Mock external action sandbox no-op result",
    generationMethod: "rule-based-no-op",
  };

export const mockExternalActionSandboxFailureProvenance: ExternalActionSandboxProvenance =
  {
    ...mockExternalActionSandboxProvenance,
    sourceLabel: "Mock external action sandbox controlled failure",
    evidenceIds: ["evidence:external-action:controlled-failure"],
    generationMethod: "rule-based-state",
    explicitConfirmationRecorded: false,
  };

const emptyStateProvenance: ExternalActionSandboxProvenance = {
  ...mockExternalActionSandboxProvenance,
  sourceLabel: "Mock external action sandbox empty audit state",
  evidenceIds: ["evidence:external-action:empty-state"],
  generationMethod: "rule-based-state",
  explicitConfirmationRecorded: false,
};

const pendingStateProvenance: ExternalActionSandboxProvenance = {
  ...mockExternalActionSandboxProvenance,
  sourceLabel: "Mock external action sandbox pending confirmation state",
  evidenceIds: ["evidence:external-action:pending-state"],
  generationMethod: "rule-based-state",
  explicitConfirmationRecorded: false,
};

export const mockExternalActionRelationshipContexts = {
  send_message: {
    contactLabel: "Maya Chen",
    eventLabel: "Tokyo Climate Operators Salon",
    connectionOrigin:
      "Met during a pilot reliability discussion after the climate operator demo.",
    followupRationale:
      "Send the reliability memo while the pilot-scope question is still fresh.",
    sourceContextIds: [
      "relationship:maya-chen:pilot-reliability",
      "event:tokyo-climate-operators-salon",
    ],
  },
  create_calendar_event: {
    contactLabel: "Diego Rivera",
    eventLabel: "SaaS Revenue Council Breakfast",
    connectionOrigin:
      "Introduced by Yuki during a partner-pipeline discussion.",
    followupRationale:
      "Reserve a short scoping hold before the partner-intro window closes.",
    sourceContextIds: [
      "relationship:diego-rivera:partner-pipeline",
      "event:saas-revenue-council-breakfast",
    ],
  },
  deliver_notification: {
    contactLabel: "Aiko Tanaka",
    eventLabel: "Climate Operator Breakfast",
    connectionOrigin:
      "Known event host tied to the readiness checklist for the breakfast.",
    followupRationale:
      "Remind the operator to review Aiko's context before the event starts.",
    sourceContextIds: [
      "relationship:aiko-tanaka:event-host",
      "event:climate-operator-breakfast",
    ],
  },
} as const satisfies Record<
  ExternalActionSandboxActionType,
  ExternalActionRelationshipContext
>;

export const mockExternalActionSandboxActions: readonly ExternalActionSandboxAction[] =
  [
    {
      actionId: "sandbox-message-demo-1",
      actionType: "send_message",
      label: "No-op send message",
      targetLabel: "Maya Chen",
      relationshipContext: mockExternalActionRelationshipContexts.send_message,
      providerKind: "message_provider",
      requestedEffect:
        "Send Maya the promised reliability memo and pilot-scope question.",
      suppressedEffect:
        "Message provider request suppressed by the mock external action sandbox.",
      noOp: true,
      confirmationRequired: true,
      confirmationId: "confirmation:external-action:message:maya-chen",
      evidenceIds: ["evidence:external-action:message:maya-chen"],
      provenance: mockExternalActionSandboxProvenance,
    },
    {
      actionId: "sandbox-calendar-demo-1",
      actionType: "create_calendar_event",
      label: "No-op create calendar event",
      targetLabel: "Diego Rivera",
      relationshipContext:
        mockExternalActionRelationshipContexts.create_calendar_event,
      providerKind: "calendar_provider",
      requestedEffect:
        "Create a 20-minute pilot scoping hold with Diego next week.",
      suppressedEffect:
        "Calendar write suppressed by the mock external action sandbox.",
      noOp: true,
      confirmationRequired: true,
      confirmationId: "confirmation:external-action:calendar:diego-rivera",
      evidenceIds: ["evidence:external-action:calendar:diego-rivera"],
      provenance: mockExternalActionSandboxProvenance,
    },
    {
      actionId: "sandbox-notification-demo-1",
      actionType: "deliver_notification",
      label: "No-op notification delivery",
      targetLabel: "Aiko Tanaka",
      relationshipContext:
        mockExternalActionRelationshipContexts.deliver_notification,
      providerKind: "notification_provider",
      requestedEffect:
        "Deliver a readiness reminder before the Climate Operator Breakfast.",
      suppressedEffect:
        "Notification and push delivery suppressed by the mock external action sandbox.",
      noOp: true,
      confirmationRequired: true,
      confirmationId: "confirmation:external-action:notification:aiko-tanaka",
      evidenceIds: ["evidence:external-action:notification:aiko-tanaka"],
      provenance: mockExternalActionSandboxProvenance,
    },
  ] as const;

function auditRecord(
  action: ExternalActionSandboxAction,
  auditId: string,
): ExternalActionAuditRecord {
  return {
    auditId,
    actionId: action.actionId,
    actionType: action.actionType,
    providerKind: action.providerKind,
    actorLabel: "Mock operator",
    targetLabel: action.targetLabel,
    relationshipContext: action.relationshipContext,
    noOp: true,
    sideEffectExecuted: false,
    productionAuditPersisted: false,
    recordedAt,
    evidenceIds: action.evidenceIds,
    provenance: mockExternalActionSandboxNoOpProvenance,
  };
}

export const mockExternalActionAuditRecords: readonly ExternalActionAuditRecord[] =
  [
    auditRecord(
      mockExternalActionSandboxActions[0],
      "audit:external-action:message:maya-chen",
    ),
    auditRecord(
      mockExternalActionSandboxActions[1],
      "audit:external-action:calendar:diego-rivera",
    ),
    auditRecord(
      mockExternalActionSandboxActions[2],
      "audit:external-action:notification:aiko-tanaka",
    ),
  ] as const;

function noOpPayload(
  action: ExternalActionSandboxAction,
  audit: ExternalActionAuditRecord,
): ExternalActionNoOpPayload {
  return {
    state: "success",
    actionId: action.actionId,
    actionType: action.actionType,
    label: action.label,
    targetLabel: action.targetLabel,
    actorLabel: "Mock operator",
    providerKind: action.providerKind,
    relationshipContext: action.relationshipContext,
    noOp: true,
    providerRequestIssued: false,
    externalSideEffectExecuted: false,
    auditRecord: audit,
    evidenceIds: action.evidenceIds,
    provenance: mockExternalActionSandboxNoOpProvenance,
    nextAction:
      "Review the side-effect audit record and keep the live provider switch disabled until replacement tests pass.",
  };
}

export const mockSendMessageNoOpFixture: ExternalActionNoOpPayload = noOpPayload(
  mockExternalActionSandboxActions[0],
  mockExternalActionAuditRecords[0],
);

export const mockCreateCalendarEventNoOpFixture: ExternalActionNoOpPayload =
  noOpPayload(
    mockExternalActionSandboxActions[1],
    mockExternalActionAuditRecords[1],
  );

export const mockNotificationDeliveryNoOpFixture: ExternalActionNoOpPayload =
  noOpPayload(
    mockExternalActionSandboxActions[2],
    mockExternalActionAuditRecords[2],
  );

export const mockExternalActionSandboxFixture: ExternalActionSandboxPayload = {
  state: "success",
  actions: mockExternalActionSandboxActions,
  auditRecords: mockExternalActionAuditRecords,
  summary:
    "Mock external action sandbox replaces message sending, calendar writes, email sends, push delivery, notification delivery, and side-effect audit records with deterministic no-op fixtures.",
  provenance: mockExternalActionSandboxProvenance,
  nextAction:
    "Keep every participant-facing action in the sandbox until explicit confirmation, privacy review, and live replacement tests are ready.",
};

export const mockEmptyExternalActionAuditFixture: ExternalActionSandboxPayload =
  {
    state: "empty",
    actions: [],
    auditRecords: [],
    summary:
      "The local external action sandbox has no side-effect audit records because no confirmed action has been staged.",
    provenance: emptyStateProvenance,
    nextAction:
      "Stage a confirmed action before expecting a side-effect audit record.",
  };

export const mockPendingExternalActionSandboxFixture: ExternalActionSandboxPayload =
  {
    state: "pending",
    actions: [],
    auditRecords: [],
    summary:
      "The local external action sandbox is waiting for an explicit confirmation checkpoint.",
    provenance: pendingStateProvenance,
    nextAction:
      "Require explicit confirmation before the sandbox can create any no-op audit record.",
  };
