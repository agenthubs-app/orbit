import type {
  InboxNotificationDTO,
  InboxNotificationKind,
  InboxNotificationSource,
} from "../contract/inbox-notifications";
import { parseTimestamp } from "./compute-text";

/**
 * Sprint 0118 (offline 3a): the typed inbox rules the server and the App share
 * (npm run sync:contract copies this file to the App's src/api/compute/).
 *
 * The server decides whether a notification's sources are still available at
 * read time (inbox-record-service-factory sourceAccess). A device copy holds
 * that decision as `sourceState`, written back on the row by the sync path
 * (features/sync/inbox-domain-reader.ts). Everything else a reader sees — the
 * language, expiry, the default list, history, the unread count — is computed
 * from the row and "now" by the functions below, on both sides.
 */
export type InboxSourceState = "available" | "changed" | "unavailable";
export type InboxLanguage = "zh" | "en" | "ja";
export type InboxListFilter = "all" | "history" | InboxNotificationKind;

/** A device's copy of one notification: the stored notification without its owner id, plus the server's source decision. */
export type InboxDeviceNotification = Omit<InboxNotificationDTO, "actorId"> & { sourceState: InboxSourceState };

export const INBOX_UNAVAILABLE_TEXT: Readonly<Record<InboxLanguage, { title: string; reason: string }>> = {
  zh: { title: "来源已不可用", reason: "来源已变更、不可访问，或此通知已不再适用。" },
  en: { title: "Source unavailable", reason: "The source changed, access is unavailable, or this notification no longer applies." },
  ja: { title: "参照元を利用できません", reason: "参照元が変更されたか、アクセスできないか、この通知が対象外になりました。" },
};

const THIRTY_DAYS_MS = 30 * 86_400_000;

/** The combined decision for a notification from its sources' decisions (none is not available). */
export function inboxSourceStateOf(states: readonly InboxSourceState[]): InboxSourceState {
  if (states.length === 0) return "unavailable";
  return states.includes("unavailable") ? "unavailable" : states.includes("changed") ? "changed" : "available";
}

function stripSources(sources: readonly InboxNotificationSource[]): InboxNotificationSource[] {
  return sources.map(({ excerpt: _excerpt, authorId: _author, objectId: _object, ...source }) => source);
}

/**
 * What a reader sees in `language` at `nowMs`. A notification whose sources
 * are not available shows the "source unavailable" text and nothing of its
 * content; an open one past expiresAt reads as expired and only offers "read".
 * The server's list and detail use this same function.
 */
export function presentInboxNotification<TNotification extends Omit<InboxNotificationDTO, "actorId">>(
  notification: TNotification,
  state: InboxSourceState,
  language: InboxLanguage,
  nowMs: number,
): TNotification {
  if (state !== "available") {
    const { object: _object, copy: _copy, createdTaskId: _task, ...safe } = notification;
    return {
      ...safe,
      ...INBOX_UNAVAILABLE_TEXT[language],
      target: { ...notification.target, href: null, status: state },
      sources: stripSources(notification.sources),
      actions: [],
    } as unknown as TNotification;
  }
  const expired = Boolean(notification.expiresAt) && parseTimestamp(notification.expiresAt!) <= nowMs && notification.disposition === "open";
  return {
    ...notification,
    ...notification.copy?.[language],
    ...(expired ? { disposition: "expired" as const } : {}),
    actions: expired || notification.disposition !== "open" ? notification.actions.filter((action) => action === "read") : notification.actions,
  };
}

/**
 * The row a device stores. A notification whose sources are no longer available
 * leaves the server without its content (copy, object, source excerpts, the
 * created task): only what the "source unavailable" row and the history need.
 */
export function inboxDevicePayload(notification: InboxNotificationDTO, state: InboxSourceState): InboxDeviceNotification {
  const { actorId: _actor, ...rest } = notification;
  if (state === "available") return { ...rest, sourceState: state };
  return { ...presentInboxNotification(rest, state, "zh", 0), sourceState: state };
}

/** In the default list at `asOfMs`: open, due, and (unless a reminder) from the last 30 days. */
export function isActiveInboxNotification(notification: Pick<InboxNotificationDTO, "disposition" | "scheduledFor" | "kind" | "occurredAt">, asOfMs: number): boolean {
  return notification.disposition === "open"
    && (!notification.scheduledFor || parseTimestamp(notification.scheduledFor) <= asOfMs)
    && (notification.kind === "reminder" || parseTimestamp(notification.occurredAt) >= asOfMs - THIRTY_DAYS_MS);
}

/**
 * The unread count the server reports (countAuthorizedUnread): active, unread,
 * not expired, and every source available.
 */
export function inboxUnreadCount(rows: readonly InboxDeviceNotification[], nowMs: number): number {
  let count = 0;
  for (const row of rows) {
    if (row.sourceState !== "available" || row.sources.length === 0 || row.readAt) continue;
    if (!isActiveInboxNotification(row, nowMs)) continue;
    if (row.expiresAt && parseTimestamp(row.expiresAt) <= nowMs) continue;
    count += 1;
  }
  return count;
}

/** Newest first, like the server's `order by occurred_at desc, record_id desc`. */
export function compareInboxNewestFirst(left: Pick<InboxNotificationDTO, "occurredAt" | "id">, right: Pick<InboxNotificationDTO, "occurredAt" | "id">): number {
  const difference = parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt);
  if (difference !== 0 && Number.isFinite(difference)) return difference < 0 ? -1 : 1;
  return right.id === left.id ? 0 : right.id < left.id ? -1 : 1;
}

/**
 * The list a reader sees for `filter`: history is every notification; the
 * default list and the kind tabs keep active ones whose sources have not become
 * unavailable. Rows are presented in `language`.
 */
export function localInboxList(rows: readonly InboxDeviceNotification[], input: { filter: InboxListFilter; language: InboxLanguage; nowMs: number }): InboxDeviceNotification[] {
  const history = input.filter === "history";
  const kind = input.filter === "all" || history ? null : input.filter;
  // Like the server, "active" is judged on the presented row: an expired one reads as expired and leaves the default list.
  return [...rows]
    .sort(compareInboxNewestFirst)
    .map((row) => presentInboxNotification(row, row.sourceState, input.language, input.nowMs))
    .filter((row) => history || (row.sourceState !== "unavailable" && isActiveInboxNotification(row, input.nowMs) && (!kind || row.kind === kind)));
}

