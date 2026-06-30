import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

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
  source: string;
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
