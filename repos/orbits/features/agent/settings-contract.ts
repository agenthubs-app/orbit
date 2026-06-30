import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const AGENT_AUTONOMY_SETTINGS_FIXTURE_SOURCE =
  "fixture:features/agent/settings-contract.ts" as const;

// Agent Autonomy Settings contract 描述 agent 自主级别和确认规则。
// 当前设置只影响本地展示/策略说明，不会启动 live agent job 或外部动作。
export const AGENT_AUTONOMY_LEVELS = ["low", "medium", "high"] as const;

export const AGENT_AUTONOMY_SETTINGS_ERROR_CODES = [
  "AGENT_AUTONOMY_SETTINGS_INVALID_LEVEL",
  "AGENT_AUTONOMY_SETTINGS_EMPTY",
  "AGENT_AUTONOMY_SETTINGS_PENDING",
  "AGENT_AUTONOMY_SETTINGS_MOCK_FAILED",
] as const;

export type AgentAutonomyLevel = (typeof AGENT_AUTONOMY_LEVELS)[number];

export type AgentAutonomySettingsErrorCode =
  (typeof AGENT_AUTONOMY_SETTINGS_ERROR_CODES)[number];

export type AgentAutonomySettingsScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type AgentAutonomySettingsState = "success" | "empty" | "pending";
// update 输入只允许 low/medium/high；actorLabel 用于记录谁改了策略。

export interface AgentAutonomySettingsInput {
  scenario?: AgentAutonomySettingsScenario | string | null;
}

export interface AgentAutonomySettingsUpdateInput {
  requestedLevel?: AgentAutonomyLevel | string | null;
  actorLabel?: string | null;
  scenario?: AgentAutonomySettingsScenario | string | null;
}

export interface AgentAutonomySettingsErrorDefinition {
  code: AgentAutonomySettingsErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}
// settings 错误定义保证无效级别或 pending 状态不会触发 autonomous execution。

export const AGENT_AUTONOMY_SETTINGS_ERROR_DEFINITIONS = {
  AGENT_AUTONOMY_SETTINGS_INVALID_LEVEL: {
    code: "AGENT_AUTONOMY_SETTINGS_INVALID_LEVEL",
    appCode: "VALIDATION_ERROR",
    message: "Agent autonomy level must be low, medium, or high.",
    recovery:
      "Choose low, medium, or high before saving the local autonomy settings fixture.",
  },
  AGENT_AUTONOMY_SETTINGS_EMPTY: {
    code: "AGENT_AUTONOMY_SETTINGS_EMPTY",
    appCode: "CONFLICT",
    message:
      "No mock agent autonomy settings are available for this scenario.",
    recovery:
      "Render the empty state and ask the operator to choose an autonomy level before any agent policy can be staged.",
  },
  AGENT_AUTONOMY_SETTINGS_PENDING: {
    code: "AGENT_AUTONOMY_SETTINGS_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock agent autonomy settings boundary is waiting for local confirmation review.",
    recovery:
      "Render the pending state and avoid autonomous execution, scheduled jobs, external networks, providers, devices, databases, or notifications.",
  },
  AGENT_AUTONOMY_SETTINGS_MOCK_FAILED: {
    code: "AGENT_AUTONOMY_SETTINGS_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock agent autonomy settings boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry live agent jobs, AI providers, calendars, email, notifications, devices, databases, or external networks.",
  },
} as const satisfies Record<
  AgentAutonomySettingsErrorCode,
  AgentAutonomySettingsErrorDefinition
>;
// provenance 是自主策略的安全账本：策略可被展示，但没有注册真实任务。

