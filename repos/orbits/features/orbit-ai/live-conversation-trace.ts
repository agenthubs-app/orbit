import type {
  OrbitAgentArtifactKind,
  OrbitAgentArtifactPayload,
  OrbitAgentArtifactSourceModule,
  OrbitAgentArtifactTaskRequest,
} from "./artifact-contract";
import type {
  OrbitAgentConversationMessage,
  OrbitAgentConversationPayload,
  OrbitAgentConversationProvenance,
  OrbitAgentConversationSummary,
  OrbitAgentProposedToolIntent,
  OrbitAgentSafetyLedger,
  OrbitAgentSendMessageInput,
} from "./conversation-contract";
import {
  createGeminiOrbitAgentPlanner,
  type GeminiOrbitAgentIntent,
  type GeminiOrbitAgentPlannerResult,
  type GeminiOrbitAgentProviderConfig,
  type GeminiOrbitAgentToolName,
  type GeminiOrbitAgentToolRequest,
  type GeminiOrbitAgentToolResultSummary,
} from "./gemini-provider";
import { createOrbitAgentArtifactPreviewService } from "./artifact-task-preview-service";
import { createLiveOrbitAgentLocalBoundaryPayload } from "./live-conversation-service";
import type { OrbitAgentArtifactTaskService } from "./service";
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
  type OrbitAiTraceRuntimeSubAgent,
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

const traceCollectedAt = "2026-06-27T00:03:00.000Z";
const liveCollectedAt = "2026-06-27T00:00:00.000Z";
const liveConversationId = "live-orbit-agent-conversation";
const defaultMaxLoopSteps = 3;
const maxSupportedLoopSteps = 3;
const maxSupportedTraceLoops = 3;
const minSupportedLoopSteps = 1;
type OrbitAgentLocale = "en" | "zh";

// live-conversation-trace 是开发调试用的完整执行链快照：
// 输入、本地 guardrail、planner、tool mapping、artifact、synthesis、最终响应都会记录成 stage。
export interface LiveOrbitAgentTraceConfig
  extends GeminiOrbitAgentProviderConfig {
  artifactTaskService?: OrbitAgentArtifactTaskService;
  maxLoopSteps?: number | string | null;
}

export interface OrbitAgentTraceRunner {
  traceMessage(input: OrbitAgentSendMessageInput): Promise<OrbitAiTraceResult>;
}

