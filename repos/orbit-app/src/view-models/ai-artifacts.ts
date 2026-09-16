import { aiSessionArtifactRecoverySchema, contactArtifactDisplaySchema, contactArtifactSchema, contactArtifactToDisplay } from "../api/schema/ai-artifacts";
import type { AiContactArtifactContract } from "../api/contract/ai-artifacts";

export interface ConversationContactArtifactView extends AiContactArtifactContract {
  assistantMessageId: string;
  userMessageId: string;
  requestId?: string;
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const unavailable = (): AiContactArtifactContract => ({ artifactId: "unavailable", taskId: "unavailable", kind: "contact_recommendations", status: "unavailable", title: "", summary: "", sections: [] });
const otherKinds = new Set(["event_recommendations", "email_context", "followup_queue", "relationship_chat_context", "generic", "self_profile", "data_query"]);

function displays(values: readonly unknown[], displayData = false): AiContactArtifactContract[] {
  let remaining = 200;
  return values.slice(0, values.length > 16 ? 15 : 16).flatMap(value => {
    const kind = record(value) ? displayData ? value.kind : record(value.task) ? value.task.kind : undefined : undefined;
    if (typeof kind === "string" && otherKinds.has(kind)) return [];
    const parsed = displayData ? contactArtifactDisplaySchema.safeParse(value) : null;
    const display = displayData ? parsed?.success ? parsed.data : unavailable() : contactArtifactToDisplay(value);
    const count = display.sections.reduce((total, section) => total + section.items.length, 0);
    if (count > remaining) return [unavailable()];
    remaining -= count;
    return [kind !== undefined && kind !== "contact_recommendations" ? { ...unavailable(), status: "unsupported" as const } : display];
  }).concat(values.length > 16 ? [unavailable()] : []);
}

export function conversationContactArtifacts(payload: Record<string, unknown>): ConversationContactArtifactView[] {
  if (!Array.isArray(payload.artifacts) || payload.artifacts.length === 0 || !Array.isArray(payload.messages)) return [];
  const messages = payload.messages.filter(record);
  const index = messages.findLastIndex(message => message.role === "assistant");
  const assistant = messages[index]; const user = messages[index - 1];
  if (!assistant || !user || user.role !== "user" || typeof assistant.messageId !== "string" || typeof user.messageId !== "string") return [];
  if (messages.filter(message => message.messageId === assistant.messageId).length !== 1 || messages.filter(message => message.messageId === user.messageId).length !== 1) return [];
  const values = payload.artifacts.map(value => {
    const parsed = contactArtifactSchema.safeParse(value);
    return parsed.success && parsed.data.task.conversationId !== payload.activeConversationId ? null : value;
  });
  return displays(values).map(display => ({ ...display, assistantMessageId: assistant.messageId as string, userMessageId: user.messageId as string }));
}

export function sessionContactArtifacts(session: { id: string; messages: readonly { id?: string | undefined; role: string }[] }, recovery: unknown): ConversationContactArtifactView[] {
  const parsed = aiSessionArtifactRecoverySchema.safeParse(recovery);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const result: ConversationContactArtifactView[] = [];
  for (const turn of parsed.data.turns) {
    const index = session.messages.findIndex(message => message.id === turn.assistantMessageId && message.role === "assistant");
    if (turn.sessionId !== session.id || index < 1 || session.messages[index - 1]?.role !== "user" || session.messages[index - 1]?.id !== turn.userMessageId
      || session.messages.filter(message => message.id === turn.assistantMessageId).length !== 1 || session.messages.filter(message => message.id === turn.userMessageId).length !== 1) continue;
    if (seen.has(turn.assistantMessageId)) { result.splice(0, result.length, ...result.filter(value => value.assistantMessageId !== turn.assistantMessageId)); continue; }
    seen.add(turn.assistantMessageId);
    const values = turn.status === "ready" ? displays(turn.artifacts, true) : [unavailable()];
    for (const display of values) {
      if (result.length >= 16) { result[15] = { ...result[15]!, ...unavailable() }; break; }
      const total = [...result, display].reduce((total, value) => total + value.sections.reduce((count, section) => count + section.items.length, 0), 0);
      result.push({ ...(total > 200 ? unavailable() : display), assistantMessageId: turn.assistantMessageId, userMessageId: turn.userMessageId, requestId: turn.requestId });
    }
  }
  return result;
}
