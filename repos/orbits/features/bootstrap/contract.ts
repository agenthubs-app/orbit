import type { ApiErrorContext } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// App Bootstrap contract 是应用首屏的聚合读模型。
// 它把账号、资料、活动、任务、权限、通知摘要打包成一个稳定 payload，
// 让 UI 启动时不必直接拼多个 feature service 的 fixture。
export const APP_BOOTSTRAP_ERROR_CODES = [
  "APP_BOOTSTRAP_MOCK_FAILED",
] as const;

export type AppBootstrapErrorCode = (typeof APP_BOOTSTRAP_ERROR_CODES)[number];

export type AppBootstrapScenario = "success" | "empty" | "pending" | "failure";

export type AppBootstrapState = "success" | "empty" | "pending";

// taskLimit 用于限制首屏待办数量；scenario 用于测试固定状态。
export interface AppBootstrapInput {
  scenario?: AppBootstrapScenario | string | null;
  taskLimit?: number | null;
}

// 统一错误定义：appCode 给 API envelope，recovery 给 UI/调试提示。
export interface AppBootstrapErrorDefinition {
  code: AppBootstrapErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const APP_BOOTSTRAP_ERROR_DEFINITIONS = {
  APP_BOOTSTRAP_MOCK_FAILED: {
    code: "APP_BOOTSTRAP_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The app bootstrap mock aggregator is pinned to a controlled failure scenario.",
    recovery:
      "Render the app bootstrap mock aggregator failure state and do not run server-side personalization, live database aggregation, provider calls, devices, or external networks.",
  },
} as const satisfies Record<AppBootstrapErrorCode, AppBootstrapErrorDefinition>;

export type AppBootstrapSourceReference = SourceReferenceDTO & {
  label: string;
  providerRecordId: string;
  generatedBy: "mock-app-bootstrap-rules";
};

// Bootstrap provenance 记录首屏聚合有没有触碰真实后端或外部 provider。
// 当前所有副作用标记都固定为 false，保证 mock 边界可审计。
export interface AppBootstrapProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-app-bootstrap-only";
  generationMethod:
    | "fixture"
    | "rule-based-empty-state"
    | "rule-based-pending-state"
    | "rule-based-task-limit"
    | "local-remote-store-query";
  serverSidePersonalizationExecuted: false;
  liveDatabaseAggregationExecuted: false;
  externalNetworkRequested: false;
  databaseReadExecuted: boolean;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
}

// 以下 AppBootstrap* 类型是首屏各区块的只读 DTO。
// 字段保留 evidenceIds/sourceRefs，便于 UI 展示“这条信息从哪里来”。
export interface AppBootstrapAccount {
  accountId: string;
  workspaceName: string;
  role: string;
  plan: "mock-pro";
  timezone: string;
  evidenceIds: readonly string[];
  sourceRefs: readonly AppBootstrapSourceReference[];
}

export interface AppBootstrapProfile {
  profileId: string;
  displayName: string;
  headline: string;
  relationshipGoal: string;
  homeMarket: string;
  preferredFollowUpWindow: string;
  evidenceIds: readonly string[];
  sourceRefs: readonly AppBootstrapSourceReference[];
}

export interface AppBootstrapUpcomingEvent {
  eventId: string;
  title: string;
  startsAt: string;
  locationLabel: string;
  readinessLabel: string;
  goal: string;
  evidenceIds: readonly string[];
  sourceRefs: readonly AppBootstrapSourceReference[];
}

export interface AppBootstrapConnectionSummary {
  totalContacts: number;
  totalConnections: number;
  evidenceBackedConnections: number;
  highValueRelationships: number;
  dormantContacts: number;
  evidenceIds: readonly string[];
}

export interface AppBootstrapPendingTask {
  taskId: string;
  title: string;
  dueLabel: string;
  contactName: string;
  recommendedAction: string;
  evidenceIds: readonly string[];
  sourceRefs: readonly AppBootstrapSourceReference[];
}

export type AppBootstrapAgentActionType =
  | "event_reminder"
  | "post_event_followup"
  | "dormant_activation";

export interface AppBootstrapAgentAction {
  actionId: string;
  actionType: AppBootstrapAgentActionType;
  title: string;
  recommendedAction: string;
  confirmationRequired: boolean;
  evidenceIds: readonly string[];
  sourceRefs: readonly AppBootstrapSourceReference[];
}

export interface AppBootstrapDashboardSummary {
  relationshipAssets: number;
  newContactsThisWeek: number;
  highValueRelationships: number;
  pendingFollowups: number;
  dormantContacts: number;
  evidenceIds: readonly string[];
}

export interface AppBootstrapPermissionSummary {
  grantedPermissions: readonly string[];
  stagedPermissions: readonly string[];
  blockedPermissions: readonly string[];
  nextPermissionPrompt: string;
  evidenceIds: readonly string[];
}

export interface AppBootstrapNotificationSummary {
  unreadCount: number;
  pendingDeliveryCount: number;
  quietHoursActive: boolean;
  latestNotification: string;
  evidenceIds: readonly string[];
}

// AppBootstrapPayload 是启动接口的唯一成功数据形状。
// 读者可以按页面区块理解：account/profile/events/tasks/actions/summaries。
export interface AppBootstrapPayload {
  state: AppBootstrapState;
  account: AppBootstrapAccount | null;
  profile: AppBootstrapProfile | null;
  upcomingEvents: readonly AppBootstrapUpcomingEvent[];
  connectionSummary: AppBootstrapConnectionSummary;
  pendingTasks: readonly AppBootstrapPendingTask[];
  topAgentActions: readonly AppBootstrapAgentAction[];
  dashboardSummary: AppBootstrapDashboardSummary;
  permissionSummary: AppBootstrapPermissionSummary;
  notificationSummary: AppBootstrapNotificationSummary;
  provenance: AppBootstrapProvenance;
  summary: string;
  nextAction: string;
}

export interface AppBootstrapSuccess {
  success: true;
  data: AppBootstrapPayload;
}

export interface AppBootstrapFailure {
  success: false;
  error: AppBootstrapErrorDefinition & {
    state: "failure";
    provenance: AppBootstrapProvenance;
    evidenceIds: readonly string[];
  };
}

export type AppBootstrapResult = AppBootstrapSuccess | AppBootstrapFailure;

export function appBootstrapFailureToAppError(
  result: AppBootstrapFailure,
): AppError {
  return new AppError(result.error.appCode, result.error.message);
}

export function appBootstrapFailureContext(
  result: AppBootstrapFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    appBootstrapErrorCode: result.error.code,
    boundary: "developer-admin",
    mode,
    privacy: "no-relationship-data",
    provenance:
      "Mock app bootstrap failure came from deterministic fixture rules.",
    service: "app-bootstrap-mock-aggregator",
  };
}
