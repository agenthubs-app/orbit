import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type { NoteRecordPayload } from "./contract";
import { NOTE_COLLECTION, noteLiveRecordFromPayload, noteRecordFromLiveRecord } from "./note-record";

export interface NoteRepository {
  get(actorId: string, noteId: string, options?: { includeDeleted?: boolean }): Promise<NoteRecordPayload | null>;
  list(actorId: string): Promise<readonly NoteRecordPayload[]>;
  save(payload: NoteRecordPayload, options: {
    deletedAt?: string;
    expected: { kind: "absent" } | { kind: "version"; value: number };
  }): Promise<NoteRecordPayload | null>;
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
      return noteRecordFromLiveRecord(record, actorId, { includeDeleted: options.includeDeleted });
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
    async save(payload, options) {
      if (!input.store.compareAndSwapRecord) {
        throw new Error("Atomic note storage is not configured");
      }
      const saved = await input.store.compareAndSwapRecord({
        expected: options.expected.kind === "absent"
          ? options.expected
          : {
            kind: "match",
            lifecycleState: "active",
            payloadPath: ["note", "version"],
            payloadValue: options.expected.value,
          },
        record: noteLiveRecordFromPayload({
          workspaceId: input.workspaceId,
          payload,
          deletedAt: options.deletedAt,
        }),
      });
      if (!saved) return null;
      const decoded = noteRecordFromLiveRecord(saved, payload.note.ownerUserId, {
        includeDeleted: saved.lifecycleState === "deleted",
      });
      if (!decoded) throw new Error("Saved note record failed validation");
      return decoded;
    },
  };
}
