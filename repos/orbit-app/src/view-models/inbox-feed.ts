import type { OrbitLanguage } from "../api/contract/language";
import {
  relationshipConversationListToInbox,
  relationshipReadTarget,
} from "../api/message-state";
import { relationshipSignalsToView } from "./relationship-inbox";
import { inboxNotificationActions } from "./inbox-notification-actions";

export type InboxFeedCategory = "activity" | "task" | "contact" | "assistant";
export type InboxFeedFilter = "all" | Exclude<InboxFeedCategory, "assistant">;

export interface InboxFeedReadAction {
  body: Readonly<Record<string, string>>;
  endpoint: string;
  expected: Readonly<Record<string, string>>;
}

export interface InboxFeedItem {
  category: InboxFeedCategory;
  id: string;
  occurredAt: string;
  read: boolean;
  readAction?: InboxFeedReadAction;
  subtitle: string;
  targetHref?: string;
  title: string;
}

export interface InboxFeedView {
  coverageConfirmed: boolean;
  items: readonly InboxFeedItem[];
  unreadCount: number;
}

type UnknownRecord = Record<string, unknown>;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function exactText(value: unknown): string {
  return typeof value === "string" && value.length > 0 && value.length <= 2_048
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : "";
}

function trustedTimestamp(value: unknown): string {
  const timestamp = exactText(value);
  return timestamp && ISO_TIMESTAMP.test(timestamp) && Number.isFinite(Date.parse(timestamp))
    ? timestamp
    : "";
}

function encodedPath(prefix: string, id: string): string {
  return `${prefix}/${encodeURIComponent(id)}`;
}

function occurrence(record: UnknownRecord): string {
  return trustedTimestamp(record.occurredAt)
    || trustedTimestamp(record.createdAt)
    || trustedTimestamp(record.updatedAt);
}

function inWindow(timestamp: string, start: number, end: number): boolean {
  const value = Date.parse(timestamp);
  return value >= start && value <= end;
}

function notificationCategory(record: UnknownRecord, href: string | undefined): InboxFeedCategory | null {
  if (href?.startsWith("/events/") || href?.startsWith("/schedule/events/")) return "activity";
  if (href?.startsWith("/tasks/")) return "task";
  if (href?.startsWith("/contacts/")) return "contact";
  const sourceKind = exactText(record.sourceKind).toLowerCase();
  const kind = exactText(record.kind).toLowerCase();
  return ["iorbit", "proactive", "system"].includes(sourceKind)
    || ["iorbit", "proactive", "system"].includes(kind)
    ? "assistant"
    : null;
}

function notificationItems(value: unknown): { complete: boolean; items: InboxFeedItem[] } {
  const payload = record(value);
  if (!payload || !Array.isArray(payload.reminders)) return { complete: false, items: [] };
  const actions = inboxNotificationActions(value);
  const seen = new Set<string>();
  let complete = true;
  const items: InboxFeedItem[] = [];
  for (const raw of payload.reminders) {
    const item = record(raw);
    const id = item ? exactText(item.reminderId) : "";
    if (!item || !id || seen.has(id)) {
      complete = false;
      continue;
    }
    seen.add(id);
    const action = actions.get(id);
    if (action?.ignored) continue;
    const category = notificationCategory(item, action?.href);
    const title = exactText(item.title);
    if (!category || !title) {
      complete = false;
      continue;
    }
    const occurredAt = occurrence(item);
    const read = action?.read === true;
    items.push({
      category,
      id: `notification:${id}`,
      occurredAt,
      read,
      ...(action?.canPersist ? {
        readAction: {
          body: { state: "read" },
          endpoint: encodedPath("/api/notifications", id) + "/state",
          expected: { notificationId: id, state: "read" },
        },
      } : {}),
      subtitle: exactText(item.organization) || exactText(item.sourceLabel) || (category === "assistant" ? "IORBIT" : ""),
      ...(action?.href ? { targetHref: action.href } : {}),
      title,
    });
  }
  return { complete, items };
}

