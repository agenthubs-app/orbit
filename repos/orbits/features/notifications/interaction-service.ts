import { createHash } from "node:crypto";

import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export type NotificationInteractionState = "read" | "ignored";
export const NOTIFICATION_INTERACTION_COLLECTION = "notification_interactions";

export interface NotificationInteractionService {
  list(actorId: string, notificationIds: readonly string[]): Promise<Readonly<Record<string, NotificationInteractionState>>>;
  set(input: { actorId: string; notificationId: string; state: NotificationInteractionState }): Promise<{ notificationId: string; state: NotificationInteractionState; updatedAt: string }>;
}

function required(value: string, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 256) throw new Error(`${label} is invalid.`);
  return normalized;
}

function recordId(actorId: string, notificationId: string): string {
  return `notification-interaction:${createHash("sha256").update(`${actorId}\u0000${notificationId}`).digest("hex")}`;
}

export function createNotificationInteractionService(input: {
  now?: () => string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): NotificationInteractionService {
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async list(rawActorId, rawNotificationIds) {
      const actorId = required(rawActorId, "Actor");
      if (rawNotificationIds.length > 500) throw new Error("Too many notification ids.");
      const notificationIds = [...new Set(rawNotificationIds.map((id) => required(id, "Notification")))];
      if (!notificationIds.length) return {};
      const records = await input.store.listRecords({
        collectionName: NOTIFICATION_INTERACTION_COLLECTION,
        lifecycleState: "active",
        recordIds: notificationIds.map((notificationId) => recordId(actorId, notificationId)),
        userId: actorId,
        workspaceId: input.workspaceId,
      });
      return Object.fromEntries(records.flatMap((record) => {
        const notificationId = typeof record.payload.notificationId === "string" ? record.payload.notificationId : null;
        const state = record.payload.state === "read" || record.payload.state === "ignored" ? record.payload.state : null;
        return notificationId && state ? [[notificationId, state] as const] : [];
      }));
    },
    async set(value) {
      const actorId = required(value.actorId, "Actor");
      const notificationId = required(value.notificationId, "Notification");
      if (value.state !== "read" && value.state !== "ignored") throw new Error("Notification state is invalid.");
      const updatedAt = now();
      const id = recordId(actorId, notificationId);
      const existing = await input.store.getRecord({ collectionName: NOTIFICATION_INTERACTION_COLLECTION, recordId: id, workspaceId: input.workspaceId });
      await input.store.upsertRecord({
        collectionName: NOTIFICATION_INTERACTION_COLLECTION,
        createdAt: existing?.createdAt ?? updatedAt,
        evidenceIds: [],
        lifecycleState: "active",
        payload: { actorId, notificationId, state: value.state, updatedAt },
        recordId: id,
        searchText: null,
        sourceId: `notification:${notificationId}`,
        sourceLabel: "Actor-scoped notification interaction",
        sourceType: "manual",
        targetId: notificationId,
        targetType: "notification",
        updatedAt,
        userId: actorId,
        workspaceId: input.workspaceId,
      });
      return { notificationId, state: value.state, updatedAt };
    },
  };
}

export function createConfiguredNotificationInteractionService(): NotificationInteractionService | null {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  return configured ? createNotificationInteractionService(configured) : null;
}
