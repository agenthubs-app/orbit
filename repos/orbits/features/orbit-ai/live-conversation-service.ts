/**
 * live-conversation-service.ts
 *
 * 这是 Orbit Agent 的 live 对话服务实现。它负责把 UI 发来的聊天请求
 * 变成一个可追踪、可回退、不会偷偷执行副作用的 Agent 执行链。
 *
 * 阅读这个文件时可以按四层理解：
 * 1. 输入和场景：先把 scenario、message、loop steps 等入口参数规范化。
 * 2. 本地边界：隐私、密钥、外部权限、危机、高风险专业建议等请求先在本地截停。
 * 3. 模型规划：只有通过本地边界的请求，才交给 provider planner 识别 intent 和工具计划。
 * 4. 可复核输出：工具计划只生成 artifact / proposed intent，最终仍由 UI 让用户确认。
 */
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
  type OrbitAgentConversationTimingSpan,
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
import { createOrbitAgentArtifactPreviewService } from "./artifact-task-preview-service";
import type { OrbitAgentArtifactTaskService } from "./service";

// live conversation service 是真实 Chat Agent 的编排层：
// 它可以调用配置好的模型 provider，但目前不会读写真实业务数据库，
// 也不会发送邮件、创建日程、投递通知或执行任何外部副作用。
// 这个文件的核心职责是把“用户输入 -> 本地安全边界 -> 模型规划 ->
// 可复核 artifact -> 最终回复”串成一条稳定、可测试的执行链。
const liveCollectedAt = "2026-06-27T00:00:00.000Z";
const liveConversationId = "live-orbit-agent-conversation";

// loop step 是 live agent 的执行预算，防止一次用户请求无限扩展。
// 当前最多三步：planner、artifact 生成、综合回复。
// 默认交互链路停在 artifact，避免每次需要面板的请求都串行等待第二次模型 synthesis。
const defaultMaxLoopSteps = 2;
const maxSupportedLoopSteps = 3;
const minSupportedLoopSteps = 1;

type OrbitAgentLocale = "en" | "zh";

// live service 的配置来自 service factory 和环境变量。
// maxLoopSteps 允许测试或本地调试把执行链停在某个阶段。
export interface LiveOrbitAgentConversationServiceConfig
  extends GeminiOrbitAgentProviderConfig {
  artifactTaskService?: OrbitAgentArtifactTaskService;
  maxLoopSteps?: number | string | null;
}

// scenario 用于 UI 和 contract 测试固定状态；真实用户请求默认走 success pipeline。
// 用 Set 做白名单判断，避免未声明的 scenario 字符串改变 live 服务行为。
const supportedScenarios = new Set<OrbitAgentConversationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

// safetyLedger 是返回给 UI/调试层的“实际做过什么”记录。
// 这里默认把外部副作用、真实数据库读写、邮件/日历/通知全部标为 false。
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

// provenance 说明这次回复来自哪里、用什么方式生成，以及附带安全账本。
// UI 可以用它区分本地边界回复、模型回复和 provider 失败。
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
  // 只接受 contract 声明过的 scenario，避免任意字符串影响服务分支。
  if (
    scenario &&
    supportedScenarios.has(scenario as OrbitAgentConversationScenario)
  ) {
    return scenario as OrbitAgentConversationScenario;
  }

  return "success";
}

