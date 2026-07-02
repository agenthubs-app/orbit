import type { AppErrorCode } from "../../shared/errors/app-error";

// Confirmation Guard contract 描述所有敏感动作前的确认门。
// 它覆盖发送消息、添加联系人、创建日历事件、更新 profile 等动作，但不执行这些动作。
export const SENSITIVE_ACTION_KINDS = [
  "send-message",
  "add-contact",
  "create-calendar-event",
  "update-profile",
] as const;

export const CONFIRMATION_GUARD_ERROR_CODES = [
  "CONFIRMATION_REQUIREMENT_NOT_FOUND",
  "CONFIRMATION_REQUIREMENT_ALREADY_RESOLVED",
  "CONFIRMATION_DECISION_NOT_ALLOWED",
  "CONFIRMATION_GUARD_MOCK_FAILED",
] as const;

export type SensitiveActionKind = (typeof SENSITIVE_ACTION_KINDS)[number];

export type ConfirmationGuardErrorCode =
  (typeof CONFIRMATION_GUARD_ERROR_CODES)[number];

export type ConfirmationGuardScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ConfirmationDecisionScenario =
  | "success"
  | "failure"
  | "blocked";

export type ConfirmationRequirementState = "success" | "empty" | "pending";

export type ConfirmationRequirementStatus =
  | "pending_confirmation"
  | "approved"
  | "rejected";

export type ConfirmationDecisionStatus = "approved" | "rejected";

// GuardInput 读取确认队列；DecisionInput 记录用户批准或拒绝某个确认项。
export interface ConfirmationGuardInput {
  scenario?: ConfirmationGuardScenario | string | null;
}

export interface ConfirmationDecisionInput {
  confirmationId: string;
  actorLabel?: string | null;
  scenario?: ConfirmationDecisionScenario | string | null;
}

export interface ConfirmationGuardErrorDefinition {
  code: ConfirmationGuardErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 确认错误定义确保找不到、已处理或被阻止时敏感动作仍保持未执行。
export const CONFIRMATION_GUARD_ERROR_DEFINITIONS = {
  CONFIRMATION_REQUIREMENT_NOT_FOUND: {
    code: "CONFIRMATION_REQUIREMENT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock confirmation requirement matches that id.",
    recovery:
      "Keep the sensitive action unexecuted and return the missing confirmation envelope.",
  },
  CONFIRMATION_REQUIREMENT_ALREADY_RESOLVED: {
    code: "CONFIRMATION_REQUIREMENT_ALREADY_RESOLVED",
    appCode: "CONFLICT",
    message: "That mock confirmation requirement has already been resolved.",
    recovery:
      "Refresh the confirmation queue before approving or rejecting another action.",
  },
  CONFIRMATION_DECISION_NOT_ALLOWED: {
    code: "CONFIRMATION_DECISION_NOT_ALLOWED",
    appCode: "FORBIDDEN",
    message:
      "That mock confirmation decision is not allowed for the guard boundary.",
    recovery:
      "Keep the action blocked and render the controlled decision failure.",
  },
  CONFIRMATION_GUARD_MOCK_FAILED: {
    code: "CONFIRMATION_GUARD_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock confirmation guard is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid any real send, write, event creation, or profile mutation.",
  },
} as const satisfies Record<
  ConfirmationGuardErrorCode,
  ConfirmationGuardErrorDefinition
>;

export interface ConfirmationGuardProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-confirmation-guard-only" | "live-confirmation-guard-policy";
  generationMethod:
    | "fixture"
    | "rule-based-confirmation-guard"
    | "live-policy-confirmation-guard";
}

export interface ConfirmationEvidence {
  evidenceId: string;
  sourceLabel: string;
  excerpt: string;
  collectedAt: string;
}

// SensitiveActionPreview 是“即将执行什么”的只读预览，externalActionExecuted=false。
export interface SensitiveActionPreview {
  kind: SensitiveActionKind;
  label: string;
  summary: string;
  requestedBy: string;
  targetLabel: string;
  payloadPreview: string;
  replacesOutboundAction: true;
  externalActionExecuted: false;
  mockEffect: string;
}

// ConfirmationRequirement 是一个等待用户决定的确认项。
export interface ConfirmationRequirement {
  id: string;
  status: ConfirmationRequirementStatus;
  action: SensitiveActionPreview;
  confirmationQuestion: string;
  riskLabel: string;
  guardReason: string;
  createdAt: string;
  evidence: readonly ConfirmationEvidence[];
  provenance: ConfirmationGuardProvenance;
}

export interface ConfirmationRequirementPayload {
  state: ConfirmationRequirementState;
  requirements: readonly ConfirmationRequirement[];
  summary: string;
  provenance: ConfirmationGuardProvenance;
  nextAction: string;
}

// DecisionRecord 只记录用户决定，不替代真实外部动作执行。
export interface ConfirmationDecisionRecord {
  id: string;
  confirmationId: string;
  status: ConfirmationDecisionStatus;
  actorLabel: string;
  decidedAt: string;
  replacesOutboundAction: true;
  externalActionExecuted: false;
  outcomeSummary: string;
}

export interface ConfirmationDecisionPayload {
  state: ConfirmationDecisionStatus;
  requirement: ConfirmationRequirement;
  decision: ConfirmationDecisionRecord;
  provenance: ConfirmationGuardProvenance;
  nextAction: string;
}

export interface ConfirmationRequirementSuccess {
  success: true;
  data: ConfirmationRequirementPayload;
}

export interface ConfirmationDecisionSuccess {
  success: true;
  data: ConfirmationDecisionPayload;
}

export interface ConfirmationGuardFailure {
  success: false;
  error: ConfirmationGuardErrorDefinition & {
    state: "failure";
    provenance: ConfirmationGuardProvenance;
    evidenceIds: readonly string[];
  };
}

export type ConfirmationRequirementResult =
  | ConfirmationRequirementSuccess
  | ConfirmationGuardFailure;

export type ConfirmationDecisionResult =
  | ConfirmationDecisionSuccess
  | ConfirmationGuardFailure;

export interface SensitiveActionConfirmationService {
  listConfirmationRequirements: (
    input?: ConfirmationGuardInput,
  ) => ConfirmationRequirementResult;
  approveConfirmation: (
    input: ConfirmationDecisionInput,
  ) => ConfirmationDecisionResult;
  rejectConfirmation: (
    input: ConfirmationDecisionInput,
  ) => ConfirmationDecisionResult;
}
