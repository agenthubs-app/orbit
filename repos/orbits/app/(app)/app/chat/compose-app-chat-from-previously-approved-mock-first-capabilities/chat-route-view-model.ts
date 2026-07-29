import type {
  ChatConversationListPayload,
  ChatConversationListResult,
  ChatConversationStatus,
  ChatMessageThreadPayload,
  ChatMessageThreadResult,
} from "../../../../../features/chat/contract";
import type {
  ChatWritingAssistPayload,
  ChatWritingAssistResult,
  ChatWritingAssistSuggestion,
} from "../../../../../features/chat/assist-contract";
import type {
  ChatPrivacyControlsPayload,
  ChatPrivacyControlsResult,
} from "../../../../../features/chat/privacy-contract";
import type {
  ChatSummaryExtractionPayload,
  ChatSummaryExtractionResult,
} from "../../../../../features/chat/summary-contract";
import {
  createActorScopedAppChatRouteServices,
  createAppChatRouteServices,
  type AppChatRouteServices,
} from "./chat-service-factory";

// Chat route view-model 是传统 chat 页的总装层。
// 它读取 chat、writing assist、summary 和 privacy 服务，
// 再把多个 feature contract 合并成一个页面可渲染的 workspace。
export interface AppChatSearchParams {
  conversation?: string | string[];
  conversationId?: string | string[];
}
export type AppChatRouteScenario = "empty" | "pending" | "failure";
export interface AppChatRouteControls {
  scenario?: AppChatRouteScenario;
}

export interface AppChatRouteRequestContext {
  actorId?: string | null;
}

type ChatRouteResult =
  | ChatConversationListResult
  | ChatMessageThreadResult
  | ChatWritingAssistResult
  | ChatSummaryExtractionResult
  | ChatPrivacyControlsResult;
type ChatRouteSuccess = Extract<ChatRouteResult, { success: true }>;
type ChatRouteFailure = Extract<ChatRouteResult, { success: false }>;
type AppChatMaybeAsyncResult<TResult> = TResult | Promise<TResult>;

export interface AppChatRouteStateCopyViewModel {
  description: string;
  emptyState: string;
  guardrail: string;
  nextStep: string;
  purpose: string;
  title: string;
}

export interface AppChatRouteStateViewModel {
  copy: AppChatRouteStateCopyViewModel;
  errorCode: string | null;
  evidenceIds: readonly string[];
  scenario: AppChatRouteScenario;
}

export interface AppChatConversationViewModel {
  conversationId: string;
  evidenceIds: readonly string[];
  lastMessagePreview: string;
  organization: string;
  participantName: string;
  statusLabel: string;
  title: string;
}

export interface AppChatMessageViewModel {
  body: string;
  messageId: string;
  senderLabel: string;
  senderRole: "contact" | "orbit_user";
  timestampLabel: string;
}

export interface AppChatRelationshipContextViewModel {
  latestContext: string;
  organization: string;
  participantName: string;
  recommendedFollowup: string;
  relationshipReason: string;
}

export interface AppChatAssistViewModel {
  evidenceIds: readonly string[];
  label: string;
  rationale: string;
  suggestedText: string;
}

export interface AppChatSummaryViewModel {
  evidenceIds: readonly string[];
  narrative: string | null;
}

export interface AppChatExtractionViewModel {
  evidenceIds: readonly string[];
  needStatement: string | null;
  profileSuggestionValue: string | null;
  taskEvidenceIds: readonly string[];
  taskTitle: string | null;
}

export interface AppChatPrivacyViewModel {
  analysisAllowed: boolean;
  evidenceIds: readonly string[];
  organization: string;
  participantName: string;
}

export interface AppChatAgentArtifactActionViewModel {
  id: string;
  label: string;
  requiresConfirmation: boolean;
}

export interface AppChatAgentArtifactMetadataViewModel {
  label: string;
  value: string;
}

export interface AppChatAgentArtifactItemViewModel {
  actions: readonly AppChatAgentArtifactActionViewModel[];
  body: string | null;
  confidenceLabel: string | null;
  id: string;
  metadata: readonly AppChatAgentArtifactMetadataViewModel[];
  reason: string | null;
  subtitle: string | null;
  title: string;
}

