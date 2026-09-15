import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type { NoteRecordPayload } from "./contract";
import { NOTE_COLLECTION, noteLiveRecordFromPayload, noteRecordFromLiveRecord } from "./note-record";

export interface NoteRepository {
  get(actorId: string, noteId: string, options?: { includeDeleted?: boolean }): Promise<NoteRecordPayload | null>;
  list(actorId: string): Promise<readonly NoteRecordPayload[]>;
  save(payload: NoteRecordPayload, options?: { deletedAt?: string }): Promise<NoteRecordPayload>;
}

export function createNoteRepository(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): NoteRepository {
  return {
    async get(actorId, noteId, options = {}) {
      const record = await input.store.getRecord({
        workspaceId: input.workspaceId,
        collectionName: NOTE_COLLECTION,
        recordId: noteId,
        includeDeleted: options.includeDeleted,
      });
      if (!record || record.userId !== actorId) return null;
      return noteRecordFromLiveRecord(
        record.lifecycleState === "deleted" ? { ...record, lifecycleState: "active" } : record,
        actorId,
      );
    },
    async list(actorId) {
      const records = await input.store.listRecords({
        workspaceId: input.workspaceId,
        collectionName: NOTE_COLLECTION,
        userId: actorId,
      });
      return records
        .map((record) => noteRecordFromLiveRecord(record, actorId))
        .filter((record): record is NoteRecordPayload => record !== null);
    },
    async save(payload, options = {}) {
      const saved = await input.store.upsertRecord(noteLiveRecordFromPayload({
        workspaceId: input.workspaceId,
        payload,
        deletedAt: options.deletedAt,
      }));
      const decoded = noteRecordFromLiveRecord(
        saved.lifecycleState === "deleted" ? { ...saved, lifecycleState: "active" } : saved,
        payload.note.ownerUserId,
      );
      if (!decoded) throw new Error("Saved note record failed validation");
      return decoded;
    },
  };
}
