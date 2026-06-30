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
  type OrbitAgentConversationTimingSpan,
  type OrbitAgentProposedToolIntent,
  type OrbitAgentSafetyLedger,
  type OrbitAgentSendMessageInput,
} from "./conversation-contract";
import {
  createGeminiOrbitAgentPlanner,
  type GeminiOrbitAgentIntent,
  type GeminiOrbitAgentPlannerResult,
  type GeminiOrbitAgentProviderConfig,
  type GeminiOrbitAgentSynthesisResult,
  type GeminiOrbitAgentToolName,
  type GeminiOrbitAgentToolRequest,
  type GeminiOrbitAgentToolResultSummary,
  type OrbitAgentProviderSource,
} from "./gemini-provider";
import { createOrbitAgentLiveArtifactTaskService } from "./live-artifact-task-service";
import type { OrbitAgentArtifactTaskService } from "./service";

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
      plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: true }>;
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
    /(?:联系人|关系|资料|資料|公司|职位|职务|标签|备注|画像|联系|联络|聯絡|跟进|跟進|contact|relationship|profile|company|title|tag|note|call|message|email|follow[ -]?up)/i;

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

function localBoundaryPayload(input: {
  assistant: string;
  label: string;
  message: string;
  nextAction: string;
  source: OrbitAgentConversationProvenance["source"];
}): OrbitAgentConversationPayload {
  const messages = [userMessage(input.message), assistantMessage(input.assistant)];
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
  return localBoundaryPayload({
    assistant:
      "这属于医疗、法律或财务等专业判断。Orbit 已停在本地边界：没有调用模型，也不会给诊断、用药、法律结论或投资指令。胸口痛这类情况请尽快联系医生；如果症状严重或突然出现，请直接联系急救或去急诊。",
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
  if (isRelationshipStateMutationRequest(message)) {
    return stateChangeBoundaryPayload(message);
  }
  if (isMultiIntentWorkflowRequest(message)) {
    return multiIntentBoundaryPayload(message);
  }
  if (isAmbiguousRecipientDraftRequest(message)) {
    return clarificationBoundaryPayload(message);
  }

  return null;
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
    reason: localize(locale, {
      en: "The configured model provider selected this allowed Orbit tool from the user prompt; execution remains inside Orbit and requires confirmation before side effects.",
      zh: "模型 provider 从用户请求中选择了这个 Orbit 允许工具；执行仍停留在 Orbit 内部，任何副作用前都需要确认。",
    }),
    requiresUserConfirmation: true,
    toolFamily: toolFamilyForToolName(request.toolName) as
      OrbitAgentProposedToolIntent["toolFamily"],
  };
}

export function artifactForRequest(input: {
  artifactTaskService: OrbitAgentArtifactTaskService;
  locale?: string | null;
  message: string;
  request: GeminiOrbitAgentToolRequest;
}): OrbitAgentArtifactPayload | null {
  const locale = normalizeLocale(input.locale);
  const request: OrbitAgentArtifactTaskRequest = {
    conversationId: liveConversationId,
    contextMessages: [
      {
        content: input.message,
        role: "user",
      },
    ],
    kind: artifactKindForTool(input.request.toolName),
    locale,
    presentation: {
      preferredSurface: "side_panel",
      widthHint: "half",
    },
    query: input.message,
    toolArguments: input.request.arguments,
  };
  const result = input.artifactTaskService.createArtifactTask(request);

  return result.success ? result.data : null;
}

export function artifactSummaryForSynthesis(
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

export function conversationForRuntimeSuccess(input: {
  artifacts: readonly OrbitAgentArtifactPayload[];
  finalAssistantMessage: string;
  locale: OrbitAgentLocale;
  maxLoopSteps: number;
  message: string;
  plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: true }>;
  shouldSynthesizeAfterTools: boolean;
  timings: readonly OrbitAgentConversationTimingSpan[];
  toolRequests: readonly GeminiOrbitAgentToolRequest[];
}): OrbitAgentConversationPayload {
  const messages = [
    userMessage(input.message),
    assistantMessage(input.finalAssistantMessage),
  ];
  const safety = safetyLedger({
    aiProviderRequested: true,
    domainToolCallsExecuted: input.artifacts.length > 0,
    externalNetworkRequested: true,
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
      model: input.plannerResult.data.model,
      provider: input.plannerResult.data.provider,
      timings: input.timings,
    },
    messages,
    nextAction,
    proposedToolIntents: input.toolRequests.map((request) =>
      proposedIntentForTool(request, input.locale),
    ),
    provenance: provenance({
      generationMethod: "model-provider-live-agent-reply",
      label: `Orbit Agent live reply via ${input.plannerResult.data.provider}:${input.plannerResult.data.model}`,
      safety,
      source: input.plannerResult.data.source,
    }),
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

  const plannerStartedAt = nowMs();
  const plannerResult = await runtime.planner.plan({
    locale: input.locale,
    message,
  });
  timings.push(timingSpan("planner", plannerStartedAt));

  if (plannerResult.success === false) {
    return {
      failureResult: failureForPlannerResult(plannerResult),
      locale,
      message,
      plannerResult,
      state: "planner_failure",
      timings,
    };
  }

  const toolMappingStartedAt = nowMs();
  const toolRequests = toolRequestsForPlannerResult(plannerResult);
  timings.push(timingSpan("tool_mapping", toolMappingStartedAt));
  const shouldExecuteDomainTools = runtime.maxLoopSteps >= 2;
  const artifactStartedAt = nowMs();
  const artifacts = shouldExecuteDomainTools
    ? toolRequests
        .map((request) =>
          artifactForRequest({
            artifactTaskService: runtime.artifactTaskService,
            locale,
            message,
            request,
          }),
        )
        .filter((artifact): artifact is OrbitAgentArtifactPayload =>
          Boolean(artifact),
        )
    : [];
  timings.push(
    timingSpan(
      "artifact_generation",
      artifactStartedAt,
      !shouldExecuteDomainTools,
    ),
  );

  const shouldSynthesizeAfterTools =
    runtime.maxLoopSteps >= 3 && artifacts.length > 0;
  const synthesisStartedAt = nowMs();
  const synthesisResult = shouldSynthesizeAfterTools
    ? await runtime.planner.synthesize({
        artifacts: artifacts.map(artifactSummaryForSynthesis),
        assistantMessage: plannerResult.data.assistantMessage,
        intent: plannerResult.data.intent,
        locale: input.locale,
        message,
        toolRequests,
      })
    : null;
  timings.push(
    timingSpan("synthesis", synthesisStartedAt, !shouldSynthesizeAfterTools),
  );

  const finalAssistantMessage =
    synthesisResult?.success === true
      ? synthesisResult.data.assistantMessage
      : plannerResult.data.assistantMessage;
  const finalResponseStartedAt = nowMs();
  timings.push(timingSpan("final_response", finalResponseStartedAt));
  const conversation = conversationForRuntimeSuccess({
    artifacts,
    finalAssistantMessage,
    locale,
    maxLoopSteps: runtime.maxLoopSteps,
    message,
    plannerResult,
    shouldSynthesizeAfterTools,
    timings,
    toolRequests,
  });

  return {
    artifacts,
    conversation,
    finalAssistantMessage,
    locale,
    message,
    plannerResult,
    shouldExecuteDomainTools,
    shouldSynthesizeAfterTools,
    state: "completed",
    synthesisResult,
    timings,
    toolRequests,
  };
}