export interface AppChatAgentArtifactSectionViewModel {
  body: string | null;
  items: readonly AppChatAgentArtifactItemViewModel[];
  title: string;
}

export interface AppChatAgentArtifactSurfaceViewModel {
  artifactId: string;
  evidenceIds: readonly string[];
  kind: string;
  nextAction: string;
  sections: readonly AppChatAgentArtifactSectionViewModel[];
  sourceModules: readonly string[];
  subtitle: string | null;
  summary: string;
  surface: "side_panel" | "inline_card" | "full_page";
  title: string;
}

export interface AppChatWorkspaceViewModel {
  conversations: readonly AppChatConversationViewModel[];
  extraction: AppChatExtractionViewModel;
  primaryAssist: AppChatAssistViewModel | null;
  privacy: AppChatPrivacyViewModel;
  relationshipContext: AppChatRelationshipContextViewModel;
  selectedConversation: AppChatConversationViewModel;
  summary: AppChatSummaryViewModel;
  threadMessages: readonly AppChatMessageViewModel[];
  threadSummary: string;
}

export type AppChatRouteViewModel =
  | {
      state: "success";
      workspace: AppChatWorkspaceViewModel;
    }
  | {
      state: "route-state";
      routeState: AppChatRouteStateViewModel;
    };

// querystring 可能来自 Next searchParams 或表单提交；数组值只取第一个。
function readAppChatSearchParam(
  searchParams: AppChatSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function statusLabel(status: ChatConversationStatus): string {
  const labels: Record<ChatConversationStatus, string> = {
    active: "Active",
    needs_followup: "Needs follow-up",
    paused: "Paused",
  };

  return labels[status];
}

function participantMessageLabel(message: {
  senderName: string;
  senderRole: "contact" | "orbit_user";
}): string {
  return message.senderRole === "orbit_user"
    ? "You wrote"
    : `${message.senderName} wrote`;
}

function shortTimestamp(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

// productCopy 把底层 contract 的工程词替换成用户可读页面文案。
function productCopy(value: string): string {
  const replacements: readonly [RegExp, string][] = [
    [/\bfixtures?\b/gi, "source record"],
    [/\bmock\b/gi, "review"],
    [/\bproviders?\b/gi, "connections"],
    [/\bboundary\b/gi, "check"],
    [/\broute\b/gi, "page"],
    [/\blive\b/gi, "connected"],
    [/\bmodel calls?\b/gi, "automated calls"],
    [/\bvector\b/gi, "search"],
    [/\bdeterministic\b/gi, "reviewed"],
    [/\bdatabases?\b/gi, "saved records"],
  ];

  return replacements.reduce((copy, [pattern, replacement]) => {
    return copy.replace(pattern, replacement);
  }, value);
}

function isRouteStateSuccess(result: ChatRouteResult): result is ChatRouteSuccess {
  return result.success === true;
}

function isRouteStateFailure(result: ChatRouteResult): result is ChatRouteFailure {
  return result.success === false;
}

async function resolveChatResult<TResult>(
  result: AppChatMaybeAsyncResult<TResult>,
): Promise<TResult> {
  return result;
}

// route-state 需要从多个服务结果中抽取 evidence，成功和失败格式不同，先收敛到一个 helper。
function evidenceIdsForResult(result: ChatRouteResult): readonly string[] {
  if (isRouteStateSuccess(result)) {
    return result.data.provenance.evidenceIds;
  }

  if (isRouteStateFailure(result)) {
    return result.error.evidenceIds;
  }

  return [];
}

// 页面公开展示 evidence 时过滤 mock 字样，保留更像用户可读来源的 ID。
function publicEvidenceIds(evidenceIds: readonly string[]): string[] {
  return evidenceIds.filter(
    (evidenceId) => !evidenceId.toLowerCase().includes("mock"),
  );
}

function uniqueEvidenceIds(results: readonly ChatRouteResult[]): string[] {
  return publicEvidenceIds(
    Array.from(new Set(results.flatMap((result) => evidenceIdsForResult(result)))),
  );
}

function firstFailure(results: readonly ChatRouteResult[]): ChatRouteFailure | null {
  return results.find(isRouteStateFailure) ?? null;
}

// stateCopy 是 empty/pending/failure 三个页面状态的文案表。
function stateCopy(scenario: AppChatRouteScenario): AppChatRouteStateCopyViewModel {
  if (scenario === "empty") {
    return {
      description:
        "Add source-backed relationship context before reviewing conversations, assists, summaries, and privacy controls.",
      emptyState:
        "No conversation has enough source evidence for chat review.",
      guardrail:
        "Orbit cannot prepare replies, summaries, profile updates, or sharing previews from an empty conversation queue.",
      nextStep: "Return when a conversation has source evidence and consent.",
      purpose:
        "Keep chat review useful when no sourced relationship context is available.",
      title: "No chat context is ready",
    };
  }

  if (scenario === "pending") {
    return {
      description:
        "Conversation review stays paused while local consent and source evidence are checked.",
      emptyState:
        "Conversation records stay hidden while consent is still being checked.",
      guardrail:
        "Orbit will not prepare replies, summarize context, update profiles, or share private notes while review is pending.",
      nextStep: "Return to chat after consent and source evidence are ready.",
      purpose:
        "Keep chat work visible without exposing an unfinished conversation review.",
      title: "Chat context is still checking consent",
    };
  }

  return {
    description:
      "Conversation review is unavailable while source evidence and privacy controls are checked.",
    emptyState:
      "The chat workspace is unavailable until source evidence recovers.",
    guardrail:
      "Orbit will not prepare replies, summarize context, update profiles, or share private notes while this is unavailable.",
    nextStep: "Reload chat before taking action.",
    purpose:
      "Show a visible recovery path when source-backed chat context is unavailable.",
    title: "Chat workspace could not load",
  };
}

function missingConversationRouteState(
  evidenceIds: readonly string[],
): AppChatRouteStateViewModel {
  return {
    copy: {
      description:
        "The requested conversation is not available in the current source-backed chat list.",
      emptyState: "No sourced conversation matches this conversation ID.",
      guardrail:
        "Orbit will not substitute another person's thread, summary, relationship context, or writing suggestion.",
      nextStep:
        "Return to Chat and choose a conversation from the current sourced list.",
      purpose:
        "Keep conversation identity exact when a bookmarked or shared link is no longer available.",
      title: "Conversation not found",
    },
    errorCode: "CHAT_CONVERSATION_NOT_FOUND",
    evidenceIds: publicEvidenceIds(evidenceIds),
    scenario: "empty",
  };
}

// 以下转换函数把 feature contract DTO 收窄成页面组件真正需要的字段。
function conversationViewModel(
  conversation: ChatConversationListPayload["conversations"][number],
): AppChatConversationViewModel {
  return {
    conversationId: conversation.conversationId,
    evidenceIds: conversation.evidenceIds,
    lastMessagePreview: conversation.lastMessagePreview,
    organization: conversation.organization,
    participantName: conversation.participantName,
    statusLabel: statusLabel(conversation.status),
    title: conversation.title,
  };
}

function threadMessageViewModel(
  message: ChatMessageThreadPayload["messages"][number],
): AppChatMessageViewModel {
  return {
    body: message.body,
    messageId: message.messageId,
    senderLabel: `${participantMessageLabel(message)} · ${message.senderName} · ${shortTimestamp(message.createdAt)}`,
    senderRole: message.senderRole,
    timestampLabel: shortTimestamp(message.createdAt),
  };
}

function relationshipContextViewModel(
  thread: ChatMessageThreadPayload,
): AppChatRelationshipContextViewModel {
  return {
    latestContext: thread.oneToOneContext.latestContext,
    organization: thread.oneToOneContext.organization,
    participantName: thread.oneToOneContext.participantName,
    recommendedFollowup: thread.oneToOneContext.recommendedFollowup,
    relationshipReason: thread.oneToOneContext.relationshipReason,
  };
}

function assistViewModel(
  assist: ChatWritingAssistSuggestion,
): AppChatAssistViewModel {
  return {
    evidenceIds: assist.evidenceIds,
    label: assist.label,
    rationale: assist.rationale,
    suggestedText: assist.suggestedText,
  };
}

function summaryViewModel(
  summary: ChatSummaryExtractionPayload,
): AppChatSummaryViewModel {
  return {
    evidenceIds: summary.provenance.evidenceIds,
    narrative: summary.summary?.narrative ?? null,
  };
}

function extractionViewModel(
  extraction: ChatSummaryExtractionPayload,
): AppChatExtractionViewModel {
  const need = extraction.extractedNeeds[0];
  const task = extraction.extractedTasks[0];
  const profileSuggestion =
    extraction.confirmationRequiredProfileSuggestions[0];

  return {
    evidenceIds: extraction.provenance.evidenceIds,
    needStatement: need?.statement ?? null,
    profileSuggestionValue: profileSuggestion?.proposedValue ?? null,
    taskEvidenceIds: task?.evidenceIds ?? [],
    taskTitle: task?.title ?? null,
  };
}

function privacyViewModel(
  privacy: ChatPrivacyControlsPayload,
): AppChatPrivacyViewModel {
  return {
    analysisAllowed: privacy.analysisOptIn.enabled,
    evidenceIds: privacy.provenance.evidenceIds,
    organization: privacy.organization,
    participantName: privacy.participantName,
  };
}

// workspaceViewModel 把多个成功 payload 合成一个页面工作区。
function workspaceViewModel(input: {
  assist: ChatWritingAssistPayload;
  conversations: ChatConversationListPayload;
  extraction: ChatSummaryExtractionPayload;
  privacy: ChatPrivacyControlsPayload;
  summary: ChatSummaryExtractionPayload;
  thread: ChatMessageThreadPayload;
}): AppChatWorkspaceViewModel {
  const selectedConversation = conversationViewModel(input.thread.conversation);
  const primaryAssist = input.assist.assists[0]
    ? assistViewModel(input.assist.assists[0])
    : null;

  return {
    conversations: input.conversations.conversations.map(conversationViewModel),
    extraction: extractionViewModel(input.extraction),
    primaryAssist,
    privacy: privacyViewModel(input.privacy),
    relationshipContext: relationshipContextViewModel(input.thread),
    selectedConversation,
    summary: summaryViewModel(input.summary),
    threadMessages: input.thread.messages.map(threadMessageViewModel),
    threadSummary: productCopy(input.thread.summary),
  };
}

// 加载固定 route-state，用于测试 empty/pending/failure 分支和恢复路径。
export async function loadAppChatRouteStateViewModel(
  scenario: AppChatRouteScenario,
  services: AppChatRouteServices = createAppChatRouteServices(),
): Promise<AppChatRouteStateViewModel> {
  const conversationResult = await resolveChatResult(
    services.conversationService.listConversations({
      scenario,
    }),
  );

  // An empty conversation list has no valid child identity to query. Returning
  // from the authoritative list result avoids probing the live actor store with
  // the synthetic demo id below and misclassifying a new account as "not found".
  if (
    scenario === "empty" &&
    conversationResult.success &&
    conversationResult.data.conversations.length === 0
  ) {
    return {
      copy: stateCopy("empty"),
      errorCode: null,
      evidenceIds: uniqueEvidenceIds([conversationResult]),
      scenario: "empty",
    };
  }

  const threadResult = await resolveChatResult(
    services.conversationService.getMessageThread({
      conversationId: "demo-conversation-1",
      scenario,
    }),
  );
  const assistResult = await resolveChatResult(
    services.writingAssistService.draftFollowup({
      conversationId: "demo-conversation-1",
      scenario,
    }),
  );
  const summaryResult = await resolveChatResult(
    services.summaryExtractionService.summarizeConversation({
      conversationId: "demo-conversation-1",
      scenario,
    }),
  );
  const extractionResult = await resolveChatResult(
    services.summaryExtractionService.extractConversationSignals({
      conversationId: "demo-conversation-1",
      scenario,
    }),
  );
  const privacyResult = await resolveChatResult(
    services.privacyControlsService.getPrivacyControls({
      scenario,
    }),
  );
  const results: ChatRouteResult[] = [
    conversationResult,
    threadResult,
    assistResult,
    summaryResult,
    extractionResult,
    privacyResult,
  ];

  return {
    copy: stateCopy(scenario),
    errorCode: firstFailure(results)?.error.code ?? null,
    evidenceIds: uniqueEvidenceIds(results),
    scenario,
  };
}

// 主加载函数：先处理显式内部 scenario，再读取 conversation/thread/assist/summary/privacy。
export async function loadAppChatRouteViewModel(
  searchParams?: AppChatSearchParams,
  context: AppChatRouteRequestContext = {},
  controls: AppChatRouteControls = {},
): Promise<AppChatRouteViewModel> {
  const requestedScenario = controls.scenario;
  const actorId = context.actorId?.trim() || null;
  const services = actorId
    ? createActorScopedAppChatRouteServices(actorId)
    : createAppChatRouteServices();

  if (requestedScenario) {
    return {
      routeState: await loadAppChatRouteStateViewModel(
        requestedScenario,
        services,
      ),
      state: "route-state",
    };
  }

  const conversationsResult = await resolveChatResult(
    services.conversationService.listConversations(),
  );

  if (conversationsResult.success === false) {
    return {
      routeState: await loadAppChatRouteStateViewModel("failure", services),
      state: "route-state",
    };
  }

  const requestedConversationId = (
    readAppChatSearchParam(searchParams, "conversation") ??
    readAppChatSearchParam(searchParams, "conversationId")
  )?.trim();
  const conversation = requestedConversationId
    ? conversationsResult.data.conversations.find(
        (candidate) =>
          candidate.conversationId === requestedConversationId,
      )
    : conversationsResult.data.conversations[0];

  if (!conversation) {
    if (requestedConversationId) {
      return {
        routeState: missingConversationRouteState(
          conversationsResult.data.provenance.evidenceIds,
        ),
        state: "route-state",
      };
    }

    return {
      routeState: await loadAppChatRouteStateViewModel("empty", services),
      state: "route-state",
    };
  }

  // These five reads only depend on the selected conversation id and are
  // otherwise independent. Run them concurrently: in live mode each is a
  // separate store round-trip, so sequencing them stacked latency into the
  // 6–14s page opens. Behaviour is unchanged — same results, same failure
  // handling below.
  const [
    threadResult,
    assistResult,
    summaryResult,
    extractionResult,
    privacyResult,
  ] = await Promise.all([
    resolveChatResult(
      services.conversationService.getMessageThread({
        conversationId: conversation.conversationId,
      }),
    ),
    resolveChatResult(
      services.writingAssistService.draftFollowup({
        contextNote: conversation.oneToOneContext.recommendedFollowup,
        conversationId: conversation.conversationId,
        organization: conversation.organization,
        participantName: conversation.participantName,
      }),
    ),
    resolveChatResult(
      services.summaryExtractionService.summarizeConversation({
        conversationId: conversation.conversationId,
      }),
    ),
    resolveChatResult(
      services.summaryExtractionService.extractConversationSignals({
        conversationId: conversation.conversationId,
      }),
    ),
    resolveChatResult(services.privacyControlsService.getPrivacyControls()),
  ]);
  const results: ChatRouteResult[] = [
    conversationsResult,
    threadResult,
    assistResult,
    summaryResult,
    extractionResult,
    privacyResult,
  ];

  if (firstFailure(results)) {
    return {
      routeState: await loadAppChatRouteStateViewModel("failure", services),
      state: "route-state",
    };
  }

  if (
    threadResult.success === false ||
    assistResult.success === false ||
    summaryResult.success === false ||
    extractionResult.success === false ||
    privacyResult.success === false
  ) {
    return {
      routeState: await loadAppChatRouteStateViewModel("failure", services),
      state: "route-state",
    };
  }

  return {
    state: "success",
    workspace: workspaceViewModel({
      assist: assistResult.data,
      conversations: conversationsResult.data,
      extraction: extractionResult.data,
      privacy: privacyResult.data,
      summary: summaryResult.data,
      thread: threadResult.data,
    }),
  };
}
