import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export interface FollowupActionWriter {
  createTask: (input: {
    taskId: string;
    title: string;
    contactId?: string;
    connectionId?: string;
    dueAt?: string;
    evidenceIds: readonly string[];
    now: string;
  }) => Promise<{ recordId: string }>;
  saveDraft: (input: {
    draftId: string;
    contactId?: string;
    text: string;
    evidenceIds: readonly string[];
    now: string;
  }) => Promise<{ recordId: string }>;
  removeTask: (taskId: string, now: string) => Promise<void>;
  removeDraft: (draftId: string, now: string) => Promise<void>;
}

export function createStorageFollowupActionWriter(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): FollowupActionWriter {
  return {
    async createTask(task) {
      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: "tasks",
        recordId: task.taskId,
        sourceType: "agent_action",
        sourceId: task.taskId,
        sourceLabel: "Orbit Agent confirmed follow-up task",
        evidenceIds: task.evidenceIds,
        targetType: task.contactId ? "contact" : "connection",
        targetId: task.contactId ?? task.connectionId ?? null,
        occurredAt: task.now,
        lifecycleState: "active",
        searchText: task.title,
        payload: {
          id: task.taskId,
          title: task.title,
          status: "open",
          contactId: task.contactId,
          connectionId: task.connectionId,
          dueAt: task.dueAt,
          source: {
            type: "agent_action",
            id: task.taskId,
            label: "Orbit Agent confirmed follow-up",
          },
          evidenceIds: task.evidenceIds,
          createdAt: task.now,
          updatedAt: task.now,
        },
        createdAt: task.now,
        updatedAt: task.now,
      });
      return { recordId: task.taskId };
    },
    async saveDraft(draft) {
      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: "messageDrafts",
        recordId: draft.draftId,
        sourceType: "agent_action",
        sourceId: draft.draftId,
        sourceLabel: "Orbit Agent confirmed message draft",
        evidenceIds: draft.evidenceIds,
        targetType: "contact",
        targetId: draft.contactId ?? null,
        occurredAt: draft.now,
        lifecycleState: "active",
        searchText: draft.text,
        payload: {
          id: draft.draftId,
          contactId: draft.contactId,
          text: draft.text,
          status: "draft",
          externalSendRequested: false,
          evidenceIds: draft.evidenceIds,
          createdAt: draft.now,
          updatedAt: draft.now,
        },
        createdAt: draft.now,
        updatedAt: draft.now,
      });
      return { recordId: draft.draftId };
    },
    async removeTask(taskId, now) {
      await input.store.deleteRecord({
        workspaceId: input.workspaceId,
        collectionName: "tasks",
        recordId: taskId,
        deletedAt: now,
      });
    },
    async removeDraft(draftId, now) {
      await input.store.deleteRecord({
        workspaceId: input.workspaceId,
        collectionName: "messageDrafts",
        recordId: draftId,
        deletedAt: now,
      });
    },
  };
}