export interface AgentAutonomySettingsProvenance {
  source: typeof AGENT_AUTONOMY_SETTINGS_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-agent-autonomy-settings-only";
  generationMethod:
    | "fixture"
    | "rule-based-settings-state"
    | "rule-based-settings-update";
  autonomousExecutionPolicyEvaluated: false;
  autonomousExecutionStarted: false;
  scheduledLiveAgentJobRegistered: false;
  externalSideEffectExecuted: false;
  externalNetworkRequested: false;
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
}
// LevelBoundary 描述每个自主级别允许/阻止的能力，供设置页直接渲染。

export interface AgentAutonomyLevelBoundary {
  level: AgentAutonomyLevel;
  label: string;
  boundary: string;
  operatorControl: string;
  autonomousExecutionAllowed: false;
  scheduledLiveAgentJobsAllowed: false;
  confirmationRequiredBeforeExternalAction: boolean;
  rules: readonly string[];
  blockedLiveCapabilities: readonly string[];
}

export interface AgentAutonomyConfirmationRule {
  ruleId: string;
  level: AgentAutonomyLevel;
  actionType: string;
  requiresConfirmation: boolean;
  consequence: string;
}
// WorkflowProtection 说明哪些关系工作流必须保持人工确认。

export interface AgentAutonomyRelationshipWorkflowProtection {
  workflowId:
    | "participant-facing-followup"
    | "relationship-reminder"
    | "relationship-data-workflow";
  label: string;
  protectedContext: string;
  confirmationReason: string;
  blockedUntilConfirmed: readonly string[];
}

export interface AgentAutonomySettingsPayload {
  state: AgentAutonomySettingsState;
  currentLevel: AgentAutonomyLevel | null;
  levels: readonly AgentAutonomyLevelBoundary[];
  confirmationRules: readonly AgentAutonomyConfirmationRule[];
  relationshipWorkflowProtections: readonly AgentAutonomyRelationshipWorkflowProtection[];
  summary: string;
  provenance: AgentAutonomySettingsProvenance;
  nextAction: string;
}

export interface AgentAutonomySettingsUpdatePayload {
  state: "success";
  currentLevel: AgentAutonomyLevel;
  requestedLevel: AgentAutonomyLevel;
  actorLabel: string;
  updatedAt: string;
  confirmationSummary: string;
  activeBoundary: AgentAutonomyLevelBoundary;
  confirmationRules: readonly AgentAutonomyConfirmationRule[];
  evidenceIds: readonly string[];
  provenance: AgentAutonomySettingsProvenance;
  nextAction: string;
  externalSideEffectExecuted: false;
  autonomousExecutionStarted: false;
  scheduledLiveAgentJobRegistered: false;
}

export interface AgentAutonomySettingsSuccess {
  success: true;
  data: AgentAutonomySettingsPayload;
}

export interface AgentAutonomySettingsUpdateSuccess {
  success: true;
  data: AgentAutonomySettingsUpdatePayload;
}

export interface AgentAutonomySettingsFailure {
  success: false;
  error: AgentAutonomySettingsErrorDefinition & {
    state: "failure";
    provenance: AgentAutonomySettingsProvenance;
    evidenceIds: readonly string[];
  };
}

export type AgentAutonomySettingsResult =
  | AgentAutonomySettingsSuccess
  | AgentAutonomySettingsFailure;

export type AgentAutonomySettingsUpdateResult =
  | AgentAutonomySettingsUpdateSuccess
  | AgentAutonomySettingsFailure;

export interface AgentAutonomySettingsService {
  getSettings: (
    input?: AgentAutonomySettingsInput,
  ) => AgentAutonomySettingsResult;
  updateSettings: (
    input: AgentAutonomySettingsUpdateInput,
  ) => AgentAutonomySettingsUpdateResult;
}

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

export function agentAutonomySettingsFailureToAppError(
  failure: AgentAutonomySettingsFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function agentAutonomySettingsFailureContext(
  failure: AgentAutonomySettingsFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    agentAutonomySettingsErrorCode: failure.error.code,
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock agent autonomy settings failure came from deterministic fixture rules.",
    service: "agent-autonomy-settings-mock",
  };
}
