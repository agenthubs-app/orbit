import type {
  OrbitAgentArtifactKind,
  OrbitAgentArtifactPayload,
  OrbitAgentArtifactSourceModule,
} from "./artifact-contract";
import type {
  OrbitAgentConversationPayload,
  OrbitAgentSafetyLedger,
  OrbitAgentSendMessageInput,
  OrbitAgentConversationTimingSpan,
} from "./conversation-contract";
import type {
  GeminiOrbitAgentPlannerResult,
  GeminiOrbitAgentToolRequest,
} from "./gemini-provider";
import {
  artifactKindForTool,
  createLiveOrbitAgentRuntime,
  runLiveOrbitAgentRuntime,
  safetyLedger,
  toolFamilyForToolName,
  type LiveOrbitAgentRuntimeConfig,
  type OrbitAgentLocale,
} from "./live-agent-runtime";
import {
  ORBIT_AI_TRACE_SCHEMA_VERSION,
  type OrbitAiTraceDatabaseInteraction,
  type OrbitAiPlannerOnlyTrace,
  type OrbitAiTraceDataSource,
  type OrbitAiTraceFullChain,
  type OrbitAiTraceGraph,
  type OrbitAiTraceLane,
  type OrbitAiTraceLoopSummary,
  type OrbitAiTracePayload,
  type OrbitAiTraceRuntimeArtifactProducer,
  type OrbitAiTraceResult,
  type OrbitAiTraceRuntimeSnapshot,
  type OrbitAiTraceStage,
  type OrbitAiTraceStageId,
  type OrbitAiTraceStageStatus,
  type OrbitAiTraceToolCall,
} from "./trace-contract";
import {
  createOrbitLocalRemoteDatabase,
  ORBIT_LOCAL_REMOTE_DATABASE_KEY,
  ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION,
} from "../../shared/local-remote-store/orbit-database";
import { ORBIT_AGENT_TOOL_CATALOG } from "./agent-tools/registry";

const traceCollectedAt = "2026-06-27T00:03:00.000Z";
const maxSupportedTraceLoops = 3;

// live-conversation-trace 是开发调试用的完整执行链快照：
// 输入、本地 guardrail、planner、tool mapping、artifact、synthesis、最终响应都会记录成 stage。
export interface LiveOrbitAgentTraceConfig
  extends LiveOrbitAgentRuntimeConfig {}

export interface OrbitAgentTraceRunner {
  traceMessage(input: OrbitAgentSendMessageInput): Promise<OrbitAiTraceResult>;
}

type TraceStageInput = {
  durationMs?: number;
  evidenceIds?: readonly string[];
  id: OrbitAiTraceStageId;
  inputs?: unknown;
  lane?: OrbitAiTraceLane;
  label: string;
  outputSource?: OrbitAiTraceStage["outputSource"];
  outputs?: unknown;
  renderHint?: OrbitAiTraceStage["renderHint"];
  safety?: OrbitAgentSafetyLedger;
  skipReason?: string;
  status: OrbitAiTraceStageStatus;
  summary: string;
};

function cloneJson<TValue>(value: TValue): TValue {
  // trace payload 会暴露给调试 UI，clone 后避免外部修改内部对象。
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function traceTimeFor(index: number): string {
  return `2026-06-27T00:03:0${index}.000Z`;
}

function nowMs(): number {
  return performance.now();
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Number((nowMs() - startedAt).toFixed(3)));
}

function durationForPhase(
  timings: readonly OrbitAgentConversationTimingSpan[],
  phase: string,
): number {
  return timings.find((timing) => timing.phase === phase)?.durationMs ?? 0;
}

function stage(index: number, input: TraceStageInput): OrbitAiTraceStage {
  // 每个 stage 都经过 redactValue，避免密钥/token 等字段进入调试 UI。
  return {
    completedAt: traceTimeFor(index),
    durationMs: input.durationMs ?? 0,
    evidenceIds: input.evidenceIds ?? [],
    id: input.id,
    inputs: redactValue(input.inputs),
    lane: input.lane ?? "agent",
    label: input.label,
    outputSource: input.outputSource,
    outputs: redactValue(input.outputs),
    renderHint: input.renderHint ?? "summary_card",
    safety: input.safety,
    skipReason: input.skipReason,
    startedAt: traceTimeFor(index),
    status: input.status,
    summary: input.summary,
  };
}

