import type {
  RelationshipConversationSummaryDTO,
  RelationshipConversationSummaryPageDTO,
  RelationshipMessageDTO,
  RelationshipMessagePageDTO,
} from "../contract/relationship-communication";

/**
 * Sprint 0119 (offline 3b = message plan M3): the relationship message rules
 * the server and the App share (npm run sync:contract copies this file to the
 * App's src/api/compute/).
 *
 * A device holds two sync domains read from the dedicated message tables
 * (features/sync/relationship-message-domain-reader.ts):
 *   - "relationship-conversations": one row per conversation the account is an
 *     active member of — the server's conversation summary item plus the
 *     member's read position and the conversation's last sequence number;
 *   - "relationship-messages": every message of those conversations (full
 *     history), one row each, id `${conversationId}/${seq}`.
 * The inbox list, the unread total and a conversation's message page are
 * computed from those rows by the functions below, in the server's order.
 */
export type RelationshipDeviceConversation = RelationshipConversationSummaryDTO & {
  readSeq: number;
  lastMessageSeq: number;
};

export type RelationshipDeviceMessage = Omit<RelationshipMessageDTO, "deliveryState"> & { seq: number };

/** The device row id of a message: its conversation and its sequence number (a conversation delete removes every id with this prefix). */
export function relationshipMessageRowId(conversationId: string, seq: number): string {
  return `${conversationId}/${seq}`;
}

export function relationshipMessageRowPrefix(conversationId: string): string {
  return `${conversationId}/`;
}

const byNewest = (left: RelationshipDeviceConversation, right: RelationshipDeviceConversation) =>
  left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : left.conversationId < right.conversationId ? -1 : left.conversationId > right.conversationId ? 1 : 0;

function summaryItem(row: RelationshipDeviceConversation): RelationshipConversationSummaryDTO {
  const { readSeq: _readSeq, lastMessageSeq: _lastMessageSeq, ...item } = row;
  return item;
}

/**
 * Every conversation on the device as one summary page, newest first (the
 * server's order: last message time descending, then conversation id). The
 * device holds all of them, so there is no next page.
 */
export function relationshipLocalSummaryPage(rows: readonly RelationshipDeviceConversation[], actorId: string, input: { asOf: string }): RelationshipConversationSummaryPageDTO {
  const items = rows.filter((row) => row.status === "active" && row.participantAccountIds.includes(actorId)).sort(byNewest).map(summaryItem);
  return { actorId, items, nextCursor: null, hasMore: false, asOf: input.asOf };
}

/** The unread badge: the sum of the account's own member rows (the server's unread summary). */
export function relationshipLocalUnreadTotal(rows: readonly RelationshipDeviceConversation[]): number {
  return rows.reduce((total, row) => total + (row.status === "active" && Number.isSafeInteger(row.unreadCount) && row.unreadCount > 0 ? row.unreadCount : 0), 0);
}

const LOCAL_CURSOR = /^local:(\d+)$/;

/** A local "older" cursor: the sequence number the next page ends before. */
export function relationshipLocalCursorSeq(cursor: string | null | undefined): number | null {
  const match = cursor ? LOCAL_CURSOR.exec(cursor) : null;
  return match ? Number(match[1]) : null;
}

/** UTF-8 length of a string (Postgres octet_length of the same text). */
function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && (value.charCodeAt(index + 1) & 0xfc00) === 0xdc00) { bytes += 4; index += 1; }
    else bytes += 3;
  }
  return bytes;
}

/** The server's message window (bounded-reader messagesSql): each message counts its body plus 4096 bytes; the first always fits. */
const MESSAGE_WINDOW_BYTES = 96_000;
const MESSAGE_WINDOW_OVERHEAD = 4096;

/**
 * One conversation's messages from the device, the newest before the cursor's
 * sequence number (the newest overall without a cursor), oldest first — the
 * server's "older" page: at most `limit` messages and the server's byte window.
 * The next page is a local cursor; the device holds the whole history, so
 * paging back needs no network.
 */
export function relationshipLocalMessagePage(
  conversation: RelationshipDeviceConversation,
  messages: readonly RelationshipDeviceMessage[],
  actorId: string,
  input: { limit?: number; cursor?: string | null; asOf: string },
): RelationshipMessagePageDTO {
  const limit = input.limit ?? 30;
  const before = relationshipLocalCursorSeq(input.cursor);
  const mine = messages
    .filter((message) => message.conversationId === conversation.conversationId && (before === null || message.seq < before))
    .sort((left, right) => left.seq - right.seq);
  const kept: RelationshipDeviceMessage[] = [];
  let bytes = 0;
  for (let index = mine.length - 1; index >= 0 && kept.length < limit; index -= 1) {
    bytes += utf8Length(mine[index]!.body) + MESSAGE_WINDOW_OVERHEAD;
    if (kept.length > 0 && bytes > MESSAGE_WINDOW_BYTES) break;
    kept.unshift(mine[index]!);
  }
  const hasMore = mine.length > kept.length;
  const { unreadCount: _unread, lastMessage: _last, readSeq: _read, lastMessageSeq: _seq, ...identity } = conversation;
  return {
    actorId,
    conversation: identity,
    items: kept.map(({ seq: _s, ...message }) => ({ ...message, deliveryState: "delivered" as const })),
    nextCursor: hasMore ? `local:${kept[0]!.seq}` : null,
    newestCursor: kept.length ? `local:newest:${kept.at(-1)!.seq}` : null,
    hasMore,
    direction: "older",
    asOf: input.asOf,
  };
}
