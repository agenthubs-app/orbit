import type {
  ChatConversationListPayload,
  ChatConversationListResult,
  ChatConversationStatus,
  ChatMessageThreadPayload,
  ChatMessageThreadResult,
  ChatSendMessagePayload,
  ChatSendMessageResult,
  AsyncConversationFailure,
  AsyncConversationStagePayload,
  AsyncConversationWorkspacePayload,
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
  selectPrimaryOrbitAgentArtifactSurface,
  type OrbitAgentArtifactSurfaceViewModel,
} from "../../../../../features/orbit-ai/artifact-view-model";
import { createOrbitAgentConversationService } from "../../../../../features/orbit-ai/service-factory";
import {
  loadOrbitAiProactiveCalendarMessagesForApp,
} from "../../../../../features/orbit-ai/proactive-calendar-service";
import { createAsyncRelationshipConversationService } from "../../../../../features/chat/service-factory";
import { createAppChatRouteServices } from "./chat-service-factory";

// Chat route view-model 是传统 chat 页的总装层。
// 它同时读取 chat、writing assist、summary、privacy 和 Orbit Agent conversation service，
// 再把多个 feature contract 合并成一个页面可渲染的 workspace。
export type AppChatSearchParams = Record<string, string | string[] | undefined>;
export type AppChatRouteScenario = "empty" | "pending" | "failure";

type ChatRouteResult =
  | ChatConversationListResult
  | ChatMessageThreadResult
  | ChatSendMessageResult
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

