import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type { NoteRecordPayload } from "./contract";
import { NOTE_COLLECTION, NOTE_LIST_PAYLOAD_FIELDS, noteListRecordFromLiveRecord, noteLiveRecordFromPayload, noteRecordFromLiveRecord } from "./note-record";

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
      if (!record || record.userId !== actorId || record.workspaceId !== input.workspaceId || record.collectionName !== NOTE_COLLECTION || record.lifecycleState === "deleted") return null;
      const decoded = noteRecordFromLiveRecord(record, actorId);
      if (!decoded || decoded.note.id !== record.recordId) throw new Error("Note history contains 1 unreadable record");
      return decoded;
    },
    async list(actorId) {
      const records = await input.store.listRecords({
        limit: "unbounded",
        workspaceId: input.workspaceId,
        collectionName: NOTE_COLLECTION,
        userId: actorId,
        payloadFields: NOTE_LIST_PAYLOAD_FIELDS,
      });
      const authorized = records.filter(record => record.userId === actorId && record.workspaceId === input.workspaceId && record.collectionName === NOTE_COLLECTION && record.lifecycleState !== "deleted");
      const decoded = authorized.map(record => {
        const payload = noteListRecordFromLiveRecord(record, actorId);
        return payload?.note.id === record.recordId ? payload : null;
      });
      const unreadable = decoded.filter(record => record === null).length;
      if (unreadable) throw new Error(`Note history contains ${unreadable} unreadable records`);
      return decoded as NoteRecordPayload[];
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
