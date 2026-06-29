import type {
  OrbitAgentArtifactKind,
  OrbitAgentArtifactSourceModule,
  OrbitAgentArtifactSubAgent,
} from "./artifact-contract";
import type {
  OrbitAgentConversationPayload,
  OrbitAgentConversationProvenance,
  OrbitAgentSafetyLedger,
} from "./conversation-contract";
import type {
  GeminiOrbitAgentIntent,
  GeminiOrbitAgentToolName,
  OrbitAgentModelProvider,
  OrbitAgentProviderSource,
} from "./gemini-provider";

export const ORBIT_AI_TRACE_SCHEMA_VERSION = "2026-06-29.v1" as const;

export const ORBIT_AI_TRACE_STAGE_IDS = [
  "input_received",
  "local_guardrails",
  "planner",
  "tool_mapping",
  "artifact_generation",
  "synthesis",
  "final_response",
] as const;

export const ORBIT_AI_TRACE_STAGE_STATUSES = [
  "blocked",
  "completed",
  "failed",
  "skipped",
] as const;

export const ORBIT_AI_TRACE_RENDER_HINTS = [
  "artifact_panel",
  "raw_text",
  "source_json",
  "summary_card",
  "tool_call_table",
] as const;

export type OrbitAiTraceSchemaVersion =
  typeof ORBIT_AI_TRACE_SCHEMA_VERSION;
export type OrbitAiTraceStageId = (typeof ORBIT_AI_TRACE_STAGE_IDS)[number];
export type OrbitAiTraceStageStatus =
  (typeof ORBIT_AI_TRACE_STAGE_STATUSES)[number];
export type OrbitAiTraceRenderHint =
  (typeof ORBIT_AI_TRACE_RENDER_HINTS)[number];

export interface OrbitAiTraceSourceView {
  kind: "json" | "text";
  value: unknown;
}

export interface OrbitAiTraceStage {
  completedAt: string;
  evidenceIds: readonly string[];
  id: OrbitAiTraceStageId | string;
  inputs?: unknown;
  label: string;
  outputSource?: OrbitAiTraceSourceView;
  outputs?: unknown;
  renderHint: OrbitAiTraceRenderHint | string;
  safety?: OrbitAgentSafetyLedger;
  skipReason?: string;
  startedAt: string;
  status: OrbitAiTraceStageStatus;
  summary: string;
}

export interface OrbitAiTraceChainItem {
  stageId: OrbitAiTraceStage["id"];
  status: OrbitAiTraceStageStatus;
  summary: string;
}

export interface OrbitAiTraceRuntimeTool {
  artifactKind?: OrbitAgentArtifactKind;
  outputSchema: string;
  renderHint: OrbitAiTraceRenderHint | string;
  sourceModules: readonly OrbitAgentArtifactSourceModule[];
  toolFamily: string;
  toolName: GeminiOrbitAgentToolName | string;
}

export interface OrbitAiTraceRuntimeSubAgent {
  artifactKinds: readonly OrbitAgentArtifactKind[];
  renderHints: readonly (OrbitAiTraceRenderHint | string)[];
  sourceModules: readonly OrbitAgentArtifactSourceModule[];
  subAgent: OrbitAgentArtifactSubAgent | string;
}

export interface OrbitAiTraceRuntimeRenderer {
  hint: OrbitAiTraceRenderHint | string;
  renderer: string;
}

export interface OrbitAiTraceRuntimeSnapshot {
  model?: string;
  provider?: OrbitAgentModelProvider | string;
  providerSource?: OrbitAgentProviderSource;
  renderers: readonly OrbitAiTraceRuntimeRenderer[];
  subAgents: readonly OrbitAiTraceRuntimeSubAgent[];
  tools: readonly OrbitAiTraceRuntimeTool[];
  unknownRenderers: readonly string[];
}

export interface OrbitAiTraceToolCall {
  evidenceIds: readonly string[];
  reason: string;
  renderHint: OrbitAiTraceRenderHint | string;
  source: "artifact" | "planner";
  status: "completed" | "failed" | "planned" | "skipped";
  toolFamily: string;
  toolName: GeminiOrbitAgentToolName | string;
}

export interface OrbitAiTraceDataSource {
  artifactKind: OrbitAgentArtifactKind;
  evidenceIds: readonly string[];
  generatedViewSectionTitles: readonly string[];
  source: string;
  sourceModule: OrbitAgentArtifactSourceModule;
}

export interface OrbitAiPlannerOnlyTrace {
  input?: {
    locale: string;
    message: string;
  };
  planner?: {
    parsed: {
      assistantMessage: string;
      intent: GeminiOrbitAgentIntent;
      toolRequests: readonly {
        arguments: Record<string, unknown>;
        requiresUserConfirmation: boolean;
        toolFamily: string;
        toolName: GeminiOrbitAgentToolName;
      }[];
    };
    rawOutputText: string;
  };
  provider?: {
    model: string;
    name: OrbitAgentModelProvider;
    source: OrbitAgentProviderSource;
  };
  skippedReason?: string;
  status: "completed" | "failed" | "skipped";
  toolTrace: {
    domainToolCallsWouldExecute: boolean;
    toolRequests: readonly {
      arguments: Record<string, unknown>;
      requiresUserConfirmation: boolean;
      toolFamily: string;
      toolName: GeminiOrbitAgentToolName;
    }[];
  };
}

export interface OrbitAiTraceFullChain {
  chain: readonly OrbitAiTraceChainItem[];
  conversation: OrbitAgentConversationPayload;
  dataSources: readonly OrbitAiTraceDataSource[];
  input: {
    conversationMode: string;
    locale: string;
    maxLoopSteps: number;
    message: string;
    model?: string;
    provider?: OrbitAgentModelProvider | string;
  };
  raw: {
    plannerOutputText?: string;
    synthesisOutputText?: string;
  };
  runtimeSnapshot: OrbitAiTraceRuntimeSnapshot;
  stages: readonly OrbitAiTraceStage[];
  toolCalls: readonly OrbitAiTraceToolCall[];
  traceSchemaVersion: OrbitAiTraceSchemaVersion;
}

export interface OrbitAiTracePayload {
  fullChain: OrbitAiTraceFullChain;
  plannerOnly: OrbitAiPlannerOnlyTrace;
}

export interface OrbitAiTraceFailure {
  error: {
    code: string;
    context?: Record<string, unknown>;
    message: string;
    provenance?: OrbitAgentConversationProvenance;
  };
  success: false;
}

export interface OrbitAiTraceSuccess {
  data: OrbitAiTracePayload;
  success: true;
}

export type OrbitAiTraceResult = OrbitAiTraceFailure | OrbitAiTraceSuccess;
