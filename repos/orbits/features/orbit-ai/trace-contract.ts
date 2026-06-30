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

// Orbit AI trace contract 描述 live conversation 执行链的可视化调试数据。
// 它记录 input、local guardrails、planner、tool mapping、artifact、synthesis 和 final response。
export const ORBIT_AI_TRACE_SCHEMA_VERSION = "2026-06-29.v1" as const;

export const ORBIT_AI_TRACE_STAGE_IDS = [
  "input_received",
  "local_guardrails",
  "planner",
  "tool_mapping",
  "database_context",
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
  "database_table",
  "raw_text",
  "source_json",
  "summary_card",
  "tool_call_table",
] as const;

export const ORBIT_AI_TRACE_LANES = ["agent", "data"] as const;

export type OrbitAiTraceSchemaVersion =
  typeof ORBIT_AI_TRACE_SCHEMA_VERSION;
export type OrbitAiTraceStageId = (typeof ORBIT_AI_TRACE_STAGE_IDS)[number];
export type OrbitAiTraceStageStatus =
  (typeof ORBIT_AI_TRACE_STAGE_STATUSES)[number];
export type OrbitAiTraceRenderHint =
  (typeof ORBIT_AI_TRACE_RENDER_HINTS)[number];
export type OrbitAiTraceLane = (typeof ORBIT_AI_TRACE_LANES)[number];

// outputSource 保存每个阶段的原始 JSON/text，供调试页默认折叠后 pretty print 展示。
export interface OrbitAiTraceSourceView {
  kind: "json" | "text";
  value: unknown;
}

// TraceStage 是单个执行阶段，包含输入、输出、summary、状态、安全账本和渲染提示。
export interface OrbitAiTraceStage {
  completedAt: string;
  evidenceIds: readonly string[];
  id: OrbitAiTraceStageId | string;
  inputs?: unknown;
  lane?: OrbitAiTraceLane;
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

export interface OrbitAiTraceDatabaseCollection {
  collectionName: string;
  recordCount: number;
  selectedForTools: boolean;
}

export interface OrbitAiTraceDatabaseInteraction {
  adapterKind: "memory" | "browser-localStorage" | "remote" | "unknown";
  collections: readonly OrbitAiTraceDatabaseCollection[];
  id: string;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  operation: "read" | "write" | "seed" | "skipped";
  role: "data";
  schemaVersion: number;
  source: string;
  storageKey: string;
  summary: string;
}

export interface OrbitAiTraceChainItem {
  lane?: OrbitAiTraceLane;
  stageId: OrbitAiTraceStage["id"];
  status: OrbitAiTraceStageStatus;
  summary: string;
}

export interface OrbitAiTraceRuntimeTool {
  artifactKind?: OrbitAgentArtifactKind;
  descriptionZh: string;
  inputSpecZh: string;
  outputSchema: string;
  outputSpecZh: string;
  renderHint: OrbitAiTraceRenderHint | string;
  requiresConfirmation: boolean;
  riskLevel: "read" | "draft" | "write" | "external" | string;
  selectedInCurrentRun: boolean;
  sourceModules: readonly OrbitAgentArtifactSourceModule[];
  specificationZh: string;
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

// RuntimeSnapshot 描述当前 agent 架构暴露出的工具、子 agent 和 renderer。
export interface OrbitAiTraceRuntimeSnapshot {
  model?: string;
  provider?: OrbitAgentModelProvider | string;
  providerSource?: OrbitAgentProviderSource;
  renderers: readonly OrbitAiTraceRuntimeRenderer[];
  subAgents: readonly OrbitAiTraceRuntimeSubAgent[];
  tools: readonly OrbitAiTraceRuntimeTool[];
  unknownRenderers: readonly string[];
}

// ToolCall/DataSource 把 planner 工具选择和 artifact 数据来源拆开，便于 UI 独立渲染。
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

export type OrbitAiTraceGraphNodeKind =
  | "artifact"
  | "data"
  | "model"
  | "response"
  | "stage"
  | "subagent"
  | "tool";

export type OrbitAiTraceGraphEdgeKind =
  | "artifact"
  | "control"
  | "data"
  | "subagent"
  | "synthesis"
  | "tool";

export interface OrbitAiTraceGraphNode {
  id: string;
  kind: OrbitAiTraceGraphNodeKind | string;
  label: string;
  lane: OrbitAiTraceLane;
  loopIndex: number;
  stageId?: OrbitAiTraceStage["id"];
  status: OrbitAiTraceStageStatus;
  summary: string;
}

export interface OrbitAiTraceGraphEdge {
  from: OrbitAiTraceGraphNode["id"];
  kind: OrbitAiTraceGraphEdgeKind | string;
  label?: string;
  to: OrbitAiTraceGraphNode["id"];
}

export interface OrbitAiTraceGraph {
  edges: readonly OrbitAiTraceGraphEdge[];
  nodes: readonly OrbitAiTraceGraphNode[];
}

export interface OrbitAiTraceLoopSummary {
  loopCount: number;
  maxSupportedLoops: number;
  mode: "multi_loop_demo" | "single_live_loop" | string;
  reason: string;
}

// PlannerOnlyTrace 用于只跑 planner 的调试路径，不执行 domain tools。
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

// FullChain 是调试页主数据结构，串起 conversation、stages、tools、sources 和 raw model output。
export interface OrbitAiTraceFullChain {
  chain: readonly OrbitAiTraceChainItem[];
  conversation: OrbitAgentConversationPayload;
  databaseInteractions: readonly OrbitAiTraceDatabaseInteraction[];
  dataSources: readonly OrbitAiTraceDataSource[];
  graph: OrbitAiTraceGraph;
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
  loopSummary: OrbitAiTraceLoopSummary;
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
