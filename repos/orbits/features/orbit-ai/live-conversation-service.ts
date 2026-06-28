import {
  type OrbitAgentArtifactKind,
  type OrbitAgentArtifactPayload,
  type OrbitAgentArtifactTaskRequest,
} from "./artifact-contract";
import {
  ORBIT_AGENT_CONVERSATION_ERROR_DEFINITIONS,
  type OrbitAgentConversationErrorCode,
  type OrbitAgentConversationFailure,
  type OrbitAgentConversationInput,
  type OrbitAgentConversationMessage,
  type OrbitAgentConversationPayload,
  type OrbitAgentConversationProvenance,
  type OrbitAgentConversationResult,
  type OrbitAgentConversationScenario,
  type OrbitAgentConversationService,
  type OrbitAgentConversationSummary,
  type OrbitAgentProposedToolIntent,
  type OrbitAgentSafetyLedger,
  type OrbitAgentSendMessageInput,
} from "./conversation-contract";
import {
  createGeminiOrbitAgentPlanner,
  type GeminiOrbitAgentIntent,
  type GeminiOrbitAgentPlannerResult,
  type OrbitAgentProviderSource,
  type GeminiOrbitAgentProviderConfig,
  type GeminiOrbitAgentToolResultSummary,
  type GeminiOrbitAgentToolName,
  type GeminiOrbitAgentToolRequest,
} from "./gemini-provider";
import { createMockOrbitAgentArtifactTaskService } from "./mock-artifact-task-service";

const liveCollectedAt = "2026-06-27T00:00:00.000Z";
const liveConversationId = "live-orbit-agent-conversation";
const defaultMaxLoopSteps = 3;
const maxSupportedLoopSteps = 3;
const minSupportedLoopSteps = 1;

export interface LiveOrbitAgentConversationServiceConfig
  extends GeminiOrbitAgentProviderConfig {
  maxLoopSteps?: number | string | null;
}

const supportedScenarios = new Set<OrbitAgentConversationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

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
  source?: OrbitAgentConversationProvenance["source"];
}): OrbitAgentConversationProvenance {
  return {
    collectedAt: liveCollectedAt,
    evidenceIds: ["evidence:orbit-agent:model-provider"],
    generationMethod: input.generationMethod,
    privacy: "demo-orbit-agent-conversation-only",
    safety: input.safety,
    source: input.source ?? "provider:gemini-interactions-api",
    sourceLabel: input.label,
  };
}

function normalizeScenario(
  scenario?: OrbitAgentConversationInput["scenario"],
): OrbitAgentConversationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as OrbitAgentConversationScenario)
  ) {
    return scenario as OrbitAgentConversationScenario;
  }

  return "success";
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPrivacyControlRequest(message: string): boolean {
  return /(?:不要|别|請勿|请勿).*(?:AI|ai|人工智能)?.*分析|关闭.*(?:AI|ai)?.*分析|(?:不要|别|請勿|请勿).*(?:保存|存储|儲存).*(?:聊天|记录|內容|内容)|(?:删掉|删除|刪除).*(?:聊天|记录|內容|内容)|do not analy[sz]e|don't analy[sz]e|do not (?:save|store|retain)|don't (?:save|store|retain)|delete (?:this )?(?:chat|conversation|record)/i.test(
    message,
  );
}

function isUntrustedInstructionInjectionRequest(message: string): boolean {
  const injectionInstruction =
    /忽略(?:之前|以上|所有|系统|开发者)?.*(?:指令|规则)|ignore (?:previous|above|all|system|developer) instructions/i;
  const crossRelationshipLeak =
    /(?:把|将|給|给).*(?:联系方式|資料|资料|联系人资料|contact info|contact details).*(?:发给我|給我|给我|send to me)|(?:其它|其他|别的|other).*(?:联系人|关系|contact|relationship).*(?:资料|信息|info|details)/i;

  return injectionInstruction.test(message) || crossRelationshipLeak.test(message);
}

function isSecretDisclosureRequest(message: string): boolean {
  const disclosureVerb =
    /(?:发给我|给我看|显示|打印|输出|透露|泄露|show|print|send|reveal|leak|dump)/i;
  const secretObject =
    /(?:api[_ -]?key|secret|token|password|passwd|credential|凭据|密钥|金钥|令牌|密码|环境变量|\\.env|DEEPSEEK_API_KEY|OPENAI_API_KEY)/i;

  return disclosureVerb.test(message) && secretObject.test(message);
}