function redactValue(value: unknown): unknown {
  // 递归脱敏常见 secret 字段；非 secret 的结构会保留，方便 debug。
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    if (
      /api[_-]?key|authorization|cookie|credential|password|secret|token/i.test(
        key,
      )
    ) {
      redacted[key] = "[redacted]";
      continue;
    }

    redacted[key] = redactValue(child);
  }

  return redacted;
}

function sourceView(value: unknown): OrbitAiTraceStage["outputSource"] {
  return {
    kind: typeof value === "string" ? "text" : "json",
    value: cloneJson(redactValue(value)),
  };
}

function chainFromStages(
  stages: readonly OrbitAiTraceStage[],
): OrbitAiTraceFullChain["chain"] {
  return stages.map((traceStage) => ({
    durationMs: traceStage.durationMs,
    lane: traceStage.lane,
    stageId: traceStage.id,
    status: traceStage.status,
    summary: traceStage.summary,
  }));
}

const databaseCollectionsByTool: Record<string, readonly string[]> = {
  "chat.context": [
    "contacts",
    "connections",
    "conversations",
    "messages",
    "interactionMemories",
    "evidence",
  ],
  "contacts.recommend": [
    "contacts",
    "connections",
    "eventParticipantIntents",
    "matchRecommendations",
    "recommendationTests",
    "aiAnalyses",
    "evidence",
  ],
  "events.recommend": [
    "events",
    "attendees",
    "eventParticipantIntents",
    "contacts",
    "connections",
    "matchRecommendations",
    "recommendationTests",
    "evidence",
  ],
  "followups.reviewQueue": [
    "tasks",
    "contacts",
    "connections",
    "messages",
    "interactionMemories",
    "evidence",
  ],
};

function selectedDatabaseCollectionsForTools(
  toolRequests: readonly GeminiOrbitAgentToolRequest[],
): Set<string> {
  const selected = new Set<string>(["accounts", "profiles", "evidence"]);

  for (const request of toolRequests) {
    for (const collectionName of databaseCollectionsByTool[request.toolName] ?? []) {
      selected.add(collectionName);
    }
  }

  return selected;
}

function databaseInteractionForTools(
  toolRequests: readonly GeminiOrbitAgentToolRequest[],
): OrbitAiTraceDatabaseInteraction {
  // Trace 只读取本地 local-remote database 的表级快照，帮助调试数据上下文；不写 live 数据库。
  const database = createOrbitLocalRemoteDatabase();
  const state = database.getState() as unknown as Record<string, unknown>;
  const selectedCollections = selectedDatabaseCollectionsForTools(toolRequests);
  const collectionNames = Object.keys(state)
    .filter((collectionName) => Array.isArray(state[collectionName]))
    .sort();
  const collections = collectionNames.map((collectionName) => {
    const collection = state[collectionName];

    return {
      collectionName,
      recordCount: Array.isArray(collection) ? collection.length : 0,
      selectedForTools: selectedCollections.has(collectionName),
    };
  });
  const selectedCollectionCount = collections.filter(
    (collection) => collection.selectedForTools,
  ).length;

  return {
    adapterKind: "memory",
    collections,
    id: "database:local-remote-context",
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    operation: "read",
    role: "data",
    schemaVersion: ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION,
    source: `local-remote-store:${ORBIT_LOCAL_REMOTE_DATABASE_KEY}`,
    storageKey: ORBIT_LOCAL_REMOTE_DATABASE_KEY,
    summary: `${selectedCollectionCount} local-remote database collections were inspected for the planned Orbit tools.`,
  };
}

function skippedDatabaseInteraction(reason: string): OrbitAiTraceDatabaseInteraction {
  return {
    adapterKind: "memory",
    collections: [],
    id: "database:local-remote-context",
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    operation: "skipped",
    role: "data",
    schemaVersion: ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION,
    source: `local-remote-store:${ORBIT_LOCAL_REMOTE_DATABASE_KEY}`,
    storageKey: ORBIT_LOCAL_REMOTE_DATABASE_KEY,
    summary: reason,
  };
}

