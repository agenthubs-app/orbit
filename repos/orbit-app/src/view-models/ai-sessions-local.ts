import type { SyncRecord } from "../api/contract/sync";
import type { AiSessionSummaryItemContract, AiSessionSummaryPageContract } from "../api/contract/ai-session-page";
import type { AiSessionReferenceContract } from "../api/contract/ai-sessions";
import { aiSessionSummaryItemSchema } from "../api/schema/ai-session-page";

/**
 * Sprint 0118 (AI B3): the AI session list and the messages of opened
 * sessions from the device mirror (sync domains "ai-sessions" and
 * "ai-session-messages"). A row is validated like the server's summary item;
 * anything malformed is skipped.
 */
export function aiSessionRows(records: readonly SyncRecord<Record<string, unknown>>[]): AiSessionSummaryItemContract[] {
  const rows: AiSessionSummaryItemContract[] = [];
  for (const record of records) {
    if (!record.payload || record.deletedAt) continue;
    const { messageCount: _count, ...item } = record.payload;
    const parsed = aiSessionSummaryItemSchema.safeParse(item);
    if (parsed.success && parsed.data.id === record.id) rows.push(parsed.data as AiSessionSummaryItemContract);
  }
  return rows;
}

function compare(left: AiSessionSummaryItemContract, right: AiSessionSummaryItemContract): number {
  return Number(right.organization.pinned) - Number(left.organization.pinned)
    || (right.createdAt < left.createdAt ? -1 : right.createdAt > left.createdAt ? 1 : 0)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/**
 * The whole list as one page, in the server's order (pinned first, newest
 * first). The search looks at the id, the titles and the first and latest
 * messages the row carries; the server additionally searches older message
 * text it keeps in its search index.
 */
export function localAiSessionPage(rows: readonly AiSessionSummaryItemContract[], query: { q?: string; groupId?: string | null } = {}): AiSessionSummaryPageContract {
  const q = (query.q ?? "").trim().toLowerCase();
  const items = rows.filter((row) => {
    if (query.groupId === "ungrouped" && row.organization.groupId !== null) return false;
    if (query.groupId && query.groupId !== "ungrouped" && row.organization.groupId !== query.groupId) return false;
    if (!q) return true;
    return [row.id, row.title, row.organization.customTitle ?? "", row.firstUserText, row.lastMessagePreview].join(" ").toLowerCase().includes(q);
  }).sort(compare);
  return { items, nextCursor: null, hasMore: false, storage: { configured: true, persisted: true } };
}

export interface LocalAiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  references?: AiSessionReferenceContract[];
  index: number;
}

/** One opened session's messages on the device, oldest first. */
export function aiSessionMessages(records: readonly SyncRecord<Record<string, unknown>>[], sessionId: string): LocalAiMessage[] {
  const messages: LocalAiMessage[] = [];
  for (const record of records) {
    const payload = record.payload;
    if (!payload || record.deletedAt || payload.sessionId !== sessionId) continue;
    if ((payload.role !== "user" && payload.role !== "assistant") || typeof payload.text !== "string" || typeof payload.id !== "string" || typeof payload.index !== "number") continue;
    const references = Array.isArray(payload.references)
      ? payload.references.filter((reference): reference is AiSessionReferenceContract => Boolean(reference) && typeof reference === "object"
        && typeof (reference as { id?: unknown }).id === "string" && ["contact", "event", "note"].includes((reference as { type?: string }).type ?? ""))
      : [];
    messages.push({ id: payload.id, role: payload.role, text: payload.text, index: payload.index, ...(references.length ? { references } : {}) });
  }
  return messages.sort((left, right) => left.index - right.index || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
