export interface ConversationSummary {
  id: string;
  preview: string;
  title: string;
}

export interface ChatMessageView {
  content: string;
  createdAt: string;
  id: string;
  role: string;
}

export type MarkdownInlineKind = "code" | "strong" | "text";
export type MarkdownBlockKind = "listItem" | "paragraph";

export interface MarkdownInlineView {
  kind: MarkdownInlineKind;
  text: string;
}

export interface MarkdownBlockView {
  kind: MarkdownBlockKind;
  segments: MarkdownInlineView[];
}

export interface ProposedToolIntentView {
  id: string;
  label: string;
  reason: string;
  requiresUserConfirmation: boolean;
}

export interface ConversationChatView {
  activeConversationId: string | null;
  assistantMessage: string;
  messages: ChatMessageView[];
  proposedToolIntents: ProposedToolIntentView[];
}

export interface OrbitAiHomeChatWindow extends ConversationChatView {
  isEmpty: boolean;
}

export interface ConversationThreadView extends ConversationChatView {
  nextAction: string;
  title: string;
}

export type ConversationInlinePanelKind =
  | "events"
  | "followups"
  | "people"
  | "profile"
  | "schedule";

export interface ConversationInlinePanelView {
  actionHref: "/contacts" | "/events" | "/followups" | "/profile" | "/schedule";
  actionLabel: string;
  detail: string;
  kind: ConversationInlinePanelKind;
  title: string;
}

export interface ConversationQuickRouteView {
  detail: string;
  href: "/contacts" | "/events" | "/followups" | "/profile" | "/schedule";
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function containsImplementationLabel(value: string): boolean {
  return /\b(live|mock|hybrid|fixture|provider|providers|payload|source-backed|command-center|command center|natural-language request)\b/i.test(
    value
  );
}

function normalizeOrbitAiName(value: string): string {
  return value.replace(/\bOrbit Agent\b/g, "Orbit AI");
}

function conversationTitle(value: string): string {
  const title = normalizeOrbitAiName(value);
  return title && !containsImplementationLabel(title)
    ? title
    : "Orbit AI 对话";
}

function conversationPreview(value: string): string {
  const preview = normalizeOrbitAiName(value);

  if (!preview || containsImplementationLabel(preview)) {
    return "问一个具体问题，Orbit AI 会把相关人脉和下一步整理出来。";
  }

  return preview;
}

function assistantMessageContent(value: string): string {
  const content = normalizeOrbitAiName(value);

  if (!content) {
    return "";
  }

  if (containsImplementationLabel(content)) {
    return "把问题发过来。我会按人脉、活动和跟进记录来答。";
  }

  return content;
}

function chatMessageContent(role: string, value: string): string {
  if (role === "assistant") {
    return assistantMessageContent(value);
  }

  return normalizeOrbitAiName(value);
}

function nextActionCopy(value: string): string {
  const nextAction = normalizeOrbitAiName(value);

  if (!nextAction || containsImplementationLabel(nextAction)) {
    return "继续问一个具体问题，Orbit AI 会先整理上下文，再给出下一步。";
  }

  return nextAction;
}

function listFromPayload(value: unknown, fieldName: string): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const field = value[fieldName];
  return Array.isArray(field) ? field : [];
}

export function conversationsToSummaries(data: unknown): ConversationSummary[] {
  return listFromPayload(data, "conversations")
    .filter(isRecord)
    .map((conversation) => ({
      id: stringField(
        conversation,
        "conversationId",
        stringField(conversation, "id", "conversation")
      ),
      preview:
        conversationPreview(stringField(conversation, "lastMessagePreview")) ||
        conversationPreview(stringField(conversation, "preview")),
      title: conversationTitle(
        stringField(conversation, "title", "Orbit AI 对话")
      )
    }));
}

function booleanField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = false
): boolean {
  const value = record[fieldName];
  return typeof value === "boolean" ? value : fallback;
}

function actionRequiresConfirmation(action: Record<string, unknown>): boolean {
  return booleanField(
    action,
    "requiresUserConfirmation",
    booleanField(action, "requiresConfirmation", true)
  );
}

