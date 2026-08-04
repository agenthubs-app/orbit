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
  type OrbitAgentConversationSummary,
  type OrbitAgentConversationHistoryTurn,
  type OrbitAgentRoutingDecision,
  type OrbitAgentRoutingIntent,
  type OrbitAgentRoutingToolFamily,
  type OrbitAgentConversationTimingSpan,
  type OrbitAgentProposedToolIntent,
  type OrbitAgentSafetyLedger,
  type OrbitAgentSendMessageInput,
} from "./conversation-contract";
import {
  createGeminiOrbitAgentPlanner,
  type GeminiOrbitAgentIntent,
  type GeminiOrbitAgentPlannerOutput,
  type GeminiOrbitAgentPlannerResult,
  type GeminiOrbitAgentProviderConfig,
  type GeminiOrbitAgentSynthesisResult,
  type GeminiOrbitAgentToolName,
  type GeminiOrbitAgentToolRequest,
  type GeminiOrbitAgentToolResultSummary,
  type OrbitAgentProviderSource,
} from "./gemini-provider";
import { createOrbitAgentLiveArtifactTaskService } from "./live-artifact-task-service";
import { classifyOutOfServiceScope } from "./service-scope-service";
import type { OrbitAgentArtifactTaskService } from "./service";
import { executeOrbitAgentTool } from "./agent-tools/registry";

export const liveCollectedAt = "2026-06-27T00:00:00.000Z";
export const liveConversationId = "live-orbit-agent-conversation";

const maxSupportedLoopSteps = 3;
const minSupportedLoopSteps = 1;

export type OrbitAgentLocale = "en" | "zh";

export interface LiveOrbitAgentRuntimeConfig
  extends GeminiOrbitAgentProviderConfig {
  artifactTaskService?: OrbitAgentArtifactTaskService;
  defaultMaxLoopSteps?: number;
  maxLoopSteps?: number | string | null;
}

export interface LiveOrbitAgentRuntime {
  artifactTaskService: OrbitAgentArtifactTaskService;
  maxLoopSteps: number;
  planner: ReturnType<typeof createGeminiOrbitAgentPlanner>;
}

export type LiveOrbitAgentRuntimeResult =
  | {
      failureResult: OrbitAgentConversationFailure;
      state: "message_required";
    }
  | {
      boundaryPayload: OrbitAgentConversationPayload;
      locale: OrbitAgentLocale;
      message: string;
      state: "local_boundary";
      timings: readonly OrbitAgentConversationTimingSpan[];
    }
  | {
      failureResult: OrbitAgentConversationFailure;
      locale: OrbitAgentLocale;
      message: string;
      plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: false }>;
      state: "planner_failure";
      timings: readonly OrbitAgentConversationTimingSpan[];
    }
  | {
      artifacts: readonly OrbitAgentArtifactPayload[];
      conversation: OrbitAgentConversationPayload;
      finalAssistantMessage: string;
      locale: OrbitAgentLocale;
      message: string;
      plan: GeminiOrbitAgentPlannerOutput;
      plannerResult?: Extract<GeminiOrbitAgentPlannerResult, { success: true }>;
      plannerSkippedByGuardrail: boolean;
      shouldExecuteDomainTools: boolean;
      shouldSynthesizeAfterTools: boolean;
      state: "completed";
      synthesisResult: GeminiOrbitAgentSynthesisResult | null;
      timings: readonly OrbitAgentConversationTimingSpan[];
      toolRequests: readonly GeminiOrbitAgentToolRequest[];
    };

const supportedScenarios = new Set<OrbitAgentConversationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

