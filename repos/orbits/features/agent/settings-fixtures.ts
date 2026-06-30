import type {
  AgentAutonomyConfirmationRule,
  AgentAutonomyLevel,
  AgentAutonomyLevelBoundary,
  AgentAutonomyRelationshipWorkflowProtection,
  AgentAutonomySettingsPayload,
  AgentAutonomySettingsProvenance,
  AgentAutonomySettingsUpdatePayload,
} from "./settings-contract";

export const AGENT_AUTONOMY_SETTINGS_FIXTURE_SOURCE =
  "fixture:features/agent/settings-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T23:55:00.000+09:00";
const updateCollectedAt = "2026-06-25T23:56:00.000+09:00";

export const mockAgentAutonomySettingsProvenance: AgentAutonomySettingsProvenance =
  {
    source: AGENT_AUTONOMY_SETTINGS_FIXTURE_SOURCE,
    sourceLabel: "Mock agent autonomy settings fixture",
    evidenceIds: [
      "evidence:agent-autonomy:low-boundary",
      "evidence:agent-autonomy:medium-boundary",
      "evidence:agent-autonomy:high-boundary",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-agent-autonomy-settings-only",
    generationMethod: "fixture",
    autonomousExecutionPolicyEvaluated: false,
    autonomousExecutionStarted: false,
    scheduledLiveAgentJobRegistered: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };

export const mockAgentAutonomySettingsFailureProvenance: AgentAutonomySettingsProvenance =
  {
    ...mockAgentAutonomySettingsProvenance,
    sourceLabel: "Mock agent autonomy settings controlled failure",
    evidenceIds: ["evidence:agent-autonomy:controlled-failure"],
    generationMethod: "rule-based-settings-state",
  };

const emptyStateProvenance: AgentAutonomySettingsProvenance = {
  ...mockAgentAutonomySettingsProvenance,
  sourceLabel: "Mock empty agent autonomy settings state",
  evidenceIds: ["evidence:agent-autonomy:empty-state"],
  generationMethod: "rule-based-settings-state",
};

const pendingStateProvenance: AgentAutonomySettingsProvenance = {
  ...mockAgentAutonomySettingsProvenance,
  sourceLabel: "Mock pending agent autonomy settings state",
  evidenceIds: ["evidence:agent-autonomy:pending-state"],
  generationMethod: "rule-based-settings-state",
};

const updateProvenance: AgentAutonomySettingsProvenance = {
  ...mockAgentAutonomySettingsProvenance,
  sourceLabel: "Mock agent autonomy settings update",
  evidenceIds: ["evidence:agent-autonomy:settings-update"],
  collectedAt: updateCollectedAt,
  generationMethod: "rule-based-settings-update",
};

export const mockAgentAutonomyLevels: readonly AgentAutonomyLevelBoundary[] = [
  {
    level: "low",
    label: "Low autonomy",
    boundary:
      "Only surfaces manual checklists and relationship reminders; no autonomous execution or provider-backed action can start.",
    operatorControl:
      "The operator chooses every next step and writes or schedules actions outside the mock.",
    autonomousExecutionAllowed: false,
    scheduledLiveAgentJobsAllowed: false,
    confirmationRequiredBeforeExternalAction: true,
    rules: [
      "Suggest one sourced next step at a time.",
      "Never draft outbound copy without a user request.",
      "Never register live jobs or external actions.",
    ],
    blockedLiveCapabilities: [
      "database writes",
      "AI provider calls",
      "calendar actions",
      "email actions",
      "notification delivery",
      "device access",
    ],
  },
  {
    level: "medium",
    label: "Medium autonomy",
    boundary:
      "May rank sourced next steps and prepare local drafts; every send, calendar change, notification, and database mutation remains blocked.",
    operatorControl:
      "The operator reviews ranked recommendations and explicitly confirms any later external action.",
    autonomousExecutionAllowed: false,
    scheduledLiveAgentJobsAllowed: false,
    confirmationRequiredBeforeExternalAction: true,
    rules: [
      "Rank recommendations from deterministic fixtures.",
      "Prepare local drafts only when source evidence is visible.",
      "Keep external writes behind confirmation.",
    ],
    blockedLiveCapabilities: [
      "database reads",
      "database writes",
      "AI provider calls",
      "calendar writes",
      "email sends",
      "notification delivery",
      "device access",
    ],
  },
  {
    level: "high",
    label: "High autonomy",
    boundary:
      "Prepares drafts and staged recommendations only; explicit confirmation is still required before external action.",
    operatorControl:
      "The operator can review prepared plans, but no live action executes from the mock.",
    autonomousExecutionAllowed: false,
    scheduledLiveAgentJobsAllowed: false,
    confirmationRequiredBeforeExternalAction: true,
    rules: [
      "Stage action plans from local fixtures.",
      "Explain each recommendation with evidence ids.",
      "Block live jobs and external provider calls until a future confirmation guard approves them.",
    ],
    blockedLiveCapabilities: [
      "database reads",
      "database writes",
      "AI provider calls",
      "calendar scheduling",
      "email sending",
      "notification delivery",
      "device access",
    ],
  },
] as const;

export const mockAgentAutonomyConfirmationRules: readonly AgentAutonomyConfirmationRule[] =
  [
    {
      ruleId: "agent-autonomy-confirm-low",
      level: "low",
      actionType: "manual_next_step",
      requiresConfirmation: true,
      consequence:
        "Low autonomy can only display sourced reminders after the operator confirms the context is relevant.",
    },
    {
      ruleId: "agent-autonomy-confirm-medium",
      level: "medium",
      actionType: "draft_or_ranked_recommendation",
      requiresConfirmation: true,
      consequence:
        "Medium autonomy can rank and draft locally, but all external side effects remain blocked.",
    },
    {
      ruleId: "agent-autonomy-confirm-high",
      level: "high",
      actionType: "staged_external_action",
      requiresConfirmation: true,
      consequence:
        "High autonomy can prepare staged action plans only after explicit confirmation is recorded before any future live external action.",
    },
  ] as const;

export const mockAgentAutonomyRelationshipWorkflowProtections: readonly AgentAutonomyRelationshipWorkflowProtection[] =
  [
    {
      workflowId: "participant-facing-followup",
      label: "Participant-facing follow-up",
      protectedContext:
        "Outbound follow-up copy, event context, and relationship evidence that a recipient could see or infer.",
      confirmationReason:
        "A user must confirm the contact, source evidence, and tone before any future email send or message handoff.",
      blockedUntilConfirmed: [
        "email send",
        "message handoff",
        "AI rewrite",
        "database mutation",
      ],
    },
    {
      workflowId: "relationship-reminder",
      label: "Relationship reminder timing",
      protectedContext:
        "Reminder timing, relationship priority, and calendar-sensitive context derived from local mock evidence.",
      confirmationReason:
        "A user must confirm timing and relevance before any future notification delivery or calendar write.",
      blockedUntilConfirmed: [
        "notification delivery",
        "calendar write",
        "scheduled live job",
        "database mutation",
      ],
    },
    {
      workflowId: "relationship-data-workflow",
      label: "Relationship data updates",
      protectedContext:
        "Contact records, connection status, relationship evidence and context labels, and task ownership.",
      confirmationReason:
        "A user must confirm provenance and intent before any future relationship data workflow can write to live storage.",
      blockedUntilConfirmed: [
        "database mutation",
        "production audit log write",
        "provider sync",
        "scheduled live job",
      ],
    },
  ] as const;

export const mockAgentAutonomySettingsFixture: AgentAutonomySettingsPayload = {
  state: "success",
  currentLevel: "medium",
  levels: mockAgentAutonomyLevels,
  confirmationRules: mockAgentAutonomyConfirmationRules,
  relationshipWorkflowProtections:
    mockAgentAutonomyRelationshipWorkflowProtections,
  summary:
    "Mock autonomy settings expose low, medium, and high boundaries without autonomous execution policies, scheduled live jobs, provider calls, devices, databases, or external networks.",
  provenance: mockAgentAutonomySettingsProvenance,
  nextAction:
    "Choose an autonomy level, inspect its confirmation rule, and keep all external actions behind explicit confirmation.",
};

export const mockEmptyAgentAutonomySettingsFixture: AgentAutonomySettingsPayload =
  {
    state: "empty",
    currentLevel: null,
    levels: [],
    confirmationRules: [],
    relationshipWorkflowProtections: [],
    summary:
      "No local mock autonomy setting has been selected for this scenario.",
    provenance: emptyStateProvenance,
    nextAction:
      "Choose an autonomy level before staging any agent setting in the mock boundary.",
  };

export const mockPendingAgentAutonomySettingsFixture: AgentAutonomySettingsPayload =
  {
    state: "pending",
    currentLevel: "medium",
    levels: mockAgentAutonomyLevels,
    confirmationRules: mockAgentAutonomyConfirmationRules,
    relationshipWorkflowProtections:
      mockAgentAutonomyRelationshipWorkflowProtections,
    summary:
      "Mock autonomy settings are waiting for a local confirmation checkpoint.",
    provenance: pendingStateProvenance,
    nextAction:
      "Keep the setting pending until the operator reviews confirmation rules and provider boundaries.",
  };

function levelBoundary(level: AgentAutonomyLevel): AgentAutonomyLevelBoundary {
  return mockAgentAutonomyLevels.find((candidate) => candidate.level === level)!;
}

function updateFixture(
  level: AgentAutonomyLevel,
  actorLabel: string,
  confirmationSummary: string,
): AgentAutonomySettingsUpdatePayload {
  return {
    state: "success",
    currentLevel: level,
    requestedLevel: level,
    actorLabel,
    updatedAt: updateCollectedAt,
    confirmationSummary,
    activeBoundary: levelBoundary(level),
    confirmationRules: mockAgentAutonomyConfirmationRules.filter(
      (rule) => rule.level === level,
    ),
    evidenceIds: updateProvenance.evidenceIds,
    provenance: updateProvenance,
    nextAction:
      "Render the saved mock setting and keep every external action behind explicit confirmation.",
    externalSideEffectExecuted: false,
    autonomousExecutionStarted: false,
    scheduledLiveAgentJobRegistered: false,
  };
}

export const mockUpdatedLowAgentAutonomySettingsFixture = updateFixture(
  "low",
  "Mock operator",
  "Low autonomy saved locally; all external actions stay blocked and every relationship step remains manual.",
);

export const mockUpdatedMediumAgentAutonomySettingsFixture = updateFixture(
  "medium",
  "Mock operator",
  "Medium autonomy saved locally; ranked recommendations and local drafts still require explicit confirmation before external action.",
);

export const mockUpdatedHighAgentAutonomySettingsFixture = updateFixture(
  "high",
  "Sprint evaluator",
  "High autonomy saved locally; drafts and staged recommendations still require explicit confirmation before external action.",
);
