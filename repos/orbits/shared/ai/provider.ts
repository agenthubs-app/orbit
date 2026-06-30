import type { ApiErrorContext } from "../api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../api/envelope";
import type { FeatureMode } from "../config/feature-mode";
import { AppError, type AppErrorCode } from "../errors/app-error";
import {
  buildMockAiRunProvenance,
  createMockInputHash,
  type AiRunProvenanceRecord,
} from "./provenance";
// shared AI provider contract 描述旧 AI provider capability 的输入、输出和错误。
// mock fixture 数据放在 mock-fixtures.ts；真实/替代实现只依赖这里的接口。

export type { AiRunProvenanceRecord };

export const AI_PROVIDER_FIXTURE_SOURCE =
  "fixture:shared/ai/provider.ts" as const;

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

const fixtureCollectedAt = "2026-06-26T00:12:00.000Z";

const mockOnlyExecutionFlags = {
  modelCallExecuted: false,
  liveAiProviderRequested: false,
  externalNetworkRequested: false,
  emailProviderRequested: false,
  calendarProviderRequested: false,
  notificationProviderRequested: false,
  deviceRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
} as const;

function source(input: {
  id: string;
  type: AiProviderSourceReference["type"];
  label: string;
  providerRecordId: string;
}): AiProviderSourceReference {
  return {
    ...input,
    collectedAt: fixtureCollectedAt,
    generatedBy: "mock-ai-provider-rules",
  };
}

const mayaPilotSource = source({
  id: "source:ai-provider:maya:pilot-timing",
  type: "chat_summary",
  label: "Maya pilot timing relationship evidence",
  providerRecordId: "chat-summary:maya:pilot-timing",
});

const diegoEventNoteSource = source({
  id: "source:ai-provider:diego:case-study",
  type: "event_note",
  label: "Diego case study event note",
  providerRecordId: "event-note:diego:case-study",
});

const providerGuardSource = source({
  id: "source:ai-provider:local-guard",
  type: "system",
  label: "Local AI provider guard",
  providerRecordId: "mock-ai-provider-guard",
});

function run(input: {
  runId: string;
  promptTemplateId: PromptTemplateId;
  hashInput: Readonly<Record<string, unknown>>;
  output: AiProviderOutput;
  fallbackBehavior: AiProviderFallbackBehavior;
  sourceRefs: readonly AiProviderSourceReference[];
  evidenceIds: readonly string[];
  generationMethod: AiRunProvenanceRecord["generationMethod"];
  sourceLabel: string;
}): AiProviderRunRecord {
  const inputHash = createMockInputHash(input.hashInput);

  return {
    runId: input.runId,
    state: "success",
    promptTemplateId: input.promptTemplateId,
    inputHash,
    output: input.output,
    provenance: buildMockAiRunProvenance({
      source: AI_PROVIDER_FIXTURE_SOURCE,
      runId: input.runId,
      promptTemplateId: input.promptTemplateId,
      inputHash,
      outputPreview: input.output.text.slice(0, 120),
      evidenceIds: input.evidenceIds,
      sourceLabel: input.sourceLabel,
      collectedAt: fixtureCollectedAt,
      generationMethod: input.generationMethod,
      fallbackUsed: input.fallbackBehavior.used,
    }),
    fallbackBehavior: input.fallbackBehavior,
    sourceRefs: input.sourceRefs,
    evidenceIds: input.evidenceIds,
    generatedBy: "mock-ai-provider-rules",
    ...mockOnlyExecutionFlags,
  };
}

