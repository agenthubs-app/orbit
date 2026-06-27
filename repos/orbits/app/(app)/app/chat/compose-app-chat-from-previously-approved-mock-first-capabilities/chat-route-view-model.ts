import type {
  ChatConversationListPayload,
  ChatConversationListResult,
  ChatConversationStatus,
  ChatMessageThreadPayload,
  ChatMessageThreadResult,
  ChatSendMessagePayload,
  ChatSendMessageResult,
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
import { createAppChatRouteServices } from "./chat-service-factory";

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

export function readAppChatSearchParam(
  searchParams: AppChatSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function readAppChatRouteScenario(
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

function evidenceIdsForResult(result: ChatRouteResult): readonly string[] {
  if (isRouteStateSuccess(result)) {
    return result.data.provenance.evidenceIds;
  }

  if (isRouteStateFailure(result)) {
    return result.error.evidenceIds;
  }

  return [];
}

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

function readAgentPrompt(
  searchParams: AppChatSearchParams | undefined,
): string | null {
  const prompt = readAppChatSearchParam(searchParams, "prompt");

  return prompt && prompt.trim() ? prompt.trim() : null;
}

function agentTurnViewModel(
  prompt: string | null,
): AppChatAgentTurnViewModel | null {
  if (!prompt) {
    return null;
  }

  const orbitAgentService = createOrbitAgentConversationService();
  const result = orbitAgentService.sendMessage({ message: prompt });

  if (result.success === false) {
    return null;
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

export function loadAppChatRouteStateViewModel(
  scenario: AppChatRouteScenario,
): AppChatRouteStateViewModel {
  const services = createAppChatRouteServices();
  const conversationResult = services.conversationService.listConversations({
    scenario,
  });
  const threadResult = services.conversationService.getMessageThread({
    conversationId: "demo-conversation-1",
    scenario,
  });
  const assistResult = services.writingAssistService.draftFollowup({
    conversationId: "demo-conversation-1",
    scenario,
  });
  const summaryResult =
    services.summaryExtractionService.summarizeConversation({
      conversationId: "demo-conversation-1",
      scenario,
    });
  const extractionResult =
    services.summaryExtractionService.extractConversationSignals({
      conversationId: "demo-conversation-1",
      scenario,
    });
  const privacyResult = services.privacyControlsService.getPrivacyControls({
    scenario,
  });
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

export function loadAppChatRouteViewModel(
  searchParams?: AppChatSearchParams,
): AppChatRouteViewModel {
  const requestedScenario = readAppChatRouteScenario(searchParams);

  if (requestedScenario) {
    return {
      routeState: loadAppChatRouteStateViewModel(requestedScenario),
      state: "route-state",
    };
  }

  const services = createAppChatRouteServices();
  const conversationsResult = services.conversationService.listConversations();

  if (conversationsResult.success === false) {
    return {
      routeState: loadAppChatRouteStateViewModel("failure"),
      state: "route-state",
    };
  }

  const conversation = conversationsResult.data.conversations[0];

  if (!conversation) {
    return {
      routeState: loadAppChatRouteStateViewModel("empty"),
      state: "route-state",
    };
  }

  const threadResult = services.conversationService.getMessageThread({
    conversationId: conversation.conversationId,
  });
  const assistResult = services.writingAssistService.draftFollowup({
    contextNote: conversation.oneToOneContext.recommendedFollowup,
    conversationId: conversation.conversationId,
    organization: conversation.organization,
    participantName: conversation.participantName,
  });
  const summaryResult = services.summaryExtractionService.summarizeConversation({
    conversationId: conversation.conversationId,
  });
  const extractionResult =
    services.summaryExtractionService.extractConversationSignals({
      conversationId: conversation.conversationId,
    });
  const privacyResult = services.privacyControlsService.getPrivacyControls();
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
      routeState: loadAppChatRouteStateViewModel("failure"),
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
      routeState: loadAppChatRouteStateViewModel("failure"),
      state: "route-state",
    };
  }

  const action = readAppChatSearchParam(searchParams, "action");
  const agentTurn = agentTurnViewModel(readAgentPrompt(searchParams));
  const selectedAssist = assistResult.data.assists[0];
  const sendResult =
    action === "record-local-reply"
      ? services.conversationService.sendMessage({
          body:
            selectedAssist?.suggestedText ??
            conversation.oneToOneContext.recommendedFollowup,
          conversationId: conversation.conversationId,
        })
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