export function conversationPayloadToChatView(
  data: unknown
): ConversationChatView {
  const payload = isRecord(data) ? data : {};
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const proposedToolIntents = Array.isArray(payload.proposedToolIntents)
    ? payload.proposedToolIntents
    : [];
  const activeConversationId = stringField(payload, "activeConversationId");

  return {
    activeConversationId: activeConversationId || null,
    assistantMessage: assistantMessageContent(
      stringField(payload, "assistantMessage")
    ),
    messages: messages.filter(isRecord).map((message) => {
      const role = stringField(message, "role", "assistant");

      return {
        content: chatMessageContent(role, stringField(message, "content")),
        createdAt: stringField(message, "createdAt"),
        id: stringField(
          message,
          "messageId",
          stringField(message, "id", "message")
        ),
        role
      };
    }),
    proposedToolIntents: proposedToolIntents.filter(isRecord).map((intent) => ({
      id: stringField(intent, "intentId", stringField(intent, "id", "intent")),
      label: stringField(intent, "label", "Suggested action"),
      reason: stringField(intent, "reason"),
      requiresUserConfirmation: actionRequiresConfirmation(intent)
    }))
  };
}

export function orbitAiHomeChatWindow(
  data: unknown,
  latestChat: ConversationChatView | null = null
): OrbitAiHomeChatWindow {
  const chat = latestChat ?? conversationPayloadToChatView(data);
  const messages = chat.messages.length > 0
    ? chat.messages
    : chat.assistantMessage
      ? [
          {
            content: chat.assistantMessage,
            createdAt: "",
            id: "orbit-ai-home-assistant",
            role: "assistant"
          }
        ]
      : [];

  return {
    ...chat,
    isEmpty: messages.length === 0,
    messages
  };
}

export function pendingConversationThreadView(
  message: string
): ConversationThreadView {
  return {
    activeConversationId: null,
    assistantMessage: "",
    messages: [
      {
        content: message,
        createdAt: "",
        id: "pending-user-message",
        role: "user"
      },
      {
        content: "正在整理相关上下文。",
        createdAt: "",
        id: "pending-assistant-message",
        role: "assistant"
      }
    ],
    nextAction: "正在处理你的问题。",
    proposedToolIntents: [],
    title: "正在处理"
  };
}

function markdownSegmentsFor(value: string): MarkdownInlineView[] {
  const segments: MarkdownInlineView[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/gu;
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;

    if (index > cursor) {
      segments.push({
        kind: "text",
        text: value.slice(cursor, index)
      });
    }

    const token = match[0];

    if (token.startsWith("**")) {
      segments.push({
        kind: "strong",
        text: token.slice(2, -2)
      });
    } else if (token.startsWith("`")) {
      segments.push({
        kind: "code",
        text: token.slice(1, -1)
      });
    } else {
      const label = /^\[([^\]]+)\]\([^)]+\)$/u.exec(token)?.[1] ?? token;
      segments.push({
        kind: "text",
        text: label
      });
    }

    cursor = index + token.length;
  }

  if (cursor < value.length) {
    segments.push({
      kind: "text",
      text: value.slice(cursor)
    });
  }

  return segments.filter((segment) => segment.text.length > 0);
}

export function markdownBlocksFor(content: string): MarkdownBlockView[] {
  return content
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const listMatch = /^[-*]\s+(.+)$/u.exec(line);
      const body = listMatch?.[1] ?? line.replace(/^#{1,3}\s+/u, "");

      return {
        kind: listMatch ? "listItem" : "paragraph",
        segments: markdownSegmentsFor(body)
      };
    });
}

function threadSearchText(thread: ConversationThreadView): string {
  const latestUserMessage = [...thread.messages]
    .reverse()
    .find((message) => message.role === "user");
  const messages = latestUserMessage
    ? [latestUserMessage.content]
    : thread.messages.map((message) => message.content);

  return messages.join(" ").toLowerCase();
}

