import type { ChatMessageView, ConversationThreadView } from "./conversations";

const MAX_HISTORY_ROWS = 12;
const MAX_TITLE_LENGTH = 34;

export interface AgentHistorySummary {
  id: string;
  pinned: boolean;
  preview: string;
  routeParams: {
    id: string;
    source: "session";
  };
  title: string;
  updatedAt: string;
  when: string;
}

interface AgentSessionMessage {
  content: string;
  createdAt: string;
  items?: unknown[];
  kind?: "events" | "people" | "todos";
  panelTitle?: string;
  role: string;
}

interface AgentSession {
  createdAt: string;
  customTitle: string;
  id: string;
  messages: AgentSessionMessage[];
  panel: unknown | null;
  pinned: boolean;
  title: string;
  updatedAt: string;
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
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeOrbitAiName(value: string): string {
  return value.replace(/\bOrbit Agent\b/g, "Orbit AI");
}

function containsImplementationLabel(value: string): boolean {
  return /\b(live|mock|hybrid|fixture|provider|providers|payload|source-backed|command-center|command center|natural-language request)\b/i.test(
    value
  );
}

function cleanText(value: string): string {
  return normalizeOrbitAiName(value).replace(/\s+/gu, " ").trim();
}

function cleanTitle(value: string): string {
  const text = cleanText(value).replace(/[?？!！。.,，;；:：]+$/gu, "");

  return text.length > MAX_TITLE_LENGTH
    ? `${text.slice(0, MAX_TITLE_LENGTH).trim()}...`
    : text;
}

function displayTitleForSession(session: AgentSession): string {
  const customTitle = cleanTitle(session.customTitle);

  if (customTitle && !containsImplementationLabel(customTitle)) {
    return customTitle;
  }

  const firstUserMessage = session.messages.find(
    (message) => message.role === "user"
  );
  const userTitle = firstUserMessage ? cleanTitle(firstUserMessage.content) : "";

  if (userTitle) {
    return userTitle;
  }

  const title = cleanTitle(session.title);

  return title && !containsImplementationLabel(title) ? title : "Orbit AI 对话";
}

function displayPreviewForSession(session: AgentSession): string {
  const firstUserMessage = session.messages.find(
    (message) => message.role === "user"
  );
  const preview = firstUserMessage ? cleanText(firstUserMessage.content) : "";

  return preview || "继续问一个具体问题。";
}

function dateLabel(value: string): string {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return "更早";
  }

  const parts = new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo"
  }).formatToParts(new Date(timestamp));
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return month && day ? `${month}月${day}日` : "更早";
}

function messageFromRecord(
  value: unknown,
  index: number,
  session: Pick<AgentSession, "createdAt" | "updatedAt">
): AgentSessionMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const role = stringField(value, "role", "assistant");
  const content = cleanText(
    stringField(value, "text", stringField(value, "content"))
  );

  if (!content || (role !== "assistant" && role !== "user")) {
    return null;
  }

  const message: AgentSessionMessage = {
    content,
    createdAt: stringField(
      value,
      "createdAt",
      index === 0 ? session.createdAt : session.updatedAt
    ),
    role
  };

  if (Array.isArray(value.items)) {
    message.items = value.items;
  }

  if (
    value.kind === "events" ||
    value.kind === "todos" ||
    value.kind === "people"
  ) {
    message.kind = value.kind;
  }

  const panelTitle = stringField(value, "panelTitle");
  if (panelTitle) {
    message.panelTitle = panelTitle;
  }

  return message;
}

function sessionFromRecord(value: unknown): AgentSession | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringField(value, "id");
  const updatedAt = stringField(value, "updatedAt");
  const createdAt = stringField(value, "createdAt", updatedAt);

  if (!id || !createdAt || !updatedAt) {
    return null;
  }

  const baseSession = {
    createdAt,
    updatedAt
  };
  const messages = Array.isArray(value.messages)
    ? value.messages
        .map((message, index) => messageFromRecord(message, index, baseSession))
        .filter((message): message is AgentSessionMessage => message !== null)
    : [];

  return {
    createdAt,
    customTitle: stringField(value, "customTitle"),
    id,
    messages,
    panel: isRecord(value.panel) ? value.panel : null,
    pinned: value.pinned === true,
    title: stringField(value, "title"),
    updatedAt
  };
}

function sessionsArrayFromPayload(data: unknown): AgentSession[] {
  const payload = isRecord(data) && isRecord(data.data) ? data.data : data;
  const sessions = isRecord(payload) ? payload.sessions : null;

  if (!Array.isArray(sessions)) {
    return [];
  }

  return sessions
    .map(sessionFromRecord)
    .filter((session): session is AgentSession => session !== null)
    .filter((session) =>
      session.messages.some((message) => message.role === "user")
    );
}

function sessionFromPayload(data: unknown): AgentSession | null {
  const payload = isRecord(data) && isRecord(data.data) ? data.data : data;
  const session = isRecord(payload) ? payload.session : null;

  return sessionFromRecord(session);
}

export function agentHistorySessionsToSummaries(
  data: unknown
): AgentHistorySummary[] {
  return sessionsArrayFromPayload(data)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.localeCompare(a.updatedAt)
    )
    .slice(0, MAX_HISTORY_ROWS)
    .map((session) => ({
      id: session.id,
      pinned: session.pinned,
      preview: displayPreviewForSession(session),
      routeParams: {
        id: session.id,
        source: "session" as const
      },
      title: displayTitleForSession(session),
      updatedAt: session.updatedAt,
      when: dateLabel(session.updatedAt)
    }));
}