function sourceModulesForArtifactKind(
  kind: OrbitAgentArtifactKind,
): readonly OrbitAgentArtifactSourceModule[] {
  if (kind === "event_recommendations") {
    return ["orbit-ai", "events"];
  }

  if (kind === "contact_recommendations") {
    return ["orbit-ai", "contacts"];
  }

  if (kind === "followup_queue") {
    return ["orbit-ai", "followups"];
  }

  if (kind === "relationship_chat_context") {
    return ["orbit-ai", "chat"];
  }

  if (kind === "email_context") {
    return ["orbit-ai", "chat", "contacts"];
  }

  return ["orbit-ai"];
}

function artifactProducerForArtifactKind(kind: OrbitAgentArtifactKind): string {
  if (kind === "event_recommendations") {
    return "event_recommendation_producer";
  }

  if (kind === "contact_recommendations") {
    return "contact_recommendation_producer";
  }

  if (kind === "followup_queue") {
    return "followup_review_producer";
  }

  return "relationship_chat_review_producer";
}

function plannerOnlyTrace(input: {
  locale: string;
  message: string;
  plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: true }>;
  toolRequests: readonly GeminiOrbitAgentToolRequest[];
}): OrbitAiPlannerOnlyTrace {
  return {
    input: {
      locale: input.locale,
      message: input.message,
    },
    planner: {
      parsed: {
        assistantMessage: input.plannerResult.data.assistantMessage,
        intent: input.plannerResult.data.intent,
        toolRequests: input.toolRequests.map((request) => ({
          arguments: request.arguments,
          requiresUserConfirmation: request.requiresUserConfirmation,
          toolFamily: toolFamilyForToolName(request.toolName),
          toolName: request.toolName,
        })),
      },
      rawOutputText: input.plannerResult.data.rawOutputText,
    },
    provider: {
      model: input.plannerResult.data.model,
      name: input.plannerResult.data.provider,
      source: input.plannerResult.data.source,
    },
    status: "completed",
    toolTrace: {
      domainToolCallsWouldExecute: input.toolRequests.length > 0,
      toolRequests: input.toolRequests.map((request) => ({
        arguments: request.arguments,
        requiresUserConfirmation: request.requiresUserConfirmation,
        toolFamily: toolFamilyForToolName(request.toolName),
        toolName: request.toolName,
      })),
    },
  };
}

function runtimeSnapshot(input: {
  artifacts: readonly OrbitAgentArtifactPayload[];
  plannerResult?: Extract<GeminiOrbitAgentPlannerResult, { success: true }>;
  toolRequests: readonly GeminiOrbitAgentToolRequest[];
}): OrbitAiTraceRuntimeSnapshot {
  // runtimeSnapshot 告诉可视化页面：有哪些工具、artifact producer、renderer 和数据来源参与了本次链路。
  const artifactsByKind = new Map<OrbitAgentArtifactKind, OrbitAgentArtifactPayload>();

  for (const artifact of input.artifacts) {
    artifactsByKind.set(artifact.task.kind, artifact);
  }

  const selectedToolNames = new Set(
    input.toolRequests.map((request) => request.toolName),
  );

  const tools = ORBIT_AGENT_TOOL_CATALOG.map((tool) => {
    const artifact = artifactsByKind.get(tool.artifactKind);

    return {
      artifactKind: tool.artifactKind,
      descriptionZh: tool.descriptionZh,
      inputSpecZh: tool.inputSpecZh,
      outputSchema: tool.outputSchema,
      outputSpecZh: tool.outputSpecZh,
      renderHint: tool.renderHint,
      requiresConfirmation: tool.requiresConfirmation,
      riskLevel: tool.riskLevel,
      selectedInCurrentRun: selectedToolNames.has(tool.toolName),
      sourceModules:
        artifact?.result.provenance.sourceModules ?? tool.sourceModules,
      specificationZh: tool.specificationZh,
      toolFamily: tool.toolFamily,
      toolName: tool.toolName,
    };
  });
  const artifactProducers: OrbitAiTraceRuntimeArtifactProducer[] = Array.from(
    new Map(
      input.artifacts.map((artifact) => [
        artifact.task.artifactProducer,
        {
          artifactKinds: [artifact.task.kind],
          renderHints: ["artifact_panel"],
          sourceModules: artifact.result.provenance.sourceModules,
          artifactProducer: artifact.task.artifactProducer,
        },
      ]),
    ).values(),
  );

  if (artifactProducers.length === 0) {
    for (const request of input.toolRequests) {
      const artifactKind = artifactKindForTool(request.toolName);
      const artifactProducer = artifactProducerForArtifactKind(artifactKind);

      artifactProducers.push({
        artifactKinds: [artifactKind],
        renderHints: ["artifact_panel"],
        sourceModules: sourceModulesForArtifactKind(artifactKind),
        artifactProducer,
      });
    }
  }

  return {
    model: input.plannerResult?.data.model,
    provider: input.plannerResult?.data.provider,
    providerSource: input.plannerResult?.data.source,
    renderers: [
      { hint: "summary_card", renderer: "summary-card" },
      { hint: "tool_call_table", renderer: "tool-call-table" },
      { hint: "database_table", renderer: "database-table" },
      { hint: "artifact_panel", renderer: "artifact-panel" },
      { hint: "source_json", renderer: "source-json" },
      { hint: "raw_text", renderer: "raw-text" },
    ],
    artifactProducers,
    tools,
    unknownRenderers: [],
  };
}