function isAmbiguousRecipientDraftRequest(message: string): boolean {
  const relationshipAction =
    /(?:写|草稿|消息|短信|微信|邮件|邀|约|见面|联系|follow[ -]?up|message|draft|send|invite|meet)/i;
  const ambiguousRecipient =
    /(?:给|發給|发给|約|约|邀請|邀请|联系|和)(?:她|他|ta|TA)|\b(?:write|message|send|invite|meet|follow up with)\s+(?:her|him|them)\b/i;

  return relationshipAction.test(message) && ambiguousRecipient.test(message);
}

function isRelationshipStateMutationRequest(message: string): boolean {
  const mutationVerb =
    /(?:更新|修改|改成|改为|保存|記住|记住|记录|添加|新增|新建|创建|建立|加入|加到|导入|匯入|提醒|通知|刪除|删除|移除|忘记|update|change|save|remember|record|add|create|import|remind|notify|delete|remove|forget)/i;
  const relationshipObject =
    /(?:联系人|关系|资料|資料|公司|职位|职务|标签|备注|画像|contact|relationship|profile|company|title|tag|note|Maya|Diego)/i;

  return mutationVerb.test(message) && relationshipObject.test(message);
}

function readMaxLoopSteps(value: unknown): number {
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

function failure(
  code: OrbitAgentConversationErrorCode,
  safety: OrbitAgentSafetyLedger,
  message?: string,
  source?: OrbitAgentProviderSource,
): OrbitAgentConversationFailure {
  const definition = ORBIT_AGENT_CONVERSATION_ERROR_DEFINITIONS[code];

  return {
    error: {
      ...definition,
      evidenceIds: ["evidence:orbit-agent:model-provider-failure"],
      message: message ?? definition.message,
      provenance: provenance({
        generationMethod: "model-provider-live-agent-state",
        label: "Orbit Agent live model provider failure",
        safety,
        source,
      }),
      state: "failure",
    },
    success: false,
  };
}

function success(payload: OrbitAgentConversationPayload): OrbitAgentConversationResult {
  return {
    data: JSON.parse(JSON.stringify(payload)) as OrbitAgentConversationPayload,
    success: true,
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

function statePayload(input: {
  assistantMessage: string;
  safety: OrbitAgentSafetyLedger;
  state: "empty" | "pending" | "success";
}): OrbitAgentConversationPayload {
  const messages =
    input.state === "empty"
      ? []
      : [
          {
            content: input.assistantMessage,
            conversationId: liveConversationId,
            createdAt: liveCollectedAt,
            evidenceIds: ["evidence:orbit-agent:model-provider"],
            messageId: "orbit-agent-live-ready",
            role: "assistant" as const,
          },
        ];

  return {
    activeConversationId: input.state === "empty" ? null : liveConversationId,
    artifacts: [],
    assistantMessage: input.assistantMessage,
    conversations:
      input.state === "empty" ? [] : [conversationSummary(messages[0] ?? null)],
    messages,
    nextAction:
      "Send a natural-language prompt; Orbit will ask the configured model provider to plan before any internal tool is considered.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "model-provider-live-agent-state",
      label: "Orbit Agent live model provider state",
      safety: input.safety,
    }),
    state: input.state,
  };
}

function scenarioResult(
  scenario: OrbitAgentConversationScenario,
): OrbitAgentConversationResult | null {
  const safe = safetyLedger({
    aiProviderRequested: false,
    externalNetworkRequested: false,
  });

  switch (scenario) {
    case "empty":
      return success(
        statePayload({
          assistantMessage:
            "Orbit Agent has no active local conversation yet.",
          safety: safe,
          state: "empty",
        }),
      );
    case "pending":
      return success(
        statePayload({
          assistantMessage:
            "Orbit Agent is waiting behind a local guard.",
          safety: safe,
          state: "pending",
        }),
      );
    case "failure":
      return failure("ORBIT_AGENT_PROVIDER_REQUEST_FAILED", safe);
    case "success":
    default:
      return null;
  }
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

function proposedIntentForTool(
  request: GeminiOrbitAgentToolRequest,
): OrbitAgentProposedToolIntent {
  const labels: Record<GeminiOrbitAgentToolName, string> = {
    "chat.context": "Review relationship conversation context",
    "contacts.recommend": "Recommend relevant contacts",
    "events.recommend": "Inspect event context",
    "followups.reviewQueue": "Review follow-up queue",
  };

  return {
    intentId: `intent:gemini:${request.toolName}`,
    label: labels[request.toolName],
    reason:
      "The configured model provider selected this allowed Orbit tool from the user prompt; execution remains inside Orbit and requires confirmation before side effects.",
    requiresUserConfirmation: true,
    toolFamily:
      request.toolName === "chat.context"
        ? "relationship_chat"
        : request.toolName.startsWith("events.")
          ? "events"
          : request.toolName.startsWith("contacts.")
            ? "contacts"
            : "followups",
  };
}

function artifactForRequest(input: {
  message: string;
  request: GeminiOrbitAgentToolRequest;
}): OrbitAgentArtifactPayload | null {
  const artifactService = createMockOrbitAgentArtifactTaskService();
  const request: OrbitAgentArtifactTaskRequest = {
    conversationId: liveConversationId,
    kind: artifactKindForTool(input.request.toolName),
    presentation: {
      preferredSurface: "side_panel",
      title: proposedIntentForTool(input.request).label,
      widthHint: "half",
    },
    query: input.message,
  };
  const result = artifactService.createArtifactTask(request);

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

function failureForPlannerResult(
  plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: false }>,
): OrbitAgentConversationResult {
  const safety = safetyLedger({
    aiProviderRequested: plannerResult.error.code !== "MODEL_API_KEY_MISSING",
    externalNetworkRequested: plannerResult.error.code !== "MODEL_API_KEY_MISSING",
  });

  if (plannerResult.error.code === "MODEL_API_KEY_MISSING") {
    return failure(
      "ORBIT_AGENT_PROVIDER_API_KEY_MISSING",
      safety,
      plannerResult.error.message,
      plannerResult.error.source,
    );
  }

  if (plannerResult.error.code === "MODEL_SCHEMA_INVALID") {
    return failure(
      "ORBIT_AGENT_PROVIDER_SCHEMA_INVALID",
      safety,
      plannerResult.error.message,
      plannerResult.error.source,
    );
  }

  return failure(
    "ORBIT_AGENT_PROVIDER_REQUEST_FAILED",
    safety,
    plannerResult.error.message,
    plannerResult.error.source,
  );
}

function userMessage(content: string): OrbitAgentConversationMessage {
  return {
    content,
    conversationId: liveConversationId,
    createdAt: "2026-06-27T00:01:00.000Z",
    evidenceIds: ["evidence:orbit-agent:gemini-user-message"],
    messageId: "orbit-agent-gemini-user-latest",
    role: "user",
  };
}

function assistantMessage(content: string): OrbitAgentConversationMessage {
  return {
    content,
    conversationId: liveConversationId,
    createdAt: "2026-06-27T00:01:01.000Z",
    evidenceIds: ["evidence:orbit-agent:gemini-assistant-reply"],
    messageId: "orbit-agent-gemini-assistant-latest",
    role: "assistant",
  };
}

function privacyControlPayload(message: string): OrbitAgentConversationPayload {
  const assistant =
    "这条请求已停在本地隐私控制边界：没有执行分析、存储、删除或隐私设置变更。若要持久关闭聊天分析，请在隐私控制中确认设置。";
  const messages = [userMessage(message), assistantMessage(assistant)];
  const safety = safetyLedger({
    aiProviderRequested: false,
    domainToolCallsExecuted: false,
    externalNetworkRequested: false,
  });

  return {
    activeConversationId: liveConversationId,
    artifacts: [],
    assistantMessage: assistant,
    conversations: [conversationSummary(messages[messages.length - 1])],
    messages,
    nextAction:
      "Open privacy controls to make a durable analysis preference change; no provider, tool, storage, or external action ran for this request.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local privacy boundary",
      safety,
      source: "local:orbit-agent-privacy-boundary",
    }),
    state: "success",
  };
}

