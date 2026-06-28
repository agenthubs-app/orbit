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

function isSensitiveContactShareRequest(message: string): boolean {
  const sensitiveContactField =
    /(?:联系方式|聯絡方式|联系人资料|聯絡人資料|电话号码|電話號碼|手机号|手機號|邮箱|郵箱|微信|地址|contact info|contact details|phone number|phone|email|address|wechat)/i;
  const directedShare =
    /(?:把|将|將).*(?:发给|發給|发送给|發送給|转发给|轉發給|分享给|分享給|提供给|提供給|send to|forward to|share with|give to)|(?:send|forward|share|give).*(?:to|with)/i;

  return sensitiveContactField.test(message) && directedShare.test(message);
}

function isExternalPermissionRequest(message: string): boolean {
  const accessVerb =
    /(?:连接|接入|授权|读取|同步|导入|匯入|访问|開啟|开启|connect|authorize|read|sync|import|access)/i;
  const externalSource =
    /(?:Gmail|Google Contacts|Google Calendar|Google|Outlook|Microsoft Graph|邮箱|郵箱|邮件|郵件|日历|日曆|日程|通讯录|通訊錄|address book|calendar|email)/i;
  const analysisFromSource =
    /(?:分析|整理|review|analy[sz]e).*(?:Gmail|Google|Outlook|邮箱|郵箱|邮件|郵件|日历|日曆|日程|通讯录|通訊錄|calendar|email)/i;

  return (
    (accessVerb.test(message) && externalSource.test(message)) ||
    analysisFromSource.test(message)
  );
}

function isUnsupportedRealtimeLookupRequest(message: string): boolean {
  const realtimeQualifier =
    /(?:今天|现在|現在|当前|目前|刚刚|最新|实时|即時|latest|today|current|now|right now|real[ -]?time)/i;
  const realtimeObject =
    /(?:新闻|新聞|消息|股价|股票|行情|币价|天气|天氣|汇率|匯率|价格|价格走势|OpenAI|news|stock|share price|market price|crypto|weather|exchange rate|price)/i;
  const lookupVerb =
    /(?:查一下|查询|查找|搜索|搜一下|看看|告诉我|告訴我|look up|search|find|check|tell me)/i;

  return (
    realtimeQualifier.test(message) &&
    realtimeObject.test(message) &&
    (lookupVerb.test(message) || /(?:新闻|新聞|news|weather|天气|天氣)/i.test(message))
  );
}

function isProfessionalAdviceRequest(message: string): boolean {
  const adviceVerb =
    /(?:应该|應該|要不要|怎么处理|怎麼處理|怎么办|怎麼辦|吃什么药|吃什麼藥|用什么药|用什麼藥|诊断|診斷|起诉|诉讼|合同|避税|报税|买哪只|卖哪只|投资建议|should i|what should i|diagnose|prescribe|sue|lawsuit|contract|tax|invest|buy|sell)/i;
  const professionalDomain =
    /(?:胸口痛|胸痛|头痛|發燒|发烧|药|藥|医生|醫生|急诊|急診|医疗|醫療|法律|律师|律師|法院|起诉|诉讼|合同|税|稅|股票|基金|债券|債券|期权|期權|投资|投資|财务|財務|medical|doctor|medicine|legal|lawyer|court|tax|stock|fund|bond|option|financial|investment)/i;

  return adviceVerb.test(message) && professionalDomain.test(message);
}

function isCrisisSupportRequest(message: string): boolean {
  const firstPersonSelfHarm =
    /(?:我|自己|myself|my life).*(?:伤害自己|傷害自己|自杀|自殺|轻生|輕生|结束生命|結束生命|不想活|活不下去|hurt myself|kill myself|end my life|suicide)/i;
  const crisisWritingRequest =
    /(?:帮我|幫我|给我|給我|替我|write|draft).*(?:遗书|遺書|告别信|告別信|自杀信|自殺信|suicide note)/i;

  return firstPersonSelfHarm.test(message) || crisisWritingRequest.test(message);
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

function detectWorkflowSignals(message: string): string[] {
  const signals: string[] = [];
  const hasEventWork =
    /(?:活动|會議|会议|event|conference|meetup|opening line|明天.*认识谁|tomorrow'?s event)/i.test(
      message,
    );
  const hasContactRecommendation =
    /(?:谁认识|誰認識|谁可以介绍|誰可以介紹|介绍.*客户|介紹.*客戶|行业客户|行業客戶|network search|who knows|introduce|resource)/i.test(
      message,
    );
  const hasFollowupQueue =
    /(?:(?:本周|这周|這週|this week|逾期|overdue|dormant|队列|queue).*(?:跟进|跟進|follow[ -]?up)|(?:跟进|跟進|follow[ -]?up).*(?:队列|queue|本周|这周|這週|this week|逾期|overdue|dormant))/i.test(
      message,
    );
  const hasRelationshipLookup =
    /(?:为什么认识|為什麼認識|怎么认识|怎麼認識|how do i know|relationship status)/i.test(
      message,
    );
  const hasMessageDraft =
    /(?:写|草稿|消息|短信|微信|邮件|郵件|回复|回覆|改写|draft|message|reply|rewrite)/i.test(
      message,
    );

  if (hasEventWork) {
    signals.push("活动准备");
  }

  if (hasContactRecommendation) {
    signals.push("联系人推荐");
  }

  if (hasFollowupQueue) {
    signals.push("跟进队列");
  }

  if (hasRelationshipLookup) {
    signals.push("关系回顾");
  }

  if (hasMessageDraft) {
    signals.push("消息草稿");
  }

  return Array.from(new Set(signals));
}

function isMultiIntentWorkflowRequest(message: string): boolean {
  return detectWorkflowSignals(message).length > 1;
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

function sensitiveShareBoundaryPayload(
  message: string,
): OrbitAgentConversationPayload {
  const assistant =
    "这涉及联系人资料和隐私。Orbit 已停在本地边界：没有调用模型，没有发送联系方式，也不会转发给别人。请先确认当事人同意和共享范围；需要发送时，只能走可复核的权限和确认流程。";
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
      "Require explicit consent and a reviewable permission flow before sharing contact details.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local sensitive share boundary",
      safety,
      source: "local:orbit-agent-sensitive-share-boundary",
    }),
    state: "success",
  };
}