function dataSourcesForArtifacts(
  artifacts: readonly OrbitAgentArtifactPayload[],
): readonly OrbitAiTraceDataSource[] {
  // dataSources 把 artifact provenance 展开成 UI 可显示的“模块 -> 证据 -> section”关系。
  const sources: OrbitAiTraceDataSource[] = [];

  for (const artifact of artifacts) {
    const sourceModules = [
      ...artifact.result.provenance.sourceModules.filter(
        (sourceModule) => sourceModule !== "orbit-ai",
      ),
      ...artifact.result.provenance.sourceModules.filter(
        (sourceModule) => sourceModule === "orbit-ai",
      ),
    ];

    for (const sourceModule of sourceModules) {
      sources.push({
        artifactKind: artifact.task.kind,
        evidenceIds: artifact.result.provenance.evidenceIds,
        generatedViewSectionTitles:
          artifact.result.generatedView?.sections.map((section) => section.title) ??
          [],
        source: artifact.result.provenance.source,
        sourceModule,
      });
    }
  }

  return sources;
}

function toolCallsFor(input: {
  artifacts: readonly OrbitAgentArtifactPayload[];
  toolRequests: readonly GeminiOrbitAgentToolRequest[];
}): readonly OrbitAiTraceToolCall[] {
  // toolCalls 同时包含 planner 计划和 artifact provenance，区分“计划调用”和“mock 生成结果”。
  return [
    ...input.toolRequests.map((request) => ({
      evidenceIds: ["evidence:orbit-agent:model-provider"],
      reason:
        "Planner selected this Orbit tool and trace mode recorded the requested handoff.",
      renderHint: "tool_call_table",
      source: "planner" as const,
      status: "planned" as const,
      toolFamily: toolFamilyForToolName(request.toolName),
      toolName: request.toolName,
    })),
    ...input.artifacts.flatMap((artifact) =>
      artifact.result.provenance.toolCalls.map((toolCall) => ({
        evidenceIds: toolCall.evidenceIds,
        reason: toolCall.reason,
        renderHint: "artifact_panel",
        source: "artifact" as const,
        status: toolCall.status,
        toolFamily: toolFamilyForToolName(toolCall.toolName),
        toolName: toolCall.toolName,
      })),
    ),
  ];
}

function skippedPlannerOnlyTrace(reason: string): OrbitAiPlannerOnlyTrace {
  return {
    skippedReason: reason,
    status: "skipped",
    toolTrace: {
      domainToolCallsWouldExecute: false,
      toolRequests: [],
    },
  };
}

function currentLoopSummary(): OrbitAiTraceLoopSummary {
  return {
    loopCount: 1,
    maxSupportedLoops: maxSupportedTraceLoops,
    mode: "single_live_loop",
    reason:
      "Current live agent policy runs one live loop; the trace graph schema can render additional loops when a demo or future runtime provides them.",
  };
}

