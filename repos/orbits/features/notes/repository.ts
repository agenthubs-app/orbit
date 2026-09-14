import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type { NoteRecordPayload } from "./contract";
import { NOTE_COLLECTION, noteLiveRecordFromPayload, noteRecordFromLiveRecord } from "./note-record";

export interface NoteRepository {
  get(actorId: string, noteId: string): Promise<NoteRecordPayload | null>;
  list(actorId: string): Promise<readonly NoteRecordPayload[]>;
  save(payload: NoteRecordPayload): Promise<NoteRecordPayload>;
}

export function createNoteRepository(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): NoteRepository {
  return {
    async get(actorId, noteId) {
      const record = await input.store.getRecord({
        workspaceId: input.workspaceId,
        collectionName: NOTE_COLLECTION,
        recordId: noteId,
      });
      return record?.userId === actorId ? noteRecordFromLiveRecord(record, actorId) : null;
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
    async save(payload) {
      const saved = await input.store.upsertRecord(noteLiveRecordFromPayload({
        workspaceId: input.workspaceId,
        payload,
      }));
      const decoded = noteRecordFromLiveRecord(saved, payload.note.ownerUserId);
      if (!decoded) throw new Error("Saved note record failed validation");
      return decoded;
    },
  };
}