function permissionBoundaryPayload(message: string): OrbitAgentConversationPayload {
  const assistant =
    "这类请求需要先走权限授权。Orbit 现在没有连接 Gmail、日历或通讯录，也没有读取外部账号、调用模型或执行工具。请先在权限设置里完成授权；授权后再选择要分析的范围。";
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
      "Open staged permission review before connecting external accounts or reading email, calendar, or contacts data.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local permission boundary",
      safety,
      source: "local:orbit-agent-permission-boundary",
    }),
    state: "success",
  };
}

function unsupportedRealtimeBoundaryPayload(
  message: string,
): OrbitAgentConversationPayload {
  const assistant =
    "Orbit 现在没有实时新闻、行情、天气或汇率查询工具。这条请求已停在本地：没有调用模型，没有搜索网页，也不会编造最新结果。你可以贴出材料，我可以帮你整理成背景、问题或跟进草稿。";
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
      "Ask the user to provide source material before summarizing or turning it into relationship work.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local unsupported realtime boundary",
      safety,
      source: "local:orbit-agent-unsupported-realtime-boundary",
    }),
    state: "success",
  };
}

function professionalAdviceBoundaryPayload(
  message: string,
): OrbitAgentConversationPayload {
  const assistant =
    "这属于医疗、法律或财务等专业判断。Orbit 已停在本地边界：没有调用模型，也不会给诊断、用药、法律结论或投资指令。胸口痛这类情况请尽快联系医生；如果症状严重或突然出现，请直接联系急救或去急诊。";
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
      "Direct high-risk professional advice requests to qualified professionals before doing relationship-work drafting or organization.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local professional advice boundary",
      safety,
      source: "local:orbit-agent-professional-advice-boundary",
    }),
    state: "success",
  };
}

function crisisBoundaryPayload(message: string): OrbitAgentConversationPayload {
  const assistant =
    "听到你这样说，我先把这条请求停在本地安全边界：没有调用模型，也不会帮你写遗书或提供伤害自己的内容。请现在联系身边可信的人，或直接拨打当地急救电话；如果你在美国，可以拨打或短信 988。先别一个人待着。";
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
      "Keep crisis requests local, avoid harmful content, and direct the user to immediate human support.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local crisis boundary",
      safety,
      source: "local:orbit-agent-crisis-boundary",
    }),
    state: "success",
  };
}

function multiIntentBoundaryPayload(message: string): OrbitAgentConversationPayload {
  const workflowLabels = detectWorkflowSignals(message);
  const choices =
    workflowLabels.length > 0
      ? workflowLabels.join("、")
      : "其中一个关系工作方向";
  const assistant = `这句里同时有多个方向：${choices}。Orbit 一次只推进一个可复核的方向，所以先停在本地澄清：没有调用模型，也没有执行工具。请先选一个方向，我再继续。`;
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
      "Ask the user to choose one Orbit workflow before planning with the single-tool live agent contract.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: "Orbit Agent local multi-intent clarification boundary",
      safety,
      source: "local:orbit-agent-multi-intent-boundary",
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

      if (isSensitiveContactShareRequest(message)) {
        return success(sensitiveShareBoundaryPayload(message));
      }

      if (isSecretDisclosureRequest(message)) {
        return success(secretBoundaryPayload(message));
      }

      if (isExternalPermissionRequest(message)) {
        return success(permissionBoundaryPayload(message));
      }

      if (isUnsupportedRealtimeLookupRequest(message)) {
        return success(unsupportedRealtimeBoundaryPayload(message));
      }

      if (isCrisisSupportRequest(message)) {
        return success(crisisBoundaryPayload(message));
      }

      if (isProfessionalAdviceRequest(message)) {
        return success(professionalAdviceBoundaryPayload(message));
      }

      if (isRelationshipStateMutationRequest(message)) {
        return success(stateChangeBoundaryPayload(message));
      }

      if (isMultiIntentWorkflowRequest(message)) {
        return success(multiIntentBoundaryPayload(message));
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
