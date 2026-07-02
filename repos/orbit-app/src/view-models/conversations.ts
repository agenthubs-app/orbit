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
        stringField(conversation, "lastMessagePreview") ||
        stringField(conversation, "preview"),
      title: stringField(conversation, "title", "Orbit AI conversation")
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
    assistantMessage: stringField(payload, "assistantMessage"),
    messages: messages.filter(isRecord).map((message) => ({
      content: stringField(message, "content"),
      createdAt: stringField(message, "createdAt"),
      id: stringField(
        message,
        "messageId",
        stringField(message, "id", "message")
      ),
      role: stringField(message, "role", "assistant")
    })),
    proposedToolIntents: proposedToolIntents.filter(isRecord).map((intent) => ({
      id: stringField(intent, "intentId", stringField(intent, "id", "intent")),
      label: stringField(intent, "label", "Suggested action"),
      reason: stringField(intent, "reason"),
      requiresUserConfirmation: booleanField(
        intent,
        "requiresUserConfirmation",
        true
      )
    }))
  };
}