export function conversationInlinePanelsForThread(
  thread: ConversationThreadView
): ConversationInlinePanelView[] {
  const searchText = threadSearchText(thread);

  if (
    /跟进|回访|follow|followup|follow-up|提醒|优先级|待处理|下一步/iu.test(
      searchText
    )
  ) {
    return [
      {
        actionHref: "/followups",
        actionLabel: "查看全部跟进",
        detail: "根据你的问题，先把今天需要复核的跟进事项放在对话里。",
        kind: "followups",
        title: "待跟进"
      }
    ];
  }

  if (
    /人脉|联系人|介绍|引荐|见谁|认识谁|people|person|contact|contacts|intro|introduce/iu.test(
      searchText
    )
  ) {
    return [
      {
        actionHref: "/contacts",
        actionLabel: "查看全部人脉",
        detail: "根据你的问题，先把值得查看和适合推进的人放在对话里。",
        kind: "people",
        title: "相关人脉"
      }
    ];
  }

  if (
    /活动|参加|报名|会议|交流会|event|events|meetup|conference|attend/iu.test(
      searchText
    )
  ) {
    return [
      {
        actionHref: "/events",
        actionLabel: "查看全部活动",
        detail: "根据你的问题，先把可参加和需要准备的活动放在对话里。",
        kind: "events",
        title: "相关活动"
      }
    ];
  }

  if (
    /日程|安排|约见|会面|几点|什么时候|calendar|schedule|meeting|appointment/iu.test(
      searchText
    )
  ) {
    return [
      {
        actionHref: "/schedule",
        actionLabel: "查看日程",
        detail: "根据你的问题，先把最近需要处理的时间和待办放在对话里。",
        kind: "schedule",
        title: "近日安排"
      }
    ];
  }

  if (
    /档案|个人主页|主页|自我介绍|别人看到|能提供什么|资源标签|profile|bio/iu.test(
      searchText
    )
  ) {
    return [
      {
        actionHref: "/profile",
        actionLabel: "完善档案",
        detail: "根据你的问题，先把别人会看到的自我介绍和资源标签放在对话里。",
        kind: "profile",
        title: "个人档案"
      }
    ];
  }

  return [];
}

export function conversationQuickRoutes(): ConversationQuickRouteView[] {
  return [
    {
      detail: "找活动、报名和会前准备",
      href: "/events",
      title: "活动"
    },
    {
      detail: "看联系人、关系和介绍机会",
      href: "/contacts",
      title: "人脉"
    },
    {
      detail: "处理今天该跟进的人",
      href: "/followups",
      title: "跟进"
    },
    {
      detail: "查看约见和待办时间",
      href: "/schedule",
      title: "日程"
    },
    {
      detail: "完善别人看到的介绍",
      href: "/profile",
      title: "档案"
    }
  ];
}

export function shouldSubmitInitialPrompt({
  initialPrompt,
  isDraftConversation,
  submittedPrompt
}: {
  initialPrompt: string;
  isDraftConversation: boolean;
  submittedPrompt: string | null;
}): boolean {
  return Boolean(
    isDraftConversation &&
      initialPrompt.trim() &&
      submittedPrompt !== initialPrompt.trim()
  );
}

export function conversationPayloadToThreadView(
  data: unknown
): ConversationThreadView {
  const payload = isRecord(data) ? data : {};
  const chat = conversationPayloadToChatView(payload);
  const activeConversationId = chat.activeConversationId;
  const conversation = conversationsToSummaries(payload).find(
    (summary) => summary.id === activeConversationId
  );

  return {
    ...chat,
    nextAction: nextActionCopy(stringField(payload, "nextAction")),
    title: conversation?.title ?? "Orbit AI 对话"
  };
}

export function proactiveTurnPayloadToChatView(
  data: unknown
): ConversationChatView {
  const payload = isRecord(data) ? data : {};
  const message = isRecord(payload.message) ? payload.message : {};
  const suggestedActions = Array.isArray(payload.suggestedActions)
    ? payload.suggestedActions
    : [];
  const content = stringField(message, "content");
  const conversationId = stringField(message, "conversationId");

  return {
    activeConversationId: conversationId || null,
    assistantMessage: content,
    messages: content
      ? [
          {
            content,
            createdAt: stringField(message, "createdAt"),
            id: stringField(
              message,
              "messageId",
              stringField(message, "id", "message")
            ),
            role: stringField(message, "role", "assistant")
          }
        ]
      : [],
    proposedToolIntents: suggestedActions.filter(isRecord).map((action) => ({
      id: stringField(action, "actionId", stringField(action, "id", "action")),
      label: stringField(action, "label", "Suggested action"),
      reason: stringField(action, "reason", "Suggested by Orbit AI."),
      requiresUserConfirmation: actionRequiresConfirmation(action)
    }))
  };
}