export function agentChatSessionPayloadToThreadView(
  data: unknown
): ConversationThreadView {
  const session = sessionFromPayload(data);

  if (!session) {
    return {
      activeConversationId: null,
      assistantMessage: "",
      messages: [],
      nextAction: "继续问一个具体问题，Orbit AI 会先整理上下文，再给出下一步。",
      proposedToolIntents: [],
      title: "Orbit AI 对话"
    };
  }

  const assistantMessage =
    [...session.messages]
      .reverse()
      .find((message) => message.role === "assistant")?.content ?? "";

  return {
    activeConversationId: session.id,
    assistantMessage,
    messages: session.messages.map((message, index) => ({
      content: message.content,
      createdAt: message.createdAt,
      id: `${session.id}:message:${index}`,
      role: message.role
    })),
    nextAction: "继续问一个具体问题，Orbit AI 会先整理上下文，再给出下一步。",
    proposedToolIntents: [],
    title: displayTitleForSession(session)
  };
}

function storedMessageFromChatMessage(
  message: ChatMessageView
):
  | {
      role: "user";
      text: string;
    }
  | {
      items: unknown[];
      kind: "events" | "people" | "todos";
      panelTitle: string;
      role: "assistant";
      text: string;
    }
  | null {
  const text = cleanText(message.content);

  if (!text) {
    return null;
  }

  if (message.role === "user") {
    return {
      role: "user",
      text
    };
  }

  if (message.role === "assistant") {
    return {
      items: [],
      kind: "people",
      panelTitle: "",
      role: "assistant",
      text
    };
  }

  return null;
}

function storedMessageFromSessionMessage(message: AgentSessionMessage):
  | {
      role: "user";
      text: string;
    }
  | {
      items: unknown[];
      kind: "events" | "people" | "todos";
      panelTitle: string;
      role: "assistant";
      text: string;
    }
  | null {
  if (message.role === "user") {
    return {
      role: "user",
      text: message.content
    };
  }

  if (message.role === "assistant") {
    return {
      items: message.items ?? [],
      kind: message.kind ?? "people",
      panelTitle: message.panelTitle ?? "",
      role: "assistant",
      text: message.content
    };
  }

  return null;
}

function messageKey(message: { role: string; text: string }): string {
  return `${message.role}:${cleanText(message.text)}`;
}

function appendNewMessages(
  previousMessages: ReturnType<typeof storedMessageFromSessionMessage>[],
  nextMessages: ReturnType<typeof storedMessageFromChatMessage>[]
) {
  const result = previousMessages.filter(
    (message): message is NonNullable<typeof message> => message !== null
  );
  const existing = new Set(result.map(messageKey));

  for (const message of nextMessages) {
    if (!message) {
      continue;
    }

    const key = messageKey(message);
    if (!existing.has(key)) {
      result.push(message);
      existing.add(key);
    }
  }

  return result;
}

function latestThreadTimestamp(thread: ConversationThreadView): string {
  return [...thread.messages]
    .reverse()
    .find((message) => message.createdAt.trim())?.createdAt ?? "";
}

export function agentSessionCreateRequestFromThread({
  createdAt,
  sessionId,
  thread
}: {
  createdAt: string;
  sessionId: string;
  thread: ConversationThreadView;
}): { session: Record<string, unknown> } | null {
  const id = sessionId.trim();
  const fallbackTimestamp = createdAt.trim();
  const messages = thread.messages
    .map(storedMessageFromChatMessage)
    .filter((message): message is NonNullable<typeof message> => message !== null);
  const firstUserMessage = messages.find((message) => message.role === "user");

  if (!id || !fallbackTimestamp || !firstUserMessage) {
    return null;
  }

  const updatedAt = latestThreadTimestamp(thread) || fallbackTimestamp;
  const title =
    cleanTitle(firstUserMessage.text) ||
    cleanTitle(thread.title) ||
    "Orbit AI 对话";

  return {
    session: {
      createdAt: fallbackTimestamp,
      id,
      messages,
      pinned: false,
      title,
      updatedAt
    }
  };
}

export function agentSessionUpdateRequestFromThread({
  previousSession,
  thread
}: {
  previousSession: unknown;
  thread: ConversationThreadView;
}): { session: Record<string, unknown> } | null {
  const session = sessionFromPayload(previousSession);

  if (!session) {
    return null;
  }

  const messages = appendNewMessages(
    session.messages.map(storedMessageFromSessionMessage),
    thread.messages.map(storedMessageFromChatMessage)
  );

  if (!messages.some((message) => message.role === "user")) {
    return null;
  }

  const updatedAt =
    latestThreadTimestamp(thread) || session.updatedAt || new Date().toISOString();
  const title = displayTitleForSession(session);
  const snapshot: Record<string, unknown> = {
    createdAt: session.createdAt,
    id: session.id,
    messages,
    pinned: session.pinned,
    title,
    updatedAt
  };

  if (session.customTitle) {
    snapshot.customTitle = session.customTitle;
  }

  if (session.panel) {
    snapshot.panel = session.panel;
  }

  return {
    session: snapshot
  };
}
