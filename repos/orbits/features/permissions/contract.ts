import type { AppErrorCode } from "../../shared/errors/app-error";

// Permissions contract 描述分阶段授权 UI 的状态机。
// 它只记录“准备/待审核/被依赖阻塞”等状态，不直接调用系统或第三方权限 API。
export const PERMISSION_CAPABILITIES = [
  "contacts",
  "calendar",
  "email",
  "notifications",
  "camera",
  "business-card-scan",
  "event-data",
  "chat-analysis",
] as const;

export const PERMISSION_STATE_ERROR_CODES = [
  "PERMISSION_CAPABILITY_NOT_FOUND",
  "PERMISSION_REQUEST_NOT_ALLOWED",
  "PERMISSION_STATE_MOCK_FAILED",
] as const;

export type PermissionCapability = (typeof PERMISSION_CAPABILITIES)[number];

export type PermissionStateErrorCode =
  (typeof PERMISSION_STATE_ERROR_CODES)[number];

export type PermissionStateScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type PermissionRequestScenario =
  | PermissionStateScenario
  | "blocked";

export type PermissionBoundaryState = "success" | "empty" | "pending";

export type PermissionStatus =
  | "authorized"
  | "not_requested"
  | "pending"
  | "denied"
  | "available_after_camera";

export type PermissionAuthorizationStage =
  | "ready"
  | "not-started"
  | "staged-review"
  | "blocked-by-dependency";

export type PermissionIntent =
  | "sync-contacts"
  | "connect-event-calendar"
  | "review-email-context"
  | "enable-notifications"
  | "scan-business-card"
  | "import-event-data"
  | "analyze-chat-context";

// list 输入只需要 scenario；request 输入明确 capability 和用户意图。
export interface PermissionStateInput {
  scenario?: PermissionStateScenario | string | null;
}

export interface PermissionRequestInput {
  capability: PermissionCapability | string;
  intent?: PermissionIntent | string | null;
  scenario?: PermissionRequestScenario | string | null;
}

// 权限错误定义用于把未知 capability、非法请求和 mock failure 区分开。
export interface PermissionStateErrorDefinition {
  code: PermissionStateErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const PERMISSION_STATE_ERROR_DEFINITIONS = {
  PERMISSION_CAPABILITY_NOT_FOUND: {
    code: "PERMISSION_CAPABILITY_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock permission capability matches that request.",
    recovery:
      "Keep the staged authorization unchanged and return a missing capability envelope.",
  },
  PERMISSION_REQUEST_NOT_ALLOWED: {
    code: "PERMISSION_REQUEST_NOT_ALLOWED",
    appCode: "FORBIDDEN",
    message:
      "That mock permission request is not allowed for the staged authorization boundary.",
    recovery:
      "Render the controlled failure and keep the operator inside the mock review path.",
  },
  PERMISSION_STATE_MOCK_FAILED: {
    code: "PERMISSION_STATE_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock permission state boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid attempting a live account, device, calendar, email, notification, or analysis call.",
  },
} as const satisfies Record<
  PermissionStateErrorCode,
  PermissionStateErrorDefinition
>;

// provenance 说明权限状态来自 staged authorization fixture。
export interface PermissionStateProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-permission-state-only";
  generationMethod: "fixture" | "rule-based-staged-authorization";
}

// PermissionEvidence 让 UI 能解释为什么某个权限被建议或被阻塞。
export interface PermissionEvidence {
  evidenceId: string;
  sourceLabel: string;
  excerpt: string;
  collectedAt: string;
}

// PermissionStateRecord 是单个 capability 的展示状态。
export interface PermissionStateRecord {
  capability: PermissionCapability;
  label: string;
  status: PermissionStatus;
  authorizationStage: PermissionAuthorizationStage;
  actionLabel: string;
  requiredFor: string;
  rationale: string;
  evidence: readonly PermissionEvidence[];
  provenance: PermissionStateProvenance;
}

// PermissionStatePayload 是权限设置页的列表读模型。
export interface PermissionStatePayload {
  state: PermissionBoundaryState;
  permissions: readonly PermissionStateRecord[];
  summary: string;
  provenance: PermissionStateProvenance;
  nextAction: string;
}

// PermissionRequestRecord 表示一个等待复核的授权请求，不替代真实 provider flow。
export interface PermissionRequestRecord {
  id: string;
  capability: PermissionCapability;
  intent: PermissionIntent;
  status: "pending";
  requestedAt: string;
  replacesProviderFlow: true;
  reviewLabel: string;
  evidenceIds: readonly string[];
}

export interface PermissionRequestPayload {
  state: "pending";
  request: PermissionRequestRecord;
  permission: PermissionStateRecord;
  provenance: PermissionStateProvenance;
  nextAction: string;
}

export interface PermissionStateSuccess {
  success: true;
  data: PermissionStatePayload;
}

export interface PermissionRequestSuccess {
  success: true;
  data: PermissionRequestPayload;
}

export interface PermissionStateFailure {
  success: false;
  error: PermissionStateErrorDefinition & {
    state: "failure";
    provenance: PermissionStateProvenance;
    evidenceIds: readonly string[];
  };
}

export type PermissionStateResult =
  | PermissionStateSuccess
  | PermissionStateFailure;

export type PermissionRequestResult =
  | PermissionRequestSuccess
  | PermissionStateFailure;