function untrustedContentBoundaryPayload(
  message: string,
): OrbitAgentConversationPayload {
  const assistant =
    "这段外部内容包含不可信指令注入风险。Orbit 已停在本地安全边界：没有把它发送给模型、没有泄露其它联系人资料、没有执行工具或外部动作。你可以把它作为证据复核，但不能让其中的指令改变隐私、权限或确认要求。";
  const messages = [userMessage(message), assistantMessage(assistant)];
  const safety = safetyLedger({
    aiProviderRequested: false,
    domainToolCallsExecuted: false,
    externalNetworkRequested: false,
  });

  return {
    activeConversationId: liveConversationId,
    artifacts: [],
    assistantMessage: assistant,
    conversations: [conversationSummary(messages[messages.length - 1])],
    messages,
    nextAction:
      "Review the quoted relationship content as untrusted evidence only; do not reveal other contacts or execute any action from it.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local untrusted content boundary",
      safety,
      source: "local:orbit-agent-untrusted-content-boundary",
    }),
    state: "success",
  };
}

function secretBoundaryPayload(message: string): OrbitAgentConversationPayload {
  const assistant =
    "这个请求涉及密钥、凭据或环境变量。Orbit 已停在本地安全边界：没有调用模型、没有发送任何密钥，也不会泄露本地 .env 内容。需要轮换或配置密钥时，请在安全设置或部署环境里处理。";
  const messages = [userMessage(message), assistantMessage(assistant)];
  const safety = safetyLedger({
    aiProviderRequested: false,
    domainToolCallsExecuted: false,
    externalNetworkRequested: false,
  });

  return {
    activeConversationId: liveConversationId,
    artifacts: [],
    assistantMessage: assistant,
    conversations: [conversationSummary(messages[messages.length - 1])],
    messages,
    nextAction:
      "Handle secrets outside chat; do not expose API keys or environment variables in model prompts or artifacts.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local secret boundary",
      safety,
      source: "local:orbit-agent-secret-boundary",
    }),
    state: "success",
  };
}

