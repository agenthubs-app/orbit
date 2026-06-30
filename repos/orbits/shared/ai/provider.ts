import type { ApiErrorContext } from "../api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../api/envelope";
import type { FeatureMode } from "../config/feature-mode";
import { AppError, type AppErrorCode } from "../errors/app-error";
import type { AiRunProvenanceRecord } from "./provenance";

// shared AI provider contract 描述旧 AI provider capability 的输入、输出和错误。
// mock fixture 数据放在 mock-fixtures.ts；真实/替代实现只依赖这里的接口。
export type { AiRunProvenanceRecord };

export const AI_PROVIDER_PROMPT_TEMPLATE_IDS = [
  "orbit.message-draft.followup.v1",
  "orbit.relationship-context-summary.v1",
] as const;

export const AI_PROVIDER_ERROR_CODES = [
  "AI_PROVIDER_INPUT_REQUIRED",
  "AI_PROVIDER_RUN_NOT_FOUND",
  "AI_PROVIDER_EMPTY",
  "AI_PROVIDER_PENDING",
  "AI_PROVIDER_MOCK_FAILED",
] as const;

export type PromptTemplateId =
  (typeof AI_PROVIDER_PROMPT_TEMPLATE_IDS)[number];

export type AiProviderErrorCode = (typeof AI_PROVIDER_ERROR_CODES)[number];

export type AiProviderScenario = "success" | "empty" | "pending" | "failure";

export type AiProviderState = "success" | "empty" | "pending";

export interface AiProviderMessageDraftInput {
  scenario?: AiProviderScenario | string | null;
  promptTemplateId?: PromptTemplateId | string | null;
  recipientName?: string | null;
  relationshipContext?: string | null;
  desiredOutcome?: string | null;
  sourceEvidenceIds?: readonly string[] | null;
}

export interface AiProviderRunLookupInput {
  runId?: string | null;
  scenario?: AiProviderScenario | string | null;
}

export interface AiProviderService {
  draftMessage: (
    input?: AiProviderMessageDraftInput,
  ) => AiProviderResult;
  getRun: (input: AiProviderRunLookupInput) => AiProviderRunResult;
}

export interface AiProviderErrorDefinition {
  code: AiProviderErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const AI_PROVIDER_ERROR_DEFINITIONS = {
  AI_PROVIDER_INPUT_REQUIRED: {
    code: "AI_PROVIDER_INPUT_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A non-empty relationship context is required before the mock AI provider can prepare output.",
    recovery:
      "Keep AI output controls disabled until relationship context, source evidence, and a prompt template are present.",
  },
  AI_PROVIDER_RUN_NOT_FOUND: {
    code: "AI_PROVIDER_RUN_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock AI run provenance record matches that run id.",
    recovery:
      "Render the missing-run envelope and avoid querying live model providers, network, device, database, email, calendar, or notification services.",
  },
  AI_PROVIDER_EMPTY: {
    code: "AI_PROVIDER_EMPTY",
    appCode: "CONFLICT",
    message:
      "No mock AI provider output is available because no prompt-ready relationship context exists.",
    recovery:
      "Add relationship context, source evidence, and a supported prompt template before requesting mock output.",
  },
  AI_PROVIDER_PENDING: {
    code: "AI_PROVIDER_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock AI provider boundary is waiting on a local provider guard.",
    recovery:
      "Render the pending state and do not call live model providers, network, device, database, email, calendar, or notification services.",
  },
  AI_PROVIDER_MOCK_FAILED: {
    code: "AI_PROVIDER_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock AI provider boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry live model providers, network, device, database, email, calendar, or notification services.",
  },
} as const satisfies Record<AiProviderErrorCode, AiProviderErrorDefinition>;

export interface AiProviderOutput {
  kind: "message_draft" | "relationship_context_summary";
  text: string;
  structured: Readonly<Record<string, string>>;
  fallbackUsed: boolean;
}

export interface AiProviderFallbackBehavior {
  used: boolean;
  reason: string;
  output: string;
}

export interface AiProviderSourceReference {
  id: string;
  type: "chat_summary" | "event_note" | "manual_note" | "system";
  label: string;
  providerRecordId: string;
  collectedAt: string;
  generatedBy: "mock-ai-provider-rules";
}

export interface AiProviderRunRecord {
  runId: string;
  state: "success";
  promptTemplateId: PromptTemplateId;
  inputHash: string;
  output: AiProviderOutput;
  provenance: AiRunProvenanceRecord;
  fallbackBehavior: AiProviderFallbackBehavior;
  sourceRefs: readonly AiProviderSourceReference[];
  evidenceIds: readonly string[];
  generatedBy: "mock-ai-provider-rules";
  modelCallExecuted: false;
  liveAiProviderRequested: false;
  externalNetworkRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
}

export interface AiProviderPayload {
  state: AiProviderState;
  runs: readonly AiProviderRunRecord[];
  summary: string;
  provenance: AiRunProvenanceRecord;
  nextAction: string;
}

export interface AiProviderRunPayload {
  state: "success";
  run: AiProviderRunRecord;
  summary: string;
  provenance: AiRunProvenanceRecord;
  nextAction: string;
}

export interface AiProviderSuccess {
  success: true;
  data: AiProviderPayload;
}

export interface AiProviderRunSuccess {
  success: true;
  data: AiProviderRunPayload;
}

export interface AiProviderFailure {
  success: false;
  error: AiProviderErrorDefinition & {
    state: "failure";
    provenance: AiRunProvenanceRecord;
    evidenceIds: readonly string[];
  };
}

export type AiProviderResult = AiProviderSuccess | AiProviderFailure;

export type AiProviderRunResult = AiProviderRunSuccess | AiProviderFailure;

export function aiProviderFailureToAppError(
  failure: AiProviderFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function aiProviderFailureContext(
  failure: AiProviderFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    aiProviderErrorCode: failure.error.code,
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock AI provider failure came from deterministic fixture rules.",
    service: "ai-provider-mock-and-provenance-boundary",
  };
}
