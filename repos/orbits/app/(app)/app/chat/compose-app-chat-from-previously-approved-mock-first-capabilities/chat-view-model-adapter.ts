import type {
  OrbitAgentEventResultView,
  OrbitAgentPeopleResultView,
  OrbitAgentViewModel,
} from "../../orbit-agent-route-view-model";
import type { AppChatRouteViewModel } from "./chat-route-view-model";

type AppChatSuccessRouteViewModel = Extract<
  AppChatRouteViewModel,
  { state: "success" }
>;

function initialFor(value: string): string {
  return value.trim().slice(0, 1).toUpperCase() || "O";
}

function conversationPeopleItem(
  model: AppChatSuccessRouteViewModel,
): OrbitAgentPeopleResultView {
  const workspace = model.workspace;
  const conversation = workspace.selectedConversation;
  const context = workspace.relationshipContext;

  return {
    connection: {
      company: conversation.organization || context.organization,
      displayName: conversation.participantName,
      g: "g-indigo",
      id: conversation.conversationId,
      industry: context.latestContext || workspace.threadSummary,
      initial: initialFor(conversation.participantName),
      pipelineStatus: "in_progress",
      title: context.relationshipReason || conversation.title,
    },
    match: 88,
    opener:
      workspace.primaryAssist?.suggestedText ??
      context.recommendedFollowup ??
      "Review the conversation context before sending the next follow-up.",
    reason:
      context.relationshipReason ||
      workspace.threadSummary ||
      "This conversation has source-backed relationship context.",
  };
}

function eventPlaceholder(model: AppChatSuccessRouteViewModel): OrbitAgentEventResultView[] {
  const context = model.workspace.relationshipContext;

  return [
    {
      event: {
        code: "chat-followup-context",
        g: "g-sky",
        id: "chat-followup-context",
        name: "Conversation follow-up context",
        place: context.organization || "Orbit",
        startsAt: new Date().toISOString(),
      },
      howto:
        "Use the conversation summary and privacy controls before expanding this relationship through events.",
      reason: context.recommendedFollowup || model.workspace.threadSummary,
      score: 76,
    },
  ];
}

export function chatRouteToOrbitAgentViewModel(
  model: AppChatSuccessRouteViewModel,
): OrbitAgentViewModel {
  const workspace = model.workspace;
  const conversation = workspace.selectedConversation;
  const participant = conversation.participantName;
  const organization = conversation.organization;
  const recommendedFollowup = workspace.relationshipContext.recommendedFollowup;
  const primaryAssist = workspace.primaryAssist?.suggestedText;
  const peopleItem = conversationPeopleItem(model);
  const eventItems = eventPlaceholder(model);
  const followupQuery = `帮我根据与 ${participant} 的对话准备下一步跟进。`;
  const rewriteQuery = primaryAssist
    ? `请帮我润色这条给 ${participant} 的跟进消息：${primaryAssist}`
    : `请帮我给 ${participant} 写一条简短跟进。`;
  const contextQuery = `总结我和 ${participant} (${organization}) 的关系上下文。`;

  return {
    history: workspace.conversations.slice(0, 8).map((item, index) => ({
      group: index < 3 ? "关系聊天" : "更早",
      id: item.conversationId,
      q: `总结我和 ${item.participantName} (${item.organization}) 的关系上下文。`,
      title: `${item.participantName} · ${item.organization}`,
      when: item.statusLabel,
    })),
    scenarios: {
      events: {
        intro:
          "这些建议来自当前聊天摘要、隐私状态和关系跟进上下文。",
        items: eventItems,
        kind: "events",
        panelTitle: "可继续拓展的上下文",
        q: contextQuery,
      },
      people: {
        intro:
          recommendedFollowup ||
          "这条聊天记录已经汇总为可复核的关系上下文。",
        items: [peopleItem],
        kind: "people",
        panelTitle: `当前聊天关系 · ${participant}`,
        q: followupQuery,
      },
      peopleToEvents: {
        intro:
          "如果当前对话需要更多关系触点，先围绕来源摘要和隐私设置判断下一步。",
        items: eventItems,
        kind: "events",
        panelTitle: "从聊天延伸到下一步",
        q: rewriteQuery,
      },
    },
    suggests: [
      { icon: "message", label: "生成跟进消息", q: followupQuery },
      { icon: "edit", label: "润色当前回复", q: rewriteQuery },
      { icon: "sparkle", label: "总结关系上下文", q: contextQuery },
    ],
  };
}