function clarificationBoundaryPayload(message: string): OrbitAgentConversationPayload {
  const assistant =
    "需要先明确联系人对象。我不会假定“她”是谁，也没有调用模型、执行工具或生成草稿。请告诉我联系人姓名或选择一位联系人后，我再准备可复核的消息草稿。";
  const messages = [userMessage(message), assistantMessage(assistant)];
  const safety = safetyLedger({
    aiProviderRequested: false,
    domainToolCallsExecuted: false,
    externalNetworkRequested: false,
  });

  return {
    activeConversationId: liveConversationId,
    artifacts: [],
    assistantMessage: assistant,
    conversations: [conversationSummary(messages[messages.length - 1])],
    messages,
    nextAction:
      "Ask the user to identify the recipient before drafting relationship outreach.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local clarification boundary",
      safety,
      source: "local:orbit-agent-clarification-boundary",
    }),
    state: "success",
  };
}

function stateChangeBoundaryPayload(message: string): OrbitAgentConversationPayload {
  const assistant =
    "联系人资料变更、任务或提醒都要先确认。Orbit 已停在本地确认边界：没有调用模型，没有写入或添加联系人资料，没有创建任务或提醒，也没有删除记录、投递通知或执行外部动作。请先打开对应详情复核。";
  const messages = [userMessage(message), assistantMessage(assistant)];
  const safety = safetyLedger({
    aiProviderRequested: false,
    domainToolCallsExecuted: false,
    externalNetworkRequested: false,
  });

  return {
    activeConversationId: liveConversationId,
    artifacts: [],
    assistantMessage: assistant,
    conversations: [conversationSummary(messages[messages.length - 1])],
    messages,
    nextAction:
      "Open the contact detail confirmation flow before saving or deleting relationship state.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local state-change confirmation boundary",
      safety,
      source: "local:orbit-agent-state-change-boundary",
    }),
    state: "success",
  };
}