function conversationItems(value: unknown, actorId: string): { complete: boolean; items: InboxFeedItem[] } {
  const payload = record(value);
  const refreshedAt = payload ? trustedTimestamp(payload.refreshedAt) : "";
  if (!payload || !refreshedAt || !Array.isArray(payload.conversations)) return { complete: false, items: [] };
  const seen = new Set<string>();
  let complete = true;
  const items: InboxFeedItem[] = [];
  for (const raw of payload.conversations) {
    const source = record(raw);
    const id = source ? exactText(source.conversationId) : "";
    if (!source || !id || seen.has(id)) {
      complete = false;
      continue;
    }
    seen.add(id);
    const decoded = relationshipConversationListToInbox({ conversations: [source], refreshedAt }, actorId);
    const view = decoded?.conversations[0];
    if (!view) {
      complete = false;
      continue;
    }
    const readTarget = relationshipReadTarget(source, actorId);
    items.push({
      category: "contact",
      id: `conversation:${id}`,
      occurredAt: trustedTimestamp(source.updatedAt),
      read: view.unreadCount === 0,
      ...(readTarget ? {
        readAction: {
          body: { lastReadMessageId: readTarget.lastReadMessageId },
          endpoint: encodedPath("/api/relationship-communication/conversations", id) + "/read",
          expected: { conversationId: id, lastReadMessageId: readTarget.lastReadMessageId },
        },
      } : {}),
      subtitle: view.preview,
      targetHref: encodedPath("/inbox", id),
      title: view.subject,
    });
  }
  return { complete, items };
}

function signalItems(value: unknown, language: OrbitLanguage): { complete: boolean; items: InboxFeedItem[] } {
  const payload = record(value);
  if (!payload || !Array.isArray(payload.signals)) return { complete: false, items: [] };
  const seen = new Set<string>();
  let complete = true;
  const items: InboxFeedItem[] = [];
  for (const raw of payload.signals) {
    const source = record(raw);
    const id = source ? exactText(source.id) : "";
    const occurredAt = source ? trustedTimestamp(source.occurredAt) : "";
    if (!source || !id || seen.has(id) || !exactText(source.displayName)) {
      complete = false;
      continue;
    }
    seen.add(id);
    const view = relationshipSignalsToView({ signals: [source] }, language).signals[0];
    if (!view) {
      complete = false;
      continue;
    }
    const confirmation = record(source.confirmation);
    items.push({
      category: "contact",
      id: `signal:${id}`,
      occurredAt,
      read: confirmation?.state === "confirmed",
      subtitle: [view.sourceLabel, view.metaLine].filter(Boolean).join(" · "),
      title: view.title,
    });
  }
  return { complete, items };
}

export function inboxFeedFromSources(input: {
  actorId: string;
  conversationsData: unknown;
  language: OrbitLanguage;
  notificationsData: unknown;
  now: string;
  signalsData: unknown;
}): InboxFeedView {
  const now = trustedTimestamp(input.now);
  const actorId = exactText(input.actorId);
  const conversations = actorId ? conversationItems(input.conversationsData, actorId) : { complete: false, items: [] };
  const notifications = notificationItems(input.notificationsData);
  const signals = signalItems(input.signalsData, input.language);
  const end = now ? Date.parse(now) : Number.NaN;
  const start = end - THIRTY_DAYS_MS;
  const sourceItems = [...notifications.items, ...conversations.items, ...signals.items];
  const items = sourceItems
    .filter(item => !item.occurredAt || (Number.isFinite(end) && inWindow(item.occurredAt, start, end)))
    .sort((left, right) => {
      const timeDifference = (right.occurredAt ? Date.parse(right.occurredAt) : Number.NEGATIVE_INFINITY)
        - (left.occurredAt ? Date.parse(left.occurredAt) : Number.NEGATIVE_INFINITY);
      return timeDifference || `${left.category}:${left.id}`.localeCompare(`${right.category}:${right.id}`);
    });
  return {
    coverageConfirmed: Boolean(now) && conversations.complete && notifications.complete && signals.complete
      && items.every(item => Boolean(item.occurredAt)),
    items,
    unreadCount: items.filter(item => !item.read).length,
  };
}

export function filterInboxFeed(view: InboxFeedView, filter: InboxFeedFilter): InboxFeedView {
  const items = filter === "all" ? view.items : view.items.filter(item => item.category === filter);
  return {
    coverageConfirmed: view.coverageConfirmed,
    items,
    unreadCount: items.filter(item => !item.read).length,
  };
}