function graphForTrace(input: {
  artifacts: readonly OrbitAgentArtifactPayload[];
  databaseInteractions: readonly OrbitAiTraceDatabaseInteraction[];
  stages: readonly OrbitAiTraceStage[];
  toolRequests: readonly GeminiOrbitAgentToolRequest[];
}): OrbitAiTraceGraph {
  const loopIndex = 1;
  const nodes: Array<OrbitAiTraceGraph["nodes"][number]> = input.stages.map((traceStage) => ({
    id: `loop:${loopIndex}:stage:${traceStage.id}`,
    kind:
      traceStage.id === "planner" || traceStage.id === "synthesis"
        ? "model"
        : traceStage.id === "final_response"
          ? "response"
          : traceStage.id === "database_context"
            ? "data"
            : "stage",
    label: traceStage.label,
    lane: traceStage.lane ?? (traceStage.id === "database_context" ? "data" : "agent"),
    loopIndex,
    stageId: traceStage.id,
    status: traceStage.status,
    durationMs: traceStage.durationMs,
    summary: traceStage.summary,
  }));
  const edges: Array<OrbitAiTraceGraph["edges"][number]> = [];

  for (let index = 0; index < input.stages.length - 1; index += 1) {
    const from = input.stages[index];
    const to = input.stages[index + 1];

    edges.push({
      from: `loop:${loopIndex}:stage:${from.id}`,
      kind:
        to.id === "database_context"
          ? "data"
          : to.id === "artifact_generation"
            ? "artifact"
            : to.id === "synthesis"
              ? "synthesis"
              : "control",
      to: `loop:${loopIndex}:stage:${to.id}`,
    });
  }

  for (const request of input.toolRequests) {
    const artifactKind = artifactKindForTool(request.toolName);
    const artifact = input.artifacts.find(
      (candidate) => candidate.task.kind === artifactKind,
    );
    const artifactProducer =
      artifact?.task.artifactProducer ??
      artifactProducerForArtifactKind(artifactKind);
    const toolNodeId = `loop:${loopIndex}:tool:${request.toolName}`;
    const artifactProducerNodeId = `loop:${loopIndex}:artifact-producer:${artifactProducer}`;

    nodes.push({
      id: toolNodeId,
      kind: "tool",
      label: request.toolName,
      lane: "agent",
      loopIndex,
      stageId: "tool_mapping",
      status: "completed",
      durationMs: 0,
      summary: `Planner selected ${request.toolName}.`,
    });
    nodes.push({
      id: artifactProducerNodeId,
      kind: "artifact-producer",
      label: artifactProducer,
      lane: "agent",
      loopIndex,
      stageId: "artifact_generation",
      status: artifact ? "completed" : "skipped",
      durationMs: 0,
      summary: artifact
        ? `Artifact producer prepared ${artifact.task.kind}.`
        : "Artifact producer would run if the trace budget reaches artifact generation.",
    });
    edges.push({
      from: `loop:${loopIndex}:stage:tool_mapping`,
      kind: "tool",
      to: toolNodeId,
    });
    edges.push({
      from: toolNodeId,
      kind: "data",
      to: `loop:${loopIndex}:stage:database_context`,
    });
    edges.push({
      from: toolNodeId,
      kind: "artifact-producer",
      to: artifactProducerNodeId,
    });
    edges.push({
      from: artifactProducerNodeId,
      kind: "artifact",
      to: `loop:${loopIndex}:stage:artifact_generation`,
    });
  }

  for (const interaction of input.databaseInteractions) {
    nodes.push({
      id: `loop:${loopIndex}:data:${interaction.id}`,
      kind: "data",
      label: interaction.storageKey,
      lane: "data",
      loopIndex,
      stageId: "database_context",
      status: interaction.operation === "skipped" ? "skipped" : "completed",
      durationMs: 0,
      summary: interaction.summary,
    });
    edges.push({
      from: `loop:${loopIndex}:stage:database_context`,
      kind: "data",
      to: `loop:${loopIndex}:data:${interaction.id}`,
    });
  }

  return { edges, nodes };
}