export interface AppChatActionResultViewModel {
  messageBody: string;
  selectedConversationLabel: string;
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
  body: string | null;
  confidenceLabel: string | null;
  id: string;
  metadata: readonly AppChatAgentArtifactMetadataViewModel[];
  reason: string | null;
  subtitle: string | null;
  title: string;
  actions: readonly AppChatAgentArtifactActionViewModel[];
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

export interface AppChatAgentTurnViewModel {
  artifactSurface: AppChatAgentArtifactSurfaceViewModel | null;
  assistantMessage: string;
  prompt: string;
  proposedToolLabels: readonly string[];
}

export interface AppChatWorkspaceViewModel {
  actionResult: AppChatActionResultViewModel | null;
  agentTurn: AppChatAgentTurnViewModel | null;
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

// scenario 只服务状态演示/测试；正常页面不带 scenario 时走成功工作区。
function readAppChatRouteScenario(
  searchParams: AppChatSearchParams | undefined,
): AppChatRouteScenario | null {
  const scenario = readAppChatSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
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

function actionResultViewModel(input: {
  conversation: AppChatConversationViewModel;
  result: ChatSendMessagePayload | null;
}): AppChatActionResultViewModel | null {
  if (!input.result) {
    return null;
  }

  return {
    messageBody: input.result.message.body,
    selectedConversationLabel: `${input.conversation.participantName} at ${input.conversation.organization}`,
  };
}

// artifact surface 来自 Orbit Agent artifact view-model；这里只做 UI 字段透传和重命名。
function agentArtifactSurfaceViewModel(
  surface: OrbitAgentArtifactSurfaceViewModel | null,
): AppChatAgentArtifactSurfaceViewModel | null {
  if (!surface) {
    return null;
  }

  return {
    artifactId: surface.artifactId,
    evidenceIds: surface.evidenceIds,
    kind: surface.kind,
    nextAction: surface.nextAction,
    sections: surface.sections.map((section) => ({
      body: section.body,
      items: section.items.map((item) => ({
        actions: item.actions.map((action) => ({
          id: action.id,
          label: action.label,
          requiresConfirmation: action.requiresConfirmation,
        })),
        body: item.body,
        confidenceLabel: item.confidenceLabel,
        id: item.id,
        metadata: item.metadata.map((metadata) => ({
          label: metadata.label,
          value: metadata.value,
        })),
        reason: item.reason,
        subtitle: item.subtitle,
        title: item.title,
      })),
      title: section.title,
    })),
    sourceModules: surface.sourceModules,
    subtitle: surface.subtitle,
    summary: surface.summary,
    surface: surface.surface,
    title: surface.title,
  };
}

// prompt 存在时才触发 Orbit Agent；不带 prompt 的普通 chat 页面不会调用 agent。
function readAgentPrompt(
  searchParams: AppChatSearchParams | undefined,
): string | null {
  const prompt = readAppChatSearchParam(searchParams, "prompt");

  return prompt && prompt.trim() ? prompt.trim() : null;
}

// agentTurnViewModel 是 chat 页接入 Chat Agent API 的位置。
// 服务具体走 mock 还是 live 由 ORBIT_AGENT_CONVERSATION_MODE/.env 决定，UI 只消费 contract。
async function agentTurnViewModel(
  prompt: string | null,
): Promise<AppChatAgentTurnViewModel | null> {
  if (!prompt) {
    return null;
  }

  const orbitAgentService = createOrbitAgentConversationService();
  const result = await orbitAgentService.sendMessage({ message: prompt });

  if (result.success === false) {
    return {
      artifactSurface: null,
      assistantMessage: `Agent 暂时无法完成这次回复：${result.error.message}`,
      prompt,
      proposedToolLabels: [],
    };
  }

  return {
    artifactSurface: agentArtifactSurfaceViewModel(
      selectPrimaryOrbitAgentArtifactSurface(result.data.artifacts),
    ),
    assistantMessage: result.data.assistantMessage,
    prompt,
    proposedToolLabels: result.data.proposedToolIntents.map(
      (intent) => intent.label,
    ),
  };
}

// workspaceViewModel 把多个成功 payload 合成一个页面工作区。
function workspaceViewModel(input: {
  actionResult: ChatSendMessagePayload | null;
  agentTurn: AppChatAgentTurnViewModel | null;
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
    actionResult: actionResultViewModel({
      conversation: selectedConversation,
      result: input.actionResult,
    }),
    agentTurn: input.agentTurn,
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
): Promise<AppChatRouteStateViewModel> {
  const services = createAppChatRouteServices();
  const conversationResult = await resolveChatResult(
    services.conversationService.listConversations({
      scenario,
    }),
  );
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

// 主加载函数：先处理 scenario，再读 conversation/thread/assist/summary/privacy，最后按需跑 agent。
export async function loadAppChatRouteViewModel(
  searchParams?: AppChatSearchParams,
): Promise<AppChatRouteViewModel> {
  const requestedScenario = readAppChatRouteScenario(searchParams);

  if (requestedScenario) {
    return {
      routeState: await loadAppChatRouteStateViewModel(requestedScenario),
      state: "route-state",
    };
  }

  const services = createAppChatRouteServices();
  const conversationsResult = await resolveChatResult(
    services.conversationService.listConversations(),
  );

  if (conversationsResult.success === false) {
    return {
      routeState: await loadAppChatRouteStateViewModel("failure"),
      state: "route-state",
    };
  }

  const conversation = conversationsResult.data.conversations[0];

  if (!conversation) {
    return {
      routeState: await loadAppChatRouteStateViewModel("empty"),
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
      routeState: await loadAppChatRouteStateViewModel("failure"),
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
      routeState: await loadAppChatRouteStateViewModel("failure"),
      state: "route-state",
    };
  }

  const action = readAppChatSearchParam(searchParams, "action");
  const agentTurn = await agentTurnViewModel(readAgentPrompt(searchParams));
  const selectedAssist = assistResult.data.assists[0];
  const sendResult =
    action === "record-local-reply"
      ? await resolveChatResult(
          services.conversationService.sendMessage({
            body:
              selectedAssist?.suggestedText ??
              conversation.oneToOneContext.recommendedFollowup,
            conversationId: conversation.conversationId,
          }),
        )
      : null;
  const actionResult =
    sendResult?.success === true ? sendResult.data : null;

  return {
    state: "success",
    workspace: workspaceViewModel({
      actionResult,
      agentTurn,
      assist: assistResult.data,
      conversations: conversationsResult.data,
      extraction: extractionResult.data,
      privacy: privacyResult.data,
      summary: summaryResult.data,
      thread: threadResult.data,
    }),
  };
}

export interface AppAsyncChatInboxItemViewModel {
  conversationId: string;
  href: string;
  isSelected: boolean;
  lastCorrespondenceLabel: string;
  nextActionLabel: string;
  organization: string;
  participantName: string;
  preview: string;
  sourceContextLabels: readonly string[];
  subject: string;
  unreadLabel: string;
}

export interface AppProactiveAgentInboxItemViewModel {
  href: string;
  messageId: string;
  peopleContext: string;
  preparationPrompt: string;
  sourceLabel: string;
  subject: string;
  timeLabel: string;
}

export interface AppAsyncChatMessageViewModel {
  body: string;
  messageId: string;
  senderLabel: string;
  sourceContextLabel: string;
  timestampLabel: string;
}

export interface AppAsyncChatContextItemViewModel {
  label: string;
  value: string;
}

export interface AppAsyncChatNextActionViewModel {
  description: string;
  href: string;
  sourceContextLabel: string;
  title: string;
}

export interface AppAsyncChatStageViewModel {
  calendarLabel: string;
  networkLabel: string;
  noSideEffectStatement: string;
  previewBody: string;
  sendLabel: string;
  status: string;
}

export interface AppAsyncChatDraftControlViewModel {
  action: string;
  label: string;
  sideEffectLabel: string;
}

export interface AppAsyncChatNoticeViewModel {
  calendarLabel: string;
  code: string;
  evidenceIds: readonly string[];
  message: string;
  networkLabel: string;
  recovery: string;
  sendLabel: string;
  title: string;
}

export interface AppAsyncChatCommandCenterViewModel {
  chatState: string;
  contextItems: readonly AppAsyncChatContextItemViewModel[];
  draftBody: string;
  draftControls: readonly AppAsyncChatDraftControlViewModel[];
  draftMeta: string;
  inbox: readonly AppAsyncChatInboxItemViewModel[];
  nextActions: readonly AppAsyncChatNextActionViewModel[];
  notice: AppAsyncChatNoticeViewModel | null;
  proactiveInbox: readonly AppProactiveAgentInboxItemViewModel[];
  scheduleItems: readonly AppAsyncChatContextItemViewModel[];
  selectedConversationId: string;
  selectedSubtitle: string;
  selectedTitle: string;
  sourceContextLabels: readonly string[];
  stage: AppAsyncChatStageViewModel | null;
  threadMessages: readonly AppAsyncChatMessageViewModel[];
  threadSummary: string;
}

function asyncShortTimestamp(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

function asyncInboxViewModel(
  workspace: AsyncConversationWorkspacePayload,
): readonly AppAsyncChatInboxItemViewModel[] {
  const selectedId = workspace.selectedThread.conversationId;

  return workspace.inbox.conversations.map((conversation) => ({
    conversationId: conversation.conversationId,
    href: `/app/chat?conversation=${conversation.conversationId}`,
    isSelected: conversation.conversationId === selectedId,
    lastCorrespondenceLabel: asyncShortTimestamp(conversation.lastCorrespondenceAt),
    nextActionLabel: conversation.nextActionLabel,
    organization: conversation.organization,
    participantName: conversation.participantName,
    preview: conversation.preview,
    sourceContextLabels: conversation.sourceContextLabels,
    subject: conversation.subject,
    unreadLabel:
      conversation.unreadCount > 0
        ? `${conversation.unreadCount} relationship signal`
        : "No unread signal",
  }));
}

function asyncProactiveInboxViewModel(): readonly AppProactiveAgentInboxItemViewModel[] {
  const result = loadOrbitAiProactiveCalendarMessagesForApp();

  return result.data.messages.map((message) => ({
    href: message.conversationHref,
    messageId: message.messageId,
    peopleContext: message.peopleContext,
    preparationPrompt: message.preparationPrompt,
    sourceLabel: message.sourceLabel,
    subject: message.subject.replace(/^Upcoming:\s*/, ""),
    timeLabel: message.timeLabel,
  }));
}

function asyncThreadMessagesViewModel(
  workspace: AsyncConversationWorkspacePayload,
): readonly AppAsyncChatMessageViewModel[] {
  return workspace.selectedThread.messages.map((message) => ({
    body: message.body,
    messageId: message.messageId,
    senderLabel:
      message.senderRole === "orbit_user"
        ? `You · ${message.senderName}`
        : `${message.senderName}`,
    sourceContextLabel: message.sourceContextLabel,
    timestampLabel: asyncShortTimestamp(message.occurredAt),
  }));
}

function asyncContextItemsViewModel(
  workspace: AsyncConversationWorkspacePayload,
): readonly AppAsyncChatContextItemViewModel[] {
  return [
    {
      label: "Contact",
      value: `${workspace.contact.displayName}, ${workspace.contact.role} at ${workspace.contact.organization}`,
    },
    {
      label: "Connection",
      value: workspace.connection.relationshipReason,
    },
    {
      label: "Event",
      value: `${workspace.event.name} · ${workspace.event.location}`,
    },
    {
      label: "Follow-up task",
      value: `${workspace.followUpTask.title} · ${workspace.followUpTask.dueLabel}`,
    },
  ];
}

function asyncScheduleItemsViewModel(
  workspace: AsyncConversationWorkspacePayload,
): readonly AppAsyncChatContextItemViewModel[] {
  return workspace.schedule.windows.map((window) => ({
    label: window.label,
    value: `${window.availabilityState.replaceAll("_", " ")} · ${window.sourceContextLabel}`,
  }));
}

function asyncNextActionsViewModel(
  workspace: AsyncConversationWorkspacePayload,
): readonly AppAsyncChatNextActionViewModel[] {
  return workspace.nextActions.map((action) => ({
    description: action.description,
    href: action.stageHref,
    sourceContextLabel: action.sourceContextLabel,
    title: action.title,
  }));
}

function asyncDraftControlsViewModel(): readonly AppAsyncChatDraftControlViewModel[] {
  return [
    {
      action: "edit-draft",
      label: "Edit draft",
      sideEffectLabel: "Local text only",
    },
    {
      action: "copy-reply",
      label: "Copy reply",
      sideEffectLabel: "No message sent",
    },
    {
      action: "mark-reviewed",
      label: "Mark reviewed",
      sideEffectLabel: "No record saved",
    },
  ];
}

function asyncStageViewModel(
  stage: AsyncConversationStagePayload | null,
): AppAsyncChatStageViewModel | null {
  if (!stage) {
    return null;
  }

  return {
    calendarLabel: stage.sideEffects.calendarEntryCreated
      ? "Calendar entry: created"
      : "Calendar entry: not created",
    networkLabel: stage.sideEffects.networkRequestMade
      ? "Network: used"
      : "Network: not used",
    noSideEffectStatement: stage.stage.noSideEffectStatement,
    previewBody: stage.stage.previewBody,
    sendLabel: stage.sideEffects.externalMessageSent
      ? "External send: requested"
      : "External send: not requested",
    status: stage.stage.status,
  };
}

function asyncNoticeViewModel(
  failure: AsyncConversationFailure,
): AppAsyncChatNoticeViewModel {
  return {
    calendarLabel: "Calendar entry: not created",
    code: failure.error.code,
    evidenceIds: failure.error.evidenceIds,
    message: failure.error.message,
    networkLabel: "Network: not used",
    recovery: failure.error.recovery,
    sendLabel: "External send: not requested",
    title:
      failure.error.code === "ASYNC_CONVERSATION_NOT_FOUND"
        ? "Conversation not found"
        : "Action not found",
  };
}

function asyncCommandCenterViewModel(input: {
  notice: AppAsyncChatNoticeViewModel | null;
  stage: AsyncConversationStagePayload | null;
  workspace: AsyncConversationWorkspacePayload;
}): AppAsyncChatCommandCenterViewModel {
  const workspace = input.workspace;

  return {
    chatState: input.notice?.code ?? "ready",
    contextItems: asyncContextItemsViewModel(workspace),
    draftBody: workspace.draftReply.body,
    draftControls: asyncDraftControlsViewModel(),
    draftMeta: `${workspace.draftReply.tone} · ${workspace.draftReply.sourceContextLabel}`,
    inbox: asyncInboxViewModel(workspace),
    nextActions: asyncNextActionsViewModel(workspace),
    notice: input.notice,
    proactiveInbox: asyncProactiveInboxViewModel(),
    scheduleItems: asyncScheduleItemsViewModel(workspace),
    selectedConversationId: workspace.selectedThread.conversationId,
    selectedSubtitle: `${workspace.contact.organization} · ${workspace.selectedThread.subject}`,
    selectedTitle: workspace.contact.displayName,
    sourceContextLabels: workspace.selectedThread.sourceContextLabels,
    stage: asyncStageViewModel(input.stage),
    threadMessages: asyncThreadMessagesViewModel(workspace),
    threadSummary: workspace.selectedThread.summary,
  };
}

export async function loadAppAsyncChatCommandCenterViewModel(
  searchParams?: AppChatSearchParams,
): Promise<AppAsyncChatCommandCenterViewModel> {
  const conversationId = readAppChatSearchParam(searchParams, "conversation");
  const action = readAppChatSearchParam(searchParams, "action");
  const service = createAsyncRelationshipConversationService("mock");
  const workspaceResult = await resolveChatResult(
    service.getCorrespondenceWorkspace({
      conversationId,
      userId: "test-user-orbit",
    }),
  );
  const requestedConversationFound = workspaceResult.success === true;
  const fallbackWorkspaceResult =
    workspaceResult.success === true
      ? workspaceResult
      : await resolveChatResult(
          service.getCorrespondenceWorkspace({
            userId: "test-user-orbit",
          }),
        );

  if (fallbackWorkspaceResult.success === false) {
    throw new Error(fallbackWorkspaceResult.error.message);
  }

  const notice =
    workspaceResult.success === false
      ? asyncNoticeViewModel(workspaceResult)
      : null;
  const stageResult =
    action === "stage-reply" && requestedConversationFound
      ? await resolveChatResult(
          service.stageConversationAction({
            actionId: fallbackWorkspaceResult.data.nextActions[0]?.actionId ?? null,
            conversationId: fallbackWorkspaceResult.data.selectedThread.conversationId,
            userId: fallbackWorkspaceResult.data.currentUser.userId,
          }),
        )
      : null;
  const stage = stageResult?.success === true ? stageResult.data : null;
  const stageNotice =
    stageResult?.success === false ? asyncNoticeViewModel(stageResult) : null;

  return asyncCommandCenterViewModel({
    notice: notice ?? stageNotice,
    stage,
    workspace: fallbackWorkspaceResult.data,
  });
}
