import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Artifact contract 描述 Chat Agent 计划出的“可复核结果”。
// 它不是外部动作执行结果，而是展示给用户确认的面板数据。

// kind 决定使用哪类内部 artifact producer / 结果视图。
// live conversation service 会从模型 tool name 映射到这些 kind。
export const ORBIT_AGENT_ARTIFACT_KINDS = [
  "event_recommendations",
  "contact_recommendations",
  "email_context",
  "followup_queue",
  "relationship_chat_context",
  "generic",
] as const;

export const ORBIT_AGENT_ARTIFACT_STATUSES = [
  "pending",
  "ready",
  "failed",
] as const;

export const ORBIT_AGENT_ARTIFACT_SURFACES = [
  "side_panel",
  "inline_card",
  "full_page",
] as const;

export const ORBIT_AGENT_ARTIFACT_PRODUCERS = [
  "event_recommendation_producer",
  "contact_recommendation_producer",
  "followup_review_producer",
  "relationship_chat_review_producer",
] as const;

export const ORBIT_AGENT_ARTIFACT_ERROR_CODES = [
  "ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED",
  "ORBIT_AGENT_ARTIFACT_NOT_FOUND",
  "ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND",
  "ORBIT_AGENT_ARTIFACT_PENDING",
  "ORBIT_AGENT_ARTIFACT_MOCK_FAILED",
] as const;

export const ORBIT_AGENT_ARTIFACT_SCENARIOS = [
  "ready",
  "pending",
  "failure",
] as const;

export type OrbitAgentArtifactKind =
  (typeof ORBIT_AGENT_ARTIFACT_KINDS)[number];

export type OrbitAgentArtifactStatus =
  (typeof ORBIT_AGENT_ARTIFACT_STATUSES)[number];

export type OrbitAgentArtifactSurface =
  (typeof ORBIT_AGENT_ARTIFACT_SURFACES)[number];

export type OrbitAgentArtifactProducer =
  (typeof ORBIT_AGENT_ARTIFACT_PRODUCERS)[number];

export type OrbitAgentArtifactErrorCode =
  (typeof ORBIT_AGENT_ARTIFACT_ERROR_CODES)[number];

export type OrbitAgentArtifactScenario =
  (typeof ORBIT_AGENT_ARTIFACT_SCENARIOS)[number];

export type OrbitAgentArtifactWidthHint = "half" | "wide";

export type OrbitAgentArtifactSourceModule =
  | "orbit-ai"
  | "events"
  | "contacts"
  | "followups"
  | "chat";

export interface OrbitAgentArtifactPresentation {
  preferredSurface: OrbitAgentArtifactSurface;
  title: string;
  subtitle?: string;
  widthHint?: OrbitAgentArtifactWidthHint;
}

export interface OrbitAgentArtifactTaskContextMessage {
  role: "user" | "assistant" | "system" | string;
  content: string;
}

// TaskRequest 是创建 artifact 的输入，来自 Chat Agent 的 tool request。
// query 保留用户意图，presentation 只影响 UI 展示，不代表真实动作已执行。
export interface OrbitAgentArtifactTaskRequest {
  kind: OrbitAgentArtifactKind;
  query: string;
  contextMessages?: readonly OrbitAgentArtifactTaskContextMessage[];
  conversationId?: string | null;
  locale?: "zh" | "en" | string | null;
  presentation?: Partial<OrbitAgentArtifactPresentation>;
  scenario?: OrbitAgentArtifactScenario | string | null;
  artifactProducer?: OrbitAgentArtifactProducer;
  toolArguments?: Record<string, unknown> | null;
}

export interface OrbitAgentArtifactLookupInput {
  artifactId: string;
  scenario?: OrbitAgentArtifactScenario | string | null;
}

export interface OrbitAgentArtifactTask {
  artifactId: string;
  taskId: string;
  conversationId: string | null;
  kind: OrbitAgentArtifactKind;
  status: OrbitAgentArtifactStatus;
  query: string;
  artifactProducer: OrbitAgentArtifactProducer;
  presentation: OrbitAgentArtifactPresentation;
  createdAt: string;
  updatedAt: string;
}

// GeneratedView 是前端可以直接渲染的结构化结果。
// actions 只是待确认按钮；requiresConfirmation=true 时绝不能当成已执行动作。
export interface OrbitAgentArtifactGeneratedViewAction {
  actionId: string;
  label: string;
  requiresConfirmation: boolean;
}

export interface OrbitAgentArtifactGeneratedViewMetadata {
  label: string;
  value: string;
}

export interface OrbitAgentArtifactGeneratedViewItem {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  reason?: string;
  confidenceLabel?: string;
  metadata: readonly OrbitAgentArtifactGeneratedViewMetadata[];
  actions: readonly OrbitAgentArtifactGeneratedViewAction[];
  evidenceIds: readonly string[];
}