type TraceStageInput = {
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

function readText(value: unknown): string | null {
  // 文本入口统一 trim，空值返回 null 以便生成明确 validation error。
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(locale: unknown): OrbitAgentLocale {
  return locale === "en" ? "en" : "zh";
}

function localize(locale: OrbitAgentLocale, copy: Record<OrbitAgentLocale, string>) {
  return copy[locale];
}

function readMaxLoopSteps(value: unknown): number {
  // trace 也遵守 live agent 的 loop 预算：1 planner、2 artifact、3 synthesis。
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : defaultMaxLoopSteps;

  if (!Number.isFinite(parsed)) {
    return defaultMaxLoopSteps;
  }

  return Math.min(
    maxSupportedLoopSteps,
    Math.max(minSupportedLoopSteps, Math.floor(parsed)),
  );
}

function safetyLedger(input: {
  aiProviderRequested: boolean;
  domainToolCallsExecuted?: boolean;
  externalNetworkRequested: boolean;
}): OrbitAgentSafetyLedger {
  return {
    aiProviderRequested: input.aiProviderRequested,
    calendarProviderRequested: false,
    domainToolCallsExecuted: input.domainToolCallsExecuted ?? false,
    emailProviderRequested: false,
    externalNetworkRequested: input.externalNetworkRequested,
    externalSideEffectsExecuted: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    notificationDelivered: false,
  };
}

function provenance(input: {
  generationMethod: OrbitAgentConversationProvenance["generationMethod"];
  label: string;
  safety: OrbitAgentSafetyLedger;
  source: OrbitAgentConversationProvenance["source"];
}): OrbitAgentConversationProvenance {
  return {
    collectedAt: liveCollectedAt,
    evidenceIds: ["evidence:orbit-agent:model-provider"],
    generationMethod: input.generationMethod,
    privacy: "demo-orbit-agent-conversation-only",
    safety: input.safety,
    source: input.source,
    sourceLabel: input.label,
  };
}

function conversationSummary(
  message: OrbitAgentConversationMessage | null,
): OrbitAgentConversationSummary {
  return {
    conversationId: liveConversationId,
    evidenceIds: ["evidence:orbit-agent:model-provider"],
    lastMessagePreview:
      message?.content ??
      "Orbit Agent is ready for a natural-language request.",
    title: "Orbit Agent live conversation",
    updatedAt: message?.createdAt ?? liveCollectedAt,
  };
}

function userMessage(content: string): OrbitAgentConversationMessage {
  return {
    content,
    conversationId: liveConversationId,
    createdAt: "2026-06-27T00:01:00.000Z",
    evidenceIds: ["evidence:orbit-agent:trace-user-message"],
    messageId: "orbit-agent-trace-user-latest",
    role: "user",
  };
}

function assistantMessage(content: string): OrbitAgentConversationMessage {
  return {
    content,
    conversationId: liveConversationId,
    createdAt: "2026-06-27T00:01:01.000Z",
    evidenceIds: ["evidence:orbit-agent:trace-assistant-reply"],
    messageId: "orbit-agent-trace-assistant-latest",
    role: "assistant",
  };
}

function traceTimeFor(index: number): string {
  return `2026-06-27T00:03:0${index}.000Z`;
}

function stage(index: number, input: TraceStageInput): OrbitAiTraceStage {
  // 每个 stage 都经过 redactValue，避免密钥/token 等字段进入调试 UI。
  return {
    completedAt: traceTimeFor(index),
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

function toolNameForIntent(
  intent: GeminiOrbitAgentIntent,
): GeminiOrbitAgentToolName | null {
  if (intent === "event_recommendations") {
    return "events.recommend";
  }

  if (intent === "contact_recommendations") {
    return "contacts.recommend";
  }

  if (intent === "followup_queue") {
    return "followups.reviewQueue";
  }

  if (intent === "relationship_chat_context") {
    return "chat.context";
  }

  return null;
}

function artifactKindForTool(
  toolName: GeminiOrbitAgentToolName,
): OrbitAgentArtifactKind {
  const kinds: Record<GeminiOrbitAgentToolName, OrbitAgentArtifactKind> = {
    "chat.context": "relationship_chat_context",
    "contacts.recommend": "contact_recommendations",
    "events.recommend": "event_recommendations",
    "followups.reviewQueue": "followup_queue",
  };

  return kinds[toolName];
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

function subAgentForArtifactKind(kind: OrbitAgentArtifactKind): string {
  if (kind === "event_recommendations") {
    return "event_recommendation_agent";
  }

  if (kind === "contact_recommendations") {
    return "contact_recommendation_agent";
  }

  if (kind === "followup_queue") {
    return "followup_review_agent";
  }

  return "relationship_chat_review_agent";
}

function toolFamilyForToolName(toolName: string): string {
  if (toolName === "chat.context") {
    return "relationship_chat";
  }

  return toolName.split(".")[0] ?? toolName;
}

function proposedIntentForTool(
  request: GeminiOrbitAgentToolRequest,
  locale: OrbitAgentLocale = "en",
): OrbitAgentProposedToolIntent {
  const labels: Record<
    GeminiOrbitAgentToolName,
    Record<OrbitAgentLocale, string>
  > = {
    "chat.context": {
      en: "Review relationship conversation context",
      zh: "复核关系对话上下文",
    },
    "contacts.recommend": {
      en: "Recommend relevant contacts",
      zh: "推荐相关人脉",
    },
    "events.recommend": {
      en: "Inspect event context",
      zh: "推荐活动",
    },
    "followups.reviewQueue": {
      en: "Review follow-up queue",
      zh: "复核跟进队列",
    },
  };
  const toolFamily = toolFamilyForToolName(
    request.toolName,
  ) as OrbitAgentProposedToolIntent["toolFamily"];

  return {
    intentId: `intent:trace:${request.toolName}`,
    label: localize(locale, labels[request.toolName]),
    reason: localize(locale, {
      en: "The configured model provider selected this allowed Orbit tool from the user prompt; trace mode records the handoff without external side effects.",
      zh: "模型 provider 从用户请求中选择了这个 Orbit 允许工具；trace 模式只记录交接，不执行外部副作用。",
    }),
    requiresUserConfirmation: true,
    toolFamily,
  };
}

function artifactForRequest(input: {
  artifactTaskService: OrbitAgentArtifactTaskService;
  locale?: string | null;
  message: string;
  request: GeminiOrbitAgentToolRequest;
}): OrbitAgentArtifactPayload | null {
  const locale = normalizeLocale(input.locale);
  // trace 中的 artifact 来自注入的 artifact task contract；默认 preview 不读取 fixture。
  const request: OrbitAgentArtifactTaskRequest = {
    conversationId: liveConversationId,
    kind: artifactKindForTool(input.request.toolName),
    locale,
    presentation: {
      preferredSurface: "side_panel",
      title: proposedIntentForTool(input.request, locale).label,
      widthHint: "half",
    },
    query: input.message,
  };
  const result = input.artifactTaskService.createArtifactTask(request);

  return result.success ? result.data : null;
}

function artifactSummaryForSynthesis(
  artifact: OrbitAgentArtifactPayload,
): GeminiOrbitAgentToolResultSummary {
  return {
    kind: artifact.task.kind,
    preferredSurface: artifact.result.presentation.preferredSurface,
    summary:
      artifact.result.generatedView?.summary ??
      artifact.result.nextAction ??
      "Orbit prepared a reviewable artifact.",
    title: artifact.result.presentation.title,
  };
}

function toolRequestsForPlannerResult(
  plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: true }>,
): readonly GeminiOrbitAgentToolRequest[] {
  // provider 可能只返回 intent；这里用白名单 intent 映射补齐最小 tool request。
  const fallbackToolName = toolNameForIntent(plannerResult.data.intent);

  if (plannerResult.data.toolRequests.length > 0) {
    return plannerResult.data.toolRequests;
  }

  if (!fallbackToolName) {
    return [];
  }

  return [
    {
      arguments: {},
      requiresUserConfirmation: true,
      toolName: fallbackToolName,
    },
  ];
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
  // runtimeSnapshot 告诉可视化页面：有哪些工具、sub-agent、renderer 和数据来源参与了本次链路。
  const artifactsByKind = new Map<OrbitAgentArtifactKind, OrbitAgentArtifactPayload>();

  for (const artifact of input.artifacts) {
    artifactsByKind.set(artifact.task.kind, artifact);
  }

  const tools = input.toolRequests.map((request) => {
    const artifactKind = artifactKindForTool(request.toolName);
    const artifact = artifactsByKind.get(artifactKind);

    return {
      artifactKind,
      outputSchema: "OrbitAgentArtifactPayload",
      renderHint: "artifact_panel",
      sourceModules:
        artifact?.result.provenance.sourceModules ??
        sourceModulesForArtifactKind(artifactKind),
      toolFamily: toolFamilyForToolName(request.toolName),
      toolName: request.toolName,
    };
  });
  const subAgents: OrbitAiTraceRuntimeSubAgent[] = Array.from(
    new Map(
      input.artifacts.map((artifact) => [
        artifact.task.subAgent,
        {
          artifactKinds: [artifact.task.kind],
          renderHints: ["artifact_panel"],
          sourceModules: artifact.result.provenance.sourceModules,
          subAgent: artifact.task.subAgent,
        },
      ]),
    ).values(),
  );

  if (subAgents.length === 0) {
    for (const request of input.toolRequests) {
      const artifactKind = artifactKindForTool(request.toolName);
      const subAgent = subAgentForArtifactKind(artifactKind);

      subAgents.push({
        artifactKinds: [artifactKind],
        renderHints: ["artifact_panel"],
        sourceModules: sourceModulesForArtifactKind(artifactKind),
        subAgent,
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
    subAgents,
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

function conversationForSuccess(input: {
  artifacts: readonly OrbitAgentArtifactPayload[];
  assistant: string;
  locale: OrbitAgentLocale;
  message: string;
  plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: true }>;
  toolRequests: readonly GeminiOrbitAgentToolRequest[];
}): OrbitAgentConversationPayload {
  const messages = [userMessage(input.message), assistantMessage(input.assistant)];
  const safety = safetyLedger({
    aiProviderRequested: true,
    domainToolCallsExecuted: input.artifacts.length > 0,
    externalNetworkRequested: true,
  });

  return {
    activeConversationId: liveConversationId,
    artifacts: input.artifacts,
    assistantMessage: input.assistant,
    conversations: [conversationSummary(messages[messages.length - 1])],
    messages,
    nextAction: localize(input.locale, {
      en: "Review the traced Orbit Agent plan, generated artifacts, and source panels before enabling any external side effect.",
      zh: "启用任何外部副作用前，请复核 trace 中的 Orbit Agent 计划、生成结果和来源面板。",
    }),
    proposedToolIntents: input.toolRequests.map((request) =>
      proposedIntentForTool(request, input.locale),
    ),
    provenance: provenance({
      generationMethod: "model-provider-live-agent-reply",
      label: `Orbit Agent trace reply via ${input.plannerResult.data.provider}:${input.plannerResult.data.model}`,
      safety,
      source: input.plannerResult.data.source,
    }),
    state: "success",
  };
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
    const subAgent = artifact?.task.subAgent ?? subAgentForArtifactKind(artifactKind);
    const toolNodeId = `loop:${loopIndex}:tool:${request.toolName}`;
    const subAgentNodeId = `loop:${loopIndex}:subagent:${subAgent}`;

    nodes.push({
      id: toolNodeId,
      kind: "tool",
      label: request.toolName,
      lane: "agent",
      loopIndex,
      stageId: "tool_mapping",
      status: "completed",
      summary: `Planner selected ${request.toolName}.`,
    });
    nodes.push({
      id: subAgentNodeId,
      kind: "subagent",
      label: subAgent,
      lane: "agent",
      loopIndex,
      stageId: "artifact_generation",
      status: artifact ? "completed" : "skipped",
      summary: artifact
        ? `Sub-agent prepared ${artifact.task.kind}.`
        : "Sub-agent would run if the trace budget reaches artifact generation.",
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
      kind: "subagent",
      to: subAgentNodeId,
    });
    edges.push({
      from: subAgentNodeId,
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
    traceSchemaVersion: ORBIT_AI_TRACE_SCHEMA_VERSION,
  };
}

function boundaryTrace(input: {
  boundaryPayload: OrbitAgentConversationPayload;
  locale: string;
  maxLoopSteps: number;
  message: string;
}): OrbitAiTracePayload {
  // 本地边界命中时，trace 明确标出 planner/tool/artifact/synthesis 全部 skipped。
  const reason = `Stopped at ${input.boundaryPayload.provenance.sourceLabel} (${input.boundaryPayload.provenance.source}) before planner, tools, or synthesis.`;
  const databaseInteractions = [skippedDatabaseInteraction(reason)];
  const stages = [
    stage(0, {
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
      id: "local_guardrails",
      label: "Local guardrails",
      outputSource: sourceView(input.boundaryPayload.provenance),
      renderHint: "source_json",
      safety: input.boundaryPayload.provenance.safety,
      status: "blocked",
      summary: `Stopped locally at ${input.boundaryPayload.provenance.sourceLabel}.`,
    }),
    stage(2, {
      id: "planner",
      label: "Planner",
      renderHint: "source_json",
      skipReason: reason,
      status: "skipped",
      summary: "Planner was skipped because the local boundary handled the turn.",
    }),
    stage(3, {
      id: "tool_mapping",
      label: "Tool mapping",
      renderHint: "tool_call_table",
      skipReason: reason,
      status: "skipped",
      summary: "No Orbit tool mapping ran.",
    }),
    stage(4, {
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
      id: "artifact_generation",
      label: "Artifact generation",
      renderHint: "artifact_panel",
      skipReason: reason,
      status: "skipped",
      summary: "No sub-agent artifact was generated.",
    }),
    stage(6, {
      id: "synthesis",
      label: "Synthesis",
      renderHint: "raw_text",
      skipReason: reason,
      status: "skipped",
      summary: "No synthesis provider call ran.",
    }),
    stage(7, {
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
    }),
    plannerOnly: skippedPlannerOnlyTrace(reason),
  };
}

function failureForPlannerResult(
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
  // planner 负责真实 provider 访问；trace runner 负责把各阶段结果编排成可视化 payload。
  const planner = createGeminiOrbitAgentPlanner(config);
  const artifactTaskService =
    config.artifactTaskService ?? createOrbitAgentArtifactPreviewService();
  const maxLoopSteps = readMaxLoopSteps(
    config.maxLoopSteps ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
  );

  return {
    async traceMessage(input) {
      // traceMessage 和 live service 同样先校验空消息，再走本地边界。
      const message = readText(input.message);
      const locale = normalizeLocale(input.locale);

      if (!message) {
        return {
          error: {
            code: "ORBIT_AGENT_MESSAGE_REQUIRED",
            message:
              "A non-empty user message is required before Orbit Agent can trace a reply.",
          },
          success: false,
        };
      }

      const boundaryPayload = createLiveOrbitAgentLocalBoundaryPayload(message);

      if (boundaryPayload) {
        // 本地边界响应仍算一次成功 trace，因为链路已经被明确、安全地截停。
        return {
          data: boundaryTrace({
            boundaryPayload,
            locale,
            maxLoopSteps,
            message,
          }),
          success: true,
        };
      }

      const plannerResult = await planner.plan({
        locale,
        message,
      });

      if (plannerResult.success === false) {
        // provider 失败直接返回 trace error，不伪造后续 stage。
        return failureForPlannerResult(plannerResult);
      }

      // 后续阶段都受 maxLoopSteps 控制，便于单独调试 planner/artifact/synthesis。
      const toolRequests = toolRequestsForPlannerResult(plannerResult);
      const shouldExecuteDomainTools = maxLoopSteps >= 2;
      const artifacts = shouldExecuteDomainTools
        ? toolRequests
            .map((request) =>
              artifactForRequest({
                artifactTaskService,
                locale,
                message,
                request,
              }),
            )
            .filter((artifact): artifact is OrbitAgentArtifactPayload =>
              Boolean(artifact),
            )
        : [];
      const shouldSynthesize = maxLoopSteps >= 3 && artifacts.length > 0;
      const synthesisResult = shouldSynthesize
        ? await planner.synthesize({
            artifacts: artifacts.map(artifactSummaryForSynthesis),
            assistantMessage: plannerResult.data.assistantMessage,
            intent: plannerResult.data.intent,
            locale,
            message,
            toolRequests,
          })
        : null;
      const finalAssistant =
        synthesisResult?.success === true
          ? synthesisResult.data.assistantMessage
          : plannerResult.data.assistantMessage;
      const conversation = conversationForSuccess({
        artifacts,
        assistant: finalAssistant,
        locale,
        message,
        plannerResult,
        toolRequests,
      });
      const databaseInteractions = [databaseInteractionForTools(toolRequests)];
      const dataSources = dataSourcesForArtifacts(artifacts);
      const toolCalls = toolCallsFor({ artifacts, toolRequests });
      const stages = [
        stage(0, {
          id: "input_received",
          inputs: {
            locale,
            maxLoopSteps,
            message,
          },
          label: "Input received",
          outputSource: sourceView({
            conversationMode: process.env.ORBIT_AGENT_CONVERSATION_MODE ?? "mock",
            locale,
            maxLoopSteps,
            message,
          }),
          status: "completed",
          summary: "Captured the user prompt for a development-only trace run.",
        }),
        stage(1, {
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
              ? `Generated ${artifacts.length} reviewable sub-agent artifact.`
              : "No sub-agent artifact was generated.",
        }),
        stage(6, {
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
            shouldSynthesize || synthesisResult
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
            maxLoopSteps,
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
