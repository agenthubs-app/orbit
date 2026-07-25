import { aiRunPath } from "../api/endpoints";

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
  marker?: string;
  quote?: boolean;
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
  actionHref:
    | "/contacts/list"
    | "/events"
    | "/followups"
    | "/profile"
    | "/schedule";
  actionLabel: string;
  detail: string;
  kind: ConversationInlinePanelKind;
  title: string;
}

export interface ConversationQuickRouteView {
  detail: string;
  href:
    | "/contacts"
    | "/contacts/list"
    | "/events"
    | "/followups"
    | "/profile"
    | "/schedule";
  title: string;
}

export interface ConversationAiRunReferenceView {
  actionLabel: string;
  detail: string;
  id: string;
  title: string;
}

export interface ConversationContactCandidateView {
  id: string;
  name: string;
  nextAction?: string;
  organization?: string;
  relationship?: string;
  role?: string;
  status?: string;
  valueLabels?: readonly string[];
}

export interface ConversationEventCandidateView {
  actionLabel: string;
  id: string;
  location: string;
  participantCountLabel: string;
  startsAt: string;
  status: string;
  subtitle: string;
  title: string;
  topics: readonly string[];
}

export type AiRunDetailRequestResult =
  | {
      request: {
        path: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

export interface AiRunDetailView {
  metrics: string[];
  nextAction: string;
  outputPreview: string;
  safetyText: string;
  summary: string;
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

function nestedRecord(
  record: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function envelopeData(data: unknown): unknown {
  if (!isRecord(data)) {
    return data;
  }

  return data.success === true && "data" in data ? data.data : data;
}

function containsImplementationLabel(value: string): boolean {
  return /\b(live|mock|hybrid|fixture|provider|providers|payload|source-backed|command-center|command center|natural-language request)\b/i.test(
    value
  );
}

function normalizeOrbitAiName(value: string): string {
  return value.replace(/\bOrbit Agent\b/g, "Orbit AI");
}

function containsChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function userFacingChineseText(value: string, fallback: string): string {
  const text = normalizeOrbitAiName(value).trim();

  if (!text || containsImplementationLabel(text) || !containsChinese(text)) {
    return fallback;
  }

  return text;
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
    return "有什么需要我做的吗？找活动、准备会面、整理人脉，我可以先帮您梳理下一步。";
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

function listField(
  record: Record<string, unknown>,
  fieldName: string
): readonly unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function addRunId(runIds: Set<string>, value: string): void {
  const normalized = value.trim();

  if (normalized) {
    runIds.add(normalized);
  }
}

function addRunIdsFromText(runIds: Set<string>, value: string): void {
  for (const match of value.matchAll(/[A-Za-z0-9:_-]*ai-run[A-Za-z0-9:_-]*/giu)) {
    addRunId(runIds, match[0]);
  }
}

function aiRunRecordId(record: Record<string, unknown>): string {
  return stringField(record, "runId", stringField(record, "id"));
}

export function conversationAiRunReferencesFor(
  data: unknown
): ConversationAiRunReferenceView[] {
  const payload = isRecord(data) ? data : {};
  const runIds = new Set<string>();

  listFromPayload(payload, "aiRuns")
    .filter(isRecord)
    .forEach((run) => addRunId(runIds, aiRunRecordId(run)));
  listFromPayload(payload, "runs")
    .filter(isRecord)
    .forEach((run) => addRunId(runIds, aiRunRecordId(run)));
  addRunId(runIds, stringField(payload, "runId"));
  addRunId(runIds, stringField(nestedRecord(payload, "provenance"), "runId"));
  listFromPayload(payload, "messages")
    .filter(isRecord)
    .forEach((message) => addRunIdsFromText(runIds, stringField(message, "content")));

  return Array.from(runIds).map((id) => ({
    actionLabel: "查看依据",
    detail: `查看 ${id} 的来源、证据和安全边界。`,
    id,
    title: "AI 运行依据"
  }));
}

export function buildAiRunDetailRequest(
  runId: string
): AiRunDetailRequestResult {
  const normalizedRunId = runId.trim();

  if (!normalizedRunId) {
    return {
      error: "这次 AI 运行缺少编号，暂时不能查看依据。",
      success: false
    };
  }

  return {
    request: {
      path: aiRunPath(normalizedRunId)
    },
    success: true
  };
}

function aiRunOutputPreview(output: Record<string, unknown>): string {
  const text = normalizeOrbitAiName(stringField(output, "text")).trim();

  if (!text || containsImplementationLabel(text)) {
    return "这次运行没有返回可展示输出。";
  }

  return text;
}

export function aiRunDetailToView(data: unknown): AiRunDetailView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const run = nestedRecord(record, "run");
  const provenance = isRecord(record.provenance)
    ? nestedRecord(record, "provenance")
    : nestedRecord(run, "provenance");
  const output = nestedRecord(run, "output");
  const runId = stringField(run, "runId", stringField(provenance, "runId", "未标注运行"));
  const promptTemplateId = stringField(run, "promptTemplateId", "未标注模板");
  const evidenceCount =
    listField(run, "evidenceIds").length || listField(provenance, "evidenceIds").length;

  return {
    metrics: [`运行 ${runId}`, `模板 ${promptTemplateId}`, `证据 ${evidenceCount} 条`],
    nextAction: userFacingChineseText(
      stringField(record, "nextAction"),
      "先核对证据和输出，再决定是否继续。"
    ),
    outputPreview: aiRunOutputPreview(output),
    safetyText: "不会自动发送消息、写日历、改联系人或触发通知。",
    summary: userFacingChineseText(
      stringField(record, "summary"),
      "这次回复有可复核的运行记录。"
    ),
    title: "AI 运行依据"
  };
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
      label: stringField(intent, "label", "建议动作"),
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
      const quoteMatch = /^>\s*(.+)$/u.exec(line);
      const quotedLine = quoteMatch?.[1]?.trim();
      const lineBody = quotedLine || line;
      const taskMatch = /^[-*]\s+\[([ xX])\]\s+(.+)$/u.exec(lineBody);
      const orderedListMatch = /^(\d+)[.)]\s+(.+)$/u.exec(lineBody);
      const unorderedListMatch = /^[-*]\s+(.+)$/u.exec(lineBody);

      if (taskMatch) {
        const taskState = taskMatch[1] ?? "";
        const taskBody = taskMatch[2] ?? "";

        return {
          kind: "listItem",
          marker: taskState.toLowerCase() === "x" ? "✓" : "☐",
          ...(quoteMatch ? { quote: true } : {}),
          segments: markdownSegmentsFor(taskBody)
        };
      }

      if (orderedListMatch) {
        const orderIndex = orderedListMatch[1] ?? "";
        const orderBody = orderedListMatch[2] ?? "";

        return {
          kind: "listItem",
          marker: `${orderIndex}.`,
          ...(quoteMatch ? { quote: true } : {}),
          segments: markdownSegmentsFor(orderBody)
        };
      }

      const body = unorderedListMatch?.[1] ?? lineBody.replace(/^#{1,3}\s+/u, "");

      return {
        kind: unorderedListMatch ? "listItem" : "paragraph",
        ...(quoteMatch ? { quote: true } : {}),
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

function normalizedMatchText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/gu, "");
}

function contactMatchTerms(contact: ConversationContactCandidateView): string[] {
  return [
    contact.name,
    contact.organization,
    contact.role,
    contact.relationship,
    contact.status,
    contact.nextAction,
    ...(contact.valueLabels ?? [])
  ]
    .filter((value): value is string => typeof value === "string")
    .map(normalizedMatchText)
    .filter((value) => value.length >= 2);
}

export function prioritizeConversationContacts<
  T extends ConversationContactCandidateView
>(thread: ConversationThreadView, contacts: readonly T[]): T[] {
  const threadText = normalizedMatchText(
    thread.messages.map((message) => message.content).join(" ")
  );

  return contacts
    .map((contact, index) => {
      const terms = contactMatchTerms(contact);
      const matchIndexes = terms
        .map((term) => threadText.indexOf(term))
        .filter((matchIndex) => matchIndex >= 0);

      return {
        contact,
        firstMatchIndex: Math.min(...matchIndexes),
        index,
        score: matchIndexes.length
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.score > 0 && right.score > 0) {
        return left.firstMatchIndex - right.firstMatchIndex;
      }

      return left.index - right.index;
    })
    .map((item) => item.contact);
}

const EVENT_TERM_ALIASES: Record<string, string[]> = {
  kansai: ["关西"],
  kyoto: ["京都"],
  osaka: ["大阪", "关西"],
  shanghai: ["上海"],
  taipei: ["台北"],
  tokyo: ["东京", "東京"]
};

function cjkNgramTerms(value: string): string[] {
  const terms = new Set<string>();

  for (const match of value.matchAll(/[\u3400-\u9fff]{2,}/gu)) {
    const text = match[0];
    const maxSize = Math.min(4, text.length);

    for (let size = 2; size <= maxSize; size += 1) {
      for (let index = 0; index <= text.length - size; index += 1) {
        terms.add(text.slice(index, index + size));
      }
    }
  }

  return Array.from(terms);
}

function eventTermCandidates(value: string): string[] {
  const normalized = normalizedMatchText(value);
  const aliases = EVENT_TERM_ALIASES[normalized] ?? [];

  return [normalized, ...aliases.map(normalizedMatchText), ...cjkNgramTerms(value)];
}

function eventMatchTerms(event: ConversationEventCandidateView): string[] {
  const fields = [
    event.title,
    event.subtitle,
    event.location,
    ...event.topics
  ];
  const terms = fields
    .filter((value): value is string => typeof value === "string")
    .flatMap(eventTermCandidates)
    .filter((value) => value.length >= 2);

  return Array.from(new Set(terms));
}

export function prioritizeConversationEvents<
  T extends ConversationEventCandidateView
>(thread: ConversationThreadView, events: readonly T[]): T[] {
  const threadText = normalizedMatchText(
    thread.messages.map((message) => message.content).join(" ")
  );

  return events
    .map((event, index) => {
      const terms = eventMatchTerms(event);
      const matchIndexes = terms
        .map((term) => threadText.indexOf(term))
        .filter((matchIndex) => matchIndex >= 0);

      return {
        event,
        firstMatchIndex: Math.min(...matchIndexes),
        index,
        score: matchIndexes.length
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.score > 0 && right.score > 0) {
        return left.firstMatchIndex - right.firstMatchIndex;
      }

      return left.index - right.index;
    })
    .map((item) => item.event);
}

export function conversationInlinePanelsForThread(
  thread: ConversationThreadView
): ConversationInlinePanelView[] {
  const searchText = threadSearchText(thread);
  const panels: ConversationInlinePanelView[] = [];

  if (
    /跟进|回访|follow|followup|follow-up|提醒|优先级|待处理|下一步/iu.test(
      searchText
    )
  ) {
    panels.push({
      actionHref: "/followups",
      actionLabel: "查看全部跟进",
      detail: "根据你的问题，先把今天需要复核的跟进事项放在对话里。",
      kind: "followups",
      title: "待跟进"
    });
  }

  if (
    /人脉|联系人|介绍|引荐|见谁|认识谁|people|person|contact|contacts|intro|introduce/iu.test(
      searchText
    )
  ) {
    panels.push({
      actionHref: "/contacts/list",
      actionLabel: "查看联系人列表",
      detail: "根据你的问题，先把值得查看和适合推进的人放在对话里。",
      kind: "people",
      title: "相关人脉"
    });
  }

  if (
    /活动|参加|报名|会议|交流会|event|events|meetup|conference|attend/iu.test(
      searchText
    )
  ) {
    panels.push({
      actionHref: "/events",
      actionLabel: "查看全部活动",
      detail: "根据你的问题，先把可参加和需要准备的活动放在对话里。",
      kind: "events",
      title: "相关活动"
    });
  }

  if (
    /日程|安排|几点|什么时候|calendar|schedule|appointment/iu.test(
      searchText
    )
  ) {
    panels.push({
      actionHref: "/schedule",
      actionLabel: "查看日程",
      detail: "根据你的问题，先把最近需要处理的时间和待办放在对话里。",
      kind: "schedule",
      title: "近日安排"
    });
  }

  if (
    /档案|个人主页|主页|自我介绍|别人看到|能提供什么|资源标签|profile|bio/iu.test(
      searchText
    )
  ) {
    panels.push({
      actionHref: "/profile",
      actionLabel: "完善档案",
      detail: "根据你的问题，先把别人会看到的自我介绍和资源标签放在对话里。",
      kind: "profile",
      title: "个人档案"
    });
  }

  return panels;
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
      label: stringField(action, "label", "建议动作"),
      reason: stringField(action, "reason", "Orbit AI 建议先处理这一步。"),
      requiresUserConfirmation: actionRequiresConfirmation(action)
    }))
  };
}
