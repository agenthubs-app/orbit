export interface ConversationSummary {
  id: string;
  preview: string;
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
