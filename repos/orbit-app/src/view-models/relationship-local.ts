import type { SyncRecord } from "../api/contract/sync";
import type { RelationshipConversationSummaryPageDTO, RelationshipMessagePageDTO } from "../api/contract/relationship-communication";
import {
  relationshipLocalMessagePage,
  relationshipLocalSummaryPage,
  relationshipLocalUnreadTotal,
  type RelationshipDeviceConversation,
  type RelationshipDeviceMessage,
} from "../api/compute/relationship-local";
import { decodeConversationSummaryPage, decodeRelationshipMessagePage } from "./relationship-pages";

/**
 * Sprint 0119 (offline 3b = message plan M3): the inbox threads, the chat and
 * the message badge from the device mirror (sync domains
 * "relationship-conversations" and "relationship-messages"). Rows are
 * validated with the same decoders the network pages go through; a malformed
 * row is skipped. The list, the unread total and a conversation's page are
 * computed by the shared rules (src/api/compute/relationship-local.ts), the
 * same code the server's parity test runs.
 */
export function relationshipDeviceConversations(records: readonly SyncRecord<Record<string, unknown>>[], actorId: string): RelationshipDeviceConversation[] {
  const rows: RelationshipDeviceConversation[] = [];
  for (const record of records) {
    const payload = record.payload;
    if (!payload || record.deletedAt || payload.conversationId !== record.id) continue;
    if (!Number.isSafeInteger(payload.readSeq) || !Number.isSafeInteger(payload.lastMessageSeq)) continue;
    const row = payload as unknown as RelationshipDeviceConversation;
    const page = decodeConversationSummaryPage(relationshipLocalSummaryPage([row], actorId, { asOf: "1970-01-01T00:00:00.000Z" }), actorId);
    if (page?.items.length === 1) rows.push(row);
  }
  return rows;
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function relationshipDeviceMessages(records: readonly SyncRecord<Record<string, unknown>>[], conversationId?: string): RelationshipDeviceMessage[] {
  const rows: RelationshipDeviceMessage[] = [];
  for (const record of records) {
    const payload = record.payload;
    if (!payload || record.deletedAt) continue;
    const { conversationId: id, seq, messageId, senderAccountId, senderDisplayName, body, sentAt } = payload;
    if (conversationId !== undefined && id !== conversationId) continue;
    if (!text(id) || !Number.isSafeInteger(seq) || record.id !== `${id}/${seq}` || !text(messageId) || !text(senderAccountId) || !text(senderDisplayName) || typeof body !== "string" || !body.trim() || !text(sentAt)) continue;
    rows.push({ conversationId: id, seq: seq as number, messageId, senderAccountId, senderDisplayName, body, sentAt });
  }
  return rows;
}

/** The whole device list as one summary page (nothing to page: the device holds every conversation). */
export function localConversationSummaryPage(rows: readonly RelationshipDeviceConversation[], actorId: string, asOf: string): RelationshipConversationSummaryPageDTO | null {
  return decodeConversationSummaryPage(relationshipLocalSummaryPage(rows, actorId, { asOf }), actorId);
}

export function localRelationshipUnreadTotal(rows: readonly RelationshipDeviceConversation[]): number {
  return relationshipLocalUnreadTotal(rows);
}

/** One conversation's page from the device; `cursor` is the local "older" cursor of the previous page. */
export function localRelationshipMessagePage(
  rows: readonly RelationshipDeviceConversation[],
  messages: readonly RelationshipDeviceMessage[],
  actorId: string,
  conversationId: string,
  input: { cursor?: string | null; asOf: string; limit?: number },
): RelationshipMessagePageDTO | null {
  const conversation = rows.find((row) => row.conversationId === conversationId);
  if (!conversation) return null;
  return decodeRelationshipMessagePage(relationshipLocalMessagePage(conversation, messages, actorId, input), actorId, conversationId);
}
