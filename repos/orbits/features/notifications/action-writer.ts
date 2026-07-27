import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export interface ReminderActionWriter {
  createReminder: (input: {
    reminderId: string;
    title: string;
    dueAt: string;
    taskId?: string;
    contactId?: string;
    evidenceIds: readonly string[];
    now: string;
  }) => Promise<{ recordId: string }>;
  removeReminder: (reminderId: string, now: string) => Promise<void>;
}

export function createStorageReminderActionWriter(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  userId?: string | null;
  workspaceId: string;
}): ReminderActionWriter {
  return {
    async createReminder(reminder) {
      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: "notifications",
        recordId: reminder.reminderId,
        userId: input.userId,
        sourceType: "agent_action",
        sourceId: reminder.reminderId,
        sourceLabel: "Orbit Agent confirmed reminder",
        evidenceIds: reminder.evidenceIds,
        targetType: reminder.contactId ? "contact" : "task",
        targetId: reminder.contactId ?? reminder.taskId ?? null,
        occurredAt: reminder.now,
        lifecycleState: "active",
        searchText: reminder.title,
        payload: {
          id: reminder.reminderId,
          channel: "in_app",
          title: reminder.title,
          body: reminder.title,
          status: "pending",
          scheduledFor: reminder.dueAt,
          source: {
            type: "agent_action",
            id: reminder.reminderId,
            label: "Orbit Agent confirmed reminder",
          },
          evidenceIds: reminder.evidenceIds,
          createdAt: reminder.now,
        },
        createdAt: reminder.now,
        updatedAt: reminder.now,
      });
      return { recordId: reminder.reminderId };
    },
    async removeReminder(reminderId, now) {
      await input.store.deleteRecord({
        workspaceId: input.workspaceId,
        collectionName: "notifications",
        recordId: reminderId,
        deletedAt: now,
      });
    },
  };
}