export interface OrbitAgentArtifactGeneratedViewSection {
  title: string;
  body?: string;
  items: readonly OrbitAgentArtifactGeneratedViewItem[];
}

export interface OrbitAgentArtifactGeneratedView {
  summary: string;
  sections: readonly OrbitAgentArtifactGeneratedViewSection[];
  emptyState?: string;
}

export interface OrbitAgentArtifactToolCallTrace {
  toolCallId: string;
  toolName: string;
  status: "planned" | "completed" | "skipped" | "failed";
  reason: string;
  evidenceIds: readonly string[];
}

export interface OrbitAgentArtifactProvenance {
  source: string;
  sourceModules: readonly OrbitAgentArtifactSourceModule[];
  evidenceIds: readonly string[];
  toolCalls: readonly OrbitAgentArtifactToolCallTrace[];
  generatedAt: string;
  generationMethod:
    | "fixture"
    | "rule-based-artifact-task"
    | "artifact-producer-generated-view";
}

// Artifact safety 明确限制当前 artifact 层：
// 只生成可复核视图，不进行真实写入、外部网络、邮件、日历或通知。
export interface OrbitAgentArtifactSafety {
  externalSideEffectsExecuted: false;
  domainWritesExecuted: false;
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  actionsRequireConfirmation: true;
}

export interface OrbitAgentArtifactResult {
  artifactId: string;
  taskId: string;
  kind: OrbitAgentArtifactKind;
  status: OrbitAgentArtifactStatus;
  presentation: OrbitAgentArtifactPresentation;
  generatedView: OrbitAgentArtifactGeneratedView | null;
  provenance: OrbitAgentArtifactProvenance;
  safety: OrbitAgentArtifactSafety;
  nextAction: string;
}

// Payload 拆成 task/result，方便 UI 同时展示“用户请求了什么”和“artifact producer 产出了什么”。
export interface OrbitAgentArtifactPayload {
  task: OrbitAgentArtifactTask;
  result: OrbitAgentArtifactResult;
}

export interface OrbitAgentArtifactSuccess {
  success: true;
  data: OrbitAgentArtifactPayload;
}

export interface OrbitAgentArtifactErrorDefinition {
  code: OrbitAgentArtifactErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export interface OrbitAgentArtifactFailure {
  success: false;
  error: OrbitAgentArtifactErrorDefinition & {
    artifactId?: string;
    taskId?: string;
    state: "failure";
    evidenceIds: readonly string[];
  };
}

export type OrbitAgentArtifactResultEnvelope =
  | OrbitAgentArtifactSuccess
  | OrbitAgentArtifactFailure;

export const ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS = {
  ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED: {
    code: "ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A non-empty artifact query is required before an artifact producer task can start.",
    recovery:
      "Ask the user for the recommendation or review goal before creating an artifact task.",
  },
  ORBIT_AGENT_ARTIFACT_NOT_FOUND: {
    code: "ORBIT_AGENT_ARTIFACT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No Orbit Agent artifact task matches that artifact id.",
    recovery:
      "Render an artifact recovery state and let the user retry the request from the chat turn.",
  },
  ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND: {
    code: "ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND",
    appCode: "VALIDATION_ERROR",
    message: "The requested Orbit Agent artifact kind is not supported by the mock artifact producer boundary.",
    recovery:
      "Use a supported artifact kind or render the generic artifact fallback.",
  },
  ORBIT_AGENT_ARTIFACT_PENDING: {
    code: "ORBIT_AGENT_ARTIFACT_PENDING",
    appCode: "CONFLICT",
    message: "The Orbit Agent artifact task is still pending.",
    recovery:
      "Keep the side panel in a loading state and do not execute external actions.",
  },
  ORBIT_AGENT_ARTIFACT_MOCK_FAILED: {
    code: "ORBIT_AGENT_ARTIFACT_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The Orbit Agent artifact mock is pinned to a controlled failure.",
    recovery:
      "Render the controlled failure state and avoid retrying live providers or external actions.",
  },
} as const satisfies Record<
  OrbitAgentArtifactErrorCode,
  OrbitAgentArtifactErrorDefinition
>;

// artifact route 复用共享 AppError/envelope 模型，对外不暴露内部失败结构。
export function orbitAgentArtifactFailureToAppError(
  result: OrbitAgentArtifactFailure,
): AppError {
  return new AppError(result.error.appCode, result.error.message);
}

// 错误 context 中保留 feature mode、artifact/task id 和恢复建议，便于 UI 做恢复态。
export function orbitAgentArtifactFailureContext(
  result: OrbitAgentArtifactFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    artifactId: result.error.artifactId ?? "",
    featureMode: mode,
    orbitFeatureMode: mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    recovery: result.error.recovery,
    runtimeBoundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
  };
}
