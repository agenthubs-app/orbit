/**
 * Agent 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable Orbit AI 聊天入口挂到 `/app/agent`。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StateView } from "../../../../shared/ui/state-view";
import {
  loadAppChatRouteViewModel,
  type AppChatRouteStateViewModel,
  type AppChatSearchParams,
} from "../chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";
import { chatRouteToOrbitAgentViewModel } from "../chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter";
import {
  OrbitRealAgent,
  type OrbitAgentProactiveContextViewModel,
} from "./orbit-real-agent";
import { createOrbitAgentConversationPreviewService } from "../../../../features/orbit-ai/conversation-preview-service";
import {
  createOrbitAiCalendarActionService,
} from "../../../../features/orbit-ai/service-factory";
import {
  type OrbitAiCalendarActionPreview,
} from "../../../../features/orbit-ai/calendar-action-service";
import {
  localizeOrbitAiPanelCalendarActionPreview,
  localizeOrbitAiPanelPayload,
  localizeOrbitAiPanelProactiveContext,
  localizeOrbitAiPanelText,
} from "../../../../features/orbit-ai/panel-localization";
import {
  findOrbitAiProactiveCalendarConversationForApp,
} from "../../../../features/orbit-ai/proactive-calendar-service";
import type {
  OrbitAiProactiveCalendarConversation,
} from "../../../../features/orbit-ai/proactive-contract";

export type AppAgentSearchParams = AppChatSearchParams;

async function getAgentPageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return "zh";
    }

    throw error;
  }
}

function AgentRouteStateBoundary({
  routeState,
}: {
  routeState: AppChatRouteStateViewModel;
}) {
  return (
    <main
      className="orbit-page"
      data-orbit-route="app-agent-route-state"
      style={{ background: "var(--bg)", minHeight: "100dvh", padding: 24 }}
    >
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow="Orbit AI"
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={[
          {
            href: "/app/agent",
            id: "agent-recovery-reload",
            label: "Reload Orbit AI",
            recoveryCopy: routeState.copy.nextStep,
          },
          {
            href: "/app/chat",
            id: "agent-recovery-chat",
            label: "Open chat workspace",
            recoveryCopy:
              "Use the Chat workspace to review conversation records and privacy controls directly.",
          },
        ]}
        title={routeState.copy.title}
      />
    </main>
  );
}

function firstSearchParam(
  searchParams: AppAgentSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];
  const first = Array.isArray(value) ? value[0] : value;

  return typeof first === "string" && first.trim() ? first.trim() : null;
}

function languageSearchParam(
  searchParams: AppAgentSearchParams | undefined,
): OrbitLanguage | null {
  const value = firstSearchParam(searchParams, "lang");

  return value === "en" || value === "zh" ? value : null;
}

function calendarActionPreviewGoal(language: OrbitLanguage): string {
  return language === "en"
    ? "Recommend events where I can meet investors for seed fundraising and founder feedback."
    : "推荐适合见投资人、获得种子轮融资反馈的活动。";
}

function proactiveConversationData(
  conversation: OrbitAiProactiveCalendarConversation,
  language: OrbitLanguage,
) {
  return localizeOrbitAiPanelPayload({
    artifacts: [],
    assistantMessage: conversation.firstAssistantResponse,
    messages: [
      {
        content: localizeOrbitAiPanelText(conversation.initialPrompt, language),
        conversationId: conversation.conversationId,
        createdAt: "2026-07-08T09:00:00.000Z",
        evidenceIds: ["evidence:orbit-ai-proactive-calendar-route"],
        messageId: `${conversation.sourceMessageId}:user`,
        role: "user",
      },
      {
        content: localizeOrbitAiPanelText(
          conversation.firstAssistantResponse,
          language,
        ),
        conversationId: conversation.conversationId,
        createdAt: "2026-07-08T09:00:01.000Z",
        evidenceIds: ["evidence:orbit-ai-proactive-calendar-route"],
        messageId: `${conversation.sourceMessageId}:assistant`,
        role: "assistant",
      },
    ],
    nextAction:
      language === "en"
        ? "Review the calendar activity context in Orbit AI before taking any external action."
        : "先在 Orbit AI 中复核这次日历活动上下文，再决定是否采取外部动作。",
    proposedToolIntents: [],
    provenance: {
      evidenceIds: ["evidence:orbit-ai-proactive-calendar-route"],
      safety: {
        calendarProviderRequested: false,
        emailProviderRequested: false,
        externalNetworkRequested: false,
        externalSideEffectsExecuted: false,
        notificationDelivered: false,
      },
      sourceLabel:
        language === "en"
          ? "Proactive reminder · local calendar activity"
          : "主动提醒 · 本地日历活动",
    },
    routingDecision: {
      intent: "proactive_calendar_context",
      needsTool: false,
    },
  }, language);
}

function proactiveConversationContext(
  conversation: OrbitAiProactiveCalendarConversation,
  language: OrbitLanguage,
): OrbitAgentProactiveContextViewModel {
  return localizeOrbitAiPanelProactiveContext({
    activityTitle: conversation.activityTitle,
    peopleContext: conversation.peopleContext,
    preparationPrompt: conversation.preparationPrompt,
    relationshipContext: conversation.relationshipContext,
    sourceLabel: conversation.sourceLabel,
    sourceMessageId: conversation.sourceMessageId,
    timeLabel: conversation.timeLabel,
  }, language);
}

export default async function AppAgentPage({
  searchParams,
}: {
  searchParams?: Promise<AppAgentSearchParams>;
} = {}) {
  const resolvedSearchParams = await searchParams;
  const requestedLanguage = languageSearchParam(resolvedSearchParams);
  const routeModel = await loadAppChatRouteViewModel(resolvedSearchParams);
  const language =
    routeModel.state === "success"
      ? requestedLanguage ?? await getAgentPageLanguage()
      : "zh";
  const proactiveConversation =
    routeModel.state === "success"
      ? findOrbitAiProactiveCalendarConversationForApp(
          firstSearchParam(resolvedSearchParams, "proactive"),
        )
      : null;
  const calendarPreviewRequested =
    firstSearchParam(resolvedSearchParams, "action") === "calendar-preview";
  const initialSubmittedGoal =
    (proactiveConversation
      ? localizeOrbitAiPanelText(proactiveConversation.initialPrompt, language)
      : null) ??
    firstSearchParam(resolvedSearchParams, "q") ??
    (calendarPreviewRequested ? calendarActionPreviewGoal(language) : null);
  const initialConversationResult =
    routeModel.state === "success" && initialSubmittedGoal && !proactiveConversation
      ? await createOrbitAgentConversationPreviewService().sendMessage({
          locale: language,
          message: initialSubmittedGoal,
        })
      : null;
  const initialConversationData =
    proactiveConversation
      ? proactiveConversationData(proactiveConversation, language)
      : (initialConversationResult?.success === true
          ? localizeOrbitAiPanelPayload(initialConversationResult.data, language)
          : null);
  const initialCalendarActionPreviews: readonly OrbitAiCalendarActionPreview[] =
    initialConversationData && calendarPreviewRequested
      ? createOrbitAiCalendarActionService().createPreviews({
          conversation: initialConversationData,
          locale: language,
        }).data.previews.map((preview) =>
          localizeOrbitAiPanelCalendarActionPreview(preview, language),
        )
      : [];

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-agent-route">
          <OrbitRealAgent
            initialCalendarActionPreviews={initialCalendarActionPreviews}
            initialConversationData={initialConversationData}
            initialProactiveContext={
              proactiveConversation
                ? proactiveConversationContext(proactiveConversation, language)
                : null
            }
            initialSubmittedGoal={initialSubmittedGoal}
            viewModel={localizeOrbitTree(
              chatRouteToOrbitAgentViewModel(routeModel),
              language,
            )}
          />
        </div>
      ) : (
        <AgentRouteStateBoundary routeState={routeModel.routeState} />
      )}
    </>
  );
}