function fullChain(input: {
  conversation: OrbitAgentConversationPayload;
  databaseInteractions: readonly OrbitAiTraceDatabaseInteraction[];
  dataSources: readonly OrbitAiTraceDataSource[];
  locale: string;
  maxLoopSteps: number;
  message: string;
  plannerResult?: Extract<GeminiOrbitAgentPlannerResult, { success: true }>;
  raw?: OrbitAiTraceFullChain["raw"];
  stages: readonly OrbitAiTraceStage[];
  toolCalls: readonly OrbitAiTraceToolCall[];
  toolRequests: readonly GeminiOrbitAgentToolRequest[];
  totalDurationMs: number;
}): OrbitAiTraceFullChain {
  return {
    chain: chainFromStages(input.stages),
    conversation: cloneJson(input.conversation),
    databaseInteractions: input.databaseInteractions,
    dataSources: input.dataSources,
    graph: graphForTrace({
      artifacts: input.conversation.artifacts,
      databaseInteractions: input.databaseInteractions,
      stages: input.stages,
      toolRequests: input.toolRequests,
    }),
    input: {
      conversationMode: process.env.ORBIT_AGENT_CONVERSATION_MODE ?? "mock",
      locale: input.locale,
      maxLoopSteps: input.maxLoopSteps,
      message: input.message,
      model: input.plannerResult?.data.model,
      provider: input.plannerResult?.data.provider,
    },
    raw: input.raw ?? {},
    loopSummary: currentLoopSummary(),
    runtimeSnapshot: runtimeSnapshot({
      artifacts: input.conversation.artifacts,
      plannerResult: input.plannerResult,
      toolRequests: input.toolRequests,
    }),
    stages: input.stages,
    toolCalls: input.toolCalls,
    totalDurationMs: input.totalDurationMs,
    traceSchemaVersion: ORBIT_AI_TRACE_SCHEMA_VERSION,
  };
}

function boundaryTrace(input: {
  boundaryPayload: OrbitAgentConversationPayload;
  locale: string;
  maxLoopSteps: number;
  message: string;
  timings: readonly OrbitAgentConversationTimingSpan[];
  totalDurationMs: number;
}): OrbitAiTracePayload {
  // 本地边界命中时，trace 明确标出 planner/tool/artifact/synthesis 全部 skipped。
  const reason = `Stopped at ${input.boundaryPayload.provenance.sourceLabel} (${input.boundaryPayload.provenance.source}) before planner, tools, or synthesis.`;
  const databaseInteractions = [skippedDatabaseInteraction(reason)];
  const stages = [
    stage(0, {
      durationMs: 0,
      id: "input_received",
      inputs: {
        locale: input.locale,
        maxLoopSteps: input.maxLoopSteps,
        message: input.message,
      },
      label: "Input received",
      outputSource: sourceView({
        locale: input.locale,
        maxLoopSteps: input.maxLoopSteps,
        message: input.message,
      }),
      status: "completed",
      summary: "Captured the user prompt for a development-only trace run.",
    }),
    stage(1, {
      durationMs: durationForPhase(input.timings, "local_boundary"),
      id: "local_guardrails",
      label: "Local guardrails",
      outputSource: sourceView(input.boundaryPayload.provenance),
      renderHint: "source_json",
      safety: input.boundaryPayload.provenance.safety,
      status: "blocked",
      summary: `Stopped locally at ${input.boundaryPayload.provenance.sourceLabel}.`,
    }),
    stage(2, {
      durationMs: 0,
      id: "planner",
      label: "Planner",
      renderHint: "source_json",
      skipReason: reason,
      status: "skipped",
      summary: "Planner was skipped because the local boundary handled the turn.",
    }),
    stage(3, {
      durationMs: 0,
      id: "tool_mapping",
      label: "Tool mapping",
      renderHint: "tool_call_table",
      skipReason: reason,
      status: "skipped",
      summary: "No Orbit tool mapping ran.",
    }),
    stage(4, {
      durationMs: 0,
      id: "database_context",
      label: "Database context",
      lane: "data",
      outputSource: sourceView(databaseInteractions),
      renderHint: "database_table",
      skipReason: reason,
      status: "skipped",
      summary: "No local-remote database context was read.",
    }),
    stage(5, {
      durationMs: 0,
      id: "artifact_generation",
      label: "Artifact generation",
      renderHint: "artifact_panel",
      skipReason: reason,
      status: "skipped",
      summary: "No artifact producer output was generated.",
    }),
    stage(6, {
      durationMs: 0,
      id: "synthesis",
      label: "Synthesis",
      renderHint: "raw_text",
      skipReason: reason,
      status: "skipped",
      summary: "No synthesis provider call ran.",
    }),
    stage(7, {
      durationMs: 0,
      id: "final_response",
      label: "Final response",
      outputSource: sourceView(input.boundaryPayload),
      renderHint: "source_json",
      safety: input.boundaryPayload.provenance.safety,
      status: "completed",
      summary: "Returned the local boundary response to the developer trace UI.",
    }),
  ];

  return {
    fullChain: fullChain({
      conversation: input.boundaryPayload,
      databaseInteractions,
      dataSources: [],
      locale: input.locale,
      maxLoopSteps: input.maxLoopSteps,
      message: input.message,
      stages,
      toolCalls: [],
      toolRequests: [],
      totalDurationMs: input.totalDurationMs,
    }),
    plannerOnly: skippedPlannerOnlyTrace(reason),
  };
}

