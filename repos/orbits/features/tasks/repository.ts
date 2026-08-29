import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";
import type { TaskRecordPayload } from "./contract";
import {
  TASK_COLLECTION,
  taskLiveRecordFromPayload,
  taskRecordFromLiveRecord,
} from "./task-record";

export interface StoredTaskRecord {
  payload: TaskRecordPayload;
  deletedAt?: string;
}

export interface TaskRepository {
  get: (
    actorId: string,
    taskId: string,
    options?: { includeDeleted?: boolean },
  ) => Promise<StoredTaskRecord | null>;
  list: (
    actorId: string,
    options?: { includeDeleted?: boolean },
  ) => Promise<readonly StoredTaskRecord[]>;
  save: (
    payload: TaskRecordPayload,
    options?: { deletedAt?: string },
  ) => Promise<StoredTaskRecord>;
}

function decodeStoredRecord(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): StoredTaskRecord | null {
  const payload = taskRecordFromLiveRecord(
    record.lifecycleState === "deleted"
      ? { ...record, lifecycleState: "active" }
      : record,
    actorId,
  );
  if (!payload) {
    return null;
  }
  return {
    payload,
    ...(record.deletedAt ? { deletedAt: record.deletedAt } : {}),
  };
}

export function createTaskRepository(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): TaskRepository {
  return {
    async get(actorId, taskId, options = {}) {
      const record = await input.store.getRecord({
        workspaceId: input.workspaceId,
        collectionName: TASK_COLLECTION,
        recordId: taskId,
        includeDeleted: options.includeDeleted,
      });
      if (!record || record.userId !== actorId) {
        return null;
      }
      return decodeStoredRecord(record, actorId);
    },

    async list(actorId, options = {}) {
      const records = await input.store.listRecords({
        workspaceId: input.workspaceId,
        collectionName: TASK_COLLECTION,
        userId: actorId,
        includeDeleted: options.includeDeleted,
      });

      return records
        .map((record) => decodeStoredRecord(record, actorId))
        .filter((record): record is StoredTaskRecord => record !== null);
    },

    async save(payload, options = {}) {
      const baseRecord = taskLiveRecordFromPayload({
        workspaceId: input.workspaceId,
        payload,
      });
      const record: LiveRecord<Record<string, unknown>> = options.deletedAt
        ? {
            ...baseRecord,
            deletedAt: options.deletedAt,
            lifecycleState: "deleted",
            updatedAt: options.deletedAt,
          }
        : baseRecord;
      const saved = await input.store.upsertRecord(record);
      const decoded = decodeStoredRecord(saved, payload.task.ownerUserId);
      if (!decoded) {
        throw new Error("Saved task record failed validation");
      }
      return decoded;
    },
  };
}