export function safetyLedger(input: {
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

export function provenance(input: {
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

export function normalizeScenario(
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

export function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeLocale(locale: unknown): OrbitAgentLocale {
  return locale === "zh" ? "zh" : "en";
}

export function localize(
  locale: OrbitAgentLocale,
  copy: Record<OrbitAgentLocale, string>,
) {
  return copy[locale];
}

function nowMs(): number {
  return performance.now();
}

function timingSpan(
  phase: string,
  startedAt: number,
  skipped = false,
): OrbitAgentConversationTimingSpan {
  return {
    durationMs: Math.max(0, Number((nowMs() - startedAt).toFixed(3))),
    phase,
    ...(skipped ? { skipped: true } : {}),
  };
}

export function readMaxLoopSteps(value: unknown, defaultMaxLoopSteps: number): number {
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

export function failure(
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

export function success(
  payload: OrbitAgentConversationPayload,
): OrbitAgentConversationResult {
  return {
    data: payload,
    success: true,
  };
}

export function conversationSummary(
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

export function statePayload(input: {
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

export function scenarioResult(
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
  const internalOrbitSchedule =
    /(?:Orbit|应用内|應用內|内部|內部).{0,12}(?:日程|日历|日曆|schedule)/i.test(
      message,
    ) &&
    !/(?:Google|Outlook|Microsoft|谷歌|微软|微軟|Gmail)/i.test(message);
  if (internalOrbitSchedule) return false;

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
  const requestedMessage = requestedActionText(message);
  const adviceVerb =
    /(?:应该|應該|要不要|怎么处理|怎麼處理|怎么办|怎麼辦|吃什么药|吃什麼藥|用什么药|用什麼藥|诊断|診斷|起诉|诉讼|合同|避税|报税|买哪只|卖哪只|投资建议|should i|what should i|diagnose|prescribe|sue|lawsuit|contract|tax|\binvest\b|\bbuy\b|\bsell\b)/i;
  const professionalDomain =
    /(?:胸口痛|胸痛|头痛|發燒|发烧|药|藥|医生|醫生|急诊|急診|医疗|醫療|法律|律师|律師|法院|起诉|诉讼|合同|税|稅|股票|基金|债券|債券|期权|期權|投资|投資|财务|財務|medical|doctor|medicine|legal|lawyer|court|tax|stock|fund|bond|option|financial|investment)/i;

  return (
    adviceVerb.test(requestedMessage) &&
    professionalDomain.test(requestedMessage)
  );
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
    /(?:更新|修改|改成|改为|保存|記住|记住|添加|新增|新建|创建|建立|加入|加到|导入|匯入|提醒|通知|刪除|删除|移除|忘记|\b(?:update|change|save|remember|add|create|import|remind|notify|delete|remove|forget)\b)/i;
  const recordMutationVerb =
    /(?:(?:请|請|帮我|幫我|替我|为我|為我|需要|想要|我要).{0,8}记录|記錄(?:一下|下|这次|這次|本次|一条|一條|新的|到|在)|(?:please|can you|could you|i (?:want|need) to).{0,12}\brecord\b|\brecord\s+(?:this|the|a|my)\b)/i;
  const relationshipObject =
    /(?:联系人|关系|资料|資料|公司|职位|职务|标签|备注|画像|联系|联络|聯絡|跟进|跟進|contact|relationship|profile|company|title|tag|note|call|message|email|follow[ -]?up)/i;

  return (
    (mutationVerb.test(message) || recordMutationVerb.test(message)) &&
    relationshipObject.test(message)
  );
}

function isSupportedNaturalLanguageWriteRequest(message: string): boolean {
  const createTask =
    /(?:创建|建立|新增|新建|添加).{0,12}(?:跟进)?任务|(?:create|add).{0,16}(?:follow[ -]?up )?task/i;
  const createReminder =
    /(?:提醒我|设置提醒|新增提醒|创建提醒)|(?:remind me|create.{0,12}reminder)/i;
  const saveDraft =
    /(?:保存|存为|留作).{0,12}(?:消息|邮件|跟进)?草稿|save.{0,16}(?:message |email )?draft/i;
  const saveMemory =
    /(?:请)?记住|(?:please )?remember/i;
  const syncCalendar =
    /(?:同步|创建|新建|添加).{0,20}(?:Google|Microsoft|谷歌|微软).{0,12}(?:日历|Calendar)|(?:create|add).{0,24}(?:Google|Microsoft).{0,12}calendar/i;

  return (
    createTask.test(message) ||
    createReminder.test(message) ||
    saveDraft.test(message) ||
    saveMemory.test(message) ||
    syncCalendar.test(message)
  );
}

function requestedActionText(message: string): string {
  // Safety boundaries must distinguish requested actions from actions the user
  // explicitly prohibits. Keep privacy/secret/permission checks on the complete
  // message, but remove negated action clauses before workflow and mutation
  // classification so “不要发送消息或创建日程” cannot become a write request.
  return message.replace(
    /(?:^|[，。！？；,\n.!?;]\s*)(?:(?:请|請)?(?:不要|别|別|勿|无需|無需|不需要)|do not|don't|don’t)\s*[^，。！？；,\n.!?;]*(?=$|[，。！？；,\n.!?;])/gi,
    " ",
  );
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

  if (hasEventWork) signals.push("活动准备");
  if (hasContactRecommendation) signals.push("联系人推荐");
  if (hasFollowupQueue) signals.push("跟进队列");
  if (hasRelationshipLookup) signals.push("关系回顾");
  if (hasMessageDraft) signals.push("消息草稿");

  return Array.from(new Set(signals));
}

function isMultiIntentWorkflowRequest(message: string): boolean {
  return detectWorkflowSignals(message).length > 1;
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

function historyMessages(
  history: readonly OrbitAgentConversationHistoryTurn[] | undefined,
): OrbitAgentConversationMessage[] {
  return (history ?? []).slice(-6).map((turn, index) => ({
    content: turn.content,
    conversationId: liveConversationId,
    createdAt: "2026-06-27T00:00:30.000Z",
    evidenceIds: ["evidence:orbit-agent:conversation-history"],
    messageId: `orbit-agent-live-history-${index + 1}`,
    role: turn.role,
  }));
}

function localBoundaryPayload(input: {
  assistant: string;
  history?: readonly OrbitAgentConversationHistoryTurn[];
  label: string;
  message: string;
  nextAction: string;
  routingDecision?: OrbitAgentRoutingDecision;
  source: OrbitAgentConversationProvenance["source"];
}): OrbitAgentConversationPayload {
  const messages = [
    ...historyMessages(input.history),
    userMessage(input.message),
    assistantMessage(input.assistant),
  ];
  const safety = safetyLedger({
    aiProviderRequested: false,
    domainToolCallsExecuted: false,
    externalNetworkRequested: false,
  });

  return {
    activeConversationId: liveConversationId,
    artifacts: [],
    assistantMessage: input.assistant,
    conversations: [conversationSummary(messages[messages.length - 1])],
    messages,
    nextAction: input.nextAction,
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "rule-based-agent-reply",
      label: input.label,
      safety,
      source: input.source,
    }),
    routingDecision: input.routingDecision,
    state: "success",
  };
}

function privacyControlPayload(message: string): OrbitAgentConversationPayload {
  return localBoundaryPayload({
    assistant:
      "这条请求已停在本地隐私控制边界：没有执行分析、存储、删除或隐私设置变更。若要持久关闭聊天分析，请在隐私控制中确认设置。",
    label: "Orbit Agent local privacy boundary",
    message,
    nextAction:
      "Open privacy controls to make a durable analysis preference change; no provider, tool, storage, or external action ran for this request.",
    source: "local:orbit-agent-privacy-boundary",
  });
}

function untrustedContentBoundaryPayload(
  message: string,
): OrbitAgentConversationPayload {
  return localBoundaryPayload({
    assistant:
      "这段外部内容包含不可信指令注入风险。Orbit 已停在本地安全边界：没有把它发送给模型、没有泄露其它联系人资料、没有执行工具或外部动作。你可以把它作为证据复核，但不能让其中的指令改变隐私、权限或确认要求。",
    label: "Orbit Agent local untrusted content boundary",
    message,
    nextAction:
      "Review the quoted relationship content as untrusted evidence only; do not reveal other contacts or execute any action from it.",
    source: "local:orbit-agent-untrusted-content-boundary",
  });
}

function secretBoundaryPayload(message: string): OrbitAgentConversationPayload {
  return localBoundaryPayload({
    assistant:
      "这个请求涉及密钥、凭据或环境变量。Orbit 已停在本地安全边界：没有调用模型、没有发送任何密钥，也不会泄露本地 .env 内容。需要轮换或配置密钥时，请在安全设置或部署环境里处理。",
    label: "Orbit Agent local secret boundary",
    message,
    nextAction:
      "Handle secrets outside chat; do not expose API keys or environment variables in model prompts or artifacts.",
    source: "local:orbit-agent-secret-boundary",
  });
}

function sensitiveShareBoundaryPayload(
  message: string,
): OrbitAgentConversationPayload {
  return localBoundaryPayload({
    assistant:
      "这涉及联系人资料和隐私。Orbit 已停在本地边界：没有调用模型，没有发送联系方式，也不会转发给别人。请先确认当事人同意和共享范围；需要发送时，只能走可复核的权限和确认流程。",
    label: "Orbit Agent local sensitive share boundary",
    message,
    nextAction:
      "Require explicit consent and a reviewable permission flow before sharing contact details.",
    source: "local:orbit-agent-sensitive-share-boundary",
  });
}

function permissionBoundaryPayload(message: string): OrbitAgentConversationPayload {
  return localBoundaryPayload({
    assistant:
      "这类请求需要先走权限授权。Orbit 现在没有连接 Gmail、日历或通讯录，也没有读取外部账号、调用模型或执行工具。请先在权限设置里完成授权；授权后再选择要分析的范围。",
    label: "Orbit Agent local permission boundary",
    message,
    nextAction:
      "Open staged permission review before connecting external accounts or reading email, calendar, or contacts data.",
    source: "local:orbit-agent-permission-boundary",
  });
}

function unsupportedRealtimeBoundaryPayload(
  message: string,
): OrbitAgentConversationPayload {
  return localBoundaryPayload({
    assistant:
      "Orbit 现在没有实时新闻、行情、天气或汇率查询工具。这条请求已停在本地：没有调用模型，没有搜索网页，也不会编造最新结果。你可以贴出材料，我可以帮你整理成背景、问题或跟进草稿。",
    label: "Orbit Agent local unsupported realtime boundary",
    message,
    nextAction:
      "Ask the user to provide source material before summarizing or turning it into relationship work.",
    source: "local:orbit-agent-unsupported-realtime-boundary",
  });
}

function professionalAdviceBoundaryPayload(
  message: string,
): OrbitAgentConversationPayload {
  const medical =
    /(?:胸口痛|胸痛|头痛|發燒|发烧|药|藥|医生|醫生|急诊|急診|医疗|醫療|medical|doctor|medicine|diagnose|prescribe)/i.test(
      message,
    );
  const urgentMedical =
    /(?:胸口痛|胸痛|呼吸困难|呼吸困難|昏厥|失去意识|失去意識|chest pain|difficulty breathing|faint|unconscious)/i.test(
      message,
    );
  const legal =
    /(?:法律|律师|律師|法院|起诉|诉讼|合同|legal|lawyer|court|sue|lawsuit|contract)/i.test(
      message,
    );
  const assistant = medical
    ? urgentMedical
      ? "这涉及可能需要紧急处理的健康问题。Orbit 已停在本地边界：没有调用模型，也不会给诊断、用药或剂量建议。请尽快联系当地急救服务或前往急诊，并联系可信任的人陪同。"
      : "这涉及医疗判断。Orbit 已停在本地边界：没有调用模型，也不会给诊断或用药建议。请联系合格的医疗专业人士；我可以在你提供可靠材料后帮你整理问题清单。"
    : legal
      ? "这涉及法律判断。Orbit 已停在本地边界：没有调用模型，也不会替代律师给出法律结论或起草应直接依赖的法律意见。请咨询合格律师；我可以帮你整理事实、时间线和待确认问题。"
      : "这涉及具体的投资或财务决策。Orbit 已停在本地边界：没有调用模型，也不会给买卖、税务或个性化投资指令。请咨询合格的财务或税务专业人士；我可以帮你整理公开材料和待确认问题。";

  return localBoundaryPayload({
    assistant,
    label: "Orbit Agent local professional advice boundary",
    message,
    nextAction:
      "Direct high-risk professional advice requests to qualified professionals before doing relationship-work drafting or organization.",
    source: "local:orbit-agent-professional-advice-boundary",
  });
}

function crisisBoundaryPayload(message: string): OrbitAgentConversationPayload {
  return localBoundaryPayload({
    assistant:
      "听到你这样说，我先把这条请求停在本地安全边界：没有调用模型，也不会帮你写遗书或提供伤害自己的内容。请现在联系身边可信的人，或直接拨打当地急救电话；如果你在美国，可以拨打或短信 988。先别一个人待着。",
    label: "Orbit Agent local crisis boundary",
    message,
    nextAction:
      "Keep crisis requests local, avoid harmful content, and direct the user to immediate human support.",
    source: "local:orbit-agent-crisis-boundary",
  });
}

function multiIntentBoundaryPayload(message: string): OrbitAgentConversationPayload {
  const workflowLabels = detectWorkflowSignals(message);
  const choices =
    workflowLabels.length > 0
      ? workflowLabels.join("、")
      : "其中一个关系工作方向";

  return localBoundaryPayload({
    assistant: `这句里同时有多个方向：${choices}。Orbit 一次只推进一个可复核的方向，所以先停在本地澄清：没有调用模型，也没有执行工具。请先选一个方向，我再继续。`,
    label: "Orbit Agent local multi-intent clarification boundary",
    message,
    nextAction:
      "Ask the user to choose one Orbit workflow before planning with the single-tool live agent contract.",
    source: "local:orbit-agent-multi-intent-boundary",
  });
}

function clarificationBoundaryPayload(message: string): OrbitAgentConversationPayload {
  return localBoundaryPayload({
    assistant:
      "需要先明确联系人对象。我不会假定“她”是谁，也没有调用模型、执行工具或生成草稿。请告诉我联系人姓名或选择一位联系人后，我再准备可复核的消息草稿。",
    label: "Orbit Agent local clarification boundary",
    message,
    nextAction:
      "Ask the user to identify the recipient before drafting relationship outreach.",
    source: "local:orbit-agent-clarification-boundary",
  });
}

function stateChangeBoundaryPayload(message: string): OrbitAgentConversationPayload {
  return localBoundaryPayload({
    assistant:
      "联系人资料变更、任务或提醒都要先确认。Orbit 已停在本地确认边界：没有调用模型，没有写入或添加联系人资料，没有创建任务或提醒，也没有删除记录、投递通知或执行外部动作。请先打开对应详情复核。",
    label: "Orbit Agent local state-change confirmation boundary",
    message,
    nextAction:
      "Open the contact detail confirmation flow before saving or deleting relationship state.",
    source: "local:orbit-agent-state-change-boundary",
  });
}

type ChatPageCapability =
  | "archive_contacts"
  | "create_intro_request"
  | "event_matchmaking"
  | "pre_event_brief"
  | "respond_intro_request"
  | "save_event_brief"
  | "save_event_goal"
  | "save_meeting_note"
  | "schedule_event"
  | "select_meeting_slots";

function chatPageCapability(message: string): ChatPageCapability | null {
  if (
    /(?:提出|建议|建議|选择|選擇|安排|propose|select|schedule).{0,18}(?:会面时间|會面時間|时间段|時段|meeting slots?)/i.test(
      message,
    )
  ) {
    return "select_meeting_slots";
  }
  if (
    /(?:活动撮合|活動撮合|人脉撮合|人脈撮合|活动撮合工作流|活動撮合工作流|event matchmaking|event_matchmaking_v1)/i.test(
      message,
    )
  ) {
    return "event_matchmaking";
  }
  if (
    /(?:创建|建立|发起|发送|發送|create|send).{0,36}(?:引荐请求|引薦請求|介绍请求|介紹請求|introduction request)/i.test(
      message,
    )
  ) {
    return "create_intro_request";
  }
  if (
    /(?:接受|同意|拒绝|拒絕|回复|回覆|respond to|accept|decline).{0,18}(?:引荐|引薦|介绍请求|介紹請求|introduction request)/i.test(
      message,
    )
  ) {
    return "respond_intro_request";
  }
  if (
    /(?:归档|歸檔|archive).{0,18}(?:联系人|聯絡人|contact)/i.test(message) ||
    /(?:联系人|聯絡人|contact).{0,18}(?:归档|歸檔|archive)/i.test(message)
  ) {
    return "archive_contacts";
  }
  if (
    /(?:保存|记录|記錄|save|record).{0,18}(?:会面笔记|會面筆記|会面记录|會面記錄|会议记录|會議記錄|meeting note)/i.test(
      message,
    ) ||
    /(?:会面笔记|會面筆記|会面记录|會面記錄|会议记录|會議記錄|meeting note).{0,18}(?:保存|记录|記錄|save|record)/i.test(
      message,
    )
  ) {
    return "save_meeting_note";
  }
  if (
    /(?:保存|生成|建立|启动|啟動|save|generate|start).{0,48}(?:会前简报|會前簡報|会前准备|會前準備|活动简报|活動簡報|pre-event brief)/i.test(
      message,
    ) ||
    /pre_event_brief_v1/i.test(message)
  ) {
    return /(?:保存|save)/i.test(message)
      ? "save_event_brief"
      : "pre_event_brief";
  }
  if (
    /(?:保存|设置|設定|save|set).{0,18}(?:活动目标|活動目標|event goal)/i.test(
      message,
    )
  ) {
    return "save_event_goal";
  }
  if (
    /(?:加入|添加|加到|add).{0,18}(?:Orbit|应用内|應用內).{0,12}(?:日程|schedule)/i.test(
      message,
    )
  ) {
    return "schedule_event";
  }

  return null;
}

function chatPageCapabilityBoundaryPayload(
  message: string,
  capability: ChatPageCapability,
): OrbitAgentConversationPayload {
  const copy: Record<
    ChatPageCapability,
    { assistant: string; nextAction: string }
  > = {
    archive_contacts: {
      assistant:
        "归档会改变联系人状态，当前 Agent 聊天不能安全解析并确认联系人 ID，因此没有把它伪装成任务，也没有写入。请打开该联系人详情，在可见的归档确认流程中操作。",
      nextAction: "Open the verified contact detail and use its archive confirmation flow.",
    },
    create_intro_request: {
      assistant:
        "引荐请求必须绑定真实活动参与者并保留双方同意。当前 Agent 聊天不能在缺少参与者身份校验时创建请求，因此没有发送、没有披露联系方式。请在活动的撮合页选择双方后确认。",
      nextAction: "Open the event matchmaking surface, verify both participants, then review the introduction request.",
    },
    event_matchmaking: {
      assistant:
        "LEGACY_MATCHMAKING_READ_ONLY：旧活动撮合工作流及其排序结果已彻底退役。Orbit 没有调用旧 workflow、没有重新排名、没有用普通推荐替代，也没有创建引荐请求。请在活动详情查看已发布的活动运营推荐，并逐人发起名片申请。",
      nextAction: "Open the selected event's published operations recommendations and send an individual contact request there.",
    },
    pre_event_brief: {
      assistant:
        "会前简报必须绑定一个真实活动及其报名人。当前 Agent 聊天尚未接入完整活动参与者上下文，因此没有生成无依据简报或保存操作。请打开对应活动详情，在“会前准备”中生成并复核。",
      nextAction: "Open the verified event detail and run the pre-event brief workflow.",
    },
    respond_intro_request: {
      assistant:
        "接受或拒绝引荐会改变双方同意状态。当前 Agent 聊天不接受脱离请求记录的文字确认，因此没有更改状态。请打开“人脉 > 引荐”，进入具体请求后操作。",
      nextAction: "Open the exact introduction request and respond from its consent-aware detail.",
    },
    save_event_brief: {
      assistant:
        "保存会前简报必须绑定真实活动和可复核内容。当前 Agent 聊天没有可靠的活动 ID 解析，因此没有保存，也没有改写成其它动作。请在活动详情的会前准备中生成并确认保存。",
      nextAction: "Open the verified event detail and review the pre-event brief before saving.",
    },
    save_event_goal: {
      assistant:
        "活动目标必须写入明确的活动记录。当前 Agent 聊天不能仅凭名称安全确定活动 ID，因此没有保存，也没有把它误当成 Agent 记忆。请打开对应活动详情后确认目标。",
      nextAction: "Open the verified event detail and save the goal from its confirmation control.",
    },
    save_meeting_note: {
      assistant:
        "单独保存会面笔记需要明确活动、联系人和已确认内容。当前请求没有进入可校验的会后工作流，因此没有保存，也没有写入 Agent 记忆。请使用“会后跟进”，并提供“联系人：…；活动：…；会面内容：…”。",
      nextAction: "Provide verified contact, event, and meeting-note fields to the post-event follow-up workflow.",
    },
    schedule_event: {
      assistant:
        "这是 Orbit 应用内日程，不需要外部日历权限。但写入前仍必须绑定真实活动 ID；当前 Agent 聊天无法只凭名称安全确定记录，所以没有添加。请在活动详情点击“加入 Orbit 日程”并确认。",
      nextAction: "Open the verified event detail and confirm Add to Orbit Schedule.",
    },
    select_meeting_slots: {
      assistant:
        "会面时间只能在双方已同意引荐后提出。当前 Agent 聊天没有读取具体引荐请求及双方同意状态，因此不会编造可用时间，也没有创建预约。请打开“人脉 > 引荐”的具体记录后选择时间。",
      nextAction: "Open the accepted introduction request and propose slots from its consent-aware detail.",
    },
  };
  const selected = copy[capability];

  return localBoundaryPayload({
    assistant: selected.assistant,
    label: "Orbit Agent verified page-capability boundary",
    message,
    nextAction: selected.nextAction,
    source: "local:orbit-agent-state-change-boundary",
  });
}

export function createLiveOrbitAgentLocalBoundaryPayload(
  message: string,
): OrbitAgentConversationPayload | null {
  if (isPrivacyControlRequest(message)) return privacyControlPayload(message);
  if (isUntrustedInstructionInjectionRequest(message)) {
    return untrustedContentBoundaryPayload(message);
  }
  if (isSensitiveContactShareRequest(message)) {
    return sensitiveShareBoundaryPayload(message);
  }
  if (isSecretDisclosureRequest(message)) return secretBoundaryPayload(message);
  if (isExternalPermissionRequest(message)) return permissionBoundaryPayload(message);
  if (isUnsupportedRealtimeLookupRequest(message)) {
    return unsupportedRealtimeBoundaryPayload(message);
  }
  if (isCrisisSupportRequest(message)) return crisisBoundaryPayload(message);
  if (isProfessionalAdviceRequest(message)) {
    return professionalAdviceBoundaryPayload(message);
  }
  const actionRequest = requestedActionText(message);
  const pageCapability = chatPageCapability(actionRequest);
  if (pageCapability) {
    return chatPageCapabilityBoundaryPayload(message, pageCapability);
  }

  if (
    isRelationshipStateMutationRequest(actionRequest) &&
    !isSupportedNaturalLanguageWriteRequest(actionRequest)
  ) {
    return stateChangeBoundaryPayload(message);
  }
  if (isMultiIntentWorkflowRequest(actionRequest)) {
    return multiIntentBoundaryPayload(message);
  }
  if (isAmbiguousRecipientDraftRequest(actionRequest)) {
    return clarificationBoundaryPayload(message);
  }

  return null;
}

// 意图路由现在完全由模型 planner 决定。这个 mapper 只负责把模型 intent
// 翻译成既有的展示契约（routing decision），让前端“是否需要工具”、no-tool 气泡
// 标记和 dev trace 继续工作。它不做任何路由判断，只是模型意图的呈现层。
export function routingDecisionFromPlannerIntent(
  intent: GeminiOrbitAgentIntent,
): OrbitAgentRoutingDecision {
  const mapping: Record<
    GeminiOrbitAgentIntent,
    {
      intent: OrbitAgentRoutingIntent;
      toolFamily: OrbitAgentRoutingToolFamily | null;
    }
  > = {
    contact_recommendations: {
      intent: "contact_discovery",
      toolFamily: "contacts",
    },
    event_recommendations: {
      intent: "event_discovery",
      toolFamily: "events",
    },
    followup_queue: {
      intent: "followup_context",
      toolFamily: "followups",
    },
    action_proposal: {
      intent: "action_proposal",
      toolFamily: null,
    },
    general_chat: {
      intent: "general_conversation",
      toolFamily: null,
    },
    relationship_chat_context: {
      intent: "followup_context",
      toolFamily: "followups",
    },
  };
  const mapped = mapping[intent];
  const needsTool =
    intent !== "general_chat" && intent !== "action_proposal";

  return {
    confidence: 0.86,
    detectedToolFamilies: mapped.toolFamily ? [mapped.toolFamily] : [],
    intent: mapped.intent,
    needsTool,
    reason: needsTool
      ? "The configured model provider classified this as Orbit relationship work and selected the matching reviewable capability."
      : intent === "action_proposal"
        ? "The configured model provider proposed a schema-validated action that remains blocked until user confirmation."
        : "The configured model provider classified this as ordinary conversation, so no Orbit tool is proposed.",
    safety: {
      externalSideEffectsAllowed: false,
      toolCallsExecuted: false,
    },
    toolFamily: mapped.toolFamily,
  };
}

export function toolNameForIntent(
  intent: GeminiOrbitAgentIntent,
): GeminiOrbitAgentToolName | null {
  if (intent === "event_recommendations") return "events.recommend";
  if (intent === "contact_recommendations") return "contacts.recommend";
  if (intent === "followup_queue") return "followups.reviewQueue";
  if (intent === "relationship_chat_context") return "chat.context";

  return null;
}

export function artifactKindForTool(
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

export function toolFamilyForToolName(toolName: string): string {
  if (toolName === "chat.context") return "relationship_chat";
  if (toolName.startsWith("events.")) return "events";
  if (toolName.startsWith("contacts.")) return "contacts";
  if (toolName.startsWith("followups.")) return "followups";

  return "orbit";
}

export function proposedIntentForTool(
  request: GeminiOrbitAgentToolRequest,
  locale: OrbitAgentLocale = "en",
  source: "guardrail" | "planner" = "planner",
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

  return {
    intentId: `intent:gemini:${request.toolName}`,
    label: localize(locale, labels[request.toolName]),
    reason:
      source === "guardrail"
        ? localize(locale, {
            en: "Orbit's deterministic service-scope guardrail selected this allowed tool without calling the planner; execution stays inside Orbit and any side effect still requires confirmation.",
            zh: "Orbit 的确定性服务范围 guardrail 未调用 planner，直接选择了这个允许工具；执行仍停留在 Orbit 内部，任何副作用前都需要确认。",
          })
        : localize(locale, {
            en: "The configured model provider selected this allowed Orbit tool from the user prompt; execution remains inside Orbit and requires confirmation before side effects.",
            zh: "模型 provider 从用户请求中选择了这个 Orbit 允许工具；执行仍停留在 Orbit 内部，任何副作用前都需要确认。",
          }),
    requiresUserConfirmation: true,
    toolFamily: toolFamilyForToolName(request.toolName) as
      OrbitAgentProposedToolIntent["toolFamily"],
  };
}

export async function artifactForRequest(input: {
  artifactTaskService: OrbitAgentArtifactTaskService;
  history?: readonly OrbitAgentConversationHistoryTurn[];
  locale?: string | null;
  message: string;
  request: GeminiOrbitAgentToolRequest;
}): Promise<OrbitAgentArtifactPayload | null> {
  const locale = normalizeLocale(input.locale);
  const rawArguments =
    typeof input.request.arguments === "object" &&
    input.request.arguments !== null &&
    !Array.isArray(input.request.arguments)
      ? input.request.arguments
      : {};

  try {
    const executed = await executeOrbitAgentTool({
      toolName: input.request.toolName,
      arguments: { query: input.message, ...rawArguments },
      context: {
        mode: "live",
        async executeArtifactTool(toolName, validatedInput) {
          const request: OrbitAgentArtifactTaskRequest = {
            conversationId: liveConversationId,
            contextMessages: [
              ...(input.history ?? []).map((turn) => ({
                content: turn.content,
                role: turn.role,
              })),
              {
                content: input.message,
                role: "user" as const,
              },
            ],
            kind: artifactKindForTool(toolName),
            locale,
            presentation: {
              preferredSurface: "side_panel",
              widthHint: "half",
            },
            query: validatedInput.query,
            toolArguments: {
              query: validatedInput.query,
              locale: validatedInput.locale,
              searchTerms: validatedInput.searchTerms,
              domains: validatedInput.domains,
              limit: validatedInput.limit,
            },
          };
          const result =
            await input.artifactTaskService.createArtifactTask(request);
          if (result.success === false) {
            throw new Error(result.error.message);
          }
          return result.data;
        },
      },
    });

    return executed.output;
  } catch {
    return null;
  }
}

export function artifactSummaryForSynthesis(
  artifact: OrbitAgentArtifactPayload,
): GeminiOrbitAgentToolResultSummary {
  // 把排名靠前的条目（姓名/职位等）一并交给 synthesis，让最终回复能具体说出
  // 推荐了谁、为什么，而不是只报一个数量。
  const topItems = (artifact.result.generatedView?.sections ?? [])
    .flatMap((section) => section.items ?? [])
    .slice(0, 3)
    .map((item) => {
      const when = (item.metadata ?? []).find((entry) =>
        ["Start", "When", "开始", "时间"].includes(entry.label),
      )?.value;
      const body = item.body?.trim().slice(0, 140);

      return [item.title, item.subtitle, when, item.reason, body]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(" · ");
    })
    .filter(Boolean);
  const baseSummary =
    artifact.result.generatedView?.summary ??
    artifact.result.nextAction ??
    "Orbit prepared a reviewable artifact.";

  return {
    kind: artifact.task.kind,
    preferredSurface: artifact.result.presentation.preferredSurface,
    summary:
      topItems.length > 0
        ? `${baseSummary} Top matches: ${topItems.join(" | ")}`
        : baseSummary,
    title: artifact.result.presentation.title,
  };
}

function artifactEvidenceIdentity(
  artifact: OrbitAgentArtifactPayload,
): string {
  const itemIds = (artifact.result.generatedView?.sections ?? [])
    .flatMap((section) => section.items ?? [])
    .map((item) => item.id)
    .sort();

  return JSON.stringify({
    evidenceIds: [...artifact.result.provenance.evidenceIds].sort(),
    itemIds,
    kind: artifact.result.kind,
    source: artifact.result.provenance.source,
    sourceModules: [...artifact.result.provenance.sourceModules].sort(),
  });
}

function uniqueArtifactsByEvidence(
  artifacts: readonly OrbitAgentArtifactPayload[],
): OrbitAgentArtifactPayload[] {
  const seen = new Set<string>();

  return artifacts.filter((artifact) => {
    const identity = artifactEvidenceIdentity(artifact);
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

export function failureForPlannerResult(
  plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: false }>,
): OrbitAgentConversationFailure {
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

export function toolRequestsForPlannerResult(
  plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: true }>,
): readonly GeminiOrbitAgentToolRequest[] {
  const fallbackToolName = toolNameForIntent(plannerResult.data.intent);

  return plannerResult.data.toolRequests.length > 0
    ? plannerResult.data.toolRequests
    : fallbackToolName
      ? [
          {
            arguments: {},
            requiresUserConfirmation: true,
            toolName: fallbackToolName,
          },
        ]
      : [];
}

function toolRequestKey(request: GeminiOrbitAgentToolRequest): string {
  const argumentsJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(request.arguments).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
  return `${request.toolName}:${argumentsJson}`;
}

/**
 * 超纲问题的确定性路由覆盖。
 *
 * 服务范围的判定收在 classifyOutOfServiceScope（代码层、可单测），命中后这里
 * 直接指定用哪个工具、带哪些领域去检索，不再让 planner 自由裁量——planner 的
 * systemInstruction 里同语义的规则只作为漏判时的兜底。
 *
 * 注意只覆盖"用什么去检索"（deny 侧确定），"最终推荐谁"仍由检索层按相关度
 * 决定；回复里的拒答措辞由 synthesis 依据 plannerIntent 生成。
 */
export function toolRequestsForOutOfScopeMessage(
  message: string,
): readonly GeminiOrbitAgentToolRequest[] | null {
  const classification = classifyOutOfServiceScope(message);

  if (!classification) {
    return null;
  }

  return [
    {
      arguments: {
        domains: [...classification.domains],
        searchTerms: classification.searchTerms,
      },
      requiresUserConfirmation: true,
      toolName: "contacts.recommend",
    },
  ];
}

export function conversationForRuntimeSuccess(input: {
  aiProviderRequested: boolean;
  artifacts: readonly OrbitAgentArtifactPayload[];
  finalAssistantMessage: string;
  locale: OrbitAgentLocale;
  maxLoopSteps: number;
  message: string;
  plan: GeminiOrbitAgentPlannerOutput;
  plannerResult?: Extract<GeminiOrbitAgentPlannerResult, { success: true }>;
  routingDecision?: OrbitAgentRoutingDecision;
  shouldSynthesizeAfterTools: boolean;
  timings: readonly OrbitAgentConversationTimingSpan[];
  toolRequests: readonly GeminiOrbitAgentToolRequest[];
}): OrbitAgentConversationPayload {
  const messages = [
    userMessage(input.message),
    assistantMessage(input.finalAssistantMessage),
  ];
  const safety = safetyLedger({
    aiProviderRequested: input.aiProviderRequested,
    domainToolCallsExecuted: input.artifacts.length > 0,
    externalNetworkRequested: input.aiProviderRequested,
  });
  const nextAction =
    input.maxLoopSteps === 1 && input.toolRequests.length > 0
      ? localize(input.locale, {
          en: "Loop stopped after planner by ORBIT_AGENT_MAX_LOOP_STEPS; review proposed tool intents before executing any domain tool.",
          zh: "执行链已按 ORBIT_AGENT_MAX_LOOP_STEPS 停在 planner 后；执行任何领域工具前，请先复核计划工具意图。",
        })
      : input.artifacts.length > 0 && !input.shouldSynthesizeAfterTools
        ? localize(input.locale, {
            en: "Review the generated artifact; synthesis is skipped by ORBIT_AGENT_MAX_LOOP_STEPS.",
            zh: "请复核已生成的结果；当前按 ORBIT_AGENT_MAX_LOOP_STEPS 跳过综合回复。",
          })
        : localize(input.locale, {
            en: "Review the model-planned Orbit result; confirm before any external action or record write.",
            zh: "请复核模型规划的 Orbit 结果；任何外部动作或记录写入前都需要确认。",
          });

  return {
    activeConversationId: liveConversationId,
    artifacts: input.artifacts,
    assistantMessage: input.finalAssistantMessage,
    conversations: [conversationSummary(messages[messages.length - 1])],
    diagnostics: {
      maxLoopSteps: input.maxLoopSteps,
      model: input.plannerResult?.data.model,
      provider: input.plannerResult?.data.provider,
      timings: input.timings,
    },
    messages,
    nextAction,
    proposedActionRequests: input.plan.actionRequests,
    proposedToolIntents: input.toolRequests.map((request) =>
      proposedIntentForTool(
        request,
        input.locale,
        input.plannerResult ? "planner" : "guardrail",
      ),
    ),
    provenance: provenance({
      generationMethod: input.plannerResult
        ? "model-provider-live-agent-reply"
        : "rule-based-agent-reply",
      label: input.plannerResult
        ? `Orbit Agent live reply via ${input.plannerResult.data.provider}:${input.plannerResult.data.model}`
        : "Orbit Agent deterministic service-scope guardrail",
      safety,
      source:
        input.plannerResult?.data.source ?? "guardrail:service-scope-v1",
    }),
    routingDecision: input.routingDecision,
    state: "success",
  };
}

export function createLiveOrbitAgentRuntime(
  config: LiveOrbitAgentRuntimeConfig = {},
): LiveOrbitAgentRuntime {
  return {
    artifactTaskService:
      config.artifactTaskService ?? createOrbitAgentLiveArtifactTaskService(),
    maxLoopSteps: readMaxLoopSteps(
      config.maxLoopSteps ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
      config.defaultMaxLoopSteps ?? 2,
    ),
    planner: createGeminiOrbitAgentPlanner(config),
  };
}

export async function runLiveOrbitAgentRuntime(
  runtime: LiveOrbitAgentRuntime,
  input: OrbitAgentSendMessageInput,
): Promise<LiveOrbitAgentRuntimeResult> {
  const message = readText(input.message);

  if (!message) {
    return {
      failureResult: failure(
        "ORBIT_AGENT_MESSAGE_REQUIRED",
        safetyLedger({
          aiProviderRequested: false,
          externalNetworkRequested: false,
        }),
      ),
      state: "message_required",
    };
  }

  const timings: OrbitAgentConversationTimingSpan[] = [];
  const locale = normalizeLocale(input.locale);
  const localBoundaryStartedAt = nowMs();
  const boundaryPayload = createLiveOrbitAgentLocalBoundaryPayload(message);
  timings.push(timingSpan("local_boundary", localBoundaryStartedAt));

  if (boundaryPayload) {
    return {
      boundaryPayload,
      locale,
      message,
      state: "local_boundary",
      timings,
    };
  }

  // history 由调用方（页面/route）透传；planner、artifact 上下文和 synthesis
  // 共享同一份最近轮次，让追问（"有哪些朋友可以帮我进入呢?"）能接上前文目标。
  const historyTurns = (input.history ?? [])
    .filter((turn) => readText(turn.content))
    .slice(-8);
  const outOfScopeToolRequests = toolRequestsForOutOfScopeMessage(message);
  let plannerResult:
    | Extract<GeminiOrbitAgentPlannerResult, { success: true }>
    | undefined;
  let plan: GeminiOrbitAgentPlannerOutput;

  if (outOfScopeToolRequests) {
    const plannerStartedAt = nowMs();
    plan = {
      actionRequests: [],
      assistantMessage: localize(locale, {
        en: "This topic is outside Orbit's relationship-work scope, so I won't answer it directly. I can instead look through your network for people who may be able to help.",
        zh: "这个问题不属于 Orbit 的关系工作范围，我不会直接回答；可以改为从你的人脉中找可能帮得上忙的人。",
      }),
      intent: "contact_recommendations",
      toolRequests: outOfScopeToolRequests,
    };
    timings.push(timingSpan("planner", plannerStartedAt, true));
  } else {
    const plannerStartedAt = nowMs();
    const providerPlannerResult = await runtime.planner.plan({
      history: historyTurns,
      locale: input.locale,
      memory: input.memory,
      message,
      outcomes: input.outcomes,
    });
    timings.push(timingSpan("planner", plannerStartedAt));

    if (providerPlannerResult.success === false) {
      return {
        failureResult: failureForPlannerResult(providerPlannerResult),
        locale,
        message,
        plannerResult: providerPlannerResult,
        state: "planner_failure",
        timings,
      };
    }

    plannerResult = providerPlannerResult;
    plan = providerPlannerResult.data;
  }

  // 意图路由完全交给模型：general_chat 会自然带空 toolRequests 流经工具管线，
  // 得到模型自由回复；其它 intent 走既有工具/合成链路。服务范围 guardrail
  // 命中时 plan 由上方代码直接生成，planner 完全不被调用。
  const routingDecision = routingDecisionFromPlannerIntent(
    plan.intent,
  );

  const toolMappingStartedAt = nowMs();
  const toolRequests =
    outOfScopeToolRequests ??
    (plannerResult ? toolRequestsForPlannerResult(plannerResult) : []);
  timings.push(timingSpan("tool_mapping", toolMappingStartedAt));
  const shouldExecuteDomainTools = runtime.maxLoopSteps >= 2;
  const artifactStartedAt = nowMs();
  let artifacts: OrbitAgentArtifactPayload[] = shouldExecuteDomainTools
    ? uniqueArtifactsByEvidence(
        (
          await Promise.all(
            toolRequests.map((request) =>
              artifactForRequest({
                artifactTaskService: runtime.artifactTaskService,
                history: historyTurns,
                locale,
                message,
                request,
              }),
            ),
          )
        ).filter((artifact): artifact is OrbitAgentArtifactPayload =>
          Boolean(artifact),
        ),
      )
    : [];
  timings.push(
    timingSpan(
      "artifact_generation",
      artifactStartedAt,
      !shouldExecuteDomainTools,
    ),
  );

  const accumulatedToolRequests = [...toolRequests];
  let assistantMessageForSynthesis = plan.assistantMessage;
  if (
    runtime.maxLoopSteps >= 3 &&
    plannerResult &&
    artifacts.length > 0
  ) {
    const replanStartedAt = nowMs();
    const replanResult = await runtime.planner.plan({
      history: historyTurns,
      locale: input.locale,
      memory: input.memory,
      message,
      outcomes: input.outcomes,
      toolResults: artifacts.map(artifactSummaryForSynthesis),
    });
    timings.push(timingSpan("replan", replanStartedAt));

    if (replanResult.success) {
      assistantMessageForSynthesis = replanResult.data.assistantMessage;
      const previousRequestKeys = new Set(
        accumulatedToolRequests.map(toolRequestKey),
      );
      const nextToolRequests = toolRequestsForPlannerResult(replanResult).filter(
        (request) => !previousRequestKeys.has(toolRequestKey(request)),
      );
      accumulatedToolRequests.push(...nextToolRequests);

      const continuationToolsStartedAt = nowMs();
      const continuationArtifacts = (
        await Promise.all(
          nextToolRequests.map((request) =>
            artifactForRequest({
              artifactTaskService: runtime.artifactTaskService,
              history: historyTurns,
              locale,
              message,
              request,
            }),
          ),
        )
      ).filter((artifact): artifact is OrbitAgentArtifactPayload =>
        Boolean(artifact),
      );
      artifacts = uniqueArtifactsByEvidence([
        ...artifacts,
        ...continuationArtifacts,
      ]);
      timings.push(
        timingSpan(
          "artifact_generation_replan",
          continuationToolsStartedAt,
          nextToolRequests.length === 0,
        ),
      );
    }
  }

  const shouldSynthesizeAfterTools =
    runtime.maxLoopSteps >= 3 && artifacts.length > 0;
  const synthesisStartedAt = nowMs();
  const synthesisResult = shouldSynthesizeAfterTools
    ? await runtime.planner.synthesize({
        artifacts: artifacts.map(artifactSummaryForSynthesis),
        assistantMessage: assistantMessageForSynthesis,
        history: historyTurns,
        intent: plan.intent,
        locale: input.locale,
        memory: input.memory,
        message,
        outcomes: input.outcomes,
        toolRequests: accumulatedToolRequests,
      })
    : null;
  timings.push(
    timingSpan("synthesis", synthesisStartedAt, !shouldSynthesizeAfterTools),
  );

  const finalAssistantMessage =
    synthesisResult?.success === true
      ? synthesisResult.data.assistantMessage
      : assistantMessageForSynthesis;
  const finalResponseStartedAt = nowMs();
  timings.push(timingSpan("final_response", finalResponseStartedAt));
  const conversation = conversationForRuntimeSuccess({
    aiProviderRequested: Boolean(plannerResult || synthesisResult),
    artifacts,
    finalAssistantMessage,
    locale,
    maxLoopSteps: runtime.maxLoopSteps,
    message,
    plan,
    plannerResult,
    routingDecision,
    shouldSynthesizeAfterTools,
    timings,
    toolRequests: accumulatedToolRequests,
  });

  return {
    artifacts,
    conversation,
    finalAssistantMessage,
    locale,
    message,
    plan,
    plannerResult,
    plannerSkippedByGuardrail: !plannerResult,
    shouldExecuteDomainTools,
    shouldSynthesizeAfterTools,
    state: "completed",
    synthesisResult,
    timings,
    toolRequests: accumulatedToolRequests,
  };
}
