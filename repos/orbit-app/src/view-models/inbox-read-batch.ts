import type { ApiResult } from "../api/types";
import type { InboxFeedItem, InboxFeedReadAction } from "./inbox-feed";

export interface InboxReadBatchResult {
  confirmedIds: readonly string[];
  failedIds: readonly string[];
  stale: boolean;
}

interface ActionGroup {
  action: InboxFeedReadAction;
  ids: string[];
}

function actionKey(action: InboxFeedReadAction): string {
  return `${action.endpoint}\n${JSON.stringify(action.body)}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function timestamp(value: unknown): boolean {
  return typeof value === "string" && value.trim() === value
    && Number.isFinite(Date.parse(value));
}

function receiptMatches(result: ApiResult<unknown>, action: InboxFeedReadAction): boolean {
  if (!result.success || result.status < 200 || result.status >= 300) return false;
  const receipt = record(result.data);
  if (!receipt || Object.entries(action.expected).some(([key, value]) => receipt[key] !== value)) return false;
  if (Object.prototype.hasOwnProperty.call(action.expected, "notificationId")) return timestamp(receipt.updatedAt);
  if (Object.prototype.hasOwnProperty.call(action.expected, "conversationId")) return timestamp(receipt.readAt);
  return false;
}

export async function runInboxReadBatch(input: {
  execute: (action: InboxFeedReadAction) => Promise<ApiResult<unknown>>;
  isCurrent: () => boolean;
  items: readonly InboxFeedItem[];
}): Promise<InboxReadBatchResult> {
  if (!input.isCurrent()) return { confirmedIds: [], failedIds: [], stale: true };
  const groups: ActionGroup[] = [];
  const groupByKey = new Map<string, ActionGroup>();
  for (const item of input.items) {
    if (item.read || !item.readAction) continue;
    const key = actionKey(item.readAction);
    const existing = groupByKey.get(key);
    if (existing) {
      existing.ids.push(item.id);
    } else {
      const group = { action: item.readAction, ids: [item.id] };
      groupByKey.set(key, group);
      groups.push(group);
    }
  }
  const outcomes: boolean[] = Array.from({ length: groups.length }, () => false);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (input.isCurrent()) {
      const index = nextIndex;
      nextIndex += 1;
      const group = groups[index];
      if (!group) return;
      try {
        outcomes[index] = receiptMatches(await input.execute(group.action), group.action);
      } catch {
        outcomes[index] = false;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, groups.length) }, () => worker()));
  if (!input.isCurrent()) return { confirmedIds: [], failedIds: [], stale: true };
  const confirmedIds: string[] = [];
  const failedIds: string[] = [];
  groups.forEach((group, index) => (outcomes[index] ? confirmedIds : failedIds).push(...group.ids));
  return { confirmedIds, failedIds, stale: false };
}