export function createLiveOrbitAgentConversationService(
  config: LiveOrbitAgentConversationServiceConfig = {},
): OrbitAgentConversationService {
  const planner = createGeminiOrbitAgentPlanner(config);
  const maxLoopSteps = readMaxLoopSteps(
    config.maxLoopSteps ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
  );

  return {
    getConversation(input): OrbitAgentConversationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      if (readText(input.conversationId) !== liveConversationId) {
        return failure(
          "ORBIT_AGENT_CONVERSATION_NOT_FOUND",
          safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
        );
      }

      return success(
        statePayload({
          assistantMessage:
            "Orbit Agent is ready for a natural-language request.",
          safety: safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
          state: "success",
        }),
      );
    },

    listConversations(input = {}): OrbitAgentConversationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return success(
        statePayload({
          assistantMessage:
            "Orbit Agent is ready for a natural-language request.",
          safety: safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
          state: "success",
        }),
      );
    },

    async sendMessage(input: OrbitAgentSendMessageInput) {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const message = readText(input.message);

      if (!message) {
        return failure(
          "ORBIT_AGENT_MESSAGE_REQUIRED",
          safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
        );
      }

      if (isPrivacyControlRequest(message)) {
        return success(privacyControlPayload(message));
      }

      if (isUntrustedInstructionInjectionRequest(message)) {
        return success(untrustedContentBoundaryPayload(message));
      }

      if (isSecretDisclosureRequest(message)) {
        return success(secretBoundaryPayload(message));
      }

      if (isRelationshipStateMutationRequest(message)) {
        return success(stateChangeBoundaryPayload(message));
      }

      if (isAmbiguousRecipientDraftRequest(message)) {
        return success(clarificationBoundaryPayload(message));
      }

      const plannerResult = await planner.plan({
        locale: input.locale,
        message,
      });

      if (plannerResult.success === false) {
        return failureForPlannerResult(plannerResult);
      }

      const fallbackToolName = toolNameForIntent(plannerResult.data.intent);
      const toolRequests =
        plannerResult.data.toolRequests.length > 0
          ? plannerResult.data.toolRequests
          : fallbackToolName
            ? [
                {
                  arguments: {},
                  requiresUserConfirmation: true as const,
                  toolName: fallbackToolName,
                },
              ]
            : [];
      const shouldExecuteDomainTools = maxLoopSteps >= 2;
      const artifacts = shouldExecuteDomainTools
        ? toolRequests
            .map((request) => artifactForRequest({ message, request }))
            .filter((artifact): artifact is OrbitAgentArtifactPayload =>
              Boolean(artifact),
            )
        : [];
      const shouldSynthesizeAfterTools =
        maxLoopSteps >= 3 && artifacts.length > 0;
      const synthesisResult = shouldSynthesizeAfterTools
        ? await planner.synthesize({
            artifacts: artifacts.map(artifactSummaryForSynthesis),
            assistantMessage: plannerResult.data.assistantMessage,
            intent: plannerResult.data.intent,
            locale: input.locale,
            message,
            toolRequests,
          })
        : null;
      const finalAssistantMessage =
        synthesisResult?.success === true
          ? synthesisResult.data.assistantMessage
          : plannerResult.data.assistantMessage;
      const messages = [
        userMessage(message),
        assistantMessage(finalAssistantMessage),
      ];
      const safety = safetyLedger({
        aiProviderRequested: true,
        domainToolCallsExecuted: artifacts.length > 0,
        externalNetworkRequested: true,
      });
      const nextAction =
        maxLoopSteps === 1 && toolRequests.length > 0
          ? "Loop stopped after planner by ORBIT_AGENT_MAX_LOOP_STEPS; review proposed tool intents before executing any domain tool."
          : artifacts.length > 0 && !shouldSynthesizeAfterTools
            ? "Review the generated artifact; synthesis is skipped by ORBIT_AGENT_MAX_LOOP_STEPS."
            : "Review the model-planned Orbit result; confirm before any external action or record write.";

      return success({
        activeConversationId: liveConversationId,
        artifacts,
        assistantMessage: finalAssistantMessage,
        conversations: [conversationSummary(messages[messages.length - 1])],
        messages,
        nextAction,
        proposedToolIntents: toolRequests.map(proposedIntentForTool),
        provenance: provenance({
          generationMethod: "model-provider-live-agent-reply",
          label: `Orbit Agent live reply via ${plannerResult.data.provider}:${plannerResult.data.model}`,
          safety,
          source: plannerResult.data.source,
        }),
        state: "success",
      });
    },
  };
}
