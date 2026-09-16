import assert from "node:assert/strict";
import test from "node:test";
import { createNoteRepository } from "../../features/notes/repository";
import { noteLiveRecordFromPayload } from "../../features/notes/note-record";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const actorId = "account:one";
const workspaceId = "workspace:test";
const payload = { schemaVersion: 2 as const, operations: [], note: {
  id: "note:one", accountId: actorId, ownerUserId: actorId, title: "标题", body: "正文",
  manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1,
  createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z",
} };

test("authorized unsupported or corrupt history is a visible read failure, never an empty list", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createNoteRepository({ store, workspaceId });
  const record = noteLiveRecordFromPayload({ workspaceId, payload });
  await store.upsertRecord({ ...record, payload: { ...record.payload, schemaVersion: 3 } });
  await assert.rejects(repository.list(actorId), /history.*1.*unreadable/i);
  await assert.rejects(repository.get(actorId, "note:one"), /history.*1.*unreadable/i);
});

test("legal v1 and v2 history retain ids and tombstones stay excluded", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createNoteRepository({ store, workspaceId });
  const record = noteLiveRecordFromPayload({ workspaceId, payload });
  await store.upsertRecord(record);
  await store.upsertRecord({ ...record, recordId: "note:legacy", payload: { schemaVersion: 1, operations: [], note: { ...payload.note, id: "note:legacy", title: undefined, body: "旧正文" } } });
  await store.upsertRecord({ ...record, recordId: "note:deleted", lifecycleState: "deleted", payload: { ...record.payload, schemaVersion: 3 } });
  assert.deepEqual((await repository.list(actorId)).map(item => [item.note.id, item.note.body]).sort(), [["note:legacy", "旧正文"], ["note:one", "正文"]]);
  assert.deepEqual(await repository.list("account:other"), []);
});
