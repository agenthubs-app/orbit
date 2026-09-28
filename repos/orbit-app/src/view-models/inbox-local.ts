import type { SyncRecord } from "../api/contract/sync";
import type { InboxNotificationDTO, InboxNotificationListDTO } from "../api/contract/inbox-notifications";
import { inboxNotificationSchema } from "../api/schema/inbox-notifications";
import {
  inboxUnreadCount,
  localInboxList,
  presentInboxNotification,
  type InboxDeviceNotification,
  type InboxLanguage,
  type InboxListFilter,
} from "../api/compute/inbox-local";

/**
 * Sprint 0118: the typed inbox from the device mirror (sync domain
 * "inbox-notifications"). Rows are validated one by one like the server list
 * (0104): a kind this build does not know, or a malformed row, is skipped.
 * The presentation, the lists and the unread count are the shared rules the
 * server uses (api/compute/inbox-local.ts).
 */
export function inboxDeviceRows(records: readonly SyncRecord<Record<string, unknown>>[], actorId: string): InboxDeviceNotification[] {
  const rows: InboxDeviceNotification[] = [];
  for (const record of records) {
    const payload = record.payload;
    if (!payload || record.deletedAt) continue;
    const state = payload.sourceState;
    if (state !== "available" && state !== "changed" && state !== "unavailable") continue;
    const { sourceState: _state, ...notification } = payload;
    const parsed = inboxNotificationSchema.safeParse({ ...notification, actorId });
    if (!parsed.success || parsed.data.id !== record.id) continue;
    const { actorId: _actor, ...rest } = parsed.data;
    rows.push({ ...rest, sourceState: state });
  }
  return rows;
}

function withActor(row: InboxDeviceNotification, actorId: string): InboxNotificationDTO {
  const { sourceState: _state, ...rest } = row;
  return { ...rest, actorId };
}

/** The list the inbox screen renders, computed on the device: one page holding everything (no cursor). */
export function localInboxListData(rows: readonly InboxDeviceNotification[], input: { actorId: string; filter: InboxListFilter; language: InboxLanguage; nowMs: number }): InboxNotificationListDTO {
  return {
    enabled: true,
    items: localInboxList(rows, input).map((row) => withActor(row, input.actorId)),
    unreadCount: inboxUnreadCount(rows, input.nowMs),
    nextCursor: null,
    asOf: new Date(input.nowMs).toISOString(),
  };
}

/** One notification as its detail page shows it, or null when the device does not hold it. */
export function localInboxDetail(rows: readonly InboxDeviceNotification[], input: { actorId: string; id: string; language: InboxLanguage; nowMs: number }): InboxNotificationDTO | null {
  const row = rows.find((candidate) => candidate.id === input.id);
  return row ? withActor(presentInboxNotification(row, row.sourceState, input.language, input.nowMs), input.actorId) : null;
}

export function localInboxUnreadCount(rows: readonly InboxDeviceNotification[], nowMs: number): number {
  return inboxUnreadCount(rows, nowMs);
}