function readText(value: unknown): string | null {
  // 所有用户文本入口统一 trim；空字符串返回 null，便于后续走明确错误码。
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(locale: unknown): OrbitAgentLocale {
  return locale === "zh" ? "zh" : "en";
}

function localize(locale: OrbitAgentLocale, copy: Record<OrbitAgentLocale, string>) {
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

// 以下 detector 会在模型调用之前运行。
// 命中后直接返回本地规则回复，避免把隐私控制、密钥、注入、
// 高风险建议或外部权限请求发送给模型 provider。
// 这些 detector 是“安全闸门”，不是完整语义理解；宁可让用户澄清，
// 也不让明显高风险请求流入 provider 或工具层。
function isPrivacyControlRequest(message: string): boolean {
  // 用户要求停止分析、停止保存或删除聊天记录时，先交给本地隐私边界处理。
  return /(?:不要|别|請勿|请勿).*(?:AI|ai|人工智能)?.*分析|关闭.*(?:AI|ai)?.*分析|(?:不要|别|請勿|请勿).*(?:保存|存储|儲存).*(?:聊天|记录|內容|内容)|(?:删掉|删除|刪除).*(?:聊天|记录|內容|内容)|do not analy[sz]e|don't analy[sz]e|do not (?:save|store|retain)|don't (?:save|store|retain)|delete (?:this )?(?:chat|conversation|record)/i.test(
    message,
  );
}

function isUntrustedInstructionInjectionRequest(message: string): boolean {
  // 外部内容里的“忽略系统指令”或要求泄露其他联系人资料，都视作不可信指令注入。
  const injectionInstruction =
    /忽略(?:之前|以上|所有|系统|开发者)?.*(?:指令|规则)|ignore (?:previous|above|all|system|developer) instructions/i;
  const crossRelationshipLeak =
    /(?:把|将|給|给).*(?:联系方式|資料|资料|联系人资料|contact info|contact details).*(?:发给我|給我|给我|send to me)|(?:其它|其他|别的|other).*(?:联系人|关系|contact|relationship).*(?:资料|信息|info|details)/i;

  return injectionInstruction.test(message) || crossRelationshipLeak.test(message);
}

function isSecretDisclosureRequest(message: string): boolean {
  // 任何要求展示/打印/发送 key、token、密码或 .env 的请求，都必须停在本地。
  const disclosureVerb =
    /(?:发给我|给我看|显示|打印|输出|透露|泄露|show|print|send|reveal|leak|dump)/i;
  const secretObject =
    /(?:api[_ -]?key|secret|token|password|passwd|credential|凭据|密钥|金钥|令牌|密码|环境变量|\\.env|DEEPSEEK_API_KEY|OPENAI_API_KEY)/i;

  return disclosureVerb.test(message) && secretObject.test(message);
}

function isSensitiveContactShareRequest(message: string): boolean {
  // 联系方式属于敏感联系人资料；转发或共享之前需要显式授权和确认流程。
  const sensitiveContactField =
    /(?:联系方式|聯絡方式|联系人资料|聯絡人資料|电话号码|電話號碼|手机号|手機號|邮箱|郵箱|微信|地址|contact info|contact details|phone number|phone|email|address|wechat)/i;
  const directedShare =
    /(?:把|将|將).*(?:发给|發給|发送给|發送給|转发给|轉發給|分享给|分享給|提供给|提供給|send to|forward to|share with|give to)|(?:send|forward|share|give).*(?:to|with)/i;

  return sensitiveContactField.test(message) && directedShare.test(message);
}

function isExternalPermissionRequest(message: string): boolean {
  // Gmail、日历、通讯录等外部账号数据必须先授权，不能由聊天请求直接读取。
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
  // 当前 agent 没有联网搜索/行情/天气工具；遇到实时查询要明确拒绝编造。
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
  // 医疗、法律、税务、投资等高风险专业判断不交给关系助理生成结论。
  const adviceVerb =
    /(?:应该|應該|要不要|怎么处理|怎麼處理|怎么办|怎麼辦|吃什么药|吃什麼藥|用什么药|用什麼藥|诊断|診斷|起诉|诉讼|合同|避税|报税|买哪只|卖哪只|投资建议|should i|what should i|diagnose|prescribe|sue|lawsuit|contract|tax|invest|buy|sell)/i;
  const professionalDomain =
    /(?:胸口痛|胸痛|头痛|發燒|发烧|药|藥|医生|醫生|急诊|急診|医疗|醫療|法律|律师|律師|法院|起诉|诉讼|合同|税|稅|股票|基金|债券|債券|期权|期權|投资|投資|财务|財務|medical|doctor|medicine|legal|lawyer|court|tax|stock|fund|bond|option|financial|investment)/i;

  return adviceVerb.test(message) && professionalDomain.test(message);
}

function isCrisisSupportRequest(message: string): boolean {
  // 自伤危机或遗书请求必须停在本地，直接给安全支持指引。
  const firstPersonSelfHarm =
    /(?:我|自己|myself|my life).*(?:伤害自己|傷害自己|自杀|自殺|轻生|輕生|结束生命|結束生命|不想活|活不下去|hurt myself|kill myself|end my life|suicide)/i;
  const crisisWritingRequest =
    /(?:帮我|幫我|给我|給我|替我|write|draft).*(?:遗书|遺書|告别信|告別信|自杀信|自殺信|suicide note)/i;

  return firstPersonSelfHarm.test(message) || crisisWritingRequest.test(message);
}

function isAmbiguousRecipientDraftRequest(message: string): boolean {
  // “给她写一条消息”这类请求缺少收件人，不能让模型自行猜测联系人。
  const relationshipAction =
    /(?:写|草稿|消息|短信|微信|邮件|邀|约|见面|联系|follow[ -]?up|message|draft|send|invite|meet)/i;
  const ambiguousRecipient =
    /(?:给|發給|发给|約|约|邀請|邀请|联系|和)(?:她|他|ta|TA)|\b(?:write|message|send|invite|meet|follow up with)\s+(?:her|him|them)\b/i;

  return relationshipAction.test(message) && ambiguousRecipient.test(message);
}

function isRelationshipStateMutationRequest(message: string): boolean {
  // 修改联系人、创建提醒、删除记录等状态变更必须进入确认流程，不能由对话直接执行。
  const mutationVerb =
    /(?:更新|修改|改成|改为|保存|記住|记住|记录|添加|新增|新建|创建|建立|加入|加到|导入|匯入|提醒|通知|刪除|删除|移除|忘记|update|change|save|remember|record|add|create|import|remind|notify|delete|remove|forget)/i;
  const relationshipObject =
    /(?:联系人|关系|资料|資料|公司|职位|职务|标签|备注|画像|联系|联络|聯絡|跟进|跟進|contact|relationship|profile|company|title|tag|note|call|message|email|follow[ -]?up)/i;

  return mutationVerb.test(message) && relationshipObject.test(message);
}

// 当前 live agent 一次只推进一个 Orbit 工作流。
// 如果用户同一句话里同时要求活动、人脉、跟进、关系回顾或消息草稿，
// 这里先识别出来，后面会要求用户选择一个方向再继续。
function detectWorkflowSignals(message: string): string[] {
  const signals: string[] = [];
  // 这里把一句话中可能出现的 Orbit 工作流信号拆出来。
  // 后续通过信号数量判断是否需要先澄清，而不是让模型一次处理多个方向。
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
  // 一个 live agent 请求只处理一个 Orbit 工作流；多意图时先让用户选择方向。
  return detectWorkflowSignals(message).length > 1;
}

// ORBIT_AGENT_MAX_LOOP_STEPS 是 live agent 的硬预算：
// 1 = 只让模型做 planner；2 = planner 后生成可复核 artifact；
// 3 = artifact 后再让模型综合最终回复。
function readMaxLoopSteps(value: unknown): number {
  // 环境变量通常是字符串，测试里可能直接传 number；这里统一转成整数。
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : defaultMaxLoopSteps;

  if (!Number.isFinite(parsed)) {
    // 解析失败时退回默认预算，避免因为错误配置让 live agent 意外停止或失控。
    return defaultMaxLoopSteps;
  }

  return Math.min(
    maxSupportedLoopSteps,
    Math.max(minSupportedLoopSteps, Math.floor(parsed)),
  );
}

// provider 或本地校验失败时，用统一的 conversation contract 返回错误。
function failure(
  code: OrbitAgentConversationErrorCode,
  safety: OrbitAgentSafetyLedger,
  message?: string,
  source?: OrbitAgentProviderSource,
): OrbitAgentConversationFailure {
  // 对外错误信息统一从 conversation contract 取定义，
  // 这样 UI、测试和服务层看到的是同一组稳定错误码。
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

// 成功 payload 做一次 JSON clone，避免调用方意外修改服务内部对象。
function success(payload: OrbitAgentConversationPayload): OrbitAgentConversationResult {
  return {
    data: JSON.parse(JSON.stringify(payload)) as OrbitAgentConversationPayload,
    success: true,
  };
}

// list/get 场景没有真实持久化会话；这里返回一个稳定的虚拟会话摘要。
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
  // get/list 不依赖真实会话存储，因此用同一套 payload 形状模拟会话状态。
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

// scenario 只服务开发/测试状态锁定；正常 success 返回 null，继续走 live pipeline。
function scenarioResult(
  scenario: OrbitAgentConversationScenario,
): OrbitAgentConversationResult | null {
  // scenario 不应该触发 provider 或工具调用，所以安全账本全部标为 false。
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

// 模型 planner 的 intent 只能映射到白名单内部工具。
// 这里不接受模型发明的新工具名，也不让一次请求进入多个工具。
function toolNameForIntent(
  intent: GeminiOrbitAgentIntent,
): GeminiOrbitAgentToolName | null {
  // intent 是模型理解出的用户意图；toolName 是 Orbit 内部允许展示的工具计划。
  // 没有显式映射的 intent 会返回 null，避免模型把任意文本变成工具调用。
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
  // tool name 属于 provider 侧规划语言；artifact kind 属于 UI/任务契约语言。
  // 通过显式映射把两层解耦，后续新增工具时也能集中更新。
  const kinds: Record<GeminiOrbitAgentToolName, OrbitAgentArtifactKind> = {
    "chat.context": "relationship_chat_context",
    "contacts.recommend": "contact_recommendations",
    "events.recommend": "event_recommendations",
    "followups.reviewQueue": "followup_queue",
  };

  return kinds[toolName];
}

// proposedToolIntents 是展示给用户确认的“计划动作”，不是已经执行的动作。
function proposedIntentForTool(
  request: GeminiOrbitAgentToolRequest,
  locale: OrbitAgentLocale = "en",
): OrbitAgentProposedToolIntent {
  // 这里给 UI 准备人类可读的工具意图说明。
  // 注意它只是“建议执行什么”，并不表示工具已经执行或外部动作已经发生。
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

// live 模型只决定需要哪类 Orbit 结果；artifactTaskService 通过 contract 注入。
// 默认 preview service 只生成通用复核面板，不读取 fixture，也不会读库或调用外部工具。
function artifactForRequest(input: {
  artifactTaskService: OrbitAgentArtifactTaskService;
  locale?: string | null;
  message: string;
  request: GeminiOrbitAgentToolRequest;
}): OrbitAgentArtifactPayload | null {
  const locale = normalizeLocale(input.locale);
  const request: OrbitAgentArtifactTaskRequest = {
    conversationId: liveConversationId,
    kind: artifactKindForTool(input.request.toolName),
    locale,
    presentation: {
      preferredSurface: "side_panel",
      widthHint: "half",
    },
    query: input.message,
  };
  const result = input.artifactTaskService.createArtifactTask(request);

  return result.success ? result.data : null;
}

// synthesis 阶段只把 artifact 的摘要交给模型，避免把完整结构或将来可能存在的敏感字段扩散出去。
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

// provider 错误在这里收敛成对外稳定的 Orbit Agent 错误码。
// 缺 key 不算外部网络请求；schema invalid 会阻止后续工具和 synthesis。
function failureForPlannerResult(
  plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: false }>,
): OrbitAgentConversationResult {
  // provider 层的错误类型更贴近模型供应商；
  // 这里翻译成 Orbit Agent 自己的错误码，降低 UI 对供应商实现的依赖。
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
  // UI 期望 messages 中同时包含用户输入和 assistant 回复。
  // 这里使用稳定时间和 ID，方便 snapshot/contract 测试对齐。
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
  // assistant message 同样使用稳定 ID；真实持久化接入后可以替换为存储层生成。
  return {
    content,
    conversationId: liveConversationId,
    createdAt: "2026-06-27T00:01:01.000Z",
    evidenceIds: ["evidence:orbit-agent:gemini-assistant-reply"],
    messageId: "orbit-agent-gemini-assistant-latest",
    role: "assistant",
  };
}

// 以下 payload 是本地边界的用户可见回复。
// 所有这些路径都明确标记 aiProviderRequested=false，表示没有把原始消息发给模型。
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
  // 外部粘贴内容可能包含 prompt injection。这里把它当作“证据文本”而不是指令，
  // 因此直接返回本地安全提示，避免模型把其中的命令当成系统规则执行。
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
  // 密钥边界的重点是“完全不出本地进程”：不发 provider，也不写 artifact。
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
  // 联系方式共享要先有授权和确认。即使用户措辞像普通聊天请求，
  // 也不能让模型或工具直接生成“把联系方式发给某人”的执行结果。
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
  // 外部账号数据访问属于显式权限流程，不属于 chat prompt 的即时能力。
  // 这个 payload 用来告诉 UI：需要先去权限设置，而不是继续规划。
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
  // 当前 live agent 没有搜索、行情、天气等实时工具；本地截停可以避免模型编造最新事实。
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
  // Orbit Agent 是关系工作助手，不是医疗/法律/财务专家。
  // 高风险专业建议必须转向合格专业人士，而不是交给通用模型生成结论。
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
  // 自伤危机优先给即时人类支持指引，并且拒绝生成遗书或伤害自己的内容。
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
  // 多意图不是失败，而是需要用户先缩小任务范围；因此仍返回 success payload。
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
  // 缺少明确联系人时，不能由 agent 猜测“她/他/他们”是谁。
  // 先澄清对象，后续草稿和 artifact 才能绑定到正确关系上下文。
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
  // 写入联系人资料、创建提醒、删除记录都属于状态变更。
  // 当前 chat 服务只负责提出可复核建议，不直接修改业务数据或触发通知。
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

export function createLiveOrbitAgentLocalBoundaryPayload(
  message: string,
): OrbitAgentConversationPayload | null {
  // 检查顺序有意义：越敏感、越应该提前截停的请求排在前面。
  // 只有全部本地边界都未命中，才允许进入模型 planner。
  if (isPrivacyControlRequest(message)) {
    return privacyControlPayload(message);
  }

  if (isUntrustedInstructionInjectionRequest(message)) {
    return untrustedContentBoundaryPayload(message);
  }

  if (isSensitiveContactShareRequest(message)) {
    return sensitiveShareBoundaryPayload(message);
  }

  if (isSecretDisclosureRequest(message)) {
    return secretBoundaryPayload(message);
  }

  if (isExternalPermissionRequest(message)) {
    return permissionBoundaryPayload(message);
  }

  if (isUnsupportedRealtimeLookupRequest(message)) {
    return unsupportedRealtimeBoundaryPayload(message);
  }

  if (isCrisisSupportRequest(message)) {
    return crisisBoundaryPayload(message);
  }

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

// live mode 的 service 构造器。
// provider/model/key 由 createGeminiOrbitAgentPlanner 根据 config 和环境变量解析。
export function createLiveOrbitAgentConversationService(
  config: LiveOrbitAgentConversationServiceConfig = {},
): OrbitAgentConversationService {
  // planner 封装真实 provider 访问；service 只关心 plan/synthesize 两个能力。
  const planner = createGeminiOrbitAgentPlanner(config);
  const artifactTaskService =
    config.artifactTaskService ?? createOrbitAgentArtifactPreviewService();
  const maxLoopSteps = readMaxLoopSteps(
    config.maxLoopSteps ?? process.env.ORBIT_AGENT_MAX_LOOP_STEPS,
  );

  // 对外仍然实现统一的 OrbitAgentConversationService。
  // UI 不需要知道背后是 mock、hybrid 还是 live，只按 contract 调用这三个方法。
  return {
    getConversation(input): OrbitAgentConversationResult {
      // live service 暂时没有会话数据库，只接受一个稳定虚拟 conversationId。
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      // 传入其它 conversationId 时返回 not found，而不是创建新会话；
      // 这样调用方能明确知道 live 服务目前只暴露一个虚拟会话入口。
      if (readText(input.conversationId) !== liveConversationId) {
        return failure(
          "ORBIT_AGENT_CONVERSATION_NOT_FOUND",
          safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
        );
      }

      // 找到虚拟会话后返回 ready 状态，不触发 provider；
      // 真正的模型调用只发生在 sendMessage。
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
      // list 和 get 一样返回当前 live agent 的单会话视图，保证 UI 有稳定入口。
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      // listConversations 也不查询数据库，只返回同一个稳定会话摘要；
      // 这能让 UI 的左侧会话列表和 sendMessage 使用同一份 contract。
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
      // sendMessage 是 live conversation 的主执行链：
      // scenario -> 空输入校验 -> 本地安全边界 -> provider planner ->
      // artifact 生成 -> 可选 synthesis -> contract payload。
      // 每一步都必须能从返回的 safety/provenance 中看出是否调用了模型或工具。

      // 1. 开发/测试 scenario 先短路，避免锁状态测试时误触发真实 provider。
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      // 2. 空消息是本地校验错误，不进入模型或工具层。
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

      const timings: OrbitAgentConversationTimingSpan[] = [];

      // 3. 本地边界先于模型调用，命中后整条请求停在本地。
      const localBoundaryStartedAt = nowMs();
      const localBoundaryPayload =
        createLiveOrbitAgentLocalBoundaryPayload(message);
      timings.push(timingSpan("local_boundary", localBoundaryStartedAt));

      if (localBoundaryPayload) {
        return success(localBoundaryPayload);
      }

      // 4. planner 是第一次外部 provider 调用，负责输出 intent 和允许的 toolRequests。
      const locale = normalizeLocale(input.locale);
      const plannerStartedAt = nowMs();
      const plannerResult = await planner.plan({
        locale: input.locale,
        message,
      });
      timings.push(timingSpan("planner", plannerStartedAt));

      if (plannerResult.success === false) {
        return failureForPlannerResult(plannerResult);
      }

      // 5. 如果 provider 只返回 intent 没返回 toolRequests，用 intent 补一个最小可复核工具请求。
      // 这样可以兼容较保守的 provider 输出：模型给出明确意图时，
      // UI 仍然能看到 proposedToolIntents 和 artifact，而不是空白回复。
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

      // 6. maxLoopSteps 控制是否进入内部 artifact 生成；step=1 时只展示计划动作。
      // 这里所谓“执行 domain tools”目前只会生成注入服务返回的可复核 artifact，
      // safetyLedger 仍会记录 domainToolCallsExecuted，方便后续真实工具接入时保持语义一致。
      const shouldExecuteDomainTools = maxLoopSteps >= 2;
      const artifactStartedAt = nowMs();
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
      timings.push(
        timingSpan(
          "artifact_generation",
          artifactStartedAt,
          !shouldExecuteDomainTools,
        ),
      );

      // 7. 只有已经生成 artifact 且预算允许时，才进行第二次模型调用做最终综合。
      const shouldSynthesizeAfterTools =
        maxLoopSteps >= 3 && artifacts.length > 0;
      const synthesisStartedAt = nowMs();
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
      timings.push(
        timingSpan("synthesis", synthesisStartedAt, !shouldSynthesizeAfterTools),
      );

      // 8. synthesis 跳过或失败时，回退使用 planner 的原始 assistantMessage。
      // synthesis 失败不让整次对话失败，是为了保证用户至少能看到 planner 的可解释结果。
      const finalAssistantMessage =
        synthesisResult?.success === true
          ? synthesisResult.data.assistantMessage
          : plannerResult.data.assistantMessage;

      // messages 是 UI 展示用的最小聊天记录：本轮用户输入 + 最终助手回复。
      // 当前还没有持久化历史，所以这里只返回本次请求的两条消息。
      const messages = [
        userMessage(message),
        assistantMessage(finalAssistantMessage),
      ];

      // 只有走到这里，才说明 provider planner 已被请求；
      // domainToolCallsExecuted 只表示生成过内部 artifact，不表示有外部副作用。
      const safety = safetyLedger({
        aiProviderRequested: true,
        domainToolCallsExecuted: artifacts.length > 0,
        externalNetworkRequested: true,
      });

      // nextAction 告诉 UI 下一步应该提示用户复核什么：
      // 预算停在 planner、停在 artifact，或完整跑完 synthesis 时文案不同。
      const nextAction =
        maxLoopSteps === 1 && toolRequests.length > 0
          ? localize(locale, {
              en: "Loop stopped after planner by ORBIT_AGENT_MAX_LOOP_STEPS; review proposed tool intents before executing any domain tool.",
              zh: "执行链已按 ORBIT_AGENT_MAX_LOOP_STEPS 停在 planner 后；执行任何领域工具前，请先复核计划工具意图。",
            })
          : artifacts.length > 0 && !shouldSynthesizeAfterTools
            ? localize(locale, {
                en: "Review the generated artifact; synthesis is skipped by ORBIT_AGENT_MAX_LOOP_STEPS.",
                zh: "请复核已生成的结果；当前按 ORBIT_AGENT_MAX_LOOP_STEPS 跳过综合回复。",
              })
            : localize(locale, {
                en: "Review the model-planned Orbit result; confirm before any external action or record write.",
                zh: "请复核模型规划的 Orbit 结果；任何外部动作或记录写入前都需要确认。",
              });

      // 9. 返回给 UI 的 payload 包含回复文本、可复核 artifact、计划工具、来源和安全账本。
      return success({
        activeConversationId: liveConversationId,
        artifacts,
        assistantMessage: finalAssistantMessage,
        conversations: [conversationSummary(messages[messages.length - 1])],
        diagnostics: {
          maxLoopSteps,
          model: plannerResult.data.model,
          provider: plannerResult.data.provider,
          timings,
        },
        messages,
        nextAction,
        // proposedToolIntents 是“待确认计划”，用于 UI 展示按钮/复核项；
        // 它不是工具执行结果，也不意味着已经写数据或触发通知。
        proposedToolIntents: toolRequests.map((request) =>
          proposedIntentForTool(request, locale),
        ),
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
