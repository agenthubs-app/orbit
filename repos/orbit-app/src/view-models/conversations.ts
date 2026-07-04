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

function containsImplementationLabel(value: string): boolean {
  return /\b(live|mock|hybrid|fixture|provider|providers|command-center|command center)\b/i.test(
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
    : "Orbit AI conversation";
}

function conversationPreview(value: string): string {
  return normalizeOrbitAiName(value);
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
        stringField(conversation, "title", "Orbit AI conversation")
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
      requiresUserConfirmation: actionRequiresConfirmation(intent)
    }))
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