export const mockAiProviderRuns: readonly AiProviderRunRecord[] = [
  run({
    runId: "demo-ai-run-1",
    promptTemplateId: "orbit.message-draft.followup.v1",
    hashInput: {
      desiredOutcome: "Send the pilot timing comparison",
      promptTemplateId: "orbit.message-draft.followup.v1",
      recipientName: "Maya Chen",
      relationshipContext:
        "Maya asked for the pilot timing comparison after breakfast.",
    },
    output: {
      kind: "message_draft",
      text:
        "Hi Maya Chen, following up from breakfast: I pulled together the pilot timing comparison and the operator-readiness notes. Would a 20-minute review next week help your team choose the right pilot window?",
      structured: {
        relationshipContext:
          "Maya asked for the pilot timing comparison after breakfast.",
        recipientName: "Maya Chen",
        recommendedAction: "Review the draft before any external send action.",
      },
      fallbackUsed: false,
    },
    fallbackBehavior: {
      used: false,
      reason: "Supported prompt template matched relationship context.",
      output: "",
    },
    sourceRefs: [mayaPilotSource],
    evidenceIds: [
      "evidence:ai-provider:message-draft",
      "evidence:chat:maya:pilot-timing",
    ],
    generationMethod: "fixture",
    sourceLabel: "Maya pilot timing relationship evidence",
  }),
  run({
    runId: "demo-ai-run-2",
    promptTemplateId: "orbit.relationship-context-summary.v1",
    hashInput: {
      promptTemplateId: "orbit.relationship-context-summary.v1",
      relationshipContext:
        "Diego wants a short case study before next week's regional planning meeting.",
    },
    output: {
      kind: "relationship_context_summary",
      text:
        "Diego Rivera is preparing regional planning and needs a concise Japan expansion case study before the meeting.",
      structured: {
        contactName: "Diego Rivera",
        relationshipSignal: "Requested case study from event note.",
        recommendedAction: "Prepare source-backed case study notes.",
      },
      fallbackUsed: false,
    },
    fallbackBehavior: {
      used: false,
      reason: "Supported prompt template matched relationship context.",
      output: "",
    },
    sourceRefs: [diegoEventNoteSource],
    evidenceIds: [
      "evidence:ai-provider:relationship-summary",
      "evidence:event:diego:case-study",
    ],
    generationMethod: "fixture",
    sourceLabel: "Diego case study event note",
  }),
] as const;

export const mockAiProviderProvenance: AiRunProvenanceRecord = {
  ...mockAiProviderRuns[0].provenance,
  runId: "demo-ai-provider-fixture",
  sourceLabel: "Mock AI provider fixture",
  evidenceIds: mockAiProviderRuns.flatMap((item) => item.evidenceIds),
  generationMethod: "fixture",
  fallbackUsed: false,
};

export const mockAiProviderFailureProvenance: AiRunProvenanceRecord = {
  ...buildMockAiRunProvenance({
    source: AI_PROVIDER_FIXTURE_SOURCE,
    runId: "demo-ai-run-controlled-failure",
    promptTemplateId: "orbit.message-draft.followup.v1",
    inputHash: createMockInputHash({
      scenario: "failure",
      source: providerGuardSource.providerRecordId,
    }),
    outputPreview: "Controlled local AI provider failure.",
    evidenceIds: ["evidence:ai-provider:controlled-failure"],
    sourceLabel: "Controlled AI provider mock failure",
    collectedAt: fixtureCollectedAt,
    generationMethod: "rule-based-state",
    fallbackUsed: false,
  }),
};

export const mockAiProviderFixture: AiProviderPayload = {
  state: "success",
  runs: mockAiProviderRuns,
  summary:
    "Local rules prepared AI-shaped message draft and relationship summary outputs with prompt template ids, input hashes, output records, and run provenance.",
  provenance: mockAiProviderProvenance,
  nextAction:
    "Review source evidence, prompt template id, input hash, output, and fallback behavior before wiring a live provider.",
};

export const mockEmptyAiProviderFixture: AiProviderPayload = {
  state: "empty",
  runs: [],
  summary:
    "No mock AI provider output is available because no prompt-ready relationship context exists.",
  provenance: {
    ...mockAiProviderProvenance,
    runId: "demo-ai-run-empty",
    sourceLabel: "Empty AI provider fixture",
    evidenceIds: ["evidence:ai-provider:empty"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Add relationship context, source evidence, and a prompt template before requesting mock AI output.",
};

export const mockPendingAiProviderFixture: AiProviderPayload = {
  state: "pending",
  runs: [],
  summary:
    "Mock AI provider output is waiting on a local provider guard state.",
  provenance: {
    ...mockAiProviderProvenance,
    runId: "demo-ai-run-pending",
    sourceLabel: "Pending AI provider fixture",
    evidenceIds: ["evidence:ai-provider:pending-local-provider-guard"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Resolve the local provider guard before displaying AI-shaped output.",
};

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