function traceFailureForPlannerResult(
  plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: false }>,
): OrbitAiTraceResult {
  return {
    error: {
      code: plannerResult.error.code,
      context: {
        provider: plannerResult.error.provider,
        source: plannerResult.error.source,
      },
      message: plannerResult.error.message,
    },
    success: false,
  };
}

export function createLiveOrbitAgentTrace(
  config: LiveOrbitAgentTraceConfig = {},
): OrbitAgentTraceRunner {
  const runtime = createLiveOrbitAgentRuntime({
    ...config,
    defaultMaxLoopSteps: 3,
  });

  return {
    async traceMessage(input) {
      const traceStartedAt = nowMs();
      const runtimeResult = await runLiveOrbitAgentRuntime(runtime, input);

      if (runtimeResult.state === "message_required") {
        return {
          error: {
            code: "ORBIT_AGENT_MESSAGE_REQUIRED",
            message:
              "A non-empty user message is required before Orbit Agent can trace a reply.",
          },
          success: false,
        };
      }

      if (runtimeResult.state === "local_boundary") {
        return {
          data: boundaryTrace({
            boundaryPayload: runtimeResult.boundaryPayload,
            locale: runtimeResult.locale,
            maxLoopSteps: runtime.maxLoopSteps,
            message: runtimeResult.message,
            timings: runtimeResult.timings,
            totalDurationMs: elapsedSince(traceStartedAt),
          }),
          success: true,
        };
      }

      if (runtimeResult.state === "planner_failure") {
        return traceFailureForPlannerResult(runtimeResult.plannerResult);
      }

      const {
        artifacts,
        conversation,
        locale,
        message,
        plannerResult,
        shouldExecuteDomainTools,
        shouldSynthesizeAfterTools,
        synthesisResult,
        toolRequests,
      } = runtimeResult;
      const databaseStartedAt = nowMs();
      const databaseInteractions = [databaseInteractionForTools(toolRequests)];
      const databaseDurationMs = elapsedSince(databaseStartedAt);
      const dataSources = dataSourcesForArtifacts(artifacts);
      const toolCalls = toolCallsFor({ artifacts, toolRequests });
      const stages = [
        stage(0, {
          durationMs: 0,
          id: "input_received",
          inputs: {
            locale,
            maxLoopSteps: runtime.maxLoopSteps,
            message,
          },
          label: "Input received",
          outputSource: sourceView({
            conversationMode: process.env.ORBIT_AGENT_CONVERSATION_MODE ?? "mock",
            locale,
            maxLoopSteps: runtime.maxLoopSteps,
            message,
          }),
          status: "completed",
          summary: "Captured the user prompt for a development-only trace run.",
        }),
        stage(1, {
          durationMs: durationForPhase(runtimeResult.timings, "local_boundary"),
          id: "local_guardrails",
          label: "Local guardrails",
          outputSource: sourceView({ matched: null }),
          renderHint: "source_json",
          safety: safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
          status: "completed",
          summary: "No local boundary stopped this prompt.",
        }),
        stage(2, {
          durationMs: durationForPhase(runtimeResult.timings, "planner"),
          id: "planner",
          label: "Planner",
          outputSource: sourceView({
            assistantMessage: plannerResult.data.assistantMessage,
            intent: plannerResult.data.intent,
            model: plannerResult.data.model,
            provider: plannerResult.data.provider,
            source: plannerResult.data.source,
            toolRequests,
          }),
          outputs: plannerResult.data,
          renderHint: "source_json",
          status: "completed",
          summary: `Planner selected ${plannerResult.data.intent}.`,
        }),
        stage(3, {
          durationMs: durationForPhase(runtimeResult.timings, "tool_mapping"),
          id: "tool_mapping",
          label: "Tool mapping",
          outputSource: sourceView(
            toolRequests.map((request) => ({
              artifactKind: artifactKindForTool(request.toolName),
              arguments: request.arguments,
              requiresUserConfirmation: request.requiresUserConfirmation,
              toolFamily: toolFamilyForToolName(request.toolName),
              toolName: request.toolName,
            })),
          ),
          renderHint: "tool_call_table",
          status: "completed",
          summary:
            toolRequests.length > 0
              ? `Mapped ${toolRequests.length} planned Orbit tool call.`
              : "No Orbit tool call was needed for this prompt.",
        }),
        stage(4, {
          durationMs: databaseDurationMs,
          id: "database_context",
          label: "Database context",
          lane: "data",
          outputSource: sourceView(databaseInteractions),
          outputs: databaseInteractions,
          renderHint: "database_table",
          safety: safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
          status: "completed",
          summary: databaseInteractions[0].summary,
        }),
        stage(5, {
          durationMs: durationForPhase(runtimeResult.timings, "artifact_generation"),
          id: "artifact_generation",
          label: "Artifact generation",
          outputSource: sourceView(artifacts),
          renderHint: "artifact_panel",
          skipReason:
            shouldExecuteDomainTools || toolRequests.length === 0
              ? undefined
              : "Loop stopped after planner by maxLoopSteps.",
          status:
            shouldExecuteDomainTools || toolRequests.length === 0
              ? "completed"
              : "skipped",
          summary:
            artifacts.length > 0
              ? `Generated ${artifacts.length} reviewable artifact producer output.`
              : "No artifact producer output was generated.",
        }),
        stage(6, {
          durationMs: durationForPhase(runtimeResult.timings, "synthesis"),
          id: "synthesis",
          label: "Synthesis",
          outputSource:
            synthesisResult?.success === true
              ? sourceView(synthesisResult.data.assistantMessage)
              : synthesisResult?.success === false
                ? sourceView(synthesisResult.error)
                : undefined,
          renderHint: "raw_text",
          skipReason:
            shouldSynthesizeAfterTools || synthesisResult
              ? undefined
              : "Synthesis requires maxLoopSteps >= 3 and at least one artifact.",
          status:
            synthesisResult?.success === true
              ? "completed"
              : synthesisResult?.success === false
                ? "failed"
                : "skipped",
          summary:
            synthesisResult?.success === true
              ? "Synthesized the final assistant response from the artifact summaries."
              : "Used the planner assistant message as the final response.",
        }),
        stage(7, {
          durationMs: durationForPhase(runtimeResult.timings, "final_response"),
          id: "final_response",
          label: "Final response",
          outputSource: sourceView(conversation),
          renderHint: "source_json",
          safety: conversation.provenance.safety,
          status: "completed",
          summary: "Returned the traced conversation payload.",
        }),
      ];

      return {
        data: {
          fullChain: fullChain({
            conversation,
            databaseInteractions,
            dataSources,
            locale,
            maxLoopSteps: runtime.maxLoopSteps,
            message,
            plannerResult,
            raw: {
              plannerOutputText: plannerResult.data.rawOutputText,
              synthesisOutputText:
                synthesisResult?.success === true
                  ? synthesisResult.data.rawOutputText
                  : synthesisResult?.error.rawOutputText,
            },
            stages,
            toolCalls,
            toolRequests,
            totalDurationMs: elapsedSince(traceStartedAt),
          }),
          plannerOnly: plannerOnlyTrace({
            locale,
            message,
            plannerResult,
            toolRequests,
          }),
        },
        success: true,
      };
    },
  };
}
